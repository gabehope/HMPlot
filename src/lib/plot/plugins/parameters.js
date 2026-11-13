// @ts-check
/**
 * Parameter schemas (TODO 138.2): one per effect, shade or transform, built-in or a plugin's.
 * From one schema come the validation (a message naming the owner and the parameter), the
 * defaults, the settings pane's options and a transform's expression parameters. Values are
 * JSON, never functions, so a schema's values can key a cache.
 *
 * A parameter: { type, default, min, max, integer, options, length, shape, wrap, structural, when,
 * label, step, sliderMax }.
 *   number: a finite number, `integer` if so, within `min` and `max` (either may be open).
 *   color: a CSS color string. boolean: true or false. string: any string.
 *   select: one of `options`. field: a column name or aligned numeric values.
 *   expression: a number, or an expression evaluated before the transform runs, against its
 *     input's shown rows with view state, to one finite value (`integer` rounds it).
 *   vector: a list of `length` (2, 3 or 4) finite numbers. image: a URL, an ImageBitmap, an
 *     HTMLImageElement, an HTMLCanvasElement or a Blob, which the library loads (TODO 138.5;
 *     `wrap`: "clamp", the default, or "repeat" across its width, as a panorama's longitude).
 * union: one of variants. array: items with optional minLength/maxLength. object: properties
 *   and optional required keys; undeclared keys are rejected. Nested defaults are not applied.
 * `structural`: changing it rebuilds what the owner built (else it is a uniform, or a run's
 * input). `when`: "grid" or "rows", the inputs it applies to (TODO 138.7). `label`, `step` and
 * `sliderMax` (the slider's end when `max` is open) are the settings pane's.
 */

/** @typedef {"number" | "color" | "boolean" | "select" | "string" | "field" | "expression" | "vector" | "image" | "union" | "array" | "object"} ParameterType */
/**
 * @typedef {{ type: ParameterType, default?: unknown, min?: number, max?: number,
 *   integer?: boolean, options?: readonly unknown[], length?: 2 | 3 | 4, shape?: readonly number[], wrap?: "clamp" | "repeat",
 *   structural?: boolean, when?: "grid" | "rows",
 *   label?: string, step?: number, sliderMax?: number, properties?: ParameterSchema, required?: string[], variants?: Parameter[], items?: Parameter, minLength?: number, maxLength?: number }} Parameter
 * @typedef {Readonly<Record<string, Parameter>>} ParameterSchema
 */

import { shapeOf } from "../utils/data.js";
import { parameterExpressions } from "../utils/transforms/dependencies.js";
import { isExpression } from "../utils/names.js";

export const PARAMETER_TYPES = Object.freeze([
  "number",
  "color",
  "boolean",
  "select",
  "string",
  "field",
  "expression",
  "vector",
  "image",
  "union",
  "array",
  "object",
]);
const KEYS = new Set([
  "type",
  "default",
  "min",
  "max",
  "integer",
  "options",
  "length",
  "shape",
  "wrap",
  "structural",
  "when",
  "label",
  "step",
  "sliderMax",
  "variants",
  "items",
  "minLength",
  "maxLength",
  "properties",
  "required",
]);

/** @param {unknown} value @returns {value is number} */
const finite = (value) => typeof value === "number" && Number.isFinite(value);
/** @param {unknown} value */
const show = (value) => {
  if (typeof value === "string" || (value && typeof value === "object"))
    try {
      return JSON.stringify(value);
    } catch {
      /* cyclic: as a string */
    }
  return String(value);
};
/** @param {string} value */
const cssColor = (value) => globalThis.CSS?.supports?.("color", value) ?? true;

/**
 * Check a schema (`owner`: how messages name its effect, shade or transform), throwing on the
 * first mistake: an unknown type or key, select without options, a key of the wrong kind (a
 * string min, min above max), a default its own check fails.
 * @param {string} owner
 * @param {ParameterSchema} schema
 */
