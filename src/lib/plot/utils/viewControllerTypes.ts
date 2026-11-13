import type { Snippet } from "svelte";
import type { Object3D } from "three/webgpu";
import type { Array as JaxArray } from "@hmplot/jax";
import type { RowScope, RowProvenance } from "./dataViewTypes.js";
import type { createOffsetLayer } from "./offsets.js";
import type {
  CanvasRect,
  FrameEntry,
  FrameLayout,
  FrameOptions,
  PlotRenderer,
  ViewFrame,
  NavigationControls,
  ViewServices,
} from "./internalTypes.js";
import type {
  TooltipSetting,
  SelectionResource,
  SelectionConstraint,
  ScaleTransformName,
  CategoryValue,
} from "../publicTypes.js";
import type { FrameModel } from "./frameModel.js";
import type { FramePointer } from "./viewPointer.js";

export type InteractionPhase = "committed" | "preview";
export type InteractionKind =
  "selection" | "brush" | "hover" | "nearby" | "nearest" | "tooltip";
/** Resources are optional: a caller may supply just an id and row count for manual membership. */
export type InteractionOwner = {
  id: string;
  length: number;
  /** Counts the table's updates (a table's data identity). */
  generation?: number;
  /** A table's host values of a column and its type, for selection({by}) (TODO 139.6). */
  byValues?: (field: string) => { values: unknown[]; type?: string } | null;
  /** Follow the table's updates; returns the unsubscribe. */
  onUpdate?: (listener: (changed: Set<string> | null) => void) => () => void;
} & Partial<Record<InteractionKind, SelectionResource>>;
export interface SelectionStatus {
  active: boolean;
  previewActive: boolean;
  count: number;
  committedCount: number;
  previewCount: number;
  revision: number;
  previewRevision: number;
  membership: number;
}
/** A GPU evaluator returns an owned mask; expansion borrows it and returns an owned replacement. */
export interface ConstraintDescriptor extends SelectionConstraint {
  evaluate(): JaxArray;
  release?(): void;
  expand?(mask: JaxArray): JaxArray;
}
export type ConstraintColumns =
  string | { identity: string } | Array<string | { identity: string }>;
