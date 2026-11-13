// @ts-check
/**
 * A Plot's `effects` (TODO 138.3): a list of { kind, ...parameters }, composited after the scene
 * pass (utils/presentation.js). The built-in kinds are "bloom" and "fog"; any other kind is a
 * plugin's (registerPlugin; the sky is a first-party one, TODO 138.5), checked against its
 * parameter schema and its own check. A kind nothing registers is plugin.missing: the plot draws
 * without it, and draws it once its plugin arrives.
 *
 * readEffects is pure: it returns what the Plot's presentation applies and what it reports.
 */
import { checkSchema, parameterProblem, withDefaults } from "../plugins/parameters.js";
import { diagnostic } from "./diagnostics.js";

/** Bloom's parameters (TODO 138.2): its look when a mark glows; the settings pane edits them. */
export const BLOOM_PARAMETERS = checkSchema(
  "bloom",
  Object.freeze({
    strength: { type: "number", default: 1, min: 0, label: "Bloom strength", step: 0.1, sliderMax: 5 },
    radius: { type: "number", default: 0.5, min: 0, max: 1, label: "Bloom radius", step: 0.05 },
  }),
);
export const BLOOM_DEFAULTS = Object.freeze(withDefaults(BLOOM_PARAMETERS));
/** The built-in effects' parameters, as messages list them. */
const BUILT_IN = Object.freeze({
  bloom: Object.keys(BLOOM_PARAMETERS),
  fog: ["near", "far", "color"],
});
export const BUILT_IN_EFFECTS = Object.freeze(Object.keys(BUILT_IN));

/** @param {unknown} value @returns {value is number} */
const finite = (value) => typeof value === "number" && Number.isFinite(value);
/** @param {unknown} value */
const show = (value) => {
  if (typeof value === "string" || (value && typeof value === "object" && !(typeof Blob !== "undefined" && value instanceof Blob)))
    try {
      return JSON.stringify(value);
    } catch {
      /* cyclic: as a string */
    }
  return String(value);
};
/** @param {string} value */
const cssColor = (value) => globalThis.CSS?.supports?.("color", value) ?? true;
const FORM = 'Plot.effects is a list of { kind, ...parameters }, as effects={[{ kind: "fog", near: 50, far: 200 }]}';

/** A parameterProblem of `kind`'s ("bloom: strength is ...") as the Plot's ("Plot.effects: bloom strength is ..."). */
const named = (/** @type {string} */ kind, /** @type {string} */ problem) =>
  problem && `Plot.effects: ${kind} ${problem.slice(kind.length + 2)}`;

/**
 * The problem with fog's parameters ({ near, far, color? }, camera world units), or "".
 * @param {Record<string, any>} [parameters] @param {(value: string) => boolean} [isColor]
 */
export function fogProblem({ near, far, color } = {}, isColor = cssColor) {
  if (!finite(near) || !finite(far) || near < 0 || near >= far)
    return `Plot.effects: fog needs finite distances with 0 <= near < far; got near ${show(near)} and far ${show(far)}.`;
  if (color != null && (typeof color !== "string" || !isColor(color)))
    return `Plot.effects: fog color is a CSS color (or omitted, for the plot's background); got ${show(color)}.`;
  return "";
}

/**
 * The problem an effect's own check finds in `values` (as given), with `owner` before it
 * ("Plot.effects: sky takes image or ..."), or "". A check that throws is its plugin's failure.
 * @param {string} owner @param {any} definition @param {Record<string, unknown>} values
 * @param {Record<string, unknown>} context
 */
export function checked(owner, definition, values, context) {
  if (!definition.check) return "";
  try {
    const problem = definition.check(values, context);
    return problem ? `${owner} ${problem}` : "";
  } catch (error) {
    return `${owner}'s check failed: ${/** @type {any} */ (error)?.message ?? error}`;
  }
}

