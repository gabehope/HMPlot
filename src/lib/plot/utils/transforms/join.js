import { numpy as np } from "@hmplot/jax";
import { asArray } from "../data.js";
import { JoinTable, keyValues, joinRows } from "../tableJoin.js";
import { cachedArray, cachedHostValue, list } from "./common.js";
import { planProgram } from "../programs.js";
import { isGridDescriptor } from "../gridModel.js";

const HOW = new Set(["left", "inner"]);
/** The key columns on each side: `on` for both, or `leftOn` and `rightOn`. */
function keyFields(config) {
  const left = list(config.leftOn ?? config.on), right = list(config.rightOn ?? config.on);
  return { left, right };
}
/** The joined columns (before `as`): `fields`, or every column of the joined table but its keys. */
function joinedFields(config, table) {
  const { right } = keyFields(config);
  return config.fields === undefined ? table.keys().filter((name) => !right.includes(name)) : list(config.fields);
}
const outputName = (config, field) => (typeof config.as === "object" && config.as?.[field]) || field;

/**
 * Join (TODO 43): columns from a second table (config.data, a JoinTable) matched by key, many to
 * one, over the same rows. "left" keeps every row (an unmatched row's joined values are
 * missing); "inner" hides the unmatched rows as a Filter does. The row mapping is built on the
 * host once per key column and table version (utils/tableJoin.js); each run gathers the joined
 * columns through it on the GPU.
 */
export const join = {
  reads: "rows",
  output: "sameRows",
  // A joined column is not a column of the table the rows come from (TODO 38: a drag says so).
  lineage(config) {
    let fields = [];
    try { fields = joinedFields(config, config.data.scope()); } catch { /* the run reports a bad table */ }
    return Object.fromEntries(fields.map((field) => [field, { kind: "joined" }]));
  },
  validate(config) {
    if (!(config.data instanceof JoinTable)) throw Error("Join requires data=, the table to join.");
    if (config.how !== undefined && !HOW.has(config.how)) throw Error(`Join how must be "left" or "inner", not ${JSON.stringify(config.how)}.`);
    const { left, right } = keyFields(config);
    if (!left.length || !right.length) throw Error("Join requires on=, or leftOn= and rightOn=: the key columns.");
    if (config.on !== undefined && (config.leftOn !== undefined || config.rightOn !== undefined))
      throw Error("Join takes on= or leftOn= and rightOn=, not both.");
    if (left.length !== right.length) throw Error(`Join leftOn names ${left.length} columns and rightOn ${right.length}; they pair up.`);
    for (const name of [...left, ...right, ...list(config.fields ?? [])])
      if (typeof name !== "string" || !name) throw Error("Join key and field names must be non-empty strings.");
  },
  names(config, source, columns) {
    const table = config.data.scope();
    return Object.fromEntries(Object.keys(columns).map((field) => [field, table.columnName?.(field) ?? field]));
  },
  async run(input, config, { cache, own }) {
    // A live joined table is another transform's output: held for this run, so a newer
    // publication retiring it cannot dispose it under the gather (TODO 140).
    // An output already retired is a superseded request: the Join's newer one is queued.
    let release = null;
    if (config.data.live)
      try { release = config.data.value.retain?.(); }
      catch { throw new DOMException("The joined output was replaced.", "AbortError"); }
    try { return await joinRun(input, config, cache, own); }
    finally { release?.(); }
  },
};

