// @ts-check
// Screen-sized arrows are Segments with an arrow end (TODO 137.6). The template owns
// the chart's defaults and names; Segments owns fields, curves, interaction and disposal.
import { defineTemplate, option, refine, node, rest } from "../templates/define.js";

export default defineTemplate({
  kind: "Arrows",
  signature: {
    tier: "charts",
    summary: "Arrows from start to end, one per row, with heads sized in pixels.",
    extraProps: true,
    use: ["mark", "endsOptions", "maxInstancesOption", "interpolationOption", "markSettings", "transparent", "arrowSettings"],
    omit: ["brush", "drag", "fill", "fillScale", "nearby", "ondrag", "ondragend", "outlineColor", "outlineColorScale", "outlineWidth", "outlineOpacity", "position", "size", "sizeScale", "x", "y", "z"],
    options: {
      connections: option("connect()", "Draw between other marks instead of from start and end: connect(a, b, {key}) draws an arrow from a to b for each matched key.", { ts: 'import("../../plot/publicTypes.js").ConnectDescriptor' }),
      curve: option('"linear" | "step" | "step-before" | "step-after" | "link-horizontal" | "link-vertical" | "quadratic" | "cubic"', "How each arrow runs from start to end; the head follows the curve.", { default: "linear" }),
      control1: option("channel", "Each arrow's control point for a quadratic or cubic curve: a column of positions or an N x 2 (N x 3) array.", { input: true }),
      control2: option("channel", "Each arrow's second control point for a cubic curve.", { input: true }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      color: refine({ defaultText: "the theme's (#3478c7 in the default theme)" }),
      width: refine({ defaultText: "the theme's (2 in the default theme)" }),
      headLength: refine({ default: 10 }),
      headWidth: refine({ default: 8 }),
    },
  },
  params: {},
  theme: { kind: "Arrows", defaults: { color: "#3478c7", width: 2, headLength: 10, headWidth: 8 },
    only: ["color", "width", "opacity", "headLength", "headWidth"], beneath: true },
  endpoint: { attachments: {} },
  forbid: { lit: "Arrows is screen-sized and unlit: use Arrows3D for lit solid arrows." },
  label: "Arrows",
  describe: { noun: "arrows", units: ["arrow", "arrows"] },
  // Arrows historically reads width columns as CSS pixels. Keep that contract through
  // the segment binding's existing literal-width flag; direct Segments still uses widthScale.
  root: node("Segments", { curve: "linear", ...rest(), cap: "arrow", _widthPixels: true }),
});
