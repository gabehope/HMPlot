import test from "node:test";
import assert from "node:assert/strict";
import {
  axisChannelValues, axisColumnIdentities, channelIdentity, fieldScaleGroup, fieldScaleDomains, UNNAMED, DERIVED,
} from "../../src/lib/plot/utils/axisColumns.js";
import { createDataScope, literal } from "../../src/lib/plot/utils/categorical.js";
import { col, tween, multiply } from "../../src/lib/plot/utils/expressions.js";
import { partitionFacets } from "../../src/lib/plot/utils/facets.js";

test("the channels each mark plots per axis", () => {
  assert.deepEqual(axisChannelValues("Points", { x: "a", y: "b", color: "g" }), { x: ["a"], y: ["b"], z: [] });
  assert.deepEqual(axisChannelValues("Rect", { x0: "a", x1: "b", y0: 0, y1: "c" }), { x: ["a", "b"], y: [0, "c"], z: [] });
  assert.deepEqual(axisChannelValues("Area", { x: "t", upper: "v", lower: 0 }), { x: ["t"], y: [0, "v"], z: [] });
  // The value axis reads lower/upper/baseline; a Area with axis="x" swaps them.
  assert.deepEqual(axisChannelValues("Area", { x: "t", lower: "lo", upper: "hi" }), { x: ["t"], y: ["lo", "hi"], z: [] });
  assert.deepEqual(axisChannelValues("Area", { x: "t", lower: "lo", upper: "hi", axis: "x" }), { x: ["lo", "hi"], y: ["t"], z: [] });
  assert.deepEqual(axisChannelValues("ErrorBars", { x: "t", y: "m", lower: "lo", upper: "hi", axis: "x" }),
    { x: ["t", "lo", "hi"], y: ["m"], z: [] });
  // position and endpoints plot data but name no column.
  assert.deepEqual(axisChannelValues("Points", { position: "p", x: "a" }), { x: [UNNAMED], y: [UNNAMED], z: [UNNAMED] });
  assert.deepEqual(axisChannelValues("ErrorBars", { position: "p", lower: "lo", upper: "hi" }).y, [UNNAMED, "lo", "hi"]);
  assert.deepEqual(axisChannelValues("Segments", { start: "s", end: "e" }).x, [UNNAMED, UNNAMED]);
  // Offsets, sizes, text and colors are not axes.
  assert.deepEqual(axisChannelValues("Text", { x: "a", y: "b", dx: 3, text: "name", width: 2 }), { x: ["a"], y: ["b"], z: [] });
});

test("the identity a channel value plots", () => {
  const s = createDataScope();
  s.update({ a: [1, 2], b: [3, 4] });
  assert.equal(channelIdentity(s, "a"), s.columnIdentity("a"));
  assert.equal(channelIdentity(s, col("b")), s.columnIdentity("b"));
  assert.equal(channelIdentity(s, tween(col("b"))), s.columnIdentity("b"));
  assert.equal(channelIdentity(s, multiply(col("b"), 2)), DERIVED);
  assert.equal(channelIdentity(s, "@selected"), DERIVED);
  for (const value of [5, true, new Date(0), [1, 2], new Float32Array(2), { codes: [0], categories: ["x"] }, "missing", null])
    assert.equal(channelIdentity(s, value), null, String(value));
  assert.deepEqual(axisColumnIdentities(s, "Rect", { x0: "a", x1: literal("b"), y: [1, 2] }),
    { x: [s.columnIdentity("a"), null], y: [null], z: [] });
  s.dispose();
});

test("groups: facet fields, input columns, derived values, constants", () => {
  const meta = { fieldIdentities: new Map([["id:a", "a"], ["id:b", "b"]]), inputIdentities: new Set(["id:a", "id:b", "id:t"]) };
  const fieldsCell = { key: "k", field: "b" }, pairsCell = { key: "p", axisFields: { x: "a", y: "b" } }, plain = { key: "c" };
  assert.equal(fieldScaleGroup("id:a", "y", fieldsCell, meta), "field:a");
  assert.equal(fieldScaleGroup("id:t", "x", fieldsCell, meta), "shared:x");
  assert.equal(fieldScaleGroup(null, "y", fieldsCell, meta), "shared:y");
  assert.equal(fieldScaleGroup("derived:x", "y", fieldsCell, meta), "field:b");
  assert.equal(fieldScaleGroup(DERIVED, "x", pairsCell, meta), "field:a");
  assert.equal(fieldScaleGroup(DERIVED, "y", pairsCell, meta), "field:b");
  assert.equal(fieldScaleGroup("derived:x", "y", plain, meta), "shared:y");
});

