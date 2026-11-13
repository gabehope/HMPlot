// @ts-check
// A stem from the baseline to each value and a head at the value (a template since TODO 130.3):
// BarGeometry places each row's base and tip (overlapping, never stacked), a Segments draws the
// stem between them and Points, the main part, the head at the tip. The theme's Lollipop entry is
// routed per part: color and width style the stems, the rest the heads. The wrapper settles the
// orientation (two numeric axes are a vertical stem plot, which BarGeometry would refuse), so the
// definition always names one.
import { defineTemplate, option, refine, node, param, prop, rest, where, isMissing, add, coalesce } from "../templates/define.js";

const z = isMissing(param("z"));
const end = (/** @type {"Base" | "Tip"} */ at) => where(z, [`__bar${at}X`, `__bar${at}Y`], [`__bar${at}X`, `__bar${at}Y`, param("z")]);

export default defineTemplate({
  kind: "Lollipop",
  signature: {
    tier: "charts",
    summary: "A stem from a baseline to each value, with a point at its end.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "rotationOption", "shapeOptions", "sizeUnitsOption", "markSettings", "detail", "lit", "transparent"],
    omit: ["rows", "brush", "drag", "nearby", "ondrag", "ondragend"],
    options: {
      x: option("channel", "The categories along x for vertical stems, or the values the stems reach for horizontal ones.", { required: true }),
      y: option("channel", "The values the stems reach for vertical stems, or the categories along y for horizontal ones.", { required: true }),
      orientation: option('"horizontal" | "vertical"', 'Whether the stems run along y ("vertical") or along x ("horizontal").', { defaultText: "horizontal when only y is categorical, else vertical" }),
      baseline: option("channel", "Where the stems start: a number or a column. Values on either side of it get a stem.", { default: 0, input: true }),
      stem: option("object", "The stems' own Segments props, as one object: {color: \"gray\", width: 2, dash: [2, 2]}. Defaults to the Lollipop theme's color and width (#8a949e and 1.5 pixels)."),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      size: refine({ default: 5, doc: "The heads' diameter in CSS pixels: a number, or a column mapped through sizeScale (by default onto the automatic size range)." }),
    },
  },
  params: {
    x: undefined, y: undefined, z: undefined, orientation: "vertical", baseline: 0,
    size: undefined, stem: undefined, _headX: "__barTipX", _headY: "__barTipY", _headZ: undefined,
  },
  theme: { kind: "Lollipop", routed: true },
  describe: { noun: "lollipop chart", units: ["stem", "stems"] },
  forbid: {
    stemColor: "Lollipop.stemColor was removed: pass stem={{ color: ... }} instead.",
    stemWidth: "Lollipop.stemWidth was removed: pass stem={{ width: ... }} instead.",
  },
  // `stem` is the stems' props, given as one object.
  parts: ["stem"],
  root: node("Transform", { kind: "BarGeometry", x: param("x"), y: param("y"), orientation: param("orientation"), baseline: param("baseline"), arrange: "overlap" }, [
    node("ThemeDefaults", { kind: "Lollipop", defaults: { color: "#8a949e", width: 1.5 }, only: ["color", "width", "opacity"] }, [
      node("Segments", { name: where(isMissing(prop("name")), null, add(prop("name"), " stems")), start: end("Base"), end: end("Tip") }, [], { id: "stem" }),
    ]),
    node("ThemeDefaults", { kind: "Lollipop", defaults: { size: 5 }, values: { size: param("size") }, except: ["color", "width"] }, [
      node("Points", { x: param("_headX"), y: param("_headY"), z: coalesce(param("_headZ"), param("z")), ...rest() }),
    ]),
  ]),
});
