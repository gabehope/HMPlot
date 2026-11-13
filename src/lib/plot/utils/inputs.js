import { evaluateTransientExpression } from "./expressionPlans.js";
import { inputValue, VALUE_INPUTS } from "./inputValues.js";
import { isExpression, rebuildExpression } from "./expressions.js";
import { NAME_PATTERN, input, placeName, isColumnNode, brushExtentField } from "./names.js";
import { brushExtentValue } from "./interaction.js";
import { timeMs, timeText, zonedDate } from "./timeInputs.js";
import { valueLabel } from "./numberLabels.js";
import { shapeOf } from "./data.js";
import { literal } from "./categorical.js";
import { hostValue, isConstantSubtree, viewState } from "./viewState.js";

/**
 * INPUTS (TODO 41): named values the viewer sets (Slider, Select, Checkbox,
 * Button, Playback). An input sends its value up to the nearest input context (a Python Scene,
 * an InputContext, a Template instance); everything under that context reads it by name, down
 * the tree. A read is input("bins") (JavaScript), hm.input.bins (Python), or the string "$bins"
 * where a string names a column (a mark channel, a transform's column parameter).
 *
 * Reads are substituted with the input's value before a transform or mark sees its props
 * (resolveInputs). A moved input is then an ordinary prop change: its readers re-run once and
 * the change animates. Inside an expression the value becomes a constant, and the jax-js fork
 * reads constants from uniforms, so a new value compiles nothing
 * (tests/unit/kernel-literals.test.js).
 */
export const INPUT_CONTEXT = Symbol("input context");
export { NAME_PATTERN, input };
const READ = /^\$([A-Za-z_]\w*)$/;

/** The name `value` reads: input("bins") always, and "$bins" when `strings` (a column's place). */
export function inputRead(value, strings = false) {
  if (isExpression(value) && value.op === "input") return value.args[0];
  return strings && typeof value === "string" ? READ.exec(value)?.[1] ?? null : null;
}

/** The default a read carries (input("root", { default })), or undefined: what it resolves to
 * while nothing declares the input. */
export const inputDefault = (value) => (isExpression(value) && value.op === "input" ? value.default : undefined);

/** A value as an operand of `op` at `index`: a string is a constant there, not a column name. */
function operand(value, op, index, where) {
  if (op === "is_in" && index === 1)
    return Object.freeze({ __expressionLiteralCollection: true, values: Array.isArray(value) ? [...value] : value == null ? [] : [value] });
  // An input with no value (a click-written input before any click, TODO 145.2) matches no
  // row: NaN compares false with categories and numbers alike.
  if (value === null || value === undefined) return NaN;
  if (Array.isArray(value))
    throw Error(`${where}: a list input (Select with multiple=true) can only be the values of is_in(column, input).`);
  return typeof value === "string" ? literal(value) : value;
}

function resolveExpression(node, store, where) {
  let changed = false;
  const args = node.args.map((arg, index) => {
    const name = inputRead(arg, true); // inside an expression a string names a column
    if (name !== null) {
      changed = true;
      return operand(store.read(name, where, inputDefault(arg)), node.op, index, where);
    }
    if (!isExpression(arg)) return arg;
    const next = resolveExpression(arg, store, where);
    if (next !== arg) changed = true;
    return next;
  });
  return changed ? rebuildExpression(node, args) : node;
}

// Plain option objects and short lists (Bin's per-axis bins, a list of conditions) may hold
// reads; long lists are data, which never does.
const plain = (value) => value !== null && typeof value === "object" && !isExpression(value) &&
  (Array.isArray(value) ? value.length <= 64 : Object.getPrototypeOf(value) === Object.prototype);

