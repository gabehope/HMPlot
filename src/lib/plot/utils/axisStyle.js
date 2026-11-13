import { coordinateView } from "./viewContext.js";
/** Shared axis appearance and coordinate-aware defaults, independent of rendering. */
export const cartesian2D = (options) =>
  (options.get?.("coordinates") ?? "cartesian") === "cartesian" && coordinateView(options) !== "3d";

/** A 2D orthographic globe: its guides (a graticule and the sphere's outline) show by default,
 * as a Cartesian plot's axes do (TODO 135.5). */
export const globe2D = (options) =>
  options.get?.("coordinates") === "spherical" && options.get?.("projection") === "orthographic" &&
  coordinateView(options) === "2d";

/** An authored visible axis or grid enables guides outside the automatic Cartesian layout. */
export const axisGuidesEnabled = (options, config = {}, enabled = false) =>
  enabled || cartesian2D(options) || globe2D(options) || config.visible === true ||
  (config.grid !== undefined && config.grid !== "off");

/** Explicit frame/plot settings above a theme. Theme defaults are coordinate dependent. */
export function hasAxisOverride(node, key) {
  for (let current = node; current; current = current.defaults) {
    if (current.isThemeScope || current.parent?.isThemeScope) return false;
    if (current.explicit?.has(key)) return true;
  }
  return false;
}

export function resolveAxisStyle(config = {}, shared = {}) {
  return {
    ...config,
    line: config.line ?? true, ticks: config.ticks ?? true,
    lineWidth: config.lineWidth ?? shared.axisLineWidth ?? 1,
    tickWidth: config.tickWidth ?? 1,
    tickSize: config.tickSize ?? shared.axisTickSize ?? 3,
    tickDirection: config.tickDirection ?? "outside",
    titleFontWeight: config.titleFontWeight ?? 700,
    gridColor: config.gridColor ?? null, gridWidth: config.gridWidth ?? 1,
    gridDash: config.gridDash ?? [],
  };
}

/** Signed tick endpoints along an outward normal, in CSS pixels. */
export function tickOffsets(axis, minor = false) {
  const size = axis.ticks === false ? 0 : axis.tickSize * (minor ? .5 : 1);
  return [axis.tickDirection === "outside" ? 0 : -size,
    axis.tickDirection === "inside" ? 0 : size];
}
export function arrowPath(x, y, dx, dy, size) {
  const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, half = size * .55;
  return `M${x} ${y} L${x-ux*size-uy*half} ${y-uy*size+ux*half} L${x-ux*size+uy*half} ${y-uy*size-ux*half} Z`;
}
/** A hidden baseline leaves a two-arrow-size shaft at each enabled arrow. */
export function axisStrokePath(x0, y0, x1, y1, axis) {
  if (!(axis.lineWidth > 0)) return "";
  if (axis.line !== false) return `M${x0} ${y0} L${x1} ${y1}`;
  const length = Math.hypot(x1-x0, y1-y0), amount = Math.min(length, 2 * axis.arrowSize) / (length || 1);
  let path = "";
  if (axis.arrow === "start" || axis.arrow === "both") path += `M${x0} ${y0} L${x0+(x1-x0)*amount} ${y0+(y1-y0)*amount}`;
  if (axis.arrow === "end" || axis.arrow === "both") path += `M${x1} ${y1} L${x1-(x1-x0)*amount} ${y1-(y1-y0)*amount}`;
  return path;
}

/** Validate the shared public axis controls without adding rendering dependencies. */
export function validateAxisAppearance(value, name = "Plot/Frame axis") {
  for (const key of ["line", "ticks", "frame", "mask"])
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      throw Error(`${name}.${key} requires true or false.`);
  for (const key of ["tickSize", "gridWidth", "titleFontWeight"])
    if (value[key] != null && (!Number.isFinite(value[key]) || value[key] < (key === "titleFontWeight" ? 1 : 0) ||
      (key === "titleFontWeight" && value[key] > 1000)))
      throw Error(`${name}.${key} requires ${key === "titleFontWeight" ? "a font weight from 1 to 1000" : "a nonnegative number"}.`);
  if (value.tickDirection !== undefined && !["inside", "outside", "both"].includes(value.tickDirection))
    throw Error(`${name}.tickDirection requires outside, inside, or both.`);
  if (value.gridColor != null && typeof value.gridColor !== "string") throw Error(`${name}.gridColor requires a CSS color string.`);
  if (value.gridDash !== undefined && (!Array.isArray(value.gridDash) || value.gridDash.some(n => !Number.isFinite(n) || n < 0)))
    throw Error(`${name}.gridDash requires an array of nonnegative dash lengths.`);
}
