// Grid tables on the device (TODO 51): the table value Data takes (gridTable), and the
// coordinate columns, computed when read from each dimension's 1-D coordinates (decision 1): a
// jitted broadcast per (shape, dimensions), so only the variables' values are stored.
import { numpy as np, jit, Array as JaxArray } from "@hmplot/jax";
import { normalizeGrid } from "./gridModel.js";
import { prepareColumn } from "./columns.js";
import { deviceArray } from "./deviceParams.js";
import { asArray } from "./data.js";

/** The grid a gridTable() value carries (a non-enumerable property: the columns stay plain). */
export const GRID_TABLE = Symbol("grid table");
export const gridSpecOf = (value) => (value && typeof value === "object" ? value[GRID_TABLE] ?? null : null);

const product = (values) => values.reduce((a, b) => a * b, 1);
/** Nested arrays flattened in C order; flat arrays, typed arrays and device arrays as they are. */
function flatten(values, n, where) {
  if (values instanceof JaxArray) return values.shape.length === 1 ? values : values.reshape([n]);
  if (ArrayBuffer.isView(values) || values?.codes || values?.__hmplotColumn) return values;
  if (!Array.isArray(values)) throw Error(`${where} must be an array of values.`);
  return Array.isArray(values[0]) ? values.flat(Infinity) : values;
}
const size = (values) => {
  const inner = values?.__hmplotColumn ? values.values : values?.codes ?? values;
  return inner?.shape?.[0] ?? inner?.length;
};

/**
 * A grid table for Data (TODO 51): one row per cell (every combination of the dimensions'
 * coordinates, the first dimension outermost), the coordinates as columns computed when read.
 * - dims: { name: coordinates } in order (numbers, Dates or categories; column() for a type);
 * - columns: the variables, one value per cell in C order (flat, nested arrays, or a device
 *   array of the grid's shape);
 * - edges: { name: cell bounds } (size + 1 each; CF bounds), else the midpoints;
 * - positions: a curvilinear grid's 2-D coordinates, { dims: [a, b], columns: { lat, lon }, x, y }:
 *   each column one value per cell of those two dimensions.
 * @param {object} spec
 * @param {Record<string, any>} spec.dims
 * @param {Record<string, any>} [spec.columns]
 * @param {Record<string, ArrayLike<number>>} [spec.edges]
 * @param {any} [spec.positions]
 */
export function gridTable({ dims, columns = {}, edges = {}, positions = undefined }) {
  if (!dims || typeof dims !== "object" || Array.isArray(dims) || !Object.keys(dims).length)
    throw Error("gridTable needs dims: { name: coordinates } for at least one dimension.");
  const dimensions = Object.entries(dims).map(([name, coordinates]) => {
    const prepared = prepareColumn(coordinates);
    const values = prepared.values?.codes ? prepared.values.categories : prepared.values;
    return { name, coords: values, metadata: prepared.metadata, edges: edges[name] };
  });
  const shape = dimensions.map((dim) => dim.coords.length), n = product(shape);
  const out = {};
  for (const [name, values] of Object.entries(columns)) {
    if (Object.hasOwn(dims, name)) throw Error(`gridTable: ${name} is both a dimension and a column.`);
    out[name] = flatten(values, n, `gridTable column ${name}`);
    if (size(out[name]) !== n)
      throw Error(`gridTable column ${name} has ${size(out[name])} values; the grid [${shape.join(", ")}] has ${n} cells.`);
  }
  let coords2d = null;
  if (positions) {
    const at = (positions.dims ?? []).map((name) => dimensions.findIndex((dim) => dim.name === name));
    if (at.length !== 2 || at.some((k) => k < 0) || at[0] === at[1])
      throw Error("gridTable positions span two of the grid's dimensions: positions.dims = [a, b].");
    const [a, b] = at[0] < at[1] ? at : [at[1], at[0]], cells = shape[a] * shape[b];
    const position = {};
    for (const [name, values] of Object.entries(positions.columns ?? {})) {
      if (Object.hasOwn(dims, name) || Object.hasOwn(columns, name)) throw Error(`gridTable: ${name} is a position and another column.`);
      let flat = flatten(values, cells, `gridTable position ${name}`);
      if (size(flat) !== cells) throw Error(`gridTable position ${name} has ${size(flat)} values; its dimensions have ${cells} cells.`);
      // Given over [b, a] (the dimensions listed in the other order): transposed to C order.
      if (at[0] > at[1]) {
        const host = flat instanceof JaxArray ? null : Float32Array.from(flat, Number);
        flat = host ? transposeHost(host, shape[b], shape[a]) : flat.reshape([shape[b], shape[a]]).transpose([1, 0]).reshape([cells]);
      }
      position[name] = flat;
    }
    if (Object.keys(position).length < 2) throw Error("gridTable positions need two columns (a curvilinear grid's x and y).");
    coords2d = { dims: [a, b], columns: position, x: positions.x, y: positions.y };
  }
  // Checked now, so a malformed grid fails where it is made.
  const spec = { dims: dimensions, fields: Object.keys(columns), coords2d };
  normalizeGrid({ ...spec, coords2d: coords2d && { ...coords2d, columns: {} } }, n);
  return Object.defineProperty(out, GRID_TABLE, { value: spec, enumerable: false });
}
function transposeHost(values, rows, columns) {
  const out = new Float32Array(values.length);
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) out[j * rows + i] = values[i * columns + j];
  return out;
}

