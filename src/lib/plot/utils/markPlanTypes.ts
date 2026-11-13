/** Data and actions used by the mark update planner. No runtime state is owned here. */
import type { Array as JaxArray } from "@hmplot/jax";
import type { RendererField, PreparedMark } from "./internalTypes.js";
import type { AnimationOptions, MarkProps } from "../publicTypes.js";
import type {
  InteractionOwner,
  MembershipScope,
  ResponseBinding,
} from "./viewControllerTypes.js";

export type Channels = Record<string, unknown>;
/** Known preparation controls stay typed while arbitrary channels remain unknown. */
export type ScaleChannelKey =
  "fillScale" | "colorScale" | "sizeScale" | "widthScale";
export type AuthoredChannels = Channels &
  Pick<
    MarkProps,
    | "enterEffect"
    | "exitEffect"
    | "animationDuration"
    | "animationEasing"
    | "selectionOpacity"
  > & {
    identity?: import("./dataViewTypes.js").RowScope["identity"];
  } & Partial<Record<ScaleChannelKey, { isContinuous?: boolean }>>;
/** null means reuse cannot be proved; an empty key is a known constant. */
export type DependencyKey = readonly unknown[] | null;
export type PreparationDependencies = Record<string, DependencyKey>;

/** Borrowed rows: planning neither compacts them nor acquires a column reference. */
export interface PlannedRows {
  length: number;
  /** Immediate reads borrow producer values; capturing a key acquires no references. */
  has(field: string): boolean;
  get(field: string): unknown;
  hasOwnColumn?(field: string): boolean;
  parent?: PlannedRows | null;
  aggregate?: unknown;
  version?: number;
  snapshotOf?: unknown;
  identity?: { id?: string; key?: unknown } | null;
  interactionResource?(field: string):
    | {
        version?: number;
        revision?: number;
        previewRevision?: number;
        previewActive?: boolean;
      }
    | null
    | undefined;
  valid?: JaxArray | null;
  followsMask?: boolean;
  metadata?: (field: string) => { type?: string } | null | undefined;
}

/** What full preparation reads, distinct from the lifecycle PreparationJob. */
export interface MarkDataRequest {
  markScope?: PlannedRows | null;
  generation?: unknown;
  revision?: unknown;
  channels: Channels;
  dependencies?: PreparationDependencies | null;
  liveDependencies?: DependencyKey;
  staticDependencies?: DependencyKey;
}

/** Only a live write carries channels; the other actions use the existing request. */
export type MarkUpdateAction =
  | { action: "reuse-static" | "swap-mask" | "prepare" }
  | { action: "write-live"; channels: Channels };

/** The planner borrows only these capabilities of a preparation; it owns no result. */
export type PlannedPreparation = Partial<
  Pick<
    PreparedMark,
    | "request"
    | "interaction"
    | "scaleBindings"
    | "connections"
    | "interactionIndex"
    | "paddedMode"
    | "valid"
    | "drag"
    | "tooltip"
    | "nearest"
    | "metadata"
    | "temporal"
    | "rgb"
    | "lifecycleInteraction"
    | "expressionOpacity"
    | "filterMembership"
  >
>;
export interface PlannedMark {
  isDisposed?: boolean;
  fields?: Map<string, RendererField>;
}
export interface MarkUpdateState {
  kind: string;
  entry: PlannedPreparation | null | undefined;
  shown: PlannedPreparation | null;
  requested: MarkDataRequest | null;
  mark: PlannedMark | null | undefined;
  transitioning: boolean;
  interactivePositions: boolean;
  placement: boolean;
  domainsFixed: boolean;
}
/** Inputs at the point of planning, before full preparation edits authored channels. */
export interface MarkUpdateInputs {
  scope: PlannedRows | undefined;
  markScope: PlannedRows | undefined;
  generation?: unknown;
  revision?: unknown;
  props: Channels;
  animation: { liveChannels?: Channels | null; channels?: Channels | null };
  dependencies?: PreparationDependencies | null;
  mode?: string | null;
}