export function checkSchema(owner, schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    throw Error(
      `${owner}: parameters is an object of { type, default, ... } by name; got ${show(schema)}.`,
    );
  for (const [name, parameter] of Object.entries(schema)) {
    if (!parameter || !PARAMETER_TYPES.includes(parameter.type))
      throw Error(
        `${owner}: parameter "${name}" has type ${show(parameter?.type)}; it is one of ${PARAMETER_TYPES.join(", ")}.`,
      );
    const unknown = Object.keys(parameter).filter((key) => !KEYS.has(key));
    if (unknown.length)
      throw Error(
        `${owner}: parameter "${name}" has ${unknown.map((key) => `"${key}"`).join(", ")}, not one of ${[...KEYS].join(", ")}.`,
      );
    if (
      parameter.type === "select" &&
      !(Array.isArray(parameter.options) && parameter.options.length)
    )
      throw Error(`${owner}: parameter "${name}" is a select without options.`);
    const meta = metaProblem(parameter);
    if (meta) throw Error(`${owner}: parameter "${name}" ${meta}.`);
    if (parameter.type === "union") {
      if (!Array.isArray(parameter.variants) || !parameter.variants.length)
        throw Error(
          `${owner}: parameter "${name}" requires nonempty variants.`,
        );
      parameter.variants.forEach((variant, index) =>
        checkSchema(owner, { [`${name}.variants[${index}]`]: variant }),
      );
    }
    if (parameter.type === "array") {
      if (!parameter.items)
        throw Error(`${owner}: ${name} requires an items schema.`);
      checkSchema(owner, { [`${name}.items`]: parameter.items });
    }
    if (parameter.type === "object") {
      if (!parameter.properties)
        throw Error(`${owner}: ${name} requires properties.`);
      checkSchema(`${owner}.${name}`, parameter.properties);
      if (
        parameter.required !== undefined &&
        (!Array.isArray(parameter.required) ||
          parameter.required.some(
            (key) => !Object.hasOwn(parameter.properties ?? {}, key),
          ))
      )
        throw Error(
          `${owner}: ${name}.required must list declared properties.`,
        );
    }
    const problem = valueProblem(owner, name, parameter, parameter.default);
    if (problem) throw Error(`${problem.slice(0, -1)} (its default).`);
  }
  return schema;
}

/**
 * What is wrong with a parameter's own keys, or "".
 * @param {Parameter} parameter
 */
function metaProblem(parameter) {
  for (const key of /** @type {const} */ (["min", "max", "step", "sliderMax"]))
    if (parameter[key] !== undefined && !finite(parameter[key]))
      return `has ${key} ${show(parameter[key])}, not a number`;
  if (
    (parameter.properties !== undefined || parameter.required !== undefined) &&
    parameter.type !== "object"
  )
    return "has properties or required, which only an object takes";
  if (parameter.variants !== undefined && parameter.type !== "union")
    return "has variants, which only a union takes";
  if (parameter.items !== undefined && parameter.type !== "array")
    return "has items, which only an array takes";
  for (const key of /** @type {const} */ (["minLength", "maxLength"]))
    if (
      parameter[key] !== undefined &&
      (parameter.type !== "array" ||
        !Number.isInteger(parameter[key]) ||
        parameter[key] < 0)
    )
      return `has ${key}; use a nonnegative integer on an array`;
  if (
    parameter.minLength !== undefined &&
    parameter.maxLength !== undefined &&
    parameter.minLength > parameter.maxLength
  )
    return "has minLength above maxLength";
  const { min, max } = parameter;
  if (min !== undefined && max !== undefined && min > max)
    return `has min ${min} above its max ${max}`;
  for (const key of /** @type {const} */ (["integer", "structural"]))
    if (parameter[key] !== undefined && typeof parameter[key] !== "boolean")
      return `has ${key} ${show(parameter[key])}, not true or false`;
  if (
    parameter.when !== undefined &&
    parameter.when !== "grid" &&
    parameter.when !== "rows"
  )
    return `has when ${show(parameter.when)}, not "grid" or "rows"`;
  if (parameter.label !== undefined && typeof parameter.label !== "string")
    return `has label ${show(parameter.label)}, not a string`;
  if (parameter.options !== undefined && parameter.type !== "select")
    return `has options, which only a select takes`;
  if (
    parameter.type === "vector"
      ? parameter.shape === undefined &&
        ![2, 3, 4].includes(/** @type {number} */ (parameter.length))
      : parameter.length !== undefined
  )
    return parameter.type === "vector"
      ? `is a vector with length ${show(parameter.length)}, not 2, 3 or 4`
      : `has length, which only a vector takes`;
  if (
    parameter.shape !== undefined &&
    (parameter.type !== "vector" ||
      parameter.length !== undefined ||
      !Array.isArray(parameter.shape) ||
      !parameter.shape.length ||
      parameter.shape.length > 4 ||
      parameter.shape.some((size) => !Number.isInteger(size) || size < 1) ||
      parameter.shape.reduce((a, b) => a * b, 1) > 64)
  )
    return `has shape ${show(parameter.shape)}; use a vector shape of positive integer dimensions (at most 64 values), without length`;
  if (
    parameter.wrap !== undefined &&
    (parameter.type !== "image" ||
      (parameter.wrap !== "clamp" && parameter.wrap !== "repeat"))
  )
    return parameter.type === "image"
      ? `has wrap ${show(parameter.wrap)}, not "clamp" or "repeat"`
      : `has wrap, which only an image takes`;
  return "";
}

