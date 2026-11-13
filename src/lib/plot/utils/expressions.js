// @ts-check
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { asArray, shapeOf, isDeviceArray } from "./data.js";
import { isLiteral, isCategory } from "./categorical.js";
import { reduceValues } from "./reduce.js";
import { reduceRuns } from "./windows.js";
import {
  groupReduce,
  REDUCER_OPS as ONE_HOT,
} from "./transforms/statistics.js";
import { gridReduction, GRID_REDUCTIONS } from "./gridTable.js";
import { diagnostic, fieldHelp } from "./diagnostics.js";
import { checkTiming } from "./animation.js";
import { LIMITS, limitError } from "./limits.js";
import { deviceScalar, deviceArray } from "./deviceParams.js";
import {
  viewState as makeViewState,
  isViewStateSubtree,
  isConstantSubtree,
  hostValue,
  intervalPeriod,
  readsViewState,
} from "./viewState.js";
import { offsetField } from "./offsets.js";
import { acquireColumn } from "./columnReads.js";
import {
  CALENDAR_OPS,
  CALENDAR_NAMES,
  calendarOptions,
  calendarValue,
} from "./calendar.js";
import { MODEL_CALENDARS, modelCalendarValue } from "./modelCalendars.js";
import { CAST_OPS, castOptions, castValue } from "./casts.js";
import {
  checkRandomSeed,
  randomOptions,
  randomValues,
} from "./randomExpression.js";
import {
  columnOptions,
  ORDERED_OPS,
  orderedRows,
  orderedColumn,
  booleanValues,
  lookupOptions,
  lookupColumn,
} from "./columnOperations.js";
import { sortOrder } from "./transforms/order.js";

import {
  expression,
  isExpression,
  col,
  view,
  field,
  nodeField,
  nameNode,
  isColumnNode,
  columnName,
  inputNode,
  STATE_NAMES,
  stateField,
  isInteractionColumn,
  unknownAtName,
} from "./names.js";

/** @typedef {import('../publicTypes.js').Expression} Expression
 * @typedef {import('./expressionPlanTypes.js').ResolvedOperand} ResolvedOperand
 * @typedef {import('./expressionPlanTypes.js').ResolutionContext} ResolutionContext
 * @typedef {import('./expressionPlanTypes.js').OwnExpressionResource} OwnExpressionResource
 * @typedef {import('./expressionPlanTypes.js').ExpressionScope} ExpressionScope
 * @typedef {import('./dataViewTypes.js').ColumnMetadata} ColumnMetadata
 * @typedef {import('./dataViewTypes.js').DictionaryColumn} DictionaryColumn
 * @typedef {{$expression: {op: string, args: unknown[]}}} ExpressionDescriptor
 */

const MAX_NODES = /** @type {number} */ (LIMITS.expressionOperations.value),
  MAX_DEPTH = /** @type {number} */ (LIMITS.expressionDepth.value);
export { isExpression, col, view, field, nodeField, STATE_NAMES };
/** `node` with other arguments (utils/inputs.js substitutes input reads this way). */
/** @param {{op: string}} node @param {unknown[]} args @returns {Expression} */
export const rebuildExpression = (node, args) => expression(node.op, args);

/**
 * A rank-0 array whose value lives in a GPU buffer (see utils/deviceParams.js): a host value
 * that changes, such as the clock or a threshold, reaches kernels as an input instead of
 * compiling a new kernel per value.
 */
export { deviceScalar };

/** @template T @param {string} op @param {T[]} args @returns {T[]} */
const guard = (op, args) => {
  for (const item of args)
    if (
      /** @type {import("../publicTypes.js").AnimatedChannel | null | undefined} */ (
        item
      )?.__hmplotAnimate
    )
      throw Error(
        `animate() must be the outermost operator on a channel; it cannot be an argument of ${op}.`,
      );
  return args;
};
/** @param {string} op @returns {(...args: unknown[]) => Expression} */
const make =
  (op) =>
  (...args) =>
    expression(op, guard(op, args));
export const add = make("add"),
  subtract = make("subtract"),
  multiply = make("multiply"),
  divide = make("divide"),
  power = make("power"),
  negative = make("negative");
export const abs = make("abs"),
  square = make("square"),
  sqrt = make("sqrt"),
  log = make("log"),
  exp = make("exp"),
  minimum = make("minimum"),
  maximum = make("maximum"),
  clip = make("clip");
export const sin = make("sin"),
  cos = make("cos"),
  floor = make("floor"),
  round = make("round");
export const equal = make("equal"),
  not_equal = make("not_equal"),
  less = make("less"),
  less_equal = make("less_equal"),
  greater = make("greater"),
  greater_equal = make("greater_equal");
export const logical_and = make("logical_and"),
  logical_or = make("logical_or"),
  logical_not = make("logical_not");
export const where = make("where"),
  is_missing = make("is_missing"),
  is_finite = make("is_finite"),
  coalesce = make("coalesce");
/**
 * One seeded float32 draw per input row, stable for the same seed, distribution and row count.
 * Uniform is [0, 1), normal has mean 0 and variance 1, exponential has mean 1. Seed defaults to
 * 0; use distinct seeds for independent streams. Generate in Calculate before filtering when
 * values should follow the original rows. The seed may be a scalar input, never a table column.
 * @param {{seed?: number | import("../publicTypes.js").Expression, distribution?: "uniform" | "normal" | "exponential"}} [options]
 * @returns {import("../publicTypes.js").Expression}
 */
export function random(options = {}) {
  const checked = randomOptions(options),
    seed = options?.seed === undefined ? 0 : options.seed;
  if (!isExpression(seed)) checkRandomSeed(seed);
  return expression("random", guard("random", [seed, checked]));
}
/** Zero-based position among the current visible rows. Calculate it before filtering to
 * preserve source positions. Hidden physical rows have -1 and are never displayed.
 * @returns {Expression} */
export const row = () => expression("row", []);
/** Row generators cannot use a smaller grid-coordinate or selection-bucket evaluation. */
/** @param {unknown} value @returns {boolean} */
export const expressionNeedsRows = (value) =>
  isExpression(value) &&
  (value.op === "random" ||
    value.op === "row" ||
    value.args.some(expressionNeedsRows));
/**
 * Calendar functions of a datetime column (TODO 53.1; utils/calendar.js), in its time zone
 * unless `{ tz }` names one: year, quarter, month (1 to 12), week (ISO), day, weekday
 * (Monday = 0), day_of_year, hour, minute and second are numbers; month_name and day_name are
 * ordered categories ("Jan" ... "Dec", "Mon" ... "Sun"); time_floor(t, "1 month") is the start
 * of the interval a time is in, a datetime (weeks start on Monday).
 */
/** @param {string} op @returns {(value: unknown, options?: object) => Expression} */
const calendarOp = (op) => (value, options) =>
  expression(op, guard(op, [value, calendarOptions(op, options)]));
export const year = calendarOp("year"),
  quarter = calendarOp("quarter"),
  month = calendarOp("month"),
  week = calendarOp("week");
export const day = calendarOp("day"),
  weekday = calendarOp("weekday"),
  day_of_year = calendarOp("day_of_year");
export const hour = calendarOp("hour"),
  minute = calendarOp("minute"),
  second = calendarOp("second");
export const month_name = calendarOp("month_name"),
  day_name = calendarOp("day_name");
/**
 * Casts (R2.0; utils/casts.js): as_category(x, {domain}), as_ordinal(x, {domain}), as_numeric(x),
 * as_datetime(x, {unit, timezone}) and as_duration(x, {unit}) type one use of a value; the
 * result carries its type to scales, legends, brushes and tooltips.
 */
/** @param {string} op @returns {(value: unknown, options?: object) => Expression} */
const castOp =
  (op) =>
  (value, options = {}) =>
    expression(op, guard(op, [value, castOptions(op, options)]));
export const as_category = castOp("as_category"),
  as_ordinal = castOp("as_ordinal"),
  as_numeric = castOp("as_numeric");
export const as_datetime = castOp("as_datetime"),
  as_duration = castOp("as_duration");
/** @param {unknown} value @param {unknown} interval @param {object} [options] */
export const time_floor = (value, interval, options = {}) =>
  expression(
    "time_floor",
    guard("time_floor", [
      value,
      calendarOptions("time_floor", { ...options, interval }),
    ]),
  );
/** @param {string} op @param {unknown} name @returns {string[]} */
const offsetArgs = (op, name) => {
  // col.weight and ":weight" name the column too (R2.0).
  if (isColumnNode(name)) name = /** @type {Expression} */ (name).args[0];
  else if (typeof name === "string" && name.startsWith(":"))
    name = name.slice(1);
  if (typeof name !== "string" || !name || name.startsWith("@"))
    throw TypeError(
      `${op}() needs the name of a table column, such as ${op}("weight") or ${op}(col.weight).`,
    );
  return [name];
};
/**
 * offset(column): each row's offset in a numeric column, set by dragging or from code (TODO 38;
 * 0 where none). moved(column): the column plus its offset, which is what a view reads to
 * follow drags, as in x={moved("weight")}. The column is the table's, or a facet cell's alias
 * of one; offsets are in its units, so log(moved("weight")) moves through a log.
 */
/** @param {unknown} name @returns {Expression} */
export const offset = (name) =>
  expression("offset", offsetArgs("offset", name));
/** @param {unknown} name @returns {Expression} */
export const moved = (name) => expression("moved", offsetArgs("moved", name));
/** @type {Readonly<Record<string, string>>} */
const OFFSET_SHORTHANDS = Object.freeze({
  "@offset_x": "x",
  "@offset_y": "y",
  "@offset_z": "z",
});
/** The column a position channel names: a column name, col(), moved() or offset(); else null. */
/** @param {unknown} value @returns {string | null} */
function channelColumn(value) {
  if (typeof value === "string")
    return value.startsWith("@")
      ? null
      : value.startsWith(":")
        ? value.slice(1)
        : value;
  if (
    isExpression(value) &&
    ["column", "moved", "offset"].includes(value.op) &&
    typeof value.args[0] === "string"
  )
    return value.args[0].startsWith("@") ? null : value.args[0];
  return null;
}
/**
 * A mark's channels with view.offset_x, offset_y and offset_z ("@offset_x") replaced by offset()
 * of the column its x, y or z channel names (TODO 38): size={abs("@offset_x")} grows the rows
 * dragged furthest.
 * They resolve only where that channel is one column. `props` is changed in place.
 */
