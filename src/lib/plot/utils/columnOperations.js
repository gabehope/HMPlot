/** Row-aligned ordered expressions. Sort supplies the permutation; Window supplies reducers. */
import { numpy as np } from "@hmplot/jax";
import { asArray } from "./data.js";
import { deviceScalar } from "./deviceParams.js";
import { sortOrder } from "./transforms/order.js";
import { runsOf, windowReduce } from "./windows.js";
import { segmentedScan } from "./reduce.js";
import { columnName } from "./names.js";

export const ORDERED_OPS = new Set(["cumsum", "lag", "lead", "window"]);
export const WINDOW_REDUCERS = new Set(["count", "sum", "mean", "min", "max", "first", "last", "variance", "std", "any", "all"]);

/** Dynamic operands live in AST argument slots; this object contains only structural options. */
export function columnOptions(op, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw Error(`${op} options must be an object, such as {by: "category"}.`);
  const allowed = new Set(["by", "__expressionLiteral"]);
  if (ORDERED_OPS.has(op) || op === "first" || op === "last") {
    allowed.add("orderBy"); allowed.add("order");
  }
  if (op === "lag" || op === "lead") { allowed.add("periods"); allowed.add("fill"); }
  if (op === "window") { allowed.add("reduce"); allowed.add("align"); allowed.add("size"); }
  if (op === "quantile") allowed.add("p");
  if (!ORDERED_OPS.has(op)) allowed.add("where");
  const unknown = Object.keys(options).filter(key => !allowed.has(key));
  if (unknown.length) throw Error(`${op} has no option ${unknown.join(", ")}; use ${[...allowed].filter(key => !key.startsWith("__")).join(", ")}.`);
  const out = { __expressionLiteral: true };
  for (const key of ["by", "orderBy"]) if (options[key] !== undefined) {
    const value = Array.isArray(options[key]) ? options[key].map(item => columnName(item, `${op} ${key}`)) : columnName(options[key], `${op} ${key}`);
    if (!(typeof value === "string" && value || Array.isArray(value) && value.length && value.every(item => typeof item === "string" && item)))
      throw Error(`${op} ${key} must be a column name or a list of column names.`);
    out[key] = value;
  }
  if (options.order !== undefined) {
    if (!out.orderBy || !["asc", "desc"].includes(options.order)) throw Error(`${op} order needs orderBy and "asc" or "desc".`);
    out.order = options.order;
  }
  if (op === "lag" || op === "lead") {
    out.periods = options.periods ?? 1;
    if (!Number.isInteger(out.periods) || out.periods < 0)
      throw Error(`${op} periods must be a nonnegative integer; use ${op === "lag" ? "lead" : "lag"} for the opposite direction.`);
    out.fill = options.fill ?? null;
  }
  if (op === "quantile") {
    if (typeof options.p !== "number" || !(options.p >= 0 && options.p <= 1))
      throw Error('quantile needs p, a probability from 0 to 1, such as quantile("x", 0.9).');
    out.p = options.p;
  }
  if (op === "window") {
    out.reduce = options.reduce ?? "mean"; out.align = options.align ?? "trailing";
    if (!WINDOW_REDUCERS.has(out.reduce) || !["trailing", "leading", "center"].includes(out.align))
      throw Error("window needs a supported reducer and trailing, leading or center alignment.");
  }
  return Object.freeze(out);
}

/** Logical boolean values, including dictionaries whose code zero may mean true. */
export function booleanValues(source, own, op) {
  const value = source.value, categories = source.categories ?? value?.categories;
  if (!categories && Array.isArray(value) && value.some(item => typeof item === "string"))
    throw Error(`${op} needs boolean or numeric values; use a categorical comparison expression.`);
  if (!categories && Array.isArray(value) && value.some(item => typeof item === "boolean"))
    return own(asArray(Float32Array.from(value, item => typeof item === "boolean" ? Number(item) : NaN)));
  const array = own(asArray(value?.codes ?? value));
  if (!categories) return array;
  if (categories.some(item => typeof item !== "boolean"))
    throw Error(`${op} needs boolean or numeric values; compare a categorical column, e.g. equal("status", literal("ready")).`);
  if (!categories.length) return own(np.full(array.shape, NaN));
  const lookup = own(np.array(categories.map(Number), { dtype: np.float32 }));
  const present = own(np.logicalAnd(array.ref.greaterEqual(0), array.ref.less(categories.length)));
  return own(np.where(present.ref, np.take(lookup.ref, np.clip(array.ref, 0, Math.max(0, categories.length - 1)), 0), NaN));
}