function resolveValue(value, store, where, strings, depth = 0) {
  const name = inputRead(value, strings);
  if (name !== null) return store.read(name, where, inputDefault(value));
  if (isExpression(value)) return resolveExpression(value, store, where);
  if (depth < 2 && plain(value)) {
    let out = null;
    for (const [key, item] of Object.entries(value)) {
      const next = resolveValue(item, store, `${where}.${key}`, false, depth + 1);
      if (next !== item) (out ??= Array.isArray(value) ? [...value] : { ...value })[key] = next;
    }
    return out ?? value;
  }
  return value;
}

/**
 * `props` with every input read replaced by the input's value: a whole property that is a read
 * takes the value (a string input in x names a column), and a read inside an expression becomes
 * a constant. `strings(key)` says where a "$name" string is a read (a column's place); elsewhere
 * strings are literal (title="$GDP" is a title). Returns `props` itself when nothing reads.
 * @param {Record<string, any>} props
 * @param {{ read(name: string, where: string): any } | null} store
 * @param {string} kind
 * @param {(key: string) => boolean} [strings]
 */
export function resolveInputs(props, store, kind, strings = () => false) {
  if (!props) return props;
  let out = null;
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") continue;
    const where = `${kind}.${key}`;
    const reads = strings(key);
    // A name in a column's place (R2.0): ":x" reads the column x, view.time is "@time".
    let next = reads ? placeName(value, where) : value;
    if (inputRead(next, reads) !== null || isExpression(next) || plain(next)) {
      if (!store) {
        const name = findRead(next, reads);
        if (name !== null) throw Error(`${where} reads $${name}, but there is no input context around it (an InputContext, or a Python Scene).`);
      } else next = resolveValue(next, store, where, reads);
    }
    if (next !== value) (out ??= { ...props })[key] = next;
  }
  return out ?? props;
}

/**
 * `value` with each expression of constants (one whose input reads were replaced, resolveInputs)
 * evaluated on the host, in plain objects and short lists too (TODO 69.10). For props that take
 * plain values, which a Python scene may give as expressions of inputs: a Frame's placement
 * {"anchor": [8 * hm.cos(hm.input.day / 58), 0, 0], ...} or a Force's
 * dimensions=hm.where(hm.input.view == "3d", 3, 2) (SceneNode.svelte, FOLDED). An expression that
 * reads a column, the view or a reduction is left as it is.
 */
export function foldConstants(value, depth = 0) {
  if (isExpression(value)) return isConstantSubtree(value) ? hostValue(value, viewState()) : value;
  if (depth < 3 && plain(value)) {
    let out = null;
    for (const [key, item] of Object.entries(value)) {
      const next = foldConstants(item, depth + 1);
      if (next !== item) (out ??= Array.isArray(value) ? [...value] : { ...value })[key] = next;
    }
    return out ?? value;
  }
  return value;
}

/**
 * One property's value with its input reads replaced (resolveInputs for a single value), for
 * components that read their props one by one (Force, Provider). `strings`: a "$name" string reads.
 */
export function resolveInput(value, store, where, strings = false) {
  if (strings) value = placeName(value, where);
  if (store) return resolveValue(value, store, where, strings);
  const name = findRead(value, strings);
  if (name !== null) throw Error(`${where} reads $${name}, but there is no input context around it (an InputContext, or a Python Scene).`);
  return value;
}

/**
 * Every input name `props` reads (TODO 145.2b: a transform's, so a hover writing one of them
 * below it can be refused). `strings(key)` says where a "$name" string reads.
 * @param {Record<string, unknown>} props @param {(key: string) => boolean} [strings]
 * @returns {string[]}
 */
export function inputNames(props, strings = () => false) {
  const names = new Set();
  /** @param {unknown} value @param {boolean} reads @param {number} depth */
  const visit = (value, reads, depth) => {
    const name = inputRead(value, reads);
    if (name !== null) return void names.add(name);
    if (isExpression(value)) return value.args.forEach((/** @type {unknown} */ arg) => visit(arg, true, depth));
    if (depth < 2 && plain(value)) Object.values(/** @type {object} */ (value)).forEach((item) => visit(item, false, depth + 1));
  };
  for (const [key, value] of Object.entries(props ?? {})) visit(value, strings(key), 0);
  return [...names];
}

