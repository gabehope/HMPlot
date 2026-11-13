/** Internal contracts. These are deliberately absent from the public barrel and scene protocol. */
import type { Camera, Object3D, Scene, WebGPURenderer } from "three/webgpu";
import type { OptionsNode } from "../../options/options.js";
import type { FacetService } from "./facetService.js";
import type { InteractivityContext } from "../../picking/context.js";
import type {
  CameraState,
  FrameHandle,
  LegendPlotSource,
  Viewport2D,
} from "../publicTypes.js";
import type { PickingPass } from "./pickingPass.js";
import type { createPointerTracker } from "./pointerTracker.js";
import type { createGesture } from "./gesture.js";
import type { createLoopGuard } from "./viewLoopGuard.js";
import type { evaluateExpression } from "./expressions.js";
import type { InteractionBinding, TooltipBox } from "./viewControllerTypes.js";
import type { createMinimapSource } from "./minimapSource.js";
import type { Array as JaxArray } from "@hmplot/jax";
import type { createDataScope } from "./categorical.js";
import type { createDataView } from "./dataView.js";
import type { continuous } from "./scaleResources.js";
import type { RendererDiagnostics } from "./diagnosticsTypes.js";
import type { BufferedField } from "./proputils.js";
import type { EffectiveFieldBinding } from "./effectiveFieldBinding.js";
import type { FrameModel } from "./frameModel.js";
import type { ClockScope } from "./clockScope.js";
import type { MarkDataRequest } from "./markPlanTypes.js";
import type {
  NamedScope,
  NamedPreparedResult,
  PreparedAnimation,
  PreparedAxisDomain,
  PreparedInteraction,
  PreparedLifecycle,
} from "./markPlanTypes.js";
import type { ReductionCache, ViewStateRecord } from "./expressionPlanTypes.js";
import type { replaceableRelease } from "../binding/preparedMarkDisposal.js";
import type { SurfaceTexture } from "./surfaceTexture.js";

/** Check the existing provider structurally; export capture borrows this same binding. */
type CheckedField<T extends EffectiveFieldBinding> = T;
export type RendererField = CheckedField<BufferedField>;

export type Release = () => void;
export type AxisName = "x" | "y" | "z";

/** A request's cause is inherited by follow-up work; supersession never changes that cause. */
export interface PreparationJob {
  readonly order: number;
  readonly cause: number;
  /** Preparation chooses the policy during setup, before passing the request to finish(). */
  policy: "current-request" | "newest-completed";
  readonly signal: AbortSignal;
}
export type FieldWriteResult =
  | { status: "applied" }
  | { status: "superseded" }
  | { status: "disposed" }
  | { status: "failed"; error: unknown };

/** Preserve the evaluator's actual record, including optional descriptions from custom evaluators. */
export type ChannelResult = ReturnType<typeof evaluateExpression>;
/**
 * prepareNamed supplies the owned channel result. The component adds the optional fields
 * below before publication or after an accepted live write; absence is meaningful during
 * preparation and on lifecycle frames. This adds no runtime defaults or second state bag.
 */