/** A gather's missing value in the source's representation: a category's code (-1 for null), a
 * Date shifted to the datetime origin, or a number. */
function fillValue(op, source, categories, fill) {
  let missing = fill ?? NaN;
  if (categories) {
    missing = fill === null ? -1 : categories.findIndex(item => Object.is(item, fill));
    if (fill !== null && missing < 0) throw Error(`${op} fill must be a value in the source category dictionary.`);
  } else if (source.metadata?.type === "datetime") {
    if (fill !== null && !(fill instanceof Date)) throw Error(`${op} datetime fill must be a Date, or null for missing.`);
    if (fill) missing = fill.getTime() - source.metadata.origin;
  } else if (fill !== null && typeof fill !== "number" && typeof fill !== "boolean") throw Error(`${op} fill must be numeric, or null for missing.`);
  return missing;
}

function checkTypedFill(op, input, categories, fill, missing) {
  if (!categories && input.dtype === "bool" && typeof fill !== "boolean")
    throw Error(`${op} on boolean buffers needs an explicit boolean fill; use {fill: false} or {fill: true}.`);
  // There is no nullable int32 representation in the table protocol. Do not truncate large
  // integers or steal an integer sentinel. An explicit integer fill retains exact gathers.
  if (!categories && input.dtype === "int32" && (!Number.isInteger(missing) || missing < -2147483648 || missing > 2147483647))
    throw Error(`${op} on int32 needs an explicit int32 fill (for example {fill: 0}); nullable integer columns are not supported.`);
}

/** `values` where `keep`, else the fill; a boolean buffer stays boolean (a device scalar is
 * float32 or int32, so where() with one would promote it). */
function filled(keep, values, missing, dtype, own) {
  if (dtype === "bool")
    return own(missing ? np.logicalOr(np.logicalNot(keep.ref), values.ref) : np.logicalAnd(keep.ref, values.ref));
  const fillArray = own(deviceScalar(missing, { dtype: dtype === "int32" ? "int32" : "float32" }));
  return own(np.where(keep.ref, values.ref, fillArray.ref));
}

/** lookup's options: only a fill (TODO 138.6). */
export function lookupOptions(options = {}) {
  options ??= {};
  if (typeof options !== "object" || Array.isArray(options))
    throw Error("lookup options must be an object, such as {fill: 0}.");
  const unknown = Object.keys(options).filter(key => key !== "fill" && key !== "__expressionLiteral");
  if (unknown.length) throw Error(`lookup has no option ${unknown.join(", ")}; use fill.`);
  return Object.freeze({ __expressionLiteral: true, fill: options.fill ?? null });
}

/**
 * lookup(value, row) (TODO 138.6): each row reads `value` at the row numbered `row` (0-based) of
 * the visible rows in their current order, as x[parent]. A row number that is missing, not a
 * whole number or past the visible rows reads `fill`; a hidden row reads nothing, as in lag.
 * Float row numbers are exact to 2^24 rows; an int32 column of row numbers is exact throughout.
 * @returns {import("./expressionPlanTypes.js").ResolvedOperand}
 */
