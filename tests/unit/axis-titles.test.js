import densityPlugin from "../../src/lib/plugins/density/index.js";
import { registerPlugin as registerDensityPlugin } from "../../src/lib/plot/plugins/library.js";
registerDensityPlugin(densityPlugin);
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  channelTitle, columnTitle, markAxisTitles, combineTitles, resolveAxisTitle, explicitAxisLabel, nameColumnValues,
} from "../../src/lib/plot/utils/axisTitles.js";
import { createDataScope, literal } from "../../src/lib/plot/utils/categorical.js";
import { gridTable } from "../../src/lib/plot/utils/gridTable.js";
import { createDataView, snapshotDataScope } from "../../src/lib/plot/utils/dataView.js";
import { col, tween, multiply } from "../../src/lib/plot/utils/expressions.js";
import { animate } from "../../src/lib/plot/utils/animation.js";
import { partitionFacets } from "../../src/lib/plot/utils/facets.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { OptionsNode } from "../../src/lib/options/options.js";
import { FieldType } from "../../src/lib/plot/objects/types.js";
import { graphFixture } from './helpers/graphFixture.js';
import { numpy as np } from "@hmplot/jax";

const data = (value) => {
  const s = createDataScope();
  s.update(value);
  return s;
};

test("channelTitle: names, abstentions and vetoes", () => {
  const s = data({ a: [1, 2], b: [3, 4], __hidden: [0, 0] });
  // Names, through col() and tween(col()), unwrapping animate().
  assert.equal(channelTitle(s, "a"), "a");
  assert.equal(channelTitle(s, col("b")), "b");
  assert.equal(channelTitle(s, tween(col("b"))), "b");
  assert.equal(channelTitle(s, animate("a", { duration: 100 })), "a");
  // Constants abstain.
  for (const value of [5, 0, true, literal("x"), new Date(0), undefined, null])
    assert.equal(channelTitle(s, value), undefined, String(value));
  // Unnamed data vetoes.
  for (const value of [[1, 2], new Float32Array(2), { codes: [0, 1], categories: ["p", "q"] }, multiply(col("b"), 2)])
    assert.equal(channelTitle(s, value), null);
  const array = np.array([1, 2]);
  assert.equal(channelTitle(s, array), null);
  array.dispose();
  // Internal and virtual columns veto; a string that names no column abstains.
  assert.equal(channelTitle(s, "__hidden"), null);
  assert.equal(channelTitle(s, "@selected"), null);
  assert.equal(channelTitle(s, "missing"), undefined);
  s.dispose();
});

test("markAxisTitles: the channels of each mark kind", () => {
  const s = data({ a: [1, 2], b: [3, 4], c: [5, 6], lo: [0, 1], hi: [2, 3] });
  assert.deepEqual(markAxisTitles("Points", { x: "a", y: "b", color: "c", size: "c" }, s), { x: "a", y: "b" });
  assert.deepEqual(markAxisTitles("Points", { position: "pos" }, s), { x: null, y: null, z: null });
  assert.deepEqual(markAxisTitles("Rect", { x0: "a", x1: "a", y0: 0, y1: "b" }, s), { x: "a", y: "b" });
  assert.deepEqual(markAxisTitles("Rect", { x0: "a", x1: "c", y0: 0, y1: "b" }, s), { x: null, y: "b" });
  // A constant baseline abstains; a raw array vetoes.
  assert.deepEqual(markAxisTitles("Area", { x: "a", upper: "b", lower: 0 }, s), { x: "a", y: "b" });
  assert.deepEqual(markAxisTitles("Line", { x: "a", y: [0, 0] }, s), { x: "a", y: null });
  assert.deepEqual(markAxisTitles("Area", { x: "a", lower: "lo", upper: "lo" }, s), { x: "a", y: "lo" });
  assert.deepEqual(markAxisTitles("Area", { x: "a", lower: "lo", upper: "hi", axis: "x" }, s), { x: null, y: "a" });
  assert.deepEqual(markAxisTitles("ErrorBars", { x: "a", y: "b", lower: "lo", upper: "hi" }, s), { x: "a", y: null });
  assert.deepEqual(markAxisTitles("Segments", { start: "pos", end: "pos" }, s), { x: null, y: null, z: null });
  // Offsets and text never count; Text placed by a raw position vetoes.
  assert.deepEqual(markAxisTitles("Text", { x: 5, y: "b", dx: 3, text: "c" }, s), { y: "b" });
  assert.deepEqual(markAxisTitles("Text3D", { position: [[0, 0, 0]], text: "c" }, s), { x: null, y: null, z: null });
  assert.deepEqual(markAxisTitles("Anchor", { x: 1, y: "b" }, s), { y: "b" });
  assert.deepEqual(markAxisTitles("GeoJSON", { x: "a" }, s), {});
  // A Heatmap on a grid table reads the drawn dimensions' names; placed by bounds it abstains.
  const grid = createDataScope();
  grid.update(gridTable({ dims: { lat: [0, 1], lon: [0, 1, 2] }, columns: { elev: [1, 2, 3, 4, 5, 6] } }));
  assert.deepEqual(markAxisTitles("Heatmap", { fill: "elev" }, grid), { x: "lon", y: "lat" });
  assert.deepEqual(markAxisTitles("Heatmap", { fill: "elev", surfaceMode: true }, grid), { x: "lon", y: "lat", z: "elev" });
  assert.deepEqual(markAxisTitles("Heatmap", { fill: "elev", x: "lat", y: "lon" }, grid), { x: "lat", y: "lon" });
  grid.dispose();
  assert.deepEqual(markAxisTitles("Heatmap", { fill: [[1]], xbounds: [0, 1] }, s), {});
  s.dispose();
});