/** @param {unknown} value @param {readonly (number | undefined)[]} shape @returns {boolean} */
function vectorMatches(value, shape) {
  return shape.length === 0
    ? finite(value)
    : Array.isArray(value) &&
        value.length === shape[0] &&
        value.every((item) => vectorMatches(item, shape.slice(1)));
}

/**
 * The problem with one value of `parameter`, or "" (undefined or null: its default applies).
 * @param {string} owner @param {string} name @param {Parameter} parameter @param {unknown} value
 * @param {(value: string) => boolean} [isColor]
 * @returns {string}
 */
function valueProblem(owner, name, parameter, value, isColor = cssColor) {
  // null is a value left out, as undefined (TODO 138.5).
  if (value == null) return "";
  const got = `; got ${show(value)}.`;
  switch (parameter.type) {
    case "number": {
      const { min, max, integer } = parameter;
      const kind = integer ? "an integer" : "a number";
      const range =
        min !== undefined && max !== undefined
          ? ` from ${min} to ${max}`
          : min !== undefined
            ? ` of at least ${min}`
            : max !== undefined
              ? ` of at most ${max}`
              : "";
      const ok =
        finite(value) &&
        (!integer || Number.isInteger(value)) &&
        (min === undefined || value >= min) &&
        (max === undefined || value <= max);
      return ok ? "" : `${owner}: ${name} is ${kind}${range}${got}`;
    }
    case "color":
      return typeof value === "string" && isColor(value)
        ? ""
        : `${owner}: ${name} is a CSS color${got}`;
    case "boolean":
      return typeof value === "boolean"
        ? ""
        : `${owner}: ${name} is true or false${got}`;
    case "string":
      return typeof value === "string"
        ? ""
        : `${owner}: ${name} is a string${got}`;
    case "select":
      return (parameter.options ?? []).includes(value)
        ? ""
        : `${owner}: ${name} is one of ${(parameter.options ?? []).map(show).join(", ")}${got}`;
    case "field":
      return (typeof value === "string" && value.length) ||
        (typeof value !== "string" && shapeOf(value).length === 1)
        ? ""
        : `${owner}: ${name} is a column's name or one numeric value per input row${got}`;
    case "expression":
      return finite(value) || isExpression(value)
        ? ""
        : `${owner}: ${name} is a number or an expression${got}`;
    case "vector":
      return vectorMatches(value, parameter.shape ?? [parameter.length])
        ? ""
        : parameter.shape
          ? `${owner}: ${name} is a numeric array of shape ${show(parameter.shape)}${got}`
          : `${owner}: ${name} is a list of ${parameter.length} numbers${got}`;
    case "object": {
      const values = /** @type {Record<string, unknown>} */ (value);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return `${owner}: ${name} is an object${got}`;
      for (const key of Object.keys(value))
        if (!Object.hasOwn(parameter.properties ?? {}, key))
          return `${owner}: ${name}.${key} is not a declared property.`;
      for (const key of parameter.required ?? [])
        if (values[key] == null) return `${owner}: ${name}.${key} is required.`;
      for (const [key, spec] of Object.entries(parameter.properties ?? {})) {
        const problem = valueProblem(
          owner,
          `${name}.${key}`,
          spec,
          values[key],
          isColor,
        );
        if (problem) return problem;
      }
      return "";
    }
    case "union": {
      const problems = (parameter.variants ?? []).map((spec) =>
        valueProblem(owner, name, spec, value, isColor),
      );
      return problems.some((problem) => !problem)
        ? ""
        : `${owner}: ${name} must match one of its variants (${problems.join(" ")}).`;
    }
    case "array":
      if (
        !Array.isArray(value) ||
        (parameter.minLength !== undefined &&
          value.length < parameter.minLength) ||
        (parameter.maxLength !== undefined &&
          value.length > parameter.maxLength)
      )
        return `${owner}: ${name} is an array${got}`;
      for (let i = 0; i < value.length; i++) {
        if (value[i] == null)
          return `${owner}: ${name}[${i}] cannot be null or undefined; pass an item matching its schema.`;
        const problem = valueProblem(
          owner,
          `${name}[${i}]`,
          /** @type {Parameter} */ (parameter.items),
          value[i],
          isColor,
        );
        if (problem) return problem;
      }
      return "";
    case "image":
      return (typeof value === "string" && value.length) ||
        (value !== null && typeof value === "object" && !Array.isArray(value))
        ? ""
        : `${owner}: ${name} is an image: a URL, an ImageBitmap, an HTMLImageElement, an HTMLCanvasElement or a Blob${got}`;
  }
  return "";
}