/** The Join's run over `input` (join.run, with its joined table held). */
async function joinRun(input, config, cache, own) {
  const table = config.data.scope(), { left, right } = keyFields(config);
  for (const field of left) if (!input.source.has(field)) throw Error(`the table has no column ${field} to join on.`);
  for (const field of right) if (!table.has(field)) throw Error(`the joined table has no column ${field} to join on.`);
  const fields = joinedFields(config, table);
  for (const field of fields) {
    if (!table.has(field)) throw Error(`the joined table has no column ${field}.`);
    const name = outputName(config, field);
    if (input.source.has(name))
      throw Error(`${name} is already a column of the table; choose the joined columns with fields, or rename it with as.`);
  }
  const { mapping, source } = await rowMapping(input, config, table, left, right, cache, own);
  // The joined table's columns on the device: codes (a text column coded once) or values.
  const joinedColumns = fields.map((field) => deviceColumn(table, field, cache, own));
  const plan = { kinds: joinedColumns.map((column) => column.kind), dims: joinedColumns.map((column) => column.array.shape.length),
    through: Boolean(source), inner: config.how === "inner", masked: Boolean(input.valid) };
  const inputs = { mapping: mapping.ref, columns: joinedColumns.map((column) => column.array.ref),
    ...(source ? { source: source.ref } : {}), ...(plan.inner && input.valid ? { valid: input.valid.ref } : {}) };
  const result = input.length ? joinProgram(plan)(inputs) : joinKernel(plan, inputs);
  const columns = {}, columnMetadata = {};
  fields.forEach((field, i) => {
    const column = joinedColumns[i], array = own(result.columns[i]);
    columns[field] = column.kind === "codes" ? { codes: array, categories: column.categories, metadata: column.metadata } : array;
    const meta = table.metadata?.(field);
    if (meta) columnMetadata[field] = meta;
  });
  // A joined column keeps the joined table's scale (its categories and colors), as in Nodes data=.
  const renamed = new Map(fields.map((field) => [outputName(config, field), field]));
  const scale = (key, palette) => {
    const [, name, suffix = ""] = /^(.*?)(:(?:shape|position))?$/.exec(key);
    return renamed.has(name) ? table.scale(renamed.get(name) + suffix, palette) : input.source.scale(key, palette);
  };
  const out = { columns, columnMetadata, view: { scale } };
  // "inner": the rows that matched, among those shown (the view takes the mask; its count is
  // read back, as a Filter's is).
  if (plan.inner) out.valid = own(result.mask);
  return out;
}

/**
 * Each row read's row in the joined table (int32, -1 for none), for this run's rows. With the
 * keys' host values (the table's rows), the mapping is built once per key columns and table
 * version, uploaded, and taken at the rows read through sourceIndices(); a key a transform
 * computed is read back at the rows read, once per change of that column.
 */
async function rowMapping(input, config, table, left, right, cache, own) {
  const names = { left, right };
  const rightKeys = await Promise.all(right.map((field) => keyValues(table, field)));
  const rightParts = rightKeys.map((key) => key.values);
  // A live table's mapping follows its keys, not its version (TODO 140.2): a new output with the
  // same keys (its statistics changed) regathers its columns and keeps the mapping.
  const version = config.data.live ? keysFingerprint(rightParts) : config.data.version, fields = JSON.stringify([left, right]);
  const hosts = left.map((field) => input.source.hostColumn?.(field));
  const sourceLength = input.scope.sourceLength ?? input.source.sourceLength ?? input.source.length;
  // Grid coordinates as keys (TODO 51 decision 7): the joined row of each combination of the key
  // coordinates' values, then each row's combination by index. No key is made per row.
  if (hosts.length && hosts.every(isGridDescriptor) && input.scope.sourceIndices) {
    const identity = [...hosts, config.data.owner, version, fields];
    const mapping = await cachedHostValue(cache, "join:grid", identity, async () => {
      const sizes = hosts.map((host) => host.size), combinations = sizes.reduce((a, b) => a * b, 1);
      const parts = hosts.map((host, k) => {
        const meta = input.source.metadata?.(left[k]), origin = meta?.type === "datetime" ? meta.origin ?? 0 : 0;
        const inner = sizes.slice(k + 1).reduce((a, b) => a * b, 1);
        return Array.from({ length: combinations }, (_, c) => {
          const value = host.coords[Math.floor(c / inner) % host.size];
          return typeof value === "number" ? value + origin : value;
        });
      });
      const joined = joinRows(parts, rightParts, { names }), rows = new Int32Array(sourceLength);
      for (let row = 0; row < sourceLength; row++) {
        let combination = 0;
        for (let k = 0; k < hosts.length; k++) combination = combination * sizes[k] + (Math.floor(row / hosts[k].stride) % hosts[k].size);
        rows[row] = joined[combination];
      }
      return rows;
    });
    return { mapping: own(cachedArray(cache, "join:rows", identity, () => np.array(mapping, { dtype: np.int32 }))),
      source: own(input.scope.sourceIndices().astype(np.int32)) };
  }
  const hostLength = (host) => (host?.categories ? host.codes.length : host?.length);
  if (hosts.every((host) => host !== undefined && hostLength(host) === sourceLength) && input.scope.sourceIndices) {
    const identity = [...hosts, config.data.owner, version, fields];
    const mapping = await cachedHostValue(cache, "join:host", identity, async () => {
      const leftParts = (await Promise.all(left.map((field) => keyValues(input.source, field)))).map((key) => key.values);
      return joinRows(leftParts, rightParts, { names });
    });
    return { mapping: own(cachedArray(cache, "join:rows", identity, () => np.array(mapping, { dtype: np.int32 }))),
      source: own(input.scope.sourceIndices().astype(np.int32)) };
  }
  // Keys a transform computed: read at the rows read, once per change of those columns.
  const arrays = left.map((field) => input.scope.get(field));
  const identity = [...arrays.map((array) => array?.codes ?? array), config.data.owner, version, fields];
  const mapping = await cachedHostValue(cache, "join:rows-read", identity, async () => {
    const leftParts = (await Promise.all(left.map((field) => keyValues(input.scope, field)))).map((key) => key.values);
    return joinRows(leftParts, rightParts, { names });
  });
  return { mapping: own(cachedArray(cache, "join:rows-read", identity, () => np.array(mapping, { dtype: np.int32 }))), source: null };
}

