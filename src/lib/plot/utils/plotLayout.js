// @ts-check
import { DEFAULT_FONT } from "./defaultFont.js";
import { countWork } from "./workCounters.js";

/**
 * The layout solver (TODO 136.10): a 2D plot's gutters as outputs, not inputs. Pure: the canvas,
 * the axes (a side, tick sizes, a function giving the tick labels for a span, a title), a text
 * measure and the pinned margins in; the plot area, its gutters and each axis's offset out.
 *
 * Gutters and ticks depend on each other: ticks are chosen for the plot's own area (TODO
 * 134.12), and their labels decide how much room the area leaves. So the solver runs a short
 * fixed point: ticks for the area, measure them, the gutters they need, a new area; until the
 * gutters stop changing. A side whose margin is a number is pinned to it; "auto" measures it.
 *
 * Labels are measured where axisOverlayContent draws them: rotated about the point their
 * text is placed at, with the glyphs a font size above the baseline and DESCENT below it.
 *
 * Slice 1 of 136.10: the solver alone; viewCore and the other rectangle consumers read it from
 * slice 2. Legend and title slots, the motion rules, alignment groups and the overflow policy
 * are later slices.
 */

export const SIDES = /** @type {const} */ (["left", "right", "top", "bottom"]);
/** The share of the canvas a side takes at most (as the camera's plotRectangle bounds it). */
export const MAX_SHARE = 0.45;
/** Rounds of the fixed point at most; a plot usually settles in two or three. */
export const MAX_ITERATIONS = 8;
/** Rounds after which the gutters only grow, so a run that oscillates still ends. */
const FREE_ITERATIONS = 3;
/** Between a stacked axis's text and the next axis line on the same side. */
const STACK_GAP = 8;
/** Between a datetime axis's two rows of labels (TODO 53.4). */
const ROW_GAP = 2;
/** Below the baseline, in font sizes (labelMargin's allowance for descenders). */
const DESCENT = 0.3;
/** A y label's baseline below its tick (the overlay's dy=".32em"). */
const Y_BASELINE = 0.32;

/** @typedef {"left" | "right" | "top" | "bottom"} Side */
/** @typedef {Record<Side, number>} Gutters */
/**
 * A tick label: its text, `at` its tick's position along the axis in canvas pixels (x from the
 * left, y from the top), and `row` 1 for a datetime axis's second row of context labels.
 * @typedef {{ text: string, at: number, row?: number }} TickLabel
 */
/**
 * One axis line on a side of the plot area. Only what takes room outside the area is described:
 * leave out `ticks` when tick labels are hidden or drawn inside, and `title` when the title is
 * inside.
 * @typedef {object} AxisSpec
 * @property {Side} side
 * @property {number} [tickSize] the ticks' length on the labels' side (0 when they point inside)
 * @property {number} [labelOffset] between the ticks and their labels
 * @property {number} [labelAngle] in degrees, clockwise as SVG rotates
 * @property {"auto" | "start" | "middle" | "end"} [labelAlign] the labels' text-anchor, as the
 *   axis's tickLabelAlign; "auto" is middle on x, end on a left axis and start on a right one
 * @property {number} [fontSize]
 * @property {string} [font] passed to `measure`
 * @property {(span: [number, number]) => TickLabel[]} [ticks] the labels drawn for the area's
 *   span along the axis, in canvas pixels ([left, right] for x, [top, bottom] for y)
 * @property {{ text: string, offset?: number, angle?: number, fontSize?: number, font?: string }} [title]
 *   an outside title; its angle defaults to -90 on a vertical axis
 */
/**
 * @typedef {object} LayoutInput
 * @property {number} width the canvas, in CSS pixels
 * @property {number} height
 * @property {Partial<Record<Side, number | "auto" | null>>} [margins] a number pins a side;
 *   "auto", null or nothing measures it
 * @property {AxisSpec[]} [axes] in stacking order: an axis lies outside the ones before it on its side
 * @property {(text: string, font: string) => number} measure a text's width in pixels
 * @property {number} [padding] kept between measured text and the canvas's edge
 */
