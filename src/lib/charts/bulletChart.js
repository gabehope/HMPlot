// @ts-check
// Supplied range columns become overlapping background bars, largest first. Alpha layering
// gives nearer qualitative ranges darker shades without a fixed number of range keywords.
import { dataExpression as expr, defineChart, following, isMissing, node, not, option, param, rest } from "../templates/define.js";

export default defineChart({
  kind: "BulletChart",
  summary: "Actual values, target ticks and supplied qualitative ranges on categorical rows.",
  use: ["mark", "markSettings", "transparent"],
  omit: ["z", "position", "rows", "color", "colorScale", "colormap", "size", "sizeScale", "width", "widthScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Each row supplies actual `x`, category `y`, and optionally `target`. `fields` is a list of columns containing qualitative upper bounds, such as `[\"poor\", \"fair\", \"good\"]`; omit it to omit the ranges. Bounds must be at or above `baseline` and describe cumulative ranges from it. Fold and Sort draw the largest background bar first, with alpha layering distinguishing the smaller ranges; bounds need not be passed in order. Missing bounds are not drawn. Main-part props style the actual horizontal Bar; `ranges={...}` styles its background Bars and `tick={...}` styles the target Prism. The tick is 0.6 category bands high and 0.4% of the visible x span wide; its width/depth can be overridden in the tick part, in data units. Values and bounds are supplied, never estimated. Keep one row per bullet; repeated categories overlap. Use Plot for axis/domain settings.",
  params: {
    x: option("channel", "The actual value for each bullet.", { required: true, input: true }),
    y: option("channel", "Each bullet's category along y.", { required: true, input: true }),
    target: option("channel", "Optional target value for each bullet."),
    fields: option("column[]", "Columns of cumulative qualitative upper bounds, all at or above baseline."),
    baseline: option("number", "The common starting value for actual and range bars.", { default: 0 }),
    bandFraction: option("number", "The share of a category band occupied by the actual bar.", { default: 0.3 }),
    ranges: option("object", "Props of the background Bar part, such as fill, fillScale and opacity.", { ts: '{ fill?: BarProps["fill"]; fillScale?: BarProps["fillScale"]; opacity?: BarProps["opacity"]; outlineColor?: BarProps["outlineColor"]; outlineWidth?: BarProps["outlineWidth"]; visible?: BarProps["visible"]; label?: BarProps["label"]; }' }),
    tick: option("object", "Props of the target Prism part, such as fill, width and depth.", { ts: '{ fill?: PrismProps["fill"]; width?: PrismProps["width"]; depth?: PrismProps["depth"]; opacity?: PrismProps["opacity"]; visible?: PrismProps["visible"]; label?: PrismProps["label"]; }' }),
    data: option("table", "A table for this chart alone.", { languages: "python" }),
  },
  parts: ["ranges", "tick"],
  root: node("Mapping", {}, [
    node("Fold", { fields: param("fields"), as: { key: "__bulletRange", value: "__bulletBound" } }, [
      node("Filter", { where: expr("greater_equal", "__bulletBound", param("baseline")) }, [
        node("Sort", { by: "__bulletBound", order: "desc" }, [
          node("Bar", { ...following(), x: "__bulletBound", y: param("y"), baseline: param("baseline"), orientation: "horizontal", arrange: "overlap", bandFraction: 0.8, fill: "#788391", opacity: 0.2, legend: false }, [], { id: "ranges" }),
        ]),
      ]),
    ], { when: not(isMissing(param("fields"))) }),
    node("Bar", { x: param("x"), y: param("y"), baseline: param("baseline"), orientation: "horizontal", arrange: "overlap", bandFraction: param("bandFraction"), ...rest() }, [], { id: "actual", main: true }),
    node("Prism", { ...following(), x: param("target"), y: param("y"), width: expr("multiply", expr("subtract", "@view_x_max", "@view_x_min"), 0.004), depth: 0.6, z0: 0, z1: 0, axis: "z", fill: "#30343b", legend: false }, [], { id: "tick", when: not(isMissing(param("target"))) }),
  ]),
});
