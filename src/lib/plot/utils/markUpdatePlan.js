// @ts-check
import { isLiteral } from "./categorical.js";
import { refinesPieces } from "./curves.js";
import { sameRows } from "./dataView.js";
import {
  expressionDescriptor,
  expressionFields,
  expressionHasReduction,
  isExpression,
} from "./expressions.js";
import { responseResources } from "./interaction.js";
import {
  changedPreparationChannels,
  channelDependencyKey,
  sameDependencyKey,
} from "../binding/preparationDependencies.js";
import { capability } from "./markKinds.js";

/**
 * @typedef {import("@hmplot/jax").Array} JaxArray
 * @typedef {import("./internalTypes.js").RendererField} RendererField
 * @typedef {import("./viewControllerTypes.js").BrushResource} InteractionResource
 * @typedef {import("./markPlanTypes.js").Channels} Channels
 * @typedef {import("./markPlanTypes.js").PlannedRows} PlannedRows
 * @typedef {import("./markPlanTypes.js").MarkDataRequest} MarkDataRequest
 * @typedef {import("./markPlanTypes.js").PlannedPreparation} PlannedPreparation
 * @typedef {import("./markPlanTypes.js").PlannedMark} PlannedMark
 * @typedef {import("./markPlanTypes.js").MarkUpdateState} MarkState
 * @typedef {import("./markPlanTypes.js").MarkUpdateInputs} MarkUpdate
 * @typedef {Record<string, unknown> | null} ChangedChannels The channels whose dependencies
 *   changed, with their new values (changedPreparationChannels); null when unknown.
 */

/**
 * Channel values alike for preparation: the same object, equal literals (a theme's shape is
 * wrapped anew each time), or equal expression trees.
 * @param {Channels} a
 * @param {Channels} b
 */
export const sameChannels = (a, b) => {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) =>
      Object.is(a[key], b[key]) ||
      (isLiteral(a[key]) &&
        isLiteral(b[key]) &&
        Object.is(a[key].value, b[key].value)) ||
      (isExpression(a[key]) &&
        isExpression(b[key]) &&
        JSON.stringify(expressionDescriptor(a[key])) ===
          JSON.stringify(expressionDescriptor(b[key]))),
  );
};

// A scale whose domain the mark's rows infer: any change to them needs preparation.
/** @param {PlannedPreparation} entry */
const inferredScale = (entry) =>
  entry.scaleBindings?.some((binding) => !binding.scale.normalization.explicit);

/**
 * How namedMark applies an update to its published preparation (TODO 118.1). The first that
 * applies wins: "reuse-static" keeps the entry, "write-live" (with `channels`) writes the
 * changed numeric channels into its fields, "swap-mask" replaces a padded view's row mask, and
 * "prepare" prepares the mark again. The caller runs the chosen path and owns publication:
 * reuse and swap accept at once, live writes by newest completed order (writeLive).
 *
 * `state` is what the mark holds: its `kind`, the published `entry` (`current`), the entry on
 * screen (`shown`), the newest full preparation's request (`requested`), the drawn `mark`
 * object, and whether a transition frame shows (`transitioning`), an interaction owns its positions
 * (`interactivePositions`), a placement computes its offsets (`placement`) and its axis domains ignore its rows
 * (`domainsFixed`). `next` is this update's request: its `scope`, the `markScope` it draws,
 * the data `generation`, the `revision`, the channels (`props`), their `animation`, their
 * preparation `dependencies` and the padded `mode`. Neither is changed.
 *
 * What each kind may write in place, and which families reuse statically, are its capabilities
 * (liveChannels, liveWriter, retains: utils/markKinds.js, TODO 118.2).
 * @param {MarkState} state
 * @param {MarkUpdate} next
 * @returns {import("./markPlanTypes.js").MarkUpdateAction}
 */
export function planMarkUpdate(state, next) {
  const request = state.entry?.request;
  // The published request's rows, data generation, revision and channels are this one's. An
  // entry without a request (none published) is not.
  /** @type {boolean | undefined} */
  let same;
  const equivalent = () =>
    (same ??=
      !!request &&
      sameRows(request.markScope, next.markScope) &&
      request.generation === next.generation &&
      request.revision === next.revision &&
      sameChannels(request.channels, next.props));
  const changed = changedPreparationChannels(
    request?.dependencies,
    next.dependencies,
    next.props,
  );
  if (canReuseStatic(state, next, equivalent, changed))
    return { action: "reuse-static" };
  const channels = canWriteLive(state, next, equivalent, changed);
  if (channels) return { action: "write-live", channels };
  if (
    next.mode === "scattered" &&
    canSwapMask(
      state,
      /** @type {MarkUpdate & {scope: PlannedRows}} */ (next),
      equivalent,
      changed,
    )
  )
    return { action: "swap-mask" };
  return { action: "prepare" };
}

