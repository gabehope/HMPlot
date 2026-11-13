// @ts-check
// A horizontal rule at y across the frame (a circle in a polar frame, a parallel on
// a map), a template since TODO 130.3: one Segments from end to end, its ends at the frame's
// visible edges in x unless x0 and x1 place them (read in the shader as the view moves:
// utils/frameEdges.js). One rule per row when a value reads a column, else one (rows="auto").
// Rules never widen automatic domains and have no legend entry of their own.
import { defineTemplate, option, refine, node, param, rest, coalesce } from "../templates/define.js";

export default defineTemplate({
  kind: "RuleY",
  signature: {
    tier: "charts",
    summary: "A horizontal reference line at y across the frame: one per row, or one at a value or the pointer.",
    use: ["mark", "maxInstancesOption", "markSettings", "transparent"],
    omit: ["rows", "domains", "x", "z", "position", "fill", "size", "outlineColor", "outlineWidth", "outlineOpacity", "fillScale", "colorScale", "colormap", "sizeScale", "widthScale", "outlineColorScale", "opacityScale", "options", "tooltip", "brush", "nearby", "nearest", "selectionOpacity", "drag", "ondrag", "ondragend", "enterEffect", "exitEffect"],
    options: {
      y: option("channel", 'Where the rule stands: a number, a time or a category draws one rule, a column one per row, and "@pointer_y" follows the pointer.', { required: true }),
      x0: option("channel", "Where the rule starts in x: a number or a column.", { defaultText: "the left of the frame's visible domain", input: true }),
      x1: option("channel", "Where the rule ends in x: a number or a column. By default the rule spans the frame as it pans and zooms.", { defaultText: "the right of the frame's visible domain", input: true }),
      color: option("color", "The rule's color.", { default: "#8a949e", defaultText: "the theme's rule gray", input: false }),
      width: option("number", "The rule's width.", { default: 1, defaultText: "1", units: "px", input: false }),
      dash: option("boolean | number | [number, number]", "Dash the rule: true (4 px dashes and gaps), a dash length (gaps as long), or [dash, gap], measured along the drawn rule.", { units: "px", ts: "boolean | number | [number, number]" }),
      opacity: option("number", "The rule's opacity, 0 to 1.", { default: 1, input: false }),
      name: option("string", "The rule's name in the settings pane."),
      select: option("boolean | selection", "Click a rule to select its row: true uses its data's selection, or give a selection().", { ts: "any" }),
      hover: option("boolean | selection", "Mark the rule under the pointer as @hovered, without fading the others: true uses its data's hover, or give a selection().", { ts: "any" }),
      respond: option('boolean | "selected" | "brushed" | "hovered" | "nearby" | selection | array', "Which interaction states fade the rules outside them.", { defaultText: "the states it sets, except hover", ts: "any" }),
      identity: option("identity", "Whose rows these are for selections: an identity() shared by tables that show the same things.", { defaultText: "its data's", ts: "any" }),
      visible: option("boolean", "Whether the rule is drawn.", { default: true }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      legend: refine({ default: false }),
    },
  },
  params: { y: undefined, x0: undefined, x1: undefined, color: undefined, width: undefined },
  theme: { kind: "RuleY", defaults: { color: "#8a949e", width: 1 }, values: { color: param("color"), width: param("width") }, only: ["color", "width", "opacity"] },
  describe: { noun: "rules" },
  root: node("Segments", {
    start: [coalesce(param("x0"), "@view_x_min"), param("y")], end: [coalesce(param("x1"), "@view_x_max"), param("y")],
    interpolation: "angular", legend: false, domains: false, rows: "auto", ...rest(),
  }),
});