/** @param {Record<string, unknown>} props @param {string} [kind] */
export function resolveOffsetShorthands(props, kind = "Mark") {
  /** @param {unknown} value @param {string} channel @returns {unknown} */
  const replace = (value, channel) => {
    /** @param {string} name */
    const shorthand = (name) => {
      const axis = OFFSET_SHORTHANDS[name],
        column = channelColumn(props[axis]);
      if (column === null)
        throw Error(
          `${kind} ${channel}: ${name} reads the offset of the column ${axis} names, but ${axis} is ${props[axis] === undefined ? "not set" : "not one column"}; name the column instead: offset(name).`,
        );
      return offset(column);
    };
    if (typeof value === "string")
      return Object.hasOwn(OFFSET_SHORTHANDS, value) ? shorthand(value) : value;
    if (!isExpression(value)) return value;
    const read = nodeField(value);
    if (read !== null)
      return Object.hasOwn(OFFSET_SHORTHANDS, read) ? shorthand(read) : value;
    const args = value.args.map((item) => replace(item, channel));
    return args.every((item, index) => item === value.args[index])
      ? value
      : expression(value.op, args);
  };
  for (const [channel, value] of Object.entries(props)) {
    const next = replace(value, channel);
    if (next !== value) props[channel] = next;
  }
  return props;
}
/**
 * interval(value, period): the view state `value` reads (@time) as of the last step of `period`
 * milliseconds of the view clock, so the result changes at most once per period: @time reads
 * floor(time / period) * period. Every interval of one period steps on the same frame. Data
 * columns inside still apply at once.
 */
/** @param {unknown} value @param {unknown} period @returns {Expression} */
export function interval(value, period) {
  guard("interval", [value]);
  return expression("interval", [
    value,
    Object.freeze({
      __expressionLiteral: true,
      period: intervalPeriod(period),
    }),
  ]);
}
const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out", "step"];
/** `p` (0 to 1) eased, from existing operations. @param {Expression} p @param {string} easing */
function eased(p, easing) {
  if (easing === "ease-in") return multiply(p, p);
  if (easing === "ease-out")
    return subtract(1, multiply(subtract(1, p), subtract(1, p)));
  if (easing === "ease-in-out")
    return divide(subtract(1, cos(multiply(p, Math.PI))), 2);
  if (easing === "step") return floor(p);
  return p;
}
/**
 * A value that moves through `stops` ({ms: value, ...}) as the view clock (@time) runs (TODO
 * 136.14b): each value at its time, eased between them, the first before the first time and the
 * last after the last, or repeating with `loop`. A value is a number, or an array of numbers (a
 * position), giving an array. `time` takes any expression instead of the clock, so each row can
 * be shifted: opacity={keyframes({0: 0, 400: 1}, {time: subtract(view.time, multiply(row(), 20))})}
 * staggers a reveal. Built from existing expressions (no new operation or state), so it drives
 * any channel, Calculate column or Filter threshold, never blocks settlement and is frozen in
 * exports, as @time is.
 * @param {Record<number | string, number | number[]>} stops
 * @param {{ easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step", loop?: boolean, time?: unknown }} [options]
 * @returns {Expression | Expression[]}
 */
export function keyframes(
  stops,
  { easing = "linear", loop = false, time = undefined } = {},
) {
  const entries = Object.entries(stops ?? {})
    .map(([t, v]) => /** @type {[number, any]} */ ([Number(t), v]))
    .sort((a, b) => a[0] - b[0]);
  if (
    entries.length < 2 ||
    !entries.every(([t]) => Number.isFinite(t)) ||
    entries.some(([t], i) => i > 0 && t === entries[i - 1][0])
  )
    throw Error(
      "keyframes() takes {timeMs: value, ...} with at least two stops at distinct finite times in milliseconds.",
    );
  if (!EASINGS.includes(easing))
    throw Error(
      `keyframes() easing is one of ${EASINGS.join(", ")}; received ${JSON.stringify(easing)}.`,
    );
  const widths = new Set(
    entries.map(([, v]) => (Array.isArray(v) ? v.length : null)),
  );
  if (widths.size !== 1)
    throw Error(
      "keyframes() values are all numbers or all arrays of the same length.",
    );
  const times = entries.map(([t]) => t),
    start = times[0],
    end = times[times.length - 1];
  let clock = time ?? view.time;
  if (loop) {
    const span = end - start;
    clock = add(
      start,
      subtract(
        subtract(clock, start),
        multiply(floor(divide(subtract(clock, start), span)), span),
      ),
    );
  }
  /** @param {number[]} values */
  const component = (values) => {
    /** @type {unknown} */
    let out = values[0];
    for (let i = 0; i + 1 < values.length; i++) {
      if (values[i + 1] === values[i]) continue;
      const p = clip(
        divide(subtract(clock, times[i]), times[i + 1] - times[i]),
        0,
        1,
      );
      out = add(out, multiply(values[i + 1] - values[i], eased(p, easing)));
    }
    return typeof out === "number"
      ? add(out, 0)
      : /** @type {Expression} */ (out);
  };
  const [width] = widths;
  return width === null
    ? component(entries.map(([, v]) => v))
    : Array.from({ length: width }, (_, i) =>
        component(entries.map(([, v]) => v[i])),
      );
}
/** @param {unknown} value @param {Iterable<unknown> | Expression} values @returns {Expression} */
export function is_in(value, values) {
  // An input read (a multiple Select's list, TODO 41) is replaced by its values before evaluation.
  if (isExpression(values)) return expression("is_in", [value, values]);
  return expression("is_in", [
    value,
    Object.freeze({ __expressionLiteralCollection: true, values: [...values] }),
  ]);
}

/**
 * Reductions collapse a column to one value, which broadcasts over the rows when it is
 * assigned or used in arithmetic. `by` names categorical columns and gives each row its own
 * group's value instead (pandas `transform` semantics). Missing and nonfinite values are
 * skipped; an empty input is NaN, except count and sum, which are 0.
 */
/**
 * tween(value, {duration, easing}): the value is interpolated per row, in its own units,
 * wherever the expression is used. Its expression producer owns timing and private state;
 * calculated columns publish current values to ordinary readers.
 */
/** @param {unknown} value @param {object} [options] @returns {Expression} */
export function tween(value, options = {}) {
  guard("tween", [value]);
  return expression("tween", [value, tweenOptions(options)]);
}
/** tween's literal options, checked like animate()'s (JS calls and decoded descriptors). */
/** @param {object | null} options */
function tweenOptions(options) {
  const { duration, easing, ...rest } = /** @type {Record<string, unknown>} */ (
    options ?? {}
  );
  delete rest.__expressionLiteral;
  if ("enter" in rest || "exit" in rest)
    throw Error(
      "tween() has no enter or exit; only animate() gives entering and departing rows a value.",
    );
  const unknown = Object.keys(rest);
  if (unknown.length)
    throw Error(
      `tween() options are duration and easing; received ${unknown.join(", ")}.`,
    );
  checkTiming("tween", { duration, easing });
  /** @type {{__expressionLiteral: true, duration?: unknown, easing?: unknown}} */
  const literal = { __expressionLiteral: true };
  if (duration !== undefined) literal.duration = duration;
  if (easing !== undefined) literal.easing = easing;
  return Object.freeze(literal);
}
/** The tween nodes in an expression, outermost first (empty when there are none). */
/** @param {unknown} value @param {object[]} [output] @returns {object[]} */
export function expressionTweens(value, output = []) {
  if (!isExpression(value)) return output;
  if (value.op === "tween") output.push(value.args[1] ?? {});
  for (const item of value.args) expressionTweens(item, output);
  return output;
}
/** @param {unknown} value */
export const expressionHasTween = (value) => expressionTweens(value).length > 0;

// Operators whose values come from their arguments' values, element by element.
const LITERAL_OPS = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "power",
  "negative",
  "abs",
  "square",
  "sqrt",
  "log",
  "exp",
  "minimum",
  "maximum",
  "clip",
  "sin",
  "cos",
  "floor",
  "round",
  "coalesce",
]);
/**
 * Whether every value `value` can take comes from numeric literals (TODO 62.4):
 * where("@hovered", 2, 1), coalesce and arithmetic of literals, a tween of one. A where's
 * condition may read anything; a column read as a value is data. A channel given such an
 * expression means what its literals mean (a width in pixels, as width={2}), not a scaled value.
 */
/** @param {unknown} value @returns {boolean} */
export function literalValued(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (isLiteral(value))
    return typeof value.value === "number" && Number.isFinite(value.value);
  if (!isExpression(value)) return false;
  if (value.op === "where")
    return literalValued(value.args[1]) && literalValued(value.args[2]);
  if (value.op === "tween") return literalValued(value.args[0]);
  return (
    LITERAL_OPS.has(value.op) &&
    value.args.length > 0 &&
    value.args.every(literalValued)
  );
}
/** Whether an expression reads view state (@time), in or out of an interval(). */
/** @param {unknown} value @returns {boolean} */
export const expressionHasTime = (value) => readsViewState(value);

/** @type {Readonly<Record<string, string>>} */
export const REDUCTIONS = Object.freeze({
  mean: "mean",
  sum: "sum",
  count: "count",
  min: "min",
  max: "max",
  std: "std",
  variance: "variance",
  median: "median",
  quantile: "quantile",
  mode: "mode",
  first: "first",
  last: "last",
  any: "any",
  all: "all",
});
/** Whether an expression reduces rows (mean, count, ...): its values depend on which rows are shown. */
/** @param {unknown} value @returns {boolean} */
export const expressionHasReduction = (value) =>
  isExpression(value) &&
  (Boolean(REDUCTIONS[value.op]) ||
    ORDERED_OPS.has(value.op) ||
    value.op === "lookup" ||
    value.op === "row" ||
    value.args.some((item) => expressionHasReduction(item)));
/** Groups reduced one-hot (reduce.js reduceByCode, chunked over rows: work ~ rows x groups);
 * more are sorted into runs (windows.js reduceRuns: work ~ rows x log2(rows)). */