/** Internal resource operations extend the public API without adding runtime capabilities. */
export interface SelectionState {
  readonly isSelection: true;
  owner?: InteractionOwner;
  readonly active: boolean;
  readonly by: string | null;
  readonly revision: number;
  readonly previewRevision: number;
  readonly previewActive: boolean;
  status(): SelectionStatus;
  subscribe(listener: (status: SelectionStatus) => void): () => boolean;
  rows(owner?: InteractionOwner, phase?: InteractionPhase): Set<number>;
  getConstraints(
    this: SelectionState,
    owner?: InteractionOwner,
    phase?: InteractionPhase,
  ): SelectionConstraint[];
  clearColumns(
    owner: InteractionOwner | ConstraintColumns | undefined,
    columns?: ConstraintColumns,
  ): this;
  refreshConstraints(this: SelectionState, owner?: InteractionOwner): this;
  setConstraints(
    owner: InteractionOwner,
    updates: ConstraintDescriptor[],
    options?: { phase?: InteractionPhase; replace?: boolean },
  ): this;
  commitConstraintPreview(this: SelectionState, owner?: InteractionOwner): this;
  cancelConstraintPreview(this: SelectionState, owner?: InteractionOwner): this;
  replace(
    owner: InteractionOwner | Iterable<number> | undefined,
    rows?: Iterable<number>,
    options?: { phase?: InteractionPhase; activate?: boolean },
  ): this;
  add(
    owner: InteractionOwner | Iterable<number> | undefined,
    rows?: Iterable<number>,
  ): this;
  remove(
    owner: InteractionOwner | Iterable<number> | undefined,
    rows?: Iterable<number>,
  ): this;
  toggle(
    owner: InteractionOwner | Iterable<number> | undefined,
    rows?: Iterable<number>,
  ): this;
  commitPreview(this: SelectionState, owner?: InteractionOwner): this;
  cancelPreview(this: SelectionState, owner?: InteractionOwner): this;
  clear(owner?: InteractionOwner): this;
  remap(
    owner: InteractionOwner,
    oldTokens: readonly string[] | null,
    nextTokens: readonly string[],
  ): void;
  hydrate(
    owners: Iterable<[InteractionOwner, Iterable<number>]>,
    active?: boolean,
  ): this;
  prune(owner: InteractionOwner, length: number): void;
  /** Acquire: caller releases the returned reference. */
  mask(
    owner: InteractionOwner,
    length: number,
    phase?: InteractionPhase,
  ): JaxArray;
  anyMask(
    owner: InteractionOwner,
    length: number,
    phase?: InteractionPhase,
  ): JaxArray;
  feedbackOpacity(
    owner: InteractionOwner,
    length: number,
    phase: InteractionPhase,
    dim?: number,
    whileAny?: boolean,
  ): JaxArray;
  /** Borrow: acquire a reference before work outlives the next revision. */
  borrowMask(
    owner: InteractionOwner,
    length: number,
    phase?: InteractionPhase,
  ): JaxArray;
  borrowAnyMask(
    owner: InteractionOwner,
    length: number,
    phase?: InteractionPhase,
  ): JaxArray;
  dispose(): void;
}
export interface DataIdentityState extends InteractionOwner {
  key?: string | string[] | null;
  generation: number;
  tokens: string[] | null | undefined;
  persistent: boolean;
  readonly disposed: boolean;
  selection: SelectionState;
  brush: SelectionState;
  hover: SelectionState;
  nearby: SelectionState;
  nearest: SelectionState;
  tooltip: SelectionState;
  offsets: ReturnType<typeof createOffsetLayer>;
  /** Keyless updates only need length; keyed updates read get/has unless tokens are supplied. */
  update(
    scope: Pick<RowScope, "length"> & Partial<Pick<RowScope, "get" | "has">>,
    preparedTokens?: string[] | null,
    rekeyed?: boolean,
  ): void;
  resource(kind: InteractionKind): SelectionState;
  retain(): () => void;
  release(): void;
  dispose(): void;
}
export type BrushResource = SelectionState;
export interface BrushColumn {
  identity: string;
  name: string;
  channel: string;
  type: string;
  categories?: CategoryValue[];
  origin: number;
  /** Acquire raw/category/world values; the caller releases them. */
  array(): JaxArray;
  world(key: string, map: (values: JaxArray) => JaxArray): JaxArray;
  rows(): JaxArray | null;
  evaluateConstraint(
    constraint:
      | { categories: readonly CategoryValue[]; bounds?: never }
      | { bounds: readonly number[]; categories?: never },
  ): JaxArray;
  release(): void;
}
export interface NearbyRequest {
  x?: BrushColumn | null;
  y?: BrushColumn | null;
  axis?: string;
  units?: "px" | "data";
  center: Record<string, number>;
  radius: Record<string, number>;
  world: Record<string, (column: BrushColumn) => JaxArray>;
  transform?: Record<string, ScaleTransformName>;
  constant?: Record<string, number>;
}
/** Membership subscription also serves offsets, which have no preview/count fields. */
export interface MembershipStatus {
  revision: number;
  membership?: number;
  previewRevision?: number;
  active: boolean;
  previewActive?: boolean;
}
export interface MembershipResource {
  readonly version?: number;
  readonly previewActive?: boolean;
  readonly revision: number;
  readonly previewRevision?: number;
  subscribe(listener: (status: MembershipStatus) => void): () => void;
}
export type AggregateMembership = RowProvenance;
export type MembershipScope = Pick<
  RowScope,
  | "length"
  | "identity"
  | "identityRows"
  | "aggregate"
  | "provenance"
  | "parent"
  | "sourceIndices"
  | "contributors"
  | "retain"
  | "columnName"
  | "metadata"
  | "get"
>;
export type ResponseBinding = Partial<
  Record<InteractionKind, SelectionState | null>