export type PreparedMark = NamedPreparedResult & {
  /** Component identity for mapping interval channels to rendered buffers. */
  kind?: string;
  /** The accepted data request; lifecycle ordering belongs to PreparationJob. */
  request?: MarkDataRequest;
  /** Borrowed row scope and validity; the entry owns a retain() release, not the scope itself. */
  markScope?: NamedScope | null;
  valid?: JaxArray | null;
  paddedMode?: "scattered" | "prefix" | "masked" | "grid";
  filteredCount?: number;
  keyTokens?: string[] | null;
  animationCorrespondence?: { scheme: string; tokens: string[] } | null;
  /** Owned series index; picks map displayed rows through it to the retained source scope. */
  interactionIndex?: JaxArray | null;
  scaleBindings?: {
    channel: string;
    family: string;
    scale: ReturnType<typeof continuous>;
    encodingOverrides: string[];
    localEncoding: Record<string, unknown>;
  }[];
  /** Contributions are published only when this preparation is accepted, then owned via own(). */
  commitScales?: Release;
  /** Animation target and keyed staging are separate from the accepted data request. */
  animation?: PreparedAnimation;
  lifecycleConfig?: PreparedLifecycle;
  arrive?: boolean;
  /** This preparation discards the previous row correspondence and all pending motion. */
  schemeReset?: boolean;
  tweenFlight?: { end: number; finalDue: boolean };
  preparedViewState?: ViewStateRecord;
  tokensRequested?: boolean;
  offsetsVersion?: number;
  axisTitles?: Record<string, string>;
  drag?: unknown;
  connections?: import("./markPlanTypes.js").PreparedConnection;
  iterative?: boolean;
  nearest?: { radius: number } | null;
  tooltip?: unknown;
  tooltipTarget?: import("./markTooltip.js").TooltipTarget | null;
  interaction?: PreparedInteraction | null;
  /** Owned opacity arrays; valid and markScope above remain borrowed. */
  expressionOpacity?: JaxArray | null;
  scalarOpacity?: JaxArray | null;
  scalarTranslucent?: boolean;
  translucent?: boolean;
  baseOpacity?: JaxArray | null;
  lifecycleOpacity?: JaxArray | null;
  displayedOpacity?: JaxArray | null;
  lifecycleInteraction?: {
    index: JaxArray;
    valid: JaxArray;
    sourceLength: number;
    outputLength: number;
  } | null;
  filterMembership?: {
    array: JaxArray;
    initial: JaxArray;
    release: Release | null | undefined;
  };
  opacityColumn?: unknown;
  opacityExtentWork?: Promise<number[] | null>;
  /** Summary work and its applied version stay with the entry that owns its inputs. */
  domains?: Promise<PreparedAxisDomain[]>;
  domainInputs?: Record<string, unknown> | null;
  domainsRevision?: number;
  appliedDomains?: PreparedAxisDomain[];
  /** The change this preparation serves (its publication's cause, viewSettlement.js). */
  cause?: number;
  /** A Text's labels, once a GPU text is read back (numericText.js labelNumbers, TODO 143.6). */
  labelsReady?: Promise<void> | null;
  /** Retained results replaced by live writes, released once through own(). */
  liveFieldValues?: Map<string, JaxArray>;
  liveScope?: ReturnType<typeof replaceableRelease>;
  liveOrder?: number;
  channels?: Record<string, unknown>;
  reductionCache?: ReductionCache;
};