test("combineTitles and resolveAxisTitle", () => {
  assert.equal(combineTitles([]), "");
  assert.equal(combineTitles(["a", "a"]), "a");
  assert.equal(combineTitles(["a", undefined, "a"]), "a");
  assert.equal(combineTitles(["a", "b"]), "");
  assert.equal(combineTitles(["a", null]), "");
  assert.equal(combineTitles([undefined]), "");
  assert.deepEqual(resolveAxisTitle({ label: "Alpha", scaleTitle: "Group", automatic: "a" }), { title: "Alpha", source: "label" });
  assert.deepEqual(resolveAxisTitle({ scaleTitle: "Group", automatic: "a" }), { title: "Group", source: "scale" });
  assert.deepEqual(resolveAxisTitle({ automatic: "a" }), { title: "a", source: "column" });
  assert.deepEqual(resolveAxisTitle({}), { title: "", source: "none" });
});

test("explicitAxisLabel reads inherited or own labels; empty means automatic", () => {
  const root = new OptionsNode();
  for (const a of "XYZ") root.ensure("axisLabel" + a, new FieldType({ defaultValue: "" }));
  const child = root.splitUnique("frame");
  assert.equal(explicitAxisLabel(child, "x"), "");
  root.set("axisLabelX", "Temperature");
  assert.equal(explicitAxisLabel(child, "x"), "Temperature");
  assert.equal(explicitAxisLabel(child, "x", { inherit: false }), "");
  child.set("axisLabelX", "Rain");
  assert.equal(explicitAxisLabel(child, "x", { inherit: false }), "Rain");
  root.set("axisLabelY", 5);
  assert.equal(explicitAxisLabel(child, "y"), "5");
  root.set("axisLabelY", null);
  assert.equal(explicitAxisLabel(child, "y"), "");
  root.dispose();
});

