/**
 * Names in a column's place (R2.0). A value where a column goes is one of four kinds, each with
 * an exact accessor and, except literals, a string shorthand:
 *
 *   column   col.weight, col("weight")   ":weight" (fails if missing), or "weight"
 *   input    input.bins                  "$bins"
 *   view     view.time                   "@time"
 *   literal  literal("red")              none
 *
 * In a mark channel a plain string is the column when there is one, else the literal. Inside an
 * expression and in a column-name parameter it is always a column, and never an input: a column
 * added later must not change what a slider read means. Strings are names only in a column's
 * place; elsewhere a string is literal (title=":x").
 *
 * The accessors are expression nodes of their own ("column", "input", "state"), so col("$price")
 * reads a column named $price. Inside, state is read as a field of the scope or the view named
 * "@time" (nodeField); data columns may not start with @. Any other "@" name ("@focus") is a
 * column an Interaction names (columns={{"@focus": selection}}): read like a column, it fails
 * where no Interaction around it has one (TODO 64).
 */
import { selectionField } from "./interaction.js";
export const expression = (op, args) =>
  Object.freeze({ __hmplotExpression: true, op, args: Object.freeze(args.map(selectionOperand)) });
/**
 * A selection resource in an operand's place (where(focus, 1, 0.15), logical_not(focus); TODO
 * 139.3) is a read of its membership over the expression's rows: 1 on its members, else 0. It
 * reads the live phase (a preview while one is active), per row, as "@selected" does, never a
 * scope-wide "is anything selected" flag.
 */
function selectionOperand(arg) {
  return arg?.isSelection ? field(selectionField(arg)) : arg;
}
/**
 * @param {unknown} value
 * @returns {value is import("../publicTypes.js").Expression}
 */
export const isExpression = (value) => Boolean(value?.__hmplotExpression);

const LITERAL = Symbol("literal");
/** A constant value, even where a column with the same name exists. */
export function literal(value) {
  return { [LITERAL]: true, value };
}
/** @param {unknown} value @returns {value is import("../publicTypes.js").LiteralValue} */
export function isLiteral(value) {
  return Boolean(value?.[LITERAL]);
}

/**
 * `read` as an accessor that can be called or read by property: col("weight") and col.weight.
 * Every string key is a name (col.name and col.length are those columns); `then` stays
 * undefined, so `await` does not take it for a promise, and symbols pass through.
 * @template T
 * @param {(name: string, ...rest: any[]) => T} read
 * @returns {((name: string, ...rest: any[]) => T) & { readonly [name: string]: T }}
 */
export function accessor(read) {
  const call = (name, ...rest) => read(name, ...rest);
  return /** @type {any} */ (new Proxy(call, {
    get(target, key) {
      if (typeof key === "symbol") return Reflect.get(target, key);
      if (key === "then") return undefined;
      return read(key);
    },
  }));
}

/** @typedef {import("../publicTypes.js").Expression} Expression */
/**
 * @typedef {"selected" | "brushed" | "hovered" | "nearby" | "nearest" | "tooltip" | "any_selected" |
 *   "any_brushed" | "any_hovered" | "any_nearby" | "any_nearest" | "any_tooltip" | "time" | "pointer_x" |
 *   "pointer_y" | "view_x_min" | "view_x_max" | "view_y_min" | "view_y_max" | "dt" | "offset_x" |
 *   "offset_y" | "offset_z"} StateName
 */
/** The state names: interaction flags, the view, a Simulate's step, and drag offsets. */
export const STATE_NAMES = Object.freeze([
  "selected", "brushed", "hovered", "nearby", "nearest", "tooltip",
  "any_selected", "any_brushed", "any_hovered", "any_nearby", "any_nearest", "any_tooltip",
  "time", "pointer_x", "pointer_y", "view_x_min", "view_x_max", "view_y_min", "view_y_max",
  "dt", "offset_x", "offset_y", "offset_z",
]);
const STATE = new Set(STATE_NAMES);
/** The field a state name is read as: "time" is "@time". */
export const stateField = (name) => `@${name}`;
/** A brush bound is a field of a named column, including names containing spaces or colons. */
export function brushExtentField(text) {
  if (typeof text !== "string") return null;
  const match = /^@brush_(min|max):([^@].*)$/s.exec(text);
  return match ? { bound: match[1], column: match[2] } : null;
}
// Fields of the pipeline's own that no one writes: prev("x") and offset("x") read these.
const INTERNAL = /^@(prev|offset):/;
/**
 * Whether `text` can name a column of an Interaction (columns={{"@focus": selection}}): "@" and
 * an identifier that is not a state name. Read as a column, it is checked where it is read.
 */
