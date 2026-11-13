// @ts-check
// A pie or donut (a template since TODO 130.3): PieGeometry turns each row's value into a sector
// (angles and radii), a Rect, the main part, draws the sectors (in a polar frame, annular
// sectors) and a Text the text at each centroid, mounted while there is text. The wrapper
// settles what reads the plot: the frame's angle units, its view, the label's column and size,
// and the polar Frame a pie in a Cartesian plot places.
import { defineTemplate, option, refine, node, param, prop, rest, where, isMissing, add, coalesce } from "../templates/define.js";

export default defineTemplate({
  kind: "Pie",
  signature: {
    tier: "charts",
    summary: "A pie or donut chart: a sector per row, its angle its value's share of the total.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "markSettings", "lit", "transparent"],
    omit: ["rows", "brush", "drag", "nearby", "ondrag", "ondragend", "position", "size", "sizeScale", "width", "widthScale", "x", "y", "z"],
    options: {
      value: option("channel", "Each sector's size: a numeric column or expression. A negative value is an error; a zero or missing one draws nothing.", { input: true, required: true }),
      category: option("column", "The sectors' categories: they fill the sectors unless fill is given, so the legend lists them."),
      by: option("column | column[]", "One pie per group, drawn as concentric rings that each sum to their own total, each ring's sectors aligned to the inner ones they sum (in row order; sort sorts each ring on its own and breaks that); for pies side by side, use a Facet.", { ts: "ColumnName | ColumnName[]" }),
      sort: option('"none" | "asc" | "desc" | category[]', "The sectors' order clockwise from startAngle: row order, by value, or a list of categories (the others after them).", { default: "none", ts: '"none" | "asc" | "desc" | CategoryValue[]' }),
      startAngle: option("number", "Where the pie starts, clockwise from 12 o'clock.", { default: 0, units: "degrees" }),
      endAngle: option("number", "Where the pie ends, clockwise from 12 o'clock; below startAngle the sectors run counter-clockwise.", { default: 360, units: "degrees" }),
      padAngle: option("number", "A gap between sectors, taken from their shares as d3.pie's padAngle is; with by, from each sector's own share (at most half its width, so a very small sector gets a narrower gap), so the rings stay aligned.", { default: 0, units: "degrees" }),
      innerRadius: option("number", "The hole's radius as a fraction of the disk's: above 0 makes a donut.", { default: 0 }),
      outerRadius: option("number", "The pie's radius as a fraction of the disk's.", { default: 1 }),
      sectorLabel: option('"category" | "value" | "percent" | column | expression', "Text at each sector's centroid: its category, its value, its percent of its pie, a column, or an expression; a label that would overlap a larger sector's is hidden.", { ts: "string | Expression" }),
      sectorLabelFormat: option("string", "A d3-format string for numeric sector labels.", { defaultText: '".0%" for "percent", ",.7~r" otherwise' }),
      textColor: option("color", "The sector labels' color.", { default: "#ffffff" }),
      fontSize: option("number", "The sector labels' font size.", { default: 12, units: "px" }),
      placement: option("{anchor, size}", "Where the pie goes in a Cartesian plot: anchor in data coordinates, size in pixels. In a polar plot the pie fills the disk.", { defaultText: "centered in the frame, across 90% of its shorter side", ts: "FramePlacement" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      fill: refine({ defaultText: "the category column" }),
    },
  },
  params: {
    value: undefined, category: undefined, by: undefined, sort: "none", startAngle: 0, endAngle: 360, padAngle: 0,
    innerRadius: 0, outerRadius: 1, sectorLabel: undefined, sectorLabelFormat: undefined, textColor: undefined,
    fontSize: undefined, placement: undefined, fill: undefined,
    _turn: undefined, _view: undefined, _label: undefined, _labelText: undefined, _labelSize: undefined, _labels: undefined,
  },
  theme: { kind: "Pie" },
  describe: { noun: "pie chart", units: ["sector", "sectors"] },
  // Connections: the sectors are polar Rects (angle, radius), so the middle of a sector's outer
  // arc is its box's top and the inner arc's its bottom.
  endpoint: { attachments: { outer: { alias: "top" }, inner: { alias: "bottom" } } },
  // What the Pie as a whole is told that its labels share (the wrapper gathers it).
  parts: ["_labels"],
  root: node("Transform", {
    kind: "PieGeometry", value: param("value"), category: param("category"), by: param("by"), sort: param("sort"),
    startAngle: param("startAngle"), endAngle: param("endAngle"), padAngle: param("padAngle"),
    innerRadius: param("innerRadius"), outerRadius: param("outerRadius"), turn: param("_turn"), view: param("_view"),
    label: param("_label"), labelFormat: param("sectorLabelFormat"), labelText: param("_labelText"), labelSize: param("_labelSize"),
  }, [
    node("Rect", { x0: "__pieStart", x1: "__pieEnd", y0: "__pieInner", y1: "__pieOuter", fill: coalesce(param("fill"), param("category")), ...rest() }),
    node("Text", {
      x: "__pieAngle", y: "__pieTextRadius", text: param("_labelText"), color: coalesce(param("textColor"), "#ffffff"), size: coalesce(param("fontSize"), 12),
      name: where(isMissing(prop("name")), null, add(prop("name"), " labels")),
    }, [], { id: "_labels", when: param("_labelText") }),
  ]),
});