const ONE_HOT_GROUPS = 64;
/** @template {string} T
 * @param {T} op
 * @returns {(value?: number | boolean | string | import("../publicTypes.js").Expression | import("../publicTypes.js").ReductionOptions, options?: T extends "first" | "last" ? import("../publicTypes.js").OrderedReductionOptions : import("../publicTypes.js").ReductionOptions) => import("../publicTypes.js").Expression}
 * orderBy/order apply only to first/last. Other reducers accept by and where. */
const reduction = (op) => (value, options) => {
  // count({ where: "@brushed" }): count takes no column, so its one argument may be its options.
  if (
    op === "count" &&
    options === undefined &&
    value?.constructor === Object &&
    !isExpression(value)
  ) {
    options = /** @type {any} */ (value);
    value = undefined;
  }
  // Only count means something without a column (the row count); fail here, not at render.
  if ((value === undefined || value === null) && op !== "count")
    throw Error(
      `${op}() needs a column or expression to reduce, such as ${op}("x").`,
    );
  const checked = columnOptions(op, options);
  /** @type {unknown[]} */
  const args = [value === undefined ? null : value];
  if (Object.keys(checked).length > 1 || options?.where !== undefined)
    args.push(checked);
  if (options?.where !== undefined) args.push(options.where);
  return expression(op, guard(op, args));
};
export const mean = reduction("mean"),
  sum = reduction("sum"),
  count = reduction("count");
export const min = reduction("min"),
  max = reduction("max"),
  std = reduction("std");
export const variance = reduction("variance"),
  median = reduction("median"),
  mode = reduction("mode");
export const first = reduction("first"),
  last = reduction("last");
/** The `p` quantile (0 to 1) of a column or expression, interpolated linearly between the two
 * nearest values as numpy's default does: quantile("x", 0.5) is the median (TODO 137.3, which
 * removed the Quantile transform). Takes by and where, as the other reducers do.
 * @param {number | string | import("../publicTypes.js").Expression} value
 * @param {number} p
 * @param {import("../publicTypes.js").ReductionOptions} [options]
 * @returns {import("../publicTypes.js").Expression} */
export const quantile = (value, p, options) =>
  reduction("quantile")(value, /** @type {any} */ ({ ...options, p }));
/** [min, max] of a column or expression over the rows `where` matches: a domain read from the
 * data, x={{ domain: extent("x", { where: "@brushed" }) }} (automatic while no row matches).
 * @param {string | import("../publicTypes.js").Expression} value
 * @param {{ where?: string | import("../publicTypes.js").Expression }} [options]
 * @returns {import("../publicTypes.js").Expression[]} */
export const extent = (value, options = {}) => {
  const where = options?.where;
  options = where === undefined ? undefined : { where };
  return [min(value, options), max(value, options)];
};
/** Logical any/all of finite participating values; empty any=false, empty all=true. */
export const any = reduction("any"),
  all = reduction("all");
/** Inclusive float32 running sum; missing contributes zero. Results keep source row alignment.
 * @param {string | import("../publicTypes.js").Expression} value
 * @param {import("../publicTypes.js").OrderedExpressionOptions} [options]
 * @returns {import("../publicTypes.js").Expression} */
export const cumsum = (value, options = {}) =>
  expression(
    "cumsum",
    guard("cumsum", [value, columnOptions("cumsum", options)]),
  );
/** Previous visible observation in each group; int32 requires an explicit integer fill.
 * @param {string | import("../publicTypes.js").Expression} value
 * @param {import("../publicTypes.js").NeighborExpressionOptions} [options]
 * @returns {import("../publicTypes.js").Expression} */
export const lag = (value, options = {}) =>
  expression("lag", guard("lag", [value, columnOptions("lag", options)]));
/** Next visible observation, without wraparound; distinct from coordinate Shift.
 * @param {string | import("../publicTypes.js").Expression} value
 * @param {import("../publicTypes.js").NeighborExpressionOptions} [options]
 * @returns {import("../publicTypes.js").Expression} */
export const lead = (value, options = {}) =>
  expression("lead", guard("lead", [value, columnOptions("lead", options)]));
/** Rolling reduction with Window's alignments and clipped boundaries, preserving row order.
 * @param {string | import("../publicTypes.js").Expression} value
 * @param {import("../publicTypes.js").WindowExpressionOptions} [options]
 * @returns {import("../publicTypes.js").Expression} */
export const window = (value, options = {}) =>
  expression(
    "window",
    guard("window", [
      value,
      columnOptions("window", options),
      options.size ?? 5,
    ]),
  );

/** Each row's `value` at another row: the row numbered `row` (0-based) of the visible rows in
 * their order, as x[parent] (TODO 138.6). A row number that is missing, not whole or past the
 * last visible row reads `fill` (missing by default; int32 and boolean columns need one).
 * @param {string | import("../publicTypes.js").Expression} value
 * @param {number | string | import("../publicTypes.js").Expression} row
 * @param {{fill?: number | boolean | string | Date | null}} [options]
 * @returns {import("../publicTypes.js").Expression} */
export const lookup = (value, row, options = {}) => {
  if (
    value === undefined ||
    value === null ||
    row === undefined ||
    row === null
  )
    throw Error(
      'lookup() needs a column and a row number, such as lookup("x", "parent").',
    );
  return expression(
    "lookup",
    guard("lookup", [value, row, lookupOptions(options)]),
  );
};

/** Group keys (TODO 137.2): a group per bin or hexagon, not a value per row. */
export const GROUP_KEY_OPS = new Set(["bin", "hexbin"]);
/** @param {unknown} value @param {string} op @param {string} what */
const keyField = (value, op, what) => {
  const name = columnName(value, `${op} ${what}`);
  if (typeof name !== "string" || !name)
    throw Error(`${op}() ${what} must be a column name, such as ${op}("x").`);
  return name;
};
/**
 * A Group key: each row's bin of `field`, as Bin bins it (30 evenly spaced bins over the
 * visible rows' extent, a count, a rule such as "sturges", or explicit edges; a datetime column
 * by the calendar, `interval` and `tz` as Bin's). Group(by=bin("x", 20)) has a row per bin with
 * a row, with x0, x1 and x (the bin's edges and center).
 * @param {string | import("../publicTypes.js").Expression} field
 * @param {number | string | Array<number | Date>} [bins]
 * @param {{interval?: string, tz?: string}} [options]
 * @returns {import("../publicTypes.js").Expression} */
export function bin(field, bins = 30, options = {}) {
  const name = keyField(field, "bin", "field");
  const rules = ["auto", "sturges", "fd", "scott"];
  if (
    !(typeof bins === "number" && Number.isInteger(bins) && bins > 0) &&
    !(typeof bins === "string" && rules.includes(bins)) &&
    !(Array.isArray(bins) && bins.length > 1)
  )
    throw Error(
      `bin() bins must be a positive integer, a rule (${rules.join(", ")}) or explicit edges; got ${JSON.stringify(bins)}.`,
    );
  const unknown = Object.keys(options ?? {}).filter(
    (key) => !["interval", "tz", "__expressionLiteral"].includes(key),
  );
  if (unknown.length)
    throw Error(
      `bin() has no option ${unknown.join(", ")}; use interval or tz.`,
    );
  return expression("bin", [
    name,
    {
      __expressionLiteral: true,
      bins,
      ...(options?.interval !== undefined
        ? { interval: options.interval }
        : {}),
      ...(options?.tz !== undefined ? { tz: options.tz } : {}),
    },
  ]);
}
/**
 * A Group key: each row's hexagon of `x` and `y`, as Hexbin's (a radius, or 30 hexagons across
 * the visible rows' x extent). Group(by=hexbin("x", "y")) has a row per hexagon with a row, with
 * x and y (its center).
 * @param {string | import("../publicTypes.js").Expression} x
 * @param {string | import("../publicTypes.js").Expression} y
 * @param {{radius?: number, bins?: number, orientation?: "pointy" | "flat"}} [options]
 * @returns {import("../publicTypes.js").Expression} */
export function hexbin(x, y, options = {}) {
  const names = [keyField(x, "hexbin", "x"), keyField(y, "hexbin", "y")];
  const { radius, bins, orientation } = options ?? {};
  const unknown = Object.keys(options ?? {}).filter(
    (key) =>
      !["radius", "bins", "orientation", "__expressionLiteral"].includes(key),
  );
  if (unknown.length)
    throw Error(
      `hexbin() has no option ${unknown.join(", ")}; use radius, bins or orientation.`,
    );
  if (radius !== undefined && !(Number.isFinite(radius) && radius > 0))
    throw Error("hexbin() radius must be a positive number.");
  if (bins !== undefined && !(Number.isInteger(bins) && bins > 0))
    throw Error("hexbin() bins must be a positive integer.");
  if (orientation !== undefined && !["pointy", "flat"].includes(orientation))
    throw Error('hexbin() orientation must be "pointy" or "flat".');
  return expression("hexbin", [
    ...names,
    {
      __expressionLiteral: true,
      ...(radius !== undefined ? { radius } : {}),
      ...(bins !== undefined ? { bins } : {}),
      ...(orientation !== undefined ? { orientation } : {}),
    },
  ]);
}

/** Whether `a` holds integers (row(), category codes): numpy's int and uint dtypes. */
const integral = (/** @type {any} */ a) =>
  typeof a?.dtype === "string" && /^u?int/.test(a.dtype);
/** `a` as float32 (an integer array), else `a`. */
const asFloat = (/** @type {any} */ a) =>
  integral(a) ? a.astype(np.float32) : a;
/** @type {Record<string, (a: JaxArray, b: JaxArray) => JaxArray>} */
const BINARY = {
  add: (a, b) => a.add(b),
  subtract: (a, b) => a.sub(b),
  multiply: (a, b) => a.mul(b),
  // True division, as numpy's: integers (row(), codes) divide as floats.
  divide: (a, b) =>
    integral(a) || integral(b) ? asFloat(a).div(asFloat(b)) : a.div(b),
  power: (a, b) => np.power(a, b),
  minimum: (a, b) => np.minimum(a, b),
  maximum: (a, b) => np.maximum(a, b),
  equal: (a, b) => a.equal(b),
  not_equal: (a, b) => a.notEqual(b),
  less: (a, b) => a.less(b),
  less_equal: (a, b) => a.lessEqual(b),
  greater: (a, b) => a.greater(b),
  greater_equal: (a, b) => a.greaterEqual(b),
  logical_and: (a, b) => np.logicalAnd(a, b),
  logical_or: (a, b) => np.logicalOr(a, b),
};
/** @type {Record<string, (a: JaxArray) => JaxArray>} */
const UNARY = {
  negative: (a) => a.mul(-1),
  abs: (a) => np.abs(a),
  square: (a) => np.square(a),
  sqrt: (a) => np.sqrt(a),
  log: (a) => np.log(a),
  exp: (a) => np.exp(a),
  logical_not: (a) => np.logicalNot(a),
  sin: (a) => np.sin(a),
  cos: (a) => np.cos(a),
  // An integer is already whole.
  floor: (a) => (integral(a) ? a : np.floor(a)),
  round: (a) => (integral(a) ? a : np.round(a)),
};