export interface CanvasRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface ViewFrame {
  x: number[];
  y: number[];
  zoom?: number;
  /** The plot area the camera fit when it drew this frame (TODO 136.10). */
  rect?: CanvasRect;
}
export type FrameOptions = OptionsNode & {
  frameDefinition?: {
    owns(axis: string): boolean;
    parent?: FrameOptions | null;
    spatial?: () => boolean;
  };
};
export interface FrameLayout extends CanvasRect {
  polar?: boolean | object;
}
export interface ProjectedFramePoint {
  x: number;
  y: number;
  visible: boolean;
}
export interface ProjectedFrameBox {
  edges: { axis: string; primary: boolean; points: ProjectedFramePoint[] }[];
  ticks: (ProjectedFramePoint & {
    axis: string;
    position: number[];
    label: string;
    title?: boolean;
  })[];
}
export interface FrameEntry {
  key: string;
  logicalKey?: string | null;
  parentKey: string | null;
  slot?: number;
  options: FrameOptions;
  handle: FrameHandle;
  layout: FrameLayout | null;
  box: ProjectedFrameBox | null;
  spatial: boolean;
  show2d: boolean;
  placement?: {
    spatial?: boolean;
    x?: { show?: boolean; side?: string; offset?: number };
    y?: { show?: boolean; side?: string; offset?: number };
  };
  titles: { x: string; y: string; z: string };
  setDomain(axis: string, domain: number[]): void;
  /** The domain the frame's own props set for a dimension (its x.domain, say), if any. */
  explicitDomain(axis: string): number[] | undefined;
  /** The union of the marks' data extents on a dimension (null without any). */
  dataDomain?(axis: string): number[] | null;
  /** Show a domain group's union domain (utils/domainGroup.js, TODO 136.14); returns leave. */
  joinDomainGroup?(group: import("./domainGroup.js").DomainGroup): () => void;
}
/** Owned by viewCore; Axis/Facet borrow the context, and Axis registers its frame in the model. */
export interface FrameContext {
  /** The view's root selection, parentage and per-dimension ownership (utils/frameModel.ts). */
  model: FrameModel;
  trackPreparation<T>(work: Promise<T>): Promise<T>;
  whenSettled(options?: { loads?: boolean }): Promise<void>;
  options(): FrameOptions;
  frame(): ViewFrame | null;
  width(): number;
  height(): number;
  mode(): string;
  rectangles(): FrameLayout | null;
  getMinimapSource(): ReturnType<typeof createMinimapSource>["handle"];
  getLegendSource(): LegendPlotSource | undefined;
}
export interface RootContentEntry {
  kind: "pending" | "content" | "spatial" | "frame" | "decoration";
  key: string;
  parentKey: string | null;
  ranged?: boolean;
  placed?: boolean;
  spatial?: boolean;
}
export interface RootContentContext {
  parentKey: string | null;
  register(entry: RootContentEntry): Release;
  changed(): void;
}

/** Owned by Scene2D/Scene3D. Absent while switching modes or before controls mount. */
export interface NavigationControls {
  enabled: boolean;
  getViewport?(): Viewport2D;
  setViewport?(viewport: Viewport2D): void;
  /** 2D: center the view on a data point (the Overview's clicks). */
  panTo?(x: number, y: number): void;
  /** 3D: apply pending damping now. */
  update?(): void;
  /** The camera they move. */
  object?: Camera;
  /** 3D: the orbit target. */
  target?: { toArray(): number[] };
}
/** Owned by Scene3D while its camera and controls exist. */
export interface CameraHandle {
  get(): CameraState;
  set(
    patch: Partial<CameraState>,
    options?: { animate?: boolean },
  ): Promise<void>;
}
export interface TooltipSeriesEntry {
  x: number;
  name: string;
  text: string;
  /** The row's color: its category's legend color, else the mark's; none when it has neither. */
  swatch?: string;
  pixel: number[];
}
export type PlotPickObject = Object3D;

/** The rows a mark's accepted preparation shows. */
export interface MarkRows {
  /** A padded view's row count (the rows shown, not the physical rows drawn); null otherwise. */
  readonly count: number | null;
  /** A padded view's valid rows, borrowed: acquire the binding to read it after an await. */
  readonly valid: JaxArray | null;
}
/** A mark's part in its Plot's unified x tooltip (TODO 44.4). */
export interface MarkTooltip {
  /** Each series' row nearest `x` among the pick `hits` (a strip of the pick buffer). */
  series(
    hits: { instanceId: number; pixel: number[] }[],
    x: number,
  ): Promise<TooltipSeriesEntry[]>;
  /** Withdraw the @tooltip rows `series` wrote. */
  clear: Release;
}
/** A category channel's legend metadata (namedData.js prepareNamed's `metadata`). */
export interface CategoryChannel {
  field?: string | null;
  scale: { domain: unknown[] };
  entries: {
    value: unknown;
    label?: string;
    color?: string;
    visible?: boolean;
  }[];
  hidden?: Set<unknown>;
}
/** What a mark's legend reads, set once its data reached the GPU. */
export interface MarkLegend {
  readonly categories: Record<string, CategoryChannel>;
  /** A datetime or duration channel's origin: legend ticks map back from it. */
  readonly temporal: Record<string, unknown>;
  /** The display names of the columns the mark's channels plot: a legend's last-resort title. */
  readonly channelTitles: Record<string, string>;
  /** The columns the mark's axes plot, by the titles they show: a color repeating one is read
   * off that axis (a Plot's default legend leaves it out, TODO 136.17). */
  readonly axisTitles?: Record<string, unknown>;
  /** An opacity column's extent, read when a mounted legend asks. */
  readonly readOpacityExtent?: () => Promise<number[] | null>;
  /** Prepare again: a category this mark shares was hidden or shown. */
  refresh(): void;
  /** Hide or show (or isolate) one category of `channel`. */
  toggle(channel: string, value: unknown, isolate?: boolean): void;
}
/**
 * What a mark object's accepted preparation tells the code around it (Stage 117.2;
 * docs/REFACTOR-PLAN-2026-10-09.md, "View services and mark bindings"): picking, interaction,
 * tooltips, connections, legends and export read this instead of fields on the mark object. Its
 * publisher (namedMark, GeoJSON's legend) replaces it as a whole, so a reader holding one sees
 * one publication; one that reads its rows or scope after an await acquires it (ViewMarks).
 */
