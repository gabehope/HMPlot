// @ts-check
// A waterfall chart (TODO 130.4): each row a change, drawn as a bar from the running total before
// it to the running total after it, so the bars step up and down from left to right. Calculate
// adds the totals, with the total after each step in an "Increase" or a "Decrease" column by its
// direction (the other missing, and both for a zero or missing change); Fold makes those two
// columns rows, Filter keeps the rows that have a total, and the Bar's fill is the direction, so
// a Legend names the increases and decreases (fillScale picks their colors). The two columns are
// named for the legend, so inside the chart they hide data columns of the same names. A missing
// change draws no bar, and the totals after it go on as if it were zero (cumsum's rule).
import { dataExpression, defineChart, node, option, param, rest } from "../templates/define.js";

const total = dataExpression("cumsum", param("y"));
const when = (/** @type {string} */ op) => dataExpression("where", dataExpression(op, param("y"), 0), total, NaN);

export default defineChart({
  kind: "Waterfall",
  summary: "A running total built from changes: each bar steps from the total before it to the total after it.",
  use: ["mark", "markSettings", "transparent"],
  omit: ["z", "position", "rows", "color", "colorScale", "colormap", "size", "sizeScale", "width", "widthScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Each row is one step: its `x` category and its change `y`, in the order the rows come. A bar spans the running total before the step to the total after it, and is filled by the change's direction, so a Legend names the increases and decreases. The steps are categories, numbers or dates alike; a zero or missing change draws no bar.",
  params: {
    data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
    x: option("column", "The column of the steps along x, one bar each, in row order.", { input: true, required: true }),
    y: option("column", "The column of each step's change: positive steps up, negative steps down.", { input: true, required: true }),
    bandFraction: option("number", "The share of its step's band each bar fills, 0 to 1; on a numeric axis, the bar's width in data units.", { default: 0.8 }),
  },
  label: "Waterfall",
  root: node("Calculate", { columns: { __waterfallStart: dataExpression("subtract", total, param("y")), Increase: when("greater"), Decrease: when("less") } }, [
    node("Fold", { fields: ["Increase", "Decrease"], as: { key: "__waterfallDirection", value: "__waterfallEnd" } }, [
      node("Filter", { where: { field: "__waterfallEnd", op: "finite" } }, [
        node("Bar", { x: param("x"), y: "__waterfallEnd", baseline: "__waterfallStart", fill: "__waterfallDirection",
          orientation: "vertical", bandFraction: param("bandFraction"), ...rest() }),
      ]),
    ]),
  ]),
});
