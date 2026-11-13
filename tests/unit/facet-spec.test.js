import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFacetSpec, tryNormalizeFacetSpec, facetError, pairCells, FACET_SPEC_ERRORS, FACET_TRIANGLES,
} from "../../src/lib/plot/utils/facetSpec.js";

const spec = (config, options) => normalizeFacetSpec(config, options);
const rejects = (config, message, options) =>
  assert.throws(() => normalizeFacetSpec(config, options), { message });

test("categorical facets keep today's shape and defaults", () => {
  const s = spec({ row: "g", column: "h", rowOrder: ["a"] });
  assert.equal(s.kind, "categorical");
  assert.deepEqual([s.row, s.column, s.rowOrder, s.splitRow, s.splitColumn], ["g", "h", ["a"], true, true]);
  assert.deepEqual([s.defaultScales, s.defaultLayout, s.fields, s.pairs, s.names], ["shared", "bands", null, null, null]);
  assert.deepEqual([spec({ column: "g", wrap: 2 }).splitRow, spec({ column: "g", wrap: 2 }).splitColumn], [false, true]);
  rejects({}, FACET_SPEC_ERRORS.required);
  rejects({ row: "", column: undefined }, FACET_SPEC_ERRORS.required);
  for (const wrap of [0, 1.5, "2"]) rejects({ column: "g", wrap }, FACET_SPEC_ERRORS.wrap);
  rejects({ row: "g", column: "h", wrap: 2 }, FACET_SPEC_ERRORS.wrap);
  rejects({ column: "g", as: { value: "v" } }, FACET_SPEC_ERRORS.as);
  rejects({ column: "g", triangle: "lower" }, FACET_SPEC_ERRORS.pairsOnly);
  rejects({ column: "g", diagonal: false }, FACET_SPEC_ERRORS.pairsOnly);
});

test("a Facet by a Fold's key is the fold kind", () => {
  const fold = { key: "key", fields: ["a", "b"] };
  assert.equal(spec({ column: "key" }, { fold }).kind, "fold");
  assert.equal(spec({ column: "key" }, { fold }).fold, fold);
  assert.equal(spec({ row: "key", wrap: 2 }, { fold }).kind, "fold");
  // A second field, another field, or repeated folded fields partition the folded rows.
  assert.equal(spec({ row: "species", column: "key" }, { fold }).kind, "categorical");
  assert.equal(spec({ column: "species" }, { fold }).kind, "categorical");
  assert.equal(spec({ column: "key" }, { fold: { key: "key", fields: ["a", "a"] } }).kind, "categorical");
});

test("fields: columns by default, rows on request, a category on the other dimension", () => {
  const s = spec({ fields: ["a", "b"] });
  assert.equal(s.kind, "fields");
  assert.deepEqual(s.fields, { dimension: "column", list: ["a", "b"] });
  assert.deepEqual(s.names, { value: "value", field: "field" });
  assert.deepEqual([s.splitRow, s.splitColumn, s.defaultScales, s.defaultLayout], [false, true, "field", "grid"]);
  assert.deepEqual(spec({ fields: { column: ["a"] } }).fields, { dimension: "column", list: ["a"] });
  const rows = spec({ fields: { row: ["a", "b", "c"] }, wrap: 2 });
  assert.deepEqual([rows.fields.dimension, rows.splitRow, rows.splitColumn, rows.wrap], ["row", true, false, 2]);
  const grid = spec({ fields: ["a", "b"], row: "species" });
  assert.deepEqual([grid.row, grid.column, grid.splitRow, grid.splitColumn], ["species", null, true, true]);
  const stacked = spec({ fields: { row: ["a"] }, column: "island" });
  assert.deepEqual([stacked.row, stacked.column, stacked.splitRow, stacked.splitColumn], [null, "island", true, true]);
  // The same dimension is an error that says which one to move.
  rejects({ fields: ["a"], column: "island" },
    'Facet fields lays its cells out along columns, so it cannot combine with column="island"; use fields={{row: [...]}} or row="island".');
  rejects({ fields: { row: ["a"] }, row: "g" },
    'Facet fields lays its cells out along rows, so it cannot combine with row="g"; use fields={{column: [...]}} or column="g".');
  for (const fields of [[], ["a", "a"], [1], [""], "a", { row: ["a"], column: ["b"] }, { x: ["a"] }, { row: [] }, null])
    rejects({ fields }, FACET_SPEC_ERRORS.fields);
  // wrap only when the field list is the only dimension.
  rejects({ fields: ["a"], row: "g", wrap: 2 }, FACET_SPEC_ERRORS.wrap);
  // The fields dimension's order picks and orders fields; a non-field value is an empty cell.
  assert.deepEqual(spec({ fields: ["a", "b"], columnOrder: ["b", "z"] }).columnOrder, ["b", "z"]);
  rejects({ fields: ["a", "b"], columnOrder: ["b", "b"] }, FACET_SPEC_ERRORS.order);
});

test("as renames the aliases", () => {
  assert.deepEqual(spec({ fields: ["a"], as: { value: "v" } }).names, { value: "v", field: "field" });
  assert.deepEqual(spec({ fields: ["a"], as: { value: "v", field: "name" } }).names, { value: "v", field: "name" });
  assert.deepEqual(spec({ pairs: ["a", "b"], as: { x: "px" } }).names, { x: "px", y: "y" });
  rejects({ fields: ["a"], as: { x: "v" } }, FACET_SPEC_ERRORS.as);
  rejects({ pairs: ["a"], as: { value: "v" } }, FACET_SPEC_ERRORS.as);
  rejects({ fields: ["a"], as: "v" }, FACET_SPEC_ERRORS.as);
  for (const as of [{ value: "" }, { value: "@x" }, { value: 3 }, { value: "field" }, { field: "value" }])
    rejects({ fields: ["a"], as }, FACET_SPEC_ERRORS.asNames);
  rejects({ pairs: ["a"], as: { x: "y" } }, FACET_SPEC_ERRORS.asNames);
});