export interface MarkBinding {
  /** The mark's component kind ("Points", "Line", ...); null for GeoJSON's legend alone. */
  readonly kind: string | null;
  /** The compound a primitive draws (a Bar's Prism is a "Bar"): exports draw it as that. */
  readonly compound: string | null;
  /** View-local key of the enclosing frame; picks report it. */
  readonly frameKey: string | null;
  /** A tolerant pick reads an area mark's region, not rows (TODO 72). */
  readonly pickArea: boolean;
  /** The tolerant pick's radius (CSS pixels) for nearest or a tooltip, or null. */
  readonly nearest: { radius: number } | null;
  /** Row interaction: selection, hover, brush, nearby and nearest resources over its rows. */
  readonly interaction: InteractionBinding | null;
  readonly rows: MarkRows;
  readonly tooltip: MarkTooltip | null;
  readonly legend: MarkLegend | null;
  /** The continuous scales its channels resolved to, by channel. */
  readonly scales: Record<string, unknown> | null;
  /** The extents of its data per axis, which the axes pad. */
  readonly extents: Partial<Record<AxisName, number[]>> | null;
  /** Keep what this publication's readers read (its scope and rows) until the release. */
  retain(): Release;
}
/** The accepted bindings of a view's marks: one publisher per mark object. */
export interface ViewMarks {
  /** Observe current bindings and their replacements/removals; values are borrowed. */
  subscribe(
    listener: (object: object, binding: MarkBinding | undefined) => void,
  ): Release;
  /** The binding last published for `object`, while its publisher holds it. */
  of(object: object | null | undefined): MarkBinding | undefined;
  /** The current binding, kept with what it reads until `release` (in-flight picks, exports). */
  acquire(object: object | null | undefined): {
    value: MarkBinding | undefined;
    release: Release;
  };
  /** Publish `binding` for `object`; the release withdraws it while it is still the current one. */
  publish(object: object, binding: MarkBinding): Release;
}
/** Picking owns the pass and its map. Readers may borrow them only while this capability exists. */
export type PlotPicking = Omit<
  InteractivityContext,
  "scenePass" | "objectIdMap"
> & {
  scenePass?: PickingPass;
  objectIdMap: Map<number, PlotPickObject>;
  isPickCurrent?(): boolean;
  axisValue?(
    world: number[],
    options?: FrameOptions,
  ): { x: number; y: number; z?: number };
};

/**
 * One owner's value at a time. install() replaces the current value; only that install's
 * release clears it, so an old owner's cleanup never removes its replacement. Reads are not
 * reactive: borrowers read `current` when they act, as they read the renderer fields before.
 */
export interface Capability<T> {
  readonly current: T | undefined;
  install(value: T): Release;
}

