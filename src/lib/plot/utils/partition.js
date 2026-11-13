/**
 * Partition repeats one set of children per distinct key combination inside a single frame:
 * no layout, no bands, no extra renderers (that is Facet). The planner computes one composite
 * group code per row on the host (every key encoding ends up as a small code column), then
 * builds only changed groups from those row lists. Reused groups keep their existing views.
 * Key discovery does not change the keys' scales.
 */
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { createDataView, dataBufferLimit, snapshotDataScope } from "./dataView.js";
import { isCategory } from "./categorical.js";
import { LIMITS, limitError } from "./limits.js";
import { isGridDescriptor, descriptorCodes } from "./gridModel.js";

/** Groups mount children, buffers, and pipelines; more than this is almost always a mistake. */
export const DEFAULT_PARTITION_LIMIT = /** @type {number} */ (
  LIMITS.partitionGroups.value
);
/** The label of the group that collects rows whose key is missing. */
export const MISSING_GROUP_LABEL = "(missing)";

export function partitionFields(by) {
  const fields = Array.isArray(by) ? by : [by];
  if (!fields.length || fields.some((field) => typeof field !== "string" || !field))
    throw Error("Partition by needs a column name or a list of column names.");
  const duplicate = fields.find((field, index) => fields.indexOf(field) !== index);
  if (duplicate) throw Error(`Partition by lists ${duplicate} twice.`);
  return fields;
}

/** The label a group shows in legends and the settings tree; a missing key reads "(missing)". */
export function groupLabel(values) {
  return Object.values(values)
    .map((value) => (value === null || value === undefined ? MISSING_GROUP_LABEL : String(value)))
    .join(" · ");
}

const checkAbort = (signal) => {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
};

/**
 * One key column as group codes: `order` lists the values that have rows (a plain array in
 * first-appearance order, a dictionary column in dictionary order, a numeric column ascending)
 * and `codes[i]` indexes it; rows whose key is missing (null, undefined, NaN, an out-of-range
 * dictionary code) take the code `order.length` when `missing` is set.
 */
export async function keyCodes(scope, field, { signal = undefined, rows = undefined } = {}) {
  if (!scope.has(field)) throw Error(`Partition by ${field} is not a column in this data.`);
  // A grid table's coordinate codes by index (TODO 51 decision 7): no column is made or read.
  const described = rows || scope.identityRows ? scope.hostColumn?.(field) : undefined;
  if (isGridDescriptor(described)) return descriptorCodes(described, rows, scope.length);
  // Over a view of the Data table, the key's host values at the view's source rows (`rows`):
  // no readback per key (TODO 29.12).
  const host = rows ? scope.hostColumn?.(field) : undefined;
  const source = host ? hostRows(host, rows) : scope.get(field);
  if (source === undefined) throw Error(`Partition by ${field} is not a column in this data.`);
  const n = scope.length, codes = new Int32Array(n);
  let order, missing = false;
  if (source?.categories) {
    // Dictionary: the categories that have rows, in dictionary order.
    const raw = source.codes instanceof JaxArray ? Array.from(await source.codes.ref.data()) : source.codes;
    checkAbort(signal);
    const categories = source.categories, present = new Set();
    for (const code of raw)
      if (Number.isInteger(code) && code >= 0 && code < categories.length) present.add(code);
      else missing = true;
    const remap = new Map();
    order = [];
    categories.forEach((value, code) => { if (present.has(code)) { remap.set(code, order.length); order.push(value); } });
    for (let i = 0; i < n; i++) codes[i] = remap.get(raw[i]) ?? order.length;
  } else if (source instanceof JaxArray || ArrayBuffer.isView(source)) {
    // Numeric: the distinct finite values, ascending (a Python column arrives this way). A
    // BigInt64 column keys by its exact integers.
    const raw = source instanceof JaxArray ? await source.ref.data() : source;
    checkAbort(signal);
    const distinct = new Set();
    for (const value of raw) if (typeof value === "bigint" || Number.isFinite(value)) distinct.add(value); else missing = true;
    order = [...distinct].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const remap = new Map(order.map((value, index) => [value, index]));
    for (let i = 0; i < n; i++) codes[i] = remap.get(raw[i]) ?? order.length;
  } else if (Array.isArray(source)) {
    // Plain array: first appearance.
    const remap = new Map();
    order = [];
    for (let i = 0; i < n; i++) {
      const value = source[i];
      // A nullable int64 column (Parquet, Arrow) is a plain array of BigInts and missing values.
      if (!isCategory(value) && typeof value !== "bigint") { missing = true; codes[i] = -1; continue; }
      if (!remap.has(value)) { remap.set(value, order.length); order.push(value); }
      codes[i] = remap.get(value);
    }
    if (missing) for (let i = 0; i < n; i++) if (codes[i] < 0) codes[i] = order.length;
  } else throw Error(`Partition by ${field} needs a column of values.`);
  return { order, missing, codes };
}