/** The live writer borrows the currently published target and displayed preparation. */
export interface LiveChannelMark {
  isDisposed?: boolean;
  fields: Map<string, RendererField>;
  options: Pick<import("../../options/options.js").OptionsNode, "set">;
  ensureChannelOpacity(): unknown;
  connectionFollowers?: Iterable<() => unknown>;
  /** Segments: whether it reads its ends at the frame edge in the shader (utils/frameEdges.js). */
  frameEdgesInShader?(): boolean;
}
export interface LiveChannelStepInputs {
  scope?: NamedScope | null;
  channels?: Channels;
  acceptWrites?(): boolean;
}
/** Values are borrowed until afterWrites resolves; retain explicitly to keep an array. */
export interface LiveChannelWrite {
  props: Channels;
  updatedProps: Record<string, import("./effectiveFieldBinding.js").FieldValue>;
  scope: NamedScope | null | undefined;
  entry: PreparedMark;
  shown: PreparedMark;
  acceptWrites?: () => boolean;
}
export interface LiveChannelWriterOptions {
  getKind(): string;
  getMark(): LiveChannelMark | null | undefined;
  getEntry(): PreparedMark | null | undefined;
  getShown(): PreparedMark | null | undefined;
  pointerNow(): import("./expressionPlanTypes.js").ViewStateRecord["pointer"];
  visibleNow(): import("./expressionPlanTypes.js").ViewStateRecord["visible"];
  tweenOptions(
    expression: unknown,
    channel: string,
    scope: NamedScope | null | undefined,
    time: number,
    flight: { end: number; finalDue: boolean },
  ): import("./expressionPlanTypes.js").EagerEvaluationOptions;
  evaluator?: import("./expressionPlanTypes.js").ExpressionEvaluator;
  invalidate(): void;
  report(error: Error): void;
  landed(entry: PreparedMark): void;
  afterWrites?(write: LiveChannelWrite): void | Promise<void>;
}

/** A preparation carries borrowed membership resources; its owner registers their releases. */
export type PreparedInteraction = ResponseBinding & {
  owner: InteractionOwner & { generation?: number };
  generation?: number;
  scope?: MembershipScope | null;
  dataScope?: { revalidatedGeneration?: number } | null;
  revisions: { selection: number; hover: number; nearest: number };
  selectionOpacity: number;
  brushAxis?: string;
  brushSeries?: unknown;
  brushColumns?: Record<
    string,
    import("./viewControllerTypes.js").BrushColumn | null
  > | null;
  frameKey?: string;
  frameOptions?: import("./internalTypes.js").FrameOptions;
  nearbyConfig?: { axis: string; radius: number; units: "px" | "data" } | null;
};
export interface MarkTiming {
  duration: number;
  easing: AnimationOptions["animationEasing"];
  scale: boolean;
}
/** Channel families are kept separate: clock and pointer subscriptions read different sets. */
export interface PreparedAnimation {
  channels: Record<string, MarkTiming>;
  procedural: Channels;
  stepped: Channels;
  tweened: Channels;
  enter: Channels;
  exit: Channels;
  tracked: Channels;
  clocked: Channels;
  liveChannels: Channels;
  live: boolean;
  arrive?: boolean;
  /** This preparation discards the previous row correspondence and all pending motion. */
  schemeReset?: boolean;
  specs?: Record<string, AuthoredFieldAnimation>;
  kinds?: Record<string, number[]>;
}
/** Keyed lifecycle inputs belong to this target; request ordering stays with PreparationJob. */
export interface PreparedLifecycle {
  evaluator?: import("./expressionPlanTypes.js").ExpressionEvaluator;
  enter?: MarkProps["enterEffect"];
  exit?: MarkProps["exitEffect"];
  animationDuration?: number;
  animationEasing?: AnimationOptions["animationEasing"];
  channelEnter: Channels;
  channelExit: Channels;
  channelDuration: number;
  animates: boolean;
}
export interface PreparedAxisDomain {
  axis: string;
  domain: number[] & { empty?: boolean };
  screenMetrics: unknown[] | null;
}