/** What a reporter shows on its plot: a message, or an error carrying a structured diagnostic. */
export type ReportedError =
  string | { message: string; diagnostic?: unknown } | null | undefined;
/** The Overview's draw counts (getDiagnostics().overview). */
export interface OverviewDiagnostics {
  clients: number;
  targets: number;
  draws: number;
  sourceId?: unknown;
  frames?: unknown[];
}
/** Counters that tests and performance checks read; the code doing the work increments them. */
export interface ViewCounters {
  markPreparations: number;
  /** Transform runs in this view by cause (utils/rerunGuard.js): data, settings, interaction, view, tween. */
  transformRuns: Record<string, number>;
  /** Each interaction- or view-driven transform's densest second of runs, for the re-run lint. */
  reruns: Map<
    object,
    {
      kind: string;
      name?: string;
      cause: string;
      burst: number;
      times: number[];
    }
  >;
  liveFieldUpdates: number;
  staticMarkReuses: number;
  numericExpressionCompiled: number;
  numericExpressionFallback: number;
  connectionPreparations: number;
  connectionMatches: number;
  connectionGathers: number;
  /** Frames recomputing a changed axis title (TODO 21 D12): navigation never changes one. */
  axisTitleUpdates: number;
  /** Frame and Axes configuration runs: moving a placed frame runs none. */
  frameConfigurations: number;
  pickFrames: number;
  /** The most inter-stage locations any shader of the view used (TODO 136.9, varyingsCheck.js). */
  peakVaryings: number;
}
/**
 * A view's errors and diagnostics. viewCore owns the error surface (its alert shows the joined
 * messages); each reporter owns its entry and clears it. Instrumentation is opt-in and belongs
 * to the renderer it observes.
 */
export interface ViewDiagnostics {
  /** Show `owner`'s error on the plot; an empty one clears it and leaves the others. */
  report(owner: object, error: ReportedError): void;
  /** The first reported error that carries a structured diagnostic, else null. */
  readonly renderDiagnostic: ReportedError;
  /** Every reported error, as a Diagnostic naming its component (TODO 136.6). */
  list(): import("./diagnostics.js").Diagnostic[];
  readonly instrumentation: Capability<RendererDiagnostics>;
  /** Owned by the Overview while it is mounted. */
  readonly overview: Capability<() => OverviewDiagnostics>;
  readonly counters: ViewCounters;
  /** Expression consumers' plan summaries, each registered for its consumer's lifetime. */
  readonly expressionPlans: Set<() => Record<string, unknown>>;
  /** The last pick's raw pixel. */
  lastPick?: number[];
}
export type PointerTracker = ReturnType<typeof createPointerTracker>;
export type ViewGesture = ReturnType<typeof createGesture>;
export type LoopGuard = ReturnType<typeof createLoopGuard>;
/**
 * A view's pointer and navigation. viewCore owns the pointer tracker, the tooltip box and the
 * root frame; Scene2D or Scene3D owns the controls, and Scene3D the camera handle.
 */