/** The first input name `value` reads, or null. */
export function findRead(value, strings = false, depth = 0) {
  const name = inputRead(value, strings);
  if (name !== null) return name;
  if (isExpression(value)) {
    for (const arg of value.args) {
      const found = findRead(arg, true, depth);
      if (found !== null) return found;
    }
    return null;
  }
  if (depth < 2 && plain(value))
    for (const item of Object.values(value)) {
      const found = findRead(item, false, depth + 1);
      if (found !== null) return found;
    }
  return null;
}

/**
 * A Slider's or Playback's range input (TODO 132.3): its min and max (calendar steps' indices,
 * epoch ms over times, else the values) and how far along `position` is, as a CSS percentage
 * for the filled track.
 */
export function sliderTrack({ stops, time, lo, hi, position }) {
  const lowest = stops ? 0 : time ? timeMs(lo) : lo, highest = stops ? stops.length - 1 : time ? timeMs(hi) : hi;
  const fill = highest > lowest ? Math.min(100, Math.max(0, 100 * (position - lowest) / (highest - lowest))) : 0;
  return { lowest, highest, fill: `${fill}%` };
}

/** A value as text when its input gave no format: lists joined by commas, numbers as tooltips write them (valueLabel), times as dates. */
export function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (value instanceof Date) return timeText(value, { zone: value.timezone ?? "UTC", span: 3 * 86400000 });
  if (typeof value === "number") return valueLabel(value);
  return value === null || value === undefined ? "" : String(value);
}

const PLACEHOLDER = /\{\$([A-Za-z_]\w*)\}/g;
/**
 * `text` with each {$name} placeholder replaced by that input's value as the input shows it
 * (TODO 46: titles, Title and Markdown). A placeholder naming no input is an error naming it.
 */
export function placeholderText(text, store, where) {
  const value = text === undefined || text === null ? "" : String(text);
  if (!value.includes("{$")) return value;
  return value.replace(PLACEHOLDER, (_, name) => {
    if (!store) throw Error(`${where} shows {$${name}}, but there is no input context around it (an InputContext, or a Python Scene).`);
    return store.display(name, where);
  });
}

/**
 * A playing Playback moved by `dt` milliseconds of its clock (TODO 41.4, 50): `rate` value units
 * per second from the continuous `position`; at `hi` it stops, or wraps to `lo` with `loop`.
 * The value is the position, or with `step` the last step it passed.
 */
export function playbackStep(position, dt, { lo, hi, rate, step, loop }) {
  const span = Math.max(hi - lo, 0);
  let next = position + (rate * dt) / 1000, stopped = false;
  if (next >= hi) {
    if (loop && span > 0) next = lo + ((next - lo) % span);
    else {
      next = hi;
      stopped = true;
    }
  }
  const value = step ? Math.min(hi, lo + Math.floor((next - lo) / step + 1e-9) * step) : next;
  return { position: next, value, stopped };
}
/** An input's value before the viewer sets it. */
export function initialValue(kind, props = {}) {
  if (kind === "Slider" && Array.isArray(props.value) && !isExpression(props.min) && !isExpression(props.max)) return inputValue(kind, props);
  if (VALUE_INPUTS.has(kind)) return inputValue(kind, props);
  if (props.value !== undefined && props.value !== null) return props.value;
  if (kind === "Slider" || kind === "Playback") return props.min ?? 0;
  if (kind === "Checkbox") return false;
  if (kind === "Button") return 0;
  if (kind === "Select" && props.multiple) return [];
  if (kind === "Select") {
    const first = optionEntries(props.options)[0];
    return first ? first.value : null;
  }
  return null;
}

