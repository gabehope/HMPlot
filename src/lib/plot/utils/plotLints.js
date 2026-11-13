// @ts-check
/**
 * Lints a Plot reads from what it draws (TODO 136.13, slice 3; 134.18): a color mapped from data
 * that no legend explains, and an explicit x or y domain far wider than the data, which squeezes
 * the marks into a sliver of the plot. Read with the plot's diagnostics (runtime.diagnostics(),
 * hm.check), never on a frame. Only hm.check's page reads data extents on an explicit axis
 * (lintMode.js), so only hm.check finds a wide domain; a Facet's cells and a domain a frame takes
 * from its parent are not checked.
 */
import { markBinding } from "./markBinding.js";
import { legendClaimedMarks, legendExplains } from "./legendClaims.js";
import { readAxis } from "./axes.js";
import { axisCategory } from "./categorical.js";
import { numericExtent } from "./scaleBindings.js";
import { lintExtents } from "./lintMode.js";

const COLOR_CHANNELS = ["fill", "color"];
/** An explicit domain this many times wider than the data's extent lints. */
export const WIDE_DOMAIN_RATIO = 20;

/** @param {number} value */
const short = (value) => String(Number(value.toPrecision(3)));

/** The scale a mark maps `channel` through, continuous or categorical. @param {unknown} mark @param {string} channel */
const colorScale = (mark, channel) => {
  const binding = markBinding(mark);
  return binding?.scales?.[channel] ?? binding?.legend?.categories?.[channel]?.scale;
};
/** The column a mark colors by, as its legend titles it. @param {unknown} mark @param {string} channel */
const colorColumn = (mark, channel) => {
  const title = markBinding(mark)?.legend?.channelTitles?.[channel];
  return typeof title === "string" ? title : undefined;
};

/**
 * @typedef {{ kind: string, owner: object, node?: string, axes?: Record<string, unknown>,
 *   channels?: Record<string, string>, rows?: number, mark?: () => unknown }} LintedMark
 * @typedef {import("./diagnostics.js").Diagnostic} Diagnostic
 */

/**
 * Marks that drew no rows (2026-10-22): a Filter keeping none, a Join matching none, a layout
 * whose subtree is empty, a transform output a mark misreads. One lint per owner, from the
 * plot's own description, so hm.check and the Svelte checker report it alike.
 * @param {LintedMark[]} entries
 * @returns {Diagnostic[]}
 */
export function emptyMarks(entries) {
  const seen = new Set();
  /** @type {Diagnostic[]} */
  const found = [];
  for (const entry of entries) {
    if (entry.rows !== 0 || seen.has(entry.owner)) continue;
    seen.add(entry.owner);
    found.push({
      severity: "lint", code: "lint.mark-empty", component: entry.kind, node: entry.node,
      message: `${entry.kind}: drew no rows. Its data has none here: a Filter that keeps none (check its where, ` +
        `and inactive= while nothing is selected), a Join matching no keys, a layout with an empty subtree, ` +
        `or a transform whose output this mark does not read.`,
    });
  }
  return found;
}

/**
 * A mapped color with no legend: each mark whose fill or color comes from a data column (its
 * categories or a continuous scale; an RGB column is its own colors) while no mounted legend
 * explains it. A legend explains a mark's color when it claims the mark, a mark sharing its scale
 * (anywhere: a Facet's legend claims one cell's mount of the shared scale) or, in this plot, a
 * mark colored by the same column (a Line and Points share one set of swatches). A color that
 * repeats the mark's x or y column is read off that axis and needs none. A compound mark (each
 * part described under one owner) lints once.
 * @param {LintedMark[]} entries
 * @returns {Diagnostic[]}
 */