export interface ViewNavigation {
  /** Readers subscribe in their frame (TODO 45, utils/pointerTracker.js). */
  readonly pointer: Capability<PointerTracker>;
  /** The one tooltip the view shows (TODO 44). */
  readonly tooltip: Capability<TooltipBox>;
  /** The options of the view's root frame. */
  readonly rootFrame: Capability<() => FrameOptions>;
  readonly controls: Capability<NavigationControls>;
  readonly camera: Capability<CameraHandle>;
  /** Hear every 3D camera move at once (a live VectorTile, TODO 66.1); returns the release. */
  onCameraMove(listener: () => void): Release;
  /** Scene3D: its camera moved. */
  cameraMoved(): void;
  /** The viewer's drag or wheel burst (TODO 136.8, utils/gesture.js). */
  readonly gesture: ViewGesture;
  /** The view's loop guard (TODO 136.8, utils/viewLoopGuard.js), installed by viewCore. */
  readonly loops: Capability<LoopGuard>;
}
/** Where a frame (AXIS_CONTEXT) takes the domains of the marks in it. */
export interface FrameDomains {
  domain(
    axis: string,
    bounds: number[] | null,
    owner: string,
    cause?: number,
  ): void;
  collect(): boolean;
}
/** Where a facet cell (FACET_CONTEXT, utils/facetService.ts) takes its marks' domains. */
export type FacetDomains = Pick<FacetService, "domain">;
/** One contributor's domains, routed once to where they count (ViewDomains.route). */
export interface DomainRoute {
  /** Whether that target infers its domains from data now. */
  collects(): boolean;
  /** `cause`: the change the bounds serve (a preparation's), so the frame applies one domain for
   * every mark that change moves (TODO 143.2). */
  set(axis: string, bounds: number[], cause?: number): void;
  /** Withdraw the contributor's domains on every axis. */
  clear(): void;
  /** Its `axes` came from `reader`'s view-derived output (TODO 136.8: the view's loop guard). */
  derived(reader: string, mark: string, axes: string[]): void;
}
/**
 * A view's domain contributions. A contributor's domains count in its frame (every content of a
 * Plot has one: the Plot's root frame at least), else its facet cell. A layout's fit (Force)
 * sets the view's data bounds; explicit ones override the Plot's own domains, as before.
 */
export interface ViewDomains {
  readonly dataBounds: Capability<
    (bounds: Partial<Record<AxisName, number[]>>, explicit?: boolean) => void
  >;
  route(target: {
    frame?: FrameDomains;
    facet?: FacetDomains;
    owner: string;
    facetOwner: object;
  }): DomainRoute;
}
/** Ends an update hold: the view draws again once what it waits for settles. */
export type UpdateRelease = (options?: {
  skipPreparations?: boolean;
}) => Promise<void>;
/** Update coordination: viewCore's gate (Plot.beginUpdate) while it has a renderer. */
export interface ViewUpdates {
  readonly gate: Capability<() => UpdateRelease>;
}
/** A pixel brush over the pick target (Interactive's; the library's brushes no longer read it). */
export interface BrushReadback {
  read(rect: CanvasRect & { axis?: string }, phase?: string): Promise<number>;
  /** Supersede a read in flight. */
  cancel(): void;
}
/**
 * What Interactive owns while mounted: the drawn scene, its camera and the picking context
 * (pass, object ids, pickAt, axisValue). Readers borrow them while the capability exists.
 */
export interface ViewPicking {
  readonly context: Capability<PlotPicking>;
  readonly scene: Capability<Scene>;
  readonly camera: Capability<() => Camera>;
  readonly brushReadback: Capability<BrushReadback>;
  /** Marks with nearby bindings, each registered for its lifetime (brushes skip nearby without one). */
  readonly nearby: Set<object>;
}
/** Interactive's raster export of the view, and the effects that force a raster export. */
export interface ViewExport {
  /** Render the scene into `target` at `scale`, through the live presentation. */
  readonly render: Capability<
    (target: unknown, scale?: number) => Promise<void>
  >;
  /** The presentation effects shown now ("sky", "fog", "glow", "atmosphere", a plugin effect's kind). */
  readonly effects: Capability<() => string[]>;
}
/**
 * A view's drawing lifecycle (Stage 121.1): the view's own state. Its mount, its update gate,
 * its renderer's size and device, and its frames write it; settlement and the barriers in
 * utils/lifecycle.js (TODO 17.15) read it.
 */
