<script>
  // @ts-check
  import { useReporter } from "../utils/reporter.js";
  import {
    ANIMATION_GROUP_CONTEXT,
    animationCorrespondenceCache,
  } from "../utils/animationGroup.js";
  import {
    createExpressionEvaluator,
    registerExpressionDiagnostics,
  } from "../utils/expressionPlans.js";
  import { adoptJaxValues } from "../utils/foreignJax.js";
  import { nonlinearFrame } from "../utils/frameMapping.js";
  import { placedFrame } from "../utils/framePlacement.js";
  import { validateCurveInput } from "../utils/curves.js";
  import { MAPPING_CONTEXT, resolveMappings } from "../utils/mapping.js";
  import { THEME_CONTEXT, markTheme } from "../utils/theme.js";
  import { labelFontRevision, onLabelFontChange } from "../utils/labelAtlas.js";
  import { AXIS_CONTEXT, VIEW_CONTEXT } from "../utils/axisFrame.js";
  import { ROOT_CONTENT_CONTEXT } from "../utils/rootFrameSelection.js";
  import DragControllerView from "../dragController.svelte";
  import { DragController } from "../utils/dragController.svelte.js";
  import { registerLayoutView } from "../utils/forceContext.js";
  import {
    readsOffsets,
    scopeReadsOffsets,
  } from "../interaction/offsetDependencies.js";
  import { getContext, onDestroy, untrack, tick } from "svelte";
  import { useThrelte, useTask } from "@threlte/core";
  import { getOptionsContext } from "../utils/context.js";
  import { createPlacementController } from "../utils/markPlacement.js";
  import { scalar, categoryColumn } from "../utils/dataView.js";
  import {
    facetService,
    partitionGroup as partitionGroupContext,
  } from "../utils/facetService.js";
  import { asArray, shapeOf } from "../utils/data.js";
  import { markElementLimit } from "../utils/markElementLimit.svelte.js";
  import { literal } from "../utils/categorical.js";
  import {
    markData,
    rowsSetting,
    boundProps,
    boundDomainless,
  } from "../utils/markRows.js";
  import {
    prepareNamed,
    checkRgbArrays,
    NAMED_FIELDS,
    legendCategories,
  } from "../utils/namedData.js";
  import {
    INPUT_CONTEXT,
    InputPending,
    resolveInputs,
  } from "../utils/inputs.js";
  import { scaleProps, dashProps } from "../utils/scaleProps.js";
  import { onShapeRegistered } from "../utils/shapes.js";
  import {
    bindContinuousScales,
    needsContinuousScale,
    scaleOptions,
    numericExtent,
  } from "../utils/scaleBindings.js";
  import {
    createDataIdentity,
    interactionResource,
    interactionRows,
    brushColumn,
    onMembershipChange,
  } from "../utils/interaction.js";
  import { createDisplayedFrames } from "../utils/displayedFrames.js";
  import { decodedSourceRows } from "../utils/sourceRows.js";
  import { numpy as np, Array as JaxArray } from "@hmplot/jax";
  import { partitionSeries, seriesBrush } from "../utils/series.js";
  import { registryFor, applyCategoryToggle } from "../utils/guides.js";
  import { useViewServices, reports } from "../utils/viewServices.js";
  import { usePlotRenderer } from "../utils/plotRenderer.js";
  import {
    createBindingPublisher,
    retainPreparation,
  } from "../utils/markBinding.js";
  import {
    frameCompatibility,
    nestedCoordinateOverride,
    sphericalAncestor,
  } from "../utils/frameMarks.js";
  import { FieldType } from "../objects/types.js";
  import { settleUploads } from "../rendering/uploadSettlement.js";
  import { trackPreparation } from "../rendering/viewSettlement.js";
  import {
    retirePrepared,
    replaceableRelease,
  } from "../binding/preparedMarkDisposal.js";
  import {
    createProceduralChannels,
    queueLiveGeometry,
  } from "../utils/proceduralChannels.js";
  import {
    channelDependencyKey,
    capturePreparationDependencies,
  } from "../binding/preparationDependencies.js";
  import {
    planMarkUpdate,
    planFeedbackUpdate,
  } from "../utils/markUpdatePlan.js";
  import { installMarkInteractionEvents } from "../binding/markInteractionEvents.js";
  import { createInputWriters } from "../utils/inputWriters.js";
  import { createMarkPreparation } from "../utils/markPreparation.js";
  import { nameNode, nodeField } from "../utils/names.js";
  import {
    evaluateExpression,
    expressionFields,
    isExpression,
    literalValued,
    releaseReductionCache,
    resolveOffsetShorthands,
  } from "../utils/expressions.js";
  import { viewState } from "../utils/viewState.js";
  import { frameEdgeCodes } from "../utils/frameEdges.js";
  import { createMarkMotion } from "../utils/markMotion.js";
  import { TRANSFORM_KINDS } from "../utils/animation.js";
  import {
    applyAnimation,
    channelAnimation as animationOfChannels,
    fieldAnimation as fieldAnimationSpecs,
  } from "../utils/channelAnimation.js";
  import { capability, kindsWith, hiddenRowsForm } from "../utils/markKinds.js";
  import { frameDimensionStages } from "../utils/frameMapping.js";
  import { affineAncestors } from "../utils/coordinateOperations.js";
  import {
    createEndpointController,
    ENDPOINT_COMPOUND_CONTEXT,
  } from "../utils/endpointController.js";
  import { createConnectionController } from "../utils/connectionController.js";
  import { startFeedbackOpacity } from "../utils/feedbackOpacity.js";
  import { createMarkTooltip } from "../utils/markTooltip.js";
  import { createMarkDomainPublisher } from "../utils/markDomainPublisher.js";
  import { coordinateView } from "../utils/coordinates.js";
  import { useLayerSlot } from "../utils/layerSlot.svelte.js";
  import { axisColumnIdentities } from "../utils/axisColumns.js";
  import {
    markAxisTitles,
    channelTitle,
    AXIS_NAMES_CONTEXT,
  } from "../utils/axisTitles.js";
  import {
    DESCRIPTION_CONTEXT,
    COMPOUND_DESCRIPTION_CONTEXT,
  } from "../utils/describe.js";
  import {
    TOOLTIP_CONTEXT,
    DEFAULT_TOOLTIP_RADIUS,
    tooltipSetting,
    tooltipMode,
    nearestSetting,
    defaultFields,
  } from "../utils/tooltip.js";
  import { readAxis } from "../utils/axes.js";
  import { axisText } from "../utils/axisText.svelte.js";
  import { labelNumbers } from "../utils/numericText.js";
  /** @typedef {import("../utils/internalTypes.js").PreparedMark} PreparedMark */
  /** @typedef {import("../utils/markPlanTypes.js").PreparedAnimation} PreparedAnimation */
  /** @typedef {import("../utils/markPlanTypes.js").PreparedInteraction} PreparedInteraction */
  /** @typedef {import("../utils/markPlanTypes.js").NamedScope} NamedScope */
  /** @typedef {import("../utils/markPlanTypes.js").Channels} Channels */
  /** @typedef {import("../utils/viewControllerTypes.js").MembershipResource} MembershipResource */
  /** @typedef {import("../utils/internalTypes.js").Release} Release */
  /** @typedef {import("../utils/internalTypes.js").PreparationJob} PreparationJob */
  /** @typedef {import("../utils/expressionPlanTypes.js").EagerEvaluationOptions} EvaluationOptions */
  /** @typedef {import("../utils/effectiveFieldBinding.js").FieldValue} FieldValue */
  /** @type {{component: import("svelte").Component<any, import("../utils/markPlanTypes.js").MarkComponentExports>, kind: string, values: object}} */
  let { component: Component, kind, values: given } = $props();
  // Input reads (TODO 41) are replaced by the inputs' values before anything here reads the
  // mark's props; a "$name" string reads in a channel (a column's place). A Python scene's reads
  // arrive replaced already (SceneNode.svelte).
  const inputStore = getContext(INPUT_CONTEXT) ?? null;
  const writers = createInputWriters(inputStore, () => kind);
  // domains={false}, rows="auto", Text format="axis" (TODO 130.1; utils/markRows.js, axisText.svelte.js):
  // no automatic domains, one item when no channel reads a column, an axis's @ field as its readout.
  const domainless = $derived(boundDomainless(given));
  const rowsAuto = $derived(rowsSetting(kind, given));
  const textFormat = axisText(
    untrack(() => kind),
    () => given,
  );
  const withInputs = $derived.by(() => {
    const own = boundProps(given);
    try {
      // colormap becomes the mark's cmapIndex; a removed flat scale prop (fillDomain, TODO 137.4)
      // is an error naming its scale object.
      return {
        values: dashProps(
          scaleProps(
            textFormat.apply(
              resolveInputs(own, inputStore, kind, (key) =>
                NAMED_FIELDS.has(key),
              ),
            ),
            kind,
          ),
          kind,
        ),
        error: "",
        pending: false,
      };
    } catch (error) {
      // An input still reading the data: the mark waits for its value (TODO 41.2).
      if (error instanceof InputPending)
        return { values: own, error: "", pending: true };
      return {
        values: own,
        error: /** @type {Error} */ (error).message,
        pending: false,
      };
    }
  });
  const values = $derived(withInputs.values);
  const mapping = getContext(MAPPING_CONTEXT);
  const themeScope = getContext(THEME_CONTEXT);
  const frame = getContext(AXIS_CONTEXT);
  const rootOwner = getContext(ROOT_CONTENT_CONTEXT);
  const unregisterRootContent = rootOwner?.register({
    kind: "content",
    key: crypto.randomUUID(),
    parentKey: rootOwner.parentKey,
  });
  onDestroy(() => unregisterRootContent?.());
  const facet = facetService();
  // A compound mark (Bar, Histogram, ...) votes for axis titles with its user's channels.
  const compoundNames = getContext(AXIS_NAMES_CONTEXT);
  // Descriptions (TODO 49): the mark tells its Plot what it draws; a compound's parts describe
  // themselves as the compound (its ThemeDefaults).
  const describer = getContext(DESCRIPTION_CONTEXT),
    compoundDescription = getContext(COMPOUND_DESCRIPTION_CONTEXT);
  const describeOwner = { sceneNode: reports.sceneNode() }; // lints name its node
  onDestroy(() => describer?.remove(describeOwner));
  // Tooltips (TODO 44): this mark's setting, else its Plot's (viewCore); the view shows the box.
  const tooltipContext = getContext(TOOLTIP_CONTEXT);
  // An axis's metadata for its plotted values: a datetime axis counts from its time origin.
  /** @param {string} axis */
  const axisMeta = (axis) => {
    const config = readAxis(frame?.options ?? options, axis);
    return config.type === "datetime"
      ? {
          type: "datetime",
          origin: config.timeOrigin,
          timezone: config.timezone,
        }
      : undefined;
  };
  // The box, the @tooltip rows it shows and a unified tooltip's series (utils/markTooltip.js).
  const tooltips = createMarkTooltip({
    kind: untrack(() => kind),
    view: /** @type {import("../utils/internalTypes.js").ViewServices} */ (
      useViewServices()
    ),
    plotDefault: () => tooltipContext?.plotDefault,
    axisMeta,
    axisConfig: (axis) => readAxis(frame?.options ?? options, axis),
    shown: () => prepared,
    mark: () => currentMark(),
  });
  onDestroy(() => tooltips.hide());
  const facetSlot = facet?.slot();
  const partitionGroup = partitionGroupContext();
  // A compound mark (Bar, Histogram, BoxPlot) registers the primitive it mounts as its endpoint.
  const compoundSpec = (() => {
    const spec = getContext(ENDPOINT_COMPOUND_CONTEXT);
    return spec && spec.markKind === untrack(() => kind) ? spec : null;
  })();
  const { context, layout, dispose } = markData(() => rowsAuto && values);
  onDestroy(dispose);
  const reportPositional = useReporter(kind, { severity: "warning" });
  const layoutContext = layout,
    options = getOptionsContext(),
    { renderer, camera } =
      /** @type {Omit<ReturnType<typeof useThrelte>, "renderer"> & {renderer: import("../utils/internalTypes.js").PlotRenderer}} */ (
        usePlotRenderer(kind)
      ),
    viewServices =
      /** @type {import("../utils/internalTypes.js").ViewServices} */ (
        useViewServices()
      ),
    { counters } = viewServices.diagnostics;
  const numericalTargets = createExpressionEvaluator();
  onDestroy(
    registerExpressionDiagnostics(viewServices, numericalTargets, () => ({
      consumer: "mark channels",
      mark: kind,
      label: /** @type {{label?: unknown}} */ (given)?.label,
    })),
  );
  onDestroy(() => numericalTargets.dispose());
  /** @param {unknown} value @param {NamedScope} scope @param {EvaluationOptions} args */
  const evaluateNumericalTarget = (value, scope, args) => {
    const compiled = numericalTargets.stats.compiled,
      fallback = numericalTargets.stats.fallback;
    const result = numericalTargets.evaluate(value, scope, args);
    counters.numericExpressionCompiled +=
      numericalTargets.stats.compiled - compiled;
    counters.numericExpressionFallback +=
      numericalTargets.stats.fallback - fallback;
    return result;
  };
  $effect(() => registerLayoutView(layoutContext, viewServices));
  // Stage 22: the marker's document position is this mark's declaration order, even while its
  // data is still preparing; the drawing objects below it take their renderOrder from it.
  let layerMarker = $state();
  useLayerSlot(() => layerMarker);
  const domainOwner = crypto.randomUUID();
  const scaleOwners = Object.create(null);
  /** @type {import("../utils/markPlanTypes.js").NamedPreparationState & {isolation: Record<string, unknown>}} */
  const selection = {
    auto: {},
    hidden: {},
    isolation: {},
    limit: /** @type {{device?: GPUDevice}} */ (renderer.backend)?.device
      ?.limits.maxStorageBufferBindingSize,
  };
  /** @type {import("../utils/markPlanTypes.js").NamedPreparationState} */
  const domainSelection = { auto: {}, hidden: {}, limit: selection.limit },
    domainRoute = viewServices.domains.route({
      frame,
      facet,
      owner: domainOwner,
      facetOwner: selection,
    });
  const domains = createMarkDomainPublisher({
    kind: untrack(() => kind),
    options,
    frame,
    facet,
    renderer,
    route: domainRoute,
    owner: domainOwner,
    selection,
    domainSelection,
    values: () => values,
    domainless: () => domainless,
    domainSource: () => context?.domainSource?.() ?? null,
    publish: (mark, extents) => bindings.publish(mark, { extents }),
  });
  // prepareNamed keeps each categorical channel's last values here (categoryValues, TODO 33.4).
  onDestroy(() => {
    for (const entry of selection.categoryValues?.values() ?? [])
      entry.values.dispose();
    for (const entry of domainSelection.categoryValues?.values() ?? [])
      entry.values.dispose();
  });
  const dragController = new DragController(layoutContext, options);
  /** @type {ReturnType<typeof createDataIdentity> | undefined} */
  let localInteractionOwner;
  /** @type {import("../utils/internalTypes.js").PreparedMark | null} */
  let prepared = $state.raw(null);
  /** @type {import("../utils/markPlanTypes.js").MarkComponentExports|undefined} */
  let child = $state(),
    revision = $state(0),
    alive = true,
    /** @type {Release[]} */
    off = [];
  /** @type {Release[]} */
  let expressionStops = [];
  const animationGroup = getContext(ANIMATION_GROUP_CONTEXT);
  const animationRows = animationCorrespondenceCache(() =>
    untrack(() => revision++),
  );
  onDestroy(() => animationRows.dispose());
  /** @type {MembershipResource[]} */
  let expressionResources = [];
  // The inputs of the latest full preparation, and a revision the row-opacity effect follows
  // (a Filter mask swap bumps it without preparing the mark again; 17.2c).
  /** @type {import("../utils/markPlanTypes.js").MarkDataRequest | null} */
  let requested = null;
  let opacityRevision = $state(0);
  // The display names of the columns this mark's channels plot: a legend's last-resort title.
  /** @type {Record<string, string>} */
  let channelTitles = {};
  // The titles this mark's axes take from its columns (its vote, TODO 21 D4): a legend leaves
  // out a color repeating one (TODO 136.17).
  /** @type {Record<string, unknown>} */
  let markAxisColumns = {};
  /** @type {() => unknown | Promise<unknown>} */
  let expressionUpdate = () => revision++;
  /** @type {typeof expressionUpdate | null | undefined} */
  let pendingExpressionUpdate;
  let expressionUpdating = false;
  function scheduleExpressionUpdate() {
    pendingExpressionUpdate = expressionUpdate;
    if (expressionUpdating) return;
    expressionUpdating = true;
    Promise.resolve()
      .then(async () => {
        while (alive && pendingExpressionUpdate) {
          const update = pendingExpressionUpdate;
          pendingExpressionUpdate = null;
          await update();
        }
      })
      .catch(report)
      .finally(() => {
        expressionUpdating = false;
      });
  }
  const categoryStop = options.on(
    () => untrack(() => revision++),
    "_categoryRevision",
  );
  onDestroy(categoryStop);
  $effect(() => {
    if (kind !== "Text") return;
    let seen = labelFontRevision();
    return onLabelFontChange((/** @type {number} */ next) => {
      if (next !== seen) {
        seen = next;
        untrack(() => revision++);
      }
    });
  });
  // Frames publish placement and range changes after their own effect runs, so the
  // frame-compatibility check must re-run when the enclosing frame topology changes.
  // Re-prepare only when what preparation reads from the frame chain changed, so a
  // Plot's own topology announcement does not prepare every mark twice on mount.
  /** @type {string | undefined} */
  let preparedFrame;
  // A Prism (and so a Bar) in a 2D view with a rectangle footprint is a flat
  // Rect: it refines as a patch where its chain bends it.
  const flatPrism = () =>
    kind === "Prism" &&
    coordinateView(options) === "2d" &&
    (values.axis ?? "z") === "z" &&
    (values.shape ?? "rectangle") === "rectangle";
  function frameState() {
    return untrack(() => {
      try {
        const placement = placedFrame(options)?.placement;
        return JSON.stringify([
          frameCompatibility(kind, {
            nonlinear: !!nonlinearFrame(options),
            anchored: !!placement,
            nestedCoordinates: nestedCoordinateOverride(options),
            spherical: sphericalAncestor(options),
            flat: flatPrism(),
            affine: affineAncestors(options),
          }),
          [..."xyz"].map(transformKind),
          !!placement?.rotation?.some((/** @type {number} */ v) => v !== 0),
        ]);
      } catch (error) {
        return "error: " + /** @type {Error} */ (error).message;
      }
    });
  }
  const frameTopologyStop = options.on(() => {
    if (frameState() !== preparedFrame) untrack(() => revision++);
  }, "_frameTopology");
  onDestroy(frameTopologyStop);
  // An axis's breaks (TODO 53.5) move its datetime positions: prepare again when they change
  // (their value: a Plot's axes={{ x: { breaks: [...] } }} sets a new array on every render).
  const axisNode = options.child?.("plot") ?? options;
  /** @param {string} axis */
  const breaksKey = (axis) =>
    JSON.stringify(axisNode.get?.(`axis${axis}Breaks`) ?? []);
  const seenBreaks = Object.fromEntries(
    ["X", "Y", "Z"].map((axis) => [axis, breaksKey(axis)]),
  );
  const breakStops = ["X", "Y", "Z"]
    .map((axis) =>
      axisNode.on?.(() => {
        const next = breaksKey(axis);
        if (next === seenBreaks[axis]) return;
        seenBreaks[axis] = next;
        untrack(() => revision++);
      }, `axis${axis}Breaks`),
    )
    .filter(Boolean);
  onDestroy(() => breakStops.forEach((stop) => stop()));
  const themeStop = themeScope?.subscribe?.(() => untrack(() => revision++));
  // Per-row shape names and shape-scale ranges prepared before registerShape re-prepare once
  // the name exists (the shader rebuild alone keeps the old codes).
  const shapeStop = onShapeRegistered(() =>
    untrack(() => {
      if (
        values.shape !== undefined ||
        values.shapeScale !== undefined ||
        prepared?.props?.symbolCode !== undefined
      )
        revision++;
    }),
  );
  onDestroy(shapeStop);
  onDestroy(() => themeStop?.());
  /** @type {import("../utils/internalTypes.js").PreparedMark | null | undefined} */
  let current;
  const placement = createPlacementController({
    renderer,
    view: viewServices,
    options,
    relayout: () => untrack(() => revision++),
  });
  if (placement.watchesCamera)
    useTask(() => placement.frame(camera.current), { autoInvalidate: false });
  onDestroy(() => placement.release());
  const currentMark = () => child?.getMark?.();
  // The accepted binding (Stage 117.2, utils/markBinding.js): what picking, tooltips, connections,
  // legends and export know of the displayed preparation, published for the mark object.
  const bindings = createBindingPublisher(viewServices.marks, () => ({
    kind,
    compound: compoundSpec?.kind ?? null,
    frameKey: frame?.key ?? null,
  }));
  onDestroy(() => bindings.release());
  // A table's row tokens: its keys, or row:i for a keyless one. Positional tokens depend only on
  // the row count, so they are kept across generations: a running Simulate republishes its table
  // every step, and rebuilding 60,000 strings per mark per frame dominated its CPU time.
  /** @type {string[]|null} */
  let rowTokens = null;
  /** @param {{tokens?: string[]|null, length: number}} owner @returns {string[]} */
  function tableTokens(owner) {
    if (owner.tokens?.length === owner.length) return owner.tokens;
    if (rowTokens?.length !== owner.length)
      rowTokens = Array.from(
        { length: owner.length },
        (_, index) => `row:${index}`,
      );
    return rowTokens;
  }
  // A tween is aligned by row position when the table has no key (and the row count
  // changed), or when an aggregate hid the table's keys: say so once per mark.
  let warnedPositional = false;
  // Does a per-row opacity hold values strictly between 0 and 1? Zeros hide rows under
  // alpha-to-coverage too, so they do not force blending.
  /** @param {unknown} values */
  async function translucentRows(values) {
    const array = asArray(values);
    try {
      const positive = np.where(array.ref.greater(0), array.ref, 1);
      return (await scalar(np.min(positive))) < 1 - 1e-6;
    } finally {
      array.dispose();
    }
  }
  /** @param {PreparedMark|null|undefined} old @param {PreparedMark} next */
  function warnPositional(old, next) {
    if (warnedPositional || !next.animation?.channels) return;
    const table = next.markScope?.identity?.id
      ? `table ${JSON.stringify(next.markScope.identity.id)}`
      : "the table";
    const positional =
      String(next.keyTokens?.[0] ?? "").startsWith("row:") &&
      old?.keyTokens &&
      old.keyTokens.length !== /** @type {string[]} */ (next.keyTokens).length;
    const hidden =
      !next.keyTokens &&
      next.markScope?.aggregate &&
      next.markScope?.identity?.tokens;
    if (next.animationCorrespondence || (!positional && !hidden)) return;
    warnedPositional = true;
    const why = positional
      ? `tween.positional: ${kind} tween aligned rows by position because ${table} has no key; pass key= for stable per-observation motion.`
      : `tween.positional: ${kind} tween aligned rows by position because an aggregate hides the keys of ${table}; group by the key for stable per-observation motion.`;
    console.warn(why);
    reportPositional(why);
  }
  /** @type {number|undefined} */
  let publishedOffsets; // the offsets version the published preparation read (TODO 38)
  /** @param {import("../utils/internalTypes.js").PreparedMark} next @param {number} [cause] */
  const publish = (next, cause = undefined) =>
    untrack(() => {
      next.commitScales?.();
      next.animation = {
        .../** @type {PreparedAnimation} */ (next.animation),
        ...fieldAnimation(next.animation, next),
        arrive: next.arrive,
        schemeReset: next.schemeReset,
      };
      applyAnimation(currentMark(), next.animation, next.props);
      publishedOffsets = next.offsetsVersion;
      dragController.publish(next.drag);
      report("");
      off.forEach((f) => f());
      off = [...next.scales].map((scale) =>
        scale.subscribe(() => untrack(() => revision++)),
      );
      const old = current;
      warnPositional(old, next);
      current = next;
      // The accepted target and the displayed transition frame remain distinct.
      for (const a of "xyz")
        frame?.axisName?.(a, next.axisTitles?.[a], domainOwner);
      displayedFrames.show(old, next, cause);
    });
  const errorOwner = { sceneNode: reports.sceneNode() }; // names its node (TODO 136.6)
  /** @param {string} axis @returns {number} */
  const transformKind = (axis) => {
    try {
      // The mark's own axis scale: in nested frames that is the innermost stage, and outer
      // stages warp the resulting motion like they warp everything else in the frame.
      const stage = frameDimensionStages(options, axis)[0]?.source ?? options;
      return (
        TRANSFORM_KINDS[
          /** @type {string} */ (stage.get?.(axis + "Transform"))
        ] ?? TRANSFORM_KINDS.linear
      );
    } catch {
      return TRANSFORM_KINDS.linear;
    }
  };
  /** @param {string} axis @returns {number} */
  const transformConstant = (axis) => {
    try {
      return (
        /** @type {number|undefined} */ (
          (frameDimensionStages(options, axis)[0]?.source ?? options).get?.(
            axis + "TransformConstant",
          )
        ) ?? 1
      );
    } catch {
      return 1;
    }
  };
  // Channel animation (utils/channelAnimation.js): which channels animate and how, and the
  // per-component specs of the mark's fields.
  /** @param {Channels} props */
  const channelAnimation = (props) =>
    animationOfChannels(props, { options, scope: context?.read?.() });
  /** @param {PreparedAnimation|undefined} animation @param {PreparedMark} next */
  const fieldAnimation = (animation, next) =>
    fieldAnimationSpecs(animation, next, transformKind, transformConstant);
  // Procedural channels: re-evaluate every @time expression with the view clock and write
  // the result straight into the field, whose transition is suppressed for that channel.
  // Stepped channels (@time inside interval()) are written the same way at each step, with
  // their transition. A channel is written only when its change key (the host values of its
  // view-state subtrees, utils/viewState.js) changed since the values on screen; a step that
  // writes nothing returns false, so the clock does not wait for a frame (TODO 28).
  // Everything else comes from the frame on screen, which the normal preparation evaluated
  // (expressions, Mapping values, categorical and datetime columns): the other position
  // components, and, while a keyed lifecycle runs, the rows that are departing.
  const motion = createMarkMotion({
    renderer,
    view: viewServices,
    options: () => frame?.options ?? options,
    mark: currentMark,
    step: (time) => proceduralStep(time),
    report: (error) => report(error),
    correspondence: (scope) =>
      animationRows.read(scope, animationGroup?.())?.value ?? null,
  });
  onDestroy(() => motion.release());
  /** @param {unknown} expression @param {string} channel @param {NamedScope|null|undefined} scope
   * @param {number} time @param {{end: number, finalDue: boolean}} flight @returns {EvaluationOptions} */
  const tweenOptions = (expression, channel, scope, time, flight) =>
    motion.tweenOptions(
      expression,
      channel,
      scope,
      time,
      flight,
      publishedOffsets,
    );
  // The pointer and the visible domain in this mark's frame (TODO 45, 19: the view's navigation,
  // viewCore.svelte).
  // Read when a channel reads them, untracked: a preparation must not depend on the frame's layout.
  const pointerNow = () =>
    untrack(
      () =>
        viewServices.navigation.pointer.current?.at(
          frame?.options ?? options,
        ) ?? null,
    );
  const visibleNow = () =>
    untrack(
      () =>
        viewServices.navigation.pointer.current?.visible(
          frame?.options ?? options,
        ) ?? null,
    );
  const proceduralStep = createProceduralChannels({
    getKind: () => kind,
    getMark: currentMark,
    getEntry: () => current,
    getShown: () => prepared,
    pointerNow,
    visibleNow,
    tweenOptions,
    evaluator: numericalTargets,
    invalidate: () => untrack(() => revision++),
    report: (error) => report(error),
    landed: (entry) => motion.sync(entry),
    afterWrites: async ({ props, updatedProps, entry, acceptWrites }) => {
      const mark = currentMark();
      if (!mark || entry !== current) return;
      // Retain only the last accepted value of each field. Subsequent axis writes,
      // feedback and exports must read current values, not the initial preparation.
      if (!entry.liveFieldValues) {
        entry.liveFieldValues = new Map();
        entry.own(() => {
          for (const value of /** @type {Map<string, JaxArray>} */ (
            entry.liveFieldValues
          ).values())
            value.dispose();
        });
      }
      for (const [name, value] of Object.entries(updatedProps)) {
        const held = value instanceof JaxArray ? value.ref : value;
        entry.liveFieldValues.get(name)?.dispose();
        if (held instanceof JaxArray) entry.liveFieldValues.set(name, held);
        else entry.liveFieldValues.delete(name);
        if (name === "interactionOpacity") {
          entry.expressionOpacity = /** @type {JaxArray} */ (held);
          opacityRevision++;
        } else entry.props[name] = held;
      }
      const geometry = ["position", "extent", "size", "dx", "dy"].some(
        (name) => name in updatedProps,
      );
      if (geometry)
        await domains.write(
          entry,
          props,
          mark,
          () =>
            entry === current &&
            !mark.isDisposed &&
            !(acceptWrites && !acceptWrites()),
        );
    },
  });
  $effect(() => {
    child;
    prepared;
    untrack(() => {
      const mark = currentMark();
      if (mark) applyAnimation(mark, prepared?.animation ?? current?.animation);
      motion.sync(current);
    });
  });
  $effect(() => {
    if (withInputs.error) report(Error(withInputs.error));
  });
  /** @param {unknown} message */
  const report = (message) => {
    if (message instanceof Error) {
      if (
        !message.message.startsWith(`${kind}:`) &&
        !message.message.startsWith(`${kind}.connections:`)
      )
        message.message = reports.attributed(message, kind);
      viewServices.diagnostics.report(errorOwner, message);
    } else
      viewServices.diagnostics.report(
        errorOwner,
        message ? `${kind}: ${message}` : "",
      );
  };
  /** @param {PreparedMark|null|undefined} entry */
  const retire = (entry) => retirePrepared(viewServices, entry);
  const preparation = createMarkPreparation(viewServices, { publish, report });
  const displayedFrames = createDisplayedFrames({
    renderer,
    view: viewServices,
    getKind: () => kind,
    getMark: currentMark,
    isAlive: () => alive,
    display: (entry) => {
      // The child queues its fields when this publication reaches it. Publish their policy
      // first, so a lifecycle target never borrows an unrelated layout update's specs.
      applyAnimation(currentMark(), entry.animation);
      prepared = entry;
    },
    report,
  });
  // A mark its frame cannot draw must not stay on screen at a stale placement.
  const withdraw = () =>
    untrack(() => {
      if (!current && !prepared) return;
      facet?.axisColumns(domainOwner, null);
      for (const a of "xyz") frame?.axisName?.(a, undefined, domainOwner);
      displayedFrames.cancel();
      const old = current;
      current = null;
      prepared = null;
      retire(old);
    });
  // Stage 15 connections: an endpoint-capable mark registers each mount in its view's endpoint
  // registry, from its accepted bindings (utils/endpointController.js).
  const endpoint = createEndpointController({
    kind: untrack(() => kind),
    renderer,
    endpoint: capability(
      untrack(() => kind),
      "endpoint",
    ),
    facet,
    partitionGroup,
    compoundSpec,
    frame,
    name: () => values.name,
    connectionBacked: () =>
      values.connections !== undefined && values.connections !== null,
    lifecycleUnion: (entry) =>
      displayedFrames.active && entry !== current
        ? (displayedFrames.active.identityUnion ?? displayedFrames.active.union)
        : null,
    isAlive: () => alive,
    refresh: () => revision++,
  });
  onDestroy(() => endpoint.release());
  // Connection consumers (Line, Segments, Arrows3D, Arrows with `connections`): the controller
  // resolves, matches and gathers the endpoints (utils/connectionController.js) and reports a
  // state the preparation below reads: a result to draw, pending (keep what is on screen), or an
  // error.
  /** @type {import("../utils/markPlanTypes.js").ConnectionState|null} */
  let connectionState = $state.raw(null);
  const connections = createConnectionController({
    kind: untrack(() => kind),
    renderer,
    view: viewServices,
    options,
    frameOptions: () => frame?.options ?? null,
    isAlive: () => alive,
    onState: (state) => (connectionState = state),
    track: (work) => trackPreparation(viewServices, work),
    report: (error) => report(error),
    prepared: () => prepared,
  });
  $effect(() => {
    const descriptor = values.connections;
    untrack(() => connections.update(descriptor));
  });
  onDestroy(() => connections.release());
  // Each published connection frame goes to the controller's live gather.
  $effect(() => {
    const p = prepared,
      c = child;
    if (!p?.connections || !c) return;
    return connections.publish(p, c);
  });
  if (connections.consumer)
    useTask(() => connections.frame(), { autoInvalidate: false });
  /** Row opacity for a mark drawing a padded view's physical rows: valid times any opacity column. */
  /** @param {JaxArray} mask @param {JaxArray|null|undefined} base */
  const filterOpacity = (mask, base) => {
    const membership = mask.ref.astype(np.float32);
    if (!base) return membership;
    const combined = np.multiply(membership.ref, base.ref);
    membership.dispose();
    return combined;
  };
  // How this mark draws a Filter's hidden rows, or null for the compacted rows (utils/markKinds.js).
  /** @param {NamedScope|null|undefined} scope @param {Channels} props @param {PreparedAnimation} animation */
  function paddedMode(scope, props, animation) {
    // A Filter over a grid table (TODO 51): a Heatmap or Image draws the grid's every cell, the
    // hidden ones transparent.
    if (
      capability(kind, "gridTable") &&
      !scope?.grid &&
      scope?.padded?.()?.grid
    )
      return "grid";
    return hiddenRowsForm(kind, props, {
      physical: scope?.padded?.(),
      placement: placement.covers(scope),
      animation,
      animates: !!(props.animation ?? options.get("animation")),
      rowIdentity: scope?.padded?.()?.parent?.identityRows === true,
      endpoint: untrack(() => endpoint.demanded()),
      limit: elementLimit(props),
    });
  }

  const elementLimit = markElementLimit(currentMark, options, renderer);
  /**
   * The rows a mark draws: a Filter's bucket (dataView.js BUCKETS; TODO 25.1) only when its
   * physical rows exceed the current allocation. A mark that can draw every physical row draws them and
   * swaps their mask as the selection changes; a new bucket would refill every field.
   */
  /** @param {NamedScope|undefined} scope @param {Channels} props @returns {NamedScope|undefined} */
  function drawnRows(scope, props) {
    if (!scope?.bucketed) return scope;
    const physical = scope.padded?.();
    return physical && physical.capacity > elementLimit(props)
      ? /** @type {NamedScope} */ (scope.bucketed())
      : scope;
  }
  /**
   * 17.2c/17.3b: the padded view's valid rows changed and nothing else did (planMarkUpdate's
   * "swap-mask"): swap the mark's row opacity instead of preparing and uploading every field again.
   */
  /** @param {NamedScope} scope @param {NamedScope} markScope */
  function swapValid(scope, markScope) {
    // planMarkUpdate's swap-mask action proves an accepted holder and padded rows.
    const entry =
        /** @type {PreparedMark & {filterMembership: NonNullable<PreparedMark["filterMembership"]>}} */ (
          current
        ),
      physical =
        /** @type {import("../utils/dataViewTypes.js").PhysicalScope} */ (
          /** @type {NonNullable<NamedScope["padded"]>} */ (scope.padded)()
        ),
      holder = entry.filterMembership,
      old = holder.array,
      oldRelease = holder.release;
    // The entry keeps the view whose valid mask it now shows.
    holder.release = scope.retain?.();
    holder.array = filterOpacity(physical.valid, entry.baseOpacity);
    entry.expressionOpacity = holder.array;
    entry.valid = physical.valid;
    entry.filteredCount = scope.length;
    bindings.publish(currentMark(), {
      rows: { count: scope.length, valid: physical.valid },
    });
    // The swap shows the offsets it read, as a publish does (TODO 38 decision 7).
    publishedOffsets = markScope?.identity?.offsets?.version;
    opacityRevision++;
    // The first membership stays with the entry (the mark's props hold it); later ones, and the
    // view the previous swap kept, are released once in-flight uploads that read them settle.
    tick()
      .then(() => settleUploads(viewServices))
      .finally(() => {
        if (old !== holder.initial) old.dispose();
        oldRelease?.();
      });
  }
  // A reuse or live write moves the published entry to the newest scope; the entry's
  // replaceable release (utils/preparedRetirement.js) holds that scope until the next one or
  // the entry's disposal.
  /** @param {PreparedMark} entry @param {NamedScope} scope @param {Release|undefined} [release] */
  function retainCurrentScope(entry, scope, release = scope.retain?.()) {
    entry.liveScope ??= replaceableRelease(entry);
    entry.markScope = scope;
    /** @type {import("../utils/markPlanTypes.js").MarkDataRequest} */ (
      entry.request
    ).markScope = scope;
    if (entry.interaction) {
      entry.interaction.scope = scope;
      entry.interaction.dataScope = scope;
    }
    if (entry.tooltipTarget) entry.tooltipTarget.scope = scope;
    entry.liveScope.replace(release);
  }
  /** @param {NamedScope} scope @param {Channels} channels
   * @param {import("../utils/markPlanTypes.js").PreparationDependencies} dependencies @param {PreparationJob} job */
  async function writeLive(scope, channels, dependencies, job) {
    // A write-live action always operates on the accepted request it just planned.
    const entry =
        /** @type {PreparedMark & {request: import("../utils/markPlanTypes.js").MarkDataRequest}} */ (
          current
        ),
      mark = currentMark(),
      release = scope.retain?.();
    let completed = false;
    try {
      const accepted = () =>
        alive &&
        !mark?.isDisposed &&
        entry === current &&
        job.order >= (entry.liveOrder ?? -Infinity);
      const applied = await queueLiveGeometry(entry, job.order, async () => {
        if (!accepted() || entry.request !== requested) return false;
        return proceduralStep(viewServices.clock.time, {
          scope,
          channels,
          acceptWrites: () => {
            if (!accepted()) return false;
            entry.liveOrder = job.order;
            return true;
          },
        });
      });
      // Newest-completed work may land after its effect was superseded. Abortion alone
      // does not reject it; teardown, replacement and a newer accepted write do.
      if (
        !applied ||
        !alive ||
        mark?.isDisposed ||
        entry !== current ||
        job.order < (entry.liveOrder ?? -Infinity)
      ) {
        release?.();
        return;
      }
      entry.liveOrder = job.order;
      entry.request.dependencies = dependencies;
      retainCurrentScope(entry, scope, release);
      counters.liveFieldUpdates++;
      completed = true;
    } catch (error) {
      release?.();
      report(error);
    } finally {
      if (completed) preparation.accept(job);
      else preparation.finish(job);
    }
  }
  $effect(() => {
    if (withInputs.pending) return;
    // Tracked inputs: preserve these reads before choosing an update or starting owned work.
    const seenRevision = revision;
    counters.markPreparations++;
    const theme = themeScope?.read?.() ?? {};
    selection.palette = theme.palette;
    const resolvedMappings = resolveMappings(
      kind,
      [
        {
          ...markTheme(theme, kind),
          __mappingSource: { kind: "theme", label: theme.name ?? "Theme" },
        },
        ...(mapping?.read() ?? []),
      ],
      values,
    );
    // Channels from another jax-js copy become hmplot's (TODO 23.0b).
    const props = adoptJaxValues(resolvedMappings.values);
    motion.applyTheme(kind, props);
    const layoutPolicy = dragController.policy(props.drag);
    // A theme's shape is a symbol name, never a column: shape resolves columns first, and a
    // data column named "star" must not capture every point mark's default symbol.
    if (
      resolvedMappings.provenance.shape?.kind === "theme" &&
      typeof props.shape === "string"
    )
      props.shape = literal(props.shape);
    // Animation on channels: animate() descriptors unwrap to their value and become a
    // per-row scale-space transition on the consuming field; tween() nodes evaluate to
    // their current interpolated values; @time makes a channel procedural, re-evaluated
    // every frame with its transition suppressed. publish() maps channels to fields.
    let animation;
    try {
      animation = channelAnimation(props);
      resolveOffsetShorthands(props, kind);
    } catch (e) {
      report(e);
      console.error(kind + ":", /** @type {Error} */ (e).message);
      return;
    }
    untrack(() => {
      const presentation = {
        channelProvenance: resolvedMappings.provenance,
        ignoredMappings: resolvedMappings.ignored,
      };
      if (
        JSON.stringify(options.presentation.channelProvenance) !==
          JSON.stringify(presentation.channelProvenance) ||
        JSON.stringify(options.presentation.ignoredMappings) !==
          JSON.stringify(presentation.ignoredMappings)
      )
        options.setPresentation(presentation);
    });
    /** @type {import("../utils/internalTypes.js").PreparedMark | undefined} */
    let next;
    /** @type {Release|undefined} */
    let releaseClaim;
    /** @type {Promise<unknown>|null|undefined} */
    let scaleWork;
    /** Publishing waits for `work` too. @param {Promise<unknown>} work */
    const alsoAwait = (work) =>
      (scaleWork = scaleWork ? Promise.all([scaleWork, work]) : work);
    const job = untrack(() => preparation.begin("newest-completed"));
    const cause = job.cause;
    const cancel = () => {
      preparation.cancel(job);
      releaseClaim?.();
    };
    try {
      connections.check(props);
      preparedFrame = frameState();
      const frameSupport = untrack(() =>
        frameCompatibility(kind, {
          nonlinear: !!nonlinearFrame(options),
          anchored: !!placedFrame(options),
          nestedCoordinates: nestedCoordinateOverride(options),
          spherical: sphericalAncestor(options),
          flat: flatPrism(),
          affine: affineAncestors(options),
        }),
      );
      if (frameSupport) {
        withdraw();
        throw Error(frameSupport);
      }
      // Stage 15: a connection-backed mark draws what its endpoints resolve to.
      const connection = connections.resolve(
        props,
        (key) => resolvedMappings.provenance[key]?.kind === "explicit",
        () => connectionState,
      );
      // Pending: nothing resolved yet, or keep what is on screen.
      if (connection === null) {
        preparation.finish(job);
        return;
      }
      const group = animationGroup?.();
      const sourceScope = context?.read();
      const scope = group != null ? sourceScope : drawnRows(sourceScope, props);
      const usesRows =
        Object.keys(animation.channels).length > 0 ||
        Object.keys(animation.tweened).length > 0 ||
        !!(props.animation ?? options.get("animation")) ||
        props.enterEffect !== undefined ||
        props.exitEffect !== undefined;
      const grouped = usesRows ? animationRows.read(scope, group) : null;
      if (grouped && !grouped.value) {
        preparation.finish(job);
        trackPreparation(viewServices, grouped.promise, cause);
        return cancel;
      }
      const correspondence = grouped?.value ?? null;
      // A line colored, or an area filled, by a category column draws one path per category, as
      // in ggplot, Vega-Lite and Observable Plot (TODO 136.17): it no longer joins them into one.
      // Set before paddedMode, whose drawing form depends on series.
      // A connector Line (connections) draws its own paths, one per key.
      const seriesChannel =
        !props.connections && props.series === undefined
          ? props[capability(kind, "seriesChannel")]
          : undefined;
      if (
        typeof seriesChannel === "string" &&
        scope?.has?.(seriesChannel) &&
        categoryColumn(scope.get(seriesChannel))
      )
        props.series = seriesChannel;
      // A padded view (a Filter's rows): draw its physical rows (17.3b; see paddedMode).
      const mode =
        connection || correspondence
          ? null
          : paddedMode(scope, props, animation);
      const physicalScope =
        mode === "scattered" || mode === "masked" || mode === "grid"
          ? /** @type {NonNullable<NamedScope["padded"]>} */ (
              /** @type {NamedScope} */ (scope).padded
            )()
          : mode === "prefix"
            ? /** @type {NonNullable<NamedScope["prefixed"]>} */ (
                /** @type {NamedScope} */ (scope).prefixed
              )()
            : null;
      const markScope = connection?.scope ?? physicalScope ?? scope;
      // A Facet's scales="field" groups this mark's domains by the columns it plots (TODO 21 F3);
      // connections draw their endpoints' positions and contribute no domains.
      untrack(() =>
        facet?.axisColumns(
          domainOwner,
          connection ? null : axisColumnIdentities(markScope, kind, props),
        ),
      );
      // Axis titles (TODO 21 D4): this mark's vote per axis; connectors abstain.
      const axisTitles = untrack(() =>
        connection
          ? {}
          : (compoundNames?.() ?? markAxisTitles(kind, props, markScope)),
      );
      markAxisColumns = axisTitles;
      // A string names a column only in a table that has it: fill="#00ff00" is a color.
      channelTitles = untrack(() =>
        Object.fromEntries(
          ["fill", "color", "size", "shape", "width", "opacity", "outlineColor"]
            .filter(
              (channel) =>
                props[channel] !== undefined &&
                (typeof props[channel] !== "string" ||
                  markScope?.has?.(props[channel])),
            )
            .map((channel) => [
              channel,
              channelTitle(markScope, props[channel]),
            ])
            .filter(([, title]) => typeof title === "string"),
        ),
      );
      const describedRows = connection?.scope?.length ?? scope?.length;
      untrack(() =>
        describer?.set(describeOwner, {
          kind: compoundDescription?.kind ?? kind,
          owner: compoundDescription?.owner ?? describeOwner,
          axes: axisTitles,
          rows: Number.isFinite(describedRows) ? describedRows : undefined,
          channels: Object.fromEntries(
            ["fill", "color", "size", "shape"]
              .filter((channel) => channel in channelTitles)
              .map((channel) => [channel, channelTitles[channel]]),
          ),
          time: Object.values(props).some((value) =>
            typeof value === "string"
              ? value === "@time"
              : isExpression(value) && expressionFields(value).has("@time"),
          ),
          mark: () => currentMark(),
        }),
      );
      const dataGeneration = scope?.identity?.generation;
      const dependencies = untrack(() =>
        capturePreparationDependencies(props, markScope),
      );
      // In-place updates keep the accepted preparation. Only "prepare" below creates
      // channel resources; reuse/live-write/mask paths keep their existing cleanup rules.
      const plan = untrack(() =>
        current?.animationCorrespondence !== correspondence &&
        (current?.animationCorrespondence || correspondence)
          ? { action: /** @type {const} */ ("prepare") }
          : planMarkUpdate(
              {
                kind,
                entry: current,
                shown: prepared,
                requested,
                mark: currentMark(),
                transitioning: Boolean(displayedFrames.active),
                interactivePositions: Boolean(dragController.force),
                placement: placement.active,
                domainsFixed: domains.fixed(),
              },
              {
                scope,
                markScope,
                generation: dataGeneration,
                revision: seenRevision,
                props,
                animation,
                dependencies,
                mode,
              },
            ),
      );
      if (plan.action === "reuse-static") {
        untrack(() =>
          retainCurrentScope(
            /** @type {PreparedMark} */ (current),
            /** @type {NamedScope} */ (markScope),
          ),
        );
        counters.staticMarkReuses++;
        preparation.accept(job);
        return;
      }
      if (plan.action === "write-live") {
        const work = untrack(() =>
          writeLive(
            /** @type {NamedScope} */ (markScope),
            plan.channels,
            dependencies,
            job,
          ),
        );
        trackPreparation(viewServices, work, cause);
        return;
      }
      if (plan.action === "swap-mask") {
        untrack(() =>
          swapValid(
            /** @type {NamedScope} */ (scope),
            /** @type {NamedScope} */ (markScope),
          ),
        );
        preparation.accept(job);
        return;
      }
      // Full preparation: snapshot authored channels before layout/series/encoding edits.
      /** @type {import("../utils/markPlanTypes.js").MarkDataRequest} */
      const request = (requested = {
        markScope,
        generation: dataGeneration,
        revision: seenRevision,
        channels: { ...props },
        dependencies,
        liveDependencies: channelDependencyKey(
          props,
          markScope,
          animation.liveChannels,
        ),
        staticDependencies:
          capability(kind, "retains") === "static"
            ? channelDependencyKey(props, markScope)
            : null,
      });
      const fields = new Set();
      for (const value of Object.values(props)) expressionFields(value, fields);
      for (const value of [
        ...Object.values(animation.enter),
        ...Object.values(animation.exit),
      ])
        expressionFields(value, fields);
      const interactionChannels = Object.entries(props).filter(([, value]) =>
        [...expressionFields(value)].some((field) => field.startsWith("@")),
      );
      expressionUpdate = async () => {
        if (
          scope?.identity?.generation !== dataGeneration &&
          scope?.revalidatedGeneration !== scope?.identity?.generation
        )
          return;
        // Size-only hover does not change row order, positions or domains; anything else plans
        // the update again. The mark draws markScope's rows (the unfiltered rows on the
        // interactionFilter path).
        const plan = planFeedbackUpdate(
          {
            kind,
            entry: current,
            mark: currentMark(),
            placement: placement.covers(scope),
            transitioning: Boolean(displayedFrames.active),
          },
          { props, markScope, interactionChannels },
        );
        if (plan.action === "replan") {
          untrack(() => revision++);
          return;
        }
        const result = evaluateExpression(props[plan.channel], markScope, {
          time: viewServices.clock.time,
          evaluator: numericalTargets,
        });
        try {
          await plan.field.update(/** @type {FieldValue} */ (result.value));
        } finally {
          result.dispose();
        }
      };
      /** @type {MembershipResource[]} */
      const resources = /** @type {MembershipResource[]} */ (
        [...fields]
          .filter((field) => field.startsWith("@"))
          .map((field) => markScope?.interactionResource?.(field))
          .filter(Boolean)
      );
      if (
        resources.length !== expressionResources.length ||
        resources.some(
          (resource, index) => resource !== expressionResources[index],
        )
      ) {
        expressionStops.forEach((stop) => stop());
        expressionResources = resources;
        expressionStops = resources.map((resource) =>
          onMembershipChange(resource, () => untrack(scheduleExpressionUpdate)),
        );
      }
      untrack(() => dragController.rows(layoutPolicy, markScope));
      const layout = placement.prepare(kind, props, scope, selection);
      releaseClaim = layout?.release;
      const series = props.series;
      const wantsLocalInteraction =
        !scope &&
        !props.identity &&
        Boolean(
          props.select ||
          props.hover ||
          props.brush ||
          props.nearby ||
          props.nearest ||
          props.respond,
        );
      const directLength = wantsLocalInteraction
        ? ["position", "x", "start", "x0", "fill", "color", "size"]
            .map((channel) =>
              shapeOf(
                /** @type {{codes?: unknown}|null|undefined} */ (props[channel])
                  ?.codes ?? props[channel],
              ),
            )
            .find((shape) => shape.length)?.[0]
        : undefined;
      if (wantsLocalInteraction && Number.isInteger(directLength)) {
        localInteractionOwner ??= createDataIdentity({
          id: `mark-${domainOwner}`,
        });
        if (localInteractionOwner.length !== directLength)
          localInteractionOwner.update({
            length: /** @type {number} */ (directLength),
          });
      }
      const interactionOwner =
        props.identity ??
        markScope?.identity ??
        (wantsLocalInteraction ? localInteractionOwner : undefined);
      const interactionScope =
        markScope ??
        (interactionOwner
          ? {
              identity: interactionOwner,
              length: interactionOwner.length,
              aggregate: false,
              sourceIndices: () => null,
            }
          : null);
      const written = untrack(() =>
        writers.prepare(props, markScope, interactionScope),
      );
      const { selectState, hoverState } = written;
      const brushValue =
        /** @type {import("../publicTypes.js").MarkProps["brush"] & {axis?: string}} */ (
          props.brush
        );
      const brushState = interactionResource(
        interactionScope,
        brushValue,
        "brush",
      );
      const nearbyValue =
        /** @type {{axis?: string, radius?: number, units?: "px"|"data"}|null|undefined} */ (
          props.nearby
        );
      const nearbyState = interactionResource(
        interactionScope,
        nearbyValue,
        "nearby",
      );
      // nearest (TODO 72): the row the tolerant pick finds, the mark's own setting, else its
      // Plot's (for marks with rows). A tooltip picks its row the same way: it implies nearest
      // (the data's), except in a unified-x Plot, which reads a strip instead.
      if (
        props.nearest !== undefined &&
        props.nearest !== false &&
        !capability(kind, "rows")
      )
        throw Error(
          `${kind} has no rows to mark as @nearest: remove nearest (a tooltip shows the value at the pointer).`,
        );
      const tooltip = tooltipSetting(
        props.tooltip,
        tooltipContext?.plotDefault,
        `${kind}.tooltip`,
      );
      const unifiedTooltip = tooltipMode(tooltipContext?.plotDefault) === "x";
      const nearest = nearestSetting(
        props.nearest,
        capability(kind, "rows") ? tooltipContext?.nearestDefault : undefined,
        `${kind}.nearest`,
      );
      const picksNearest = Boolean(nearest || (tooltip && !unifiedTooltip));
      const nearestState =
        picksNearest && capability(kind, "rows")
          ? interactionResource(
              interactionScope,
              nearest?.selection ?? true,
              "nearest",
            )
          : null;
      if (nearbyState && !capability(kind, "points"))
        throw Error(
          `nearby is supported by point marks (${kindsWith("points").join(", ")}) in Cartesian 2D; ${kind} may still respond to @nearby.`,
        );
      if (
        nearbyState &&
        (options.get("coordinates") !== "cartesian" ||
          coordinateView(options) !== "2d")
      )
        throw Error(
          `nearby is supported by point marks in Cartesian 2D; this ${kind} is not in a Cartesian 2D view.`,
        );
      if (nearbyState && untrack(() => nestedCoordinateOverride(options)))
        throw Error(
          `${kind} cannot use nearby inside a nested coordinate override yet.`,
        );
      if (
        nearbyState &&
        untrack(() =>
          placedFrame(options)?.placement.rotation?.some(
            (/** @type {number} */ v) => v !== 0,
          ),
        )
      )
        throw Error(
          `${kind} cannot use nearby in a rotated Frame; it can still respond to @nearby.`,
        );
      // Series marks brush, select and hover whole series (TODO 62.1); a connector's paths
      // are its keys already.
      const seriesMark = capability(kind, "series") && !connection;
      if (brushState && !capability(kind, "points") && !seriesMark)
        throw Error(
          `${kind} cannot produce a graphical brush. Use ${kindsWith("points").join(", ")}, Swarm, or ${kindsWith("series").join(", ")} in Cartesian 2D; it may still respond to @brushed.`,
        );
      // A Area's value axis is two columns (lower, upper): it brushes along its positions.
      const areaAlong =
        kind === "Area" ? (props.axis === "x" ? "y" : "x") : null;
      if (
        brushState &&
        areaAlong &&
        brushValue?.axis !== undefined &&
        brushValue.axis !== areaAlong
      )
        throw Error(
          `A ${areaAlong === "y" ? "horizontal " : ""}${kind} brushes along ${areaAlong} only (lower and upper are its other axis): use brush={{ axis: "${areaAlong}" }}.`,
        );
      if (
        brushState &&
        (options.get("coordinates") !== "cartesian" ||
          coordinateView(options) !== "2d")
      )
        throw Error(
          `${kind} graphical brushing supports Cartesian 2D only. This mark may still respond to a brush owned by another compatible view.`,
        );
      if (brushState && untrack(() => nestedCoordinateOverride(options)))
        throw Error(
          `${kind} cannot produce a Cartesian interval brush inside a nested coordinate override.`,
        );
      if (
        brushState &&
        untrack(() =>
          placedFrame(options)?.placement.rotation?.some(
            (/** @type {number} */ v) => v !== 0,
          ),
        )
      )
        throw Error(
          `${kind} cannot produce a column brush in a rotated Frame; it can still respond to shared brush state.`,
        );
      const drag = dragController.prepare(kind, props, markScope, selectState);
      /** @type {Channels} */
      const interactionProps = { ...props, series: undefined };
      for (const key of [
        "identity",
        "select",
        "hover",
        "brush",
        "nearby",
        "respond",
        "selectionOpacity",
        "enterEffect",
        "exitEffect",
        "connections",
        "drag",
        "ondrag",
        "ondragend",
        "tooltip",
        "nearest",
      ])
        delete interactionProps[key];
      if (connection) Object.assign(interactionProps, connection.props);
      /** @type {PreparedInteraction|null|undefined} */
      let interactionBinding;
      // The rows a pick names: its row (the handler wrapper mapped it, namedData.js), else read
      // here; for a series mark every row of its series, or of the mark without series.
      const pickedRows = (
        /** @type {import("../binding/markInteractionEvents.js").MarkPickEvent} */ event,
      ) => {
        if (seriesMark && (event._seriesRows || series === undefined)) {
          const shown = physicalScope ? scope : interactionScope;
          return interactionRows(
            shown,
            event._seriesRows?.() ??
              Array.from(
                {
                  length: /** @type {NonNullable<typeof shown>} */ (shown)
                    .length,
                },
                (_, row) => row,
              ),
          );
        }
        return event.sourceRow !== undefined
          ? [event.sourceRow]
          : interactionRows(interactionScope, [
              /** @type {number} */ (event.rowIndex ?? event.instanceId),
            ]);
      };
      // The tolerant pick's row (TODO 44, 72) enters and leaves apart from the exact pick's
      // hover (picking/setupInteractivity.svelte.js): it is @nearest, and a tooltip shows that
      // same row, so the two always agree.
      const tooltipTarget =
        tooltip && interactionOwner?.tooltip && interactionScope
          ? {
              resource: interactionOwner.tooltip,
              owner: interactionOwner,
              scope: interactionScope,
            }
          : null;
      const tooltipFields =
        picksNearest && tooltip
          ? (tooltip.fields ?? defaultFields(props, markScope))
          : null;
      const showTooltip = (
        /** @type {import("../binding/markInteractionEvents.js").MarkPickEvent} */ event,
      ) => {
        if (!tooltip || unifiedTooltip) return;
        (!capability(kind, "rows")
          ? tooltips.showGrid(event, props)
          : tooltips.show(
              event,
              tooltip,
              tooltipFields,
              interactionBinding?.scope ?? markScope,
              props,
              tooltipTarget,
            )
        ).catch(() => {});
      };
      // Event routing borrows this run's resources. Readbacks consult the mutable binding
      // at event time; row mapping and tooltip ownership stay with their existing producers.
      installMarkInteractionEvents(interactionProps, {
        owner: interactionOwner,
        scope: interactionScope,
        selection: selectState,
        hover: hoverState,
        writers: writers.events(written, tooltips),
        nearest: nearestState,
        picksNearest,
        binding: () => interactionBinding,
        rows: pickedRows,
        tooltip: {
          show: showTooltip,
          leave: () => tooltips.leave(Boolean(tooltip)),
          move:
            tooltip && !unifiedTooltip && !capability(kind, "rows")
              ? (event) => {
                  tooltips.showGrid(event, props).catch(() => {});
                }
              : undefined,
        },
      });
      // Unified x reads its strip of the pick buffer, and a brush its pick: the mark draws its pick
      // with no handler of its own (explicit pickability, picking/plugin.svelte.ts).
      if ((tooltip && unifiedTooltip) || brushState)
        interactionProps._pickable = true;
      // Procedural (@time) channels evaluate at the current view time, as the next
      // procedural step would; so do tweened channels (TODO 28), which record their flight.
      const preparedAt = viewServices.clock.time,
        flight = { end: -Infinity, finalDue: false };
      const channelOf = new Map(
        Object.entries(props).map(([key, value]) => [value, key]),
      );
      const preparedState = viewState({
        time: preparedAt,
        pointer: pointerNow,
        visible: visibleNow,
      });
      /** @type {PreparedMark} */
      const result = (next = prepareNamed(
        interactionProps,
        markScope,
        options,
        kind,
        selection,
        frame,
        resolvedMappings.provenance,
        {
          time: preparedAt,
          expressionEvaluator: evaluateNumericalTarget,
          expressionOptions: (value) => ({
            viewState: preparedState,
            ...tweenOptions(
              value,
              channelOf.get(value) ?? "channel",
              markScope,
              preparedAt,
              flight,
            ),
          }),
        },
      ));
      // Keep the component identity outside props: temporary validation tags are removed
      // before publication, while Rect/Prism channel-to-buffer animation needs it afterwards.
      result.kind = kind;
      result.animationCorrespondence = correspondence;
      flight.finalDue = flight.end > preparedAt;
      result.tweenFlight = flight;
      // A width expression of literals (where("@hovered", 2, 1)) means its literals, as
      // width={2} does: pixels, not values for the width scale (TODO 62.4; markKinds.js strokeWidth).
      if (
        capability(kind, "strokeWidth") &&
        isExpression(props.width) &&
        literalValued(props.width)
      )
        result.props._widthPixels = true;
      // A rule's ends at the frame edge are read in the shader (utils/frameEdges.js).
      if (capability(kind, "frameEdges")) {
        const edges = frameEdgeCodes(props.start, props.end);
        if (edges) result.props._frameEdges = edges;
      }
      result.preparedViewState = preparedState;
      if (connection) connections.attach(result, connection);
      if (
        !capability(kind, "rows") &&
        props.respond !== false &&
        (props.select ||
          props.hover ||
          props.brush ||
          props.respond !== undefined)
      )
        throw Error(
          `${kind} does not support automatic row-state feedback because raster cells do not have row identities. Use a shape-compatible numerical expression or respond={false}.`,
        );
      let translucentWork = null;
      const movingOpacity =
        markScope?.live ||
        animation.procedural?.opacity ||
        animation.stepped?.opacity ||
        animation.tweened?.opacity ||
        animation.channels?.opacity ||
        (props.animation ?? options.get("animation"));
      if (
        result.props.opacity instanceof JaxArray &&
        result.props.opacity.shape.length === 0
      ) {
        result.scalarOpacity = result.props.opacity;
        result.props.opacity = 1;
        // This is the existing blend-state decision, over one value instead of N rows. The
        // value itself remains device-backed; animated opacity conservatively blends already.
        translucentWork = (
          movingOpacity
            ? Promise.resolve(true)
            : translucentRows(result.scalarOpacity)
        ).then((value) => {
          result.scalarTranslucent = value;
        });
      }
      const opacityRows = /** @type {JaxArray|undefined} */ (
        shapeOf(result.props.opacity).length
          ? result.props.opacity
          : result.rowOpacity
      );
      if (opacityRows) {
        result.expressionOpacity = opacityRows;
        // Opacity from a column (not an interaction expression) gets a legend ramp.
        if (typeof props.opacity === "string" && !result.metadata?.opacity)
          result.opacityColumn = result.opacitySource ?? result.props.opacity;
        // Moving upstream columns can reach fractional alpha without a mark-owned tween.
        // Blend conservatively, as for @time, rather than synchronizing with the GPU every tick.
        const rowTranslucent = movingOpacity
          ? Promise.resolve(true)
          : translucentRows(opacityRows);
        translucentWork = Promise.all([
          translucentWork,
          rowTranslucent.then((value) => {
            result.translucent = value;
          }),
        ]);
        if (opacityRows === result.props.opacity) result.props.opacity = 1;
      }
      result.request = request;
      if (mode) {
        // Borrowed from the view, which the entry retains.
        result.valid =
          /** @type {import("../utils/dataViewTypes.js").PhysicalScope} */ (
            physicalScope
          ).valid;
        result.paddedMode = mode;
        result.filteredCount = /** @type {NamedScope} */ (scope).length;
      }
      if (mode === "scattered") {
        // The newest row opacity lives in the holder, so a valid swap (swapValid) replaces it.
        const membership = filterOpacity(
          /** @type {import("../utils/dataViewTypes.js").PhysicalScope} */ (
            physicalScope
          ).valid,
          result.expressionOpacity,
        );
        /** @type {NonNullable<PreparedMark["filterMembership"]>} */
        const holder = (result.filterMembership = {
          array: membership,
          initial: membership,
          release: null,
        });
        result.baseOpacity = result.expressionOpacity;
        result.expressionOpacity = membership;
        result.own(() => {
          holder.array.dispose();
          if (holder.initial !== holder.array) holder.initial.dispose();
          holder.release?.();
        });
      } else if (mode === "prefix")
        result.props._validCount = /** @type {NamedScope} */ (scope).length;
      // Borrowed like result.valid: the uncertainty mark reads hidden rows as missing.
      else if (mode === "masked")
        result.props._rowShown =
          /** @type {import("../utils/dataViewTypes.js").PhysicalScope} */ (
            physicalScope
          ).valid;
      const numericChannels = ["fill", "color", "size", "width"];
      // RGB channels have no scale: a continuous fillScale beside them is ignored (warned).
      const needsScale = numericChannels.some((channel) =>
        needsContinuousScale(props, channel, markScope, result),
      );
      // Set the publication policy before handing this entry to asynchronous consumers.
      if (
        needsScale ||
        series !== undefined ||
        layout ||
        (capability(kind, "curves") && props.curve && props.curve !== "linear")
      )
        job.policy = "current-request";
      scaleWork = needsScale
        ? bindContinuousScales({
            props,
            prepared: result,
            scope: markScope,
            frame,
            kind,
            owners: scaleOwners,
            signal: job.signal,
          })
        : null;
      // RGB rows from GPU arrays: check the 0-1 / 0-255 range before the data becomes visible.
      // Image arrays (checks with a `source`) are large, so their check runs beside the upload
      // instead of delaying the first frame; an out-of-range image still reports the error.
      const rowChecks =
        result.rgbChecks?.filter((check) => !check.source) ?? [];
      const rasterChecks =
        result.rgbChecks?.filter((check) => check.source) ?? [];
      if (rowChecks.length) alsoAwait(checkRgbArrays(rowChecks));
      if (rasterChecks.length)
        checkRgbArrays(rasterChecks).catch((error) => {
          if (alive) report(error);
        });
      if (translucentWork) alsoAwait(translucentWork);
      // Text's numbers become labels before publishing, a GPU value read back first (TODO
      // 143.6); its label room waits for them (markDomainPublisher).
      result.labelsReady = labelNumbers(kind, result.props, options);
      if (result.labelsReady) alsoAwait(result.labelsReady);
      // Row keys line keyed updates up: the owning table's key tokens, or `row:i` for a
      // keyless table. A derived view (Sort, Filter, Sample, brushed filters) maps its rows
      // back to source rows, so each observation keeps its motion however the view orders
      // it; that needs one readback, so it only happens for marks that animate.
      const ownerKey = (/** @type {number} */ index) =>
        /** @type {NonNullable<typeof interactionOwner>} */ (interactionOwner)
          .tokens?.[index] ?? `row:${index}`;
      const animates =
        Object.keys(animation.channels).length > 0 ||
        !!(props.animation ?? options.get("animation")) ||
        props.enterEffect !== undefined ||
        props.exitEffect !== undefined;
      // An endpoint whose observations a connection matches needs them too (Stage 15).
      const endpointTokens = !animates && endpoint.demanded();
      result.keyTokens = null;
      result.tokensRequested = animates || endpointTokens;
      if (interactionOwner && (!markScope || markScope.identityRows))
        // Token arrays are read-only: complete keys and positional tokens are shared, not copied.
        result.keyTokens =
          interactionOwner.tokens &&
          interactionOwner.tokens.length !== interactionOwner.length
            ? Array.from({ length: interactionOwner.length }, (_, index) =>
                ownerKey(index),
              )
            : tableTokens(interactionOwner);
      else if (
        mode &&
        animates &&
        interactionOwner &&
        /** @type {NamedScope} */ (markScope).length === interactionOwner.length
      )
        // A padded view's physical rows are its table's (TODO 32.12): the table's tokens, with no
        // readback of source rows and no new keys while the table is the same.
        result.keyTokens = tableTokens(interactionOwner);
      else if (
        interactionOwner &&
        (animates || endpointTokens) &&
        !(/** @type {NamedScope} */ (markScope).aggregate) &&
        /** @type {NamedScope} */ (markScope).sourceIndices
      ) {
        const indices =
          /** @type {NonNullable<NamedScope["sourceIndices"]>} */ (
            /** @type {NamedScope} */ (markScope).sourceIndices
          )();
        if (indices) {
          const keys = decodedSourceRows(indices)
            .then((/** @type {ArrayLike<number>} */ rows) => {
              if (rows.length === /** @type {NamedScope} */ (markScope).length)
                result.keyTokens = Array.from(rows, (row) => ownerKey(row));
            })
            .finally(() => indices.dispose());
          alsoAwait(keys).catch(() => {});
        }
      }
      result.lifecycleConfig = {
        evaluator: numericalTargets,
        enter: props.enterEffect,
        exit: props.exitEffect,
        animationDuration:
          props.animationDuration ?? options.get("animationDuration"),
        animationEasing:
          props.animationEasing ?? options.get("animationEasing"),
        channelEnter: animation.enter,
        channelExit: animation.exit,
        channelDuration: Math.max(
          0,
          ...Object.values(animation.channels).map((timing) => timing.duration),
        ),
        // A mark that animates lines keyed rows up by key even without enter/exit.
        animates,
      };
      result.animation = animation;
      result.drag = drag;
      // A live drag of the table's offsets made this change (TODO 38 decision 7): the rows it
      // changed arrive at once, rows it hides or shows skip their enter and exit, and every
      // other row keeps its motion. Escape, resetOffsets() and code changes animate.
      // publishedOffsets advances only when this mark publishes: a mark that reads no offsets
      // (neither a channel nor a transform above it) would take its next change for the drag's.
      const offsets =
        /** @type {ReturnType<typeof import("../utils/offsets.js").createOffsetLayer>|undefined} */ (
          markScope?.identity?.offsets
        );
      result.offsetsVersion = offsets?.version;
      result.arrive =
        Boolean(offsets?.draggedSince(publishedOffsets)) &&
        (Object.values(props).some((value) =>
          typeof value === "string" || isExpression(value)
            ? readsOffsets(value)
            : false,
        ) ||
          scopeReadsOffsets(markScope));
      result.schemeReset =
        !!current &&
        (current.animationCorrespondence?.scheme ?? null) !==
          (correspondence?.scheme ?? null);
      result.markScope = markScope;
      result.axisTitles = axisTitles;
      // A reduction in an @time channel depends on the data, not the clock: the procedural
      // step keeps each one for the life of this entry (one data revision) instead of
      // reducing every frame.
      const reductionCache = (result.reductionCache = new Map());
      result.own(() => releaseReductionCache(reductionCache));
      result.channels = { ...props };
      // What the tolerant pick reads around the pointer for this mark (CSS pixels): nearest's
      // radius, else its tooltip's. Unified x reads its own strip instead.
      result.nearest = picksNearest
        ? {
            radius:
              nearest?.radius ?? tooltip?.radius ?? DEFAULT_TOOLTIP_RADIUS,
          }
        : null;
      result.tooltip = tooltip;
      result.tooltipTarget = tooltipTarget;
      result.interaction = interactionBinding = interactionOwner
        ? {
            revisions: { selection: 0, hover: 0, nearest: 0 },
            // A connector's rows come from its endpoints: its feedback follows the owner's generation.
            generation: connection
              ? interactionOwner.generation
              : dataGeneration,
            owner: interactionOwner,
            // The live data scope: a Partition group reused across a data update is revalidated
            // for the new generation (TODO 17.9), and the guards below accept that.
            dataScope: connection ? null : scope,
            scope: interactionScope,
            selection: selectState,
            hover: hoverState,
            brush: brushState,
            nearby: nearbyState,
            nearest: nearestState,
            nearbyConfig: nearbyState
              ? {
                  axis: nearbyValue?.axis ?? "xy",
                  radius: nearbyValue?.radius ?? 24,
                  units: nearbyValue?.units ?? "px",
                }
              : null,
            brushAxis: brushValue?.axis ?? areaAlong ?? "xy",
            // Whole series (TODO 62.1): viewCore's brush constraints carry it (seriesConstraint).
            brushSeries:
              brushState && seriesMark
                ? seriesBrush(scope ?? interactionScope, series, kind)
                : null,
            brushColumns:
              brushState || nearbyState
                ? {
                    x:
                      areaAlong === "y"
                        ? null
                        : brushColumn(markScope, props.x, "x", domainOwner),
                    y: brushColumn(
                      markScope,
                      areaAlong === "y" ? props.x : props.y,
                      "y",
                      domainOwner,
                    ),
                  }
                : null,
            frameOptions: frame?.options,
            frameKey: frame?.key,
            respond: props.respond,
            selectionOpacity: props.selectionOpacity ?? 0.25,
          }
        : null;
      const interaction = result.interaction;
      if (interaction?.brushColumns)
        result.own(() => {
          for (const column of Object.values(interaction.brushColumns ?? {}))
            column?.release?.();
        });
      // Nearby reads the column of each of its axes: one of them must name one.
      const nearbyAxis = nearbyState
        ? interaction?.nearbyConfig?.axis
        : undefined;
      if (
        nearbyAxis &&
        ![...nearbyAxis].some((a) => interaction?.brushColumns?.[a])
      )
        throw Error(
          `${kind} nearby needs ${nearbyAxis === "xy" ? "x or y" : nearbyAxis} to name a one-dimensional data column.`,
        );
      result.iterative = layoutPolicy.iterative;
      // Read extents before publishing (TODO 26.5), so new data draws under its new axes.
      // Series wait for partitioning: missing keys drop rows and curves need path neighbors.
      // First preparations, connections, iterative scopes and Heatmaps read after publishing.
      const prepareDomains = () =>
        untrack(() =>
          domains.prepare(
            /** @type {PreparedMark & {request: import("../utils/markPlanTypes.js").MarkDataRequest}} */ (
              result
            ),
            {
              mark: currentMark(),
              previous: current,
              markScope,
              connection,
            },
          ),
        );
      const domainWork = series === undefined && prepareDomains();
      if (domainWork) alsoAwait(domainWork);
      if (facet && !layoutPolicy.iterative)
        facet
          .define(
            /** @type {number} */ (facetSlot),
            kind,
            props,
            /** @type {NamedScope} */ (scope).pipeline ?? [],
            options,
          )
          .catch((/** @type {Error} */ e) => {
            if (e.name !== "AbortError" && alive) report(e);
          });
      const release = scope?.retain?.();
      if (release) result.own(release, { after: true });
      if (series !== undefined) {
        const work = partitionSeries(kind, result.props, series, scope, {
          signal: job.signal,
          maxBytes: selection.limit,
          rowOpacity: result.expressionOpacity,
        }).then(async (grouped) => {
          result.own(() => grouped.dispose());
          await scaleWork;
          result.props = grouped.props;
          result.interactionIndex = grouped.sourceIndex;
          if (grouped.opacity) result.expressionOpacity = grouped.opacity;
          await prepareDomains();
        });
        scaleWork?.catch(() => {});
        preparation.finish(job, result, work);
        return cancel;
      }
      if (layout) {
        const work = layout
          .place(camera.current, job.signal)
          .then(async ({ channel, value }) => {
            result.own(() => value.dispose(), { after: true });
            await scaleWork;
            result.props[channel] = value;
          });
        scaleWork?.catch(() => {});
        const pending = preparation.finish(job, result, work);
        if (pending) layout.track(pending, cause);
        return cancel;
      }
    } catch (e) {
      cancel();
      // Thrown after prepareNamed (a raster with row feedback, a scale or domain setup): the
      // entry and its scale work are this run's, never published (TODO 32.1).
      scaleWork?.catch(() => {});
      preparation.finish(job, next, Promise.reject(e));
      console.error(kind + ":", /** @type {Error} */ (e).message);
      return;
    }
    if (capability(kind, "curves") && props.curve && props.curve !== "linear")
      scaleWork = Promise.all([
        validateCurveInput(kind, /** @type {PreparedMark} */ (next).props),
        scaleWork,
      ]);
    preparation.finish(job, next, scaleWork);
    return cancel;
  });
  $effect(() => {
    const p = prepared,
      c = child;
    // Clearing an explicit axis bound re-collects the extents this effect skipped.
    frame?.domainRevision;
    if (!p || !c) return;
    let canceled = false;
    let stopLabelBounds = () => {};
    trackPreparation(
      viewServices,
      tick()
        .then(async () => {
          const mark = c.getMark?.();
          if (!mark) return;
          placement.drawn(mark.options);
          await mark.manager?.chain;
          if (canceled || !alive) return;
          // Connections draw their endpoints' positions, which count in the endpoints' own frames;
          // other marks' extents are read once for every axis (17.2b), started when the data was
          // prepared, so the data and its axes appear together (TODO 26.5). Exit/source union rows
          // are animation scaffolding, not the accepted data domain.
          stopLabelBounds =
            (await domains.publish(
              mark,
              p,
              current ?? p,
              () => canceled || !alive,
            )) ?? stopLabelBounds;
          for (const [channel, data] of Object.entries(p.metadata)) {
            const key =
              channel === "color"
                ? "categoryStroke"
                : channel === "fill"
                  ? "categoryFill"
                  : channel === "shape"
                    ? "categoryShape"
                    : "category" + channel[0].toUpperCase() + channel.slice(1);
            mark.options.ensure(
              key,
              new FieldType({ defaultValue: null, ui: { ui: "categories" } }),
            );
            mark.options.derive(key, { scale: data.scale, channel });
            const display = mark.options.displayList ?? [];
            mark.options.setDisplayList([...new Set([...display, key])]);
          }
          // Hidden categories are shared by every mount of the definition (Facet cells,
          // Partition groups): the registry holds the state and applies a toggle once.
          // Guide-less marks (Anchor) are not in the legend registry.
          const registry =
            /** @type {{guide?: boolean}} */ (mark.constructor).guide === false
              ? undefined
              : registryFor(mark.options);
          if (registry) {
            const shared = registry.categoryState(registry.keyOf(mark));
            if (selection.hidden !== shared.hidden) {
              const before = selection.hidden;
              selection.hidden = shared.hidden;
              selection.isolation = shared.isolation;
              const channels = new Set([
                ...Object.keys(before),
                ...Object.keys(shared.hidden),
              ]);
              const same = [...channels].every((channel) => {
                const a = before[channel] ?? new Set(),
                  b = shared.hidden[channel] ?? new Set();
                return a.size === b.size && [...a].every((v) => b.has(v));
              });
              if (!same) revision++;
            }
          }
          bindings.publish(mark, {
            legend: {
              categories: legendCategories(p.metadata),
              temporal: p.temporal ?? {},
              channelTitles,
              axisTitles: markAxisColumns,
              // Opacity is already an alpha: drawing needs no normalization. Read its range only
              // when a mounted legend asks, not on every live preparation of a guide-less mark.
              readOpacityExtent: p.opacityColumn
                ? () =>
                    (p.opacityExtentWork ??= numericExtent(
                      p.opacityColumn,
                      "linear",
                    ))
                : undefined,
              refresh: () => {
                if (alive) revision++;
              },
              toggle: (channel, value, isolate) => {
                if (registry)
                  return registry.toggleCategory(
                    registry.keyOf(mark),
                    channel,
                    value,
                    isolate,
                  );
                applyCategoryToggle(
                  selection,
                  channel,
                  value,
                  isolate,
                  p.metadata[channel]?.scale.domain ?? [],
                );
                revision++;
              },
            },
          });
          registryFor(options)?.notify();
        })
        .catch((error) => {
          if (!canceled && alive) report(error);
        }),
    );
    return () => {
      canceled = true;
      stopLabelBounds();
    };
  });
  // Scale previews are preparation results, not authored props. Forwarding them to the raw
  // component put them above the live scale's derived options, freezing the first domain.
  const componentProps = $derived.by(() => {
    const props = { ...prepared?.props };
    for (const { family, scale, localEncoding } of prepared?.scaleBindings ??
      [])
      for (const key of Object.keys(
        scaleOptions(scale, family, undefined, localEncoding),
      ))
        delete props[key];
    return props;
  });
  $effect(() => {
    const p = prepared,
      c = child;
    const mark = c?.getMark?.();
    if (!p?.scaleBindings?.length || !mark?.options) return;
    /** @param {NonNullable<PreparedMark["scaleBindings"]>[number]} binding */
    const set = ({ family, scale, localEncoding }) => {
      for (const [key, value] of Object.entries(
        scaleOptions(scale, family, undefined, localEncoding),
      )) {
        if (value !== undefined) mark.options.derive(key, value);
        else mark.options.clear(key, { layer: "derived" });
      }
    };
    // One rebuild for every option a scale update changes (its transform, quantize, ...).
    /** @param {NonNullable<PreparedMark["scaleBindings"]>[number]} binding */
    const apply = (binding) =>
      mark.batchOptions ? mark.batchOptions(() => set(binding)) : set(binding);
    untrack(() =>
      bindings.publish(mark, {
        scales: Object.fromEntries(
          /** @type {NonNullable<PreparedMark["scaleBindings"]>} */ (
            p.scaleBindings
          ).map((binding) => [binding.channel, binding.scale]),
        ),
      }),
    );
    for (const binding of p.scaleBindings) apply(binding);
    const stops = /** @type {NonNullable<PreparedMark["scaleBindings"]>} */ (
      p.scaleBindings
    ).map((binding) => binding.scale.subscribe(() => apply(binding)));
    return () => {
      stops.forEach((stop) => stop());
      bindings.patch(mark, { scales: null });
    };
  });
  /** @param {(values: Channels) => void} listener */
  export function subscribeSettings(listener) {
    let canceled = false,
      off = () => {};
    tick().then(() => {
      if (canceled) return;
      const options = currentMark()?.options;
      if (!options) return;
      const emit = () => {
        /** @type {Channels} */
        const values = {};
        for (const key of options.userKeys) {
          const value = options.get(key);
          if (
            typeof value === "string" ||
            typeof value === "boolean" ||
            typeof value === "number" ||
            value === null ||
            (Array.isArray(value) &&
              value.length < 16 &&
              value.every(
                (v) => typeof v === "number" || typeof v === "string",
              ))
          )
            values[key] = value;
        }
        listener(values);
      };
      emit();
      off = options.on(emit);
    });
    return () => {
      canceled = true;
      off();
    };
  }
  export const getLegendSource = () => child?.getLegendSource?.();
  export const getSurface = () => child?.getSurface?.();
  export const getMark = () => currentMark();
  $effect(() => {
    const entry = prepared,
      mark = currentMark();
    // The displayed preparation's binding: its interaction, what a tolerant pick needs (nearest's
    // radius, and whether rows or a region are drawn), a unified tooltip's series, the frame
    // picks report, and the rows of a padded view it draws (legend bounds and vector export skip
    // the rest).
    untrack(() => {
      const binding = bindings.publish(mark, {
        kind,
        frameKey: frame?.key ?? null,
        pickArea: capability(kind, "regions"),
        interaction: entry?.interaction ?? null,
        nearest: entry?.nearest ?? null,
        tooltip: entry?.tooltip
          ? { series: tooltips.series, clear: tooltips.clear }
          : null,
        rows: {
          count: entry?.filteredCount ?? null,
          valid: entry?.valid ?? null,
        },
        retain: retainPreparation(entry),
      });
      endpoint.accept(mark, entry, binding);
    });
  });
  $effect(() => {
    const entry = prepared,
      mark = currentMark();
    if (
      !entry ||
      !mark?.fields ||
      (!entry.scalarOpacity && !mark.fields.has("_channelOpacity"))
    )
      return;
    mark.ensureChannelOpacity(entry.scalarTranslucent);
    trackPreparation(
      viewServices,
      /** @type {import("../utils/internalTypes.js").RendererField} */ (
        mark.fields.get("_channelOpacity")
      ).update(
        /** @type {FieldValue} */ (
          entry.scalarOpacity ?? entry.props.opacity ?? 1
        ),
      ),
    );
  });
  // Feedback opacity (utils/feedbackOpacity.js): the displayed preparation's interaction dims the
  // rows it leaves out; a Filter mask swap or a live opacity write bumps opacityRevision.
  $effect(() => {
    const entry = prepared,
      mark = currentMark();
    opacityRevision;
    if (mark) return startFeedbackOpacity({ kind, mark, entry, report });
  });
  $effect(() => {
    // Views skip nearby pointer work on renderers with no nearby producer.
    const binding = prepared?.interaction;
    if (!binding?.nearby) return;
    const producers = viewServices.picking.nearby;
    producers.add(binding);
    return () => producers.delete(binding);
  });
  onDestroy(() => {
    alive = false;
    preparation.destroy();
    domainRoute.clear();
    facet?.axisColumns(domainOwner, null);
    for (const a of "xyz") frame?.axisName?.(a, undefined, domainOwner);
    report("");
    off.forEach((f) => f());
    expressionStops.forEach((f) => f());
    displayedFrames.cancel();
    localInteractionOwner?.dispose();
    retire(current);
  });
</script>

<!-- `prepared?.`: when an effect throws under an error boundary, the child's props are read once
  more during the teardown with `prepared` reading null; throwing there would replace the
  original error in the boundary's message. -->
<template bind:this={layerMarker} data-plot-layer></template>
{#if prepared}<Component
    bind:this={child}
    {...componentProps}
    {...capability(kind, "keyed")
      ? {
          _interactionOpacity:
            prepared?.displayedOpacity ??
            prepared?.expressionOpacity ??
            prepared?.lifecycleOpacity,
        }
      : {}}
  />{/if}

{#if child}<DragControllerView
    controller={dragController}
    mark={currentMark()}
  />{/if}
