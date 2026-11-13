<script module lang="ts">
  // Page-unique ids for plot titles (aria-labelledby, TODO 46 and 49).
  let plotTitles = 0;
</script>

<script lang="ts">
  import { registerInspection } from "../checking/registry.js";
  import { createScreenMapping, HTML_CONTEXT } from "./utils/screenMapping.js";
  import { onCoordinateView, attachViewContext } from "./utils/viewContext.js";
  import { gridAxisBounds } from "./utils/gridModel.js";
  import { enableDiagnostics, toDiagnostic } from "./utils/diagnostics.js";
  // Every material shares one pixel-ratio uniform (see the module).
  import "../threeExtensions/screenDPR.js";
  // Every material build of a mark shares its instance matrix's buffer (see the module).
  import "../threeExtensions/instanceMatrix.js";
  import { installStorageBindings } from "../threeExtensions/storageBindings.js";
  import Axis from "./axis.svelte";
  import { createBrushController } from "./utils/brushController.svelte.js";
  import BrushOverlay from "./scenes/brushOverlay.svelte";
  import { createTooltipController } from "./utils/tooltipController.svelte.js";
  import TooltipOverlay from "./scenes/tooltipOverlay.svelte";
  import { VIEW_CONTEXT, removedAxisProp } from "./utils/axisFrame.js";
  import { pngScale } from "./utils/documentExport.js";
  import { ROOT_CONTENT_CONTEXT } from "./utils/rootFrameSelection.js";
  import { createFrameModel } from "./utils/frameModel.js";
  import { exportGuides } from "./utils/guideExport.js";
  import { exportDocumentGuides } from "./utils/guideDocumentExport.js";
  import { setContext } from "svelte";
  import { GUIDE_CONTEXT, createGuideRegistry } from "./utils/guides.js";
  import GuideHost from "./guides/guideHost.svelte";
  import {
    ensureAnimation,
    ensureBoundsAnimation,
    animationClock,
    holdAnimation,
    attachClockView,
  } from "./utils/animation.js";
  import { provideViewServices } from "./utils/viewServices.js";
  import {
    ensureCoordinates,
    validateCoordinates,
    spherical,
    normalizeProjectionCenter,
    installCoordinateModeDefaults,
  } from "./utils/coordinates.js";
  import {
    CoordinateFrame,
    roundFrameLabels,
    validateAngularAxis,
  } from "./utils/coordinateFrame.js";
  import { installRendererDisposal } from "./rendering/rendererLifetime.js";
  import { installVaryingsCheck } from "./rendering/varyingsCheck.js";
  import { settleUploads } from "./rendering/uploadSettlement.js";
  import {
    settlePreparations,
    UPSTREAM_LOADS,
    settleClock,
    currentCause,
    publishWithCause,
    trackPreparation,
  } from "./rendering/viewSettlement.js";
  import { rendererDiagnostics } from "./rendering/viewDiagnostics.js";
  import {
    optionsRoot,
    OptionsNode,
    isSettingValue,
  } from "../options/options.js";
  import { readable, derived } from "svelte/store";
  import { viewMode, viewUp } from "./utils/camera.js";
  import {
    FALLBACK_MARGINS,
    MIN_CANVAS_SHARE,
    pinned,
    plotGutters,
    MAX_SHARE,
    SIDES,
    solveLayout,
    memoizeSpan,
    solveRoundLayout,
    letterbox,
    validateMargins,
    type AxisSpec,
  } from "./utils/plotLayout.js";
  import { resolveAxisStyle } from "./utils/axisStyle.js";
  import { transformClamped } from "./utils/scaleTransforms.js";
  import { readsData } from "./utils/dataDomains.svelte.js";
  import type { DomainGroup } from "./utils/domainGroup.js";
  import { ALIGN_MEMBER } from "./utils/alignGroup.svelte.js";
  import {
    LayoutLifecycle,
    type Gutters,
  } from "./utils/plotLayoutLifecycle.svelte.js";
  import { useReporter, provideViewReporter } from "./utils/reporter.js";
  import { diagnostic } from "./utils/diagnostics.js";
  import { plotRectangle } from "./utils/viewport.js";
  import {
    axisLayout,
    axisConfig,
    labelMargin,
    axisValue,
    polarAxisLayout,
    axisDefaults,
    axisKey,
    readAxis,
    validateAxis,
    OFFSET_RISE,
  } from "./utils/axes.js";

  import { cartesian2D, globe2D, hasAxisOverride } from "./utils/axisStyle.js";
  import { ensureAxisOptions } from "./utils/axisOptions.js";
  import Minimap from "./minimap.svelte";
  import Overview from "./scenes/overview.svelte";
  import { createMinimapSource } from "./utils/minimapSource.js";
  import AxisRules from "./scenes/axisRules.svelte";
  import UpdateGate from "./scenes/updateGate.svelte";
  import Export from "./scenes/export.svelte";
  import Scene2D from "./scenes/scene2d.svelte";
  import Scene3D from "./scenes/scene3d.svelte";
  import Lights from "./scenes/lights.svelte";
  import { rememberOptions } from "./utils/optionMemory.js";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { createPointerTracker } from "./utils/pointerTracker.js";
  import { createLoopGuard } from "./utils/viewLoopGuard.js";
  import { rerunLints } from "./utils/rerunGuard.js";
  import { createViewPointer } from "./utils/viewPointer.js";
  import { TOOLTIP_CONTEXT } from "./utils/tooltip.js";
  import { rootScope } from "./utils/dataView.js";
  import { facetService } from "./utils/facetService.js";
  import { VIEW_CLOCK_CONTEXT } from "./utils/viewState.js";
  import { provideClockScope } from "./utils/clockScope.js";
  import { Canvas, extend } from "@threlte/core";
  import * as THREE from "three/webgpu";
  import { getWebGPUDevice } from "@hmplot/jax";
  import { initializePlot } from "../jaxExtensions/setup.js";
  import { DEFAULT_FONT, withGenericFamily } from "./utils/defaultFont.js";
  import PlotText from "./plotText.svelte";
  import { createPlotDescription } from "./utils/plotDescription.svelte.js";
  import {
    coveringMarkers,
    hiddenCategoryLabels,
    marksOutsideAxes,
    prepareMarkerSizes,
    emptyMarks,
    unexplainedColors,
    wideDomains,
  } from "./utils/plotLints.js";
  import { svgMetadata } from "./utils/exportDocument.js";
  import { setOptionsContext } from "./utils/context.js";
  import { onMount, onDestroy, untrack, getContext, tick } from "svelte";
  import { registerPlot, mountedPlots } from "../options/inspector.js";
  import PlotContextMenu from "./plotContextMenu.svelte";
  import PlotControls from "../options/plotControls.svelte";
  import PlotDialogs from "../options/plotDialogs.svelte";
  import { PlotChrome } from "../options/plotChrome.svelte.js";
  import { controlsTheme } from "../options/controlsTheme.js";
  import ViewTelemetry from "./scenes/viewTelemetry.svelte";
  import Axes3D from "./scenes/axes3d.svelte";
  import AxisOverlay from "./scenes/axisOverlay.svelte";
  import Interactive from "./scenes/interactive.svelte";
  import { createPresentationOptions } from "./utils/presentationOptions.svelte.js";
  import {
    BoundsType,
    RangeType,
    SelectType,
    BooleanType,
    FieldType as NullableFieldType,
    ScalarType,
    FieldType,
    ColorType,
  } from "./objects/types.js";
  import type {
    PlotProps,
    PlotHandle,
    Viewport2D,
    DocumentExportOptions,
    DocumentExportResult,
    CameraState,
  } from "./publicTypes.js";
  import type {
    PlotRenderer,
    FrameContext,
    ViewFrame,
  } from "./utils/internalTypes.js";
  let {
    x = undefined,
    y = undefined,
    z = undefined,
    overview: overviewOption = undefined,
    overviewAxes = undefined,
    overviewScale = undefined,
    overviewMaxInstances = undefined,
    globeBackground = undefined,
    zoomAxis = undefined,
    axisMarginZoom = undefined,
    dynamicMargins = undefined,
    rules = undefined,
    bands = undefined,
    name = undefined,
    title = undefined,
    subtitle = undefined,
    caption = undefined,
    description = undefined,
    describe = true,
    width = undefined,
    height = 450,
    responsive = undefined,
    settings = {},
    viewport = undefined,
    onviewportchange = undefined,
    interactive = true,
    cameraMode = undefined,
    cameraPosition = undefined,
    cameraTarget = undefined,
    cameraUp = undefined,
    cameraFov = undefined,
    cameraNear = undefined,
    cameraFar = undefined,
    flySpeed = undefined,
    flyoverMomentum = undefined,
    oncamerachange = undefined,
    fitRevision = 0,
    // Exact colors by default (TODO 133.5): marks match their legends; a scene opts into a
    // filmic look with toneMapping (THREE.ACESFilmicToneMapping, 4).
    toneMapping = THREE.NoToneMapping,
    effects = undefined,
    lights = undefined,
    type = $bindable("2d"),
    children = undefined,
    toolbar = undefined,
    // Omitted: a legend for colors mapped from a category column (TODO 136.17).
    legend = undefined,
    loading = "atomic",
    background = undefined,
    exportHTML = undefined,
    tooltip = undefined,
    nearest = undefined,
    zScale = undefined,
    scaleDefaults = undefined,
    ...others
  }: PlotProps &
    import("./utils/viewControllerTypes.js").ViewCoreInternalProps = $props();
  $effect(() => {
    if (others.pole !== undefined)
      throw Error(
        "Plot pole was removed; use projectionCenter=[longitude, latitude].",
      );
    if (others.displayScale !== undefined)
      throw Error(
        "Plot displayScale was removed; set the marks' pixel sizes (size, width, outlineWidth, dash, cap and head sizes, offsets) directly.",
      );
    if (others.fog !== undefined)
      throw Error(
        'Plot fog was removed; list it in effects: effects={[{ kind: "fog", near: 50, far: 200 }]}.',
      );
    // The Plot's x, y and z are its only axis API (R2.0).
    for (const key of Object.keys(others)) {
      const moved = removedAxisProp(key);
      if (moved) throw Error(`Plot.${key} is not a prop: ${moved}.`);
    }
    if (zScale !== undefined && typeof zScale !== "number")
      throw Error(
        "Plot.zScale is a number (the height exaggeration); a categorical z axis is z={{ scale }}.",
      );
  });

  // Keep SSR on the loading branch and initialize GPU resources only on mount.
  let ready = $state.raw(new Promise(() => {}));
  onMount(() => {
    ready = initializePlot();
  });
  extend(THREE);
  let renderer = $state<PlotRenderer>();
  let atomicVisible = $state(false),
    revealWork: Promise<void> = Promise.resolve();
  // This plot's mount, as a change the work it starts serves (TODO 17.15; utils/lifecycle.js).
  const mountedAt = settleClock();
  // Transforms above this view, outside every Plot, read its clock for @time (TODO 28): they
  // adopt its services (Stage 117.1), once its renderer exists.
  const clockHost: any = getContext(VIEW_CLOCK_CONTEXT);
  // Its clock scope (TODO 50): the one around it (a Scene, InputContext, standalone Facet or
  // Simulate), whose Plots share @time, else its own.
  const clockScope = provideClockScope();
  // Providers above this view: whenSettled() waits for their loads (TODO 20).
  const loadsAbove: any = getContext(UPSTREAM_LOADS);
  $effect(() => {
    const active = renderer;
    if (active && clockHost) return clockHost.adopt(services);
  });
  // The reveal runs on mount and when the loading mode changes, not on every props update: a
  // Python scene replaces every props object on each update, and a re-reveal would hide the
  // canvas until the work that update started (a tile or Provider load inside the plot) settles.
  const loadingMode = $derived(loading);
  $effect(() => {
    if (!renderer) return;
    const { lifecycle } = services;
    lifecycle.mountCause ??= mountedAt;
    lifecycle.mounting = true;
    const progressive = loadingMode === "progressive";
    atomicVisible = progressive;
    let canceled = false;
    const reveal = (async () => {
      await tick();
      await tick();
      // The work the plot started with (and its follow-ups), not later requests: a plot whose
      // data changes every frame still reveals (TODO 17.15).
      await settlePreparations(services, settleClock());
      await settleUploads(services);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (!canceled) lifecycle.mounting = false;
      if (!canceled && !progressive) {
        atomicVisible = true;
        await tick();
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
          await new Promise<void>((resolve) => setTimeout(resolve, 130));
      }
    })();
    revealWork = progressive ? Promise.resolve() : reveal;
    return () => {
      canceled = true;
    };
  });
  // What the plot's alert shows: its marks' errors (owner-scoped in its view's diagnostics,
  // reportDataError) and the view's own, one per source (TODO 32.5). Before, each of the view's
  // writers replaced the whole message, and a mark's next report wiped a brush error. A brush or
  // nearby gesture's error lasts until the next gesture; a configuration error until its effect
  // next runs.
  let dataIssue = $state("");
  // This view's services (Stage 117.1, utils/viewServices.ts), for the components under it.
  const services = provideViewServices({
    showErrors: (message) => (dataIssue = message),
    clockScope,
  });
  provideViewReporter((owner, entry) =>
    services.diagnostics.report(owner, entry),
  );
  const viewIssues = $state<Record<string, string>>({});
  const renderIssue = $derived(
    [dataIssue, ...Object.values(viewIssues)].filter(Boolean).join(" · "),
  );
  const issue = (source: string, message = "") => {
    if (message) viewIssues[source] = message;
    else if (source in viewIssues) delete viewIssues[source];
  };
  // The view's frames: the root selection, parentage and per-dimension ownership (Stage 119.1,
  // utils/frameModel.ts). Its cells are this component's state, so reads here and in the frames
  // track it. The logical content registry (ROOT_CONTENT_CONTEXT) records component ownership,
  // independently of DOM and frame registration order.
  const frameModel = createFrameModel({
    cell: <T,>(value: T) => {
      let current = $state.raw(value);
      return {
        get: () => current,
        set: (next: T) => {
          current = next;
        },
      };
    },
  });
  const frames = $derived(frameModel.frames());
  // Canvas pixels, the world the camera shows, and the pointer and visible domain in a frame's
  // data (utils/viewPointer.ts).
  const { localPointer, canvasSize, worldAt, pointerIn, visibleIn } =
    createViewPointer({
      get canvasHost() {
        return canvasHost;
      },
      get canvasWidth() {
        return canvasWidth;
      },
      get canvasHeight() {
        return canvasHeight;
      },
      get viewFrame() {
        return viewFrame;
      },
      get frames() {
        return frames;
      },
      get mode() {
        return $mode;
      },
      view: services,
    });
  const brush = createBrushController({
    get renderer() {
      return renderer;
    },
    get interactive() {
      return interactive;
    },
    frames: frameModel,
    get plotOptions() {
      return plotOptions;
    },
    get viewFrame() {
      return viewFrame;
    },
    get layout() {
      return layout;
    },
    get mode() {
      return $mode;
    },
    get canvasHost() {
      return canvasHost;
    },
    get plotHost() {
      return plotHost;
    },
    get canvasWidth() {
      return canvasWidth;
    },
    get canvasHeight() {
      return canvasHeight;
    },
    get hovered() {
      return hovered;
    },
    get brushResource() {
      return getBrush();
    },
    view: services,
    issue,
    localPointer,
    canvasSize,
    worldAt,
  });
  onDestroy(brush.dispose);
  export const clearBrush = () => brush.clearBrush();
  // Pointer columns (TODO 45): the pointer in each reading frame's data, for the readers that
  // subscribe through the view's navigation (utils/pointerTracker.js). A mouse or pen is tracked
  // while over the canvas, a finger while it is down; the pointer is missing otherwise.
  // The loop guard (TODO 136.8, utils/viewLoopGuard.js): a cycle through the view stops its
  // readers and shows on the plot until the next input.
  const loopOwner = {};
  const loopGuard = createLoopGuard({
    report: (error) => services.diagnostics.report(loopOwner, error),
  });
  onDestroy(services.navigation.loops.install(loopGuard));
  const pointerTracker = createPointerTracker({
    convert: (point, frame) => pointerIn(point, frame),
    extent: (frame) => visibleIn(frame),
    gate: () => loopGuard.allow(),
    // The readers update at the next frame as part of the move's change (as nearby does), so
    // whenSettled() waits for them.
    schedule(update) {
      const cause = currentCause(services);
      let done: (() => void) | undefined;
      if (renderer)
        trackPreparation(
          services,
          new Promise<void>((resolve) => (done = resolve)),
          cause,
        );
      requestAnimationFrame(() => {
        let work;
        try {
          publishWithCause(services, cause, () => {
            work = update();
          });
        } finally {
          Promise.resolve(work).finally(() => done?.());
        }
      });
    },
  });
  // A pan, zoom or resize puts other data under a pointer that did not move.
  $effect(() => {
    viewFrame;
    untrack(() => pointerTracker.refresh());
  });
  // The viewer's gesture (TODO 136.8, utils/gesture.js): a drag or a wheel burst on the canvas,
  // outside its controls. A pointer released off the canvas without capture ends it too.
  const gesture = services.navigation.gesture;
  const controlTarget = (event: Event) =>
    (event.target as Element | null)?.closest?.(
      '.settings-trigger,[role="dialog"],button,input,select,textarea',
    );
  function gestureEvent(event: PointerEvent | WheelEvent) {
    loopGuard.input();
    if (event.type === "wheel") {
      if (!controlTarget(event)) gesture.wheel();
      return;
    }
    const pointer = event as PointerEvent;
    if (pointer.type === "pointerdown") {
      if (!controlTarget(event)) gesture.press(pointer.pointerId);
    } else if (pointer.type === "pointermove") gesture.move(pointer.pointerId);
    else gesture.release(pointer.pointerId);
  }
  const releaseOffCanvas = (event: PointerEvent) =>
    gesture.release(event.pointerId);
  const cancelGesture = () => gesture.cancel();
  const stopGestureWatch = gesture.onChange((active) => {
    for (const [type, listener, capture] of [
      ["pointerup", releaseOffCanvas, true],
      ["pointercancel", releaseOffCanvas, true],
      ["blur", cancelGesture, false],
    ] as const)
      if (active)
        window.addEventListener(type, listener as EventListener, capture);
      else window.removeEventListener(type, listener as EventListener, capture);
  });
  // The layout solver keeps its gutters while a gesture runs (TODO 136.10's motion rules).
  let gestureActive = $state(gesture.active);
  const stopGestureLayout = gesture.onChange(
    (active) => (gestureActive = active),
  );
  onDestroy(() => {
    stopGestureLayout();
    gesture.cancel();
    stopGestureWatch();
  });
  function trackPointer(event: PointerEvent) {
    if (
      event.pointerType === "touch" &&
      event.type === "pointermove" &&
      !event.buttons
    )
      return;
    pointerTracker.move(localPointer(event));
  }
  function releasePointer(event: PointerEvent) {
    if (event.pointerType === "touch" || event.type === "pointerleave")
      pointerTracker.move(null);
  }
  // A moving 3D camera puts another point of a globe under a still pointer.
  function cameraChanged(event: any) {
    pointerTracker.refresh();
    tooltips.box.hold("gesture");
    return oncamerachange?.(event);
  }
  let overviewCount = $state(0);
  const overviewSource = createMinimapSource(
    (count: number) => (overviewCount = count),
  );
  export function getMinimapSource() {
    return overviewSource.handle;
  }
  const overviewHandle = { getMinimapSource };
  // One legend per outermost Plot or Facet: a plot inside a Facet registers its marks with
  // the Facet's registry and renders no legend strips of its own.
  const inheritedGuides: any = getContext(GUIDE_CONTEXT);
  const guides = inheritedGuides ?? createGuideRegistry();
  setContext(GUIDE_CONTEXT, guides);
  // Tooltips (TODO 44): the Plot's setting is its marks' default, as its nearest is (TODO 72), and
  // the view shows one box, the row a mark's tolerant pick chose, beside the pointer. A gesture (a drag, a pan, a brush, a
  // wheel zoom, a camera move) holds it hidden until the next plain move; Escape until another
  // row; leaving the canvas clears it (a tap keeps it, until a tap elsewhere).
  setContext(TOOLTIP_CONTEXT, {
    get plotDefault() {
      return tooltip;
    },
    get nearestDefault() {
      return nearest;
    },
  });
  const tooltips = createTooltipController({
    get renderer() {
      return renderer;
    },
    activeRootFrame: () => activeRootFrame(),
    get mode() {
      return $mode;
    },
    get canvasHost() {
      return canvasHost;
    },
    get plotHost() {
      return plotHost;
    },
    get tooltip() {
      return tooltip;
    },
    view: services,
    localPointer,
    pointerIn,
  });
  onDestroy(() => tooltips.dispose());
  // What viewCore installs in its navigation with each renderer (the pointer, the tooltip box,
  // the root frame), released with the view.
  const navigationReleases: (() => void)[] = [];
  onDestroy(() => navigationReleases.splice(0).forEach((release) => release()));
  // Inside a Facet the handle lists this plot's own marks; the Facet lists every cell.
  export const getLegendSource = () =>
    inheritedGuides ? guides.scopedHandle(plotOptions) : guides.handle;
  onDestroy(() => {
    if (!inheritedGuides) guides.dispose();
  });
  setContext(ROOT_CONTENT_CONTEXT, frameModel.content);
  // undefined means unresolved logical content: keep the last published root.
  // null is a resolved choice of the Plot's implicit root.
  const logicalRootKey = $derived(frameModel.selectedRoot());
  export const getLogicalRootFrameKey = () => logicalRootKey;
  const activeRootKey = $derived(frameModel.activeRoot());
  $effect(() => {
    const next = logicalRootKey;
    if (next === undefined) return;
    // Defer publication until registration settles; effect cleanup cancels a
    // superseded selection or an unmounted owner before this task activates it.
    let canceled = false;
    queueMicrotask(() => {
      if (canceled || frameModel.activeRoot() === next) return;
      // Cancel against the old coordinates before activating the new root, then
      // advance its revision before refreshing the brush in the following task.
      brush.cancelGestureForRootChange();
      frameModel.activate(next);
      plotOptions.set("_rootRevision", plotOptions.get("_rootRevision") + 1);
      queueMicrotask(brush.refreshBrushRect);
    });
    return () => {
      canceled = true;
    };
  });
  const frameContext: FrameContext = {
    model: frameModel,
    trackPreparation: (work) => trackPreparation(services, work),
    whenSettled,
    options: () => plotOptions,
    frame: () => viewFrame,
    width: () => canvasWidth,
    height: () => canvasHeight,
    mode: () => $mode,
    rectangles: () => layout,
    getMinimapSource,
    getLegendSource,
  };
  setContext(VIEW_CONTEXT, frameContext);
  export function getAxes() {
    return frames.map((f) => f.handle);
  }
  export const getFrames = getAxes;
  const cameraMemory = {};
  let boxFrame = $state.raw(null);
  let rememberedViewport = $state<Viewport2D | undefined>(undefined);
  const facet = facetService();
  const dataContext: any = getContext(DATA_CONTEXT);
  // The root frame infers domains when data is in scope unless the caller decides explicitly.
  const autoBoundsEnabled = $derived(
    others.autoBounds ?? Boolean(dataContext || facet),
  );
  export const getSelection = () => dataContext?.read()?.identity?.selection;
  export const getBrush = () => dataContext?.read()?.identity?.brush;
  export const getHover = () => dataContext?.read()?.identity?.hover;
  export const getOffsets = () => dataContext?.read()?.identity?.offsets;
  export const resetOffsets = (columns = undefined) => {
    dataContext?.read()?.identity?.offsets.clear(columns);
  };
  export const applyOffsets = () =>
    rootScope(dataContext?.read())?.applyOffsets!();
  Object.assign(cameraMemory, facet?.memory()?.cameraMemory ?? {});
  function viewChanged(next: Viewport2D) {
    facet?.changed(next);
    rememberedViewport = next;
    onviewportchange?.(next);
  }
  onDestroy(() => {
    overviewSource.dispose();
  });
  const plotOptions = (
    getContext<typeof optionsRoot>("hmplot-plot-scope") ?? optionsRoot
  ).splitUnique(untrack(() => name));
  // What the plot knows about its view, for its frames, marks and scenes (TODO 136.12).
  const viewContext = attachViewContext(plotOptions);
  const coordinateFrame = new CoordinateFrame(plotOptions);
  // Listeners to every option of the plot hear its view mode change too, as they heard the
  // option that carried it.
  const stopViewNotice = onCoordinateView(plotOptions, () =>
    plotOptions.notifyAny("viewContext"),
  );
  onDestroy(stopViewNotice);
  // Before the marks mount: a map fit reads it (mapFit.js).
  viewContext.update({
    explicitViewport: untrack(() => viewport) !== undefined,
  });
  if (!inheritedGuides) plotOptions.guideRegistry = guides;
  // A plot in an external Facet cell: every cell's marks share legend definitions.
  if (facet && !facet.embedded) plotOptions.definitionAlias = "*";
  const activeRootFrame = () => frameModel.rootFrame();
  const screenMapping = createScreenMapping(() => ({
    options: activeRootFrame()?.options ?? plotOptions,
    camera: services.picking.camera.current?.(),
    width: canvasWidth,
    height: canvasHeight,
  }));
  services.lifecycle.frameCallbacks.add(screenMapping.draw);
  export const getScreenMapping = screenMapping.getScreenMapping;
  export const subscribeScreenMapping = screenMapping.subscribeScreenMapping;
  let htmlOverlay = $state<HTMLDivElement>();
  setContext(HTML_CONTEXT, {
    host: () => htmlOverlay,
    focus: () => canvasHost?.focus(),
  });
  onDestroy(() => {
    services.lifecycle.frameCallbacks.delete(screenMapping.draw);
    screenMapping.dispose();
  });
  const htmlEvent = (event: Event) =>
    event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement && node.hasAttribute("data-hmplot-html"),
      );
  // A domain the Plot's x, y or z sets, as its own frame (the implicit root) accepted it.
  const plotDomain = (axis: string) =>
    frameModel.implicitRoot()?.explicitDomain(axis);
  // The options its marks draw in: a promoted Frame's, else its own (its root frame's).
  const rootFrameOptions = () => frameModel.promotedOptions() ?? plotOptions;
  plotOptions.categoryAxes = {};
  plotOptions.ensure(
    "_categoryRevision",
    new ScalarType({ defaultValue: 0, ui: false }),
  );
  plotOptions.ensure(
    "_rootRevision",
    new ScalarType({ defaultValue: 0, ui: false }),
  );
  // The Plot's categorical x, y and z scales are its root frame's (axis.svelte); zScale is the
  // surfaces' height exaggeration.
  $effect(() => {
    if (typeof zScale === "number")
      untrack(() => {
        plotOptions.ensure("zScale", new ScalarType({ defaultValue: 1 }));
        plotOptions.set("zScale", zScale);
      });
  });
  ensureCoordinates(plotOptions);
  onDestroy(installCoordinateModeDefaults(plotOptions));
  $effect(() => {
    if (globeBackground !== undefined) {
      if (globeBackground === false)
        plotOptions.set("globeBackgroundVisible", false);
      else {
        plotOptions.set("globeBackground", globeBackground);
        plotOptions.set("globeBackgroundVisible", true);
      }
    }
  });
  ensureAnimation(plotOptions);
  ensureBoundsAnimation(plotOptions);
  plotOptions.ensure("xrange", new RangeType({ defaultValue: [-50, 50] }));
  plotOptions.ensure("yrange", new RangeType({ defaultValue: [-50, 50] }));
  plotOptions.ensure("zrange", new RangeType({ defaultValue: [-50, 50] }));
  plotOptions.ensure("xbounds", new BoundsType({ defaultValue: [-1, 1] }));
  plotOptions.ensure("ybounds", new BoundsType({ defaultValue: [-1, 1] }));
  plotOptions.ensure("zbounds", new BoundsType({ defaultValue: [-1, 1] }));
  const registration = registerPlot(
    plotOptions,
    untrack(() => name),
    { rootFrame: rootFrameOptions },
  );
  // The settings pane, the export panel and their buttons (options/plotChrome.svelte.ts).
  const chrome = new PlotChrome();
  let plotHost = $state<HTMLElement>(),
    canvasHost = $state<HTMLDivElement>();
  let canvasWidth = $state(0),
    canvasHeight = $state(0),
    hovered = $state(false);
  let contextMenu = $state<ReturnType<typeof PlotContextMenu>>();
  // settings.showExport and settings.menu (TODO 128); a Facet cell's Plot follows its Facet's
  // unless it sets its own. Host code's exportPNG() and openSettings() work either way.
  const exportShown = $derived(
    (settings.showExport ?? facet?.chrome().showExport) !== false,
  );
  const menuShown = $derived((settings.menu ?? facet?.chrome().menu) !== false);
  function openContextMenu(event: MouseEvent) {
    // Without the plot's menu the browser's own opens.
    if (!menuShown) return;
    // Preserve mark contextmenu callbacks while replacing the browser menu.
    event.preventDefault();
    contextMenu?.open(event.clientX, event.clientY);
  }
  function contextMenuKey(event: KeyboardEvent) {
    if (!menuShown) return;
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      const rect = canvasHost!.getBoundingClientRect();
      contextMenu?.open(rect.left + 16, rect.top + 16);
    }
  }
  // The settings and export buttons (TODO 60). Touch screens show them too, faintly, since they
  // cannot reveal them by hovering.
  const controlsEligible = $derived(
    settings.showTrigger !== false && canvasWidth >= 240 && canvasHeight >= 160,
  );
  // The title's id, for the section's accessible name (TODO 46 and 49).
  const headingId = `hm-plot-title-${++plotTitles}`,
    descriptionId = `hm-plot-description-${plotTitles}`;
  // Descriptions (TODO 49; utils/plotDescription.svelte.ts): the marks register what they draw
  // (namedMark); the text is written when the plot settles after a change, never per frame.
  const descriptions = createPlotDescription({
    activeRootFrame,
    get plotOptions() {
      return plotOptions;
    },
    get layout() {
      return layout;
    },
    get activeRootKey() {
      return activeRootKey;
    },
    get mode() {
      return $mode;
    },
    clockHost,
    guides,
    whenSettled,
    get description() {
      return description;
    },
    get describe() {
      return describe;
    },
  });
  // The title as shown (placeholders read, TODO 46), for export metadata and HTML exports.
  const plainTitle = () =>
    plotHost?.querySelector(".plot-title")?.textContent ??
    (typeof title === "string" ? title : "");
  /** The plot's title as shown ("" without one). */
  export const getTitle = () => plainTitle();
  /** The plot's description as screen readers get it: description=, then the generated summary. */
  export const getDescription = () => descriptions.current();
  /**
   * What the plot draws, as its description is written from it (describe.js describePlot): its
   * marks with their columns and row counts, its axes' ranges or categories, its coordinates.
   * Python's hm.check reads it (R2.8).
   */
  export const getDescriptionModel = () => descriptions.model();
  /** Called with the description whenever it changes (and once now). */
  export function subscribeDescription(listener: (text: string) => void) {
    return descriptions.subscribe(listener);
  }
  const displayLabel = $derived(
    $mountedPlots.find((entry) => entry.node === plotOptions)?.label ??
      registration.label,
  );
  const viewOptions = new OptionsNode();
  plotOptions.viewOptions = viewOptions;
  viewOptions.define(
    "type",
    new SelectType({
      defaultValue: untrack(() => type),
      options: { "2D": "2d", "3D (Z up)": "3d", "3D (Y up)": "3d-y-up" },
    }),
  );
  const viewType = viewOptions.store("type");
  const mode = derived(viewType, viewMode);
  viewContext.update({ mode: untrack(() => $mode) });
  let previousType = untrack(() => type);
  $effect(() => {
    const incoming = type;
    const current = $viewType;
    if (type !== previousType) {
      previousType = type;
      if (current !== incoming) viewOptions.set("type", incoming);
    } else if (current !== incoming) {
      previousType = current;
      type = current;
    }
  });
  $effect(() => registration.update(name));
  $effect(() => {
    if (!canvasHost) return;
    const observer = new ResizeObserver(([entry]) => {
      canvasWidth = entry.contentRect.width;
      canvasHeight = entry.contentRect.height;
    });
    observer.observe(canvasHost);
    return () => observer.disconnect();
  });
  // Hidden buttons close what they opened; one opened another way (the context menu) stays open.
  $effect(() => {
    if (!controlsEligible && chrome.closeBuiltin())
      plotHost?.focus({ preventScroll: true });
  });
  let measuredWidth = $state(800);
  // `height` is the whole figure, its title and legends included (TODO 136.10 slice 3): the
  // section is a column at least that tall, and the canvas's row takes what the slots above and
  // below it leave, keeping MIN_CANVAS_SHARE of it. A Facet sizes its cells' canvases itself.
  const figure = $derived(!facet && !inheritedGuides);
  // Default plots shrink to their container but stop at 800px; explicit responsive fills it, as
  // does a scene's host (SceneRenderer's `fill`: a notebook cell, an exported page; TODO 132.5).
  const fillHost: any = getContext("hmplot-fill-host");
  const fills = $derived(responsive ?? width === undefined);
  const actualWidth = $derived(fills || facet ? measuredWidth : (width ?? 800));
  const facetOptionsMemory = facet
    ? rememberOptions(plotOptions, facet.memory()?.settings)
    : null;
  onDestroy(() => facetOptionsMemory?.dispose());
  onMount(() =>
    facet?.register({
      handle: {
        whenSettled,
        whenAnimationsFinished,
        exportPNG,
        exportSVG,
        exportPDF,
        openSettings,
        closeSettings,
        getAxisLayout,
        getAxes,
        getDiagnostics,
        beginUpdate,
        getLegendSource,
        getMinimapSource,
        setViewport,
        getViewport,
        getCamera,
        setCamera,
        fit,
        gridLinkCompatible: () =>
          $mode === "2d" && plotOptions.get("coordinates") === "cartesian",
      },
      initialize: async () => {
        await ready;
        await tick();
      },
      ready: () => Boolean(renderer && exporters?.png),
      snapshot: () => ({
        settings: facetOptionsMemory?.snapshot,
        cameraMemory,
      }),
      element: () => plotHost,
      setDomain(axis: string, bounds: number[]) {
        if (axis.includes(":")) {
          const [slot, dimension] = axis.split(":");
          frames.find((f) => f.key === slot)?.setDomain(dimension, bounds);
          return;
        }
        activeRootFrame()?.setDomain(axis, bounds);
      },
    }),
  );
  export function openSettings(
    anchorElement: HTMLElement | undefined = chrome.settingsButton,
  ) {
    chrome.openSettings(
      anchorElement?.isConnected ? anchorElement : canvasHost,
    );
  }
  // Borrowed scene callbacks exist only while Export is mounted; its release
  // clears this handle. They own the resulting image/document, not this view.
  type SceneExporters = {
    png(scale: number): Promise<Blob>;
    svg(options?: DocumentExportOptions): Promise<DocumentExportResult>;
    pdf(options?: DocumentExportOptions): Promise<DocumentExportResult>;
  };
  let exporters: SceneExporters | undefined;
  export async function exportPNG(options = {}) {
    const scale = pngScale(options);
    await whenSettled();
    if (!exporters?.png) throw Error("Plot is not ready.");
    const release = holdAnimation(renderer && services);
    try {
      return await exportGuides(
        await exporters.png(scale),
        canvasHost,
        plotHost,
        (renderer as any).backend.device.limits,
      );
    } finally {
      release();
    }
  }
  async function exportVector(kind: "svg" | "pdf", options = {}) {
    await whenSettled();
    if (!exporters?.[kind]) throw Error("Plot is not ready.");
    const release = holdAnimation(renderer && services);
    try {
      // Build the plot once as SVG, then compose embedded guides and choose
      // the requested final container. This preserves legend text as text.
      const result = await exporters.svg(options);
      if (htmlOverlay?.childElementCount)
        result.report.warnings.push(
          "Html attachments are omitted from plot PNG, SVG and PDF exports; use a browser screenshot to include them.",
        );
      // The document's title and description (TODO 49): the plot's title (else its name) and
      // its description.
      const metadata = {
        title: plainTitle() || displayLabel,
        description: descriptions.current(),
      };
      const composed = await exportDocumentGuides(
        result,
        canvasHost,
        plotHost,
        kind,
        { ...options, metadata },
      );
      if (composed !== result) return composed;
      return {
        ...result,
        blob: new Blob([svgMetadata(await result.blob.text(), metadata)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      };
    } finally {
      release();
    }
  }
  export const exportSVG = (options = {}) => exportVector("svg", options);
  export const exportPDF = (options = {}) => exportVector("pdf", options);
  export function closeSettings() {
    chrome.closeSettings();
  }
  // Credits (TODO 35): marks' data sources (a VectorTile's attribution), one line in the lower-left corner (the right holds the settings and export buttons),
  // an export overlay like the axes (svg[data-export-axes]).
  let credits = $state("");
  $effect(() => {
    if (!renderer) return;
    const update = () => (credits = services.credits.line());
    const release = services.credits.changed.install(update);
    update();
    return release;
  });
  let updateGate: { hold(): void; release(): void } | undefined;
  let updateHolds = 0;
  // Keep the last complete canvas frame while a caller updates several marks (the view's update
  // gate), and take a layout's fit as data bounds (the view's domains, utils/viewServices.ts).
  $effect(() => {
    const active = renderer;
    if (active) {
      const { domains, updates } = services;
      const releases = [updates.gate.install(beginUpdate)];
      releases.push(
        domains.dataBounds.install((bounds, explicit) => {
          for (const [axis, domain] of Object.entries(bounds))
            if (explicit || plotDomain(axis) === undefined)
              plotOptions.set(axis + "bounds", domain);
        }),
      );
      return () => releases.forEach((release) => release());
    }
  });
  $effect(() => {
    untrack(() => issue("grid"));
    try {
      // An Interpolate's or a Density's output around the Plot sets its bounds; a grid table's (TODO 51)
      // does not: its Heatmaps set their own domains, and other marks may plot other columns.
      const scope = dataContext?.read(),
        grid = scope?.aggregate ? scope.grid : null;
      if (grid)
        untrack(() => {
          for (const [axis, bounds] of Object.entries(gridAxisBounds(grid)))
            if (plotDomain(axis) === undefined)
              plotOptions.set(axis + "bounds", bounds);
        });
    } catch (e) {
      untrack(() => issue("grid", (e as Error).message));
    }
  });
  export function beginUpdate() {
    if (++updateHolds === 1) updateGate?.hold();
    let released = false;
    return async ({ skipPreparations = false } = {}) => {
      if (released) return;
      released = true;
      try {
        if (skipPreparations) {
          if (renderer) await settleUploads(services);
        } else await whenSettled();
      } finally {
        if (--updateHolds === 0) updateGate?.release();
      }
    };
  }
  /**
   * Resolves once the changes made before this call are drawn: pending updates flush first,
   * then the work they started and its follow-ups settle. Requests made later (the next frame
   * of an animated input) are not waited for (TODO 17.15). With `loads: false`, Providers'
   * loads are not waited for either (a scene update is applied while they load; TODO 20).
   */
  export async function whenSettled({ loads = true } = {}) {
    // The plot mounts its children after the GPU init: wait for it, so their work is started.
    await ready;
    await tick();
    await frameModel.whenPublished();
    const until = settleClock();
    // The loads of the Providers above this plot, then what their results started (TODO 20).
    if (loads && loadsAbove) {
      await loadsAbove(until);
      await tick();
    }
    // Every plot's work: a change here reruns the Filters of the plots linked to it.
    if (renderer) {
      await settlePreparations(services, until, { everywhere: true, loads });
      await settleUploads(services);
    }
    await tick();
    await frameModel.whenPublished();
    await revealWork;
    // The camera fits the area the layout solved from its last frame (TODO 136.10): wait a few
    // frames at most for the frame it draws to be the area the overlay draws.
    await layoutLifecycle.fontsLoaded();
    for (let i = 0; i < 12 && layoutPending(); i++) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
        setTimeout(resolve, 50);
      });
      await tick();
    }
    // Font and gutter changes can queue an overlay publication after the first
    // preparation barrier. Export the ticks from the completed, fitted frame too.
    if (renderer) {
      await settlePreparations(services, settleClock(), { loads });
      await tick();
    }
  }
  function layoutPending() {
    // Only a Cartesian plot with 2D axes lays its area out (the camera fits the margins there).
    const laid =
      (plotOptions.get("coordinates") ?? "cartesian") === "cartesian" &&
      localOptions.get("axes2d");
    return layoutLifecycle.pending(
      laid ? layout : null,
      laid ? viewFrame?.rect : null,
    );
  }
  export async function whenAnimationsFinished() {
    await whenSettled();
    if (renderer) await animationClock(renderer).finished();
    // A view easing to a new viewport or camera prop (TODO 136.14) holds a gesture until it lands.
    await services.navigation.gesture.whenReleased();
    await whenSettled();
  }
  export function getAxisLayout() {
    return activeRootFrame()?.layout ?? layout;
  }
  /**
   * The clock in milliseconds, shared by every Plot in its scope (TODO 50): 0 when the scope
   * starts, advanced by the frame time while anything in it animates (transitions, @time
   * channels, a playing Playback, a running Simulate), and still while frozen. @time reads it,
   * and every transition is timed by it.
   */
  export function getAnimationTime() {
    return clockScope.time;
  }
  /** Whether setAnimationTime froze the clock. */
  export function getAnimationTimeFrozen() {
    return clockScope.frozen;
  }
  /**
   * Set the clock of this Plot's scope. With freeze (the default) the clock stops advancing, so
   * every transition and @time channel in the scope holds its position at this time until the
   * next call or setAnimationTime(null) resumes it; exports then capture that exact moment.
   * Transitions started at a later time have not begun yet at an earlier one. A step forward
   * moves the scope's playing Playbacks and running Simulates with it. Resolves when this Plot
   * has settled.
   */
  export async function setAnimationTime(
    time: number | null | undefined,
    { freeze = true } = {},
  ) {
    if (
      time !== null &&
      time !== undefined &&
      (typeof time !== "number" || !Number.isFinite(time) || time < 0)
    )
      throw Error(
        "setAnimationTime needs a nonnegative number of milliseconds.",
      );
    // The clock scope exists from the plot's start, before its renderer: a time set while the
    // GPU initializes holds (TODO 136.1: it was dropped, and a transition started at 0). Until
    // then there is nothing to settle, and waiting would block a page that sets the time
    // before it shows the plot (the Python runtime's set_time).
    if (!renderer) {
      clockScope
        .setTime(time, { freeze })
        .catch((error: unknown) => console.error(error));
      return;
    }
    await clockScope.setTime(time, { freeze });
    await whenSettled();
  }
  /** The plot's animation as an MP4 Blob, encoded in the browser (hmplot/video, loaded on demand). */
  export async function exportVideo(options = {}) {
    const { exportVideo: encode } = await import("../video.js");
    return encode(
      { getAnimationTime, getAnimationTimeFrozen, setAnimationTime, exportPNG },
      options,
    );
  }
  export function holdAnimations() {
    return holdAnimation(renderer && services);
  }
  export function subscribeSettings(
    listener: (snapshot: Record<string, unknown>) => void,
  ) {
    const emit = () => {
      const result: Record<string, unknown> = {};
      for (const [prefix, options] of [
        ["", plotOptions],
        ["plot.", localOptions],
      ] as [string, OptionsNode][]) {
        // Only the viewer's edits (the user layer, TODO 136.7): authored props are the scene's.
        for (const key of options.userKeys) {
          const value = options.get(key);
          if (isSettingValue(value)) result[prefix + key] = value;
        }
      }
      // The view mode only when the viewer changed it (the user layer, TODO 136.7).
      if (viewOptions.userKeys.has("type"))
        result["type"] = viewOptions.get("type");
      listener(result);
    };
    // An animated frame changes several options (each axis's bounds), each reaching every
    // options node: one snapshot per task carries the last value of each.
    let queued = false,
      active = true;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (active) emit();
      });
    };
    emit();
    const off = [
      plotOptions.on(schedule),
      localOptions.on(schedule),
      viewOptions.on(schedule),
    ];
    return () => {
      active = false;
      off.forEach((f) => f());
    };
  }
  export function getRenderError() {
    // An axis that cannot lay out is a render error too (TODO 136.2).
    return (
      services.lifecycle.deviceLost ||
      [renderIssue, axisError].filter(Boolean).join(" · ")
    );
  }
  export function getRenderDiagnostic() {
    return services.diagnostics.renderDiagnostic ?? null;
  }
  /** Every error on this plot as a Diagnostic: its marks' and fields', its axes', a lost device
   * (TODO 136.6; runtime.diagnostics() gathers them with the scene's node). */
  export function listDiagnostics() {
    return [
      toDiagnostic(services.lifecycle.deviceLost, {
        component: "Plot",
        code: "gpu.device-lost",
      }),
      toDiagnostic(axisError, { component: "Axis" }),
      ...services.diagnostics.list(),
      // Lints read from what the plot draws (TODO 136.13): a color no legend explains, an x or
      // y domain far wider than the data.
      ...unexplainedColors(descriptions.marks()),
      ...emptyMarks(descriptions.marks()),
      ...rerunLints(services.diagnostics.counters),
      ...wideDomains(activeRootFrame()),
      ...marksOutsideAxes(activeRootFrame(), $mode),
      ...($mode === "2d"
        ? hiddenCategoryLabels(
            getAxisLayout(),
            activeRootFrame()?.options ?? plotOptions,
          )
        : []),
      ...coveringMarkers(descriptions.marks(), {
        width: canvasWidth,
        height: canvasHeight,
        mode: $mode,
      }),
    ].filter(Boolean);
  }
  // LinkViews' domain groups (TODO 136.14; a Plot may be in several): the Plot's own frame
  // joins them once it has mounted.
  let domainGroups = $state.raw<DomainGroup[]>([]);
  export function joinDomainGroup(group: DomainGroup) {
    domainGroups = [...domainGroups, group];
    return () => {
      domainGroups = domainGroups.filter((g) => g !== group);
    };
  }
  // The entry, not the frame list: the list changes whenever a frame publishes.
  const implicitRootEntry = $derived(frameModel.implicitRoot());
  $effect(() => {
    const groups = domainGroups,
      root = implicitRootEntry;
    if (!groups.length || !root?.joinDomainGroup) return;
    const leaves = untrack(() =>
      groups.map((group) => root.joinDomainGroup!(group)),
    );
    return () => leaves.forEach((leave) => leave());
  });
  /** What the lints read asynchronously (each Points mark's largest per-row size); hm.check awaits it. */
  export const prepareLints = () => prepareMarkerSizes(descriptions.marks());
  export function setViewport(
    next: Partial<Viewport2D>,
    axes: "x" | "y" | "xy" = "xy",
  ) {
    const current = services.navigation.controls.current?.getViewport?.() ??
      rememberedViewport ?? { x: 0.5, y: 0.5, zoom: 1, zoomX: 1, zoomY: 1 };
    loopGuard.input();
    const merged: Viewport2D = { ...current };
    for (const axis of axes === "xy" ? ["x", "y"] : [axes]) {
      const upper = axis.toUpperCase();
      for (const key of ["zoom" + upper, axis] as (
        "zoomX" | "zoomY" | "x" | "y"
      )[])
        if (next[key] !== undefined) merged[key] = next[key];
    }
    if (axes === "xy") Object.assign(merged, next);
    // A uniform zoom request must update both stored axis factors; otherwise
    // normalizeViewport reads the old zoomX/zoomY and discards `zoom`.
    if (next.zoom !== undefined)
      for (const axis of axes === "xy" ? ["X", "Y"] : [axes.toUpperCase()])
        if (next[("zoom" + axis) as "zoomX" | "zoomY"] === undefined)
          merged[("zoom" + axis) as "zoomX" | "zoomY"] = next.zoom;
    merged.zoom = Math.sqrt(
      (merged.zoomX ?? merged.zoom ?? 1) * (merged.zoomY ?? merged.zoom ?? 1),
    );
    const controls = services.navigation.controls.current;
    if (controls?.setViewport) {
      controls.setViewport(merged);
      rememberedViewport = controls.getViewport?.() ?? merged;
    } else rememberedViewport = merged;
    // A promise, like setCamera's (R2.0): a viewport change is applied at once.
    return Promise.resolve();
  }
  export function getViewport() {
    return (
      services.navigation.controls.current?.getViewport?.() ??
      rememberedViewport ?? { x: 0.5, y: 0.5, zoom: 1, zoomX: 1, zoomY: 1 }
    );
  }
  // 2D fit flows through the `viewport` prop passed to Scene2D below, so this does not
  // call the controls directly: a caller-supplied `viewport` or a facet's linked viewport
  // deliberately take precedence over the remembered one.
  // 3D fit: Scene3D refits when fitRevision changes (explicit camera props still apply).
  let fitCount = $state(0);
  export function fit() {
    loopGuard.input();
    rememberedViewport = { zoom: 1, zoomX: 1, zoomY: 1, x: 0.5, y: 0.5 };
    fitCount++;
  }
  /** The 3D camera: {position, target, up, fov, near, far, zoom, mode}. Undefined in 2D. */
  export function getCamera() {
    return services.navigation.camera.current?.get();
  }
  /** Merge a partial camera state; {animate: true} eases over animationDuration ms. */
  export function setCamera(
    patch: Partial<CameraState>,
    options: { animate?: boolean } = {},
  ) {
    const camera = services.navigation.camera.current;
    if (!camera)
      throw Error("setCamera needs a 3D plot whose camera is ready.");
    loopGuard.input();
    return camera.set(patch, options);
  }
  // GPU validation errors (a shader that fails to compile, a pipeline the device refuses) are
  // the plot's errors, not console warnings (TODO 136.6). The device is shared: every plot hears
  // each error, and runtime.diagnostics() keeps one of each message.
  const gpuErrors = {};
  $effect(() => {
    const active = renderer;
    if (!active) return;
    let device: GPUDevice | undefined,
      timer = 0,
      stopped = false;
    const onerror = (event: Event) => {
      const message =
        (event as GPUUncapturedErrorEvent).error?.message ?? String(event);
      services.diagnostics.report(gpuErrors, {
        message: `GPU: ${message.split("\n")[0]}`,
        diagnostic: { code: "gpu.validation", component: "Plot" },
      });
    };
    const attach = () => {
      if (stopped) return;
      device = (active.backend as any)?.device;
      if (device) device.addEventListener("uncapturederror", onerror);
      else timer = window.setTimeout(attach, 100);
    };
    attach();
    return () => {
      stopped = true;
      clearTimeout(timer);
      device?.removeEventListener("uncapturederror", onerror);
    };
  });
  export function getDiagnostics(
    config: { enabled?: boolean } | undefined = undefined,
  ) {
    if (config?.enabled && (renderer?.backend as any)?.device)
      enableDiagnostics(renderer!, services.diagnostics);
    return renderer ? rendererDiagnostics(renderer, services) : null;
  }
  $effect(() => {
    if (!canvasHost) return;
    return registerInspection(canvasHost, {
      whenSettled,
      prepareLints,
      getTitle,
      getDescription,
      getDescriptionModel,
      getDiagnostics,
      listDiagnostics,
    });
  });
  setOptionsContext(plotOptions);
  const localOptions = plotOptions.ensureChild("plot");
  localOptions.ensure(
    "background",
    new FieldType({
      defaultValue: "#ffffff",
      label: "Background",
      ui: { ui: "text" },
    }),
  );
  const backgroundStore = localOptions.store("background");
  const backgroundError = "Background must be a CSS color or transparent.";
  $effect(() => {
    if (background === undefined) return;
    if (
      typeof background !== "string" ||
      (background !== "transparent" && !CSS.supports("color", background))
    ) {
      untrack(() => issue("background", backgroundError));
      return;
    }
    untrack(() => issue("background"));
    localOptions.set("background", background);
  });
  // The Plot's presentation effects (TODO 37, 138.1; utils/presentationOptions.svelte.ts): its
  // Presentation, with their settings as its options, so the settings pane edits them.
  const presentation = createPresentationOptions({
    localOptions,
    background: backgroundStore,
    get effects() {
      return effects;
    },
    get mode() {
      return $mode;
    },
    get name() {
      return name;
    },
    issue,
    track: (work) =>
      trackPreparation(services, work, undefined, { load: true }),
  });
  // On-screen antialiasing: native MSAA, hybrid supersampling, SMAA or off. Exports use 4x MSAA.
  localOptions.ensure(
    "antialias",
    new SelectType({
      defaultValue: "msaa",
      options: {
        "4× MSAA": "msaa",
        "8× hybrid (MSAA + SSAA)": "ssaa8",
        "16× hybrid (MSAA + SSAA)": "ssaa16",
        SMAA: "smaa",
        Off: "off",
      },
    }),
  );
  ensureAxisOptions(localOptions);
  const antialias = localOptions.stores.antialias;
  localOptions.ensure(
    "aspect",
    new SelectType({
      defaultValue: "auto",
      options: { "Fill plot": "auto", "Preserve proportions": "equal" },
    }),
  );
  localOptions.ensure(
    "axes3d",
    new FieldType({ defaultValue: false, ui: { ui: "axes3d" } }),
  );
  localOptions.ensure(
    "axisThreeD",
    new FieldType({
      defaultValue: { style: "box", gridPlanes: [] },
      ui: false,
    }),
  );
  localOptions.ensure("axisFrame", new BooleanType({ defaultValue: false }));
  localOptions.ensure("axisMask", new BooleanType({ defaultValue: false }));
  localOptions.ensure(
    "cameraMode",
    new SelectType({
      defaultValue: "orbit",
      options: { Orbit: "orbit", Flyover: "flyover" },
    }),
  );
  const cameraModeStore = localOptions.stores.cameraMode;
  $effect(() => {
    if (cameraMode !== undefined) localOptions.set("cameraMode", cameraMode);
  });
  // 3D camera lens and flyover speed are settings (pane, saved settings); position, target,
  // and up are props and handle calls only.
  localOptions.ensure(
    "cameraFov",
    new ScalarType({ defaultValue: 50, min: 10, max: 120, step: 1 }),
  );
  localOptions.ensure(
    "cameraNear",
    new NullableFieldType({ defaultValue: null, ui: { ui: "text" } }),
  );
  localOptions.ensure(
    "cameraFar",
    new NullableFieldType({ defaultValue: null, ui: { ui: "text" } }),
  );
  localOptions.ensure(
    "flySpeed",
    new ScalarType({ defaultValue: 1, min: 0.1, max: 10, step: 0.1 }),
  );
  // A released flyover ground pan glides on (TODO 66.6); reduced motion turns it off.
  localOptions.ensure(
    "flyoverMomentum",
    new BooleanType({ defaultValue: true }),
  );
  const cameraFovStore = localOptions.stores.cameraFov,
    cameraNearStore = localOptions.stores.cameraNear,
    cameraFarStore = localOptions.stores.cameraFar,
    flySpeedStore = localOptions.stores.flySpeed,
    flyoverMomentumStore = localOptions.stores.flyoverMomentum;
  $effect(() => {
    if (cameraFov !== undefined) localOptions.set("cameraFov", cameraFov);
    if (cameraNear !== undefined) localOptions.set("cameraNear", cameraNear);
    if (cameraFar !== undefined) localOptions.set("cameraFar", cameraFar);
    if (flySpeed !== undefined) localOptions.set("flySpeed", flySpeed);
    if (flyoverMomentum !== undefined)
      localOptions.set("flyoverMomentum", flyoverMomentum);
  });
  const finiteOrUndefined = (value: unknown) =>
    Number.isFinite(Number(value)) && value !== null && value !== ""
      ? Number(value)
      : undefined;
  // The fov option always has a value (default 50); it counts as explicit only when the prop or
  // the pane set it, so a fov from setCamera survives a remount and a fit.
  const explicitFov = (value: number) =>
    cameraFov !== undefined || value !== 50 ? value : undefined;
  const animationDurationStore = plotOptions.store("animationDuration"),
    animationEasingStore = plotOptions.store("animationEasing"),
    animationStore = plotOptions.store("animation");
  // The view as a prop (TODO 136.14): with animation on, a new viewport or camera prop eases to
  // its value over the plot's animation duration (a viewer's drag cancels it).
  // Not under reduced motion, where marks land at once too.
  const viewDuration = $derived(
    $animationStore && !(renderer && animationClock(renderer).reduced)
      ? Number($animationDurationStore) || 0
      : 0,
  );
  let warnedCamera2d = false;
  $effect(() => {
    const given = Object.entries({
      cameraPosition,
      cameraTarget,
      cameraUp,
      cameraFov,
      cameraNear,
      cameraFar,
    })
      .filter(([, value]) => value !== undefined)
      .map(([name]) => name);
    if ($mode !== "2d" || !given.length || warnedCamera2d) return;
    warnedCamera2d = true;
    console.warn(
      `${given.join(", ")} apply only to 3D plots; this plot is 2D (type="2d").`,
    );
  });
  localOptions.ensure(
    "overviewAxes",
    new FieldType({ defaultValue: false, ui: { ui: "boolean" } }),
  );
  const axes3d = localOptions.stores.axes3d,
    overviewAxesStore = localOptions.stores.overviewAxes;
  localOptions.ensure("axes2d", new BooleanType({ defaultValue: false }));
  const automaticAxes = () =>
    cartesian2D(rootFrameOptions()) ||
    globe2D(rootFrameOptions()) ||
    ["X", "Y"].some(
      (axis) =>
        (hasAxisOverride(localOptions, `frame${axis}Show`) &&
          localOptions.get(`frame${axis}Show`) === true) ||
        (hasAxisOverride(localOptions, `axis${axis}Grid`) &&
          localOptions.get(`axis${axis}Grid`) !== "off"),
    );
  const updateAxesDefault = () =>
    localOptions.setKindDefault("axes2d", automaticAxes());
  updateAxesDefault();
  const stopAxesDefaults = [
    plotOptions.on(updateAxesDefault, "coordinates"),
    plotOptions.on(updateAxesDefault, "projection"),
    onCoordinateView(plotOptions, updateAxesDefault),
    ...["frameXShow", "frameYShow", "axisXGrid", "axisYGrid"].map((key) =>
      localOptions.on(updateAxesDefault, key),
    ),
  ];
  onDestroy(() => stopAxesDefaults.forEach((stop) => stop()));
  $effect(() => {
    frames;
    activeRootKey;
    untrack(updateAxesDefault);
  });
  localOptions.ensure("overview", new BooleanType({ defaultValue: false }));
  localOptions.ensure(
    "overviewScale",
    new ScalarType({ defaultValue: 0.35, min: 0, step: 0.05 }),
  );
  localOptions.ensure(
    "overviewMaxInstances",
    new NullableFieldType({ defaultValue: 1000, ui: { ui: "text" } }),
  );
  const overviewScaleStore = localOptions.stores.overviewScale,
    overviewLimitStore = localOptions.stores.overviewMaxInstances;
  const navigation = plotOptions.ensureChild("scene2d");
  navigation.ensure(
    "zoomAxis",
    new SelectType({
      defaultValue: "xy",
      options: { "Both axes": "xy", "X only": "x", "Y only": "y" },
    }),
  );
  navigation.ensure("axisMarginZoom", new BooleanType({ defaultValue: true }));
  localOptions.ensure(
    "dynamicMargins",
    new BooleanType({ defaultValue: true }),
  );
  $effect(() => {
    if (overviewAxes !== undefined)
      localOptions.set("overviewAxes", overviewAxes);
    if (overviewScale !== undefined)
      localOptions.set("overviewScale", overviewScale);
    if (overviewMaxInstances !== undefined)
      localOptions.set("overviewMaxInstances", overviewMaxInstances);
    if (zoomAxis !== undefined) navigation.set("zoomAxis", zoomAxis);
    if (dynamicMargins !== undefined)
      localOptions.set("dynamicMargins", dynamicMargins);
    if (axisMarginZoom !== undefined)
      navigation.set("axisMarginZoom", axisMarginZoom);
  });
  $effect(() => {
    viewContext.update({ mode: $mode });
  });
  $effect(() => {
    viewContext.update({ explicitViewport: viewport !== undefined });
  });
  // A flat map's explicit x or y domain (longitudes, latitudes) frames the view, as a fit does
  // (TODO 135.4): a map's marks project longitude and latitude, so the domain alone changed only
  // the axis labels, and a city given its domain was a speck in a world map. Globes and joint
  // projections keep their whole view; a given viewport wins.
  let fittedDomain = "";
  $effect(() => {
    coordinateRevision;
    axisRevision;
    canvasWidth;
    canvasHeight;
    const box = untrack(() =>
      coordinateFrame.domainBox(
        $mode,
        viewport,
        plotDomain("x"),
        plotDomain("y"),
      ),
    );
    if (!box) return;
    const key = box.join(",") + `|${canvasWidth}x${canvasHeight}`;
    if (key === fittedDomain) return;
    let frame = 0,
      attempts = 0;
    const attempt = () => {
      const rect = (services.navigation.camera.current as any)?.userData
        ?.plotRect ?? { width: canvasWidth, height: canvasHeight };
      if (
        untrack(() =>
          coordinateFrame.fit(services.navigation.controls.current, rect, box),
        )
      )
        fittedDomain = key;
      else if (++attempts < 240) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  });
  $effect(() => {
    // The implicit root draws its own axes only when something plots in its coordinates: marks
    // directly in the Plot, or a root-side Frame that inherits one of its dimensions (a twin axis
    // over the root's x). Child Frames that own both dimensions leave it empty (sibling Frames,
    // or a Pie's own placed polar Frame: TODO 134.8, a pie drew Cartesian axes behind it); its
    // axes would show an unused [-1, 1]. axes2d still keeps the axis margins theirs need.
    // A ranged child Frame maps into the root's coordinates (its range is in them), so it uses
    // the root; only placed ones (a Pie's) leave it unused.
    frames;
    const top = frameModel
      .entries()
      .filter(
        (entry: any) => entry.parentKey == null && entry.kind === "frame",
      );
    const placedOnly =
      top.length > 0 &&
      top.every((entry: any) => entry.placed && !entry.ranged);
    const rootUsed = frameModel.implicitRootUsed() || !placedOnly;
    const sidedTwins = frames.some(
      (f) =>
        !f.spatial &&
        f.parentKey != null &&
        f.placement &&
        (f.placement.x!.side !== "bottom" ||
          f.placement.y!.side !== "left" ||
          !f.placement.x!.show ||
          !f.placement.y!.show),
    );
    // Twin Frames that each own their y over the root's shared x leave the root's y unused: it
    // would show its default [-1, 1] beside theirs (TODO 134.13). An axis the Plot shows or
    // gives a domain stays.
    const configured = { x, y } as Record<string, any>;
    const unusedAxes =
      others.axes2d === undefined && sidedTwins
        ? (["x", "y"] as const).filter(
            (axis) =>
              !frameModel.implicitRootUses(axis) &&
              configured[axis]?.visible !== true &&
              configured[axis]?.domain === undefined,
          )
        : [];
    untrack(() => {
      frameModel.setImplicitRootUnused(
        others.axes2d === undefined &&
          (sidedTwins ? !frameModel.implicitRootUsed() : !rootUsed),
      );
      frameModel.setImplicitRootUnusedAxes(unusedAxes);
    });
  });
  // New bounds or transforms put other data under the same view: readers of the visible domain
  // (a rule spanning it) read it again (TODO 64.10: a RuleY kept the default bounds' view when the
  // marks' domain arrived after it prepared, and a standalone export could draw it so).
  const viewDataStops = [
    "xbounds",
    "ybounds",
    "zbounds",
    "xTransform",
    "yTransform",
    "zTransform",
    "xTransformConstant",
    "yTransformConstant",
    "coordinates",
    "projection",
  ].map((key) => plotOptions.on(() => pointerTracker.refresh(), key));
  onDestroy(() => viewDataStops.forEach((stop) => stop()));
  let coordinateRevision = $state(0);
  const coordinateStops = [
    "coordinates",
    "angleUnit",
    "anglePeriod",
    "projection",
    "xbounds",
  ].map((k) => plotOptions.on(() => coordinateRevision++, k));
  onDestroy(() => coordinateStops.forEach((stop) => stop()));
  $effect(() => {
    coordinateRevision;
    untrack(() =>
      coordinateFrame.syncRanges(
        plotDomain,
        (axis) => ({ x, y })[axis as "x" | "y"]?.range,
      ),
    );
  });
  const overview = localOptions.stores.overview;
  $effect(() => {
    if (overviewOption !== undefined)
      localOptions.set("overview", overviewOption);
  });
  localOptions.ensure(
    "orientation3d",
    new BooleanType({ defaultValue: false }),
  );
  // Rule and band labels' size: a theme's Text size, as Callout's (TODO 134.29); without one,
  // the axes' font size.
  localOptions.ensure(
    "annotationFontSize",
    new FieldType({ defaultValue: null, ui: false }),
  );
  for (const [key, defaultValue, min, max, step] of [
    ["axisFontSize", 11, 8, 32, 1],
    ["axisLineWidth", 1, 0, 6, 0.5],
    ["axisTickSize", 5, 0, 20, 1],
  ])
    localOptions.ensure(key, new ScalarType({ defaultValue, min, max, step }));
  // Margins are measured ("auto") unless a number pins a side (TODO 136.10); the solved gutters
  // are published for every reader of the plot's rectangle (plotGutters).
  for (const key of [
    "axisMarginLeft",
    "axisMarginRight",
    "axisMarginTop",
    "axisMarginBottom",
  ])
    localOptions.ensure(
      key,
      new ScalarType({
        defaultValue: "auto",
        min: 0,
        max: 300,
        step: 1,
        ui: { auto: true },
      }),
    );
  localOptions.ensure(
    "_axisGutters",
    new FieldType({ defaultValue: null, ui: false }),
  );
  // Empty labels mean automatic: an axis is titled by the column its marks plot (TODO 21).
  for (const [key, defaultValue] of [
    ["axisLabelX", ""],
    ["axisLabelY", ""],
    ["axisLabelZ", ""],
    ["axisFontFamily", DEFAULT_FONT],
  ])
    localOptions.ensure(
      key,
      new FieldType({ defaultValue, ui: { ui: "text" } }),
    );
  localOptions.ensure(
    "axisTextColor",
    new ColorType({ defaultValue: "#394458" }),
  );
  // The settings and export controls take the plot's background and text color (TODO 60).
  const axisTextStore = localOptions.store("axisTextColor");
  const controlsStyle = $derived(
    controlsTheme($backgroundStore, $axisTextStore),
  );
  // Axis lines and ticks; themes set it from axes.color, and the text from their text color.
  localOptions.ensure(
    "axisLineColor",
    new ColorType({ defaultValue: "#394458" }),
  );
  localOptions.ensure(
    "axisTickLabels",
    new BooleanType({ defaultValue: true }),
  );
  localOptions.ensure("axisTitles", new BooleanType({ defaultValue: true }));
  localOptions.ensure("legendEnabled", new BooleanType({ defaultValue: true }));
  localOptions.ensure(
    "legendPosition",
    new SelectType({
      defaultValue: "bottom",
      options: ["top", "bottom", "left", "right"],
    }),
  );
  const legendEnabled = localOptions.store("legendEnabled"),
    legendPosition = localOptions.store("legendPosition");
  $effect(() => {
    const enabled = legend !== false,
      position =
        legend && typeof legend === "object" ? legend.position : undefined;
    // Listeners may update reactive state; those writes are not dependencies of this prop.
    untrack(() => {
      localOptions.set("legendEnabled", enabled);
      if (position) localOptions.set("legendPosition", position);
      else localOptions.clear("legendPosition", { layer: "authored" });
    });
  });
  // An omitted legend explains only categorical colors; legend=true explains every channel.
  const defaultLegend = $derived(
    $legendEnabled
      ? { position: $legendPosition, categorical: legend == null }
      : false,
  );
  const legendRequest = {};
  $effect(() =>
    inheritedGuides?.requestAutomatic(legendRequest, defaultLegend),
  );
  const axes2d = localOptions.stores.axes2d,
    orientation3d = localOptions.stores.orientation3d;
  let viewFrame = $state.raw<ViewFrame | null>(null);
  const axisRevision = readable(0, (set) => {
    let version = 0;
    const stops = [
      localOptions.on(() => set(++version)),
      ...[
        "_categoryRevision",
        "_labelInsets",
        "_labelMetrics",
        "coordinates",
        "angleUnit",
        "anglePeriod",
        "projection",
        "sphericalView",
        "xTransform",
        "yTransform",
        "xbounds",
        "ybounds",
        "xrange",
        "yrange",
      ].map((key) => plotOptions.on(() => set(++version), key)),
    ];
    return () => stops.forEach((stop) => stop());
  });
  let axisError = $state("");
  const axisActive = $derived.by(() => {
    $axisRevision;
    return (
      frames.length > 0 ||
      $axes2d ||
      localOptions.get("axisXGrid") !== "off" ||
      localOptions.get("axisYGrid") !== "off" ||
      localOptions.get("referenceRules").length > 0
    );
  });
  // The area's sides from the margins alone (pinned, or their fallbacks), a Cartesian plot's
  // before it can solve.
  function marginArea(width: number, height: number) {
    const { left, right, top, bottom } = plotRectangle(
      width,
      height,
      plotGutters(
        {
          get: (key: string) =>
            key === "_axisGutters" ? null : localOptions.get(key),
        },
        FALLBACK_MARGINS,
      ),
    );
    return { left, right, top, bottom };
  }
  // The root frame's options: its axes' settings (a Theme's, the Frame's own) are read there,
  // as the overlay draws them; a change to the ones the solver measures with re-solves.
  const rootAxisOptions = $derived(
    frames.find((f) => f.parentKey == null)?.options ?? plotOptions,
  );
  const rootStyles = $derived(rootAxisOptions.child("plot"));
  const measuredStyles = [
    "axisFontSize",
    "axisFontFamily",
    "axisTickSize",
    "axisTickLabels",
    "axisTitles",
  ];
  let rootStyleRevision = $state(0);
  $effect(() => {
    const styles = rootStyles;
    const stops = measuredStyles.map((key) =>
      styles.on(() => rootStyleRevision++, key),
    );
    return () => stops.forEach((stop) => stop());
  });
  // The twin Frames' options and styles (TODO 136.10): a change to one (its bounds, transform,
  // tick format, categories, font) re-solves, as the root's does through axisRevision and
  // rootStyleRevision. A change the solve causes ends there: its gutters come out the same.
  const twinFrames = $derived(
    frames.filter((f) => !f.spatial && f.slot !== rootSlot),
  );
  let twinRevision = $state(0);
  const twinKeys = [
    "_categoryRevision",
    "_labelInsets",
    "_labelMetrics",
    "xbounds",
    "ybounds",
    "xTransform",
    "yTransform",
  ];
  $effect(() => {
    const stops = twinFrames.flatMap((f) => [
      ...twinKeys.map((key) => f.options.on(() => twinRevision++, key)),
      ...measuredStyles.map((key) =>
        f.options.child("plot").on(() => twinRevision++, key),
      ),
    ]);
    return () => stops.forEach((stop) => stop());
  });
  // As a string, so a republished frame list with the same fonts does not load them again.
  const twinFonts = $derived.by(() => {
    twinRevision;
    return [
      ...new Set(
        twinFrames.map((f) => {
          const styles = f.options.child("plot");
          return `${styles.get("axisFontSize")}px ${withGenericFamily(styles.get("axisFontFamily"))}`;
        }),
      ),
    ].join("\n");
  });
  const axisFont = $derived.by(() => {
    rootStyleRevision;
    return `${rootStyles.get("axisFontSize")}px ${withGenericFamily(rootStyles.get("axisFontFamily"))}`;
  });
  // The fonts the axes measure in (TODO 136.10): each that arrives solves again.
  $effect(() =>
    layoutLifecycle.loadFonts([
      axisFont,
      ...(twinFonts ? twinFonts.split("\n") : []),
    ]),
  );
  /**
   * A Cartesian plot's area from the layout solver (TODO 136.10): each "auto" side fits the root
   * axes' ticks, labels and outside titles, chosen for the area itself. The data the area shows
   * stays what the camera shows in its own rectangle (it fits the domain to the area, whatever
   * the gutters), so a candidate span changes only how many pixels the ticks have.
   */
  // What the root frame's axes show, as a string: a frame publishing its layout (which reads this
  // one) notifies the frames again, and an unchanged string ends that there.
  // A Facet cell's axes another cell labels (its outer axes, TODO 136.10 slice 5): the root
  // frame draws their ticks, without labels or a title.
  const facetInner = $derived.by(() => {
    const sides = facet?.inner(),
      root = frames.find((f) => f.parentKey == null)?.placement;
    // Bent and polar guides draw their own labels: only a Cartesian 2D cell leaves them out.
    if (
      !sides ||
      $mode !== "2d" ||
      (plotOptions.get("coordinates") ?? "cartesian") !== "cartesian"
    )
      return { x: false, y: false };
    return {
      x: (root?.x?.side ?? "bottom") === "top" ? sides.x.before : sides.x.after,
      y: (root?.y?.side ?? "left") === "right" ? sides.y.after : sides.y.before,
    };
  });
  const rootSlot = $derived(frames.find((f) => f.parentKey == null)?.slot);
  function outerPlacement(placement: any) {
    if (!placement || !(facetInner.x || facetInner.y)) return placement;
    const out = { ...placement };
    for (const a of ["x", "y"] as const)
      if (facetInner[a] && out[a]) out[a] = { ...out[a], labels: false };
    return out;
  }
  function outerTitles(titles: any) {
    if (!titles || !(facetInner.x || facetInner.y)) return titles;
    return {
      ...titles,
      ...(facetInner.x ? { x: "" } : {}),
      ...(facetInner.y ? { y: "" } : {}),
    };
  }
  const rootAxes = $derived.by(() => {
    const root = frames.find((f) => f.parentKey == null),
      placement = outerPlacement(root?.placement),
      titles = outerTitles(root?.titles);
    return JSON.stringify({
      show2d: !!root?.show2d,
      placement: {
        x: placement?.x ?? null,
        y: placement?.y ?? null,
      },
      titles: { x: titles?.x ?? "", y: titles?.y ?? "" },
    });
  });
  // The axes on the root area's sides, in stacking order (TODO 136.10): the root frame's, then
  // each twin Frame's (a root-side Frame drawing over the root's area), as rootAxes is: a string,
  // so a frame republishing an unchanged layout ends there. Each axis lies outside the ones
  // before it on its side, at the offset the solver gives it.
  // Twin Frames stack only when one moves or hides an axis (a y on the right, an x on top): a
  // child Frame on the root's own sides draws over its axes, as it did before the solver.
  const stacking = $derived(
    frames.some(
      (f) =>
        !f.spatial &&
        f.parentKey != null &&
        f.placement &&
        (f.placement.x!.side !== "bottom" ||
          f.placement.y!.side !== "left" ||
          !f.placement.x!.show ||
          !f.placement.y!.show),
    ),
  );
  const sided = (f: any) =>
    !f.spatial && f.show2d && (stacking || f.slot === rootSlot);
  const sidedAxes = $derived.by(() =>
    JSON.stringify(
      frames.filter(sided).map((f) => {
        const root = f.slot === rootSlot,
          placement = root ? outerPlacement(f.placement) : f.placement,
          titles = root ? outerTitles(f.titles) : f.titles,
          axis = (a: "x" | "y") =>
            placement?.[a]
              ? {
                  show: placement[a].show,
                  side: placement[a].side,
                  labels: placement[a].labels,
                }
              : null;
        return {
          slot: f.slot,
          placement: { x: axis("x"), y: axis("y") },
          titles: { x: titles?.x ?? "", y: titles?.y ?? "" },
        };
      }),
    ),
  );
  // A frame's placement with the offsets the solver stacked its axes at: during a gesture the ones
  // published with the frozen gutters, and without a solve (a polar plot's, a failed one) 48 px
  // (36 for x) past the axis before.
  const fallbackOffsets = $derived.by(() => {
    const counts: Record<string, number> = {},
      out: Record<string, number> = {};
    for (const f of frames)
      if (sided(f))
        for (const a of ["x", "y"] as const) {
          const axis = f.placement?.[a];
          if (!axis?.show) continue;
          const side = axis.side ?? (a === "x" ? "bottom" : "left");
          out[`${f.slot}:${a}`] = (counts[side] ?? 0) * (a === "x" ? 36 : 48);
          counts[side] = (counts[side] ?? 0) + 1;
        }
    return out;
  });
  function stackedPlacement(f: any) {
    const placement =
        f.slot === rootSlot ? outerPlacement(f.placement) : f.placement,
      offsets = layout?.offsets ?? fallbackOffsets;
    if (!placement) return placement;
    const out = { ...placement };
    for (const a of ["x", "y"] as const) {
      const offset = offsets[`${f.slot}:${a}`];
      if (out[a] && offset !== undefined) out[a] = { ...out[a], offset };
    }
    return out;
  }
  function solvedArea(width: number, height: number) {
    const fonts = layoutLifecycle.revision;
    rootStyleRevision;
    twinRevision;
    const frame = viewFrame!,
      rootOptions = rootAxisOptions,
      root = JSON.parse(rootAxes),
      shown = !!$axes2d && root.show2d,
      fallback = marginArea(width, height),
      // Where the camera put the area when it drew this frame.
      drawn = frame.rect ?? fallback,
      margins: Record<string, number | "auto"> = {},
      axes: AxisSpec[] = [],
      // Each axis's key (`${slot}:${axis}`), in the order of `axes`.
      keys: string[] = [],
      configs: unknown[] = [];
    for (const side of ["Left", "Right", "Top", "Bottom"]) {
      const value = localOptions.get("axisMargin" + side);
      margins[side.toLowerCase()] = pinned(value) ? value : "auto";
    }
    // The root frame's axes and every twin Frame's, each in its own options and styles.
    for (const sided of JSON.parse(sidedAxes)) {
      // Read untracked: the frames republish their layouts whenever this one changes, and
      // sidedAxes is what of them the solve reads.
      const f = untrack(() => frames).find((g) => g.slot === sided.slot);
      // The Plot's axes2d gates the root's axes; a twin Frame shows its own whatever it is.
      if (!f || (f.slot === rootSlot && !$axes2d)) continue;
      const axisOptions = f.options,
        styles = f.slot === rootSlot ? rootStyles : f.options.child("plot"),
        fontSize = styles.get("axisFontSize"),
        family = withGenericFamily(styles.get("axisFontFamily")),
        tickSize = styles.get("axisTickSize");
      for (const a of ["x", "y"] as const) {
        const placement = sided.placement[a];
        if (!placement?.show) continue;
        const config: Record<string, any> = resolveAxisStyle(
            axisConfig(axisOptions, a),
            { axisTickSize: tickSize },
          ),
          upright = a === "y",
          pixels = upright ? height : width,
          // The world range the camera's area shows, kept for every candidate span.
          [s0, s1] = upright
            ? [1 - drawn.bottom / height, 1 - drawn.top / height]
            : [drawn.left / width, drawn.right / width],
          [v0, v1] = frame[a],
          w0 = v0 + s0 * (v1 - v0),
          w1 = v0 + s1 * (v1 - v0),
          outside = (config.tickLabelPlacement ?? "outside") === "outside";
        const title = sided.titles[a];
        keys.push(`${sided.slot}:${a}`);
        // Its settings (format, label angle and placement, ticks, title), none moved by the camera.
        configs.push(readAxis(axisOptions, a));
        axes.push({
          side: (placement.side ??
            (upright ? "left" : "bottom")) as AxisSpec["side"],
          // Outside labels sit past the ticks that point outside (the overlay's labelTickSize).
          tickSize:
            config.ticks && config.tickDirection !== "inside"
              ? config.tickSize
              : 0,
          labelOffset: config.tickLabelOffset ?? 3,
          labelAngle: config.tickLabelAngle ?? 0,
          labelAlign: config.tickLabelAlign ?? "auto",
          fontSize,
          font: `${fontSize}px ${family}`,
          ticks:
            styles.get("axisTickLabels") &&
            placement.labels !== false &&
            outside &&
            config.major
              ? memoizeSpan((span) => {
                  // Fractions of the canvas in the ticks' orientation (y from the bottom).
                  const [f0, f1] = upright
                      ? [1 - span[1] / pixels, 1 - span[0] / pixels]
                      : [span[0] / pixels, span[1] / pixels],
                    scale = (w1 - w0) / (f1 - f0 || 1),
                    visible = [w0 - f0 * scale, w0 + (1 - f0) * scale],
                    ticks = axisLayout(axisOptions, a, visible, pixels, [
                      f0,
                      f1,
                    ]),
                    at = (fraction: number) =>
                      (upright ? 1 - fraction : fraction) * pixels;
                  return [
                    ...ticks.major
                      .filter(
                        (t: any) =>
                          t.showLabel &&
                          at(t.fraction) >= span[0] - 0.5 &&
                          at(t.fraction) <= span[1] + 0.5,
                      )
                      .map((t: any) => ({
                        text: String(t.label),
                        at: at(t.fraction),
                      })),
                    ...(ticks.context ?? []).map((t: any) => ({
                      text: String(t.label),
                      at: at(t.fraction),
                      row: 1,
                    })),
                    // Compact labels' offset (axisLayout): a second row's, ending at an x
                    // axis's right end; a label's past a y axis's end, above its top unless the
                    // x axis's labels are there.
                    ...(ticks.offset
                      ? [
                          upright
                            ? {
                                text: ticks.offset,
                                at:
                                  sided.placement.x?.side === "top"
                                    ? span[1] + OFFSET_RISE * fontSize
                                    : span[0] - OFFSET_RISE * fontSize,
                              }
                            : { text: ticks.offset, at: span[1], row: 1 },
                        ]
                      : []),
                  ];
                })
              : undefined,
          title:
            styles.get("axisTitles") &&
            title &&
            config.titlePlacement === "outside"
              ? {
                  text: title,
                  offset: config.titleOffset,
                  angle:
                    config.titleAngle === "auto" || config.titleAngle == null
                      ? undefined
                      : Number(config.titleAngle),
                  font: `${config.titleFontWeight} ${fontSize}px ${family}`,
                }
              : undefined,
        });
      }
    }
    // Keyed before the margin below, which follows the camera's frame.
    const inputs = measuredInputs(fonts, margins, configs);
    // A pinned margin on the x axis's side still makes room for a datetime axis's second row
    // (TODO 53.4).
    const xSide = root.placement.x?.show
      ? (root.placement.x.side ?? "bottom")
      : null;
    if (shown && xSide && typeof margins[xSide] === "number") {
      const x = axisLayout(rootOptions, "x", frame.x, width, [
        drawn.left / width,
        drawn.right / width,
      ]);
      margins[xSide] = labelMargin(x, margins[xSide] as number, {
        fontSize: rootStyles.get("axisFontSize"),
        tickSize: rootStyles.get("axisTickSize"),
      });
    }
    // The props effect rejects a bad Plot margin; any other (a Theme's) is read as "auto" above.
    try {
      const solved = solveLayout({
          width,
          height,
          margins,
          axes,
          measure: layoutLifecycle.measure,
        }),
        { gutters, overflow } = solved,
        solvedOffsets = Object.fromEntries(
          keys.map((key, i) => [key, solved.axes[i].offset]),
        );
      // A digit's room past the labels of an axis on a side (TODO 136.10): a zoom that lengthens
      // its labels by a character fits without the area moving, as navigation never shrinks a
      // side (utils/plotLayoutLifecycle).
      // Once a side, the widest digit of its axes; labels turned upright grow along the side.
      for (const side of ["left", "right"] as const) {
        if (typeof margins[side] === "number") continue;
        const digits = axes
          .filter(
            (axis) =>
              axis.side === side &&
              axis.ticks &&
              Math.abs(Math.abs(axis.labelAngle ?? 0) - 90) > 30,
          )
          // The solver's font for an axis without one (plotLayout.js).
          .map((axis) =>
            layoutLifecycle.measure(
              "0",
              axis.font ?? `${axis.fontSize ?? 11}px ${DEFAULT_FONT}`,
            ),
          );
        if (!digits.length) continue;
        gutters[side] = Math.min(
          gutters[side] + Math.max(...digits),
          Math.max(gutters[side], width * MAX_SHARE),
        );
      }
      const { own, placed, frozen, offsets } = layoutLifecycle.place(gutters, {
          margins,
          inputs,
          offsets: solvedOffsets,
          drawn: frame.rect ?? null,
        }),
        area = {
          left: placed.left,
          right: width - placed.right,
          top: placed.top,
          bottom: height - placed.bottom,
        };
      // During a gesture the area keeps its published gutters, letterbox and all: letterboxing
      // the frozen sides again would move it.
      return {
        ...(frozen && localOptions.get("aspect") === "equal"
          ? {
              left: frozen.left,
              right: width - frozen.right,
              top: frozen.top,
              bottom: height - frozen.bottom,
            }
          : equalArea(area, width, height)),
        own,
        overflow,
        offsets,
        inputs,
      };
    } catch {
      return equalArea(fallback, width, height);
    }
  }
  /**
   * aspect="equal" letterboxes an area whose spare length would fall on an explicit domain
   * (TODO 136.14): the camera then fits that domain exactly instead of widening it. The spans
   * are the root frame's bounds in transformed units, as the camera's equal fit reads them.
   */
  function equalArea(
    area: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    },
    width: number,
    height: number,
  ) {
    if (localOptions.get("aspect") !== "equal") return area;
    equalRevision;
    // Read without tracking: the frame list changes as frames publish; the keys read re-solve
    // through equalRevision.
    const { root, frame } = untrack(() => ({
        root: rootFrameOptions(),
        frame: activeRootFrame(),
      })),
      span = (a: string) => {
        const bounds = root.get(a + "bounds"),
          kind = root.get(a + "Transform") ?? "linear",
          c = root.get(a + "TransformConstant") ?? 1;
        return Array.isArray(bounds)
          ? Math.abs(
              transformClamped(kind, bounds[1], c) -
                transformClamped(kind, bounds[0], c),
            )
          : NaN;
      };
    return untrack(() =>
      letterbox(
        area,
        { x: span("x"), y: span("y") },
        {
          // A promoted Frame may draw the Plot's own domain.
          x: (frame?.explicitDomain("x") ?? plotDomain("x")) !== undefined,
          y: (frame?.explicitDomain("y") ?? plotDomain("y")) !== undefined,
        },
        { width, height, share: MAX_SHARE },
      ),
    );
  }
  // The root frame's bounds and transforms, for the letterbox: a promoted Frame's are not the
  // Plot's, which axisRevision watches.
  let equalRevision = $state(0);
  $effect(() => {
    const root = rootFrameOptions();
    const stops = [
      "xbounds",
      "ybounds",
      "xTransform",
      "yTransform",
      "xTransformConstant",
      "yTransformConstant",
    ].map((key) => root.on(() => equalRevision++, key));
    return () => stops.forEach((stop) => stop());
  });
  /**
   * A polar, globe or map plot's area (TODO 136.10 slice 7): the camera fits the disk (or the
   * map's world box) inside it, so each "auto" side keeps a small padding and grows to fit the
   * labels drawn around its disk, where the overlay draws them for the fitted disk: a polar
   * plot's angle labels, the radius labels at its edge and its rules' and bands' labels, and a
   * globe's guide labels (a meridian's on its face, a parallel's left of its limb). Its
   * sides follow no alignment group: a disk does not fill its area, so its lines meet nothing.
   */
  function roundArea(width: number, height: number) {
    const fonts = layoutLifecycle.revision;
    rootStyleRevision;
    const axisOptions = rootAxisOptions,
      styles = rootStyles,
      root = JSON.parse(rootAxes),
      fontSize = styles.get("axisFontSize"),
      font = `${fontSize}px ${withGenericFamily(styles.get("axisFontFamily"))}`,
      margins: Record<string, number | "auto"> = {};
    for (const side of ["Left", "Right", "Top", "Bottom"]) {
      const value = localOptions.get("axisMargin" + side);
      margins[side.toLowerCase()] = pinned(value) ? value : "auto";
    }
    const labels = roundFrameLabels(axisOptions, {
      width,
      height,
      fontSize,
      font,
      tickLabelsEnabled: styles.get("axisTickLabels"),
      shown: {
        x: root.placement.x?.show !== false,
        y: root.placement.y?.show !== false,
      },
      visible: !!$axes2d && root.show2d,
      measure: layoutLifecycle.measure,
    });
    const { gutters, overflow } = solveRoundLayout({
        width,
        height,
        margins,
        labels,
        measure: layoutLifecycle.measure,
      }),
      inputs = measuredInputs(fonts, margins),
      { own, placed } = layoutLifecycle.place(gutters, {
        margins,
        inputs,
        aligns: false,
      });
    return {
      left: placed.left,
      right: width - placed.right,
      top: placed.top,
      bottom: height - placed.bottom,
      own,
      overflow,
      aligns: false,
      inputs,
    };
  }
  // The layout's one owner (utils/plotLayoutLifecycle): the fonts the axes measure in, the motion
  // rules (gesture, transition, the refit loop's damping), the alignment group, publishing the
  // gutters every reader of the plot's rectangle reads (plotGutters), and settling.
  const alignMember: any = getContext<any>(ALIGN_MEMBER)?.join() ?? null;
  onDestroy(() => alignMember?.leave());
  const layoutLifecycle = new LayoutLifecycle({
    gesture: () => gestureActive,
    dynamic: () => localOptions.get("dynamicMargins"),
    clock: () => (renderer ? animationClock(renderer) : null),
    size: () => ({ width: canvasWidth, height: canvasHeight }),
    read: () => localOptions.get("_axisGutters"),
    write: (gutters) => localOptions.derive("_axisGutters", gutters),
    pinned: (side) =>
      pinned(
        localOptions.get("axisMargin" + side[0].toUpperCase() + side.slice(1)),
      ),
    elements: () =>
      plotHost && canvasHost ? { figure: plotHost, canvas: canvasHost } : null,
    align: alignMember,
    maxShare: MAX_SHARE,
  });
  onDestroy(() => layoutLifecycle.destroy());
  // What a solve measured, other than the frame the camera drew (the motion rules damp only the
  // loop through the camera): the fonts, the axes' styles, settings and sides, the margins, and
  // each frame's domains, transforms, categories and label insets. A root's domain is the data's
  // (a label's room is in the area's insets); a Frame that keeps that room in its domain changes it with a
  // refit, mostly by less than the step it is keyed in (a hundredth of its span's power of ten).
  const coarse = (bounds: unknown) => {
    if (
      !Array.isArray(bounds) ||
      bounds.length !== 2 ||
      !bounds.every((v) => typeof v === "number" && Number.isFinite(v))
    )
      return bounds;
    const span = Math.abs(bounds[1] - bounds[0]),
      step = span > 0 ? 10 ** (Math.floor(Math.log10(span)) - 2) : 1;
    return bounds.map((v) => Math.round(v / step) * step);
  };
  const frameInputs = (options: any) =>
    ["x", "y"]
      .map((a) => [
        coarse(options.get(a + "bounds")),
        options.get(a + "Transform"),
        options.get(a + "TransformConstant"),
      ])
      // Insets change as the camera refits. Key the solve by the text's fixed footprint so
      // those follow-up fits can damp rather than repeatedly resetting the layout.
      .concat([options.get("_categoryRevision"), options.get("_labelMetrics")]);
  function measuredInputs(
    fonts: string,
    margins: Record<string, unknown>,
    configs: unknown[] = [],
  ) {
    return JSON.stringify([
      configs,
      fonts,
      measuredStyles.map((key) => rootStyles.get(key)),
      twinFonts,
      sidedAxes,
      margins,
      frameInputs(rootAxisOptions),
      untrack(() => twinFrames).map((f) => frameInputs(f.options)),
    ]);
  }
  const layout = $derived.by(() => {
    $axisRevision;
    if (!viewFrame || $mode !== "2d" || !axisActive) return null;
    const width = canvasWidth,
      height = canvasHeight;
    const polar =
        plotOptions.get("coordinates") === "spherical" &&
        plotOptions.get("projection") === "orthographic",
      p = polar ? polarAxisLayout(plotOptions, Math.min(width, height)) : null;
    // Ticks for a Cartesian plot's own area, not the margins around it (TODO 134.12).
    const cartesian =
      (plotOptions.get("coordinates") ?? "cartesian") === "cartesian";
    const area: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      own?: Gutters;
      overflow?: string[];
      aligns?: boolean;
      offsets?: Record<string, number> | null;
      inputs?: string;
    } = cartesian ? solvedArea(width, height) : roundArea(width, height);
    const { left, right, top, bottom } = area;
    const x =
      p?.angular ??
      axisLayout(
        plotOptions,
        "x",
        viewFrame.x,
        width,
        cartesian ? [left / width, right / width] : null,
      );
    return {
      polar,
      x,
      y: axisLayout(
        plotOptions,
        "y",
        viewFrame.y,
        height,
        cartesian ? [1 - bottom / height, 1 - top / height] : null,
      ),
      z:
        p?.radial ??
        axisLayout(
          plotOptions,
          "z",
          plotOptions.get("zrange"),
          Math.min(width, height),
        ),
      left,
      right,
      top,
      bottom,
      own: area.own ?? null,
      overflow: area.overflow ?? [],
      aligns: area.aligns ?? true,
      offsets: area.offsets ?? null,
      inputs: area.inputs ?? "",
    };
  });
  // The overflow policy (TODO 136.10 slice 6): what does not fit says so. A fixed width wider
  // than the container keeps its width (its exports are that wide) and is cut off; axes that
  // need more than MAX_SHARE of a side clip there. Each is a warning in the scene's diagnostics.
  // A hidden container (0 px wide) is not measured.
  const reportWidth = useReporter("Plot", { severity: "warning" }),
    reportClipped = useReporter("Plot", { severity: "warning" });
  let containerWidth = $state(0);
  $effect(() => {
    const parent = plotHost?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      containerWidth = parent.clientWidth;
    });
    observer.observe(parent);
    return () => observer.disconnect();
  });
  $effect(() => {
    const container = Math.round(containerWidth),
      wide =
        width !== undefined &&
        !fills &&
        !facet &&
        container > 0 &&
        container + 1 < width;
    untrack(() =>
      reportWidth(
        wide
          ? diagnostic(
              "layout.width",
              `Plot: width ${width}px is wider than its container (${container}px) and is cut off. Give it a smaller width, or responsive=true to fill the container.`,
              { component: "Plot", property: "width" },
            )
          : "",
      ),
    );
  });
  const clippedSides = $derived((layout?.overflow ?? []).join(" and "));
  $effect(() => {
    const sides = clippedSides;
    untrack(() =>
      reportClipped(
        sides
          ? diagnostic(
              "layout.overflow",
              `Plot: the axis labels on the ${sides} need more than ${Math.round(MAX_SHARE * 100)}% of the plot, and are clipped there. Make the plot larger, or shorten or rotate the labels.`,
              { component: "Plot" },
            )
          : "",
      ),
    );
  });
  // The area's gutters, for the camera's fit and every other reader of it, at most once a frame:
  // the refit they cause reaches the layout again (the camera's next frame), and a frame apart
  // that converges instead of looping.
  $effect(() => {
    const l = layout;
    untrack(() =>
      layoutLifecycle.request(
        l && {
          gutters: {
            left: l.left,
            right: canvasWidth - l.right,
            top: l.top,
            bottom: canvasHeight - l.bottom,
          },
          own: l.own,
          offsets: l.offsets,
          aligns: l.aligns,
          inputs: l.inputs,
        },
      ),
    );
    // The layout around it resized: measure the boxes again.
    alignMember?.revision;
  });
  const appliedGuideProps = new Set<string>();
  $effect(() => {
    // Read every prop before entering untrack; otherwise bounds and projection
    // changes alone never rerun this effect.
    const current = Object.fromEntries(
      Object.entries(others).filter(([, value]) => value !== undefined),
    );
    try {
      if (
        current.coordinates === "polar" &&
        viewMode(viewOptions.get("type")) !== "3d" &&
        (current.polarAxis ?? plotOptions.get("polarAxis")) !== "Z"
      )
        throw Error("2D polar Plots require polarAxis Z.");
      if (current.projectionCenter !== undefined) {
        const center = normalizeProjectionCenter(current.projectionCenter, {
          angleUnit: current.angleUnit ?? plotOptions.get("angleUnit"),
          anglePeriod: current.anglePeriod ?? plotOptions.get("anglePeriod"),
          // The authored center against the authored domain, as a Frame's own center reads it.
          xbounds:
            (x?.domain === "auto" || readsData(x?.domain)
              ? undefined
              : x?.domain) ?? plotOptions.get("xbounds"),
        });
        current.projectionCenter = [center[0], center[1]];
      }
      for (const axis of ["x", "y"]) {
        const a = Object.fromEntries(
          Object.entries(axisDefaults).map(([k, v]) => [
            k,
            untrack(() => localOptions.get(axisKey(axis, k))) ?? v,
          ]),
        );
        validateAxis(a);
        const system =
          others.coordinates ?? untrack(() => plotOptions.get("coordinates"));
        validateAngularAxis(
          system === "spherical" ? system : current.coordinates,
          axis,
          a.type,
          system === "spherical"
            ? ({ x, y, z }[axis]?.transform ??
                untrack(() => plotOptions.get(axis + "Transform")) ??
                "linear")
            : (x?.transform ?? plotOptions.get("xTransform")),
        );
        if (
          a.type === "datetime" &&
          ({ x, y, z }[axis]?.transform ??
            untrack(() => plotOptions.get(axis + "Transform")) ??
            "linear") !== "linear"
        )
          throw Error("Datetime axes require a linear coordinate transform.");
      }
      validateMargins(current);
      // The root frame validates and applies the Plot's rules, bands, axisFrame and axisMask.
      delete current.axisFrame;
      delete current.axisMask;
      untrack(() => {
        for (const key of ["axes2d", "axes3d"]) {
          if (current[key] !== undefined) appliedGuideProps.add(key);
          else if (appliedGuideProps.delete(key)) localOptions.clear(key);
        }
        plotOptions.populate(current);
        if (Array.isArray(current.projectionCenter)) {
          plotOptions.set(
            "_projectionCenterLongitude",
            current.projectionCenter[0],
          );
          plotOptions.set(
            "_projectionCenterLatitude",
            current.projectionCenter[1],
          );
        }
        localOptions.populate(current);
      });
      axisError = "";
    } catch (error) {
      axisError = (error as Error).message;
    }
  });
  // Navigation settings belong to the plot, even while its 2D camera is unmounted.
  plotOptions
    .ensureChild("scene2d")
    .ensure("clamp", new BooleanType({ defaultValue: true }));

  onDestroy(() => {
    registration.dispose();
    viewOptions.dispose();
    plotOptions.dispose();
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (!htmlEvent(event)) brush.brushKey(event);
  }}
