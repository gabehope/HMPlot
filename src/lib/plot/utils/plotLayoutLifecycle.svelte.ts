/**
 * The plot area's layout lifecycle (TODO 136.10): the one owner of when a Plot's solved gutters
 * reach the readers of its rectangle (the camera's fit, the axes, the overlay; plotGutters).
 *
 * The solver (plotLayout) says what the axes need for a given frame. This owns the rest:
 * - measurement: the fonts the solver measures in, and whether they have loaded;
 * - motion state: measuring, stable, gesture or transition, and what each lets a side do;
 * - publication: the gutters and stacked-axis offsets the plot draws with, at most once a frame;
 * - settling: whether a solve is still on its way to the frame the camera draws.
 *
 * The camera refits to the published gutters, which moves the ticks they were measured for (a
 * domain padded for its pixels, a tick that trades places with the gutter), and the next frame
 * solves again. Published a frame apart, that converges instead of looping, and the motion rules
 * keep it from oscillating:
 * - stable: navigation (a zoom, a pan, the refit that follows) only grows a side, when its labels
 *   no longer fit, and keeps the room after: shorter labels need no change, and the area holding
 *   still matters more than the whitespace (the maintainer's policy, 2026-10-16). A change to what
 *   the axes measure (a canvas size, a font arriving, a style, the axes shown, the margins, the
 *   data's domains) solves afresh, so the result does not depend on what the plot showed before;
 *   With dynamic margins disabled, the converged own margins stay fixed for camera-only
 *   navigation; the same measured-input changes still refit, and alignment peers still apply.
 * - gesture (a drag or a wheel burst): the auto sides keep their published widths, and a label
 *   that outgrows one runs past it until the solve at rest;
 * - transition (one runs on the view's clock): sides only grow, shrinking once it ends;
 * - measuring: nothing is published yet at this canvas size; the solve is taken as it is.
 * whenSettled waits for the axis fonts as well as for the frame the camera draws.
 */
import { untrack } from "svelte";
import { fontReady } from "./defaultFont.js";
import { SIDES } from "./plotLayout.js";

export type Side = (typeof SIDES)[number];
export type Gutters = Record<Side, number>;
export type Margins = Record<string, number | "auto">;
export type LayoutState = "measuring" | "stable" | "gesture" | "transition";
type Box = Gutters;
type Boxes = { figure: Box; canvas: Box };

/** The alignment group a Plot joined (utils/alignGroup), or null. */
export type AlignMember = {
  readonly revision: number;
  measure(element: Element): Box;
  report(entry: (Boxes & { gutters: Partial<Box> }) | null): void;
  gutters(own: Boxes): Partial<Box>;
} | null;

/** What the owner reads from its Plot. */
export interface LayoutHost {
  /** Whether a gesture moves the view (reactive). */
  gesture(): boolean;
  /** Whether camera-only navigation can change the plot's own auto margins. */
  dynamic(): boolean;
  /** The view's animation clock, once it has one. */
  clock(): {
    readonly scope: { frozen: boolean };
    pending(): boolean;
    finished(): Promise<unknown>;
  } | null;
  /** The canvas's size in CSS pixels. */
  size(): { width: number; height: number };
  /** The gutters the readers have now, and a new set for them (undefined: none solved). */
  read(): unknown;
  write(gutters: Gutters | undefined): void;
  /** Whether a side's margin is pinned to a number. */
  pinned(side: Side): boolean;
  /** The figure and canvas elements the alignment group measures. */
  elements(): { figure: Element; canvas: Element } | null;
  align: AlignMember;
  /** The share of a side's length a gutter takes at most (plotLayout's MAX_SHARE). */
  maxShare: number;
}

/** A solve, with the gutters the plot draws with. */
export interface Placed {
  /** The plot's own gutters after the motion rules, before its alignment group. */
  own: Gutters;
  /** The gutters it draws with. */
  placed: Gutters;
  /** During a gesture, the published gutters the area keeps (null otherwise). */
  frozen: Gutters | null;
  /** The stacked axes' offsets, still with frozen gutters. */
  offsets: Record<string, number> | null;
}

/** What a layout hands to publication. */
export interface Publication {
  gutters: Gutters;
  own: Gutters | null;
  offsets: Record<string, number> | null;
  /** Whether the plot reports its gutters to its alignment group (not a polar or globe plot). */
  aligns: boolean;
}

const sizeKey = (size: { width: number; height: number }) =>
  `${size.width}x${size.height}`;

