// @ts-check
// Expanding a template definition (define.js) for one caller (TODO 130.2): parameters are
// substituted, computed(...) expressions over them evaluated, and rest() filled from the caller's
// other props. The tree's shape is the definition's; only props change with the parameters.

/** @typedef {import("./define.js").TemplateDefinition} TemplateDefinition */
/** @typedef {import("./define.js").TemplateNode} TemplateNode */

import { expression, settingNames } from "../plot/utils/names.js";

const plain = (/** @type {unknown} */ value) =>
  !!value && typeof value === "object" && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
const missing = (/** @type {unknown} */ value) => value === undefined || value === null;

/** @type {Record<string, (...args: unknown[]) => unknown>} */
const OPERATIONS = {
  where: (condition, yes, no) => (condition ? yes : no),
  add: (/** @type {any} */ a, /** @type {any} */ b) => a + b,
  coalesce: (...args) => args.find((value) => !missing(value)),
  is_missing: (value) => missing(value),
  equal: (a, b) => a === b,
  not_equal: (a, b) => a !== b,
  logical_and: (...args) => args.every(Boolean),
  logical_or: (...args) => args.some(Boolean),
  logical_not: (value) => !value,
  // A data expression with parameters in it (dataExpression in define.js).
  expression: (/** @type {any} */ op, ...args) => expression(op, args),
};

/**
 * The caller's parameter values, each defaulting to the definition's.
 * @param {TemplateDefinition} definition
 * @param {Record<string, unknown>} props
 */
export function parameterValues(definition, props) {
  const params = Object.fromEntries(Object.entries(definition.params).map(([name, fallback]) =>
    [name, props[name] === undefined ? fallback : props[name]]));
  return definition.output ? settingNames(params) : params;
}

/**
 * `value` with parameters (and prop(...) reads) substituted and computed(...) expressions
 * evaluated.
 * @param {unknown} value
 * @param {Record<string, unknown>} params
 * @param {string} kind The template's kind, for errors.
 * @param {Record<string, unknown>} [props] The caller's props, for prop(...).
 * @returns {unknown}
 */
export function evaluate(value, params, kind, props = {}) {
  if (!plain(value)) return value;
  if (Array.isArray(value)) return value.map((item) => evaluate(item, params, kind, props));
  const record = /** @type {Record<string, any>} */ (value);
  // A data expression ({$expression}, or one built with expression(...)) or a literal(...) (its marker is a symbol) is the parts' to
  // read, unchanged.
  if ("$expression" in record || record.__hmplotExpression === true || Object.getOwnPropertySymbols(record).length) return value;
  if (typeof record.$param === "string") return params[record.$param];
  if (typeof record.$prop === "string") return props[record.$prop];
  if (record.$computed) {
    const { op, args } = record.$computed, run = OPERATIONS[op];
    if (!run) throw Error(`${kind}: computed(...) has no operation "${op}".`);
    return run(...args.map((/** @type {unknown} */ arg) => evaluate(arg, params, kind, props)));
  }
  const entries = Object.entries(record).map(([key, item]) => [key, evaluate(item, params, kind, props)]);
  // Operation options are JSON literals. An omitted optional parameter must remain absent,
  // as it does when authored with window()/mean(), so the numerical planner can compile it.
  return Object.fromEntries(record.__expressionLiteral
    ? entries.filter(([, item]) => item !== undefined) : entries);
}

/**
 * One node's props for this caller: a prop that evaluates to null or undefined is left out, so
 * the part's own default applies; rest() spreads the caller's props that are not parameters, as
 * given (curve={undefined} overrides the definition's curve, as {...props} would).
 * @param {TemplateDefinition} definition
 * @param {TemplateNode} item
 * @param {Record<string, unknown>} props The caller's props.
 * @param {Record<string, unknown>} params
 */
export function nodeProps(definition, item, props, params) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(item.props)) {
    if (key === "$rest") {
      const omit = new Set(/** @type {{ omit: string[] }} */ (value).omit);
      for (const name of Object.keys(props))
        if (!Object.hasOwn(definition.params, name) && !omit.has(name)) out[name] = props[name];
      continue;
    }
    const resolved = evaluate(value, params, definition.kind, props);
    if (!missing(resolved)) out[key] = resolved;
  }
  // A named part's props, given as one object, over the definition's.
  if (item.id !== undefined && definition.parts?.includes(item.id)) {
    const given = params[item.id];
    if (!missing(given) && (!plain(given) || Array.isArray(given)))
      throw Error(`${definition.kind}.${item.id} is an object of the ${item.id}'s props, such as {color: "gray"}.`);
    Object.assign(out, given);
  }
  return out;
}

/**
 * A text setting's value as a parameter (define.js settings): a whole number is a number, a
 * comma-separated list of numbers a list; anything else (a rule name, an expression) as is.
 * An empty edit or unfinished list retains `previous` until it parses.
 * @param {unknown} value
 * @param {unknown} [previous]
 */
export function textSetting(value, previous = value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return previous;
  if (/^\d+$/.test(text)) return Number(text);
  const parts = text.split(",").map((part) => part.trim());
  if (parts.length === 1) return text;
  return parts.every((part) => part !== "" && Number.isFinite(Number(part))) ? parts.map(Number) : previous;
}

/**
 * Whether a node with `when` mounts for these parameters: unless it evaluates to false, null or
 * undefined.
 * @param {TemplateNode} item
 * @param {Record<string, unknown>} params
 * @param {string} kind
 * @param {Record<string, unknown>} props
 */
export function mounted(item, params, kind, props) {
  if (item.when === undefined) return true;
  const value = evaluate(item.when, params, kind, props);
  return !missing(value) && value !== false;
}

/**
 * The id path of the node with `id`, or undefined.
 * @param {TemplateDefinition} definition
 * @param {string} id
 */
export function pathOf(definition, id) {
  /** @type {string | undefined} */
  let found;
  /** @param {TemplateNode} item @param {string} path */
  const walk = (item, path) => {
    if (item.id === id) found = path;
    item.children.forEach((child, index) => walk(child, `${path}.${index}`));
  };
  walk(definition.root, "0");
  return found;
}

/**
 * The main part's id path ("0.1": the root's first child's second child): the node marked
 * main, else the one holding rest(), else none.
 * @param {TemplateDefinition} definition
 * @returns {string | undefined}
 */
export function mainPath(definition) {
  if (definition.output) return undefined;
  /** @type {string | undefined} */
  let marked, holder;
  /** @param {TemplateNode} item @param {string} path */
  const walk = (item, path) => {
    if (item.main) marked = path;
    if ("$rest" in item.props) holder = path;
    item.children.forEach((child, index) => walk(child, `${path}.${index}`));
  };
  walk(definition.root, "0");
  return marked ?? holder;
}

/**
 * The kind of the definition's main part, or undefined.
 * @param {TemplateDefinition} definition
 */
export function mainKind(definition) {
  const path = mainPath(definition);
  if (path === undefined) return undefined;
  let item = definition.root;
  for (const index of path.split(".").slice(1)) item = item.children[Number(index)];
  return item.kind;
}

/**
 * Every kind the definition mounts, for checking that its host was given each one (the slot is
 * the host's own).
 * @param {TemplateDefinition} definition
 */
export function definitionKinds(definition) {
  const kinds = new Set();
  /** @param {TemplateNode} item */
  const walk = (item) => { if (item.kind !== "Slot") kinds.add(item.kind); item.children.forEach(walk); };
  walk(definition.root);
  return kinds;
}
