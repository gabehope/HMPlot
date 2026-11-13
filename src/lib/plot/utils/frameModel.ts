/**
 * A view's frame model (Stage 119.1; docs/REFACTOR-PLAN-2026-10-09.md, P7a): which frame is the
 * coordinate root, each frame's parent, and which frame owns each of its dimensions. viewCore
 * creates one per view and hands it to the frames under it (FrameContext.model); consumers ask it
 * instead of reconstructing ownership from flags and option fallbacks.
 *
 * Three facts live here:
 * - The logical content tree (ROOT_CONTENT_CONTEXT): marks, wrappers that prepare their children
 *   asynchronously (pendingRootContent), and Frames, keyed by component ownership rather than
 *   DOM or registration order. selectRootFrame (rootFrameSelection.js) picks the root from it.
 * - The published root: the logical key of the promoted Frame, or null for the Plot's implicit
 *   root. viewCore publishes a selection after the content settles (activate), and settlement
 *   waits for that (whenPublished).
 * - The registered frames (FrameEntry), their parents and their per-dimension ownership
 *   (frameOwnership, which each frame attaches to its options as frameDefinition.owns).
 *
 * The state is held in cells the owner supplies, so a component's reads track it (viewCore
 * passes $state cells) while node tests use plain ones.
 */
import type {
  AxisName,
  FrameEntry,
  FrameOptions,
  Release,
  RootContentContext,
  RootContentEntry,
} from "./internalTypes.js";
import { frameDimensionMode } from "./frameMapping.js";
import { selectRootFrame } from "./rootFrameSelection.js";

/** One value the model reads and writes; a component's cell makes its reads reactive. */
export interface Cell<T> {
  get(): T;
  set(value: T): void;
}
export type CellFactory = <T>(value: T) => Cell<T>;

/** A plain (non-reactive) cell, for tests and noncomponent owners. */
export const plainCell: CellFactory = <T>(value: T): Cell<T> => {
  let current = value;
  return {
    get: () => current,
    set: (next) => {
      current = next;
    },
  };
};

/**
 * How a frame holds one dimension:
 * - "local": it owns the scale (a root frame, or a child that sets a domain, range, transform
 *   or scale for it);
 * - "inherited": a child that sets none of those reads its parent's scale, and its marks'
 *   domains count in the frame that owns it;
 * - "adopted": the promoted root Frame owns a dimension it does not configure, starting from the
 *   Plot's settings: an explicit Plot domain holds instead of its marks' extents, and its axis
 *   draws when the Plot's 2D axes do.
 */
export type DimensionMode = "local" | "inherited" | "adopted";

/** The part of an axis configuration ({x: {...}}) that decides ownership. */
export interface DimensionConfig {
  domain?: unknown;
  range?: unknown;
  transform?: unknown;
  scale?: unknown;
  [key: string]: unknown;
}

/**
 * Whether a child frame's configuration of a dimension gives it its own scale: a domain, range,
 * transform or scale (frameDimensionMode, which createFrameDimension shares).
 */
export function configuresScale(config: DimensionConfig | undefined): boolean {
  return frameDimensionMode(config ?? {}, true) === "local";
}

/**
 * A frame's mode for one dimension. `nested` is whether the frame sits inside another frame (the
 * Plot's implicit root, for a top-level Frame), `promoted` whether it is the published root.
 */
export function dimensionMode(
  config: DimensionConfig | undefined,
  { nested, promoted }: { nested: boolean; promoted: boolean },
): DimensionMode {
  if (!nested || configuresScale(config)) return "local";
  return promoted ? "adopted" : "inherited";
}

/** What a frame tells frameOwnership about itself; read on every query. */
export interface FrameOwnershipState {
  nested: boolean;
  promoted: boolean;
  config: Partial<Record<AxisName, DimensionConfig>>;
}
export interface FrameOwnership {
  mode(axis: AxisName): DimensionMode;
  /** Whether the frame owns the dimension's scale (it is "local" or "adopted"). */
  owns(axis: AxisName): boolean;
  /** Whether it takes the dimension from the Plot's settings (mode "adopted"). */
  adopts(axis: AxisName): boolean;
}

/** One frame's per-dimension ownership, over its current state. */
export function frameOwnership(
  read: () => FrameOwnershipState,
): FrameOwnership {
  const mode = (axis: AxisName) => {
    const state = read();
    return dimensionMode(state.config[axis], state);
  };
  return {
    mode,
    owns: (axis) => mode(axis) !== "inherited",
    adopts: (axis) => mode(axis) === "adopted",
  };
}

