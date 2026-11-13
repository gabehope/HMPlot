// @ts-check
// Each group's distribution as a mirrored density curve (a template since TODO 130.3): a Density
// by category gives each violin's lower and upper edges along the measurement axis, a Area, the
// main part, draws them, and an Anchor registers the categories with the category axis. The
// wrapper settles the orientation (from which of x and y is categorical), so the definition always
// names one.
import { defineTemplate, option, refine, node, param, rest, where, equal } from "../templates/define.js";

const horizontal = equal(param("orientation"), "horizontal");
const category = where(horizontal, param("y"), param("x")), measurement = where(horizontal, param("x"), param("y"));

export default defineTemplate({
  kind: "Violin",
  signature: {
    tier: "charts",
    summary: "Violin plots: each group's distribution as a mirrored density curve.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "markSettings", "detail", "lit", "transparent"],
    omit: ["rows", "brush", "drag", "nearby", "ondrag", "ondragend", "width", "widthScale"],
    options: {
      x: option("channel", "The groups along x, a violin each, or the measurements for horizontal violins.", { required: true }),
      y: option("channel", "The measurements for vertical violins, or the groups along y for horizontal ones.", { required: true }),
      orientation: option('"horizontal" | "vertical"', "Vertical violins stand on categories along x; horizontal violins sit on categories along y.", { defaultText: "from which of x and y is categorical" }),
      scale: option('"width" | "count" | "area"', "How the violins' sizes compare: equally wide (\"width\"), equal in area (\"area\"), or with areas in proportion to their groups' rows (\"count\").", { default: "width", ts: '"width" | "area" | "count"' }),
      side: option('"left" | "right" | "both"', "Draw the density on both sides of its category, or on one side only (a half violin).", { default: "both", ts: '"both" | "left" | "right"' }),
      bandwidth: option('number | "auto"', "The width of the Gaussian kernel; \"auto\" picks it by Scott's rule.", { default: "auto", units: "data units", ts: '"auto" | number' }),
      resolution: option("number", "How many points along the measurement axis the density is evaluated at.", { default: 256 }),
      bandFraction: option("number", "The share of its category's band each violin may fill, 0 to 1; on a numeric axis, a width in data units.", { default: 0.8 }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      fill: refine({ default: "#547ba2" }),
      opacity: refine({ default: 0.35 }),
      outlineColor: refine({ default: "#30343b" }),
      outlineWidth: refine({ default: 1, units: "px" }),
    },
  },
  params: {
    x: undefined, y: undefined, orientation: "vertical", scale: "width", side: "both", bandwidth: "auto", resolution: 256, bandFraction: 0.8,
    fill: undefined, opacity: undefined, outlineColor: undefined, outlineWidth: undefined, outlineOpacity: undefined,
  },
  theme: {
    kind: "Violin", defaults: { fill: "#547ba2", opacity: 0.35, outlineColor: "#30343b", outlineWidth: 1 },
    values: { fill: param("fill"), opacity: param("opacity"), outlineColor: param("outlineColor"), outlineWidth: param("outlineWidth"), outlineOpacity: param("outlineOpacity") },
  },
  describe: { noun: "violin plot" },
  // The violin's share of its band is bandFraction (R2.0); a width would draw over it.
  forbid: { width: "Violin.width is not a prop: bandFraction sets the violin's share of its band." },
  root: node("Density", {
    x: measurement, by: category, bandwidth: param("bandwidth"), resolution: param("resolution"),
    violin: { scale: param("scale"), width: param("bandFraction"), side: param("side"), orientation: param("orientation") },
  }, [
    // The density's positions run along the measurement axis: a vertical violin's band is a
    // horizontal Area over y. A name reaches no part, as with the hand-written Violin.
    node("Area", {
      x: where(horizontal, "x", null), y: where(horizontal, null, "x"), orientation: where(horizontal, null, "horizontal"),
      lower: "__violinLower", upper: "__violinUpper", ...rest({ omit: ["name"] }),
    }),
    node("Anchor", { x: where(horizontal, "x", param("x")), y: where(horizontal, param("y"), "x") }),
  ]),
});