export interface ViewLifecycle {
  /** Tracked preparations and the cause each serves (trackPreparation). */
  readonly preparations: Map<Promise<unknown>, number>;
  /** Curved-path geometry builds, chained (curvedPaths.js); settling waits for the chain. */
  geometryQueue: Promise<unknown> | undefined;
  /** The view's mount as a change (viewCore): its cause, kept from the first mount. */
  mountCause: number | undefined;
  /** Until the first reveal, work started without a cause serves the mount. */
  mounting: boolean;
  /** Atomic scene updates pause draws while their data preparations settle (the update gate). */
  renderHeld: boolean;
  /** The canvas has a drawable size (installRendererDisposal; false from the renderer's creation). */
  drawable: boolean;
  /** Why the GPU device was lost, once it was. */
  deviceLost: string | undefined;
  /** Frames drawn completely (Interactive). */
  completedFrame: number;
  /** Called after each completed frame; each caller removes its own. */
  readonly frameCallbacks: Set<() => void>;
  /** Feature resources released when rendering stops; late owners release immediately. */
  readonly rendererResources: {
    own(release: () => void): void;
    dispose(): void;
  };
  /** The last frame waited for curved-path geometry (Interactive). */
  geometryBusy: boolean;
}
/**
 * A view's clock (Stage 121.1): the clock scope it keeps time in, and its own holds. The view's
 * animation clock (utils/animation.js, attachClockView) moves its transitions by it.
 */
export interface ViewClock {
  /**
   * The clock scope (utils/clockScope.js) whose time its @time channels and transitions read:
   * the one viewCore provides, shared by the Plots in it. A view made without one (unit tests)
   * takes its animation clock's own.
   */
  scope: ClockScope | undefined;
  /** The scope's time in milliseconds; 0 before the view has a scope. */
  readonly time: number;
  /** Held by exports and holdAnimations (holdAnimation): its transitions exclude the time held. */
  held: boolean;
  /** Its animation clock is applying a frame's transitions (the render loop waits). */
  busy: boolean;
}
/** What the view draws (Stage 121.1): its record of drawn changes, and who redraws with it. */
export interface ViewDrawing {
  /**
   * Bumped whenever what is drawn changes (a mark's data or invalidation, a placed frame's
   * matrix, the axis mask, the 3D aspect): an on-demand pick, the Overview's redraw and the 3D
   * aspect's surface lookup are current while it stands.
   */
  revision: number;
  /** The surface textures drawn in the scene, each registered while it exists. */
  readonly surfaceTextures: Set<SurfaceTexture>;
  /**
   * The Overview's redraw while it is mounted: the render loop calls it after a complete frame,
   * and with `false` before each frame and on a 2D mode switch (navigation does not wait).
   */
  readonly overviewFrame: Capability<(complete?: boolean) => void>;
}
/** Its marks' data credits (TODO 35): one line in the lower-left corner, kept in exports. */
export interface ViewCredits {
  /** Set `owner`'s credit; an empty one clears it. */
  set(owner: object, text: unknown): void;
  /** Each distinct credit once, in the order first set. */
  line(): string;
  /** viewCore hears each change while it shows the line. */
  readonly changed: Capability<() => void>;
}
/**
 * One per view (Plot): viewCore creates it and provides it through VIEW_SERVICES_CONTEXT
 * (viewServices.ts). Components read it from that context; helpers receive it as a parameter.
 */
export interface ViewServices {
  /** The view's renderer, from its canvas's creation. */
  readonly renderer: PlotRenderer | undefined;
  readonly lifecycle: ViewLifecycle;
  readonly clock: ViewClock;
  readonly drawing: ViewDrawing;
  readonly credits: ViewCredits;
  readonly diagnostics: ViewDiagnostics;
  readonly navigation: ViewNavigation;
  readonly domains: ViewDomains;
  readonly updates: ViewUpdates;
  readonly picking: ViewPicking;
  readonly export: ViewExport;
  /** Its marks' accepted bindings (Stage 117.2). */
  readonly marks: ViewMarks;
}

/**
 * A view's renderer. What the view shares lives in its ViewServices (Stages 117.1 and 121.1),
 * not on the renderer.
 */
export type PlotRenderer = WebGPURenderer;