/** A live table's keys as a short string (two 32-bit hashes, FNV-1a and djb2, over their kinds
 * and text, and their count): equal keys give equal strings, without serializing them all. */
function keysFingerprint(parts) {
  let fnv = 0x811c9dc5, djb = 5381, count = 0;
  for (const part of parts)
    for (const value of part) {
      const text = value === null || value === undefined ? "\u0000" : `${typeof value}:${value}\u0001`;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        fnv = Math.imul(fnv ^ code, 16777619);
        djb = (Math.imul(djb, 33) + code) | 0;
      }
      count++;
    }
  return `${count}:${fnv >>> 0}:${djb >>> 0}`;
}

/**
 * A joined table's column on the device: dictionary codes (text coded once over the column's
 * domain, through hostColumn; kept while the table's column is) or values.
 */
function deviceColumn(table, field, cache, own) {
  const value = table.get(field), metadata = table.metadata?.(field);
  if (value?.categories) return { kind: "codes", array: own(asArray(value.codes)), categories: value.categories, metadata: value.metadata ?? metadata };
  if (Array.isArray(value) && value.some((item) => typeof item === "string" || typeof item === "boolean")) {
    const coded = table.hostColumn(field);
    return { kind: "codes", categories: coded.categories, metadata,
      array: own(cachedArray(cache, `join:codes:${field}`, [coded], () => np.array(coded.codes, { dtype: np.int32 }))) };
  }
  return { kind: "values", array: own(asArray(value)) };
}

/**
 * One program per plan (TODO 33.3): the rows read's joined rows (taken through their source
 * rows, -1 for a hidden or missing one), the joined columns gathered through them (missing,
 * NaN or a -1 code, where no row matched), and "inner"'s mask. Consumes its inputs.
 */
function joinKernel({ kinds, dims, through, inner, masked }, { mapping, source, valid, columns }) {
  let rows = mapping;
  if (through) {
    rows = np.where(source.ref.greaterEqual(0), np.take(mapping, np.maximum(source.ref, 0), 0), -1).astype(np.int32);
    source.dispose();
  }
  const matched = rows.ref.greaterEqual(0), at = np.maximum(rows, 0);
  const out = columns.map((column, i) => {
    const taken = np.take(column, at.ref, 0);
    if (kinds[i] === "codes") return np.where(matched.ref, taken, -1).astype(np.int32);
    const wide = dims[i] > 1 ? matched.ref.reshape([-1, ...Array(dims[i] - 1).fill(1)]) : matched.ref;
    return np.where(wide, taken, NaN).astype(np.float32);
  });
  at.dispose();
  if (!inner) {
    matched.dispose();
    return { columns: out };
  }
  const mask = (masked ? np.logicalAnd(matched, valid.greater(0)) : matched).astype(np.int32);
  return { columns: out, mask };
}
const PROGRAMS = new Map();
const joinProgram = (plan) => planProgram(PROGRAMS, plan, joinKernel);