/>

{#await ready}
  <p>Loading...</p>
{:then backends}
  <section
    class="plot"
    aria-label={title ? undefined : displayLabel}
    aria-labelledby={title ? headingId : undefined}
    aria-describedby={descriptions.text ? descriptionId : undefined}
    bind:this={plotHost}
    tabindex="-1"
    data-export-host
    style:width={fills || facet ? "100%" : `${width ?? 800}px`}
    style:max-width={width === undefined &&
    responsive === undefined &&
    !facet &&
    !fillHost?.()
      ? "800px"
      : undefined}
    style:background={$backgroundStore}
    style:--hm-theme-background={controlsStyle["--hm-theme-background"]}
    style:--hm-theme-color={controlsStyle["--hm-theme-color"]}
    style:--hm-theme-scheme={controlsStyle["--hm-theme-scheme"]}
    class:figure
    style:min-height={figure ? `${height}px` : undefined}
    bind:clientWidth={measuredWidth}
  >
    <PlotText
      options={plotOptions}
      part="heading"
      {title}
      {subtitle}
      id={headingId}
    />
    <div id={descriptionId} class="hm-visually-hidden">{descriptions.text}</div>
    {#if !inheritedGuides}<GuideHost
        registry={guides}
        position="top"
        {defaultLegend}
      />{/if}
    <div class="plot-middle">
      {#if !inheritedGuides}<GuideHost
          registry={guides}
          position="left"
          {defaultLegend}
        />{/if}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
      <div
        class="canvas"
        class:atomic-pending={loading === "atomic" &&
          !atomicVisible &&
          !axisError &&
          !renderIssue}
        role="application"
        aria-busy={loading === "atomic" && !atomicVisible}
        aria-label="Plot canvas"
        tabindex="0"
        oncontextmenucapture={(event) => {
          if (!htmlEvent(event)) openContextMenu(event);
        }}
        onkeydown={(event) => {
          if (!htmlEvent(event)) contextMenuKey(event);
        }}
        bind:this={canvasHost}
        style:height={figure ? undefined : `${height}px`}
        style:min-height={figure
          ? `${Math.round(height * MIN_CANVAS_SHARE)}px`
          : undefined}
        style:background={$backgroundStore}
        onpointerenter={(event) => {
          if (htmlEvent(event)) return;
          if (event.pointerType !== "touch") {
            hovered = true;
            brush.brushControlsDismissed = false;
          }
        }}
        onpointerleave={(event) => {
          hovered = false;
          brush.clearNearby();
          brush.brushCursorState = "";
          releasePointer(event);
          if (event.pointerType !== "touch") {
            tooltips.box.hide();
            tooltips.leave();
          }
        }}
        style:cursor={brush.brushCursorState || undefined}
        onfocusin={(event) => {
          if (htmlEvent(event)) return;
          // Pointer focus on the canvas must not pin the controls after the
          // pointer leaves. Keyboard focus remains an explicit reveal state.
          brush.brushControlsFocused =
            (event.target as HTMLElement)?.matches?.(":focus-visible") ?? false;
          if (brush.brushControlsFocused) brush.brushControlsDismissed = false;
        }}
        onfocusout={(event) => {
          if (!canvasHost!.contains(event.relatedTarget as Node))
            brush.brushControlsFocused = false;
        }}
        onpointerdowncapture={(event) => {
          if (htmlEvent(event)) return;
          gestureEvent(event);
          trackPointer(event);
          brush.beginBrush(event);
        }}
        onpointermovecapture={(event) => {
          if (htmlEvent(event)) return;
          gestureEvent(event);
          brush.moveBrush(event);
          brush.moveNearby(event);
          trackPointer(event);
          tooltips.move(event);
          tooltips.unifiedMove(event);
        }}
        onpointerupcapture={(event) => {
          if (htmlEvent(event)) return;
          gestureEvent(event);
          brush.finishBrush(event);
          releasePointer(event);
          if (event.pointerType === "touch") {
            tooltips.releaseTouch(event);
          }
        }}
        onpointercancelcapture={(event) => {
          if (htmlEvent(event)) return;
          gestureEvent(event);
          brush.finishBrush(event, true);
          releasePointer(event);
        }}
        onwheelcapture={(event) => {
          if (htmlEvent(event)) return;
          gestureEvent(event);
          tooltips.box.hold("gesture");
          brush.brushWheel(event);
        }}
        ondblclickcapture={(event) => {
          if (htmlEvent(event)) return;
          const point = localPointer(event as any),
            editable = brush.bandAt(point);
          if (editable) {
            event.preventDefault();
            brush.clearBand(editable.band);
          } else if (brush.pointInBrush(point)) {
            event.preventDefault();
            brush.removeDisplayedBrush();
          }
        }}
      >
        <div class="html-overlay" bind:this={htmlOverlay}></div>
        <BrushOverlay {brush} {hovered} />
        {#if loading === "atomic" && !atomicVisible && !axisError && !renderIssue}
          <div
            class="loading-indicator"
            role="status"
            aria-label="Loading plot"
          >
            <span></span>
          </div>
        {/if}
        <Canvas
          toneMapping={toneMapping as THREE.ToneMapping}
          createRenderer={(canvas) => {
            renderer = new THREE.WebGPURenderer({
              canvas,
              antialias: true,
              alpha: true,
              forceWebGL: false,
              device: getWebGPUDevice(),
            });
            services.attachRenderer(renderer);
            attachClockView(renderer, services);
            installStorageBindings(renderer);
            installRendererDisposal(renderer, services);
            installVaryingsCheck(renderer, services);
            // Marks subscribe to the pointer as they mount (TODO 45); a transform above the Plot
            // reads it in the root frame.
            navigationReleases.push(
              services.navigation.pointer.install(pointerTracker),
              services.navigation.tooltip.install(tooltips.box),
              services.navigation.rootFrame.install(rootFrameOptions),
            );
            registration.renderer = renderer;
            return renderer;
          }}
        >
          {#if $mode === "2d"}
            <Scene2D
              width={canvasWidth || actualWidth}
              height={canvasHeight || height}
              viewport={viewport ?? facet?.viewport() ?? rememberedViewport}
              onviewportchange={viewChanged}
              interactive={interactive !== false}
              viewportDuration={viewport !== undefined ? viewDuration : 0}
              viewportEasing={$animationEasingStore}
            />
          {:else if $mode === "3d"}
            <Scene3D
              interactive={interactive !== false}
              fitRevision={fitRevision + fitCount}
              {cameraMemory}
              cameraMode={$cameraModeStore}
              {cameraPosition}
              {cameraTarget}
              cameraUp={cameraUp ?? viewUp($viewType)}
              cameraFov={explicitFov($cameraFovStore)}
              cameraNear={finiteOrUndefined($cameraNearStore)}
              cameraFar={finiteOrUndefined($cameraFarStore)}
              flySpeed={$flySpeedStore}
              flyoverMomentum={$flyoverMomentumStore !== false}
              oncamerachange={cameraChanged}
              animationDuration={$animationDurationStore}
              animationEasing={$animationEasingStore}
              animateCamera={viewDuration > 0}
            />
          {/if}

          <Lights value={lights} options={localOptions} />
          <Overview
            source={overviewSource}
            mode={$mode}
            options={activeRootFrame()?.options ?? plotOptions}
          />
          <UpdateGate
            register={(gate: NonNullable<typeof updateGate>) => {
              updateGate = gate;
              if (updateHolds) gate.hold();
              return () => {
                updateGate = undefined;
              };
            }}
          />
          <Export
            overlay={() => [
              ...(canvasHost?.querySelectorAll("svg[data-export-axes]") ?? []),
            ]}
            label={() => plainTitle() || displayLabel}
            register={(value: SceneExporters) => {
              exporters = value;
              return () => {
                exporters = undefined;
              };
            }}
          />
          <ViewTelemetry
            active={$mode === "2d" ? axisActive : $orientation3d && hovered}
            onframe={(frame: ViewFrame) => (viewFrame = frame)}
          />
          <Interactive antialias={$antialias} {presentation}>
            <Axis
              {x}
              {y}
              {z}
              {rules}
              {bands}
              axisMask={others.axisMask}
              axisFrame={others.axisFrame}
              autoBounds={autoBoundsEnabled}
              {scaleDefaults}>{@render children?.()}</Axis
            >
          </Interactive>
        </Canvas>
        {#if axisError || renderIssue}<small role="alert"
            >{axisError || renderIssue}</small
          >{/if}
        {#if $overview}<div class="overview-overlay">
            <Minimap
              axes={$overviewAxesStore}
              for={overviewHandle}
              displayScale={$overviewScaleStore}
              maxInstances={$overviewLimitStore}
              width={Math.max(
                1,
                Math.min($mode === "2d" ? 160 : 96, canvasWidth - 16),
              )}
              height={Math.max(
                1,
                Math.min($mode === "2d" ? 110 : 96, canvasHeight - 16),
              )}
            />
          </div>{/if}
        {#each frames as f (f.slot)}<AxisOverlay
            {renderer}
            view={services}
            frameBox={f.box}
            layout={f.layout}
            options={f.options}
            frame={viewFrame}
            mode={$mode}
            width={canvasWidth}
            height={canvasHeight}
            show2d={f.show2d}
            show3d={false}
            placement={stackedPlacement(f)}
            titles={f.slot === rootSlot ? outerTitles(f.titles) : f.titles}
            onstrips={f.parentKey != null
              ? (strips: Parameters<typeof brush.publishStrips>[1]) =>
                  brush.publishStrips(f.key, strips)
              : undefined}
          />{/each}
        <AxisOverlay
          {renderer}
          view={services}
          {layout}
          options={plotOptions}
          frame={viewFrame}
          mode={$mode}
          width={canvasWidth}
          height={canvasHeight}
          show2d={false}
          show3d={$orientation3d && hovered && overviewCount === 0}
        />
        {#if credits}<svg
            data-export-axes
            class="credits"
            width={canvasWidth}
            height={canvasHeight}
            role="note"
            aria-label="Credits"
            ><text x={6} y={canvasHeight - 6}>{credits}</text></svg
          >{/if}
        {#if controlsEligible}<PlotControls
            label={displayLabel}
            revealed={hovered}
            touch={!chrome.canHover}
            settingsOpen={chrome.settingsOpen}
            exportOpen={chrome.exportOpen}
            canExport={exportShown && !!(exportPNG || exportSVG || exportHTML)}
            bind:settingsButton={chrome.settingsButton}
            bind:exportButton={chrome.exportButton}
            onsettings={(button: HTMLElement) => chrome.toggleSettings(button)}
            onexport={(button: HTMLElement) => chrome.toggleExport(button)}
          />{/if}
      </div>
      {#if !inheritedGuides}<GuideHost
          registry={guides}
          position="right"
          {defaultLegend}
        />{/if}
    </div>
    {#if !inheritedGuides}<GuideHost
        registry={guides}
        position="bottom"
        {defaultLegend}
      />{/if}
    <PlotText options={plotOptions} part="caption" {caption} />
    <TooltipOverlay {tooltips} {canvasHost} />
    {@render toolbar?.()}
    <PlotContextMenu
      bind:this={contextMenu}
      onsettings={() => openSettings(canvasHost)}
      onexport={exportShown &&
      ((exportPNG as PlotHandle["exportPNG"] | undefined) ||
        (exportSVG as PlotHandle["exportSVG"] | undefined) ||
        exportHTML)
        ? (point: { x: number; y: number }) =>
            chrome.openExport(canvasHost, point)
        : undefined}
      onclose={() => canvasHost?.focus({ preventScroll: true })}
    />
    <PlotDialogs
      {chrome}
      options={plotOptions}
      label={displayLabel}
      allowSharedDefaults={settings.allowSharedDefaults !== false}
      {exportPNG}
      {exportSVG}
      {exportPDF}
      {exportHTML}
    />
  </section>
{:catch error}
  <p>Error initializing device: {error.message}</p>
{/await}

<style>
  .hm-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .credits {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .credits text {
    font:
      10px system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
    fill: #3d3a36;
    stroke: rgba(255, 255, 255, 0.85);
    stroke-width: 3px;
    paint-order: stroke;
  }
  .overview-overlay {
    position: absolute;
    right: 8px;
    top: 8px;
    max-width: calc(100% - 16px);
    max-height: calc(100% - 16px);
    z-index: 5;
  }
  .plot {
    position: relative;
    min-width: 0;
    font-family: "Source Sans 3", system-ui, sans-serif;
  }
  .plot-middle {
    display: flex;
    min-width: 0;
  }
  .plot.figure {
    display: flex;
    flex-direction: column;
  }
  .plot.figure > .plot-middle {
    flex: 1 1 0;
  }
  /* The canvas's drawing does not size its row; side legends taller than the row still do. */
  .plot.figure .canvas {
    contain: size;
  }
  .plot-middle > :global(.canvas) {
    flex: 1;
    min-width: 0;
  }
  .html-overlay {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 3;
  }
  .canvas.atomic-pending .html-overlay {
    visibility: hidden;
  }
  .canvas {
    position: relative;
    overflow: hidden;
    border-radius: 0;
    background: #fff;
  }
  .canvas.atomic-pending :global(canvas),
  .canvas.atomic-pending :global(svg),
  .canvas.atomic-pending .overview-overlay {
    opacity: 0;
  }
  .canvas :global(canvas),
  .canvas :global(svg),
  .overview-overlay {
    transition: opacity 120ms ease;
  }
  .loading-indicator {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    z-index: 8;
    pointer-events: none;
  }
  .loading-indicator span {
    width: 18px;
    height: 18px;
    border: 2px solid #cdd2dc;
    border-top-color: #687285;
    border-radius: 50%;
    animation: plot-spin 0.8s linear infinite;
  }
  @keyframes plot-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .canvas :global(canvas),
    .canvas :global(svg),
    .overview-overlay {
      transition: none;
    }
    .loading-indicator span {
      animation: none;
      border-top-color: #687285;
    }
  }
</style>
