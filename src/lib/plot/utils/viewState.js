import { nodeField, isLiteral, placeName } from "./names.js";

/**
 * VIEW STATE (TODO 28): values the view owns and the data does not, read in expressions as
 * columns. @time is the view clock in milliseconds; @pointer_x and @pointer_y the pointer in the
 * reading frame's data (TODO 45: missing off the frame, a category on a band axis);
 * @view_x_min, @view_x_max, @view_y_min and @view_y_max the reading frame's visible domain
 * (TODO 19: in a Cartesian frame what is on screen, in a curved or placed frame its domain).
 * The pointer and the visible domain are "tracked": they change as the pointer moves or the view
 * pans and zooms, not with the clock (utils/pointerTracker.js).
 * They are never columns of a scope (a scope's virtual columns are cached per interaction
 * revision): expressions read them from the `viewState` evaluateExpression is given.
 *
 * A subtree that reads view state and nothing else (no data column, no reduction) has one value
 * for every row, known on the host: `@time`, `floor(@time / 1000)`, `interval(@time, 500) - 250`.
 * Such subtrees are evaluated here, in float64, and reach kernels as one buffer each
 * (evaluateExpression). Their values are also a consumer's change key: a transform or a mark
 * channel re-evaluates only when one of them changed, so a still clock re-runs nothing and
 * floor(@time / 1000) re-runs once a second, decided without touching the GPU.
 */
export const POINTER_FIELDS = new Set(["@pointer_x", "@pointer_y"]);
export const VISIBLE_FIELDS = new Set(["@view_x_min", "@view_x_max", "@view_y_min", "@view_y_max"]);
export const VIEW_STATE_FIELDS = new Set(["@time", ...POINTER_FIELDS, ...VISIBLE_FIELDS]);
export const isViewStateField = (name) => VIEW_STATE_FIELDS.has(name);
/** A field the view tracks as the pointer moves or the view changes, not with the clock. */
export const isTrackedField = (name) => POINTER_FIELDS.has(name) || VISIBLE_FIELDS.has(name);

/**
 * The axis of a view-state field written as text ("@pointer_x", or its state node,
 * view.pointer_x) and how to read it from a framePointer, or null (Text format="axis").
 */
export function axisField(text) {
  let name;
  try { name = placeName(text); } catch { return null; } // an unknown "@" name
  if (typeof name !== "string") return null;
  const pointer = /^@pointer_([xy])$/.exec(name);
  if (pointer) return { axis: pointer[1], read: (state) => state[pointer[1]] };
  const visible = /^@view_([xy])_(min|max)$/.exec(name);
  if (visible) return { axis: visible[1], read: (state) => state.visible?.[visible[1]]?.[visible[2] === "min" ? 0 : 1] };
  return null;
}

const isExpression = (value) => Boolean(value?.__hmplotExpression);
const optionLiteral = (value) => Boolean(value?.__expressionLiteral || value?.__expressionLiteralCollection);

/**
 * The state the view shows at `time`, with `pointer` ({ x, y } in the reading frame's data,
 * NaN when the pointer is off it or absent) and `visible` ({ x: [min, max], y: [min, max] }, the
 * reading frame's visible domain); at(period) is that state as of the last interval step (the
 * tracked values are sampled with it). `pointer` and `visible` may be functions, called once
 * when first read, so a state nothing reads them from computes neither.
 * @param {import("./expressionPlanTypes.js").ViewStateInputs} inputs
 * @returns {import("./expressionPlanTypes.js").ViewStateRecord}
 */
export function viewState({ time = 0, pointer = null, visible = null } = {}) {
  const once = (value) => {
    if (typeof value !== "function") return () => value;
    let read = false, result;
    return () => (read ? result : ((read = true), (result = value())));
  };
  const readPointer = once(pointer), readVisible = once(visible);
  return Object.freeze({
    time,
    get pointer() { return readPointer(); },
    get visible() { return readVisible(); },
    at(period) {
      return viewState({ time: Math.floor(time / period) * period, pointer: readPointer, visible: readVisible });
    },
  });
}

