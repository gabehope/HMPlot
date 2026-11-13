// @ts-check
// Contour lines of a 2-D density (TODO 47.5, a template since 130.3), as d3's contourDensity:
// Density, Contour, then Segments colored by level. Filled bands are DensityBands
// (./densityBands.js); DensityContour's mode="bands" draws one, deprecated.
import { defineTemplate, option, refine, node, param, rest } from "../templates/define.js";

export default defineTemplate({
  kind: "DensityContour",
  signature: {
    tier: "charts",
    summary: "Contour lines of the density of points in two dimensions.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "interpolationOption", "markSettings", "transparent"],
    omit: ["rows", "brush", "drag", "nearby", "ondrag", "ondragend"],
    options: {
      x: option("column", "The column along x of the points whose density is contoured.", { input: false, required: true }),
      y: option("column", "The column along y of the points whose density is contoured.", { input: false, required: true }),
      weight: option("column", "A column of nonnegative weights, one per row; without it every row counts once."),
      bandwidth: option('number | [number, number] | "auto"', "The width of the Gaussian kernel: one for both axes, one per axis, or \"auto\" for Scott's rule.", { default: "auto", units: "data units", ts: '"auto" | number | [number, number]' }),
      resolution: option("number | [number, number]", "The size of the grid the density is estimated on: [along x, along y], or one number for both.", { default: 128, ts: "number | [number, number]" }),
      bounds: option("{x: [number, number], y: [number, number]}", "The region the density is estimated over.", { defaultText: "the points' extent, widened by three bandwidths", units: "data units", ts: "any" }),
      thresholds: option("number | number[]", "How many contour levels, chosen as round values over the density's range, or the levels themselves.", { default: 10, ts: "number | number[]" }),
      mode: option('"lines" | "bands"', 'Deprecated: use DensityBands for filled bands; mode will be removed. "lines" draws contour lines, colored by their level; "bands" draws a DensityBands.', { default: "lines" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      color: refine({ defaultText: "each line's level", doc: "The lines' color: a CSS color, or level (the density along the line) mapped to colors." }),
      fill: refine({ defaultText: "each band's lower level", doc: "The bands' fill, with the deprecated mode=\"bands\": a CSS color, or lower (the density at the band's lower edge) mapped to colors." }),
      width: refine({ default: 1, doc: "The lines' width." }),
    },
  },
  params: { x: undefined, y: undefined, weight: undefined, bandwidth: "auto", resolution: 128, bounds: undefined, thresholds: 10, mode: "lines", color: undefined, width: undefined, opacity: undefined },
  theme: { kind: "DensityContour", defaults: { color: "level", width: 1 }, values: { color: param("color"), width: param("width"), opacity: param("opacity") }, only: ["color", "width", "opacity"] },
  describe: { noun: "density contours" },
  root: node("Density", { x: param("x"), y: param("y"), weight: param("weight"), bandwidth: param("bandwidth"), resolution: param("resolution"), bounds: param("bounds") }, [
    // mode is "lines" here (the wrapper draws a DensityBands for "bands"); another value is
    // Contour's error, as before.
    node("Contour", { field: "density", thresholds: param("thresholds"), mode: param("mode") }, [
      // The bands' props are not the lines': a caller's fill or outline is left out, as before.
      node("Segments", { start: "start", end: "end", ...rest({ omit: ["name", "fill", "outlineColor", "outlineWidth", "outlineOpacity"] }) }),
    ]),
  ]),
});