/**
 * A host column (scope.hostColumn: dictionary codes, or numeric values) at `rows` (-1: missing),
 * in the form the view's own column has: codes, or float32 values.
 */
function hostRows(column, rows) {
  if (column.categories) return { codes: Int32Array.from(rows, (row) => (row < 0 ? -1 : column.codes[row])), categories: column.categories };
  return Float32Array.from(rows, (row) => (row < 0 ? NaN : Number(column[row] ?? NaN)));
}

/** Rows `rows` of `a` and `b` hold the same values (a flag per row index that differs, set in `differs`). */
async function markDifferences(a, b, n, differs) {
  if (a === b) return;
  const host = (value) => Array.isArray(value) || ArrayBuffer.isView(value);
  if (a?.categories || b?.categories) {
    if (!a?.categories || !b?.categories || JSON.stringify(a.categories) !== JSON.stringify(b.categories)) return differs.fill(1);
    return markDifferences(a.codes, b.codes, n, differs);
  }
  if (host(a) && host(b)) {
    for (let i = 0; i < n; i++) if (!Object.is(a[i], b[i])) differs[i] = 1;
    return;
  }
  if (a instanceof JaxArray && b instanceof JaxArray && a.shape.length === b.shape.length &&
      a.shape.slice(1).every((size, axis) => size === b.shape[axis + 1])) {
    // One comparison and one readback for the column; NaN equals NaN.
    const x = a.ref.slice([0, n]), y = b.ref.slice([0, n]);
    let unequal = np.logicalNot(np.logicalOr(x.ref.equal(y.ref), np.logicalAnd(np.isnan(x.astype(np.float32)), np.isnan(y.astype(np.float32)))));
    while (unequal.shape.length > 1) unequal = np.max(unequal.astype(np.int32), unequal.shape.length - 1);
    const flags = await unequal.astype(np.int32).data();
    for (let i = 0; i < n; i++) if (flags[i]) differs[i] = 1;
    return;
  }
  differs.fill(1);
}

/**
 * TODO 17.9: the keys of `previous`'s groups that can stand for the same groups now: the same
 * rows, and every column the last update changed equal at those rows (old values come from the
 * snapshot the previous plan retains). Positional: an inserted row shifts later groups' rows.
 */