export class LayoutLifecycle {
  #host: LayoutHost;
  /** Bumped when a transition ends, so the layout solves again and a side can shrink. */
  #rest = $state(0);
  /** Bumped when a font the axes measure in loads. */
  #fontRevision = $state(0);
  #fontsLoading = $state(0);
  /** Where the figure and canvas sit in the alignment group (measured at rest). */
  #boxes = $state.raw<Boxes | null>(null);
  // What was published: the gutters drawn with and the plot's own, for which
  // canvas size and measured inputs, and the stacked axes' offsets.
  #gutters: Gutters | null = null;
  #own: Gutters | null = null;
  #size = "";
  #inputs = "";
  // The completed initial fit for the current measured inputs. Alignment is applied afterward.
  #fixed: { inputs: string; size: string; gutters: Gutters } | null = null;
  #offsets: Record<string, number> | null = null;
  // Whether the latest solve measured a frame the camera drew with other gutters than the
  // published ones (or at another size): it is not a rest the stable rules damp.
  #stale = false;
  // The latest layout, published on the next frame.
  #next: (Publication & { inputs: string }) | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #frame = 0;
  #restWaiting = false;
  #destroyed = false;
  #context: CanvasRenderingContext2D | null | undefined;
  #loads: Promise<unknown> = Promise.resolve();

  constructor(host: LayoutHost) {
    this.#host = host;
  }