/** The Frame props that decide whether it can be promoted to the Plot's root. */
export interface FrameCandidateProps {
  x?: DimensionConfig;
  y?: DimensionConfig;
  z?: DimensionConfig;
  placement?: unknown;
  /** An embedded Facet's cell frame. */
  _facetCell?: boolean;
}

/**
 * Register a Frame in its owner's logical content (ROOT_CONTENT_CONTEXT). A ranged or placed
 * Frame, or a facet cell, is never promoted (selectRootFrame). Returns its logical key, the
 * context its children register in, and its release; `changed` tells the owner after the props
 * that decide promotion change.
 */
export function registerFrameContent(
  owner: RootContentContext | undefined,
  props: () => FrameCandidateProps,
): {
  key: string;
  context: RootContentContext | undefined;
  changed(): void;
  release: Release;
} {
  const key = crypto.randomUUID();
  const release =
    owner?.register({
      kind: "frame",
      key,
      parentKey: owner.parentKey,
      get ranged() {
        const { x, y, z } = props();
        return [x, y, z].some((config) => config?.range !== undefined);
      },
      get placed() {
        return props().placement !== undefined;
      },
      get spatial() {
        return props()._facetCell === true;
      },
    }) ?? (() => {});
  return {
    key,
    context: owner && { ...owner, parentKey: key },
    changed: () => owner?.changed(),
    release,
  };
}

/** A registered frame's ownership as frameDefinition carries it (absent: it owns everything). */
const definitionOwns = (options: FrameOptions | undefined, axis: AxisName) =>
  options?.frameDefinition?.owns(axis) ?? true;
/**
 * Whether a frame plots `axis` in the root's coordinates: it inherits the axis, and so does each
 * frame between it and the root (a Frame inside a twin that owns its y uses the twin's y).
 */
function inheritsFromRoot(options: FrameOptions | undefined, axis: AxisName) {
  let node = options;
  if (!node?.frameDefinition?.parent) return false;
  while (node?.frameDefinition?.parent) {
    if (definitionOwns(node, axis)) return false;
    node = node.frameDefinition.parent;
  }
  return true;
}

export interface FrameModel {
  /** The Plot's ROOT_CONTENT_CONTEXT: its children register their logical content here. */
  readonly content: RootContentContext;
  /** The registered logical content, in registration order. */
  entries(): readonly RootContentEntry[];
  /**
   * The root the content selects: a Frame's logical key, null for the implicit root, undefined
   * while a wrapper's children are pending.
   */
  selectedRoot(): string | null | undefined;
  /** The published root: a promoted Frame's logical key, or null. */
  activeRoot(): string | null;
  /** Publish `key` as the root; false when it already is. */
  activate(key: string | null): boolean;
  /** Resolves once the content's selection is settled and published. */
  whenPublished(): Promise<void>;
  /** Whether the Frame with this logical key is the published root. */
  isRoot(logicalKey: string | null | undefined): boolean;

  /** The registered frames, in registration order (the implicit root first). */
  frames(): readonly FrameEntry[];
  /** Register a frame: it gets its slot and is listed until the release. */
  registerFrame(entry: FrameEntry): Release;
  /** A registered frame's layout, guides, titles or parent changed. */
  framesChanged(): void;
  /** The frame acting as the root: the promoted Frame, else the implicit root. */
  rootFrame(): FrameEntry | undefined;
  /** The Plot's own frame (the implicit root, which has no logical key), once registered. */
  implicitRoot(): FrameEntry | undefined;
  /** The promoted Frame's options, or null while the implicit root is the root. */
  promotedOptions(): FrameOptions | null;
  /** A frame's parent key: none for a root, else its enclosing frame's. */
  parentKey(entry: {
    parentFrameKey: string | null;
    promoted: boolean;
  }): string | null;
  /** Whether a registered frame owns its dimension (else it inherits it from its parent). */
  owns(entry: FrameEntry, axis: AxisName): boolean;
  /** Whether a child frame reads the dimension from its parent. */
  inherits(entry: FrameEntry, axis: AxisName): boolean;