/** @param {unknown} a @param {unknown} b @param {string} op */
function compatibleShapes(a, b, op) {
  const x = shapeOf(a),
    y = shapeOf(b);
  if (x.length && y.length && JSON.stringify(x) !== JSON.stringify(y))
    throw diagnostic(
      "expression.shape_mismatch",
      `${op} requires equal nonscalar shapes; received [${x}] and [${y}].`,
      {
        property: op,
        shape: [x, y],
        suggestion: "Use equal-shaped columns or a scalar operand.",
      },
    );
}

/** The code of a literal category; -2 for one the column lacks (-1 is a missing value's code). */
/** The code of the category `item` names in `value`'s dictionary: a literal, a host number or
 * boolean (compiled plans pass these as literals too), or a view-state value that is a category
 * (`resolved.category`: the pointer over a band axis, TODO 45). */
/** @param {unknown} value @param {unknown} item @param {ResolvedOperand} resolved */
function categoryLiteral(value, item, resolved) {
  const category = isLiteral(item)
    ? item.value
    : typeof item === "number" || typeof item === "boolean"
      ? item
      : resolved?.category;
  if (
    !(/** @type {DictionaryColumn | null | undefined} */ (value)?.categories) ||
    category === undefined
  )
    return null;
  const at = /** @type {DictionaryColumn} */ (value).categories.findIndex(
    (entry) => Object.is(entry, category),
  );
  return at < 0 ? -2 : at;
}

/** A root Data scope keeps string and boolean columns as plain arrays; give them codes. */
/** @param {unknown} value @param {OwnExpressionResource} own @returns {unknown} */
function dictionary(value, own) {
  if (
    /** @type {DictionaryColumn | null | undefined} */ (value)?.categories ||
    !Array.isArray(value) ||
    !value.some((item) => typeof item === "string" || typeof item === "boolean")
  )
    return value;
  const categories = [...new Set(value)].filter(isCategory);
  const index = new Map(categories.map((item, at) => [item, at]));
  return {
    codes: own(
      np.array(
        value.map((item) => index.get(item) ?? -1),
        { dtype: np.int32 },
      ),
    ),
    categories,
  };
}

/** Per-row group ids for `by`, and the number of groups. Categorical keys only: the count
 * has to be known without reading anything back, and expressions evaluate synchronously. */
/** @param {ExpressionScope | null | undefined} scope @param {string | string[]} by
 * @param {OwnExpressionResource} own @param {(field: unknown) => never} fail
 * @returns {{codes: JaxArray, groups: number}} */
function groupCodes(scope, by, own, fail) {
  const fields = Array.isArray(by) ? by : [by];
  let codes = null,
    groups = 1;
  for (const field of fields) {
    if (typeof field !== "string" || !scope?.has?.(field)) fail(field);
    const source = scope.get(field);
    // Plain numbers are values, not keys: a numeric group count cannot be known without a
    // readback, and expressions evaluate synchronously.
    /** @type {readonly unknown[] | null} */
    const categories =
      /** @type {DictionaryColumn} */ (source)?.categories ??
      (Array.isArray(source) &&
      source.some(
        (item) => typeof item === "string" || typeof item === "boolean",
      )
        ? [...new Set(source)].filter(isCategory)
        : null);
    if (!categories)
      throw diagnostic(
        "expression.reduction_by",
        `Reduction by ${JSON.stringify(field)} needs a categorical column.`,
        {
          property: "by",
          field,
          suggestion:
            "Group by a category column, or use a Group transform for numeric keys.",
        },
      );
    const index = new Map(categories.map((value, at) => [value, at]));
    const raw = own(
      /** @type {DictionaryColumn} */ (source).codes
        ? asArray(/** @type {DictionaryColumn} */ (source).codes).astype(
            np.int32,
          )
        : np.array(
            /** @type {readonly unknown[]} */ (source).map(
              (value) => index.get(value) ?? -1,
            ),
            { dtype: np.int32 },
          ),
    );
    const inRange = own(
      np.logicalAnd(raw.ref.greaterEqual(0), raw.ref.less(categories.length)),
    );
    const safe = own(np.where(inRange.ref, raw.ref, -1).astype(np.int32));
    codes =
      codes === null
        ? safe
        : own(
            np
              .where(
                np.logicalAnd(
                  /** @type {JaxArray} */ (codes).ref.greaterEqual(0),
                  safe.ref.greaterEqual(0),
                ),
                /** @type {JaxArray} */ (codes).ref
                  .mul(categories.length)
                  .add(safe.ref),
                -1,
              )
              .astype(np.int32),
          );
    groups *= categories.length;
    // Codes are int32: the keys' combinations have to fit.
    if (groups > 2 ** 31 - 1)
      throw diagnostic(
        "expression.reduction_by",
        `Calculate: a reduction by ${fields.join(", ")} has more key combinations than an int32 code holds.`,
        {
          property: "by",
          field: fields.join(", "),
          suggestion:
            "Group by fewer columns, or by a Calculate column that combines them.",
        },
      );
  }
  // columnOptions has already rejected empty by lists; every accepted field creates codes.
  return { codes: /** @type {JaxArray} */ (codes), groups };
}

/**
 * `viewState` (utils/viewState.js) is what "@time" reads; `time` is shorthand for
 * viewState({time}). Every subtree that reads view state and no data (`@time`,
 * `floor(@time / 1000)`) is computed on the host and reaches kernels as one buffer, so its
 * value and a consumer's change key (viewStateKey) agree, and no value compiles a kernel.
 * Without a view state, reading @time is an error rather than a silent 0.
 *
 * `tween(node, inner, own)` gives a tween node its value from the resolved inner one (tween
 * state, utils/tweenState.js; without it a tween starts at its initial value). Ordinary
 * columns already hold the producer's current values; consumers never sample private state.
 *
 * `reductionCache` (a Map, one per data revision of the caller) keeps the result of each
 * reduction that reads no "@" column, so an @time channel re-evaluated every frame reduces
 * its data once, not per frame. Without a separate constantCache, this same map also owns
 * seeded random arrays under string keys. Cached arrays own one reference; evaluations
 * acquire their own references. Release the map with releaseReductionCache when its owner
 * retires it; a released map must never be repopulated.
 */
/** One consumer entry point; the supplied owner retains programs, never evaluated values. */
/** @param {unknown} root @param {ExpressionScope | null | undefined} scope
 * @param {import("./expressionPlanTypes.js").EagerEvaluationOptions} [options]
 * @returns {import("./expressionPlanTypes.js").ExpressionResult} */
export function evaluateExpression(root, scope, options = {}) {
  return options.evaluator
    ? options.evaluator.evaluate(
        root,
        /** @type {ExpressionScope} */ (scope),
        options,
      )
    : evaluateExpressionEager(root, scope, options);
}

/** Reference semantics, also used to trace shared programs and host-managed boundaries.
 * @param {unknown} root
 * @param {import('./expressionPlanTypes.js').ExpressionScope | null | undefined} scope
 * @param {import('./expressionPlanTypes.js').EagerEvaluationOptions} [options]
 * @returns {import('./expressionPlanTypes.js').ExpressionResult}
 */
