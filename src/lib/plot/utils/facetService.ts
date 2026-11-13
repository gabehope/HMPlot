/**
 * The Facet and Partition extension point (TODO 126.5, docs/CORE.md): every question core code
 * asks a facet cell or a Partition group, as one typed service.
 *
 * Owner: Facet and Partition. A facet cell (facetCell.svelte) sets FACET_CONTEXT to the service
 * createFacetService builds over its Facet's controller (facetCore.svelte); a Partition group
 * (partitionGroup.svelte) sets PARTITION_CONTEXT to its PartitionGroup. The core reads them with
 * facetService() and partitionGroup() and imports no other Facet or Partition module.
 *
 * What a cell's content may read: the cell's identity, whether it is drawn, its Facet's chrome,
 * its outer axes, a linked viewport and what the cell remembered. What it may publish: its
 * Plot's handle and viewport, its frames' and marks' domains and plotted columns, its
 * transforms' settings and runs, and its iterative layouts' results. Released: each register
 * call returns its release, a mark withdraws its domains and columns (null) as it unmounts, and
 * the service goes with its cell.
 */
import { getContext } from "svelte";
import type { NamedScope } from "./markPlanTypes.js";
import type { DataView } from "./dataViewTypes.js";
import type { OptionsNode } from "../../options/options.js";

export const FACET_CONTEXT = Symbol("facet");
export const PARTITION_CONTEXT = Symbol("partition");

/** A facet cell's identity: its key, row and column values and its position among the cells. */
export interface FacetCell {
  key: string;
  row: unknown;
  column: unknown;
  ordinal: number;
}

/** Which of a cell's axes another cell labels (its outer axes), on each side. */
export interface FacetInnerAxes {
  x: { before: boolean; after: boolean };
  y: { before: boolean; after: boolean };
}

/** What a cell's Plot remembers while it is unmounted (a scrolled-away cell). */
export interface FacetCellMemory {
  settings?: unknown;
  cameraMemory?: Record<string, unknown>;
}

/** A cell's Plot, as its Facet drives it: exports, settling, linked domains and viewports. */
export interface FacetPlot {
  handle: Record<string, unknown> & { gridLinkCompatible?(): boolean };
  initialize(): Promise<void>;
  ready(): boolean;
  snapshot(): FacetCellMemory;
  element(): HTMLElement | undefined;
  setDomain(axis: string, bounds: number[]): void;
}

/** A transform under a Facet: the Facet's settings pane and replay reach it by name. */
export interface FacetTransformHandle {
  subscribe(listener: () => void): () => void;
  update(settings: Record<string, unknown>): void;
  whenSettled(): Promise<void>;
  /** A Force's pane actions (reheat, ...). */
  action?(name: string): void;
}

/** An iterative layout's result a cell keeps while its content is unmounted (a Force's run). */
export type FacetIterativeResult = { dispose(): void } & Record<string, any>;

/** The column identities per axis a mark plots (scales="field" groups domains by them). */
export type FacetAxisColumns = Partial<
  Record<string, readonly string[] | null>
>;

/** One facet cell's service (FACET_CONTEXT). */
export interface FacetService {
  // The cell.
  /** The cell's identity. */
  cell(): FacetCell;
  /** The cell's key (a scene node's runtime key starts with it). */
  key(): string;
  /** An embedded Facet's cell is a Frame in its Plot; otherwise the cell holds its own Plot. */
  readonly embedded: boolean;
  /** Whether the cell is drawn (on screen, forced or embedded): iterative layouts pause otherwise. */
  active(): boolean;
  /** The Facet's options node: connection endpoints select repeated marks by it. */
  scope(): OptionsNode;
  /** The Facet's showExport and menu (TODO 128), which a cell's Plot follows. */
  chrome(): { showExport?: boolean; menu?: boolean };
  /** Which of the cell's axes another cell labels (TODO 136.10 slice 5). */
  inner(): FacetInnerAxes;

