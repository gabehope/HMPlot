// A join of two tables by key (TODO 43): the Join transform's plan and GeoJSON's
// featureKey/dataKey (43.5). Graph structural plans reuse the same typed key reader. Integers past
// 2^24, text and composite keys match exactly, and the row mapping is a host Map over the
// joined table's keys (O(n + m)); only the gather of the joined columns runs on the GPU.
import { Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "./categorical.js";
import { existingHostValues } from "./hostSources.js";
import { isGridDescriptor, descriptorValue } from "./gridModel.js";

const KINDS = { number: "numbers", bigint: "numbers", string: "text", boolean: "booleans" };
const kindOf = (value) => (typeof value === "bigint" ? "number" : typeof value);
const missing = (value) => value === null || value === undefined || typeof value === "number" && !Number.isFinite(value);
/** An integer BigInt JavaScript numbers hold exactly is that number, so 7n matches 7. */
const normal = (value) => typeof value === "bigint" && value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER ? Number(value) : value;

/**
 * A column's key values on the host, one per row: numbers (datetimes as epoch milliseconds),
 * text or booleans, null where missing. From the table's host values when it has them
 * (`scope.hostColumn`: indexed by the table's rows, `source: true`), else read back once from
 * the column at the scope's rows (`source: false`).
 */
export async function keyValues(scope, field, { atRows = false } = {}) {
  // `atRows`: the scope's own rows; select exact host keys through row provenance when
  // available, otherwise read the column as exposed by that view.
  const host = scope.hostColumn?.(field), meta = scope.metadata?.(field);
  // A datetime counts from its own first time (columns.js); two tables' keys compare as epoch ms.
  const origin = meta?.type === "datetime" ? meta.origin ?? 0 : 0;
  if (host !== undefined) {
    let values = hostValues(host, scope.identity?.length ?? scope.length);
    if (origin) for (let i = 0; i < values.length; i++) if (values[i] !== null) values[i] += origin;
    if (atRows && !scope.identityRows) {
      // Numeric GPU storage may narrow integer keys. Select exact source values using the
      // ordinary view's row mapping rather than reading those rounded keys back.
      const rows = scope.sourceIndices?.();
      if (!rows) return keyValues({ get: key => scope.get(key), metadata: () => meta }, field);
      try {
        const selected = existingHostValues(rows) ?? (rows instanceof JaxArray ? await rows.ref.data() : rows);
        values = Array.from(selected, row => values[row] ?? null);
      } finally { rows.dispose?.(); }
    }
    return { values, source: true, host };
  }
  const column = scope.get(field);
  const read = async (array) => existingHostValues(array) ?? (array instanceof JaxArray ? await array.ref.data() : array);
  if (column?.categories) {
    const codes = await read(column.codes);
    return { values: Array.from(codes, (code) => (code >= 0 && code < column.categories.length ? normal(column.categories[code]) : null)), source: false };
  }
  const values = await read(column);
  return { values: Array.from(values, (value) => {
    value = normal(value);
    return missing(value) ? null : typeof value === "number" ? value + origin : value;
  }), source: false };
}
/**
 * keyValues' host path, synchronously: a table scope's key values (numbers, datetimes as epoch
 * milliseconds, text or booleans; null where missing) and the column's type, or null when the
 * column is not on the host (a device column needs keyValues' readback).
 */
export function hostKeyValues(scope, field) {
  if (!scope.has?.(field)) return null;
  const host = scope.hostColumn?.(field), meta = scope.metadata?.(field);
  if (host === undefined) return null;
  const values = hostValues(host, scope.identity?.length ?? scope.length);
  const origin = meta?.type === "datetime" ? meta.origin ?? 0 : 0;
  if (origin) for (let i = 0; i < values.length; i++) if (values[i] !== null) values[i] += origin;
  return { values, type: meta?.type };
}
function hostValues(host, rows) {
  // A grid coordinate (TODO 51): its value at each of the table's rows.
  if (isGridDescriptor(host)) return Array.from({ length: rows }, (_, row) => descriptorValue(host, row));
  if (host.categories) return Array.from(host.codes, (code) => (code >= 0 && code < host.categories.length ? normal(host.categories[code]) : null));
  return Array.from(host, (value) => (missing(value) ? null : normal(value)));
}

/**
 * One key per row: the value itself, or a composite key's parts as one string, each part its kind,
 * its text's length and its text ("string:3:a:b"), so no two tuples of parts make the same string
 * whatever their text holds (TODO 69.2: a delimiter alone let "a\0..." parts run together).
 */
function keyAt(parts, row) {
  if (parts.length === 1) {
    const value = parts[0][row];
    return missing(value) ? undefined : normal(value);
  }
  let key = "";
  for (const part of parts) {
    const value = part[row];
    if (missing(value)) return undefined;
    const text = String(normal(value));
    key += `${kindOf(normal(value))}:${text.length}:${text}`;
  }
  return key;
}
const describe = (parts, row) => parts.map((part) => JSON.stringify(typeof part[row] === "bigint" ? String(part[row]) : part[row])).join(", ");

/** The kinds of a key column's values (numbers, text, booleans), for the mixed-kinds error. */
function kinds(values) {
  const found = new Set();
  for (const value of values) if (!missing(value)) found.add(KINDS[kindOf(value)] ?? "values");
  return found;
}

/**
 * For each row of the left keys, its row in the right table, or -1 (no match, or a missing
 * key). `left` and `right` are arrays of key parts (one array of values per key column);
 * `names` ({ left, right }) name the columns in errors. A key the right table has twice is an
 * error, found while its Map is built; missing keys match nothing. Keys of different kinds (text
 * against numbers) are an error, or `mismatch` (a message) or, with `mismatch: false`, simply
 * match nothing; `duplicate(value)` words a repeated key's error (GeoJSON keeps its own).
 */
export function joinRows(left, right, { names = { left: [], right: [] }, owner = "Join", mismatch = undefined, duplicate = undefined } = {}) {
  if (left.length !== right.length) throw Error(`${owner}: ${left.length} key columns on the table, ${right.length} on the joined table.`);
  if (mismatch !== false) left.forEach((part, k) => {
    const a = kinds(part), b = kinds(right[k]);
    if (a.size && b.size && ![...a].some((kind) => b.has(kind)))
      throw Error(mismatch ?? `${owner}: ${names.left[k] ?? "the key"} holds ${[...a].join(" and ")} and the joined table's ${names.right[k] ?? "key"} holds ${[...b].join(" and ")}; keys match only values of the same kind.`);
  });
  const m = right[0]?.length ?? 0, n = left[0]?.length ?? 0, index = new Map();
  for (let j = 0; j < m; j++) {
    const key = keyAt(right, j);
    if (key === undefined) continue;
    if (index.has(key))
      throw Error(duplicate ? duplicate(right.length === 1 ? right[0][j] : describe(right, j))
        : `${owner}: the joined table has the key ${describe(right, j)} more than once; each row takes one row's columns (many-to-one).`);
    index.set(key, j);
  }
  const rows = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const key = keyAt(left, i);
    rows[i] = key === undefined ? -1 : index.get(key) ?? -1;
  }
  return rows;
}