export function unexplainedColors(entries) {
  const marks = entries.map((entry) => ({ entry, mark: entry.mark?.() })).filter(({ mark }) => mark);
  const explains = (/** @type {unknown} */ mark) => COLOR_CHANNELS.some((channel) => legendExplains(mark, channel));
  const scales = new Set(), columns = new Set();
  for (const mark of legendClaimedMarks())
    if (explains(mark)) for (const channel of COLOR_CHANNELS) scales.add(colorScale(mark, channel));
  for (const { mark } of marks)
    if (explains(mark)) for (const channel of COLOR_CHANNELS) columns.add(colorColumn(mark, channel));
  scales.delete(undefined);
  columns.delete(undefined);
  /** @type {Diagnostic[]} */
  const found = [];
  // A legend on one part of a compound explains the compound.
  const linted = new Set(marks.filter(({ mark }) => explains(mark)).map(({ entry }) => entry.owner));
  for (const { entry, mark } of marks) {
    if (linted.has(entry.owner)) continue;
    const binding = markBinding(mark);
    for (const channel of COLOR_CHANNELS) {
      if (!binding?.legend?.categories?.[channel] && !binding?.scales?.[channel]) continue;
      const column = entry.channels?.[channel] ?? colorColumn(mark, channel);
      if (column !== undefined && Object.values(entry.axes ?? {}).includes(column)) continue;
      if (scales.has(colorScale(mark, channel)) || (column !== undefined && columns.has(column))) continue;
      const by = column ? ` by "${column}"` : "";
      linted.add(entry.owner);
      found.push({
        severity: "lint", code: "lint.color-unexplained", component: entry.kind, node: entry.node, property: channel,
        message: `${entry.kind}.${channel}: colors its marks${by}, but no legend says which color is which. ` +
          `Add a Legend with channel="${channel}" to the Plot, or set legend=True on the Plot.`,
      });
      break;
    }
  }
  return found;
}

/**
 * An explicit x or y domain at least WIDE_DOMAIN_RATIO times wider than the extent of the data
 * inside it (a 2D Cartesian numeric axis on a linear or log scale): the marks fill a sliver.
 * @param {{ explicitDomain(axis: string): number[] | undefined, dataDomain?(axis: string): number[] | null,
 *   options: any } | undefined} root the plot's root frame
 * @returns {Diagnostic[]}
 */
export function wideDomains(root) {
  /** @type {Diagnostic[]} */
  const found = [];
  if (!root?.dataDomain || !root.options) return found;
  const options = root.options;
  if ((options.get("coordinates") ?? "cartesian") !== "cartesian") return found;
  for (const axis of ["x", "y"]) {
    const domain = root.explicitDomain(axis), data = root.dataDomain(axis);
    if (!domain || !data || readAxis(options, axis).type !== "numeric" || axisCategory(options, axis)) continue;
    const transform = options.get(axis + "Transform") ?? "linear";
    if (transform !== "linear" && transform !== "log") continue;
    const [low, high] = [Math.min(...domain), Math.max(...domain)], [from, to] = [data[0], data[1]];
    if (![low, high, from, to].every(Number.isFinite) || from < low || to > high) continue;
    if (transform === "log" && !(low > 0 && from > 0)) continue;
    const at = transform === "log" ? Math.log10 : (/** @type {number} */ value) => value;
    const span = at(high) - at(low), covered = at(to) - at(from);
    if (!(covered > 0) || span < covered * WIDE_DOMAIN_RATIO) continue;
    const share = (100 * covered) / span;
    found.push({
      severity: "lint", code: "lint.domain-wide", component: "Plot", property: axis,
      message: `Plot.${axis}: the ${axis} domain ${short(low)} to ${short(high)} is far wider than the data ` +
        `(${short(from)} to ${short(to)}), so the marks fill ${share < 1 ? "under 1" : Math.round(share)}% of the axis. ` +
        `Narrow the domain, or leave it out to fit the data.`,
    });
  }
  return found;
}