export function lookupColumn(source, row, scope, shown, fill, own) {
  const categories = source.categories ?? source.value?.categories;
  const input = own(asArray(source.value?.codes ?? source.value));
  const n = scope.length;
  if (input.shape.length !== 1 || input.shape[0] !== n)
    throw Error("lookup needs one value per table row; pass a column or row expression.");
  if (row.categories || row.value?.categories || ["datetime", "duration", "categorical", "ordinal"].includes(row.metadata?.type))
    throw Error(`lookup row must be a row number; ${row.metadata?.type ?? "a category"} is not one.`);
  const missing = fillValue("lookup", source, categories, fill);
  checkTypedFill("lookup", input, categories, fill, missing);
  if (!n) return { value: input, categories, metadata: source.metadata };
  const rowValue = row.value;
  let index = typeof rowValue === "number" || typeof rowValue === "boolean"
    ? own(deviceScalar(Number(rowValue), { dtype: Number.isInteger(rowValue) ? "int32" : "float32" })) : own(asArray(rowValue));
  if (index.shape.length > 1 || index.shape.length === 1 && index.shape[0] !== n)
    throw Error("lookup row must be one number, or one per table row.");
  if (index.dtype === "bool") index = own(index.ref.astype(np.int32));
  if (!index.shape.length) index = own((index.dtype === "int32" ? np.zeros([n], { dtype: np.int32 }) : np.zeros([n])).add(index.ref));
  const integer = index.dtype === "int32";
  if (!integer) index = own(index.ref.astype(np.float32));
  // The visible rows first, in their order: a unique key each, so the sort's stability is moot.
  const positions = shown ? own(np.argsort(np.where(shown.ref, np.arange(n).astype(np.int32), np.arange(n).astype(np.int32).add(n)))) : null;
  const count = shown ? own(shown.ref.astype(np.int32).sum()) : n;
  const below = typeof count === "number" ? own(deviceScalar(count, { dtype: integer ? "int32" : "float32" })) : own(integer ? count.ref : count.ref.astype(np.float32));
  let whole = own(np.logicalAnd(index.ref.greaterEqual(0), index.ref.less(below.ref)));
  if (!integer) whole = own(np.logicalAnd(whole.ref, np.floor(index.ref).equal(index.ref)));
  const at = own(np.clip(np.where(whole.ref, index.ref, 0).astype(np.int32), 0, n - 1));
  const physical = positions ? own(np.take(positions.ref, at.ref, 0)) : at;
  const gathered = own(np.take(input.ref, physical.ref, 0));
  const keep = shown ? own(np.logicalAnd(whole.ref, shown.ref)) : whole;
  const output = filled(keep, gathered, missing, input.dtype, own);
  return { value: output, categories, metadata: source.metadata };
}

/** One stable visible-first, group-local permutation, with results restored by inverse. */
export function orderedRows(scope, options, groups, shown, own, { operation, prefixCount } = {}) {
  if (scope.grid) throw Error("Ordered expressions require a one-dimensional table; use a table transform instead of ordering a grid.");
  const n = scope.length;
  // Window over an already ordered visible prefix needs no permutation or inverse gather.
  if (operation === "window" && !groups && !options.orderBy && (!shown || prefixCount !== undefined))
    return { direct: true, valid: shown, start: null, end: prefixCount !== undefined ? own(prefixCount?.shape ? prefixCount.ref : deviceScalar(prefixCount)) : null };
  if (!n) return { order: own(np.zeros([0], { dtype: np.int32 })), inverse: own(np.zeros([0], { dtype: np.int32 })),
    start: own(np.zeros([0])), end: own(np.zeros([0])), keys: own(np.zeros([0], { dtype: np.int32 })),
    valid: own(np.zeros([0], { dtype: np.bool })) };
  const initial = own(options.orderBy ? sortOrder(scope, [options.orderBy].flat(), options.order ?? "asc", n) : np.arange(n).astype(np.int32));
  const codes = groups?.codes ?? own(np.zeros([n], { dtype: np.int32 }));
  const count = groups?.groups ?? 1;
  const valid = own(codes.ref.greaterEqual(0));
  const keep = shown ? own(np.logicalAnd(valid.ref, shown.ref)) : valid;
  const key = own(np.where(keep.ref, codes.ref, count).astype(np.int32));
  const sortedKey = own(np.take(key.ref, initial.ref, 0));
  const runs = runsOf(sortedKey);
  try {
    const order = own(np.take(initial.ref, runs.order.ref, 0));
    return { order, inverse: own(np.argsort(order.ref)), start: own(runs.start.ref), end: own(runs.end.ref),
      keys: own(np.take(key.ref, order.ref, 0)), valid: keep };
  } finally { runs.dispose(); }
}