test("fieldScaleDomains: per-field groups, shared inputs, unions, fallbacks and prefixes", () => {
  const meta = { fieldIdentities: new Map([["id:a", "a"], ["id:b", "b"]]), inputIdentities: new Set(["id:a", "id:b", "id:t"]) };
  // Four cells: fields a and b over two categories.
  const cells = new Map([["pa", { field: "a" }], ["pb", { field: "b" }], ["qa", { field: "a" }], ["qb", { field: "b" }]]);
  const entries = [
    { cell: "pa", axis: "0:y", bounds: [0, 5], columns: ["id:a"] },
    { cell: "qa", axis: "0:y", bounds: [2, 9], columns: ["id:a"] },
    { cell: "pb", axis: "0:y", bounds: [100, 110], columns: ["id:b"] },
    // qb plots b too, but only through a derived column: it follows its cell's field.
    { cell: "qb", axis: "0:y", bounds: [90, 95], columns: ["derived:q"] },
    // x plots the shared input t everywhere.
    ...["pa", "pb", "qa", "qb"].map((cell, i) => ({ cell, axis: "0:x", bounds: [i, i + 10], columns: ["id:t"] })),
    // A child frame (prefix 1:) groups separately.
    { cell: "pa", axis: "1:y", bounds: [-1, 1], columns: ["id:a"] },
  ];
  const result = fieldScaleDomains(entries, cells, meta);
  assert.deepEqual(result.get("pa").get("0:y"), [0, 9]);
  assert.deepEqual(result.get("qa").get("0:y"), [0, 9]);
  assert.deepEqual(result.get("pb").get("0:y"), [90, 110]);
  assert.deepEqual(result.get("qb").get("0:y"), [90, 110]);
  for (const cell of cells.keys()) assert.deepEqual(result.get(cell).get("0:x"), [0, 13]);
  // Field a's child-frame extent reaches the child frames of every a cell (their fallback), not b's.
  assert.deepEqual(result.get("qa").get("1:y"), [-1, 1]);
  assert.equal(result.get("pb").get("1:y"), undefined);
  // A mark whose columns are unknown follows its cell's field; one plotting two columns joins both.
  const mixed = fieldScaleDomains([
    { cell: "pa", axis: "y", bounds: [0, 1], columns: undefined },
    { cell: "pb", axis: "y", bounds: [5, 6], columns: ["id:a", "id:b"] },
  ], new Map([["pa", { field: "a" }], ["pb", { field: "b" }]]), meta);
  assert.deepEqual(mixed.get("pa").get("y"), [0, 6]);
  assert.deepEqual(mixed.get("pb").get("y"), [0, 6]);
  // Pixel reservations survive field grouping and the union of multiple field groups.
  entries[0].bounds = Object.assign([0,5], {screen:[12,30],crossScreen:[40,15]});
  const labels = fieldScaleDomains(entries,cells,meta).get("qa").get("0:y");
  assert.deepEqual(Array.from(labels),[0,9]);
  assert.deepEqual(labels.screen,[12,30]);assert.deepEqual(labels.crossScreen,[40,15]);
});

test("categorical facets: field equals shared", () => {
  const meta = { fieldIdentities: new Map(), inputIdentities: new Set(["id:v"]) };
  const cells = new Map([["a", {}], ["b", {}], ["c", {}]]);
  const result = fieldScaleDomains([
    { cell: "a", axis: "0:y", bounds: [0, 1], columns: ["id:v"] },
    { cell: "b", axis: "0:y", bounds: [4, 5], columns: ["derived:bin"] },
  ], cells, meta);
  for (const cell of ["a", "b", "c"]) assert.deepEqual(result.get(cell).get("0:y"), [0, 5]);
});

test("pairs share a field's domain across x and y, as Pairs did", async () => {
  const s = createDataScope();
  s.update({ a: [0, 10], b: [100, 200], c: [-5, 5] });
  const p = await partitionFacets(s, { pairs: ["a", "b", "c"] });
  const cells = new Map(p.cells.map((cell) => [cell.key, cell]));
  const extent = { a: [0, 10], b: [100, 200], c: [-5, 5] };
  const entries = p.cells.flatMap((cell) => {
    const columns = { x: [cell.view.columnIdentity("x")], y: [cell.view.columnIdentity("y")] };
    // The diagonal holds a density: y is derived there.
    if (cell.row === cell.column) columns.y = ["derived:density"];
    return ["x", "y"].map((d) => ({ cell: cell.key, axis: `0:${d}`, columns: columns[d],
      bounds: cell.row === cell.column && d === "y" ? [0, 0.5] : extent[cell.axisFields[d]] }));
  });
  const result = fieldScaleDomains(entries, cells, p);
  const at = (y, x, d) => result.get(JSON.stringify([y, x])).get(`0:${d}`);
  // Column a's x axis and row a's y axis hold field a's extent (with a's density heights on the diagonal).
  assert.deepEqual(at("b", "a", "x"), [0, 10]);
  assert.deepEqual(at("a", "b", "y"), [0, 10]);
  assert.deepEqual(at("a", "a", "y"), [0, 10]);
  assert.deepEqual(at("c", "b", "y"), [-5, 5]);
  // As with Pairs, a diagonal's derived heights join its field's group: b's density [0, 0.5].
  assert.deepEqual(at("c", "b", "x"), [0, 200]);
  p.dispose();
  s.dispose();
});