test("columnName through scopes, views, aliases and facets", async () => {
  const s = data({ id: [1, 2, 3, 4], g: ["p", "q", "p", "q"], a: [1, 2, 3, 4], b: [5, 6, 7, 8], x: [9, 9, 9, 9] });
  assert.equal(s.columnName("a"), "a");
  assert.equal(s.columnName("@selected"), undefined);
  assert.equal(columnTitle(s, "@selected"), null);
  // Indexed views forward; `names` declares a name or none; an alias is its source.
  const indices = np.array([0, 2], { dtype: np.int32 });
  const indexed = createDataView(s, { indices });
  assert.equal(indexed.columnName("a"), "a");
  const named = createDataView(s, { columns: { out: s.get("a").slice?.() ?? [1, 2, 3, 4], hidden: [0, 0, 0, 0], alias: s.get("b") },
    names: { out: "a", hidden: null } });
  assert.equal(named.columnName("out"), "a");
  assert.equal(named.columnName("hidden"), null);
  assert.equal(columnTitle(named, "hidden"), null);
  assert.equal(named.columnName("alias"), "alias");
  named.fieldIdentity = { alias: "b" };
  const aliased = createDataView(s, { columns: { v: s.get("b") } });
  aliased.fieldIdentity = { v: "b" };
  assert.equal(aliased.columnName("v"), "b");
  const snapshot = snapshotDataScope({ ...s, keys: () => s.keys(), has: (k) => s.has(k), get: (k) => s.get(k),
    columnName: (k) => s.columnName(k), columnIdentity: (k) => s.columnIdentity(k), metadata: (k) => s.metadata(k),
    scale: (k) => s.scale(k), length: 4 });
  assert.equal(snapshot.columnName("b"), "b");
  snapshot.dispose();
  aliased.dispose(); named.dispose(); indexed.dispose(); indices.dispose();
  // Aggregate views name their own outputs and the carried constants.
  const bins = await runTransform("Bin", s, { x: "a", bins: 2 });
  assert.equal(bins.columnName("count"), "count");
  bins.dispose();
  // Facet fields cells: value is the field, field is "field"; with a split, the same.
  const fields = await partitionFacets(s, { fields: ["a", "b"] });
  assert.deepEqual(fields.cells.map((c) => [c.view.columnName("value"), c.view.columnName("field"), c.view.columnName("id")]),
    [["a", "field", "id"], ["b", "field", "id"]]);
  fields.dispose();
  const grid = await partitionFacets(s, { fields: ["a", "b"], row: "g" });
  assert.deepEqual(grid.cells.map((c) => c.view.columnName("value")), ["a", "b", "a", "b"]);
  grid.dispose();
  const renamed = await partitionFacets(s, { fields: ["a"], as: { value: "v", field: "name" } });
  assert.deepEqual([renamed.cells[0].view.columnName("v"), renamed.cells[0].view.columnName("name")], ["a", "name"]);
  renamed.dispose();
  // Pairs cells: x and y are their fields, even over a table column named x.
  const pairs = await partitionFacets(s, { pairs: ["a", "b"] });
  assert.deepEqual(pairs.cells.map((c) => [c.view.columnName("x"), c.view.columnName("y")]), [["a", "a"], ["b", "a"], ["a", "b"], ["b", "b"]]);
  pairs.dispose();
  // Fold-key cells: value is the field, the key is "key".
  const folded = await runTransform("Fold", s, { fields: ["a", "b"] });
  const fold = await partitionFacets(folded, { column: "key" });
  assert.deepEqual(fold.cells.map((c) => [c.view.columnName("value"), c.view.columnName("key")]), [["a", "key"], ["b", "key"]]);
  fold.dispose();
  folded.dispose();
  s.dispose();
});

test("every file that defines columnIdentity defines columnName", () => {
  const root = fileURLToPath(new URL("../../src/lib", import.meta.url)), missing = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|svelte|ts)$/.test(name)) {
        const source = readFileSync(path, "utf8");
        const defines = /columnIdentity\s*(\(\w*\)\s*\{|:\s*\(|=\s*\()/.test(source) || /\bcolumnIdentity,/.test(source);
        if (defines && !/columnName/.test(source)) missing.push(path.slice(root.length + 1));
      }
    }
  };
  walk(root);
  assert.deepEqual(missing, []);
});

