// @ts-check
// Compactness belongs to the host Plot. The optional label uses the final finite row in
// input order (after any caller Filter/Sort), not a new last-value transform.
import { and, dataExpression as expr, defineChart, following, isMissing, node, not, option, param, rest } from "../templates/define.js";

export default defineChart({
  kind: "Sparkline",
  summary: "A compact line with an optional reference band and final-value label.",
  use: ["mark", "markSettings", "transparent"],
  omit: ["z", "position", "rows", "fill", "fillScale", "size", "sizeScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Supply `x` and `y` in drawing order; this template does not sort. Set the host Plot's height and axes (for example height=100, axes2d=False) for a compact display. Optional `lower` and `upper` draw a BandY reference interval; supply both. The band follows the view without expanding its domain. Optional `text` labels the final row with finite x and y, in current input order after any enclosing Filter or Sort: a column (numbers are written as Text writes them), dictionary-encoded text or a literal. `band={...}` styles BandY and `last={...}` styles Text, including pixel dx/dy and size. Main-part props and `getMark()` belong to Line. The label reads one row of the same data; no separate table, callback or kernel is introduced.",
  params: {
    x: option("channel", "The ordered x coordinates of the line.", { required: true, input: true }),
    y: option("channel", "The line's values along y.", { required: true, input: true }),
    lower: option("channel", "Optional reference band's lower y bound; supply upper too."),
    upper: option("channel", "Optional reference band's upper y bound; supply lower too."),
    text: option("channel", "Optional column, dictionary text or literal for the final finite row; numbers are written as Text writes them."),
    band: option("object", "Props of the BandY reference part, such as fill and opacity.", { ts: '{ fill?: MarkProps["fill"]; opacity?: MarkProps["opacity"]; outlineColor?: MarkProps["outlineColor"]; outlineWidth?: MarkProps["outlineWidth"]; visible?: MarkProps["visible"]; label?: MarkProps["label"]; }' }),
    last: option("object", "Props of the final-row Text part, such as color, dx, dy and size.", { ts: '{ color?: TextProps["color"]; opacity?: TextProps["opacity"]; size?: TextProps["size"]; dx?: TextProps["dx"]; dy?: TextProps["dy"]; align?: TextProps["align"]; visible?: TextProps["visible"]; label?: TextProps["label"]; }' }),
    data: option("table", "A table for this chart alone.", { languages: "python" }),
  },
  parts: ["band", "last"],
  root: node("Mapping", {}, [
    node("BandY", { y0: param("lower"), y1: param("upper"), fill: "#788391", opacity: 0.15 }, [], { id: "band", when: and(not(isMissing(param("lower"))), not(isMissing(param("upper")))) }),
    node("Line", { x: param("x"), y: param("y"), ...rest() }, [], { id: "line", main: true }),
    node("Filter", { where: expr("logical_and", expr("is_finite", param("x")), expr("is_finite", param("y"))) }, [
      node("Filter", { where: expr("equal", expr("row"), expr("max", expr("row"))) }, [
        node("Text", { ...following(), x: param("x"), y: param("y"), text: param("text"), dx: 6, align: "left", legend: false }, [], { id: "last" }),
      ]),
    ], { when: not(isMissing(param("text"))) }),
  ]),
});