export const isInteractionColumn = (text) => typeof text === "string" && /^@[A-Za-z_]\w*$/.test(text) && !STATE.has(text.slice(1));

/** The error for an unknown state name, listing the others. */
export function unknownState(name, where = "view") {
  return Error(`${where}: there is no state named ${JSON.stringify(name)}. State names are ${STATE_NAMES.join(", ")}.`);
}
/**
 * The error for an "@" name that is neither state nor a column of an Interaction around the
 * reader, listing the state names and the Interaction's columns (`available`).
 * @param {unknown} name @param {string} where @param {readonly string[]} [available]
 */
export function unknownAtName(name, where, available = []) {
  const columns = available.filter((key) => isInteractionColumn(key));
  return Error(`${where}: there is no state or Interaction column named ${JSON.stringify(name)}. State names are ` +
    `${STATE_NAMES.map(stateField).join(", ")}; ${columns.length ? `the Interaction around it names ${columns.join(", ")}` :
      `an Interaction names other "@" columns (columns={{"${name}": selection}})`}.`);
}

/**
 * A read of the column `name`, unchecked: the pipeline's own fields ("@prev:x") are read this
 * way too. Users read columns with col(), which also accepts the named brush bounds.
 */
export const field = (name) => expression("column", [name]);

/**
 * col("weight") or col.weight: a read of the column `weight`. It fails where the column is
 * missing, unlike a plain string in a mark channel, which is then a literal.
 * @type {((name: string) => Expression) & { readonly [name: string]: Expression }}
 */
export const col = accessor((name) => {
  if (typeof name !== "string" || !name)
    throw TypeError(`col() needs a column name; received ${JSON.stringify(name)}.`);
  if (name.startsWith("@") && !brushExtentField(name))
    throw TypeError(`col(${JSON.stringify(name)}): a column's name cannot start with @, which names state${STATE.has(name.slice(1)) ? `: use view.${name.slice(1)}` : ""}.`);
  return field(name);
});

/**
 * view.time or view("time"): view and interaction state, one of STATE_NAMES. An unknown name
 * fails at once, with the list.
 * @type {((name: StateName) => Expression) & { readonly [K in StateName]: Expression }}
 */
export const view = accessor((name) => {
  if (!STATE.has(name)) throw unknownState(name);
  return expression("state", [name]);
});

/** An input's name: an identifier, such as "bins". */
export const NAME_PATTERN = /^[A-Za-z_]\w*$/;
/**
 * A read of the input `name` (checked): what input.bins and "$bins" are. It also makes the
 * writes of the input (TODO 145.7), for a mark's select or hover and a Button's set:
 * root.set("id") takes the clicked or hovered row's id, root.set(literal("all")) (or a number,
 * a boolean, a Date, null) a constant, root.reset() its default. `options.default` is the default
 * every write made from it gives, so writers made from one input agree on it.
 * @param {unknown} name @param {{ default?: unknown }} [options]
 */
export function inputNode(name, options = undefined) {
  if (typeof name !== "string" || !NAME_PATTERN.test(name))
    throw Error(`input() needs an input's name, an identifier such as "bins"; received ${JSON.stringify(name)}.`);
  if (options !== undefined && (options === null || typeof options !== "object" || Object.keys(options).some((key) => key !== "default")))
    throw Error(`input("${name}", options): options is { default }, the value before any write and after a reset; received ${JSON.stringify(options)}.`);
  const node = { __hmplotExpression: true, op: "input", args: Object.freeze([name]) };
  const given = options && "default" in options ? { default: options.default } : {};
  const write = (/** @type {object} */ what) => Object.freeze({ input: name, ...what, ...given });
  // The read resolves to its default while no control or writer declares the input (2026-10-22:
  // a Treemap whose only writers were marks inside it, which mount after the layout runs, read
  // an input nothing had declared yet). Not enumerable: the read stays the same expression.
  if ("default" in given) Object.defineProperty(node, "default", { value: given.default });
  Object.defineProperties(node, {
    set: {
      value(/** @type {unknown} */ source) {
        if (isLiteral(source)) return write({ value: /** @type {any} */ (source).value });
        if (typeof source === "string" && source) return write({ column: source.startsWith(":") ? source.slice(1) : source });
        if (isExpression(source) && source.op === "column" && typeof source.args[0] === "string") return write({ column: source.args[0] });
        if (source === null || typeof source === "number" || typeof source === "boolean" || source instanceof Date) return write({ value: source });
        throw Error(`input("${name}").set(...) takes a column whose value at the clicked or hovered row the input takes ("id", col("id")), or a constant (literal("all"), a number, a boolean, a Date, null); received ${JSON.stringify(source)}.`);
      },
    },
    reset: { value: () => write({ reset: true }) },
  });
  return Object.freeze(node);
}
/**
 * input.bins or input("bins"): a read of the input `bins`. Any property takes one (it is
 * replaced by the input's value), so it is typed `any`. input("root", { default: "all" }) also
 * gives the default of the writes made from it (root.set("id"), root.reset()).
 * @type {((name: string, options?: { default?: unknown }) => any) & { readonly [name: string]: any }}
 */