/**
 * @typedef {object} PlotLayout
 * @property {{ left: number, top: number, right: number, bottom: number, width: number, height: number }} area
 *   the plot area in canvas pixels (`right` and `bottom` are coordinates, as in viewCore's layout)
 * @property {Gutters} gutters
 * @property {{ side: Side, offset: number, depth: number }[]} axes per input axis: its line's
 *   distance outside the area's edge, and the depth of its ticks, labels and title
 * @property {number} iterations the rounds of tick choice and measurement
 * @property {boolean} converged false when the run stopped at MAX_ITERATIONS. A side bounded at
 *   MAX_SHARE of the canvas still converges; labels past it clip.
 * @property {Side[]} overflow the measured sides whose axes need more than MAX_SHARE of the
 *   canvas: their labels or titles clip (the overflow policy, slice 6; the view warns).
 */

const vertical = (/** @type {Side} */ side) =>
  side === "left" || side === "right";
const label = (/** @type {Side} */ side) =>
  "axisMargin" + side[0].toUpperCase() + side.slice(1);

/**
 * The box a text's glyphs cover around the point it is drawn and rotated at (SVG axes, y down):
 * `anchor` its text-anchor, `baseline` the baseline below that point.
 * @param {number} w @param {number} size @param {string} anchor @param {number} baseline
 * @param {number} degrees
 */
