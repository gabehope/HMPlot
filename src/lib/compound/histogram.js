// @ts-check
// Bars over the bins of one column (a template since TODO 130.3): a Bin transform (its bins and
// normalization in the settings pane), then one Rect for either orientation; Bin gives the bars'
// ends along both axes. A brush carrier rides along when asked: the bins are not the rows, so an
// invisible Points over the binned column itself carries the brush (eval 2026-10-13: crossfilters
// brush histograms), and @brushed and Filter(where=...) select the rows in every view.
import { defineTemplate, option, refine, node, param, prop, rest, where, isMissing } from "../templates/define.js";

const alongX = isMissing(param("y"));

export default defineTemplate({
  kind: "Histogram",
  signature: {
    tier: "charts",
    summary: "Bars counting how many values fall in each bin of a numeric column.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "rotationOption", "markSettings", "lit", "transparent"],
    omit: ["rows", "drag", "nearby", "ondrag", "ondragend", "position", "z"],
    options: {
      brush: option("boolean | {selection, axis}", "Shift-drag brushes an interval of the binned column along its axis (x, or y for a horizontal histogram): the rows in it are @brushed in every view of the data, so a Filter elsewhere follows it (a crossfilter). true, or {selection} for a named selection.", { input: true, ts: 'boolean | { selection?: SelectionResource; axis?: "x" | "y" }' }),
      bins: option('number | number[] | "auto" | "sturges" | "fd" | "scott" | expression', "A bin count, the bins' edges, a rule that picks the count from the data (as numpy's does), or an expression such as power(count(\"x\"), 0.5).", { default: 30, ts: "number | number[] | BinRule | Expression" }),
      normalization: option('"count" | "proportion" | "density"', "What each bar's length measures: its values (\"count\"), their share of all values (\"proportion\"), or that share divided by the bin's width (\"density\").", { default: "count" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      x: option("column | number[]", "The values to bin along x, for vertical bars: a column or per-row values. Give x or y, not both.", { ts: "Channel" }),
      y: option("column | number[]", "The values to bin along y, for horizontal bars. Give x or y, not both.", { ts: "Channel" }),
      fill: refine({ defaultText: "the theme's first palette color (#3478c7 in the default theme)", doc: "The bars' fill: a CSS color, or a column of the bins (such as count) mapped to colors." }),
    },
  },
  params: { x: undefined, y: undefined, bins: 30, normalization: "count", brush: undefined },
  theme: { kind: "Histogram" },
  settings: {
    bins: { option: "histogramBins", text: true },
    normalization: { option: "histogramNormalization", options: ["count", "proportion", "density"] },
  },
  // Connections: a bar's baseline and value ends, its box's lower and upper edges along the value
  // axis (the Bin's: the bars rise along the other axis).
  endpoint: { attachments: { baseline: { edge: [1, 0] }, value: { edge: [0, 1] } } },
  // The DataBoundary holds the two branches and passes its data through; the brush carrier is
  // left out of the description, which counts the bins.
  root: node("DataBoundary", {}, [
    node("Undescribed", {}, [
      node("Points", {
        x: where(alongX, param("x"), 0), y: where(alongX, 0, param("y")), size: 0, opacity: 0,
        legend: false, tooltip: false, brush: param("brush"), respond: false,
      }),
    ], { when: param("brush") }),
    node("Transform", {
      kind: "Bin", x: param("x"), y: param("y"), name: prop("name"), bins: param("bins"), normalization: param("normalization"),
    }, [
      node("Rect", { x0: "x0", x1: "x1", y0: "y0", y1: "y1", ...rest({ omit: ["name"] }) }),
    ], { id: "bins" }),
  ]),
});