export function evaluateExpressionEager(
  root,
  scope,
  {
    rowCount = scope?.length,
    broadcast = true,
    time,
    viewState,
    reductionCache: cache,
    constantCache,
    constantUsed,
    tween: tweenHook,
    scalarProvider,
    expressionProvider,
  } = {},
) {
  // Evaluation lifetime: leases and intermediates belong to this call. Memoized operands
  // borrow them; provider results keep their own dispose() and cached values keep their owner.
  /** @type {{dispose(): void}[]} */
  const owned = [];
  /** @type {import("./expressionPlanTypes.js").ExpressionResult[]} */
  const prepared = [];
  const state =
    viewState ?? (time === undefined ? undefined : makeViewState({ time }));
  const reductionCache = cache?.released ? undefined : cache;
  const constants = constantCache?.released
    ? undefined
    : (constantCache ?? reductionCache);
  /** @type {OwnExpressionResource} */
  const own = (value) => (owned.push(value), value);
  // Host numbers reach kernels from a buffer, never as literals (TODO 17.1): a new threshold or
  // constant would otherwise compile new kernels. The dtype is the one a JS number takes next
  // to `other` (an integer beside an int32 column stays int32).
  /** @param {number | boolean} value @param {JaxArray} [other] @param {number} [slot] */
  const hostScalar = (value, other, slot) => {
    const number = Number(value);
    const dtype =
      other?.dtype === "int32" && Number.isInteger(number)
        ? "int32"
        : "float32";
    return own(
      scalarProvider
        ? scalarProvider(value, dtype, slot)
        : deviceScalar(number, { dtype }),
    );
  };
  /** Whether a constant subtree holds text (and no Date, whose origin needs resolution). */
  const textConstants = (/** @type {unknown} */ node) => {
    let text = false;
    const visit = (/** @type {any} */ n) => {
      if (n instanceof Date) return false;
      if (isExpression(n)) return n.args.every(visit);
      if (typeof (isLiteral(n) ? n.value : n) === "string") text = true;
      return true;
    };
    return visit(node) && text;
  };
  /** @param {unknown} value @returns {value is number | boolean} */
  const host = (value) =>
    typeof value === "number" || typeof value === "boolean";
  /** @param {unknown} value @param {number} [slot] @returns {JaxArray} */
  const materialize = (value, slot) =>
    scalarProvider && host(value)
      ? scalarProvider(
          value,
          typeof value === "boolean" ? "bool" : "float32",
          slot,
        )
      : asArray(value);
  // A padded view's physical scope (utils/dataView.js, TODO 17.3): its hidden rows take part in
  // row-wise arithmetic (their values are never shown) but in no reduction.
  const shownRows = scope?.physical ? scope.valid : null;
  let nodes = 0;
  /** @param {unknown} name @returns {never} */
  const failField = (name) => {
    // "@focus" is an Interaction's column (names.js): say so, with the state names.
    if (isInteractionColumn(name))
      throw unknownAtName(name, "Expression", scope?.interactionColumns?.());
    const help = fieldHelp(scope, name);
    throw diagnostic(
      "expression.missing_field",
      // A string inside an expression names a column; agents compare with text this way
      // (input != "Portfolio", 2026-10-23), so the message says how to write the text itself.
      `Expression references missing field ${JSON.stringify(name)}. ${help.suggestion.startsWith("Did you mean") ? help.suggestion + " " : ""}` +
        `A string inside an expression names a column; for the text itself write literal(${JSON.stringify(name)}) (Python hm.literal(...)).`,
      {
        property: "expression",
        scope: scope?.identity?.id,
        field: name,
        suggestion: help.suggestion,
        details: { available: help.available },
      },
    );
  };
  // Resolution: one memo per sampled view state. Host-only subtrees, borrowed columns and
  // producer-managed operations resolve before the ordinary numerical operation families.
  // What view state reads within an interval() is that state as of the interval's last step;
  // each context has its own memo.
  /** @type {ResolutionContext} */
  const top = { state, memo: new Map() };
  // A resolved operand as a categorical column when it is one: a dictionary column, or a node
  // that returned categories (month_name, a reduction's mode).
  /** @param {ResolvedOperand} arg @returns {unknown} */
  const categorized = (arg) =>
    arg.categories
      ? { codes: arg.value, categories: arg.categories }
      : dictionary(arg.value, own);
  /** @param {ColumnMetadata | null | undefined} metadata
   * @returns {metadata is ColumnMetadata & {type: "datetime", origin: number}} */
  const isTime = (metadata) =>
    metadata?.type === "datetime" && Number.isFinite(metadata.origin);
  /** @param {unknown} node @param {number} [depth] @param {ResolutionContext} [context]
   * @returns {ResolvedOperand} */
  const resolve = (node, depth = 0, context = top) => {
    if (depth > MAX_DEPTH) throw limitError("expressionDepth");
    if (isExpression(node)) {
      const memo = context.memo;
      if (memo.has(node))
        return /** @type {ResolvedOperand} */ (memo.get(node));
      if (++nodes > MAX_NODES) throw limitError("expressionOperations");
      const cached = reductionCache?.get(node);
      if (cached) {
        memo.set(node, cached);
        return cached;
      }
      // Host-managed operations keep their own lifecycle; numeric children can still execute
      // reusable programs. The provider cannot intercept this evaluation's root recursively.
      if (node !== root && expressionProvider) {
        const value = expressionProvider(node, context.state);
        if (value) {
          prepared.push(value);
          memo.set(node, value);
          return value;
        }
      }
      // A comparison of constants that are not all numbers (an input's text value against
      // literal(""), 2026-10-22) is computed on the host: text has no device form, and it
      // crashed building one ("Invalid type for full").
      if (isConstantSubtree(node) && textConstants(node)) {
        const host = hostValue(node, makeViewState({}));
        if (typeof host === "number" || typeof host === "boolean") {
          /** @type {ResolvedOperand} */
          const result = {
            value: broadcast ? own(deviceScalar(Number(host))) : Number(host),
            metadata: {
              type: typeof host === "boolean" ? "boolean" : "numeric",
            },
          };
          memo.set(node, result);
          return result;
        }
        // A constant choice of text (where(input == "revenue", "$ thousand", "orders")) is that
        // text, as literal("...") is.
        if (typeof host === "string") {
          /** @type {ResolvedOperand} */
          const result = { value: host, literal: true };
          memo.set(node, result);
          return result;
        }
      }
      if (isViewStateSubtree(node)) {
        if (!context.state)
          throw diagnostic(
            "expression.time",
            "@time and @pointer_* are not available here: this expression is evaluated without a view.",
            {
              property: "expression",
              field: "@time",
              suggestion:
                "Read view state in a mark channel, a Filter condition, a Calculate column or a transform parameter.",
            },
          );
        // One value for every row, computed on the host: a rank-0 array from a buffer that
        // broadcasts like a literal and compiles nothing new as the clock moves. A category (the
        // pointer over a band axis) compares with a categorical column by its code.
        const host = hostValue(node, context.state),
          category = typeof host === "string" ? host : undefined;
        const number = category === undefined ? Number(host) : NaN;
        /** @type {ResolvedOperand} */
        const result = {
          value: broadcast ? own(deviceScalar(number)) : number,
          metadata: { type: "numeric" },
          category,
          source: nodeField(node) ?? undefined,
        };
        memo.set(node, result);
        return result;
      }
      if (node.op === "interval") {
        const period = intervalPeriod(node.args[1]);
        const inner = resolve(node.args[0], depth + 1, {
          state: context.state?.at(period),
          memo: new Map(),
        });
        memo.set(node, inner);
        return inner;
      }
      // State is read as its field of the scope or the view ("@brushed").
      if (node.op === "state") {
        const result = resolve(
          field(stateField(node.args[0])),
          depth + 1,
          context,
        );
        memo.set(node, result);
        return result;
      }
      if (node.op === "input")
        throw Error(
          `$${node.args[0]} reads an input, but there is no input context around it (an InputContext, or a Python Scene).`,
        );
      if (node.op === "row") {
        if (
          !Number.isInteger(rowCount) ||
          rowCount === undefined ||
          rowCount < 0
        )
          throw Error(
            "row() needs a table; pass Data(rows=N) or a table above the expression.",
          );
        const value = shownRows
          ? np
              .where(
                shownRows.ref.greater(0),
                np.cumsum(shownRows.ref.greater(0).astype(np.int32)).sub(1),
                -1,
              )
              .astype(np.int32)
          : np.arange(rowCount);
        own(value);
        const result = {
          value,
          metadata: { type: /** @type {const} */ ("numeric") },
        };
        memo.set(node, result);
        return result;
      }
      if (node.op === "random") {
        const result = randomValues(
          node.args[0],
          node.args[1],
          rowCount,
          constants,
          constantUsed,
        );
        own(result.value);
        memo.set(node, result);
        return result;
      }
      if (node.op === "column") {
        const name = node.args[0];
        if (typeof name !== "string" || !scope?.has?.(name)) failField(name);
        // The result can hold the column itself, past this evaluation and its scope's revision.
        const read = acquireColumn(scope, name),
          value = read.value;
        own({ dispose: read.release });
        const result = {
          value,
          metadata:
            scope.metadata?.(name) ??
            /** @type {{metadata?: ColumnMetadata} | null | undefined} */ (
              value
            )?.metadata,
          source: name,
        };
        memo.set(node, result);
        return result;
      }
      if (node.op === "offset" || node.op === "moved") {
        const name = node.args[0];
        if (typeof name !== "string" || !scope?.has?.(name)) failField(name);
        const column =
            node.op === "moved" ? resolve(name, depth + 1, context) : null,
          values = column?.value;
        if (
          /** @type {DictionaryColumn | null | undefined} */ (values)
            ?.categories ||
          (Array.isArray(values) &&
            values.some(
              (item) => typeof item === "string" || typeof item === "boolean",
            ))
        )
          throw Error(
            `moved(${JSON.stringify(name)}): ${name} is categorical; offsets move numeric columns.`,
          );
        const read = acquireColumn(scope, offsetField(name)),
          deltas = read.value;
        own({ dispose: read.release });
        /** @type {ResolvedOperand} */
        let result = { value: deltas, metadata: { type: "numeric" } };
        if (column) {
          const a = isDeviceArray(values) ? values : own(materialize(values));
          result = {
            value: own(
              a.ref
                .astype(np.float32)
                .add(/** @type {JaxArray} */ (deltas).ref),
            ),
            metadata: column.metadata ?? { type: "numeric" },
            source: name,
          };
        }
        memo.set(node, result);
        return result;
      }
      if (node.op === "tween") {
        // An expression owner supplies its producer; a standalone evaluation is initial values.
        const inner = tweenHook?.target
          ? tweenHook.target(node, () =>
              resolve(node.args[0], depth + 1, context),
            )
          : resolve(node.args[0], depth + 1, context);
        const result = tweenHook ? tweenHook(node, inner, own) : inner;
        memo.set(node, result);
        return result;
      }
      if (CAST_OPS.includes(node.op)) {
        const source = resolve(node.args[0], depth + 1, context);
        const result = castValue(node.op, source, node.args[1] ?? {}, {
          own,
          dictionary: (/** @type {unknown} */ value) => dictionary(value, own),
        });
        memo.set(node, result);
        return result;
      }
      if (CALENDAR_OPS.includes(node.op)) {
        const source = resolve(node.args[0], depth + 1, context);
        // A model calendar's times (numbers of days since its reference date, TODO 53.6).
        if (
          MODEL_CALENDARS.includes(
            /** @type {string} */ (source.metadata?.calendar),
          )
        ) {
          const values = isDeviceArray(source.value)
            ? source.value
            : own(materialize(source.value));
          const result = modelCalendarValue(
            node.op,
            values,
            source.metadata,
            node.args[1] ?? {},
            own,
            CALENDAR_NAMES,
          );
          memo.set(node, result);
          return result;
        }
        if (!isTime(source.metadata))
          throw diagnostic(
            "expression.calendar",
            `${node.op}() reads a datetime column; ${typeof node.args[0] === "string" ? JSON.stringify(node.args[0]) : "its argument"} is ${source.metadata?.type ?? "not one"}.`,
            {
              property: node.op,
              suggestion:
                "Give it a column of dates or times (a datetime schema, Dates, or a datetime64 column).",
            },
          );
        const values = isDeviceArray(source.value)
          ? source.value
          : own(materialize(source.value));
        const result = calendarValue(
          node.op,
          values,
          source.metadata,
          node.args[1] ?? {},
          own,
        );
        memo.set(node, result);
        return result;
      }
      // Numerical execution: children resolve in the same context. Each operation registers
      // its intermediates with own(); only an eligible reduction transfers its result to cache.
      const args = node.args.map((item) => resolve(item, depth + 1, context));
      /** @type {JaxArray} */
      let result;
      /** @type {ColumnMetadata | null | undefined} */
      let keep = null;
      if (BINARY[node.op]) {
        // Times meet on one origin: the first operand's that is not a constant (a Date's), and
        // a time plus or minus a number, or the smaller or larger of two, stays a time.
        const [ta, tb] = [args[0].metadata, args[1].metadata];
        if (isTime(ta) && isTime(tb) && ta.origin !== tb.origin) {
          const into = args[0].literal && !args[1].literal ? 1 : 0,
            from = 1 - into;
          const shift =
              /** @type {ColumnMetadata & {origin: number}} */ (
                args[from].metadata
              ).origin -
              /** @type {ColumnMetadata & {origin: number}} */ (
                args[into].metadata
              ).origin,
            moving = args[from];
          args[from] = {
            ...moving,
            metadata: args[into].metadata,
            value: host(moving.value)
              ? Number(moving.value) + shift
              : own(
                  (isDeviceArray(moving.value)
                    ? moving.value
                    : own(materialize(moving.value))
                  ).ref
                    .astype(np.float32)
                    .add(deviceScalar(shift)),
                ),
          };
        }
        const [a0, b0] = [isTime(args[0].metadata), isTime(args[1].metadata)];
        if (
          (node.op === "add" && a0 !== b0) ||
          (node.op === "subtract" && a0 && !b0) ||
          (["minimum", "maximum"].includes(node.op) && a0 && b0)
        )
          keep = a0 ? args[0].metadata : args[1].metadata;
        const left = categorized(args[0]),
          right = categorized(args[1]);
        compatibleShapes(
          /** @type {DictionaryColumn | null | undefined} */ (left)?.codes ??
            left,
          /** @type {DictionaryColumn | null | undefined} */ (right)?.codes ??
            right,
          node.op,
        );
        const leftCategory = categoryLiteral(left, node.args[1], args[1]);
        const rightCategory = categoryLiteral(right, node.args[0], args[0]);
        const av =
          leftCategory !== null
            ? own(materialize(/** @type {DictionaryColumn} */ (left).codes))
            : rightCategory !== null
              ? rightCategory
              : /** @type {unknown} */ (
                  /** @type {DictionaryColumn | null | undefined} */ (left)
                    ?.codes ?? left
                );
        const bv =
          leftCategory !== null
            ? leftCategory
            : rightCategory !== null
              ? own(materialize(/** @type {DictionaryColumn} */ (right).codes))
              : /** @type {unknown} */ (
                  /** @type {DictionaryColumn | null | undefined} */ (right)
                    ?.codes ?? right
                );
        // The left operand carries the method call, so a host scalar there becomes an array
        // (float32, as before); one on the right takes the left operand's integer dtype.
        const a = isDeviceArray(av)
          ? av
          : host(av)
            ? hostScalar(
                av,
                undefined,
                rightCategory === null ? args[0].scalarSlot : undefined,
              )
            : own(materialize(av));
        const b = isDeviceArray(bv)
          ? bv
          : host(bv)
            ? hostScalar(
                bv,
                a,
                leftCategory === null ? args[1].scalarSlot : undefined,
              )
            : own(materialize(bv));
        result = own(BINARY[node.op](a.ref, b.ref));
      } else if (UNARY[node.op]) {
        const input =
          /** @type {DictionaryColumn | null | undefined} */ (args[0].value)
            ?.codes ?? args[0].value;
        const a = isDeviceArray(input)
          ? input
          : own(materialize(input, args[0].scalarSlot));
        result = own(UNARY[node.op](a.ref));
      } else if (node.op === "clip") {
        const a = isDeviceArray(args[0].value)
          ? args[0].value
          : own(materialize(args[0].value, args[0].scalarSlot));
        /** @param {ResolvedOperand} arg */
        const bound = (arg) =>
          host(arg.value)
            ? hostScalar(arg.value, a, arg.scalarSlot).ref
            : /** @type {unknown} */ (
                /** @type {JaxArray | null | undefined} */ (arg.value)?.ref ??
                  arg.value
              );
        result = own(np.clip(a.ref, bound(args[1]), bound(args[2])));
      } else if (node.op === "where") {
        // A choice between text constants is a category per row (2026-10-22: where(hovered,
        // literal("#111827"), literal("#fff")) with a categorical scale, or a label), codes into
        // the two values, as a text column is.
        // A branch is text, or a category per row already (a nested where() of text).
        const textual = (/** @type {ResolvedOperand} */ arg) =>
          typeof arg.value === "string" || !!arg.categories;
        if (textual(args[1]) || textual(args[2])) {
          const odd = [args[1], args[2]].find((arg) => !textual(arg));
          if (odd)
            throw diagnostic(
              "expression.text-value",
              `where(): one branch is text and the other is a number (${JSON.stringify(shapeOf(odd.value).length ? "a column" : odd.value)}); ` +
                "both branches give text (categories) or both give numbers.",
              { property: "expression" },
            );
          const categories = [
            ...new Set(
              [args[1], args[2]].flatMap(
                (arg) => arg.categories ?? [arg.value],
              ),
            ),
          ];
          // Each branch as codes into the merged categories: a constant's one code, or a nested
          // result's codes mapped through its own categories.
          const codes = (/** @type {ResolvedOperand} */ arg) => {
            if (!arg.categories) return categories.indexOf(arg.value);
            const map = own(
              deviceArray(
                arg.categories.map((value) => categories.indexOf(value)),
                { dtype: np.int32 },
              ),
            );
            const own_codes =
              /** @type {any} */ (arg.value)?.codes ?? arg.value;
            return own(
              np.take(
                map.ref,
                own(np.maximum(own_codes.ref.astype(np.int32), 0)).ref,
                0,
              ),
            );
          };
          const test = isDeviceArray(args[0].value)
            ? args[0].value
            : own(materialize(args[0].value, args[0].scalarSlot));
          const pick = (/** @type {any} */ code) =>
            typeof code === "number" ? code : code.ref;
          const value = /** @type {ResolvedOperand} */ (
            /** @type {unknown} */ ({
              value: own(
                np
                  .where(
                    test.ref.notEqual(0),
                    pick(codes(args[1])),
                    pick(codes(args[2])),
                  )
                  .astype(np.int32),
              ),
              categories,
              metadata: { type: "categorical", domain: categories },
            })
          );
          memo.set(node, value);
          return /** @type {ResolvedOperand} */ (value);
        }
        compatibleShapes(args[1].value, args[2].value, node.op);
        const condition = isDeviceArray(args[0].value)
          ? args[0].value
          : own(materialize(args[0].value, args[0].scalarSlot));
        /** @param {ResolvedOperand} arg @param {ResolvedOperand} other */
        const branch = (arg, other) =>
          host(arg.value)
            ? hostScalar(
                arg.value,
                isDeviceArray(other.value) ? other.value : undefined,
                arg.scalarSlot,
              ).ref
            : /** @type {unknown} */ (
                /** @type {JaxArray | null | undefined} */ (arg.value)?.ref ??
                  arg.value
              );
        result = own(
          np.where(
            condition.ref.notEqual(0),
            branch(args[1], args[2]),
            branch(args[2], args[1]),
          ),
        );
      } else if (node.op === "is_missing" || node.op === "is_finite") {
        const source = categorized(args[0]),
          input =
            /** @type {DictionaryColumn | null | undefined} */ (source)
              ?.codes ?? source;
        // A text or boolean constant (an input's value, "OAK") is a value on every row: never
        // missing, and not a number to test. It has no array to materialize.
        if (typeof input === "string" || typeof input === "boolean")
          result = own(
            materialize(node.op === "is_finite", args[0].scalarSlot),
          );
        else {
          const a = isDeviceArray(input)
            ? input
            : own(materialize(input, args[0].scalarSlot));
          const valid = /** @type {DictionaryColumn | null | undefined} */ (
            source
          )?.categories
            ? a.ref.greaterEqual(0)
            : np.isfinite(a.ref);
          result = own(node.op === "is_missing" ? np.logicalNot(valid) : valid);
        }
      } else if (node.op === "coalesce") {
        const a0 = args[0].value,
          a = isDeviceArray(a0) ? a0 : own(materialize(a0, args[0].scalarSlot));
        const fallback = args[1].value;
        result = own(
          np.where(
            np.isfinite(a.ref),
            a.ref,
            host(fallback)
              ? hostScalar(fallback, a, args[1].scalarSlot).ref
              : /** @type {unknown} */ (
                  /** @type {JaxArray | null | undefined} */ (fallback)?.ref ??
                    fallback
                ),
          ),
        );
      } else if (node.op === "with_component") {
        // Internal (ErrorBars' template, TODO 130.3): a column of positions (N x 2 or N x 3)
        // with component `index` replaced by a value per row, or one for every row.
        const vector = isDeviceArray(args[0].value)
          ? args[0].value
          : own(materialize(args[0].value));
        const [n, width] = vector.shape,
          index = Number(node.args[1]);
        if (vector.shape.length !== 2 || (width !== 2 && width !== 3))
          throw Error(
            "ErrorBars.position must be an N×2 or N×3 array of points.",
          );
        const replacement = host(args[2].value)
          ? np.full([n], Number(args[2].value), { dtype: np.float32 })
          : np.broadcastTo(
              (isDeviceArray(args[2].value)
                ? args[2].value
                : own(materialize(args[2].value))
              ).ref.astype(np.float32),
              [n],
            );
        const columns = [];
        for (let i = 0; i < width; i++)
          columns.push(
            i === index
              ? replacement
              : vector.ref.slice([], i).astype(np.float32),
          );
        result = own(np.stack(columns, 1));
      } else if (node.op === "is_in") {
        const source = categorized(args[0]),
          values = node.args[1]?.values ?? node.args[1]?.$expression_literals;
        if (!Array.isArray(values))
          throw Error("is_in requires an explicit literal collection.");
        const input =
            /** @type {DictionaryColumn | null | undefined} */ (source)
              ?.codes ?? source,
          a = isDeviceArray(input) ? input : own(materialize(input));
        // An unknown category is -2, which no row has (-1 is a missing value's code).
        const requested = /** @type {DictionaryColumn | null | undefined} */ (
          source
        )?.categories
          ? values.map((v) => {
              const at = /** @type {DictionaryColumn} */ (
                source
              ).categories.findIndex((x) => Object.is(x, v));
              return at < 0 ? -2 : at;
            })
          : values;
        // The requested values come from a buffer, so another set of the same size reuses the kernel.
        const integer =
          a.dtype === "int32" && requested.every(Number.isInteger);
        const requestedArray = own(
          deviceArray(requested, { dtype: integer ? "int32" : "float32" }),
        );
        result = own(
          requested.length
            ? np.isin(a.ref, requestedArray.ref)
            : np.zeros(a.shape, { dtype: np.bool }),
        );
      } else if (ORDERED_OPS.has(node.op)) {
        const options = node.args[1] ?? columnOptions(node.op);
        const groups = options.by
          ? groupCodes(scope, options.by, own, failField)
          : null;
        const shown = shownRows ? own(shownRows.ref.greater(0)) : null;
        const rows = orderedRows(scope, options, groups, shown, own, {
          operation: node.op,
          // A visible prefix is already in window order. Keep its boundary on the device;
          // compiling the expression must not add sorting or a host count readback.
          prefixCount:
            node.op === "window" &&
            !groups &&
            !options.orderBy &&
            scope?.prefix &&
            shownRows
              ? own(np.sum(shownRows.ref))
              : undefined,
        });
        let source = args[0];
        const encoded = categorized(source);
        if (
          /** @type {DictionaryColumn | null | undefined} */ (encoded)
            ?.categories
        )
          source = { ...source, value: encoded };
        const reduced = orderedColumn(
          node.op,
          source,
          scope,
          options,
          args[2]?.value,
          rows,
          own,
        );
        memo.set(node, reduced);
        return reduced;
      } else if (node.op === "lookup") {
        const shown = shownRows ? own(shownRows.ref.greater(0)) : null;
        let source = args[0];
        const encoded = categorized(source);
        if (
          /** @type {DictionaryColumn | null | undefined} */ (encoded)
            ?.categories
        )
          source = { ...source, value: encoded };
        const options = node.args[2] ?? lookupOptions();
        const looked = lookupColumn(
          source,
          args[1],
          scope,
          shown,
          options.fill,
          own,
        );
        memo.set(node, looked);
        return looked;
      } else if (REDUCTIONS[node.op]) {
        const source = args[0]?.value;
        let categories =
            /** @type {DictionaryColumn | null | undefined} */ (source)
              ?.categories ?? null,
          input =
            /** @type {DictionaryColumn | null | undefined} */ (source)
              ?.codes ?? source;
        // A text constant (a constant choice of text, 2026-10-22) is one category on every row.
        if (typeof source === "string" && rowCount !== undefined) {
          categories = [source];
          input = own(np.zeros([rowCount], { dtype: np.int32 }));
        }
        // A root Data scope keeps string columns as plain arrays; encode them here so the
        // reduction runs on the GPU like any other column.
        if (
          !categories &&
          Array.isArray(source) &&
          source.some(
            (item) => typeof item === "string" || typeof item === "boolean",
          )
        ) {
          categories = [...new Set(source)].filter(isCategory);
          const index = new Map(categories.map((item, at) => [item, at]));
          input = own(
            np.array(
              source.map((item) => index.get(item) ?? -1),
              { dtype: np.int32 },
            ),
          );
        }
        let values = null;
        if (input !== null && input !== undefined) {
          const array = isDeviceArray(input)
            ? input
            : own(materialize(input, args[0]?.scalarSlot));
          // Categorical codes are finite, so missing values have to become NaN to be skipped.
          values =
            node.op === "any" || node.op === "all"
              ? booleanValues(
                  {
                    ...args[0],
                    value: categories ? { codes: array, categories } : array,
                  },
                  own,
                  node.op,
                )
              : own(
                  categories
                    ? np.where(
                        array.ref.greaterEqual(0),
                        array.ref.astype(np.float32),
                        np.nan,
                      )
                    : array.ref.astype(np.float32),
                );
        } else if (node.op !== "count")
          throw Error(`${node.op} needs a column or expression to reduce.`);
        const rows = values?.shape[0] ?? scope?.length ?? 0;
        const options =
          node.args.find((item) => item?.__expressionLiteral) ?? {};
        const by = options.by;
        let shown =
          shownRows?.shape[0] === rows
            ? own(/** @type {JaxArray} */ (shownRows).ref.greater(0))
            : null;
        if (args[2]) {
          const predicateSource =
            args[2].scalarSlot === undefined
              ? args[2]
              : {
                  ...args[2],
                  value: own(materialize(args[2].value, args[2].scalarSlot)),
                };
          const predicate = booleanValues(
            predicateSource,
            own,
            `${node.op} where`,
          );
          if (
            predicate.shape.length &&
            (predicate.shape.length !== 1 || predicate.shape[0] !== rows)
          )
            throw Error(
              `${node.op} where must give a boolean or numeric value per row.`,
            );
          const eligible = own(
            np.logicalAnd(
              np.isfinite(predicate.ref),
              predicate.ref.notEqual(0),
            ),
          );
          shown = shown
            ? own(np.logicalAnd(shown.ref, eligible.ref))
            : predicate.shape.length
              ? eligible
              : own(
                  np.logicalAnd(
                    np.ones([rows], { dtype: np.bool }),
                    eligible.ref,
                  ),
                );
        }
        const order = options.orderBy
          ? own(
              sortOrder(
                scope,
                [options.orderBy].flat(),
                options.order ?? "asc",
                rows,
              ),
            )
          : null;
        if (order) {
          if (/** @type {ExpressionScope} */ (scope).grid)
            throw Error(
              `${node.op} orderBy requires a one-dimensional table; ordered grids are unsupported.`,
            );
          values = own(np.take(values.ref, order.ref, 0));
          if (shown) shown = own(np.take(shown.ref, order.ref, 0));
        }
        const byFields = by === undefined ? [] : Array.isArray(by) ? by : [by];
        // By dimensions of a grid table (TODO 51): reshaped and reduced over the others.
        const grid = scope?.grid;
        if (
          by &&
          values &&
          grid &&
          grid.size === rows &&
          GRID_REDUCTIONS.has(REDUCTIONS[node.op]) &&
          byFields.every(
            (field) =>
              grid.dims.some((dim) => dim.name === field) &&
              !(grid.coords2d && Object.hasOwn(grid.coords2d.columns, field)),
          )
        ) {
          const mask = shown ? shown.ref : np.ones([rows], { dtype: np.bool });
          result = own(
            gridReduction(
              grid,
              byFields,
              values.ref,
              mask,
              REDUCTIONS[node.op],
            ),
          );
        } else if (!by) {
          const mask = shown ?? own(np.ones([rows], { dtype: np.bool }));
          result = own(
            reduceValues(mask, values, REDUCTIONS[node.op], options.p),
          );
        } else {
          const grouped = groupCodes(scope, by, own, failField);
          const codes = order
            ? own(np.take(grouped.codes.ref, order.ref, 0))
            : grouped.codes;
          // Every group at once (TODO 137.2), so no limit on the number of groups: one-hot
          // for a few groups, else runs of equal codes. A hidden row adds nothing to its group.
          const op = REDUCTIONS[node.op];
          if (ONE_HOT.has(op) && grouped.groups <= ONE_HOT_GROUPS) {
            const member = shown
              ? own(np.where(shown.ref, codes.ref, -1).astype(np.int32))
              : codes;
            const summaries = own(
              groupReduce(member, values, op, grouped.groups),
            );
            const taken = own(
              np.take(summaries.ref, np.maximum(codes.ref, 0), 0),
            );
            result = own(np.where(codes.ref.greaterEqual(0), taken.ref, NaN));
          } else {
            const counted =
              values ?? own(np.ones([rows], { dtype: np.float32 }));
            const masked = shown
              ? own(np.where(shown.ref, counted.ref, NaN))
              : counted;
            // Rows with no group (-1) make a run of their own, read by no row.
            const reduced = own(reduceRuns(masked, codes, op, options.p));
            result = own(np.where(codes.ref.greaterEqual(0), reduced.ref, NaN));
          }
          if (order)
            result = own(
              np.take(result.ref, own(np.argsort(order.ref)).ref, 0),
            );
        }
        // mode, first, and last of a category column return one of its categories; the smallest,
        // largest, middle, first or last of a time column is a time (TODO 53.3).
        const keeps = categories && ["mode", "first", "last"].includes(node.op);
        const time =
          isTime(args[0]?.metadata) &&
          ["min", "max", "median", "quantile", "first", "last"].includes(
            node.op,
          );
        /** @type {import("./expressionPlanTypes.js").CachedExpressionValue} */
        const value = {
          value: result,
          categories: keeps
            ? /** @type {readonly unknown[]} */ (categories)
            : undefined,
          metadata:
            node.op === "any" || node.op === "all"
              ? { type: "boolean" }
              : keeps
                ? {
                    type: "categorical",
                    domain: /** @type {readonly unknown[]} */ (categories),
                  }
                : time
                  ? args[0].metadata
                  : { type: "numeric" },
        };
        // Data-only reductions outlive this evaluation in the cache, which then owns them.
        if (
          reductionCache &&
          ![...expressionFields(node)].some((field) => field.startsWith("@"))
        ) {
          for (
            let at = owned.indexOf(result);
            at >= 0;
            at = owned.indexOf(result)
          )
            owned.splice(at, 1);
          reductionCache.set(node, value);
        }
        memo.set(node, value);
        return value;
      } else if (GROUP_KEY_OPS.has(node.op))
        throw Error(
          `${node.op}() is a Group key, not a value per row: pass it to Group's by, such as by=${node.op === "bin" ? 'bin("x", 20)' : 'hexbin("x", "y")'}.`,
        );
      else throw Error(`Unknown expression operation: ${node.op}.`);
      /** @type {ResolvedOperand} */
      const value = {
        value: result,
        metadata:
          result.dtype === "bool"
            ? { type: "boolean" }
            : (keep ?? { type: "numeric" }),
      };
      memo.set(node, value);
      return value;
    }
    if (isLiteral(node))
      return {
        value: node.value,
        literal: true,
        scalarSlot:
          /** @type {import("../publicTypes.js").LiteralValue & {scalarSlot?: number}} */ (
            node
          ).scalarSlot,
      };
    // A Date is a time: 0 milliseconds from itself, moved to the origin of what it meets.
    if (node instanceof Date)
      return {
        value: 0,
        literal: true,
        metadata: {
          type: "datetime",
          origin: node.getTime(),
          timezone: "UTC",
          unit: "ms",
        },
      };
    if (typeof node === "string")
      return resolve(nameNode(node), depth + 1, context);
    if (
      /** @type {{__expressionLiteralCollection?: true} | null | undefined} */ (
        node
      )?.__expressionLiteralCollection
    )
      return {
        value: /** @type {{values: unknown}} */ (node).values,
        literal: true,
      };
    return { value: node, literal: true };
  };
  // Publication: broadcast the resolved value, wrap categorical codes and return one release
  // for the evaluation lifetime. Failure follows the same release path as a successful result.
  try {
    // Only numeric constants bypass resolution: Date operands need its origin/type handling.
    /** @param {unknown} node @returns {boolean} */
    const numericConstants = (node) =>
      isExpression(node)
        ? node.args.every(numericConstants)
        : typeof (isLiteral(node) ? node.value : node) === "number" ||
          typeof (isLiteral(node) ? node.value : node) === "boolean";
    /** @type {ResolvedOperand} */
    let evaluated;
    const folded =
      isConstantSubtree(root) && (numericConstants(root) || textConstants(root))
        ? hostValue(root, state)
        : undefined;
    if (
      !broadcast &&
      (typeof folded === "number" || typeof folded === "boolean")
    ) {
      const host = folded;
      evaluated = {
        value: Number(host),
        metadata: { type: typeof host === "boolean" ? "boolean" : "numeric" },
      };
    } else evaluated = resolve(root);
    // Text at the root (a constant choice of text, an input's text value) is one category on
    // every row: codes of 0 into [text], as a text column is.
    if (typeof evaluated.value === "string" && rowCount !== undefined)
      evaluated = {
        value: own(np.zeros([rowCount], { dtype: np.float32 })),
        categories: [evaluated.value],
      };
    let value = evaluated.value;
    if (broadcast && !shapeOf(value).length && rowCount !== undefined)
      // A reduction is a rank-0 device array; a host number broadcasts from a buffer too, so a
      // new constant compiles nothing (numpy.full would make it a literal).
      value = own(
        isDeviceArray(value)
          ? value.dtype === "bool"
            ? np.logicalAnd(np.ones([rowCount], { dtype: np.bool }), value.ref)
            : np.zeros([rowCount], { dtype: np.float32 }).add(value.ref)
          : typeof value === "number"
            ? np
                .zeros([rowCount], { dtype: np.float32 })
                .add(hostScalar(value, undefined, evaluated.scalarSlot).ref)
            : np.full(
                [rowCount],
                /** @type {number | boolean | JaxArray} */ (value),
              ),
      );
    if (evaluated.categories) {
      // A missing category (an empty group's first/last/mode) is NaN here; as a code it is
      // -1, not the first category, which is what a NaN cast to int32 would give.
      const codes = own(materialize(value));
      value = {
        codes: own(
          np
            .where(np.isfinite(codes.ref).astype(np.bool), codes.ref, -1)
            .astype(np.int32),
        ),
        categories: evaluated.categories,
      };
    }
    // The returned array has its own reference, including when resolution borrowed a cached
    // reduction or a caller-supplied literal. Releasing that owner cannot invalidate the result.
    const output =
      /** @type {DictionaryColumn | null | undefined} */ (value)?.codes ??
      value;
    const scalar = !shapeOf(output).length;
    const device = isDeviceArray(output);
    if (device) own(output.ref);
    // One dispose per own(): the same array may hold both intermediate and result references.
    // `category`: the expression is view state that names a category (the pointer over a band).
    return {
      value,
      metadata: evaluated.metadata,
      category: evaluated.category,
      cardinality: scalar ? "scalar" : "rows",
      representation: scalar
        ? device
          ? "device-scalar"
          : "host-scalar"
        : "rows",
      expression: root,
      dependencies: {
        fields: expressionFields(
          typeof root === "string" ? nameNode(root) : root,
        ),
        membership: expressionHasReduction(root),
      },
      dispose() {
        for (const item of owned.splice(0)) item?.dispose?.();
        for (const item of prepared.splice(0)) item.dispose();
      },
    };
  } catch (error) {
    for (const item of owned.splice(0)) item?.dispose?.();
    for (const item of prepared.splice(0)) item.dispose();
    throw error;
  }
}