/**
 * The first problem with `values` under `schema`, or "": a name the schema does not have (the
 * message lists the ones it has), then each value's own check.
 * @param {string} owner
 * @param {ParameterSchema} schema
 * @param {Record<string, unknown>} [values]
 * @param {(value: string) => boolean} [isColor] checks a color string (CSS.supports by default)
 */
export function parameterProblem(
  owner,
  schema,
  values = {},
  isColor = cssColor,
) {
  const known = Object.keys(schema);
  const unknown = Object.keys(values).filter(
    (key) => values[key] != null && !Object.hasOwn(schema, key),
  );
  if (unknown.length)
    return `${owner}: ${unknown.map((key) => `"${key}"`).join(", ")} ${unknown.length > 1 ? "are" : "is"} not one of its parameters (${known.join(", ") || "it has none"}).`;
  for (const name of known) {
    const problem = valueProblem(
      owner,
      name,
      schema[name],
      values[name],
      isColor,
    );
    if (problem) return problem;
  }
  return "";
}

/**
 * `values` with each missing (undefined or null) one its default (a parameter without a
 * default stays missing).
 * @param {ParameterSchema} schema
 * @param {Record<string, unknown>} [values]
 */
export function withDefaults(schema, values = {}) {
  const out = { ...values };
  for (const [name, parameter] of Object.entries(schema))
    if (out[name] == null && parameter.default !== undefined)
      out[name] = parameter.default;
  return out;
}

/** Defaults for the active table/grid branch only. Check explicit inactive values before
 * evaluating expressions, so an unused branch never reads missing columns or view state.
 * @param {string} owner @param {ParameterSchema} schema
 * @param {Record<string, unknown>} values @param {boolean} grid
 */
export function transformParameters(owner, schema, values, grid) {
  const out = { ...values };
  for (const [name, parameter] of Object.entries(schema)) {
    if (parameter.when && parameter.when !== (grid ? "grid" : "rows")) {
      if (values[name] != null)
        throw Error(
          `${owner}: parameter "${name}" requires ${parameter.when === "grid" ? "a grid" : "table rows"}.`,
        );
      delete out[name];
    } else if (out[name] == null && parameter.default !== undefined) {
      out[name] = parameter.default;
    }
  }
  return out;
}

