import { expressionEvaluator } from "./expressionPlans.js";
import { dataBufferLimit } from "./dataView.js";
import { resolveParameterExpressions } from "./transforms/parameters.js";
import { check, configViewState } from "./transforms/common.js";
import { runDefinition } from "./transforms/runner.js";
import { definitions } from "./transforms/index.js";
import { expressionParameters, transformParameters } from "../plugins/parameters.js";
import { transformGrid } from "../plugins/transformGrid.js";
import { parameterExpressions } from "./transforms/dependencies.js";
import { plugins } from "../plugins/runtime.js";
import { runPluginTransform, pluginTransformDependencies } from "../plugins/transform.js";
plugins.reserve("transform", definitions.keys());
export { bucketing, bucketSize } from "./transforms/filter.js";
export { disposeTransformCache } from "./transforms/common.js";
export { transformProducerDeadline } from "./transforms/runner.js";
export {
  normalQuantile,
  validateReducers,
  BIN_RULES,
  binCountFromRule,
  validateBinEdges,
} from "./transforms/statistics.js";

/**
 * Transform parameters that accept an expression instead of a number, so a bin count or a
 * bandwidth can be derived from the data: `bins: power(count(col.x), 0.5)`. Each transform
 * declares them in its definition's parameter schema ({ type: "expression" }, TODO 138.2), by
 * name: "integer" (rounded) or "number". Channels take reductions as ordinary per-row
 * broadcasts; every other option takes a plain number.
 */
export function expressionParams(kind) {
  return expressionParameters(definitions.get(kind)?.parameters ?? plugins.get("transform", kind)?.parameters);
}
/** Every kind with expression parameters, by kind (the Python metadata's expressionParams). */
export function allExpressionParams() {
  return Object.fromEntries([...definitions.keys(), ...plugins.kinds("transform")]
    .map((kind) => [kind, expressionParams(kind)]).filter(([, props]) => Object.keys(props).length));
}

export async function resolveTransformParameters(kind, config, scope, cache) {
  config = transformDefaults(kind, config, scope);
  return resolveParameterExpressions(kind, config, expressionParams(kind), scope, {
    evaluator: cache ? expressionEvaluator(cache) : undefined,
    viewState: configViewState(config),
  });
}

/** Supply plugin defaults before input resolution, dependency planning and evaluation. */
export function transformDefaults(kind, config, scope) {
  const plugin = plugins.get("transform", kind);
  return plugin && !definitions.has(kind)
    ? transformParameters(kind, plugin.parameters ?? {}, config, Boolean(scope && transformGrid(scope)))
    : config;
}

/** The axis whose frame category order a transform of `kind` reads (TODO 130.1), or null. */
export const transformCategoryAxis = (kind, settings) =>
  (definitions.get(kind) ?? plugins.get("transform", kind))?.categoryAxis?.(settings) ?? null;

/** The value axis (0 x, 1 y) a transform of `kind` lays its rows along (TODO 130.2), or null. */
export const transformValueAxis = (kind, settings, source) =>
  definitions.get(kind)?.valueAxis?.(settings, source) ?? null;

/** Whether this definition owns expression tween producers (rather than reading them). */
export const transformOwnsTweens = (kind) => Boolean(definitions.get(kind)?.tweens);

/** Domain fields for viewport-dependent geometry, or null to use a mark's own fields. */
export const transformDomainFields = (kind, settings) =>
  definitions.get(kind)?.domainFields?.(settings) ?? null;

/** A definition's plan for a common bin geometry across facet cells, or null. */
export const transformSharedBins = (kind, settings) => settings.sharedBins === false
  ? null : definitions.get(kind)?.sharedBins?.(settings) ?? null;

/**
 * What a transform reads from its settings, besides its input (transforms/dependencies.js): its
 * definition's declaration. A kind that declares none (not yet migrated, or without a
 * definition) reads its expression-valued parameters only.
 */
export function transformDependencies(kind, settings, scope) {
  const plugin = plugins.get("transform", kind);
  if (plugin && !definitions.has(kind)) return pluginTransformDependencies(plugin, settings, scope);
  const declared = definitions.get(kind)?.dependencies;
  if (declared) return declared(settings);
  return {
    expressions: Object.keys(expressionParams(kind)).flatMap((prop) =>
      parameterExpressions(settings[prop]),
    ),
  };
}

/** Transform runs in this page: performance tests read `count` (TODO 17.2d, 17.9). */
export const transformRuns = { count: 0 };

export async function runTransform(
  kind,
  scope,
  config = {},
  { signal = undefined, maxBytes = dataBufferLimit(), cache = undefined } = {},
) {
  transformRuns.count++;
  check(signal);
  // Transforms written to the contract (utils/transforms/runner.js; TODO 31.2).
  const definition = definitions.get(kind);
  if (definition)
    return runDefinition(kind, definition, scope, config, {
      signal,
      maxBytes,
      cache,
      runTransform,
    });
  const plugin = plugins.get("transform", kind);
  if (plugin)
    return runPluginTransform(kind, plugin, scope, config, {
      signal, maxBytes, cache, runTransform,
    });
  throw Error(`Unknown transform: ${kind}`);
}