test("pairs: one list or {x, y}, triangle and diagonal", () => {
  const s = spec({ pairs: ["a", "b", "c"], triangle: "lower", diagonal: false });
  assert.equal(s.kind, "pairs");
  assert.deepEqual(s.pairs, { x: ["a", "b", "c"], y: ["a", "b", "c"], triangle: "lower", diagonal: false, square: true });
  assert.deepEqual([s.row, s.column, s.splitRow, s.splitColumn, s.defaultScales, s.defaultLayout], [null, null, true, true, "field", "grid"]);
  assert.deepEqual(s.names, { x: "x", y: "y" });
  const xy = spec({ pairs: { x: ["a", "b"], y: ["c"] }, diagonal: false });
  assert.deepEqual(xy.pairs, { x: ["a", "b"], y: ["c"], triangle: "full", diagonal: false, square: false });
  for (const config of [{ row: "g" }, { column: "g" }, { fields: ["a"] }])
    rejects({ pairs: ["a"], ...config }, FACET_SPEC_ERRORS.pairsCombine);
  for (const pairs of [[], ["a", "a"], { x: ["a"] }, { x: ["a"], y: [] }, { x: ["a"], y: ["b"], z: ["c"] }, "a"])
    rejects({ pairs }, FACET_SPEC_ERRORS.pairs);
  rejects({ pairs: { x: ["a"], y: ["b"] }, triangle: "lower" }, FACET_SPEC_ERRORS.triangleXY);
  rejects({ pairs: ["a"], triangle: "left" }, FACET_SPEC_ERRORS.triangle);
  rejects({ pairs: ["a"], diagonal: "no" }, FACET_SPEC_ERRORS.diagonal);
  rejects({ pairs: ["a"], wrap: 2 }, FACET_SPEC_ERRORS.wrap);
  assert.deepEqual(FACET_TRIANGLES, ["full", "upper", "lower"]);
});

test("pair cells: triangles, diagonal, orders and grid places", () => {
  const list = ["a", "b", "c"];
  const at = (cells) => cells.map((c) => `${c.y}${c.x}@${c.gridRow},${c.gridColumn}`);
  assert.equal(pairCells({ x: list, y: list }).cells.length, 9);
  assert.deepEqual(at(pairCells({ x: list, y: list, triangle: "lower" }).cells),
    ["aa@1,1", "ba@2,1", "bb@2,2", "ca@3,1", "cb@3,2", "cc@3,3"]);
  assert.deepEqual(at(pairCells({ x: list, y: list, triangle: "upper", diagonal: false }).cells), ["ab@1,2", "ac@1,3", "bc@2,3"]);
  const xy = pairCells({ x: ["a", "b"], y: ["c"], square: false });
  assert.deepEqual([at(xy.cells), xy.rows, xy.columns], [["ca@1,1", "cb@1,2"], ["c"], ["a", "b"]]);
  // With {x, y} lists a shared name still meets on the diagonal only when diagonal is false.
  assert.deepEqual(at(pairCells({ x: ["a", "b"], y: ["a"], square: false, diagonal: false }).cells), ["ab@1,2"]);
  // New API: orders pick and order the lists; triangles keep their shape by the original lists.
  assert.deepEqual(at(pairCells({ x: list, y: list }, { rowOrder: ["c", "a"], columnOrder: ["b"] }).cells), ["cb@1,1", "ab@2,1"]);
  assert.deepEqual(at(pairCells({ x: list, y: list, triangle: "lower" }, { rowOrder: ["c", "b"] }).cells),
    ["ca@1,1", "cb@1,2", "cc@1,3", "ba@2,1", "bb@2,2"]);
  for (const order of [["a", "a"], ["z"], "a"])
    assert.throws(() => pairCells({ x: list, y: list }, { rowOrder: order }), { message: FACET_SPEC_ERRORS.pairOrder });
});

test("messages format their placeholders and nothing else", () => {
  assert.equal(facetError("pairsNumeric", { field: "species" }), 'Facet pairs requires numeric columns; "species" is not one.');
  assert.equal(facetError("missingField", { prop: "fields", field: "z" }), 'Facet fields: the data has no column "z".');
  assert.equal(facetError("triangleXY"), FACET_SPEC_ERRORS.triangleXY);
  assert.deepEqual(tryNormalizeFacetSpec({}), { spec: null, error: FACET_SPEC_ERRORS.required });
  assert.equal(tryNormalizeFacetSpec({ fields: ["a"] }).error, "");
  assert.ok(Object.isFrozen(FACET_SPEC_ERRORS));
});

test("Python validates with the same texts: registry.json carries FACET_SPEC_ERRORS", async () => {
  const { readFileSync } = await import("node:fs");
  for (const copy of ["../../python/hmplot/registry.json", "../../src/lib/scene/registry.json"]) {
    const registry = JSON.parse(readFileSync(new URL(copy, import.meta.url), "utf8"));
    assert.deepEqual(registry.facet.errors, { ...FACET_SPEC_ERRORS });
    assert.deepEqual(registry.facet.triangles, [...FACET_TRIANGLES]);
  }
});
