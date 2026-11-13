// @ts-check
import { isExpression, expressionFields } from "../expressions.js";
import { isViewStateField, viewStateReads } from "../viewState.js";
import { onMembershipChange } from "../interaction.js";

/**
 * TRANSFORM DEPENDENCIES (refactor plan P4d). Besides its input's publications, a transform
 * re-runs when something its settings read changes: interaction state ("@brushed", a
 * selection), the view clock (@time) or the pointer (@pointer_x). A definition says what it
 * reads with `dependencies(settings)`, from its effective settings (inputs resolved, overrides
 * applied), returning any of:
 *   expressions: the expressions it evaluates. Their "@" fields are interaction state it reads
 *     (an @any_ field reads its @ resource) and their view-state reads time it by the clock or
 *     the pointer (viewState.js).
 *   fields: field names it reads directly, not through an expression (Filter where="@brushed",
 *     Bin weight="@brushed"); an "@" one is looked up as named.
 *   resources: interaction resources it reads directly (Filter where={selection}).
 * This is not the definition's `reads`, which says which form of the input's rows it reads
 * (runner.js). A kind whose definition declares nothing reads its expression-valued parameters
 * only (transformDependencies in transforms.js).
 *
 * analyzeDependencies turns a declaration into what the transform component subscribes to;
 * interactionResources finds the interaction resources in a scope, once each; watchResources
 * keeps those subscriptions as the settings change.
 */

/**
 * @typedef {import("../../publicTypes.js").Expression} Expression
 * @typedef {import("../viewControllerTypes.js").BrushResource} InteractionResource A selection
 *   resource (interaction.js selection()): a brush, hover or Filter where={selection} alike.
 * @typedef {{ expressions?: unknown[], fields?: unknown[],
 *   resources?: (InteractionResource | null | undefined)[] }} DependencyDeclaration
 * @typedef {ReturnType<typeof analyzeDependencies>} DependencyAnalysis
 */

/**
 * The expressions of a parameter that takes one, or one per axis ({x: expression, y: 20}).
 * @param {unknown} value
 * @returns {Expression[]}
 */
export function parameterExpressions(value) {
  if (isExpression(value)) return [value];
  if (value && typeof value === "object" && !Array.isArray(value))
    return Object.values(value).filter(isExpression);
  return [];
}

/**
 * @param {unknown} field
 * @returns {field is string}
 */
const isInteractionField = (field) =>
  typeof field === "string" &&
  field.startsWith("@") &&
  !isViewStateField(field);

/**
 * What a declaration subscribes to: `expressions` (those evaluated, for the view-state change
 * key), `clock` (it reads @time, live or stepped), `live`, `pointer` (it reads the pointer or the
 * visible domain), `interaction` (the "@" fields to look up as resources, once each) and
 * `resources` (those read directly).
 * @param {DependencyDeclaration} [declaration]
 */
export function analyzeDependencies({
  expressions = [],
  fields = [],
  resources = [],
} = {}) {
  const values = expressions.filter(isExpression);
  const reads = values.reduce(
    (output, value) => viewStateReads(value, output),
    { live: false, stepped: false, tracked: false },
  );
  /** @type {Set<string>} */
  const interaction = new Set();
  for (const value of values)
    for (const field of expressionFields(value))
      if (isInteractionField(field))
        interaction.add(field.replace(/^@any_/, "@"));
  for (const field of fields)
    if (isInteractionField(field)) interaction.add(field);
  return {
    expressions: values,
    clock: reads.live || reads.stepped,
    live: reads.live,
    pointer: reads.tracked,
    interaction: [...interaction],
    resources: resources.filter((resource) => !!resource),
  };
}

/**
 * Whether a run depends on interaction state: then its revision is part of what the run serves.
 * @param {DependencyAnalysis} analysis
 */
export const readsInteraction = (analysis) =>
  analysis.interaction.length > 0 || analysis.resources.length > 0;

/**
 * The interaction resources an analysis reads in `scope`, each once.
 * @param {DependencyAnalysis} analysis
 * @param {{ interactionResource?: (field: string) => InteractionResource | null | undefined }
 *   | null | undefined} scope
 */
export function interactionResources(analysis, scope) {
  const found = new Set(analysis.resources);
  for (const field of analysis.interaction) {
    const resource = scope?.interactionResource?.(field);
    if (resource) found.add(resource);
  }
  return found;
}

/**
 * Subscriptions to interaction resources that follow the settings: update(resources) keeps
 * those still read, subscribes the new ones and releases the ones no longer read, so a replaced
 * dependency stops waking the transform. onChange runs when a watched resource's membership (or
 * whether it is active) changes.
 * @param {() => void} onChange
 */
export function watchResources(onChange) {
  /** @type {Map<InteractionResource, () => void>} */
  let stops = new Map();
  return {
    /** @param {Iterable<InteractionResource>} resources */
    update(resources) {
      /** @type {Map<InteractionResource, () => void>} */
      const next = new Map();
      for (const resource of resources) {
        if (next.has(resource)) continue;
        next.set(
          resource,
          stops.get(resource) ?? onMembershipChange(resource, onChange),
        );
      }
      for (const [resource, stop] of stops) if (!next.has(resource)) stop();
      stops = next;
    },
    get size() {
      return stops.size;
    },
    stop() {
      this.update([]);
    },
  };
}
