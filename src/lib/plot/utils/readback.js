// @ts-check
// A table on the host (TODO 145.1): the rows a transform's output or a Data's table holds now,
// read back for code that needs the values themselves (a breadcrumb, a top-ten list, a total
// written in a sentence). Marks never need this: they read the same columns on the GPU.
//
// One read per call, after the producer settles: the caller asks for it (handle.read()), the
// library never does it per pointer move. Device columns cross in parallel readbacks; host
// columns are copied. Its size is bounded by limit.readback.
import { Array as JaxArray } from "@hmplot/jax";
import { LIMITS, limitError } from "./limits.js";

/** @typedef {import("./dataViewTypes.js").RowScope} RowScope */
/**
 * @typedef {{ columns?: string[], rows?: boolean, limit?: number, component?: string }} ReadOptions
 * `columns`: which columns, in order (default: every column but interaction and internal
 * ones); `rows`: rows as objects instead of columns; `limit`: the first that many rows only
 * (sliced before the readback); `component`: the name errors give.
 */
/**
 * @typedef {{ length: number, version: unknown, columns: Record<string, unknown[] | ArrayLike<number>> }
 *   | { length: number, version: unknown, rows: Record<string, unknown>[] }} HostTable
 * `length` is the table's row count; with a limit the lists hold min(limit, length) rows.
 */

/** Interaction state (@brushed) and the library's own columns (__...) are not the table's data. */
const internal = (/** @type {string} */ key) => key.startsWith("@") || key.startsWith("__");

/** @param {readonly number[]} shape */
const elements = (shape) => shape.reduce((n, d) => n * d, 1);

/**
 * The host values of one column: numbers as a Float64Array (NaN where missing), times as Dates
 * (null where missing), categories as their values (null where missing), a 2D column ([N, k]
 * positions) as N lists of k numbers, other host values as they are.
 * @param {unknown} value @param {number} length @param {import("./dataViewTypes.js").ColumnMetadata | null | undefined} meta
 */
async function hostValues(value, length, meta, limit = length) {
  /** @type {any} */
  const column = value;
  const n = Math.min(limit, length);
  const time = meta?.type === "datetime" && Number.isFinite(meta.origin);
  const asTime = (/** @type {number} */ v) => (Number.isFinite(v) ? new Date(/** @type {number} */ (meta?.origin) + v) : null);
  if (typeof column === "number" || typeof column === "boolean") {
    const filled = Array.from({ length: n }, () => column);
    return time ? filled.map((v) => asTime(Number(v))) : typeof column === "number" ? Float64Array.from(filled) : filled;
  }
  if (column?.categories) {
    const codes = column.codes instanceof JaxArray ? await head(column.codes, n) : Array.prototype.slice.call(column.codes, 0, n);
    return Array.from(codes, (code) => {
      const at = Math.round(Number(code));
      return at >= 0 && at < column.categories.length ? column.categories[at] : null;
    });
  }
  if (column instanceof JaxArray) {
    const data = await head(column, n);
    if (column.shape.length === 2) {
      const k = column.shape[1];
      return Array.from({ length: Math.min(n, column.shape[0]) }, (_, row) => Array.from(data.subarray(row * k, row * k + k), Number));
    }
    if (time) return Array.from(data, (v) => asTime(Number(v)));
    return Float64Array.from(data, Number);
  }
  if (ArrayBuffer.isView(column) && !(column instanceof DataView)) {
    const whole = /** @type {any} */ (column);
    const typed = /** @type {ArrayLike<number | bigint>} */ (n < whole.length ? whole.subarray(0, n) : whole);
    if (typeof typed[0] === "bigint") return Array.from(typed);
    return time ? Array.from(typed, (v) => asTime(Number(v))) : Float64Array.from(typed, Number);
  }
  if (Array.isArray(column)) {
    const rows = column.slice(0, n);
    return time ? rows.map((v) => (typeof v === "number" ? asTime(v) : v ?? null)) : rows;
  }
  return undefined;
}

/** The first `n` rows of a device array, on the host (sliced on the device first). */
async function head(/** @type {JaxArray} */ array, /** @type {number} */ n) {
  if (n >= array.shape[0]) return array.ref.data();
  const part = array.ref.slice([0, n]);
  try {
    return await part.ref.data();
  } finally {
    part.dispose();
  }
}

/**
 * `scope`'s visible rows on the host: `{ length, version, columns }` (or `rows`, with
 * `{ rows: true }`). A column the scope cannot give as values (a GeoJSON geometry) is left out,
 * unless `columns` names it, which is an error naming it. Past limit.readback, an error naming
 * the component and what to read instead.
 * @param {RowScope} scope @param {ReadOptions} [options] @returns {Promise<HostTable>}
 */
export async function readTable(scope, { columns, rows = false, limit = undefined, component = "read()" } = {}) {
  const length = scope.length, version = scope.version;
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 0))
    throw Error(`${component}: read({ limit }) takes a whole number of rows, 0 or more.`);
  const n = Math.min(limit ?? length, length);
  const available = scope.keys().filter((key) => !internal(key));
  if (columns !== undefined && !Array.isArray(columns))
    throw Error(`${component}: read({ columns }) takes a list of column names.`);
  for (const name of columns ?? [])
    if (typeof name !== "string" || !scope.has(name) || internal(name))
      throw Error(`${component}: read() asked for "${name}", which is not a column of this table (its columns: ${available.join(", ") || "none"}).`);
  const names = columns ?? available;
  const parts = names.map((name) => ({ name, value: scope.get(name), meta: scope.metadata?.(name) }));
  let bytes = 0;
  for (const { value } of parts) {
    /** @type {any} */
    const column = value, device = column?.codes ?? column;
    const share = length ? n / length : 0; // the part of each column the read copies
    if (device instanceof JaxArray) bytes += elements(device.shape) * 4 * share;
    else if (ArrayBuffer.isView(device)) bytes += device.byteLength * share;
    else if (Array.isArray(device)) bytes += device.length * 8 * share;
  }
  if (bytes > LIMITS.readback.value) throw limitError("readback", { component, count: bytes });
  const values = await Promise.all(parts.map(({ value, meta }) => hostValues(value, length, meta, n)));
  /** @type {Record<string, any>} */
  const out = {};
  parts.forEach(({ name, value }, i) => {
    const read = values[i];
    if (read === undefined) {
      if (columns) throw Error(`${component}: read() cannot give "${name}" as values (${/** @type {any} */ (value)?.isGeometryColumn ? "a geometry column" : "an unsupported column"}); read the table's other columns.`);
      return;
    }
    if (read.length !== n)
      throw Error(`${component}: "${name}" has ${read.length} values for ${n} rows.`);
    out[name] = read;
  });
  if (!rows) return { length, version, columns: out };
  const fields = Object.keys(out);
  return {
    length,
    version,
    rows: Array.from({ length: n }, (_, row) => {
      /** @type {Record<string, unknown>} */
      const record = {};
      for (const field of fields) {
        const v = out[field][row];
        record[field] = typeof v === "number" && Number.isNaN(v) ? null : v;
      }
      return record;
    }),
  };
}