/**
 * How namedMark applies an interaction's membership change (hover, select, brush) to channels
 * that read it (TODO 118.2). "write-feedback" rewrites `channel`'s `field` in place: the one
 * channel reading interaction state is one the kind rewrites as feedback (its feedbackChannels,
 * Points' size), without a scale, a screen-space placement, a transition on screen or series rows, and
 * the field holds every drawn row; such a change moves no rows, positions or domains.
 * Otherwise "replan": the update runs again through planMarkUpdate.
 *
 * `state`: the `kind`, the published `entry`, the drawn `mark`, `transitioning` and `placement` as
 * for planMarkUpdate. `next`: the channels (`props`), the `markScope` the mark draws and the
 * `interactionChannels`, the [channel, value] pairs reading "@" columns.
 * @param {Pick<MarkState, "kind" | "entry" | "mark" | "transitioning" | "placement">} state
 * @param {{ props: Channels, markScope: PlannedRows | null | undefined,
 *   interactionChannels: [string, unknown][] }} next
 * @returns {{ action: "replan" } | { action: "write-feedback", channel: string,
 *   field: RendererField }}
 */
export function planFeedbackUpdate(state, next) {
  const { props, markScope, interactionChannels } = next;
  const channel =
    interactionChannels.length === 1 ? interactionChannels[0][0] : undefined;
  const field =
    channel === undefined ? undefined : state.mark?.fields?.get(channel);
  if (
    channel === undefined ||
    !field ||
    !capability(state.kind, "feedbackChannels")?.includes(channel) ||
    props[channel + "Scale"] ||
    state.placement ||
    state.transitioning ||
    state.entry?.interactionIndex ||
    field?.count !== markScope?.length
  )
    return { action: "replan" };
  return { action: "write-feedback", channel, field };
}

// A constant, noninteractive mark that retains its static dependencies (Text: retains "static")
// may keep its atlas, fields and active keyed fade when upstream columns it never reads change.
// Dynamic text/footprint channels still prepare. These checks are Text's invalidation inputs
// (fonts bump the revision); another family opts in only once its own are covered.
/**
 * @param {MarkState} state
 * @param {MarkUpdate} next
 * @param {() => boolean} equivalent
 * @param {ChangedChannels} changed
 */
function canReuseStatic(state, next, equivalent, changed) {
  const { kind, entry, mark } = state,
    { markScope, props, animation } = next;
  const request = entry?.request,
    binding = entry?.interaction;
  if (
    capability(kind, "retains") !== "static" ||
    !entry ||
    !mark ||
    mark.isDisposed ||
    request !== state.requested ||
    entry.connections ||
    entry.interactionIndex ||
    entry.paddedMode ||
    refinesPieces(mark) ||
    entry.drag ||
    state.interactivePositions ||
    state.placement ||
    entry.tooltip ||
    entry.nearest ||
    [
      binding?.selection,
      binding?.hover,
      binding?.brush,
      binding?.nearby,
      binding?.nearest,
    ].some(Boolean) ||
    responseResources(binding).length ||
    Object.keys(props).some((name) => /^on/.test(name)) ||
    inferredScale(entry)
  )
    return false;
  if (!request || !equivalent()) return false;
  return changed
    ? !Object.keys(changed).length
    : !Object.keys(animation.liveChannels ?? {}).length &&
        sameDependencyKey(
          request.staticDependencies,
          channelDependencyKey(props, markScope),
        );
}

// The kind's writer replaces every channel in place (its liveChannels, utils/markKinds.js).
/**
 * @param {string} kind
 * @param {Channels | null | undefined} channels
 * @returns {channels is Channels}
 */
const writable = (kind, channels) => {
  const names = Object.keys(channels ?? {}),
    live = capability(kind, "liveChannels");
  return Boolean(
    live?.length && names.length && names.every((name) => live.includes(name)),
  );
};