async function reusableKeys(previous, scope, fields, rowsByKey, signal) {
  if (!previous || JSON.stringify(previous.fields) !== JSON.stringify(fields)) return new Set();
  if (previous.scope !== scope) return sameSourceKeys(previous, scope, rowsByKey, signal);
  if (!previous.snapshot) return new Set();
  const sameRows = (a, b) => a && b && a.length === b.length && a.every((row, i) => row === b[i]);
  const candidates = previous.groups.filter((group) => sameRows(group.rows, rowsByKey.get(group.key)));
  if (!candidates.length) return new Set();
  const change = scope.lastChange, old = previous.snapshot;
  // The snapshot's own columns (its has() and get() fall through to the live scope).
  const oldFields = new Set(old.keys()), newFields = new Set(scope.keys());
  const compared = change?.columns && change.from === previous.version && change.to === scope.version
    ? [...change.columns] : [...new Set([...oldFields, ...newFields])];
  const n = Math.min(old.length, scope.length), differs = new Uint8Array(scope.length);
  differs.fill(1, n);
  for (const field of compared) {
    checkAbort(signal);
    // An added or removed column may be read by the groups' children: nothing is reused.
    if (!oldFields.has(field) || !newFields.has(field)) return new Set();
    await markDifferences(old.get(field), scope.get(field), n, differs);
  }
  return new Set(candidates.filter((group) => group.rows.every((row) => !differs[row])).map((group) => group.key));
}

/**
 * Every column's identity (dataView columnIdentity: the source column it forwards, or a derived
 * name that changes with the view), or null when one is unknown.
 */
function columnTokens(scope) {
  const tokens = new Map();
  for (const field of scope.keys?.() ?? []) {
    const token = scope.columnIdentity?.(field);
    if (token === undefined || token === null) return null;
    tokens.set(field, token);
  }
  return tokens;
}
/** Each row's source row (host Int32Array; one readback), kept per scope. */
const sourceRowCache = new WeakMap();
async function sourceRowsOf(scope, signal) {
  if (sourceRowCache.has(scope)) return sourceRowCache.get(scope);
  let rows = null;
  if (scope.identityRows) rows = Int32Array.from({ length: scope.length }, (_, i) => i);
  else {
    try {
      const indices = scope.sourceIndices?.();
      rows = indices ? Int32Array.from(await indices.data()) : null;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      rows = null; // a disposed view: nothing to compare with
    }
    checkAbort(signal);
  }
  sourceRowCache.set(scope, rows);
  return rows;
}

/**
 * TODO 29.12: the keys of `previous`'s groups that stand for the same groups in another scope
 * object over the same data (a new Filter view each brush move): the same data identity and
 * generation, every column the same source column, and the group's rows the same source rows.
 * Such a group holds the same values, so nothing under it reruns.
 */
async function sameSourceKeys(previous, scope, rowsByKey, signal) {
  const identity = scope.identity;
  if (!identity || previous.identity !== identity || previous.generation !== identity.generation) return new Set();
  const before = previous.tokens, now = columnTokens(scope);
  if (!before || !now || before.size !== now.size || [...now].some(([field, token]) => before.get(field) !== token)) return new Set();
  const oldRows = await sourceRowsOf(previous.scope, signal), newRows = await sourceRowsOf(scope, signal);
  if (!oldRows || !newRows) return new Set();
  const same = (a, b) => a.length === b.length && a.every((row, i) => oldRows[row] === newRows[b[i]]);
  return new Set(previous.groups.filter((group) => rowsByKey.has(group.key) && same(group.rows, rowsByKey.get(group.key)))
    .map((group) => group.key));
}

/** The values one key contributes to the group product: its present values, then null for missing rows. */
const slots = ({ order, missing }) => (missing ? [...order, null] : order);

/**
 * Plan one group per distinct combination of `by` values. With one key the groups are the
 * values that have rows; several keys keep the full product of those values, so a combination
 * with no rows still mounts (its children handle empty input). Rows whose key is missing form a
 * trailing "(missing)" group with a null value for that key. The limit is checked before any
 * group is built.
 */