/**
 * Hidden category labels (134.18): a category axis hides a label where it would overlap the last
 * one shown (axes.js showLabelsApart), so some categories go unnamed. Read from the plot's 2D
 * axis layout, by hm.check only (lintMode.js): the count follows the drawn width and the zoom, and
 * a live page would re-send its diagnostics on every resize. Tick labels turned off, or no 2D
 * Cartesian axes, hide nothing.
 * @param {{ [axis: string]: any } | null | undefined} layout the axis layout (FrameLayout): each axis's major ticks
 * @param {any} options the root frame's options
 * @returns {Diagnostic[]}
 */
export function hiddenCategoryLabels(layout, options) {
  /** @type {Diagnostic[]} */
  const found = [];
  if (!layout || !options || !lintExtents()) return found;
  const style = options.child?.("plot");
  if ((options.get?.("coordinates") ?? "cartesian") !== "cartesian" || style?.get?.("axisTickLabels") === false ||
    style?.get?.("axes2d") === false) return found;
  for (const axis of ["x", "y"]) {
    if (!axisCategory(options, axis)) continue;
    /** @type {{ label?: string, showLabel?: boolean }[]} */
    const labeled = (layout[axis]?.major ?? []).filter((/** @type {{ label?: string }} */ tick) => tick.label);
    const hidden = labeled.filter((tick) => tick.showLabel === false).length;
    if (!hidden) continue;
    const room = axis === "x" ? "wider" : "taller";
    found.push({
      severity: "lint", code: "lint.labels-hidden", component: "Plot", property: axis,
      message: `Plot.${axis}: ${hidden} of ${labeled.length} category labels are hidden where they would overlap the one before. ` +
        `Make the plot ${room}, turn the labels (${axis}={"tick_label_angle": -45}), or show every one (${axis}={"label_overlap": "show"}).`,
    });
  }
  return found;
}

/**
 * Marks outside their own axes (134.33): data past an explicit domain. A 3D plot does not clip, so
 * data more than 1% of the span past its box draws outside the axes (a Surface over a z domain it
 * overshoots); a 2D plot clips, so it lints only when the domain holds none of the data and the
 * plot draws nothing there. hm.check's page reads the extents (lintMode.js), as for wideDomains.
 * @param {{ explicitDomain(axis: string): number[] | undefined, dataDomain?(axis: string): number[] | null,
 *   options: any } | undefined} root the plot's root frame
 * @param {string} mode the view's mode, "2d" or "3d"
 * @returns {Diagnostic[]}
 */
export function marksOutsideAxes(root, mode) {
  /** @type {Diagnostic[]} */
  const found = [];
  if (!root?.dataDomain || !root.options) return found;
  if ((root.options.get("coordinates") ?? "cartesian") !== "cartesian") return found;
  const solid = mode === "3d";
  for (const axis of solid ? ["x", "y", "z"] : ["x", "y"]) {
    const domain = root.explicitDomain(axis), data = root.dataDomain(axis);
    if (!domain || !data || axisCategory(root.options, axis) || readAxis(root.options, axis).type !== "numeric") continue;
    const [low, high] = [Math.min(...domain), Math.max(...domain)], [from, to] = [data[0], data[1]];
    if (![low, high, from, to].every(Number.isFinite) || !(high > low)) continue;
    const range = `${short(from)} to ${short(to)}`, bounds = `${short(low)} to ${short(high)}`;
    if (solid) {
      const slack = (high - low) / 100;
      if (from >= low - slack && to <= high + slack) continue;
      found.push({
        severity: "lint", code: "lint.marks-outside", component: "Plot", property: axis,
        message: `Plot.${axis}: the data runs from ${range}, past the ${axis} domain ${bounds}, and a 3D plot does not clip ` +
          `it: the marks draw outside the axes. Widen the domain, or leave it out to fit the data.`,
      });
    } else if (to < low || from > high) {
      found.push({
        severity: "lint", code: "lint.marks-outside", component: "Plot", property: axis,
        message: `Plot.${axis}: the ${axis} domain ${bounds} holds none of the data (${range}), so the plot draws nothing. ` +
          `Move the domain over the data, or leave it out to fit the data.`,
      });
    }
  }
  return found;
}