test("transform outputs declare their names (D7)", async () => {
  const s = data({ g: ["p", "q", "p", "q"], a: [1, 2, 3, 4], b: [5, 6, 7, 8] });
  const bins = await runTransform("Bin", s, { x: "a", bins: 2 });
  assert.deepEqual(["x0", "x1", "x", "count"].map((k) => columnTitle(bins, k)), ["a", "a", "a", "count"]);
  bins.dispose();
  const renamed = await runTransform("Bin", s, { x: "a", bins: 2, as: { x0: "lo", count: "n" } });
  assert.deepEqual([columnTitle(renamed, "lo"), columnTitle(renamed, "n")], ["a", "n"]);
  renamed.dispose();
  const histogram = await runTransform("Bin", s, { x: "a", bins: 2, normalization: "density" });
  assert.equal(columnTitle(histogram, "y1"), "density");
  histogram.dispose();
  const assigned = await runTransform("Bin", s, { x: "a", bins: 2, mode: "assign" });
  assert.deepEqual(["binX0", "binX1", "binX", "b"].map((k) => columnTitle(assigned, k)), ["a", "a", null, "b"]);
  assigned.dispose();
  const stack = await runTransform("Stack", s, { x: "g", y: "b" });
  assert.deepEqual([columnTitle(stack, "y0"), columnTitle(stack, "y1")], ["b", "b"]);
  stack.dispose();
  const summary = await runTransform("Summary", s, { field: "b", by: "g", interval: "deviation" });
  assert.deepEqual(["estimate", "lower", "upper", "count", "g"].map((k) => columnTitle(summary, k)), ["b", "b", "b", "count", "g"]);
  summary.dispose();
  const hexbin = await runTransform("Hexbin", s, { x: "a", y: "b", radius: 1 });
  assert.deepEqual([columnTitle(hexbin, "x"), columnTitle(hexbin, "y"), columnTitle(hexbin, "count")], ["a", "b", "count"]);
  hexbin.dispose();
  // Every transform declares its outputs (TODO 130.1): the value column, the
  // category for a box's extent across, and unnamed for geometry that is no column's.
  const bars = await runTransform("BarGeometry", s, { x: "g", y: "b", baseline: 0, arrange: "overlap" });
  assert.deepEqual(["__barY", "__barTipY", "__barValue", "__barBaseline", "__barX", "__barSizeY"].map((k) => columnTitle(bars, k)), ["b", "b", "b", "b", "g", null]);
  bars.dispose();
  const based = await runTransform("BarGeometry", s, { x: "g", y: "b", baseline: "a", arrange: "overlap" });
  assert.deepEqual(["__barValue", "__barBaseline", "__barBaseY"].map((k) => columnTitle(based, k)), ["b", "a", "a"]);
  based.dispose();
  // A Python Series arrives as a named array: the bars take its name, as a channel would.
  const sales = Float32Array.from([1, 2, 3, 4]);
  nameColumnValues(sales, "sales");
  const named = await runTransform("BarGeometry", s, { x: "g", y: sales, orientation: "vertical", baseline: 0, arrange: "overlap" });
  assert.equal(columnTitle(named, "__barY"), "sales");
  named.dispose();
  const boxes = await runTransform("BoxStats", s, { value: "b", by: "g" });
  assert.deepEqual(["q1", "whiskerHigh", "__boxCenter", "__boxY0", "__boxX0", "__boxPosition", "g"].map((k) => columnTitle(boxes, k)),
    ["b", "b", "b", "b", "g", null, "g"]);
  boxes.dispose();
  const pie = await runTransform("PieGeometry", s, { value: "b" });
  assert.deepEqual(["__pieStart", "__pieShare"].map((k) => columnTitle(pie, k)), [null, null]);
  pie.dispose();
  const windows = await Promise.all(["mean", "count", "variance"].map((reduce) => runTransform("Window", s, { field: "a", size: 2, reduce })));
  assert.deepEqual(windows.map((w) => columnTitle(w, "smoothed")), ["a", "count", null]);
  windows.forEach((w) => w.dispose());
  const grid = await runTransform("Dodge", s, { mode: "grid", columns: 2 });
  assert.deepEqual([columnTitle(grid, "x"), columnTitle(grid, "y")], [null, null]);
  grid.dispose();
  // A Calculate output and a Fold's value outside a key-split Facet keep their own keys.
  const folded = await runTransform("Fold", s, { fields: ["a", "b"] });
  assert.deepEqual([columnTitle(folded, "value"), columnTitle(folded, "key")], ["value", "key"]);
  folded.dispose();
  // An alias propagates: a Bin over a Facet fields cell's value is titled by the field.
  const cells = await partitionFacets(s, { fields: ["a", "b"] });
  const cellBins = await runTransform("Bin", cells.cells[1].view, { x: "value", bins: 2 });
  assert.equal(columnTitle(cellBins, "x0"), "b");
  cellBins.dispose();
  cells.dispose();
  s.dispose();
});

test("Density and Interpolate name their axes; layouts name none", async () => {
  const s = data({ lon: [0, 1, 2, 0, 1, 2], lat: [0, 0, 0, 1, 1, 1], elev: [1, 2, 3, 4, 5, 6], w: [1, 1, 1, 1, 1, 1] });
  const one = await runTransform("Density", s, { x: "lon", bandwidth: 0.5 });
  assert.deepEqual([columnTitle(one, "x"), columnTitle(one, "density")], ["lon", "density"]);
  one.dispose();
  const two = await runTransform("Density", s, { x: "lon", y: "lat", bandwidth: 0.5, resolution: [8, 8] });
  assert.deepEqual([columnTitle(two, "x"), columnTitle(two, "y")], ["lon", "lat"]);
  assert.deepEqual(markAxisTitles("Heatmap", { fill: "density" }, two), { x: "lon", y: "lat" });
  two.dispose();
  const grid = await runTransform("Interpolate", s, { x: "lon", y: "lat", values: ["elev"], resolution: [4, 4] });
  assert.deepEqual(markAxisTitles("Heatmap", { fill: "elev", surfaceMode: true }, grid), { x: "lon", y: "lat", z: "elev" });
  grid.dispose();
  const { treeLayout } = await import("../../src/lib/plot/utils/tree.js");
  const edges = data({ source: ["a", "a"], target: ["b", "c"] });
  const graph = await graphFixture(edges);
  const tree = await treeLayout(graph.scope, { root: "a" });
  assert.deepEqual([tree.nodes.columnName("x"), tree.nodes.columnName("y"), tree.nodes.columnName("depth")], [null, null, "depth"]);
  tree.dispose(); graph.dispose();
  edges.dispose();
  s.dispose();
});