const BROADCASTS = new Map();
/** Values over dimensions `over` (C order) repeated to every row of a grid of `shape`. */
function broadcastProgram(shape, over) {
  const key = JSON.stringify([shape, over]);
  let program = BROADCASTS.get(key);
  if (!program) {
    if (BROADCASTS.size >= 64) BROADCASTS.delete(BROADCASTS.keys().next().value);
    const partial = shape.map((size, k) => (over.includes(k) ? size : 1)), total = product(shape);
    program = jit((values) => np.broadcastTo(values.reshape(partial), shape).reshape([total]));
    BROADCASTS.set(key, program);
  }
  return program;
}
/** `values` (a device array over dimensions `over`) as a column of every row. Consumes `values`. */
export const broadcastOver = (grid, values, over) => broadcastProgram([...grid.shape], over)(values);

/**
 * A coordinate column of `grid` on the device (the caller owns it): float32 values (a datetime's
 * milliseconds from its origin), codes over a categorical dimension's categories, or a
 * curvilinear position's values repeated over the other dimensions. `positions` holds the
 * device arrays of the grid's curvilinear positions.
 */
export function coordinateColumn(grid, name, positions = grid.coords2d?.columns) {
  // A position of the same name as a dimension (a Calculate's rotated pole: lat' = f(lat, lon)
  // written as lat) is what the column reads; the dimension keeps its structure.
  const k = positions && Object.hasOwn(positions, name) ? -1 : grid.dims.findIndex((dim) => dim.name === name);
  if (k >= 0) {
    const dim = grid.dims[k];
    if (!(dim.coords instanceof Float64Array)) {
      const codes = broadcastOver(grid, np.arange(dim.size).astype(np.int32), [k]);
      return { codes, categories: dim.coords };
    }
    return broadcastOver(grid, deviceArray(Float32Array.from(dim.coords)), [k]);
  }
  const values = positions?.[name];
  if (values === undefined) throw Error(`${name} is not a coordinate of the grid.`);
  return broadcastOver(grid, asArray(values).astype(np.float32), grid.coords2d.dims);
}

const REDUCTIONS = new Map();
/** The ops a reduction by grid dimensions computes (gridReduction). */
export const GRID_REDUCTIONS = new Set(["count", "sum", "mean", "min", "max", "variance", "std"]);
/**
 * A reduction by some of a grid table's dimensions (TODO 51; `mean(tas, { by: ["lat", "lon"] })`
 * for an anomaly): the values as the grid's shape, reduced over the other dimensions where `shown`
 * (and finite), each result repeated to its rows. One program per (shape, dimensions kept, op):
 * no grouping, whatever the number of groups. Consumes `values` ([n] float32) and `shown` ([n]
 * bool).
 */
export function gridReduction(grid, by, values, shown, op) {
  const shape = [...grid.shape], keep = grid.dims.map((dim) => by.includes(dim.name));
  const key = JSON.stringify([shape, keep, op]);
  let program = REDUCTIONS.get(key);
  if (!program) {
    if (REDUCTIONS.size >= 64) REDUCTIONS.delete(REDUCTIONS.keys().next().value);
    const axes = keep.map((kept, k) => (kept ? -1 : k)).filter((k) => k >= 0).reverse(), n = product(shape);
    const over = (a) => axes.reduce((x, axis) => np.sum(x, axis, { keepdims: true }), a);
    const extreme = (a, fn) => axes.reduce((x, axis) => fn(x, axis, { keepdims: true }), a);
    program = jit((v, s) => {
      const x = v.reshape(shape), ok = np.logicalAnd(s.reshape(shape), np.isfinite(x.ref));
      const count = over(ok.ref.astype(np.float32)), some = count.ref.greater(0);
      let out;
      if (op === "count") out = count.ref;
      else if (op === "min" || op === "max")
        out = np.where(some.ref, extreme(np.where(ok.ref, x.ref, op === "min" ? Infinity : -Infinity), op === "min" ? np.min : np.max), NaN);
      else {
        const sum = over(np.where(ok.ref, x.ref, 0));
        if (op === "sum") out = sum;
        else {
          const mean = sum.div(np.maximum(count.ref, 1));
          if (op === "mean") out = np.where(some.ref, mean, NaN);
          else {
            const variance = over(np.where(ok.ref, np.square(x.ref.sub(mean)), 0)).div(np.maximum(count.ref, 1));
            out = np.where(some.ref, op === "std" ? np.sqrt(variance) : variance, NaN);
          }
        }
      }
      x.dispose(); ok.dispose(); count.dispose(); some.dispose();
      return np.broadcastTo(out, shape).reshape([n]);
    });
    REDUCTIONS.set(key, program);
  }
  return program(values, shown);
}