  // Slots: a definition's position in its cell, the same in every cell.
  /** The next content slot (a transform's or a mark's). Slots restart when the cell unmounts. */
  slot(): number;
  /** The next frame slot (an embedded cell's frames). */
  frameSlot(): number;

  // The cell's Plot (a cell that holds one).
  /** Registers the cell's Plot; returns its release, which keeps what the Plot remembers. */
  register(plot: FacetPlot): () => void;
  /** What the cell's Plot remembered when it last unmounted. */
  memory(): FacetCellMemory | undefined;
  /** The cell's viewport changed: a linked Facet passes it on to the other cells. */
  changed(viewport: unknown): void;
  /** The viewport the cell shows: its own, or the one its linked axes share. */
  viewport(): any;

  // Frames, domains and scales.
  /** Registers a cell frame under its slot; returns its release. */
  registerFrame(slot: string, entry: unknown): () => void;
  /** Applies the Facet's per-slot axis defaults to a frame's options; returns the release. */
  frameSettings(slot: string, options: OptionsNode): () => void;
  /** A contributor's bounds on an axis ("slot:axis"), null withdrawing them. */
  domain(axis: string, bounds: number[] | null, owner: unknown): void;
  /** The columns a mark (by its domain owner) plots per axis; null withdraws them. */
  axisColumns(owner: unknown, columns: FacetAxisColumns | null): void;
  /** The Facet's whole data when a scale family is shared across cells, else null. */
  sharedSource(family: string): NamedScope | null;
  /** A field's extent over every cell after `pipeline` (a shared scale's normalization). */
  scaleExtent(
    pipeline: unknown[],
    field: string,
    transform?: string,
  ): Promise<number[] | null>;
  /** The automatic scale a frame's identity shares across cells, or undefined when independent. */
  autoScale(
    frameKey: string,
    identity: string,
    family: string,
    config: unknown,
  ): any;
  /** Updates the frame's automatic scales' defaults. */
  updateAutoScales(frameKey: string, family: string, config: unknown): void;
  /** The category scale a frame's identity shares across cells, or undefined when independent. */
  autoCategory(
    frameKey: string,
    identity: string,
    family: string,
    palette?: string[],
  ): any;

  // Transforms and marks.
  /** The settings the Facet's pane holds for a named transform. */
  transformSettings(name: string | undefined): Record<string, any> | undefined;
  /** Registers a named transform for the Facet's pane; returns its release. */
  registerTransform(
    name: string | undefined,
    handle: FacetTransformHandle,
  ): (() => void) | undefined;
  /**
   * Runs a transform over the cell's rows. The caller enables `sharedBins` from its definition's
   * capability; then it takes the bins its slot shares across cells first. `interaction`, the revision a
   * run reads, joins the config so the cells' cached pipelines follow it.
   */
  run(
    slot: number,
    kind: string,
    scope: NamedScope,
    config: Record<string, unknown>,
    options: {
      sharedBins?: boolean;
      bins?: unknown;
      interaction?: unknown;
      signal?: AbortSignal;
    },
  ): Promise<DataView>;
  /** Defines a mark's slot for the Facet's shared work (its domains over every cell). */
  define(
    slot: number,
    kind: string,
    props: Record<string, unknown>,
    pipeline: unknown[],
    options: OptionsNode,
  ): Promise<unknown>;
  /** Work the Facet's settling waits for. */
  track<T>(work: Promise<T>): Promise<T>;
  /** Keeps an iterative layout's result for the cell's slot until it mounts again. */
  saveIterative(slot: number, value: Promise<FacetIterativeResult>): void;
  /** Takes the result saveIterative kept, if any. */
  takeIterative(slot: number): Promise<FacetIterativeResult> | undefined;
}