/**
 * The expression parameters of `schema`, as the transform runner evaluates them: by name,
 * "integer" (rounded) or "number".
 * @param {ParameterSchema | undefined} schema
 * @returns {Record<string, "integer" | "number" | Parameter>}
 */
export function expressionParameters(schema) {
  /** @param {Parameter} parameter @returns {boolean} */
  const hasExpression = (parameter) =>
    parameter.type === "expression" ||
    (parameter.type === "union" &&
      (parameter.variants ?? []).some(hasExpression)) ||
    (parameter.type === "array" &&
      (parameter.items ? hasExpression(parameter.items) : false)) ||
    (parameter.type === "object" &&
      Object.values(parameter.properties ?? {}).some(hasExpression));
  return Object.fromEntries(
    Object.entries(schema ?? {})
      .filter(([, spec]) => hasExpression(spec))
      .map(([name, spec]) => [
        name,
        spec.type === "expression"
          ? spec.integer
            ? "integer"
            : "number"
          : spec,
      ]),
  );
}

/** Select the first matching branch; schemas are checked before runtime use.
 * @param {Parameter} parameter @param {unknown} value @returns {Parameter}
 */
export function parameterVariant(parameter, value) {
  if (parameter.type !== "union") return parameter;
  const selected =
    (parameter.variants ?? []).find(
      (spec) => !valueProblem("Parameter", "value", spec, value),
    ) ?? parameter.variants?.[0];
  return selected ? parameterVariant(selected, value) : parameter;
}

/**
 * The option a Plot keeps a parameter of `prefix`'s in: "_bloomStrength" for bloom's strength.
 * @param {string} prefix @param {string} name
 */
export const optionName = (prefix, name) =>
  `_${prefix}${name[0].toUpperCase()}${name.slice(1)}`;

/** Visit active schema leaves, keeping array indices as path segments.
 * @param {Parameter} parameter @param {unknown} value @param {readonly string[]} path
 * @param {(spec: Parameter, value: unknown, path: readonly string[]) => void} visit
 */
function parameterLeaves(parameter, value, path, visit) {
  const spec = parameterVariant(parameter, value);
  if (spec.type === "array" && Array.isArray(value))
    value.forEach((item, index) =>
      parameterLeaves(
        /** @type {Parameter} */ (spec.items),
        item,
        [...path, String(index)],
        visit,
      ),
    );
  else if (spec.type === "object" && value && typeof value === "object")
    Object.entries(spec.properties ?? {}).forEach(([key, child]) =>
      parameterLeaves(
        child,
        /** @type {Record<string, unknown>} */ (value)[key],
        [...path, key],
        visit,
      ),
    );
  else visit(spec, value, path);
}

/** Field paths supplied to the runner's ordinary source-row alignment.
 * @param {ParameterSchema} schema @param {Record<string, unknown>} values
 * @returns {(string | readonly string[])[]}
 */
export function parameterFields(schema, values) {
  /** @type {(string | readonly string[])[]} */
  const fields = [];
  for (const [name, spec] of Object.entries(schema))
    parameterLeaves(spec, values[name], [name], (leaf, value, path) => {
      if (leaf.type === "field" && value != null)
        fields.push(path.length === 1 ? path[0] : path);
    });
  return fields;
}

/** Fields and expressions used by an active schema branch, before scalar evaluation.
 * @param {ParameterSchema} schema @param {Record<string, unknown>} values
 * @param {boolean | undefined} [grid]
 */
export function parameterDependencies(schema, values, grid) {
  /** @type {unknown[]} */
  const fields = [];
  /** @type {import("../utils/transforms/dependencies.js").Expression[]} */
  const expressions = [];
  for (const [name, parameter] of Object.entries(schema)) {
    if (
      grid !== undefined &&
      parameter.when &&
      parameter.when !== (grid ? "grid" : "rows")
    )
      continue;
    const value = values[name] ?? parameter.default;
    parameterLeaves(parameter, value, [name], (spec, current) => {
      if (spec.type === "field" && typeof current === "string")
        fields.push(current);
      else if (spec.type === "expression")
        expressions.push(...parameterExpressions(current));
    });
  }
  return { fields, expressions };
}
