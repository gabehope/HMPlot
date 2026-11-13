// @ts-check
// A callout (TODO 46), a template since TODO 130.3: text a fixed number of pixels (dx,
// dy) from its point, with a leader line from near the point to the text: one Text with a
// leader. Since TODO 134.29 the text has no box but a halo of the plot's background (box=true
// brings the box back), and the theme sizes and colors it as it does Text (utils/theme.js). align="auto" sets each row's text on the side of the
// point it is offset to. One callout per row when x, y, text, dx or dy read columns,
// else one (rows="auto"). No legend entry of its own.
import { defineTemplate, option, refine, node, param, rest } from "../templates/define.js";

export default defineTemplate({
  kind: "Callout",
  signature: {
    tier: "charts",
    summary: "A note a fixed distance from a point, with a leader line to the point.",
    extraProps: true,
    use: ["mark", "maxInstancesOption"],
    omit: ["rows", "domains", "outlineColor", "outlineColorScale", "outlineWidth", "outlineOpacity", "brush", "drag", "nearby", "ondrag", "ondragend", "position", "z"],
    options: {
      x: option("channel", "The x of the point the callout points at: a number or a time draws one callout, a column one per row."),
      y: option("channel", "The y of the point the callout points at."),
      text: option("string | number | column | (string | number)[]", "The text: a string or a number, or a column of them for a callout per row.", { ts: "string | number | Array<string | number> | DictionaryColumn" }),
      dx: option("channel", "How far right of its point the text sits (left when negative): a number or a column.", { default: 24, units: "px", input: true }),
      dy: option("channel", "How far below its point the text sits (above when negative): a number or a column.", { default: -24, units: "px", input: true }),
      box: option("boolean | {fill, outlineColor, outlineWidth, padding, radius, opacity}", "A box behind the text: true for white with a gray outline, or its style. Without one the text has a halo of the plot's background.", { default: false, ts: "boolean | LabelBox" }),
      leader: option("boolean | {color, width}", "The line from near the point to the text (or its box): true (1.5 px in the text's color), false, or its color and width.", { default: true, ts: "boolean | LabelLeader" }),
      align: option('"left" | "center" | "right" | "auto"', "How the text sits at its offset; \"auto\" puts each row's text on the side of the point it is offset to.", { default: "auto" }),
      font: option("string", "The text's font, a CSS font-family.", { defaultText: "the plot's font" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      color: refine({ defaultText: "the theme's text color, as Text's", doc: "The text's color: a CSS color, or a column mapped to colors." }),
      size: refine({ defaultText: "the theme's font size, as Text's (14 in the default theme)", doc: "The text's font size: a number, or a column mapped to sizes." }),
      legend: refine({ default: false }),
    },
  },
  params: { x: undefined, y: undefined, text: undefined, dx: 24, dy: -24, box: false, leader: true, align: "auto", color: undefined, size: undefined },
  theme: { kind: "Callout", defaults: { color: "#30343b", size: 12 }, values: { color: param("color"), size: param("size") }, only: ["color", "size", "opacity", "font"] },
  describe: { noun: "callouts", units: ["callout", "callouts"] },
  root: node("Text", {
    x: param("x"), y: param("y"), text: param("text"), dx: param("dx"), dy: param("dy"), align: param("align"),
    box: param("box"), leader: param("leader"), _halo: true, legend: false, rows: "auto", ...rest(),
  }),
});