  /**
   * Whether anything plots in the implicit root's coordinates: content directly in the Plot, or
   * a child frame drawn on the root's sides that inherits its x or y (a twin axis).
   */
  implicitRootUsed(): boolean;
  /** Whether anything plots on the implicit root's `axis`, as implicitRootUsed for one axis. */
  implicitRootUses(axis: AxisName): boolean;
  /** viewCore's verdict that the implicit root's axes have nothing to show (rootUnused). */
  setImplicitRootUnused(unused: boolean): void;
  /**
   * viewCore's verdict on single axes of a used root: twin Frames that each own their y but
   * share the root's x leave its y with nothing to show (TODO 134.13).
   */
  setImplicitRootUnusedAxes(axes: readonly AxisName[]): void;
  /** Whether the implicit root draws its `axis` (not one viewCore found unused). */
  implicitRootShows(axis: AxisName): boolean;
  /** Whether the implicit root is the root and draws in its coordinates. */
  implicitRootActive(): boolean;
}

export function createFrameModel({
  cell = plainCell,
}: { cell?: CellFactory } = {}): FrameModel {
  const entries = cell<readonly RootContentEntry[]>([]);
  const frames = cell<readonly FrameEntry[]>([]);
  const active = cell<string | null>(null);
  const rootUnused = cell(false);
  const rootUnusedAxes = cell<readonly AxisName[]>([]);
  const waiters = new Set<() => void>();
  let nextSlot = 0;
  const notify = () => {
    for (const check of [...waiters]) check();
  };
  const content: RootContentContext = {
    parentKey: null,
    register(entry) {
      entries.set([...entries.get(), entry]);
      notify();
      return () => {
        entries.set(entries.get().filter((item) => item !== entry));
        notify();
      };
    },
    changed() {
      entries.set([...entries.get()]);
      notify();
    },
  };
  const owns = (entry: FrameEntry, axis: AxisName) =>
    definitionOwns(entry.options, axis);
  const model: FrameModel = {
    content,
    entries: () => entries.get(),
    selectedRoot: () => selectRootFrame(entries.get()),
    activeRoot: () => active.get(),
    activate(key) {
      if (active.get() === key) return false;
      active.set(key);
      notify();
      return true;
    },
    whenPublished: () =>
      new Promise<void>((resolve) => {
        const check = () => {
          const selected = selectRootFrame(entries.get());
          if (selected === undefined || active.get() !== selected) return;
          waiters.delete(check);
          resolve();
        };
        waiters.add(check);
        check();
      }),
    isRoot: (logicalKey) => logicalKey != null && active.get() === logicalKey,

    frames: () => frames.get(),
    registerFrame(entry) {
      entry.slot = nextSlot++;
      frames.set([...frames.get(), entry]);
      return () => {
        frames.set(frames.get().filter((item) => item !== entry));
      };
    },
    framesChanged() {
      frames.set([...frames.get()]);
    },
    rootFrame() {
      const key = active.get(),
        list = frames.get();
      return list.find((frame) => frame.logicalKey === key) ?? list[0];
    },
    implicitRoot: () => frames.get().find((frame) => frame.logicalKey == null),
    promotedOptions() {
      const key = active.get();
      if (key == null) return null;
      return (
        frames.get().find((frame) => frame.logicalKey === key)?.options ?? null
      );
    },
    parentKey: ({ parentFrameKey, promoted }) =>
      promoted ? null : parentFrameKey,
    owns,
    inherits: (entry, axis) => entry.parentKey != null && !owns(entry, axis),

    implicitRootUsed: () =>
      model.implicitRootUses("x") || model.implicitRootUses("y"),
    implicitRootUses: (axis) =>
      entries
        .get()
        .some((entry) => entry.parentKey == null && entry.kind === "content") ||
      frames
        .get()
        .some(
          (frame) =>
            !frame.spatial &&
            frame.parentKey != null &&
            inheritsFromRoot(frame.options, axis),
        ),
    setImplicitRootUnused: (unused) => rootUnused.set(unused),
    setImplicitRootUnusedAxes(axes) {
      const current = rootUnusedAxes.get();
      if (
        axes.length !== current.length ||
        axes.some((axis, i) => axis !== current[i])
      )
        rootUnusedAxes.set(axes);
    },
    implicitRootShows: (axis) => !rootUnusedAxes.get().includes(axis),
    implicitRootActive: () => active.get() == null && !rootUnused.get(),
  };
  return model;
}