/** A Partition group (PARTITION_CONTEXT): what repeated content knows about its group. */
export interface PartitionGroup {
  readonly key: string;
  readonly values: Record<string, unknown>;
  readonly depth: number;
  readonly label: string;
  /** The group among every enclosing Partition's ("[\"Adelie\"]/[\"Male\"]"). */
  readonly runtimeKey: string;
  /** The group's position among its Partition's groups. */
  readonly ordinal: number;
  /** The enclosing Partitions' positions, then this one's. */
  readonly ordinalPath: readonly number[];
}

/** The facet cell around the caller, if any. Call during component initialization. */
export const facetService = () =>
  getContext<FacetService | undefined>(FACET_CONTEXT);
/** The Partition group around the caller, if any. Call during component initialization. */
export const partitionGroup = () =>
  getContext<PartitionGroup | undefined>(PARTITION_CONTEXT);

/**
 * A cell's service over its Facet's controller (facetCore.svelte), read through the cell's props
 * (`source`): its cell, its controller, whether it is drawn and whether it is embedded. Slots
 * count from 0 again after `resetSlots`, which the cell calls when it unmounts its content.
 */
export function createFacetService(source: {
  cell(): any;
  controller(): any;
  active(): boolean;
  embedded(): boolean;
}): FacetService & { resetSlots(): void } {
  const controller = () => source.controller(),
    cell = () => source.cell();
  let nextSlot = 0,
    nextFrameSlot = 0;
  return {
    cell: () => {
      const { key, row, column, index } = cell();
      return { key, row, column, ordinal: index ?? 0 };
    },
    key: () => cell().key,
    get embedded() {
      return source.embedded();
    },
    active: () => source.active(),
    scope: () => controller().scope,
    chrome: () => controller().chrome(),
    inner: () => controller().inner(cell()),
    slot: () => nextSlot++,
    frameSlot: () => nextFrameSlot++,
    resetSlots() {
      nextSlot = 0;
      nextFrameSlot = 0;
    },
    register: (plot) => controller().register(cell(), plot),
    memory: () => controller().memory(cell()),
    changed: (viewport) => controller().changed(cell(), viewport),
    viewport: () => controller().viewport(cell()),
    registerFrame: (slot, entry) =>
      controller().registerFrame(cell(), slot, entry),
    frameSettings: (slot, options) => controller().frameSettings(slot, options),
    domain: (axis, bounds, owner) =>
      controller().domain(cell(), axis, bounds, owner),
    axisColumns: (owner, columns) => controller().axisColumns(owner, columns),
    sharedSource: (family) =>
      controller().appearanceResolution(family) === "shared"
        ? controller().source
        : null,
    scaleExtent: (pipeline, field, transform) =>
      controller().scaleExtent(pipeline, field, transform),
    autoScale: (frameKey, identity, family, config) =>
      controller().autoScale(frameKey, identity, family, config),
    updateAutoScales: (frameKey, family, config) =>
      controller().updateAutoScales(frameKey, family, config),
    autoCategory: (frameKey, identity, family, palette) =>
      controller().autoCategory(frameKey, identity, family, palette),
    transformSettings: (name) => controller().transformSettings(name),
    registerTransform: (name, handle) =>
      controller().registerTransform(name, handle),
    async run(
      slot,
      kind,
      scope,
      config,
      { sharedBins, bins, interaction, signal },
    ) {
      // Shared facet bins resolve a rule or expression count once, over the union of the
      // cells, so every cell gets the same edges; sharedBins={false} keeps the cell's own.
      const resolved = sharedBins
        ? await controller().bins(
            cell(),
            slot,
            kind,
            scope,
            { ...config, bins },
            signal,
          )
        : config;
      return controller().transform(
        cell(),
        kind,
        scope,
        interaction === undefined
          ? resolved
          : { ...resolved, __interaction: interaction },
      );
    },
    define: (slot, kind, markProps, pipeline, options) =>
      controller().define(cell(), slot, kind, markProps, pipeline, options),
    track: (work) => controller().track(work),
    saveIterative: (slot, value) =>
      controller().saveIterative(cell(), slot, value),
    takeIterative: (slot) => controller().takeIterative(cell(), slot),
  };
}
