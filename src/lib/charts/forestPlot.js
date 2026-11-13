// @ts-check
// Estimates and supplied intervals; no statistical estimation happens in this pattern.
import { defineChart, following, isMissing, node, not, option, param, rest } from "../templates/define.js";

export default defineChart({
  kind: "ForestPlot",
  summary: "Point estimates with horizontal confidence intervals on categorical rows.",
  use: ["mark", "markSettings", "detail", "transparent"],
  omit: ["z", "position", "rows", "width", "widthScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Supply one row per estimate: `x` is the estimate, `y` the category, and `lower`/`upper` are absolute interval endpoints, not error distances. Intervals with missing or reversed bounds are omitted by ErrorBars; the estimate remains a point. `reference` optionally draws a RuleX (for example 0 for differences, 1 for ratios); it does not expand automatic domains. Points is the main part (`getMark()`), and accepts ordinary point props. Style the supporting parts with `interval={color: ..., capSize: ...}` and `referenceLine={color: ..., width: ...}` (Python `reference_line`). All values are supplied; this template computes no confidence intervals. Use Plot's x settings for log axes, titles and domain limits.",
  params: {
    x: option("channel", "Each row's point estimate.", { required: true, input: true }),
    y: option("channel", "Each estimate's category along y.", { required: true, input: true }),
    lower: option("channel", "Each interval's absolute lower x endpoint.", { required: true, input: true }),
    upper: option("channel", "Each interval's absolute upper x endpoint.", { required: true, input: true }),
    reference: option("channel", "Optional reference value along x; omitted means no reference line."),
    interval: option("object", "Props of the horizontal ErrorBars part, such as color, width and capSize.", { ts: '{ color?: ErrorBarsProps["color"]; width?: ErrorBarsProps["width"]; capSize?: ErrorBarsProps["capSize"]; opacity?: ErrorBarsProps["opacity"]; visible?: ErrorBarsProps["visible"]; label?: ErrorBarsProps["label"]; }' }),
    referenceLine: option("object", "Props of the optional RuleX part, such as color and width.", { ts: '{ color?: RuleXProps["color"]; width?: RuleXProps["width"]; opacity?: RuleXProps["opacity"]; visible?: RuleXProps["visible"]; label?: RuleXProps["label"]; }' }),
    data: option("table", "A table for this chart alone.", { languages: "python" }),
  },
  parts: ["interval", "referenceLine"],
  root: node("Mapping", {}, [
    node("RuleX", { x: param("reference"), color: "#8a949e", domains: false, rows: "auto" }, [], { id: "referenceLine", when: not(isMissing(param("reference"))) }),
    node("ErrorBars", { ...following(), y: param("y"), lower: param("lower"), upper: param("upper"), orientation: "horizontal", color: "#5b6470" }, [], { id: "interval" }),
    node("Points", { x: param("x"), y: param("y"), size: 5, ...rest() }, [], { id: "estimate", main: true }),
  ]),
});
