// A Calculate over a grid table (TODO 51 decision 14): every row is kept in order, and whether
// the output keeps the grid is decided per column from its expression, on the host, reading no
// data. A new column or a rewritten variable is a field. A coordinate rewritten from itself
// (and constants, inputs, @time) runs on the dimension's 1-D coordinates and replaces them, if
// they stay monotonic or wrap once (a rotation); one rewritten from two coordinates makes the
// grid curvilinear (the positions over those two dimensions); anything else drops the grid,
// with a message naming the column. Dropping converts nothing: the rows and columns are the same.
import { numpy as np } from "@hmplot/jax";
import { evaluateExpression, expressionFields, expressionHasReduction, expressionHasTween, expressionNeedsRows } from "./expressions.js";
import { isViewStateField } from "./viewState.js";
import { gridDim, isCoordinate, normalizeGrid, replaceCoords } from "./gridModel.js";
import { broadcastOver, coordinateColumn } from "./gridTable.js";
import { deviceArray } from "./deviceParams.js";

const warned = new Set();
/** Say once why a Calculate dropped a grid. */
function dropMessage(reason) {
  const message = `Calculate: the grid is dropped because ${reason}; the rows and columns are the same, but grid marks (Heatmap, Image, Slice's grid path) no longer read it.`;
  if (!warned.has(message)) {
    warned.add(message);
    console.warn(message);
  }
  return message;
}

/** The dimensions (indices) a coordinate spans: a dimension its own, a position its two. */
function spanned(grid, name) {
  if (grid.coords2d && Object.hasOwn(grid.coords2d.columns, name)) return [...grid.coords2d.dims];
  const at = grid.dims.findIndex((dim) => dim.name === name);
  return at >= 0 ? [at] : [];
}

/**
 * A scope of `length` rows holding `columns` (device arrays), for evaluating a coordinate's
 * expression on its dimensions' coordinates instead of every row.
 */
function smallScope(columns, metadata, length) {
  return {
    length,
    has: (key) => Object.hasOwn(columns, key),
    get: (key) => columns[key],
    metadata: (key) => metadata[key],
    keys: () => Object.keys(columns),
  };
}

/**
 * The grid a Calculate's output has, for `input.scope`'s grid and `config.columns`:
 * { grid (undefined: unchanged; null: dropped; else the new model), lazy ({ name: () => column }:
 * rewritten coordinates, made when read), eager (the columns evaluated per row as usual),
 * dropped (the message, when dropped) }. `own` keeps arrays alive with the output.
 */
export async function gridRewrites(input, columns, { viewState, own, evaluator }) {
  const grid = input.scope.grid;
  const names = Object.keys(columns);
  if (!grid || !names.some((name) => isCoordinate(grid, name)))
    return { grid: undefined, lazy: {}, eager: new Set(names), dropped: null };
  let next = grid;
  const lazy = {}, eager = new Set(), positions = {};
  let dropped = null;
  const drop = (reason) => { dropped ??= reason; };
  for (const name of names) {
    const expression = columns[name];
    if (!isCoordinate(grid, name)) { eager.add(name); continue; }
    const read = [...expressionFields(expression, new Set(typeof expression === "string" ? [expression] : []))];
    const other = read.find((field) => !isViewStateField(field) && !isCoordinate(grid, field));
    const dims = new Set([...spanned(grid, name), ...read.filter((field) => isCoordinate(grid, field)).flatMap((field) => spanned(grid, field))]);
    const categorical = [...dims].find((k) => !(grid.dims[k].coords instanceof Float64Array));
    if (other !== undefined) drop(`${name} now depends on ${other}`);
    else if (expressionNeedsRows(expression)) drop(`${name} requires a value for every row`);
    else if (expressionHasReduction(expression)) drop(`${name} now depends on a reduction over rows`);
    else if (expressionHasTween(expression)) drop(`${name} is animated (tween)`);
    else if (categorical !== undefined) drop(`${name} reads the categorical dimension ${grid.dims[categorical].name}`);
    else if (dims.size > 2) drop(`${name} now depends on ${[...dims].map((k) => grid.dims[k].name).join(", ")}`);
    if (dropped) break;
    const over = [...dims].sort((a, b) => a - b);
    if (over.length === 1 && gridDim(grid, name) && !(grid.coords2d && Object.hasOwn(grid.coords2d.columns, name))) {
      // From itself: the expression on the dimension's coordinates.
      const dim = grid.dims[over[0]];
      const coords = deviceArray(Float32Array.from(dim.coords));
      const evaluated = evaluateExpression(expression, smallScope({ [name]: coords }, { [name]: dim.metadata }, dim.size),
        { rowCount: dim.size, viewState, evaluator });
      let values;
      try { values = Float64Array.from(await evaluated.value.ref.data(), Number); }
      finally { evaluated.dispose(); coords.dispose(); }
      // A time shifted stays a time; any other result is a number.
      const metadata = dim.metadata?.type === "datetime" ? dim.metadata : { type: "numeric" };
      const replaced = replaceCoords(next, name, values, metadata);
      if (!replaced.grid) { drop(replaced.reason); break; }
      next = replaced.grid;
      continue;
    }
    // From two coordinates: a curvilinear grid over their dimensions (a rotated pole).
    if (over.length !== 2 || (next.coords2d && next.coords2d.dims.join() !== over.join())) {
      drop(`${name} would make a second curvilinear grid`);
      break;
    }
    const [a, b] = over, rows = grid.dims[a].size * grid.dims[b].size, pair = { dims: over };
    const small = {}, metadata = {};
    for (const field of read.filter((field) => isCoordinate(grid, field))) {
      metadata[field] = { type: "numeric" };
      const position = grid.coords2d?.columns[field];
      if (position) { small[field] = position; continue; }
      const k = grid.dims.findIndex((dim) => dim.name === field);
      small[field] = own(broadcastOver({ shape: [grid.dims[a].size, grid.dims[b].size] },
        deviceArray(Float32Array.from(grid.dims[k].coords)), [k === a ? 0 : 1]));
    }
    const evaluated = evaluateExpression(expression, smallScope(small, metadata, rows), { rowCount: rows, viewState, evaluator });
    try { positions[name] = own(evaluated.value.ref.astype(np.float32)); }
    finally { evaluated.dispose(); }
    next = normalizeGrid({ dims: next.dims, fields: next.fields,
      coords2d: { ...pair, columns: { ...(next.coords2d?.columns ?? {}), ...positions } } });
  }
  if (dropped) {
    // Every column is evaluated per row, as on a plain table.
    return { grid: null, lazy: {}, eager: new Set(names), dropped: dropMessage(dropped) };
  }
  for (const name of names) if (!eager.has(name)) lazy[name] = () => coordinateColumn(next, name);
  return { grid: next, lazy, eager, dropped: null };
}