/** Operates on current values only; consumes no producer state and makes no readbacks. */
/** @returns {import("./expressionPlanTypes.js").ResolvedOperand} */
export function orderedColumn(op, source, scope, options, size, rows, own) {
  const categories = source.categories ?? source.value?.categories;
  let input = own(asArray(source.value?.codes ?? source.value));
  if (input.shape.length !== 1 || input.shape[0] !== scope.length)
    throw Error(`${op} needs one value per table row; pass a column or row expression.`);
  if (!input.shape[0]) {
    if (op === "lag" || op === "lead") return { value: input, categories, metadata: source.metadata };
    const boolean = op === "window" && ["any", "all"].includes(options.reduce);
    if (categories && !boolean) throw Error(`${op} needs numeric values; categorical codes are not amounts.`);
    if (boolean) booleanValues(source, own, options.reduce);
    return { value: own(np.zeros([0], { dtype: boolean ? np.bool : np.float32 })),
      metadata: { type: boolean ? "boolean" : "numeric" } };
  }
  const sorted = rows.direct ? input : own(np.take(input.ref, rows.order.ref, 0));
  // An excluded row's value when the output has no NaN: an empty window's any/all, a category's
  // missing code, or an integer or boolean buffer's explicit fill.
  let output, excluded = NaN;
  if (op === "cumsum") {
    if (categories) throw Error("cumsum needs numeric values; categorical codes are not amounts.");
    const values = own(sorted.ref.astype(np.float32));
    const keep = own(np.take(rows.valid.ref, rows.order.ref, 0));
    const finite = own(np.logicalAnd(keep.ref, np.isfinite(values.ref)));
    const scan = own(segmentedScan(np.where(finite.ref, values.ref, 0).reshape([-1, 1]), rows.keys));
    output = own(scan.ref.reshape([-1]));
  } else if (op === "window") {
    if (!size?.shape && (!Number.isInteger(size) || size < 1)) throw Error("window size must be a positive integer, or an input resolving to one.");
    const boolean = options.reduce === "any" || options.reduce === "all";
    if (categories && !boolean) throw Error("window needs numeric values; use a boolean comparison for categorical observations.");
    if (boolean) { input = booleanValues(source, own, options.reduce); excluded = options.reduce === "all"; }
    const values = own((rows.direct ? input.ref : np.take(input.ref, rows.order.ref, 0)).astype(np.float32));
    const shift = size?.shape ? options.align === "trailing" ? own(size.ref.sub(1)) : options.align === "center" ? own(np.floor(size.ref.div(2))) : 0
      : options.align === "trailing" ? size - 1 : options.align === "center" ? Math.floor(size / 2) : 0;
    output = own(windowReduce(values, options.reduce, size, shift, rows.start, rows.end));
  } else {
    const fill = options.fill;
    const missing = fillValue(op, source, categories, fill);
    if (!options.periods) return { value: input, categories, metadata: source.metadata };
    checkTypedFill(op, input, categories, fill, missing);
    const index = own(np.arange(scope.length).astype(np.float32).add(deviceScalar((op === "lag" ? -1 : 1) * options.periods)));
    const inside = own(np.logicalAnd(index.ref.greaterEqual(rows.start.ref), index.ref.less(rows.end.ref)));
    const gathered = own(np.take(sorted.ref, np.clip(index.ref, 0, scope.length - 1).astype(np.int32), 0));
    output = filled(inside, gathered, missing, input.dtype, own);
    excluded = categories ? -1 : missing;
  }
  const restored = rows.direct ? output : own(np.take(output.ref, rows.inverse.ref, 0));
  // Rows with a missing group key, and hidden rows, take no neighbor's value.
  let visible = restored;
  if (!rows.direct && rows.valid) {
    // Logical masks keep a boolean output boolean; a device scalar is float32 or int32.
    if (restored.dtype === "bool") visible = own(excluded
      ? np.logicalOr(np.logicalNot(rows.valid.ref), restored.ref) : np.logicalAnd(rows.valid.ref, restored.ref));
    else visible = own(np.where(rows.valid.ref, restored.ref,
      restored.dtype === "float32" ? NaN : own(deviceScalar(excluded, { dtype: restored.dtype })).ref));
  }
  return { value: visible, categories: op === "lag" || op === "lead" ? categories : undefined,
    metadata: op === "lag" || op === "lead" ? source.metadata : { type: restored.dtype === "bool" ? "boolean" : "numeric" } };
}