// Current numeric geometry preserves prepared topology, static paint and field ownership.
// Domain summaries read the completed batch; inferred paint scales still prepare normally.
/**
 * @param {MarkState} state
 * @param {MarkUpdate} next
 * @param {() => boolean} equivalent
 * @param {ChangedChannels} changes
 * @returns {Channels | null}
 */
function canWriteLive(state, next, equivalent, changes) {
  const { kind, entry, mark } = state,
    { scope, markScope, props, animation } = next;
  const request = entry?.request;
  // The label writer writes only channels whose dependencies it knows changed, and keeps a
  // scattered mask it does not rewrite (utils/markKinds.js).
  const labels = capability(kind, "liveWriter") === "labels";
  const channels = changes ?? (labels ? null : (animation?.liveChannels ?? {}));
  const fixedMask =
    labels &&
    entry?.paddedMode === "scattered" &&
    entry.valid === markScope?.valid &&
    !Object.hasOwn(channels ?? {}, "opacity");
  if (
    // A mark fed arrays directly has no rows to write its channels from.
    !scope ||
    !mark ||
    !entry ||
    entry !== state.shown ||
    state.transitioning ||
    request !== state.requested ||
    !writable(kind, channels) ||
    entry.connections ||
    entry.interactionIndex ||
    entry.drag ||
    // Placement offsets read every row's position and require a fresh preparation.
    state.placement ||
    // Band offsets are added to x and y while preparing (namedData), not by the writer.
    props?.xOffset !== undefined ||
    props?.yOffset !== undefined ||
    (entry.paddedMode && !fixedMask) ||
    refinesPieces(mark)
  )
    return null;
  if (!request || !equivalent()) return null;
  if (
    inferredScale(entry) ||
    (scope.followsMask && !labels) ||
    // An animated channel prepares, except opacity: the writer composes it as row opacity.
    Object.keys(channels).some(
      (channel) => animation.channels?.[channel] && channel !== "opacity",
    )
  )
    return null;
  if (
    Object.keys(channels).some(
      (channel) =>
        entry.metadata?.[channel] ||
        entry.temporal?.[channel] ||
        entry.rgb?.[channel] ||
        channel === "shape",
    )
  )
    return null;
  // Feedback composition and scalar/row representation changes retain full preparation.
  if (
    labels &&
    (state.interactivePositions ||
      entry.lifecycleInteraction ||
      (channels?.opacity !== undefined &&
        (!entry.expressionOpacity ||
          responseResources(entry.interaction).some(
            (resource) => resource.active || resource.previewActive,
          ))))
  )
    return null;
  /** @type {Set<string>} */
  const liveReads = new Set();
  for (const expression of Object.values(channels)) {
    if (typeof expression === "string") liveReads.add(expression);
    else expressionFields(expression, liveReads);
  }
  for (const field of liveReads)
    if (
      !field.startsWith("@") &&
      /** @type {(string | undefined)[]} */ ([
        "categorical",
        "ordinal",
        "boolean",
        "datetime",
        "duration",
      ]).includes(markScope?.metadata?.(field)?.type)
    )
      return null;
  if (labels) return channels;
  return sameDependencyKey(
    request.liveDependencies,
    channelDependencyKey(props, markScope, channels),
  )
    ? channels
    : null;
}

/**
 * 17.2c/17.3b: when only the valid rows of the padded view a scattered mark draws changed (same
 * rows, channels, options and data generation as the published preparation, and nothing the
 * mark infers from its rows: axis domains and continuous scale domains are fixed), the mark
 * swaps its row opacity instead of preparing and uploading every field again. A channel whose
 * columns changed too (a Calculate before the Filter: TODO 118.2) needs its values written.
 * @param {MarkState} state
 * @param {MarkUpdate & {scope: PlannedRows}} next
 * @param {() => boolean} equivalent
 * @param {ChangedChannels} changed
 */
function canSwapMask(state, next, equivalent, changed) {
  const { entry } = state;
  if (
    !entry?.filterMembership ||
    entry !== state.shown ||
    state.transitioning ||
    entry.request !== state.requested
  )
    return false;
  if (!equivalent() || (changed && Object.keys(changed).length)) return false;
  if (!state.domainsFixed || inferredScale(entry)) return false;
  // Values that follow the shown rows change too: an upstream aggregate or reduction
  // (createDataView's followsMask), or a channel over a reduction (mean(x)).
  return !(
    next.scope.followsMask ||
    Object.values(next.props).some(expressionHasReduction)
  );
}
