// @ts-check
// Bars from a baseline to each value (a template since TODO 130.2): BarGeometry lays them out
// (one way or the other, stacked, grouped or overlapping), and one Prism draws them. Bars that
// share a category stack by default, from zero; a baseline places each bar by hand, so it
// overlaps unless asked. The series is the column fill (or color) names: its order stacks them,
// and each gets the same slot in every category when grouped.
import { defineTemplate, option, refine, node, param, prop, rest, where, isMissing, coalesce, equal } from "../templates/define.js";

const arrangement = where(isMissing(param("arrange")), where(equal(param("baseline"), 0), "stack", "overlap"), param("arrange"));
const grouped = (/** @type {string} */ column) => where(equal(arrangement, "group"), column, null);

export default defineTemplate({
  kind: "Bar",
  signature: {
    tier: "charts",
    summary: "Bars from a baseline to a value, one per row, on a categorical axis.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "rotationOption", "shapeOptions", "markSettings", "lit", "transparent"],
    omit: ["rows", "brush", "drag", "nearby", "ondrag", "ondragend", "width", "widthScale"],
    options: {
      x: option("channel", "The categories along x for vertical bars, or the values the bars reach for horizontal ones.", { required: true }),
      y: option("channel", "The values the bars reach for vertical bars, or the categories along y for horizontal ones.", { required: true }),
      orientation: option('"horizontal" | "vertical"', "Vertical bars rise from categories on x; horizontal bars run from categories on y.", { defaultText: "from which of x and y is categorical" }),
      baseline: option("channel", "Where each bar starts on the value axis: a number or a column.", { default: 0, input: true }),
      bandFraction: option("number", "The share of its category's band each bar fills, 0 to 1; on a numeric axis, the bar's width in data units.", { default: 0.8 }),
      arrange: option('"stack" | "group" | "overlap"', 'Bars that share a category: "stack" stacks them from zero in the order of the column fill (or color) names, "group" sets them side by side with each fill value in the same slot of every category, "overlap" draws each from its baseline. One bar per category draws the same in all three.', { defaultText: '"stack" ("overlap" with a baseline)', input: true }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      fill: refine({ defaultText: "the theme's first palette color (#3478c7 in the default theme)" }),
    },
  },
  params: { x: undefined, y: undefined, orientation: undefined, baseline: 0, bandFraction: 0.8, arrange: undefined },
  theme: { kind: "Bar" },
  describe: { noun: "bar chart", units: ["bar", "bars"] },
  // The bar's share of its band is bandFraction (R2.0); a width would draw over it.
  forbid: { width: "Bar.width is not a prop: bandFraction sets the bar's share of its band." },
  // Connections: a bar's value and baseline ends, the upper or lower edge of its box by which is
  // larger (a negative bar's value end is its lower edge), besides the Prism's box attachments.
  endpoint: {
    attachments: {
      baseline: { end: "__barValue", from: "__barBaseline", opposite: true },
      value: { end: "__barValue", from: "__barBaseline" },
    },
  },
  // BarGeometry's outputs are the same whichever way the bars run: one Prism draws both.
  root: node("Transform", {
    kind: "BarGeometry", x: param("x"), y: param("y"), orientation: param("orientation"), baseline: param("baseline"),
    arrange: arrangement, series: coalesce(prop("fill"), prop("color")), bandFraction: param("bandFraction"),
  }, [
    node("Prism", {
      x: "__barX", y: "__barY", width: "__barSizeX", depth: "__barSizeY",
      xOffset: grouped("__barOffsetX"), yOffset: grouped("__barOffsetY"), z0: 0, z1: 0, axis: "z",
      ...rest({ omit: ["name"] }),
    }),
  ]),
});
