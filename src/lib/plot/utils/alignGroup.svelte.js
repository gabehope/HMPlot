// @ts-check
/**
 * Alignment groups (TODO 136.10 slice 5): the Plots laid out by one Row, Column or LayoutGrid
 * (or a Scene's own column) line up their plot areas. A Plot reports its own gutters (what its
 * axes need) and where its figure and canvas sit in the layout; two Plots whose figures share an
 * edge (side by side in a Row share the top, stacked in a Column the left) share that side's
 * plot-area line, the innermost of their own lines. A title or legend that moves one Plot's
 * canvas moves its line, so the areas line up on the page, not just inside the canvases.
 */
import { SvelteMap } from "svelte/reactivity";

/** The group a layout gives its direct children; a Plot among them joins it. */
export const ALIGN_GROUP = Symbol("hmplot-align-group");
/** The group a Plot joins (null outside one, and for anything deeper than a direct child). */
export const ALIGN_MEMBER = Symbol("hmplot-align-member");

/** Figures whose edges are this close share a line. */
const EDGE = 1;

/**
 * @typedef {{ left: number, right: number, top: number, bottom: number }} Box
 * @typedef {{ figure: Box, canvas: Box, gutters: Box }} AlignEntry Boxes in the group's
 * coordinates; gutters are the Plot's own (before alignment), auto sides only.
 */

/** @param {() => Element | null | undefined} element The layout's element. */
export function createAlignGroup(element) {
  /** @type {SvelteMap<object, AlignEntry>} */
  const entries = new SvelteMap();
  // The layout's size: a wrapped Row that rewraps, or a grid row pushed down, moves figures
  // whose canvases keep their size, so every member measures again (watch).
  let revision = $state(0);
  /** A box in the group's coordinates. @param {Element} el */
  function measure(el) {
    const box = el.getBoundingClientRect(),
      origin = element()?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      left: box.left - origin.left,
      right: box.right - origin.left,
      top: box.top - origin.top,
      bottom: box.bottom - origin.top,
    };
  }
  return {
    /** Watch the layout's element for size changes. @param {Element} el */
    watch(el) {
      if (typeof ResizeObserver === "undefined") return () => {};
      const observer = new ResizeObserver(() => revision++);
      observer.observe(el);
      return () => observer.disconnect();
    },
    join() {
      const key = {};
      return {
        measure,
        /** Changes when the layout's size does: a member's cue to measure again. */
        get revision() {
          return revision;
        },
        /** @param {AlignEntry | null} entry */
        report(entry) {
          if (!entry) {
            entries.delete(key);
            return;
          }
          if (JSON.stringify(entries.get(key)) !== JSON.stringify(entry))
            entries.set(key, entry);
        },
        leave() {
          entries.delete(key);
        },
        /**
         * The plot-area lines this Plot shares with the others, in its canvas's pixels: the
         * gutter each side needs to meet them (undefined where no other figure shares the edge).
         * @param {{ figure: Box, canvas: Box }} own
         * @returns {Partial<Box>}
         */
        gutters(own) {
          /** @type {Partial<Box>} */
          const out = {};
          for (const [other, entry] of entries) {
            if (other === key) continue;
            const { figure, canvas, gutters } = entry;
            for (const side of /** @type {const} */ ([
              "left",
              "right",
              "top",
              "bottom",
            ])) {
              if (
                Math.abs(figure[side] - own.figure[side]) > EDGE ||
                !(side in gutters)
              )
                continue;
              const far = side === "right" || side === "bottom";
              // The other's area line, measured from this canvas's same edge.
              const need = far
                ? own.canvas[side] - (canvas[side] - gutters[side])
                : canvas[side] + gutters[side] - own.canvas[side];
              out[side] = Math.max(out[side] ?? -Infinity, need);
            }
          }
          return out;
        },
      };
    },
  };
}