  /** The motion state a solve at this size is placed in, which decides the rules it follows. */
  #state(size: string): LayoutState {
    if (this.#host.gesture()) return "gesture";
    if (!this.#own || this.#size !== size) return "measuring";
    return this.#transitioning() ? "transition" : "stable";
  }

  /**
   * Read by a solve, so it reruns when a font arrives or a transition ends. A string: the
   * measured inputs' key includes it, so a font that arrives solves afresh.
   */
  get revision() {
    this.#rest;
    return String(this.#fontRevision);
  }

  // Measurement.

  /** Loads the fonts the axes measure in; each one that arrives solves again. Call from an effect. */
  loadFonts(fonts: string[]) {
    let live = true;
    const loads = fonts.map((font) =>
      fontReady(font)
        .catch(() => undefined)
        .then(() => {
          if (!live) return;
          this.#fontsLoading--;
          this.#fontRevision++;
        }),
    );
    untrack(() => (this.#fontsLoading = fonts.length));
    this.#loads = Promise.all(loads);
    return () => {
      live = false;
    };
  }

  /** Resolves when the fonts the axes measure in have loaded (or failed to). */
  async fontsLoaded() {
    let loads;
    do await (loads = this.#loads);
    while (loads !== this.#loads);
  }

  /** A text's width in pixels, in a CSS font. */
  measure = (text: string, font: string) => {
    this.#context ??=
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
    if (!this.#context) return 0.6 * (parseFloat(font) || 11) * text.length;
    this.#context.font = font;
    return this.#context.measureText(text).width;
  };

  // Motion rules.

  /**
   * The gutters to draw with from a solve: its own after the motion rules, frozen during a
   * gesture, and widened to meet the plot-area lines of its alignment group (as far as a side's
   * share of the canvas allows). Pinned sides stay as pinned. `inputs` keys what the solve
   * measured, other than the frame the camera drew: the motion rules hold only while it is the
   * one published.
   */
  place(
    solved: Gutters,
    {
      margins,
      inputs,
      offsets = null,
      aligns = true,
      drawn = null,
    }: {
      margins: Margins;
      inputs: string;
      offsets?: Record<string, number> | null;
      aligns?: boolean;
      /** The area of the frame the solve measured, in canvas pixels (left, top, right, bottom). */
      drawn?: Box | null;
    },
  ): Placed {
    const host = this.#host,
      { width, height } = host.size(),
      size = sizeKey({ width, height }),
      auto = SIDES.filter((side) => typeof margins[side] !== "number"),
      state = this.#state(size),
      published = this.#gutters;
    // The camera refits to published gutters a frame after they are published: a solve before
    // the refit measured the frame of the gutters before them (a legend strip that arrives takes
    // height from the canvas, and the first solve at the new size reads the old fit).
    this.#stale =
      state === "measuring" ||
      Boolean(
        drawn &&
          published &&
          SIDES.some(
            (side) =>
              Math.abs(
                (side === "left" || side === "top"
                  ? drawn[side]
                  : (side === "right" ? width : height) - drawn[side]) -
                  published[side],
              ) > 0.5,
          ),
      );
    // During a gesture its own gutters follow the rules at rest (they are kept, not drawn).
    const own =
        state === "measuring"
          ? solved
          : this.#steady(solved, margins, inputs, state === "transition"),
      placed = { ...own };
    const frozen =
      state === "gesture" && this.#gutters && this.#size === size
        ? { ...this.#gutters }
        : null;
    if (frozen) {
      for (const side of auto) placed[side] = frozen[side];
      return { own, placed, frozen, offsets: this.#offsets ?? offsets };
    }
    const boxes = this.#boxes,
      member = host.align;
    if (aligns && member && boxes) {
      const shared = member.gutters(boxes);
      for (const side of auto)
        if (shared[side] !== undefined)
          placed[side] = Math.min(
            Math.max(own[side], shared[side]!),
            (side === "left" || side === "right" ? width : height) *
              host.maxShare,
          );
    }
    return { own, placed, frozen: null, offsets };
  }

  // Stable: while the measured inputs are the ones published (only the camera moved), a side
  // never shrinks; a change to them solves afresh. In a transition, sides only grow.
  #steady(next: Gutters, margins: Margins, inputs: string, growing: boolean) {
    this.#rest;
    const size = sizeKey(this.#host.size());
    if (
      this.#host.dynamic() ||
      this.#fixed?.inputs !== inputs ||
      this.#fixed?.size !== size
    )
      this.#fixed = null;
    const before = this.#own!,
      damped = this.#inputs === inputs && !this.#stale,
      steady = { ...next };
    for (const side of SIDES) {
      if (typeof margins[side] !== "number" && this.#fixed) {
        steady[side] = this.#fixed.gutters[side];
        continue;
      }
      const value = next[side];
      if (typeof margins[side] === "number" || value >= before[side]) continue;
      if (growing || damped) steady[side] = before[side];
    }
    // Do not freeze the first estimate: let the camera/refit loop converge with loaded fonts.
    // Compare the placed own margins, including the normal no-shrink policy, so an initially
    // generous fit can settle too. The alignment group's contribution is not part of this fit.
    if (
      !this.#host.dynamic() &&
      !this.#fixed &&
      damped &&
      !growing &&
      this.#fontsLoading === 0 &&
      SIDES.every((side) => Math.abs(steady[side] - before[side]) <= 0.5)
    )
      this.#fixed = { inputs, size, gutters: { ...steady } };
    return steady;
  }

  // Whether a transition (not a procedural @time track) runs on the view's clock; when it
  // finishes, the layout solves again so a side can shrink.
  #transitioning() {
    const clock = this.#host.clock();
    // A frozen clock's wait resolves at once: nothing moves until it resumes.
    if (!clock || clock.scope.frozen || !clock.pending()) return false;
    if (!this.#restWaiting) {
      this.#restWaiting = true;
      clock.finished().then(() => {
        this.#restWaiting = false;
        if (!this.#destroyed) this.#rest++;
      });
    }
    return true;
  }

  // Publication.

  /**
   * Hands a layout (null: none) to publication on the next frame, or after 50 ms on a hidden
   * page, which draws no frames.
   */
  request(next: (Publication & { inputs: string }) | null) {
    this.#next = next;
    if (this.#timer) return;
    this.#timer = setTimeout(this.#publish, 50);
    this.#frame = requestAnimationFrame(this.#publish);
  }

  #publish = () => {
    if (this.#timer) clearTimeout(this.#timer);
    cancelAnimationFrame(this.#frame);
    this.#timer = null;
    this.#frame = 0;
    const host = this.#host,
      next = this.#next,
      gesture = host.gesture(),
      gutters = next?.gutters ?? null,
      own = next?.own ?? null;
    // The plot's own gutters, kept for the motion rules and reported to its alignment group,
    // once at rest: the group would otherwise move its other Plots under this one's gesture.
    if (!gesture) {
      if (own) {
        this.#own = own;
        this.#size = sizeKey(host.size());
        // What a transition passes through is not a rest it damps: the solve once it ends
        // compares with the inputs before it. Nor is a solve of a stale frame: the one after the
        // refit is taken afresh, so a side can shrink to what the refit frame needs.
        if (this.#stale) this.#inputs = "";
        else if (!this.#transitioning()) this.#inputs = next!.inputs;
      }
      this.#offsets = next?.offsets ?? null;
      this.#report(own, next?.aligns ?? true);
    }
    if (JSON.stringify(host.read()) === JSON.stringify(gutters)) return;
    if (gutters) this.#gutters = gutters;
    host.write(gutters ?? undefined);
  };

  #report(own: Gutters | null, aligns: boolean) {
    const host = this.#host,
      member = host.align,
      elements = host.elements();
    if (!member || !elements) return;
    const boxes = {
      figure: member.measure(elements.figure),
      canvas: member.measure(elements.canvas),
    };
    if (JSON.stringify(boxes) !== JSON.stringify(this.#boxes))
      this.#boxes = boxes;
    const auto =
      own && aligns
        ? Object.fromEntries(
            SIDES.filter((side) => !host.pinned(side)).map((side) => [
              side,
              own[side],
            ]),
          )
        : null;
    member.report(auto && { ...boxes, gutters: auto });
  }

  // Settling.

  /**
   * Whether the layout is still on its way to the frame the camera draws: a publication is
   * scheduled, a font the axes measure in is loading, or the area solved from the last frame (its
   * sides in canvas pixels) is not the one it was drawn in.
   */
  pending(area?: Box | null, drawn?: Box | null) {
    if (this.#timer || this.#fontsLoading > 0) return true;
    if (!area || !drawn) return false;
    return SIDES.some((side) => Math.abs(area[side] - drawn[side]) > 0.5);
  }

  destroy() {
    this.#destroyed = true;
    if (this.#timer) clearTimeout(this.#timer);
    if (typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(this.#frame);
  }
}