/** A Select's options as {label, value} entries: a list of values (times as dates), or {label: value}. */
export function optionEntries(options) {
  if (Array.isArray(options)) return options.map((value) => ({ label: value instanceof Date ? displayValue(value) : String(value), value }));
  if (options && typeof options === "object") return Object.entries(options).map(([label, value]) => ({ label, value }));
  return [];
}


export const sameValue = (a, b) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
/** Whether two option values are the same option: the same time counts. */
export const sameOption = (a, b) => Object.is(a, b) || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());

/**
 * Thrown by a read of an input whose value is not known yet: one that reads the data
 * (value=hm.min("x"), options=hm.categories("species")) before its first evaluation. Readers
 * wait instead of drawing with a stand-in value (TODO 41.2).
 */
export class InputPending extends Error {
  constructor(name) {
    super(`$${name} is not known yet: it is read from the data.`);
    this.name = "InputPending";
    this.input = name;
  }
}

/** Which props of an input may read the data, as expressions over its Data scope. */
export function dataKeys(kind) {
  return kind === "Select" ? ["options", "value"] : kind === "Slider" || kind === "Playback" ? ["min", "max", "value"] : ["value"];
}
/** Whether an input's first value comes from the data, so it is pending until read. */
export function pendingInitial(kind, props = {}) {
  if (isExpression(props.value)) return true;
  if (props.value !== undefined && props.value !== null) return false;
  return (kind === "Slider" || kind === "Playback") ? isExpression(props.min) : kind === "Select" ? isExpression(props.options) : false;
}

/** Data-derived props (TODO 41.2): columns(), categories(field), or any single-value expression. */
const query = (op, args) => rebuildExpression({ op }, args);
/** The scope's column names, for a Select of columns: options={columnNames()}. */
export const columnNames = () => query("columns", []);
/** A categorical column's categories, in order: options={categories("species")}. */
export const categories = (field) => {
  // col.species and ":species" name the column too (R2.0).
  if (isColumnNode(field)) field = field.args[0];
  else if (typeof field === "string" && field.startsWith(":")) field = field.slice(1);
  if (typeof field !== "string") throw Error(`categories() needs a column name; received ${JSON.stringify(field)}.`);
  return query("categories", [field]);
};

/** `value` (an expression) over `scope`: a list for columns()/categories(), else one number. */
export async function scopeValue(value, scope, where, evaluator) {
  if (value.op === "columns")
    return scope.keys().filter((key) => !key.startsWith("@") && !key.startsWith("__"));
  if (value.op === "categories") {
    const field = value.args[0], column = scope.has(field) ? scope.get(field) : undefined;
    if (column === undefined) throw Error(`${where}: categories("${field}") names no column of the data here.`);
    // A scope keeps a categorical column's categories in its metadata (categorical.js).
    const list = scope.metadata?.(field)?.domain ?? column?.categories;
    if (!Array.isArray(list)) throw Error(`${where}: categories("${field}") needs a categorical column; ${field} is numeric.`);
    return [...list];
  }
  // A reduction of a column the scope holds on the host (a Data or Provider's) is computed
  // there: exact, and without a GPU reduction of a column a mark is uploading (that left a mark
  // that draws the column as its x with no positions; TODO 53.3).
  const host = hostReduction(value, scope);
  if (host !== undefined) {
    if (!Number.isFinite(host.value)) throw Error(`${where} evaluated to ${host.value}; it must be a finite number.`);
    const meta = host.metadata;
    return meta?.type === "datetime" && Number.isFinite(meta.origin) ? zonedDate(host.value + meta.origin, meta.timezone ?? "UTC") : host.value;
  }
  const evaluated = evaluateTransientExpression(value, scope.padded?.() ?? scope, { broadcast: false, evaluator });
  try {
    const result = evaluated.value?.codes ?? evaluated.value;
    if (shapeOf(result).length) throw Error(`${where} must be a single value; use a reduction such as min() or max().`);
    const number = Number(typeof result === "number" ? result : (await result.ref.data())[0]);
    if (!Number.isFinite(number)) throw Error(`${where} evaluated to ${number}; it must be a finite number.`);
    // A time (min("t") of a datetime column, TODO 53.3): a Date in the column's zone.
    const meta = evaluated.metadata;
    if (meta?.type === "datetime" && Number.isFinite(meta.origin)) return zonedDate(number + meta.origin, meta.timezone ?? "UTC");
    return number;
  } finally {
    evaluated.dispose?.();
  }
}

