// @ts-check
// A box plot (a template since TODO 130.3): BoxStats summarizes each group, a Rect, the main part,
// draws its box, a Segments with bar caps its whisker and another its median; BoxOutliers keeps
// the rows past the whiskers, drawn as Points. The theme's BoxPlot entry styles every part (its
// outlineColor is the whiskers' and medians' color); the whiskers keep the ErrorBars entry beneath
// it, as when they were error bars. The wrapper settles the orientation from the data.
import { defineTemplate, option, refine, node, param, rest } from "../templates/define.js";

const style = { fill: param("fill"), outlineColor: param("outlineColor") };

export default defineTemplate({
  kind: "BoxPlot",
  signature: {
    tier: "charts",
    summary: "Box-and-whisker plots: each group's quartiles, median, whiskers and outliers.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "rotationOption", "markSettings", "detail", "lit", "transparent"],
    omit: ["rows", "brush", "drag", "nearby", "ondrag", "ondragend", "width", "widthScale"],
    options: {
      x: option("channel", "The groups along x, a box each, or the measurements for horizontal boxes.", { required: true }),
      y: option("channel", "The measurements for vertical boxes, or the groups along y for horizontal ones.", { required: true }),
      orientation: option('"horizontal" | "vertical"', "Vertical boxes stand on categories along x; horizontal boxes sit on categories along y.", { defaultText: "from which of x and y is categorical" }),
      bandFraction: option("number", "The share of its category's band each box fills, 0 to 1; on a numeric axis, the box's width in data units.", { default: 0.8 }),
      whisker: option("number", "How far the whiskers may reach beyond the box, in interquartile ranges; each ends at the farthest value within that reach (Tukey's rule).", { default: 1.5 }),
      outliers: option("boolean", "Draw the values beyond the whiskers as points.", { default: true }),
      outlierSize: option("number", "The outlier points' diameter.", { default: 2.5, units: "px" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      fill: refine({ default: "#547ba2", doc: "The boxes' and outliers' fill: a CSS color, or the group column to color each group." }),
      outlineColor: refine({ default: "#30343b", doc: "The whiskers' and medians' color, and the boxes' outline color when outlineWidth is set." }),
    },
  },
  params: {
    x: undefined, y: undefined, orientation: "vertical", bandFraction: 0.8, whisker: 1.5, outliers: true, outlierSize: 2.5,
    fill: undefined, outlineColor: undefined, outlineWidth: undefined, outlineOpacity: undefined, _category: undefined, _measurement: undefined,
  },
  theme: { kind: "BoxPlot", routed: true },
  describe: { noun: "box plot" },
  // The box's share of its band is bandFraction (R2.0); a width would draw over it.
  forbid: { width: "BoxPlot.width is not a prop: bandFraction sets the box's share of its band." },
  // A pane edit to the box's fill or outline is the box's alone; as BoxPlot props they would
  // restyle the outliers, whiskers and medians on a round trip or in an export.
  mainSettings: { omit: ["fill", "outlineColor"] },
  // Connections: the box's edges on the measurement axis, and its median between them.
  endpoint: {
    attachments: {
      q1: { edge: [1, 0] },
      q3: { edge: [0, 1] },
      median: { fraction: { value: "median", low: "q1", high: "q3" } },
    },
  },
  // Two BoxPlot theme layers, as the hand-written mark had: the outliers take its fill and
  // outlineColor; the box, whiskers and medians its outline too, outlineColor as their color.
  root: node("ThemeDefaults", { kind: "BoxPlot", defaults: { fill: "#547ba2", outlineColor: "#30343b" }, values: style }, [
    node("ThemeDefaults", {
      kind: "BoxPlot", defaults: { fill: "#547ba2", outlineColor: "#30343b" },
      values: { ...style, outlineWidth: param("outlineWidth"), outlineOpacity: param("outlineOpacity") }, aliases: { outlineColor: "color" },
    }, [
      node("Transform", {
        kind: "BoxStats", by: param("_category"), value: param("_measurement"), orientation: param("orientation"), width: param("bandFraction"), whisker: param("whisker"),
      }, [
        node("Rect", { x0: "__boxX0", x1: "__boxX1", y0: "__boxY0", y1: "__boxY1", ...rest({ omit: ["name"] }) }),
        node("ThemeDefaults", { kind: "ErrorBars", defaults: { color: "#30343b", width: 1, opacity: 1 }, only: ["color", "width", "opacity"], beneath: true }, [
          node("Segments", { start: "__whiskerStart", end: "__whiskerEnd", cap: "bar", capSize: 8, interpolation: "angular" }),
        ]),
        node("Segments", { start: "__medianStart", end: "__medianEnd", width: 2 }),
      ]),
    ]),
    node("Transform", { kind: "BoxOutliers", by: param("_category"), value: param("_measurement"), whisker: param("whisker") }, [
      node("Points", { x: param("x"), y: param("y"), size: param("outlierSize") }),
    ], { when: param("outliers") }),
  ]),
});
