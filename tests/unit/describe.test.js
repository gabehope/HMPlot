import test from "node:test";
import assert from "node:assert/strict";
import { describePlot, describeAxis, listed, plotDescription, stateTitle } from "../../src/lib/plot/utils/describe.js";

// TODO 49: descriptions of plots.

test("a plot is described by its marks, axes, legend categories and rows", () => {
  assert.equal(describePlot({
    marks: [{ kind: "Points", x: "length (mm)", y: "mass (g)", fill: "species", categories: { fill: ["Adelie", "Chinstrap", "Gentoo"] }, rows: 344 }],
    axes: { x: { low: "32", high: "60" }, y: { low: "2700", high: "6300" } },
  }), "Scatter plot of mass (g) against length (mm), colored by species (Adelie, Chinstrap, Gentoo). x from 32 to 60, y from 2700 to 6300. 344 points.");
  assert.equal(describePlot({ marks: [{ kind: "Histogram", x: "mass", rows: 30 }], axes: { x: { low: "2700", high: "6300" } } }),
    "Histogram of mass in 30 bins. x from 2700 to 6300.");
  assert.equal(describePlot({ marks: [{ kind: "Line", x: "date", y: "price", color: "ticker", rows: 1 }, { kind: "Points", x: "date", y: "price" },
    { kind: "Crosshair" }, { kind: "RuleY", y: "price" }, { kind: "Text" }, { kind: "Area" }],
    axes: { x: { kind: "datetime", low: "Jan 01, 2026", high: "Apr 30, 2026" }, y: { kind: "log", low: "1", high: "1000" } }, moving: "animated" }),
    "Line chart of price against date, colored by ticker, with scatter plot of price against date and rules of price and 2 more layers. x from Jan 01, 2026 to Apr 30, 2026, y from 1 to 1000 (log scale). 1 row. It is animated; this describes it at rest.");
  assert.equal(describePlot({ marks: [{ kind: "Rect", x: "species", y: "count", size: "mass", shape: "island", rows: 3 }],
    axes: { x: { categories: ["Adelie", "Chinstrap", "Gentoo"] } }, facet: { cells: 3, by: ["island"] }, moving: "simulated" }),
    "Rectangles of count against species, sized by mass, shaped by island. x: Adelie, Chinstrap, Gentoo. 3 rectangles. In 3 panels by island. It moves as a simulation runs; this describes it at rest.");
  assert.equal(describePlot({ marks: [{ kind: "Points", x: "angle", y: "r" }], coordinates: "polar", axes: { x: { low: "0", high: "360" }, y: { low: "0", high: "1" } } }),
    "Scatter plot of r against angle, in polar coordinates. angle from 0 to 360, radius from 0 to 1.");
  assert.equal(describePlot({ marks: [{ kind: "GeoJSON" }], coordinates: "spherical", projection: "equal-earth", axes: {} }), "Map, in the equal-earth projection.");
  assert.equal(describePlot({ marks: [{ kind: "Points", x: "lon", y: "lat" }], coordinates: "spherical", projection: "orthographic" }), "Scatter plot of lat against lon, on a globe.");
  assert.equal(describePlot({ marks: [{ kind: "Heatmap", x: "lon", y: "lat", fill: "tas" }], mode: "3d", axes: {} }), "Heatmap of tas over lon and lat, in 3D.");
  assert.equal(describePlot(), "An empty plot.");
  assert.equal(describePlot({ marks: [{ kind: "Anchor" }] }), "An empty plot.");
  assert.equal(listed("abcdefghijk".split("")), "a, b, c, d, e, f, g, h and 3 more");
});

test("axis domains are formatted like their ticks", () => {
  assert.deepEqual(describeAxis({ bounds: [30.8, 61.2], step: 5 }), { kind: "numeric", low: "31", high: "61" });
  assert.deepEqual(describeAxis({ bounds: [0.0123, 0.0871], step: 0.01 }), { kind: "numeric", low: "0.01", high: "0.09" });
  assert.deepEqual(describeAxis({ bounds: [6300, 2700], step: 500 }), { kind: "numeric", low: "2700", high: "6300" });
  assert.deepEqual(describeAxis({ bounds: [1, 1000], transform: "log" }), { kind: "log", low: "1", high: "1000" });
  assert.deepEqual(describeAxis({ bounds: [0, 0.5], pattern: ".0%" }), { kind: "numeric", low: "0%", high: "50%" });
  assert.deepEqual(describeAxis({ bounds: [0, 90 * 86400000], type: "datetime", timeOrigin: Date.UTC(2026, 0, 1), timezone: "UTC" }),
    { kind: "datetime", low: "Jan 01, 2026", high: "Apr 01, 2026" });
  assert.deepEqual(describeAxis({ categories: ["a", "b"] }), { categories: ["a", "b"] });
  // A band y axis says which end its first category is at (TODO 136.15).
  assert.match(describePlot({ marks: [{ kind: "Bar", x: "n", y: "name" }], axes: { y: describeAxis({ categories: ["a", "b"], first: "top" }) } }),
    /y \(top to bottom\): a, b\./);
  assert.equal(describeAxis({ bounds: [NaN, 1] }), null);
  assert.equal(describeAxis({}), null);
});

test("the author's description comes first; describe=false keeps only it; HTML titles come from the tree", () => {
  assert.equal(plotDescription("Penguin sizes", "Scatter plot."), "Penguin sizes. Scatter plot.");
  assert.equal(plotDescription("Penguin sizes!", "Scatter plot."), "Penguin sizes! Scatter plot.");
  assert.equal(plotDescription(undefined, "Scatter plot."), "Scatter plot.");
  assert.equal(plotDescription("Only mine", "Scatter plot.", false), "Only mine");
  assert.equal(plotDescription(undefined, "Scatter plot.", false), "");
  const tree = (children) => ({ kind: "Scene", children });
  assert.equal(stateTitle(tree([{ kind: "Slider", props: { name: "year", value: 2020 }, children: [] },
    { kind: "Plot", props: { title: "Anomaly, {$year} {$missing}" }, children: [] }])), "Anomaly, 2020 {$missing}");
  assert.equal(stateTitle(tree([{ kind: "Title", props: { text: "First\nline" }, children: [] }, { kind: "Plot", props: { title: "Second" }, children: [] }])), "First line");
  assert.equal(stateTitle(tree([{ kind: "Plot", props: {}, children: [] }])), "HMPlot");
});
