// @ts-check
// A reference interval is one Rect; its orthogonal endpoints are frame-edge channels,
// so panning and zooming need no geometry recomputation or template-specific renderer.
import { defineChart, node, option, param, rest } from "../templates/define.js";

export default defineChart({
  kind: "BandX",
  summary: "A vertical shaded reference interval spanning the visible frame.",
  use: ["mark", "maxInstancesOption", "markSettings", "transparent"],
  omit: ["x", "y", "z", "position", "rows", "domains", "color", "colorScale", "colormap", "size", "sizeScale", "width", "widthScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Use `BandX(x0=2, x1=4, fill=\"#3478c7\")` in Python, or `<BandX x0={2} x1={4} fill=\"#3478c7\" />` from `hmplot/charts`. Bounds are data coordinates (numbers, dates or column names). Constant bounds draw one band; columns draw one per row. The other dimension follows the frame's visible domain as it pans and zooms. Bands do not widen automatic domains and have no legend entry unless `legend=True` is set. Use `fill`, `opacity` and Rect's outline styling; compose Text or Callout for an annotation (`label` is the legend/settings label). Place a band before foreground marks. This is Plotly's `add_vrect` pattern; `RuleX(x=...)` and `RuleY(y=...)` cover `add_vline` and `add_hline`. For a rectangle bounded in both dimensions, use Rect. These are frame-coordinate bands, not screen overlays; in non-Cartesian frames they follow Rect's coordinate mapping.",
  params: {
    x0: option("channel", "The interval's starting x coordinate: a number, date or column.", { required: true, input: true }),
    x1: option("channel", "The interval's ending x coordinate: a number, date or column.", { required: true, input: true }),
    opacity: option("number", "The band's opacity, 0 to 1.", { default: 0.15 }),
    legend: option("boolean", "Include the band in a legend.", { default: false }),
    data: option("table", "A table for this band alone.", { languages: "python" }),
  },
  root: node("Rect", {
    x0: param("x0"), x1: param("x1"), y0: "@view_y_min", y1: "@view_y_max",
    domains: false, rows: "auto", opacity: param("opacity"), legend: param("legend"), ...rest(),
  }),
});