function textBox(w, size, anchor, baseline, degrees) {
  const angle = (degrees * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    u0 = anchor === "start" ? 0 : anchor === "end" ? -w : -w / 2,
    xs = [],
    ys = [];
  for (const u of [u0, u0 + w])
    for (const v of [baseline - size, baseline + DESCENT * size]) {
      xs.push(u * cos - v * sin);
      ys.push(u * sin + v * cos);
    }
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/**
 * Check a Plot's axisMargin* props: each "auto", a number of pixels of at least 0, or absent.
 * @param {Record<string, unknown>} props
 */
export function validateMargins(props) {
  for (const side of SIDES) {
    const key = label(side),
      margin = props[key] ?? "auto";
    if (
      margin !== "auto" &&
      !(typeof margin === "number" && Number.isFinite(margin) && margin >= 0)
    )
      throw Error(
        `Plot: ${key} must be "auto" or a number of pixels of at least 0, got ${JSON.stringify(margin)}.`,
      );
  }
}

/**
 * @param {LayoutInput} input
 * @returns {PlotLayout}
 */
export function solveLayout({
  width,
  height,
  margins = {},
  axes = [],
  measure,
  padding = 2,
}) {
  countWork("solveLayout");
  if (!(
    Number.isFinite(width) &&
    width >= 0 &&
    Number.isFinite(height) &&
    height >= 0
  ))
    throw Error(
      `Plot: the layout needs the canvas's width and height in pixels, got ${width} by ${height}.`,
    );
  validateMargins(
    Object.fromEntries(SIDES.map((side) => [label(side), margins[side]])),
  );
  /** @type {Partial<Gutters>} the pinned sides */
  const pins = {};
  for (const side of SIDES) {
    const margin = margins[side];
    if (typeof margin === "number") pins[side] = margin;
  }
  for (const axis of axes)
    if (!SIDES.includes(axis.side))
      throw Error(
        `Plot: an axis's side must be one of ${SIDES.join(", ")}, got ${JSON.stringify(axis.side)}.`,
      );
  // A text is measured once per run, however many rounds show it.
  /** @type {Map<string, number>} */
  const widths = new Map();
  const textWidth = (
    /** @type {string} */ text,
    /** @type {string} */ font,
  ) => {
    const key = font + "\u0000" + text;
    let w = widths.get(key);
    if (w === undefined)
      widths.set(key, (w = text ? Math.max(0, measure(text, font) || 0) : 0));
    return w;
  };
  // A side is at most MAX_SHARE of the canvas, so an oversized margin never inverts the area.
  const clamp = (/** @type {Side} */ side, /** @type {number} */ value) =>
    Math.max(0, Math.min(value, (vertical(side) ? width : height) * MAX_SHARE));
  const areaOf = (/** @type {Gutters} */ g) => ({
    left: g.left,
    top: g.top,
    right: width - g.right,
    bottom: height - g.bottom,
  });
  /** @type {Gutters} */
  let gutters = /** @type {Gutters} */ (
    Object.fromEntries(
      SIDES.map((side) => [side, clamp(side, pins[side] ?? padding)]),
    )
  );
  let measured = measureAxes(gutters);
  let iterations = 1,
    converged = false;
  for (;;) {
    /** @type {Gutters} */
    const next = /** @type {Gutters} */ ({});
    for (const side of SIDES)
      next[side] =
        pins[side] !== undefined
          ? gutters[side]
          : // Whole pixels, ignoring float noise (cos 90 degrees is 6e-17, not 0).
            clamp(
              side,
              Math.ceil(Math.max(measured.need[side], padding) - 1e-6),
            );
    // Past a few free rounds a gutter only grows: a wider gutter can mean fewer, shorter labels
    // and a narrower one more, longer labels; growing never clips either set.
    if (iterations > FREE_ITERATIONS)
      for (const side of SIDES)
        next[side] = Math.max(next[side], gutters[side]);
    if (SIDES.every((side) => next[side] === gutters[side])) {
      converged = true;
      break;
    }
    if (iterations === MAX_ITERATIONS) break;
    gutters = next;
    measured = measureAxes(gutters);
    iterations++;
  }
  const area = areaOf(gutters);
  return {
    area: {
      ...area,
      width: Math.max(0, area.right - area.left),
      height: Math.max(0, area.bottom - area.top),
    },
    gutters,
    axes: measured.axes,
    iterations,
    converged,
    overflow: SIDES.filter(
      (side) =>
        pins[side] === undefined &&
        width > 0 &&
        height > 0 &&
        gutters[side] >= clamp(side, Infinity) - 0.5 &&
        Math.ceil(measured.need[side] - 1e-6) > gutters[side] + 0.5,
    ),
  };

  /**
   * Each axis's depth for the area the gutters leave, the offsets of stacked axes, and the room
   * each side needs: its axes' depths and the overhang of end labels from the axes across it.
   * @param {Gutters} g
   */
  function measureAxes(g) {
    const area = areaOf(g);
    /** @type {Gutters} */
    const need = { left: 0, right: 0, top: 0, bottom: 0 };
    /** @type {Gutters} */
    const stacked = { left: 0, right: 0, top: 0, bottom: 0 };
    const placed = axes.map((axis) => {
      const side = axis.side,
        upright = vertical(side),
        span = /** @type {[number, number]} */ (
          upright ? [area.top, area.bottom] : [area.left, area.right]
        ),
        [startSide, endSide] = /** @type {[Side, Side]} */ (
          upright ? ["top", "bottom"] : ["left", "right"]
        ),
        fontSize = axis.fontSize ?? 11,
        font = axis.font ?? `${fontSize}px ${DEFAULT_FONT}`,
        tick = Math.max(0, axis.tickSize ?? 0);
      let depth = tick;
      const labels = axis.ticks?.(span) ?? [];
      if (labels.length) {
        const reach = tick + (axis.labelOffset ?? 3),
          align = axis.labelAlign ?? "auto",
          anchor =
            align !== "auto"
              ? align
              : side === "left"
                ? "end"
                : side === "right"
                  ? "start"
                  : "middle",
          // The overlay puts a bottom label's baseline a font size past its offset and a top
          // label's at it; a y label's sits .32em below its tick.
          pivot = side === "bottom" ? reach + fontSize : reach,
          baseline = upright ? Y_BASELINE * fontSize : 0;
        let context = false;
        for (const { text, at, row } of labels) {
          // Context labels start at their tick and are dropped where they do not fit, as the
          // overlay draws them, so they take a row's depth and never overhang the ends.
          if (row === 1) {
            context = true;
            continue;
          }
          const box = textBox(
              textWidth(String(text), font),
              fontSize,
              anchor,
              baseline,
              axis.labelAngle ?? 0,
            ),
            across = {
              bottom: pivot + box.bottom,
              top: pivot - box.top,
              left: pivot - box.left,
              right: pivot + box.right,
            }[side],
            [before, after] = upright
              ? [box.top, box.bottom]
              : [box.left, box.right];
          depth = Math.max(depth, across);
          // How far the text reaches past the area's ends, as gutters.
          need[startSide] = Math.max(
            need[startSide],
            span[0] - (at + before) + padding,
          );
          need[endSide] = Math.max(
            need[endSide],
            at + after - span[1] + padding,
          );
        }
        if (context && !upright)
          depth = Math.max(
            depth,
            reach +
              fontSize +
              ROW_GAP +
              fontSize * (side === "bottom" ? 1 + DESCENT : 1),
          );
      }
      if (axis.title?.text) {
        const size = axis.title.fontSize ?? fontSize,
          angle = ((axis.title.angle ?? (upright ? -90 : 0)) * Math.PI) / 180,
          w = textWidth(axis.title.text, axis.title.font ?? font),
          sin = Math.abs(Math.sin(angle)),
          cos = Math.abs(Math.cos(angle));
        depth +=
          (axis.title.offset ?? 7) +
          (upright ? cos * w + sin * size : sin * w + cos * size);
      }
      const offset = stacked[side];
      stacked[side] = offset + depth + STACK_GAP;
      need[side] = Math.max(need[side], offset + depth + padding);
      return { side, offset, depth };
    });
    return { need, axes: placed };
  }
}

/** The margins a side falls back to before its first solve, or with nothing to measure. */
export const FALLBACK_MARGINS = Object.freeze({
  left: 36,
  right: 12,
  top: 12,
  bottom: 32,
});
/**
 * A text drawn around a round plot's disk (TODO 136.10 slice 7): at `angle` (radians,
 * counterclockwise from the right) and `radius` (a fraction of the disk's), moved `dx`, `dy`
 * pixels from that point, and rotated `rotate` degrees about where it lands.
 * @typedef {object} RoundLabel
 * @property {string} text
 * @property {number} angle
 * @property {number} [radius] 1 on the disk's edge
 * @property {number} [dx]
 * @property {number} [dy]
 * @property {"start" | "middle" | "end"} [anchor]
 * @property {number} [rotate]
 * @property {number} [fontSize]
 * @property {string} [font] passed to `measure`
 */
/** Rounds of a round plot's solve at most: a side converges by at least half its shortfall each. */
const ROUND_ITERATIONS = 16;

/**
 * A round plot's gutters (polar and globe plots, TODO 136.10 slice 7): the camera fits its disk
 * (or a map's world box) to the area, centered, with equal units, so the disk's radius is half
 * the area's shorter side. Each "auto" side keeps `padding` and grows until the labels drawn
 * around the disk fit the canvas; a label overhanging the disk into the slack of the longer side
 * takes no gutter (unless labels pass both of its ends: then the longer side's slack goes first,
 * as only a smaller disk makes room). Labels are measured as the overlay draws them (glyphs a
 * font size above the baseline at their point and DESCENT below). Gutters only grow, so the run
 * ends; a side bounded at MAX_SHARE whose labels still run past the canvas is in `overflow`.
 * @param {{ width: number, height: number, margins?: LayoutInput["margins"],
 *   labels?: RoundLabel[], measure: LayoutInput["measure"], padding?: number }} input
 * @returns {{ gutters: Gutters, overflow: Side[], iterations: number }}
 */
export function solveRoundLayout({
  width,
  height,
  margins = {},
  labels = [],
  measure,
  padding = 8,
}) {
  /** @type {Partial<Gutters>} */
  const pins = {};
  for (const side of SIDES) {
    const margin = margins[side];
    if (pinned(margin)) pins[side] = margin;
  }
  const clamp = (/** @type {Side} */ side, /** @type {number} */ value) =>
    Math.max(0, Math.min(value, (vertical(side) ? width : height) * MAX_SHARE));
  // Each label's glyph box around its point, measured once.
  const boxes = labels
    .filter((l) => l.text)
    .map((l) => {
      const size = l.fontSize ?? 11,
        font = l.font ?? `${size}px ${DEFAULT_FONT}`,
        box = textBox(
          Math.max(0, measure(String(l.text), font) || 0),
          size,
          l.anchor ?? "middle",
          0,
          l.rotate ?? 0,
        );
      return {
        cos: Math.cos(l.angle) * (l.radius ?? 1),
        sin: Math.sin(l.angle) * (l.radius ?? 1),
        left: box.left + (l.dx ?? 0),
        right: box.right + (l.dx ?? 0),
        top: box.top + (l.dy ?? 0),
        bottom: box.bottom + (l.dy ?? 0),
      };
    });
  /** @type {Gutters} */
  let gutters = /** @type {Gutters} */ (
    Object.fromEntries(
      SIDES.map((side) => [side, clamp(side, pins[side] ?? padding)]),
    )
  );
  /**
   * How far the labels run past each side's padding (or `pad`), for these gutters.
   * @param {Gutters} g @param {number} [pad]
   */
  const shortfall = (g, pad = padding) => {
    const w = width - g.left - g.right,
      h = height - g.top - g.bottom,
      r = Math.max(0, Math.min(w, h) / 2),
      cx = g.left + w / 2,
      cy = g.top + h / 2,
      out = { left: 0, right: 0, top: 0, bottom: 0 };
    for (const b of boxes) {
      const x = cx + r * b.cos,
        y = cy - r * b.sin;
      out.left = Math.max(out.left, pad - (x + b.left));
      out.right = Math.max(out.right, x + b.right - (width - pad));
      out.top = Math.max(out.top, pad - (y + b.top));
      out.bottom = Math.max(out.bottom, y + b.bottom - (height - pad));
    }
    return out;
  };
  let iterations = 1,
    short = shortfall(gutters);
  for (; iterations < ROUND_ITERATIONS; iterations++) {
    /** @type {Gutters} */
    const next = { ...gutters };
    for (const side of SIDES)
      if (pins[side] === undefined && short[side] > 0.5)
        next[side] = clamp(side, Math.ceil(gutters[side] + short[side]));
    // Labels past both ends of the longer side: growing both gutters moves neither while the
    // shorter side sizes the disk, so first give up that side's slack.
    for (const [a, b] of /** @type {const} */ ([
      ["left", "right"],
      ["top", "bottom"],
    ])) {
      const slack =
        (a === "left"
          ? width -
            gutters.left -
            gutters.right -
            (height - gutters.top - gutters.bottom)
          : height -
            gutters.top -
            gutters.bottom -
            (width - gutters.left - gutters.right)) / 2;
      if (
        slack > 0.5 &&
        short[a] > 0.5 &&
        short[b] > 0.5 &&
        pins[a] === undefined &&
        pins[b] === undefined
      ) {
        next[a] = clamp(a, Math.ceil(gutters[a] + slack));
        next[b] = clamp(b, Math.ceil(gutters[b] + slack));
      }
    }
    if (SIDES.every((side) => next[side] === gutters[side])) break;
    gutters = next;
    short = shortfall(gutters);
  }
  // Clipped: past the canvas's edge, not just its padding, on a side that cannot grow.
  const clipped = shortfall(gutters, 0);
  return {
    gutters,
    iterations,
    overflow: SIDES.filter(
      (side) =>
        pins[side] === undefined &&
        width > 0 &&
        height > 0 &&
        gutters[side] >= clamp(side, Infinity) - 0.5 &&
        clipped[side] > 0.5,
    ),
  };
}

/**
 * Whether a margin is pinned: a finite number of pixels, at least 0. Anything else ("auto", or a
 * bad value a Theme or scene let through) leaves the side to the solver.
 * @param {unknown} margin
 * @returns {margin is number}
 */
export const pinned = (margin) =>
  typeof margin === "number" && Number.isFinite(margin) && margin >= 0;
/**
 * The gutters a Plot's 2D area leaves, for every reader of its rectangle (the camera's fit, margin
 * zoom, screen padding, the axes): the solved ones viewCore publishes in the "plot" options'
 * `_axisGutters`, or before the first solve each side's pinned margin or its fallback.
 * @param {{ get(key: string): any }} plot the Plot's "plot" options
 * @param {Gutters} [fallback] each unpinned side before a solve
 * @returns {Gutters}
 */
export function plotGutters(plot, fallback = FALLBACK_MARGINS) {
  const solved = plot.get("_axisGutters");
  if (solved) return solved;
  return /** @type {Gutters} */ (
    Object.fromEntries(
      SIDES.map((side) => {
        const margin = plot.get(label(side));
        return [side, pinned(margin) ? margin : fallback[side]];
      }),
    )
  );
}

/** The share of a figure's height its canvas keeps however tall its title and legends are. */
export const MIN_CANVAS_SHARE = 0.25;

/**
 * aspect="equal" letterboxes rather than widen an explicit domain (TODO 136.14, 134.14). The
 * camera fits a data unit to the same length on x and y, so one axis shows more than its domain:
 * the one whose pixels per unit are larger. When that axis's domain was given, its side of the
 * area shrinks, centered, until the domain fills it exactly; an automatic domain is widened as
 * before. `units` are the domains' spans in each axis's transformed units. With `canvas`, no
 * side grows past `share` of the canvas (the camera's plotRectangle caps them there), so a domain
 * far narrower than the area is widened a little after all.
 * @param {{ left: number, right: number, top: number, bottom: number }} area
 * @param {{ x: number, y: number }} units
 * @param {{ x: boolean, y: boolean }} explicit
 * @param {{ width: number, height: number, share: number }} [canvas]
 */
export function letterbox(area, units, explicit, canvas) {
  const width = area.right - area.left,
    height = area.bottom - area.top;
  if (![units.x, units.y, width, height].every((v) => Number.isFinite(v) && v > 0)) return area;
  const perX = width / units.x,
    perY = height / units.y,
    // The most a side can grow and stay within its share, on both ends.
    room = (/** @type {number} */ low, /** @type {number} */ high, /** @type {number} */ size) =>
      canvas ? Math.max(0, Math.min(size * canvas.share - low, size * canvas.share - (size - high))) : Infinity;
  if (perX > perY * (1 + 1e-9) && explicit.x) {
    const inset = Math.min((width - perY * units.x) / 2, room(area.left, area.right, canvas?.width ?? 0));
    return { ...area, left: area.left + inset, right: area.right - inset };
  }
  if (perY > perX * (1 + 1e-9) && explicit.y) {
    const inset = Math.min((height - perX * units.y) / 2, room(area.top, area.bottom, canvas?.height ?? 0));
    return { ...area, top: area.top + inset, bottom: area.bottom - inset };
  }
  return area;
}

/**
 * An axis's tick labels per candidate span, computed once per span (TODO 143.4): the solver asks
 * again for the span it settles on, and a solve keeps the same closure.
 * @template T
 * @param {(span: number[]) => T} labels
 * @returns {(span: number[]) => T}
 */
export function memoizeSpan(labels) {
  /** @type {Map<string, T>} */
  const seen = new Map();
  return (span) => {
    const key = `${span[0]},${span[1]}`;
    if (!seen.has(key)) seen.set(key, labels(span));
    return /** @type {T} */ (seen.get(key));
  };
}