/** Borrowed preparation capabilities; gathering and projection remain with the row scope. */
import type {
  RowScope,
  ColumnMetadata,
  DictionaryColumn,
  GridModel,
  PreparationCategoryScale,
} from "./dataViewTypes.js";
import type { OptionsNode } from "../../options/options.js";
import type {
  EagerEvaluationOptions,
  ExpressionResult,
} from "./expressionPlanTypes.js";
import type { CategoryValue } from "../publicTypes.js";
import type { FacetService } from "./facetService.js";
export type { PreparationCategoryScale } from "./dataViewTypes.js";
export type NamedScope = Omit<RowScope, "resolve" | "scale"> & {
  resolve(value: unknown): unknown;
  scale(field: string, palette?: unknown): PreparationCategoryScale;
  valid?: JaxArray | null;
};
export type NamedOptions = OptionsNode & {
  categoryAxes?: Record<string, PreparationCategoryScale>;
};
/** What preparation derives for the frame to merge (TODO 136.12; namedData.js mergeFrameBindings). */
export interface NamedFrameBindings {
  /** Plot axis settings (axisXType, axisXTimeOrigin, ...) for the plot's derived layer. */
  axes: Record<string, unknown>;
  /** Band axes' category scales by dimension. */
  categoryAxes: Record<string, PreparationCategoryScale>;
}
export interface NamedFrame {
  options: NamedOptions;
  categoryFor?(
    identity: string,
    family: string,
    palette?: string[],
  ): PreparationCategoryScale | null;
  /** The facet cell the frame is in (utils/facetService.ts). */
  facet?: FacetService;
}
/** Per-mark encoding caches own their device values; borrowed channels never enter owned[]. */
export interface NamedPreparationState {
  limit?: number;
  palette?: string[];
  auto: Record<string, PreparationCategoryScale>;
  hidden: Record<string, Set<unknown>>;
  ids?: WeakMap<object, number>;
  nextId?: number;
  paletteKeys?: Record<string, string>;
  categoryValues?: Map<
    string,
    {
      source: unknown;
      categories?: readonly unknown[];
      signature: string;
      values: JaxArray;
    }
  >;
}
export interface NamedEvaluation {
  time?: number;
  expressionOptions?(expression: unknown): EagerEvaluationOptions;
  expressionEvaluator?(
    expression: unknown,
    scope: NamedScope,
    options: EagerEvaluationOptions,
  ): ExpressionResult;
}
export interface RgbRangeCheck {
  array: JaxArray;
  integer: boolean;
  where: string;
  raster?: boolean;
  source?: JaxArray;
}
export interface MappingProvenance {
  kind?: string;
  label?: string;
}
export type NamedChannelProvenance = Record<
  string,
  MappingProvenance | undefined
>;
export type CodePlan = { lookup: boolean };
export type CodeInputs = { codes: JaxArray; params: JaxArray };
export type RgbSpec = Record<"r" | "g" | "b", unknown> & { a?: unknown };
export interface CategoryLegendRecord {
  scale: PreparationCategoryScale;
  hidden: Set<unknown>;
  field: string | null;
  entries: {
    value: CategoryValue;
    label: string;
    visible: boolean;
    [key: string]: unknown;
  }[];
}

/** The strictly checked result of prepareNamed, before the component adds publication state. */
export interface NamedPreparedResult {
  props: Channels;
  /** Custom evaluators may omit descriptions; retain their original disposal contract. */
  channelResults: Record<string, ExpressionResult>;
  gridValues: JaxArray | null;
  gridPlacement: {
    grid: GridModel;
    layout: ReturnType<typeof import("./gridMarks.js").gridLayout>;
    shifts: Record<string, number>;
    field: string | null;
  } | null;
  metadata: Record<string, CategoryLegendRecord>;
  temporal: Record<string, { type: string; origin: number; timezone: string }>;
  frameBindings: NamedFrameBindings;
  scales: Set<PreparationCategoryScale>;
  rgbChecks: RgbRangeCheck[];
  rgb: Record<string, boolean>;
  opacitySource: unknown;
  rowOpacity: JaxArray | undefined;
  /** Register one release; disposal runs each once, including late registrations. */
  own(release: () => void, options?: { after?: boolean }): void;
  dispose(): void;
}

/** Authored timing, before the GPU transition converts easing names to shader codes. */
export interface AuthoredFieldAnimation {
  kinds: number[];
  constants: number[];
  components: ({
    explicit?: boolean;
    duration?: number;
    easing?: AnimationOptions["animationEasing"];
    suppressed?: boolean;
  } | null)[];
  explicit: boolean;
}
/** Owned endpoint gather; preparations retain its arrays and scope independently. */
export interface PreparedConnection {
  props: Record<string, JaxArray>;
  offsets: Record<string, JaxArray> | null;
  scope: NamedScope & {
    ambiguous(field: string): boolean;
    retain(): () => void;
  };
  interactionIndex: JaxArray | null;
  layout: ReturnType<typeof import("./connections.js").connectionLayout>;
  live: { slots: { fraction: JaxArray | null }[] };
  shared: boolean;
}
/** Pending and failed gathers may keep the previous result on screen. */
export interface ConnectionState {
  pending?: boolean;
  error?: unknown;
  errorText?: string;
  result?: PreparedConnection | null;
}

/** Raw component exports used by the bound mark; renderer objects keep field ownership. */
export interface MarkComponentExports {
  getMark(): import("../objects/base.js").BasePlotObject | undefined;
  getLegendSource?(): import("../publicTypes.js").LegendPlotSource | undefined;
  getSurface?(): unknown;
}