/** @param {unknown} value @returns {unknown} */
export function expressionDescriptor(value) {
  if (!isExpression(value)) return value;
  return {
    $expression: { op: value.op, args: value.args.map(expressionDescriptor) },
  };
}

/** @param {unknown} value @returns {unknown} */
export function expressionFromDescriptor(value) {
  if (
    !(
      /** @type {ExpressionDescriptor | null | undefined} */ (value)
        ?.$expression
    )
  )
    return value;
  const { op } = /** @type {ExpressionDescriptor} */ (value).$expression,
    args = /** @type {ExpressionDescriptor} */ (value).$expression.args.map(
      expressionFromDescriptor,
    );
  // Decoded trees follow the same rules as JS calls: no animate() inside, checked tween options.
  guard(op, args);
  if (op === "tween") return tween(args[0], args[1] ?? {});
  if (op === "interval") return interval(args[0], args[1]);
  if (op === "offset") return offset(args[0]);
  if (op === "moved") return moved(args[0]);
  if (op === "row") {
    if (args.length) throw Error("row() takes no arguments; pass row().");
    return row();
  }
  if (op === "random")
    return random({
      seed: /** @type {number | Expression} */ (args[0]),
      ...randomOptions(args[1]),
    });
  if (REDUCTIONS[op])
    return reduction(op)(
      /** @type {number | boolean | string | Expression} */ (args[0]),
      {
        .../** @type {object} */ (args[1]),
        ...(args.length > 2
          ? {
              where: /** @type {number | boolean | string | Expression} */ (
                args[2]
              ),
            }
          : {}),
      },
    );
  if (ORDERED_OPS.has(op))
    return expression(op, [
      args[0],
      columnOptions(op, /** @type {object | undefined} */ (args[1])),
      ...(op === "window" ? [args[2] ?? 5] : []),
    ]);
  if (op === "lookup")
    return lookup(
      /** @type {string | Expression} */ (args[0]),
      /** @type {string | Expression} */ (args[1]),
      /** @type {object | undefined} */ (args[2]),
    );
  // A state or input name is checked as view.x and input.x check it (R2.0).
  if (op === "bin") {
    const { bins, ...options } = /** @type {any} */ (args[1] ?? {});
    return bin(/** @type {string} */ (args[0]), bins, options);
  }
  if (op === "hexbin")
    return hexbin(
      /** @type {string} */ (args[0]),
      /** @type {string} */ (args[1]),
      /** @type {any} */ (args[2] ?? {}),
    );
  if (op === "state")
    return view(/** @type {import("./names.js").StateName} */ (args[0]));
  if (op === "input") return inputNode(args[0]);
  if (CALENDAR_OPS.includes(op))
    return expression(op, [args[0], calendarOptions(op, args[1] ?? {})]);
  if (CAST_OPS.includes(op))
    return expression(op, [args[0], castOptions(op, args[1] ?? {})]);
  return expression(op, args);
}

