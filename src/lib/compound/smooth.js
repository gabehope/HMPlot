// @ts-check
// A fitted curve with its confidence band (TODO 47.1, a template since 130.3): a Regression,
// then a Area for the band (unless band is false) and a Line, the main part, for the fit. The
// theme's Smooth entry is routed per part: fill and opacity style the band, color and width the
// line; the band follows the line's visibility.
import { defineTemplate, option, refine, node, param, notEqual, rest } from "../templates/define.js";

export default defineTemplate({
  kind: "Smooth",
  signature: {
    tier: "charts",
    summary: "A fitted curve through a scatter, with its confidence band.",
    extraProps: true,
    use: ["mark", "samplingOption", "maxInstancesOption", "markSettings", "transparent"],
    omit: ["rows", "outlineColor", "outlineColorScale", "outlineWidth", "outlineOpacity", "brush", "drag", "nearby", "ondrag", "ondragend"],
    options: {
      x: option("column", "The column along x: the fit is of y on x.", { input: false, required: true }),
      y: option("column", "The column fitted, along y.", { input: false, required: true }),
      method: option('"linear" | "poly" | "log" | "exp" | "pow"', 'The model: a line, a polynomial of degree order, y on ln x ("log"), ln y on x ("exp"), or ln y on ln x ("pow").', { default: "linear" }),
      order: option("number", "The polynomial's degree for method \"poly\", 1 to 6.", { default: 2 }),
      samples: option("number", "How many points the curve is drawn through, evenly spaced across extent.", { default: 100 }),
      extent: option("[number, number]", "The x range the curve spans.", { defaultText: "the fitted rows' x range", units: "data units" }),
      band: option("number | false", "The confidence level of the band around the fit, or false for no band.", { default: 0.95, ts: "number | false" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      color: refine({ default: "#30343b", doc: "The fitted line's color." }),
      width: refine({ default: 2, doc: "The fitted line's width." }),
      fill: refine({ default: "#547ba2", doc: "The confidence band's color." }),
      opacity: refine({ default: 0.25, doc: "The confidence band's opacity, 0 to 1; the line stays opaque." }),
    },
  },
  params: {
    x: undefined, y: undefined, method: "linear", order: undefined, samples: undefined, extent: undefined, band: 0.95,
    color: undefined, width: undefined, fill: undefined, opacity: undefined,
  },
  theme: { kind: "Smooth", routed: true },
  describe: { noun: "fitted curve" },
  // The line's own fill and opacity are not the Smooth's: those style its band.
  mainSettings: { omit: ["fill", "opacity"] },
  root: node("Regression", {
    x: param("x"), y: param("y"), method: param("method"), order: param("order"), samples: param("samples"),
    extent: param("extent"), band: param("band"),
  }, [
    node("ThemeDefaults", { kind: "Smooth", defaults: { fill: "#547ba2", opacity: 0.25 }, values: { fill: param("fill"), opacity: param("opacity") }, only: ["fill", "opacity"] }, [
      node("Area", { x: "x", lower: "lower", upper: "upper", legend: false }),
    ], { when: notEqual(param("band"), false) }),
    node("ThemeDefaults", { kind: "Smooth", defaults: { color: "#30343b", width: 2 }, values: { color: param("color"), width: param("width") }, only: ["color", "width"] }, [
      node("Line", { x: "x", y: "y", ...rest({ omit: ["name"] }) }, [], { main: true }),
    ]),
  ], { id: "fit" }),
});