/** interval()'s period from its literal option, checked (JS calls and decoded descriptors). */
export function intervalPeriod(options) {
  const period = options !== null && typeof options === "object" ? options.period : options;
  if (typeof period !== "number" || !Number.isFinite(period) || period < 1)
    throw Error(`interval() needs a period in milliseconds, a finite number of at least 1; received ${
      period === undefined ? "none" : JSON.stringify(period)}.`);
  return period;
}

const HOST_UNARY = {
  negative: (a) => -a, abs: Math.abs, square: (a) => a * a, sqrt: Math.sqrt, log: Math.log, exp: Math.exp,
  sin: Math.sin, cos: Math.cos, floor: Math.floor, round: roundHalfEven,
  logical_not: (a) => !truthy(a),
  // Text (an input's value) is a present value, never missing (as the device path decides).
  is_missing: (a) => (typeof a === "string" ? false : !Number.isFinite(a)),
  is_finite: (a) => (typeof a === "string" ? true : Number.isFinite(a)),
};
const HOST_BINARY = {
  add: (a, b) => a + b, subtract: (a, b) => a - b, multiply: (a, b) => a * b, divide: (a, b) => a / b,
  power: (a, b) => a ** b, minimum: Math.min, maximum: Math.max,
  equal: (a, b) => a === b, not_equal: (a, b) => a !== b, less: (a, b) => a < b, less_equal: (a, b) => a <= b,
  greater: (a, b) => a > b, greater_equal: (a, b) => a >= b,
  logical_and: (a, b) => truthy(a) && truthy(b), logical_or: (a, b) => truthy(a) || truthy(b),
  coalesce: (a, b) => (Number.isFinite(a) ? a : b),
};
const HOST_OPS = new Set([...Object.keys(HOST_UNARY), ...Object.keys(HOST_BINARY), "column", "clip", "where", "is_in", "interval"]);

/** numpy's rule, which np.round follows on the GPU too: halves go to the even neighbor. */
export function roundHalfEven(x) {
  if (!Number.isFinite(x)) return x;
  const nearest = Math.round(x);
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : nearest;
}
// numpy truth: any nonzero value, NaN included.
function truthy(value) {
  return typeof value === "boolean" ? value : value !== 0;
}
const number = (value) => (typeof value === "boolean" ? Number(value) : value);

const subtrees = new WeakMap();
/**
 * Whether `node` reads view state and nothing else, so it has one value, computed on the host.
 * Strings are column references inside expressions ("@time").
 */
export function isViewStateSubtree(node) {
  if (typeof node === "string") return isViewStateField(node);
  if (!isExpression(node)) return false;
  if (subtrees.has(node)) return subtrees.get(node);
  let reads = false, only = HOST_OPS.has(node.op) || node.op === "state";
  if (only && nodeField(node) !== null) {
    reads = isViewStateField(nodeField(node));
    only = reads;
  } else if (only)
    for (const item of node.args) {
      if (isViewStateSubtree(item)) reads = true;
      else if (!(typeof item === "number" || typeof item === "boolean" || optionLiteral(item) ||
        // A text literal compares with a category the pointer is over (@pointer_x == "Adelie").
        (isLiteral(item) && ["number", "boolean", "string"].includes(typeof item.value)))) {
        only = false;
        break;
      }
    }
  const result = only && reads;
  subtrees.set(node, result);
  return result;
}

/**
 * Whether `node` is a constant: a number, a boolean, a Date or a number, boolean or text literal,
 * or a host operation of constants (an expression whose input reads were replaced by their
 * values, utils/inputs.js foldConstants). Strings inside expressions name columns: not constant.
 */