/** @param {unknown} value @param {Set<string>} [output] @returns {Set<string>} */
export function expressionFields(value, output = new Set()) {
  if (!isExpression(value)) return output;
  if (value.op === "input") return output;
  const read = nodeField(value);
  if (read !== null) output.add(read);
  // offset() reads the column's offsets only; moved() reads both.
  else if (value.op === "offset" || value.op === "moved") {
    if (value.op === "moved") output.add(value.args[0]);
    output.add(offsetField(value.args[0]));
  } else
    value.args.forEach((item) => {
      // A reduction's options carry the grouping columns, which it reads like any other field.
      if (item?.__expressionLiteral) {
        for (const field of [item.by ?? []].flat())
          if (typeof field === "string") output.add(field);
        for (const field of [item.orderBy ?? []].flat())
          if (typeof field === "string") output.add(field);
        return;
      }
      // Strings are names inside expressions ("weight", "@time", ":weight"), but not in ordinary
      // props. Literal wrappers and membership collections deliberately remain opaque.
      if (typeof item === "string") expressionFields(nameNode(item), output);
      else expressionFields(item, output);
    });
  return output;
}

/** A short, read-only rendering of an expression for the settings pane:
 * `power(count(x), 0.5)`, `mean(x, by=species)`. */
/** @param {unknown} value @returns {string | undefined} */
export function expressionText(value) {
  if (isExpression(value)) {
    if (value.op === "column") return String(value.args[0]);
    if (value.op === "state") return `@${value.args[0]}`;
    if (value.op === "input") return `$${value.args[0]}`;
    const args = value.args.flatMap((item) => {
      if (item?.__expressionLiteral && item.period !== undefined)
        return [String(item.period)];
      if (item?.__expressionLiteral)
        return Object.entries(item)
          .filter(([key]) => !key.startsWith("__"))
          .map(
            ([key, v]) =>
              `${key}=${Array.isArray(v) ? `[${v.join(", ")}]` : v}`,
          );
      if (item?.__expressionLiteralCollection)
        return [
          `[${item.values.map((/** @type {unknown} */ v) => JSON.stringify(v)).join(", ")}]`,
        ];
      return item === null || item === undefined ? [] : [expressionText(item)];
    });
    return `${value.op}(${args.join(", ")})`;
  }
  if (isLiteral(value)) return JSON.stringify(value.value);
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Free all owned arrays in a reduction/constant cache. A released cache is never filled
 * again; evaluations holding their own references stay valid.
 * @param {import("./expressionPlanTypes.js").ExpressionValueCache | null | undefined} cache */
export function releaseReductionCache(cache) {
  if (!cache) return;
  cache.released = true;
  for (const entry of cache.values()) entry.value?.dispose?.();
  cache.clear();
}

/** Retire immutable expression constants no longer read by the producer's current run.
 * @param {import("./expressionPlanTypes.js").ExpressionValueCache | null | undefined} cache
 * @param {Set<import("./expressionPlanTypes.js").ExpressionCacheKey>} used */
export function pruneConstantCache(cache, used) {
  if (!cache) return;
  for (const [key, entry] of cache)
    if (entry.constant && !used.has(key)) {
      entry.value.dispose();
      cache.delete(key);
    }
}
