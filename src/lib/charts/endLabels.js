// @ts-check
// Labels at the ends of lines (TODO 136.16 slice 7): each series' last (or first) row with
// finite x and y, in input order after any enclosing Filter or Sort, labelled with the series'
// name or a value beside its point. The label room is the Text's: in the plot's own frame a
// pixel inset of the plot area, so the labels never widen the domain or misalign linked panels.
import { coalesce, dataExpression as expr, defineChart, equal, node, option, param, rest, where } from "../templates/define.js";

/** The row index the label takes, per series: the last or the first. */
const end = (reduce) =>
  expr(reduce, expr("row"), { __expressionLiteral: true, by: param("series") });

export default defineChart({
  kind: "EndLabels",
  summary: "Labels at the ends of lines: each series' name or value beside its last (or first) point.",
  use: ["mark", "markSettings", "transparent"],
  omit: ["z", "position", "rows", "fill", "fillScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Draw it beside the Line it labels, with the same `x`, `y` and `series`: each series gets one label at its last row with finite x and y (`at=\"first\"` for its first), in current input order after any enclosing Filter or Sort. The label is the series' name by default; `text` takes a column instead, such as the y values (numbers are written as Text writes them, or in `format`). Give `color` the Line's color column and color scale so each label matches its line. The labels sit `dx` pixels beside their points; in the plot's own frame the room they need is a pixel inset of the plot area, so they never widen the axis or misalign linked plots. Labels of series that end close together are spread apart along y, each by the least that clears its neighbours, again as the view moves.",
  params: {
    x: option("channel", "The line's x: the label sits beside the end point's.", { required: true, input: true }),
    y: option("channel", "The line's y.", { required: true, input: true }),
    series: option("column", "The column naming each line, as the Line's series; without it, one label at the data's end."),
    text: option("channel", "What each label says: a column (numbers are written as Text writes them) or a literal.", { defaultText: "the series' name" }),
    format: option("string", "How numbers in the text are written: a d3-format string (\",.0f\", \".1%\"), or a %-pattern for dates."),
    at: option('"last" | "first"', "Which end of each series is labelled.", { default: "last" }),
    dx: option("number", "How far right of its point each label starts (left of it when negative; at the first end, its default is -6 and the label ends there).", { units: "px", defaultText: "6 at the last end, -6 at the first" }),
    data: option("table", "A table for this mark alone.", { languages: "python" }),
  },
  root: node("Filter", { where: expr("logical_and", expr("is_finite", param("x")), expr("is_finite", param("y"))) }, [
    node("Filter", { where: expr("equal", expr("row"), where(equal(param("at"), "first"), end("min"), end("max"))) }, [
      node("Text", {
        x: param("x"), y: param("y"),
        text: coalesce(param("text"), param("series")),
        format: param("format"),
        dx: coalesce(param("dx"), where(equal(param("at"), "first"), -6, 6)),
        align: where(equal(param("at"), "first"), "right", "left"),
        legend: false,
        // Labels that would overlap are spread apart along y (labels.svelte).
        _spread: true,
        ...rest(),
      }, [], { id: "label", main: true }),
    ]),
  ]),
});