/**
 * @typedef {{ kind: string, [parameter: string]: unknown }} EffectSpec
 * @typedef {{ kind: string, definition: any, values: Record<string, unknown> }} PluginEffect
 * @typedef {{
 *   problems: string[],
 *   missing: Error | null,
 *   bloom: Record<string, unknown> | null,
 *   fog: Record<string, unknown> | null,
 *   plugins: PluginEffect[],
 * }} Effects
 */

/**
 * What a Plot's `effects` asks for: the built-ins' parameters (null where not listed), the
 * plugins' effects with their definitions and values (defaults filled in), the problems (each an
 * error on the plot; an effect with one is left out) and one plugin.missing diagnostic naming
 * every kind no plugin registers.
 * @param {unknown} effects the prop: undefined, or a list of { kind, ...parameters }
 * @param {{ get(stage: string, kind: string): any, missing(stage: string, kind: string, builtIn?: readonly string[]): Error }} registry
 * @param {(value: string) => boolean} [isColor]
 * @param {{ threeD?: boolean, plot?: string }} [context] what an effect's check reads: whether the
 *   Plot is 3D, and how messages name it ("the Plot")
 * @returns {Effects}
 */
export function readEffects(effects, registry, isColor = cssColor, context = { threeD: true, plot: "the Plot" }) {
  /** @type {Effects} */
  const result = { problems: [], missing: null, bloom: null, fog: null, plugins: [] };
  if (effects == null) return result;
  if (!Array.isArray(effects)) {
    result.problems.push(`${FORM}; got ${show(effects)}.`);
    return result;
  }
  const seen = new Set(), missing = [];
  for (const spec of effects) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec) || typeof spec.kind !== "string" || !spec.kind) {
      result.problems.push(`${FORM}; got ${show(spec)} in it.`);
      continue;
    }
    const { kind, ...values } = /** @type {EffectSpec} */ (spec);
    if (seen.has(kind)) {
      result.problems.push(`Plot.effects lists ${kind} twice; keep one.`);
      continue;
    }
    seen.add(kind);
    if (Object.hasOwn(BUILT_IN, kind)) {
      const known = BUILT_IN[/** @type {keyof typeof BUILT_IN} */ (kind)];
      const unknown = Object.keys(values).filter((key) => values[key] !== undefined && !known.includes(key));
      const problem = unknown.length
        ? `Plot.effects: ${kind} ${unknown.map((key) => `"${key}"`).join(", ")} ${unknown.length > 1 ? "are" : "is"} not one of its parameters (${known.join(", ")}).`
        : kind === "fog" ? fogProblem(values, isColor)
          : named(kind, parameterProblem(kind, BLOOM_PARAMETERS, values, isColor));
      if (problem) result.problems.push(problem);
      else if (kind === "bloom") result.bloom = withDefaults(BLOOM_PARAMETERS, values);
      else result.fog = values;
      continue;
    }
    const definition = registry.get("effect", kind);
    if (!definition) {
      missing.push(kind);
      continue;
    }
    if (definition.stage === "object") {
      result.problems.push(`Plot.effects: ${kind} adds an object to a Frame's scene; a Plot does not list it.`);
      continue;
    }
    const schema = definition.parameters ?? {};
    const problem = named(kind, parameterProblem(kind, schema, values, isColor)) || checked(`Plot.effects: ${kind}`, definition, values, context);
    if (problem) result.problems.push(problem);
    else result.plugins.push({ kind, definition, values: withDefaults(schema, values) });
  }
  if (missing.length === 1) result.missing = registry.missing("effect", missing[0], BUILT_IN_EFFECTS);
  else if (missing.length)
    result.missing = diagnostic(
      "plugin.missing",
      `No plugin registers the effects ${missing.join(", ")}, so the plot draws without them. A JavaScript app passes their plugins to registerPlugin(); Python installs their packages.`,
      { component: "Plugin" },
    );
  return result;
}