/**
 * The joined table of a Join, in its config (TODO 43.3): a Data scope built from `data=`
 * (dictionary coding, host columns) when the transform first reads it. A config's JSON (a
 * Facet's cache keys, pipelines) holds the table's identity and version, not its columns, and
 * input reads skip it (not a plain object).
 */
export class JoinTable {
  /** `live`: `value` is a transform's published output (TODO 140), read as it is. */
  constructor(owner, value, version, live = false) {
    this.owner = owner;
    this.value = value;
    this.version = version;
    this.live = live;
  }
  /** The table as a Data scope (it throws what Data would for a bad table); a live one's output. */
  scope() {
    return this.live ? this.value : this.owner.scopeFor(this.value);
  }
  toJSON() {
    return { joinTable: this.owner.id, version: this.version };
  }
}

/** A Join component's joined table across its data= values; dispose() releases its scope. */
export function createJoinTable() {
  const scope = createDataScope();
  let value, version = 0, current = null;
  const owner = {
    id: crypto.randomUUID(),
    scopeFor(next) {
      scope.update(next);
      return scope;
    },
  };
  return {
    /** The reference for `next`: the same one while the value is the same object. */
    table(next) {
      if (current && next === value) return current;
      value = next;
      return (current = new JoinTable(owner, next, ++version));
    },
    /** The reference for a transform's published output (TODO 140): one per output. */
    live(output) {
      if (current?.live && output === value) return current;
      value = output;
      return (current = new JoinTable(owner, output, ++version, true));
    },
    dispose() { scope.dispose(); },
  };
}