export const input = accessor(inputNode);

/**
 * The field a name node reads: a column node's name, or a state node's "@" field; else null.
 * Strings are not nodes: see nameNode.
 */
export function nodeField(node) {
  if (!isExpression(node)) return null;
  if (node.op === "column") return typeof node.args[0] === "string" ? node.args[0] : null;
  if (node.op === "state") return stateField(node.args[0]);
  return null;
}
/** Whether `node` reads a data column (a column node that is not one of the pipeline's fields). */
export const isColumnNode = (node) => isExpression(node) && node.op === "column" && typeof node.args[0] === "string" && !node.args[0].startsWith("@");
const namedColumn = (node) => isColumnNode(node) || Boolean(brushExtentField(nodeField(node)));

/**
 * A string in a column's place inside an expression, as the node it names: "@time" state,
 * "@focus" an Interaction's column, "$bins" an input, ":weight" or "weight" a column. `where`
 * names the place in errors.
 */
export function nameNode(text, where = "expression") {
  if (text.startsWith("@")) {
    if (INTERNAL.test(text) || brushExtentField(text) || isInteractionColumn(text)) return field(text);
    if (!STATE.has(text.slice(1))) throw unknownState(text.slice(1), where);
    return expression("state", [text.slice(1)]);
  }
  if (text.startsWith("$")) return inputNode(text.slice(1));
  return field(text.startsWith(":") ? text.slice(1) : text);
}

/**
 * A whole value in a column's place, where props come in: ":weight" becomes col("weight") (so
 * it fails if missing), a state node its "@" field (as "@time" is written), and a "@" string is
 * a state name or an Interaction's column ("@focus", checked where it is read). Anything else
 * is returned as it is.
 */
export function placeName(value, where) {
  if (typeof value === "string") {
    if (brushExtentField(value)) return field(value);
    if (value.startsWith(":") && value.length > 1) return field(value.slice(1));
    if (value.startsWith("@") && !INTERNAL.test(value) && !brushExtentField(value) && !STATE.has(value.slice(1)) && !isInteractionColumn(value))
      throw unknownState(value.slice(1), where);
    return value;
  }
  if (isExpression(value) && value.op === "state") return stateField(value.args[0]);
  return value;
}

/**
 * A column-name parameter's value as names (Sort's by, Window's field): col.x, ":x" and "x" are
 * "x", a state node or "@selected" its field, and a list is each of those. `where` names the
 * parameter in errors.
 */
export function columnName(value, where) {
  if (Array.isArray(value)) return value.map((item) => columnName(item, where));
  if (namedColumn(value)) return value.args[0];
  const placed = placeName(value, where);
  return namedColumn(placed) ? placed.args[0] : placed;
}

const bare = (value) => (namedColumn(value) ? value.args[0] : value);
const plainObject = (value) => value !== null && typeof value === "object" && !isExpression(value) && Object.getPrototypeOf(value) === Object.prototype;
// A reducer spec ({ op: "sum", field: col.v }, GraphData's reduce) names its field too.
const reducers = (value) => {
  let out = null;
  for (const [key, spec] of Object.entries(value))
    if (plainObject(spec) && namedColumn(spec.field)) (out ??= { ...value })[key] = { ...spec, field: spec.field.args[0] };
  return out ?? value;
};
/**
 * A transform's settings with each column read that is a whole setting, or an item of a list
 * setting, as the column's name: by={col.species} is by="species" (R2.0). `skip` holds the
 * settings that take expressions (transforms.js's expressionParams), where a string would mean something else.
 */
export function settingNames(settings, skip = {}) {
  let out = null;
  for (const [key, value] of Object.entries(settings)) {
    if (Object.hasOwn(skip, key)) continue;
    const next = Array.isArray(value) && value.some(namedColumn) ? value.map(bare) : plainObject(value) ? reducers(value) : bare(value);
    if (next !== value) (out ??= { ...settings })[key] = next;
  }
  return out ?? settings;
}