export function isConstantSubtree(node) {
  if (typeof node === "number" || typeof node === "boolean" || node instanceof Date) return true;
  if (!isExpression(node))
    return isLiteral(node) && ["number", "boolean", "string"].includes(typeof node.value);
  if (!HOST_OPS.has(node.op) || ["column", "state", "interval", "is_in"].includes(node.op)) return false;
  return node.args.every(isConstantSubtree);
}

/** A view-state subtree's value under `state` (a number or a boolean). */
export function hostValue(node, state) {
  if (typeof node === "string") return fieldValue(node, state);
  if (!isExpression(node)) return isLiteral(node) ? node.value : node;
  const arg = (at) => hostValue(node.args[at], state);
  switch (node.op) {
    case "column": case "state": return fieldValue(nodeField(node), state);
    case "interval": return hostValue(node.args[0], state.at(intervalPeriod(node.args[1])));
    case "clip": return Math.min(Math.max(number(arg(0)), number(arg(1))), number(arg(2)));
    case "where": return truthy(arg(0)) ? arg(1) : arg(2);
    case "is_in": {
      const value = number(arg(0)), values = node.args[1]?.values ?? node.args[1]?.$expression_literals ?? [];
      return values.some((item) => number(item) === value);
    }
  }
  if (HOST_UNARY[node.op]) return HOST_UNARY[node.op](number(arg(0)));
  return HOST_BINARY[node.op](number(arg(0)), number(arg(1)));
}
function fieldValue(name, state) {
  if (name === "@time") return state.time;
  if (name === "@pointer_x") return state.pointer?.x ?? NaN;
  if (name === "@pointer_y") return state.pointer?.y ?? NaN;
  const visible = /^@view_([xy])_(min|max)$/.exec(name);
  if (visible) return state.visible?.[visible[1]]?.[visible[2] === "min" ? 0 : 1] ?? NaN;
  throw Error(`Unknown view state ${JSON.stringify(name)}.`);
}

/**
 * How `value` reads view state: `live` when some read of @time has no interval() around it (it
 * moves with every frame), `stepped` when some read of it is inside one, and `tracked` when it
 * reads the pointer or the visible domain (they change as the pointer moves or the view pans
 * and zooms, not with the clock: TODO 45, 19).
 */
export function viewStateReads(value, output = { live: false, stepped: false, tracked: false }, inside = false) {
  const note = (name) => {
    if (isTrackedField(name)) output.tracked = true;
    else if (isViewStateField(name)) output[inside ? "stepped" : "live"] = true;
  };
  if (typeof value === "string") {
    note(value);
    return output;
  }
  if (!isExpression(value)) return output;
  if (nodeField(value) !== null) {
    note(nodeField(value));
    return output;
  }
  const under = inside || value.op === "interval";
  for (const item of value.args) viewStateReads(item, output, under);
  return output;
}
export const readsViewState = (value) => {
  const reads = viewStateReads(value);
  return reads.live || reads.stepped || reads.tracked;
};

/**
 * A consumer's change key under `state`: the value of every maximal view-state subtree of
 * `values` (expressions, or anything else, which reads nothing). Two keys are equal when every
 * entry is (Object.is): then re-evaluating would compute the same thing.
 */
export function viewStateKey(values, state, output = []) {
  const visit = (node, current) => {
    if (isViewStateSubtree(node)) {
      output.push(hostValue(node, current));
      return;
    }
    if (!isExpression(node) || nodeField(node) !== null) return;
    const inner = node.op === "interval" ? current.at(intervalPeriod(node.args[1])) : current;
    for (const item of node.args) visit(item, inner);
  };
  for (const value of values) visit(value, state);
  return output;
}
export const sameKey = (a, b) => a?.length === b?.length && a.every((value, at) => Object.is(value, b[at]));

/**
 * A transform outside every Plot (Data > Calculate > Plot) has no view clock of its own; the
 * views under it adopt it (viewCore), and it reads the clock of the one view it draws in.
 */
export const VIEW_CLOCK_CONTEXT = Symbol("view clock");
