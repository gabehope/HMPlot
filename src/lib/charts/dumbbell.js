// @ts-check
// A dumbbell chart (TODO 130.4): per category, a stem between two values and a point at each,
// colored by which column it comes from. Fold makes each row's two values two rows, so the
// points are one mark with a legend entry per column (fillScale picks their colors; a fill
// replaces them). The stems are a named part, stem={...}, and follow the chart's opacity,
// selection and animation, as a Lollipop's do.
import { defineChart, following, node, option, param, rest } from "../templates/define.js";


export default defineChart({
  kind: "Dumbbell",
  summary: "Two values per category, as points joined by a stem: before and after, or two groups.",
  use: ["mark", "markSettings", "detail", "transparent"],
  omit: ["x", "z", "position", "rows", "color", "colorScale", "colormap", "width", "widthScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Each row draws one dumbbell: a point at `x0` and one at `x1`, at its `y` category, joined by a stem. The points take a color per column, so the legend names the two columns.",
  params: {
    data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
    y: option("channel", "The categories along y, one dumbbell each.", { input: true, required: true }),
    x0: option("column", "The column of each dumbbell's first value.", { input: true, required: true }),
    x1: option("column", "The column of each dumbbell's second value.", { input: true, required: true }),
    stem: option("object", "The stems' own props, as one object: {color: \"black\", width: 1}. They are a Segments, gray and 2 px wide by default."),
  },
  label: "Dumbbell",
  parts: ["stem"],
  root: node("Mapping", {}, [
    node("Segments", { start: [param("x0"), param("y")], end: [param("x1"), param("y")], color: "#8a949e", width: 2,
      ...following() }, [], { id: "stem" }),
    node("Fold", { fields: [param("x0"), param("x1")], as: { key: "__dumbbellEnd", value: "__dumbbellX" } }, [
      node("Points", { x: "__dumbbellX", y: param("y"), fill: "__dumbbellEnd", ...rest() }),
    ]),
  ]),
});