/** Arithmetic hostReduction folds over host values. */
const HOST_COMBINATIONS = {
  coalesce: (...values) => values.find(Number.isFinite) ?? NaN,
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  minimum: (a, b) => Math.min(a, b),
  maximum: (a, b) => Math.max(a, b),
};
const HOST_REDUCTIONS = {
  min: (v) => v.reduce((a, b) => Math.min(a, b), Infinity),
  max: (v) => v.reduce((a, b) => Math.max(a, b), -Infinity),
  mean: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN),
  first: (v) => (v.length ? v[0] : NaN),
  last: (v) => (v.length ? v.at(-1) : NaN),
};
/**
 * min, max, mean, first or last of a numeric column the scope holds on the host, over its
 * finite values: { value, metadata }, else undefined (the expression evaluates on the device).
 */
function hostReduction(value, scope) {
  if (typeof value === "number") return { value, metadata: undefined };
  // A small arithmetic of host values (coalesce(min("@brush_min:day"), 0), a span's midpoint).
  const combine = HOST_COMBINATIONS[value?.op];
  if (combine) {
    const parts = value.args.map((arg) => hostReduction(arg, scope));
    if (parts.some((part) => part === undefined)) return undefined;
    // A time stays a time through a shift (a time plus or minus a number) or a choice among
    // times; two times subtracted are a span (milliseconds), and any other mix of times is
    // left to the device, which types it.
    const times = parts.filter((part) => part.metadata?.type === "datetime").length;
    const metadata = parts.find((part) => part.metadata)?.metadata;
    if (times && value.op === "subtract" && times === 2) {
      // Each counts from its own column's origin.
      const [a, b] = parts.map((part) => part.value + (part.metadata.origin ?? 0));
      return { value: a - b, metadata: undefined };
    }
    const origins = new Set(parts.filter((part) => part.metadata?.type === "datetime").map((part) => part.metadata.origin ?? 0));
    if (times && (value.op === "multiply" || value.op === "divide" || (value.op === "add" && times > 1) ||
        (value.op === "subtract" && parts[0].metadata?.type !== "datetime") || origins.size > 1)) return undefined;
    return { value: combine(...parts.map((part) => part.value)), metadata };
  }
  const reduce = HOST_REDUCTIONS[value?.op], field = value?.args?.[0];
  if (!reduce || value.args.length > 2 || value.args.slice(1).some((arg) => arg?.__expressionLiteral && (arg.by !== undefined || arg.orderBy !== undefined))) return undefined;
  const name = typeof field === "string" ? field : isColumnNode(field) ? field.args[0] : null;
  // A brush bound is the same on every row: any of these reductions of it is the bound, read
  // from the brush's descriptor on the host (TODO 143.5).
  const bound = typeof name === "string" ? brushExtentField(name) : null;
  if (bound && value.args.length === 1 && scope.has?.(bound.column))
    return { value: brushExtentValue(scope, name), metadata: scope.metadata?.(bound.column) };
  if (typeof name !== "string" || name.startsWith("@") || !scope.has?.(name) || scope.physical) return undefined;
  const column = scope.get(name);
  if (!(Array.isArray(column) || (ArrayBuffer.isView(column) && !(column instanceof DataView))) || column.categories) return undefined;
  const values = Array.from(column, Number).filter(Number.isFinite);
  return { value: reduce(values), metadata: scope.metadata?.(name) };
}
