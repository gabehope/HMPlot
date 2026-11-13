// R2.5: validation errors name the component (or the option, function or resource) and say what to
// pass instead. A representative set of the JavaScript side's, one per kind of mistake; Python's
// are in python/tests/test_api_consistency.py (test_errors_name_the_component_and_what_to_pass).
import test from "node:test";
import assert from "node:assert/strict";
import { scaleProps } from "../../src/lib/plot/utils/scaleProps.js";
import { normalizeColormap } from "../../src/lib/plot/utils/colormap.js";
import { validateBands } from "../../src/lib/plot/utils/axes.js";
import { selection } from "../../src/lib/plot/utils/interaction.js";
import { normalizeFacetSpec } from "../../src/lib/plot/utils/facetSpec.js";
import { rectangleArrays } from "../../src/lib/plot/utils/rectangles.js";
import { titleSize } from "../../src/lib/plot/utils/textLayout.js";
import { validateTheme } from "../../src/lib/plot/utils/theme.js";

const ERRORS = [
  [() => scaleProps({ offsetX: 12 }, "Points"), "Points: offsetX", /pass dx for a pixel offset/],
  [() => scaleProps({ offsetY: -8 }, "Text"), "Text: offsetY", /pass dy for a pixel offset/],
  [() => scaleProps({ fillDomain: [0, 1] }, "Points"), "Points: fillDomain", /fillScale=\{continuous\(\{ domain: \[lo, hi\] \}\)\}.*Python: fill_scale=hm\.continuous\(domain=\[lo, hi\]\)/],
  [() => scaleProps({ displayScale: 2 }, "Points"), "Points: displayScale", /set its pixel sizes \(size, width, outlineWidth/],
  [() => validateTheme({ marks: { Points: { displayScale: 2 } } }), "theme.marks.Points.displayScale", /size, width and outlineWidth/],
  [() => normalizeColormap({ colors: ["red", "blue"], stops: [] }), "colormap", /takes colors, space and positions/],
  [() => validateBands([{ axis: "z", from: 0, to: 1 }]), "band's axis", /"x" or "y"/],
  [() => selection().replace([1]), "selection", /pass the data's identity first, as in replace\(identity, rows\)/],
  [() => normalizeFacetSpec({ row: "a", wrap: 2.5 }), "Facet wrap", /a positive integer \(cells per line\)/],
  [() => rectangleArrays("rect", { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0 }), "Rect", /pass both, or neither/],
  [() => titleSize("huge", 12), "Title size", /"title", "subtitle", "caption" or a number of pixels/],
];

test("validation errors name the component and say what to pass instead (R2.5)", () => {
  for (const [make, component, fix] of ERRORS) {
    assert.throws(make, (error) => {
      assert.ok(error.message.includes(component), `${error.message} names ${component}`);
      assert.match(error.message, fix);
      return true;
    });
  }
});
