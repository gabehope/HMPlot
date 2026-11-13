// @ts-check
// Filled bands of a 2-D density (TODO 130.3; DensityContour's mode="bands" before), as d3's
// contourDensity: Density, Contour, then Polygon filled by each band's lower level. The first
// band (from the least density up) covers the whole grid, so it is left out.
import { defineTemplate, option, refine, node, param, rest } from "../templates/define.js";
import { expression } from "../plot/utils/names.js";

export default defineTemplate({
  kind: "DensityBands",
  signature: {
    tier: "charts",
    summary: "Filled bands of the density of points in two dimensions, each filled by its lower level.",
    extraProps: true,
    use: ["mark", "markSettings", "transparent"],
    omit: ["rows", "brush", "drag", "nearby", "ondrag", "ondragend", "color", "colorScale", "size", "sizeScale", "width", "widthScale", "position", "z"],
    options: {
      x: option("column", "The column along x of the points whose density is banded.", { input: false, required: true }),
      y: option("column", "The column along y of the points whose density is banded.", { input: false, required: true }),
      weight: option("column", "A column of nonnegative weights, one per row; without it every row counts once."),
      bandwidth: option('number | [number, number] | "auto"', "The width of the Gaussian kernel: one for both axes, one per axis, or \"auto\" for Scott's rule.", { default: "auto", units: "data units", ts: '"auto" | number | [number, number]' }),
      resolution: option("number | [number, number]", "The size of the grid the density is estimated on: [along x, along y], or one number for both.", { default: 128, ts: "number | [number, number]" }),
      bounds: option("{x: [number, number], y: [number, number]}", "The region the density is estimated over.", { defaultText: "the points' extent, widened by three bandwidths", units: "data units", ts: "any" }),
      thresholds: option("number | number[]", "How many band edges, chosen as round values over the density's range, or the edges themselves.", { default: 10, ts: "number | number[]" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      fill: refine({ defaultText: "each band's lower level", doc: "The bands' fill: a CSS color, or lower (the density at the band's lower edge) mapped to colors." }),
    },
  },
  params: { x: undefined, y: undefined, weight: undefined, bandwidth: "auto", resolution: 128, bounds: undefined, thresholds: 10,
    fill: undefined, opacity: undefined, outlineColor: undefined, outlineWidth: undefined, outlineOpacity: undefined },
  theme: {
    kind: "DensityBands", defaults: { fill: "lower" },
    values: { fill: param("fill"), opacity: param("opacity"), outlineColor: param("outlineColor"), outlineWidth: param("outlineWidth"), outlineOpacity: param("outlineOpacity") },
    only: ["fill", "opacity", "outlineColor", "outlineWidth", "outlineOpacity"],
  },
  describe: { noun: "density bands" },
  root: node("Density", { x: param("x"), y: param("y"), weight: param("weight"), bandwidth: param("bandwidth"), resolution: param("resolution"), bounds: param("bounds") }, [
    node("Contour", { field: "density", thresholds: param("thresholds"), mode: "bands" }, [
      node("Filter", { where: expression("greater", ["band", 0]) }, [
        node("Polygon", { fill: param("fill"), ...rest({ omit: ["name"] }) }),
      ]),
    ]),
  ]),
});
