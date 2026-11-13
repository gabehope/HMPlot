// @ts-check
// A crosshair (TODO 45, a template since 130.3): a rule at @pointer_x and one at @pointer_y in the
// frame it is placed in (Segments from the frame's visible edge to edge, as RuleX's and RuleY's),
// and a readout of each value, finer than the ticks (Text format="axis"). readoutPosition="edges"
// sets the readouts just inside the frame's bottom (x) and left (y) edges; "pointer" one label
// beside the pointer holds both, for a polar frame or a map, whose rules have no edge to pin to.
// Nothing draws where the pointer is missing: off the frame, and in exports.
import { defineTemplate, option, node, param, where, equal, notEqual, and, isMissing, add } from "../templates/define.js";

const xRule = notEqual(param("axes"), "y"), yRule = notEqual(param("axes"), "x");
const edges = and(param("readout"), equal(param("readoutPosition"), "edges"));
/** @param {"x" | "y"} axis @param {unknown[]} start @param {unknown[]} end */
const rule = (axis, start, end) => node("Segments", {
  name: where(isMissing(param("name")), null, add(param("name"), ` ${axis}`)),
  start, end, interpolation: "angular", legend: false, domains: false, rows: "auto", dash: param("dash"),
}, [], { when: axis === "x" ? xRule : yRule });
const label = { color: param("textColor"), align: "left", legend: false, domains: false, format: "axis" };

export default defineTemplate({
  kind: "Crosshair",
  signature: {
    tier: "charts",
    summary: "Rules that follow the pointer across the frame, with a readout of its x and y.",
    options: {
      axes: option('"x" | "y" | "xy"', 'Which rules to draw: a vertical one ("x"), a horizontal one ("y"), or both.', { default: "xy" }),
      readout: option("boolean", "Show the pointer's value on each axis, finer than the ticks, where readoutPosition puts it.", { default: true }),
      readoutPosition: option('"edges" | "pointer"', "Where the readouts sit: just inside the frame's bottom (x) and left (y) edges, or as one label beside the pointer, for a polar frame or a map, whose rules have no edge to pin to.", { default: "edges" }),
      color: option("color", "The rules' color.", { default: "#40505d" }),
      width: option("number", "The rules' width.", { default: 1, units: "px" }),
      dash: option("boolean | number | [number, number]", "Dash the rules: true (4 px dashes and gaps), a dash length (gaps as long), or [dash, gap], measured along the drawn rules.", { units: "px", ts: "boolean | number | [number, number]" }),
      textColor: option("color", "The readouts' text color.", { default: "#40505d" }),
      name: option("string", "The rules' name in the settings pane."),
    },
  },
  params: { axes: "xy", readout: true, readoutPosition: "edges", color: undefined, width: undefined, dash: undefined, textColor: "#40505d", name: undefined },
  // The rules take theme.marks.Crosshair; the readouts take only their textColor.
  theme: { kind: "Crosshair", routed: true },
  describe: { noun: null },
  root: node("DataBoundary", { data: { readout: [0] } }, [
    node("ThemeDefaults", {
      kind: "Crosshair", defaults: { color: "#40505d", width: 1 }, values: { color: param("color"), width: param("width") }, only: ["color", "width", "opacity"],
    }, [
      rule("x", ["@pointer_x", "@view_y_min"], ["@pointer_x", "@view_y_max"]),
      rule("y", ["@view_x_min", "@pointer_y"], ["@view_x_max", "@pointer_y"]),
    ]),
    // The readouts are left out of the description (it would say "with labels").
    node("Undescribed", {}, [
      node("Text", { x: "@pointer_x", y: "@view_y_min", text: "@pointer_x", dx: 4, dy: -9, rows: "auto", ...label }, [],
        { id: "xReadout", when: and(edges, xRule) }),
      node("Text", { x: "@view_x_min", y: "@pointer_y", text: "@pointer_y", dx: 6, dy: 7, rows: "auto", ...label }, [],
        { id: "yReadout", when: and(edges, yRule) }),
      node("Text", {
        x: "@pointer_x", y: "@pointer_y", dx: 8, dy: 8, rows: "auto", ...label,
        text: where(equal(param("axes"), "x"), "@pointer_x", where(equal(param("axes"), "y"), "@pointer_y", "@pointer")),
      }, [], { when: and(param("readout"), equal(param("readoutPosition"), "pointer")) }),
    ]),
  ]),
});