/** The extent of each mark's unscaled per-row sizes, by the data it was read from (prepareMarkerSizes). */
const sizeExtents = new WeakMap();

/**
 * Whether a Points mark draws its per-row sizes through its own options only: no size scale
 * binds it (a size expression without a range, domain or transform), so the values map through
 * the mark's default [0, 1] bounds and range, which pass pixels through unclamped.
 * @param {any} mark
 */
const unscaledSizes = (mark) =>
  mark?.sizeUnits !== "data" && mark?.fields?.get?.("size")?.isBufferNode && !markBinding(mark)?.scales?.size &&
  (mark.options?.get?.("scaleTransform") ?? "linear") === "linear";

/**
 * The largest point a Points mark draws, in CSS pixels: its constant size or size scale's range
 * (maxPointSize), or its unscaled per-row sizes mapped through its bounds and range once
 * prepareMarkerSizes read them; undefined while unknown (data units grow with zoom).
 * @param {any} mark
 */
function largestPoint(mark) {
  if (typeof mark?.maxPointSize !== "function") return undefined;
  if (!unscaledSizes(mark)) {
    const known = mark.maxPointSize();
    return Number.isFinite(known) ? known : undefined;
  }
  const read = sizeExtents.get(mark);
  if (!read || read.data !== mark.fields.get("size").data) return undefined;
  const [b0, b1] = (mark.options.get("scaleBounds") ?? [0, 1]).map(Number), [r0, r1] = (mark.options.get("scaleRange") ?? [0, 1]).map(Number);
  if (!(b1 !== b0) || ![b0, b1, r0, r1].every(Number.isFinite)) return undefined;
  return Math.max(...read.extent.map((/** @type {number} */ value) => Math.abs(r0 + ((value - b0) / (b1 - b0)) * (r1 - r0))));
}

/**
 * Read the extent of each described Points mark's unscaled per-row sizes (hm.check's page awaits
 * it before reading the diagnostics): a size expression without a range draws its values as
 * pixels.
 * @param {LintedMark[]} entries
 */
export async function prepareMarkerSizes(entries) {
  await Promise.all(entries.map(async (entry) => {
    const mark = /** @type {any} */ (entry.mark?.());
    if (!unscaledSizes(mark) || typeof mark.maxPointSize !== "function") return;
    const data = mark.fields.get("size").data;
    if (!data || typeof data === "number" || sizeExtents.get(mark)?.data === data) return;
    try {
      const extent = await numericExtent(data, "linear");
      if (extent) sizeExtents.set(mark, { data, extent });
    } catch { /* a size the extent cannot read: not linted */ }
  }));
}

/**
 * Markers covering the plot (134.33): a 2D Points mark whose largest point is at least half the
 * plot's shorter side (a population drawn as pixels: one point filled the plot). hm.check only,
 * as hiddenCategoryLabels: it follows the plot's size.
 * @param {LintedMark[]} entries @param {{ width: number, height: number, mode: string }} view
 * @returns {Diagnostic[]}
 */
export function coveringMarkers(entries, { width, height, mode }) {
  /** @type {Diagnostic[]} */
  const found = [];
  const side = Math.min(width, height);
  if (mode !== "2d" || !(side > 0) || !lintExtents()) return found;
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.owner)) continue;
    const size = largestPoint(entry.mark?.());
    if (size === undefined || size < side / 2) continue;
    seen.add(entry.owner);
    found.push({
      severity: "lint", code: "lint.markers-cover", component: entry.kind, node: entry.node, property: "size",
      message: `${entry.kind}.size: its largest point is ${Math.round(size)} px across, at least half the plot (${Math.round(side)} px), ` +
        `so its points cover the plot. Map size through a range (size_scale=hm.continuous(range=[4, 16])), or give a smaller size.`,
    });
  }
  return found;
}