export async function planPartitions(scope, by, { signal = undefined, limit = DEFAULT_PARTITION_LIMIT, previous = undefined } = {}) {
  const fields = partitionFields(by);
  if (!Number.isInteger(limit) || limit < 1) throw Error("Partition limit must be a positive integer.");
  // A view of the Data table whose keys the table holds on the host reads its source rows once
  // (cached for the reuse check below) instead of each key.
  const rows = !scope.identityRows && fields.every((field) => scope.hostColumn?.(field))
    ? await sourceRowsOf(scope, signal) : undefined;
  const keys = [];
  for (const field of fields) keys.push(await keyCodes(scope, field, { signal, rows: rows ?? undefined }));
  const sizes = keys.map((key) => slots(key).length);
  const count = sizes.reduce((product, size) => product * size, 1);
  if (count > limit)
    throw limitError("partitionGroups", { what: `partitioning by ${fields.join(", ")}`, count, limit, property: "limit" });
  // Composite code, first key major, so the cells come back in nested key order.
  const n = scope.length, composite = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let code = 0;
    for (let k = 0; k < keys.length; k++) code = code * sizes[k] + keys[k].codes[i];
    composite[i] = code;
  }
  // Each group's rows, ascending (the order the partitioner gathers them in).
  const sizesByGroup = new Int32Array(count);
  for (let i = 0; i < n; i++) sizesByGroup[composite[i]]++;
  const rowsByGroup = Array.from({ length: count }, (_, g) => new Int32Array(sizesByGroup[g])), filled = new Int32Array(count);
  for (let i = 0; i < n; i++) rowsByGroup[composite[i]][filled[composite[i]]++] = i;
  if (Math.max(count * 8, n * 16) > dataBufferLimit())
    throw limitError("storage", { component: "Partition", what: "its group index", count: Math.max(count * 8, n * 16), limit: dataBufferLimit() });
  const described = rowsByGroup.map((rows, index) => {
    const indices = [];
    for (let k = keys.length - 1, rest = index; k >= 0; k--) {
      indices[k] = rest % sizes[k];
      rest = Math.floor(rest / sizes[k]);
    }
    const values = Object.fromEntries(fields.map((field, k) => [field, slots(keys[k])[indices[k]]]));
    return { values, key: JSON.stringify(fields.map((field) => values[field])), rows };
  });
  // Retain one input snapshot for comparisons and for the new group views. Reused
  // groups hold their own earlier snapshot, whose values at these rows are equal.
  const snapshot = snapshotDataScope(scope), releases = [], created = [];
  let reused, groups;
  try {
    reused = await reusableKeys(previous, scope, fields,
      new Map(described.map((item) => [item.key, item.rows])), signal);
    checkAbort(signal);
    // Construct all new views before changing the prior groups' bookkeeping.
    groups = described.map(({ values, key, rows }) => {
      checkAbort(signal);
      if (reused.has(key)) return previous.groups.find((item) => item.key === key);
      const indices = np.array(rows, { dtype: np.int32 });
      let view;
      try {
        view = createDataView(snapshot, { indices });
      } catch (error) {
        indices.dispose();
        throw error;
      }
      view.pipeline = [];
      view.onDispose = () => indices.dispose();
      created.push(view);
      // The key is one value for every row of the group; aggregates carry it forward.
      view.constants = { ...view.constants };
      for (const [field, value] of Object.entries(values))
        if (value !== null && value !== undefined) view.constants[field] = value;
      return { key, values, view, label: groupLabel(values), rows };
    });
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      if (!reused.has(group.key)) continue;
      releases.push(group.view.retain());
      // Another scope object may number the same source rows differently.
      group.rows = described[index].rows;
      group.view.revalidated = scope.identity?.generation;
    }
  } catch (error) {
    created.forEach((view) => view.dispose());
    releases.forEach((release) => release());
    snapshot.dispose();
    throw error;
  }
  return {
    groups, fields, scope, version: scope.version, snapshot,
    // What the next plan compares when its scope is another object (sameSourceKeys).
    identity: scope.identity, generation: scope.identity?.generation, tokens: columnTokens(scope),
    /** The keys of the groups this plan took over from the previous one. */
    reused,
    dispose() {
      created.forEach((view) => view.dispose());
      releases.forEach((release) => release());
      snapshot.dispose();
    },
  };
}