> & { owner?: InteractionOwner | null; respond?: unknown };
/** The rows a mark's interaction reads (a data scope or view, or a bare identity's stand-in). */
export interface InteractionScope {
  readonly length: number;
  readonly identity?: unknown;
  retain?(): () => void;
}
/** A mark's row interaction (namedMark): the resources it produces and responds to. */
export interface InteractionBinding {
  owner: InteractionOwner;
  /** The rows picks map to; a live write moves it to the newest scope. */
  scope?: InteractionScope | null;
  selection?: BrushResource | null;
  hover?: BrushResource | null;
  nearest?: BrushResource | null;
  brush?: BrushResource | null;
  brushAxis?: string;
  brushColumns?: Record<string, BrushColumn | null | undefined> | null;
  brushSeries?: unknown;
  frameKey?: string;
  frameOptions?: FrameOptions;
  nearby?: BrushResource | null;
  nearbyConfig?: { axis: string; radius: number; units: "px" | "data" } | null;
}
export interface BrushBinding extends InteractionBinding {
  brush: BrushResource;
  brushAxis: string;
  frameKey: string;
  brushColumns: Record<string, BrushColumn | null | undefined>;
}
export interface NearbyBinding extends InteractionBinding {
  nearby: BrushResource;
  nearbyConfig: { axis: string; radius: number; units: "px" | "data" };
}
export interface BrushStrip {
  binding: BrushBinding;
  axis: string;
  bounds: CanvasRect;
  frameKey: string;
}
export interface BrushRect extends CanvasRect {
  axis: string;
  rootAxis?: boolean;
  strip?: BrushStrip;
}
export interface PendingBrush {
  start: number[];
  pointerId: number;
  axis: string;
  rootAxis?: boolean;
  strip?: BrushStrip;
  controls: boolean;
  controlOwner?: NavigationControls;
}
export interface BrushGesture extends PendingBrush {
  mode: string;
  originalRect: BrushRect | null;
  moved: boolean;
  key?: string;
  identity?: string;
  last?: BrushRect;
}
export interface StripBand {
  key: string;
  frameKey: string;
  axis: string;
  name: string;
  identity: string;
  binding: BrushBinding;
  strip: CanvasRect;
  span: BrushRect;
  rect: BrushRect;
}
export interface BandTarget {
  owner: InteractionOwner;
  binding: BrushBinding;
  identities: string[];
  key: string;
}
export interface BandEdit {
  binding: BrushBinding;
  identities: string[];
  key?: string;
}
export interface NudgeBand {
  axis: string;
  rect: BrushRect;
  span?: BrushRect;
  strip?: BrushStrip;
  identity?: string;
  key?: string;
  rootAxis?: boolean;
}

/** Values are getters: callbacks must see the current view, not its mount-time snapshot. */
export interface BrushHost {
  readonly renderer: PlotRenderer | undefined;
  /** The view's services: a gesture holds its navigation controls. */
  readonly view: ViewServices;
  /** The view's frames, their root and ownership (utils/frameModel.ts). */
  readonly frames: FrameModel;
  readonly plotOptions: FrameOptions;
  readonly viewFrame: ViewFrame | null;
  readonly layout: FrameLayout | null;
  readonly mode: string;
  readonly canvasHost: HTMLDivElement | undefined;
  readonly plotHost: HTMLElement | undefined;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly hovered: boolean;
  readonly brushResource: BrushResource | undefined;
  /** false: the plot does not pan or zoom, so a plain drag brushes. */
  readonly interactive?: boolean | "brush";
  issue(source: string, message?: string): void;
  localPointer(event: MouseEvent): number[];
  canvasSize(axis: string): number;
  worldAt(axis: string, pixel: number): number | null;
}
export interface TooltipEntry {
  owner?: object;
  row: string | number;
  title?: string;
  swatch?: string;
  lines: { label: string; text: string; swatch?: string }[];
  markers?: { at: number[]; color?: string }[];
  /** The mark's tooltip snippet; none (null) lists the lines. */
  content?: Snippet<[unknown]> | null;
  context?: unknown;
}
export interface TooltipBox {
  readonly current: TooltipEntry | null;
  show(owner: object, entry: TooltipEntry): void;
  hide(owner?: object): void;
  hold(reason: string | null): void;
}
export interface TooltipHost {
  readonly renderer: PlotRenderer | undefined;
  /** The view's services: a unified tooltip reads its picking pass. */
  readonly view: ViewServices;
  /** The frame acting as the root (FrameModel.rootFrame). */
  activeRootFrame(): FrameEntry | undefined;
  readonly canvasHost: HTMLDivElement | undefined;
  readonly plotHost: HTMLElement | undefined;
  readonly mode: string;
  readonly tooltip: TooltipSetting | undefined;
  localPointer(event: MouseEvent): number[];
  pointerIn(point: number[], frame: FrameOptions): FramePointer | null;
}

/** ViewCore accepts these only to diagnose removed settings; public Plot props stay closed. */
export interface ViewCoreInternalProps {
  fitRevision?: number;
  pole?: unknown;
  displayScale?: unknown;
  fog?: unknown;
  exportHTML?: () => Promise<Blob | { blob: Blob; warnings?: string[] }>;
}
