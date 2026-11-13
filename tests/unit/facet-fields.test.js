import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { partitionFacets } from "../../src/lib/plot/utils/facets.js";
import { brushColumn } from "../../src/lib/plot/utils/interaction.js";
import { FACET_SPEC_ERRORS } from "../../src/lib/plot/utils/facetSpec.js";

const data = (value) => {
  const s = createDataScope();
  s.update(value);
  return s;
};
async function values(view, key) {
  const a = view.get(key)?.codes ?? view.get(key);
  return a.data ? Array.from(await a.ref.data()) : a;
}
const table = () => data({
  id: [1, 2, 3, 4, 5, 6], g: ["p", "q", "p", "q", "p", "r"],
  a: [1, 2, 3, 4, 5, 6], b: [60, 50, 40, 30, 20, 10], c: [5, 7, 6, 8, 9, 4],
});

test("fields: one cell per field over the same rows, value aliasing the field", async () => {
  const s = table();
  const p = await partitionFacets(s, { fields: ["a", "b", "c"] });
  assert.deepEqual(p.cells.map((c) => [c.key, c.row, c.column, c.label, c.field]), [
    ['[null,"a"]', null, "a", "a", "a"], ['[null,"b"]', null, "b", "b", "b"], ['[null,"c"]', null, "c", "c", "c"]]);
  assert.equal(p.columns, 3);
  // Keys are those of a Facet by a Fold's key, so camera and settings memory carries over.
  const identities = new Set();
  for (const [i, cell] of p.cells.entries()) {
    const view = cell.view, field = cell.column;
    assert.equal(view.length, 6);
    assert.equal(view.get("value"), s.get(field));
    assert.equal(view.columnIdentity("value"), s.columnIdentity(field));
    assert.equal(view.identityRows, true);
    assert.deepEqual(await values(view, "field"), [i, i, i, i, i, i]);
    assert.deepEqual(view.get("field").categories, ["a", "b", "c"]);
    identities.add(view.columnIdentity("field"));
    // Other columns pass through.
    assert.deepEqual(view.get("g"), s.get("g"));
    assert.equal(view.columnIdentity("g"), s.columnIdentity("g"));
    // A strip brush on the value axis constrains the real field.
    const brush = brushColumn(view, "value", "y", "o");
    assert.equal(brush?.name, field);
    assert.equal(brush.identity, s.columnIdentity(field));
    brush.release();
  }
  // One identity for the label column across cells: color="field" is one scale.
  assert.equal(identities.size, 1);
  assert.match([...identities][0], /^derived:.*:facet-fields:/);
  assert.deepEqual(p.cells[1].view.scale("field").domain, ["a", "b", "c"]);
  assert.equal(p.cells[0].view.scale("field"), p.cells[2].view.scale("field"));
  // The scales="field" lookups.
  assert.deepEqual([...p.fieldIdentities], ["a", "b", "c"].map((f) => [s.columnIdentity(f), f]));
  assert.ok(p.inputIdentities.has(s.columnIdentity("id")));
  p.dispose();
  s.dispose();
});

test("fields: a datetime field's metadata, and a shadowed value column", async () => {
  const start = Date.UTC(2024, 0, 1);
  const s = data({ t: [new Date(start), new Date(start + 1000)], value: ["x", "y"], field: [1, 2] });
  assert.equal(s.metadata("t")?.type, "datetime");
  const p = await partitionFacets(s, { fields: ["t", "field"] });
  const [time, number] = p.cells.map((c) => c.view);
  assert.equal(time.metadata("value")?.type, "datetime");
  // The alias wins over the table's own `value` and `field`, and their metadata does not leak.
  assert.equal(time.get("value"), s.get("t"));
  assert.equal(number.get("value"), s.get("field"));
  assert.equal(number.metadata("value"), s.metadata("field"));
  assert.equal(time.metadata("field"), undefined);
  assert.deepEqual(time.get("field").categories, ["t", "field"]);
  p.dispose();
  // `as` is the escape.
  const renamed = await partitionFacets(s, { fields: ["t", "field"], as: { value: "v", field: "name" } });
  const view = renamed.cells[1].view;
  assert.equal(view.get("v"), s.get("field"));
  assert.deepEqual(view.get("value"), ["x", "y"]);
  assert.deepEqual(await values(view, "name"), [1, 1]);
  assert.deepEqual(await values(view, "field"), [1, 2]);
  assert.equal(view.columnIdentity("field"), s.columnIdentity("field"));
  renamed.dispose();
  s.dispose();
});

test("fields: rows with wrap, orders that pick and reorder, unknown values as empty cells", async () => {
  const s = table();
  const rows = await partitionFacets(s, { fields: { row: ["a", "b", "c"] }, wrap: 2 });
  assert.deepEqual(rows.cells.map((c) => [c.key, c.row, c.column]), [
    ['["a",null]', "a", null], ['["b",null]', "b", null], ['["c",null]', "c", null]]);
  assert.equal(rows.columns, 2);
  rows.dispose();
  const ordered = await partitionFacets(s, { fields: ["a", "b", "c"], columnOrder: ["c", "a", "z"] });
  assert.deepEqual(ordered.cells.map((c) => [c.column, c.field, c.view.length]), [["c", "c", 6], ["a", "a", 6], ["z", null, 0]]);
  assert.equal(ordered.cells[0].view.get("value"), s.get("c"));
  // The field codes index the declared list, not the order.
  assert.deepEqual(await values(ordered.cells[0].view, "field"), [2, 2, 2, 2, 2, 2]);
  // An empty cell still has the aliases (with no rows), so marks in it read nothing.
  assert.equal(ordered.cells[2].view.get("value").shape[0], 0);
  assert.equal(ordered.cells[2].view.get("field").codes.shape[0], 0);
  assert.equal(ordered.columns, 3);
  ordered.dispose();
  await assert.rejects(partitionFacets(s, { fields: ["a", "zz"] }), { message: 'Facet fields: the data has no column "zz".' });
  s.dispose();
});

test("fields x a category: row-major cells over each category's rows", async () => {
  const s = table();
  const p = await partitionFacets(s, { fields: ["a", "b"], row: "g", rowOrder: ["p", "q", "r", "none"] });
  assert.deepEqual(p.cells.map((c) => [c.row, c.column, c.label, c.view.length]), [
    ["p", "a", "p · a", 3], ["p", "b", "p · b", 3], ["q", "a", "q · a", 2], ["q", "b", "q · b", 2],
    ["r", "a", "r · a", 1], ["r", "b", "r · b", 1], ["none", "a", "none · a", 0], ["none", "b", "none · b", 0]]);
  assert.equal(p.columns, 2);
  const cell = p.cells[3].view;
  assert.deepEqual(await values(cell, "value"), [50, 30]);
  assert.deepEqual(await values(cell, "id"), [2, 4]);
  assert.deepEqual(await values(cell, "field"), [1, 1]);
  assert.equal(cell.columnIdentity("value"), s.columnIdentity("b"));
  assert.equal(cell.identityRows, false);
  assert.equal(p.cells[0].view.columnIdentity("field"), cell.columnIdentity("field"));
  const brush = brushColumn(cell, "value", "y", "o");
  assert.equal(brush?.name, "b");
  assert.equal(brush.identity, s.columnIdentity("b"));
  brush.release();
  p.dispose();
  // Stacked fields with a column split: cells run field by field.
  const stacked = await partitionFacets(s, { fields: { row: ["a", "b"] }, column: "g" });
  assert.deepEqual(stacked.cells.map((c) => c.label), ["a · p", "a · q", "a · r", "b · p", "b · q", "b · r"]);
  assert.equal(stacked.columns, 3);
  stacked.dispose();
  s.dispose();
});

test("fields x a category disposes every view it made", async () => {
  const s = table();
  let disposed = 0;
  const p = await partitionFacets(s, { fields: ["a", "b"], row: "g" });
  const parents = new Set(p.cells.map((cell) => cell.view.parent));
  assert.equal(parents.size, 3);
  for (const parent of parents) {
    const before = parent.onDispose;
    parent.onDispose = () => { disposed++; before?.(); };
  }
  // The category views outlive the partition's own reference: the cells retain them.
  assert.deepEqual(await values(p.cells[5].view, "value"), [10]);
  p.cells[0].view.dispose();
  assert.equal(disposed, 0);
  p.cells[1].view.dispose();
  assert.equal(disposed, 1);
  p.dispose();
  assert.equal(disposed, 3);
  s.dispose();
});

test("pairs: every pair of fields, rectangles and orders", async () => {
  const s = table();
  const next = await partitionFacets(s, { pairs: ["a", "b", "c"] });
  assert.deepEqual(next.cells.map((c) => [c.key, c.gridRow, c.gridColumn]).slice(0, 2), [['["a","a"]', 1, 1], ['["a","b"]', 1, 2]]);
  assert.equal(next.columns, 3);
  for (const cell of next.cells) {
    assert.equal(cell.view.get("x"), s.get(cell.column));
    assert.equal(cell.view.columnIdentity("y"), s.columnIdentity(cell.row));
    assert.deepEqual(cell.axisFields, { x: cell.column, y: cell.row });
  }
  next.dispose();
  const lower = await partitionFacets(s, { pairs: ["a", "b", "c"], triangle: "lower", diagonal: false });
  assert.deepEqual(lower.cells.map((c) => [c.label, c.gridRow, c.gridColumn]), [["b · a", 2, 1], ["c · a", 3, 1], ["c · b", 3, 2]]);
  lower.dispose();
  const xy = await partitionFacets(s, { pairs: { x: ["a", "b"], y: ["c"] } });
  assert.deepEqual(xy.cells.map((c) => c.label), ["c · a", "c · b"]);
  assert.equal(xy.columns, 2);
  xy.dispose();
  // Orders reorder the cells.
  const ordered = await partitionFacets(s, { pairs: ["a", "b"], rowOrder: ["b", "a"] });
  assert.deepEqual(ordered.cells.map((c) => c.label), ["b · a", "b · b", "a · a", "a · b"]);
  ordered.dispose();
  // Renamed aliases, metadata, and scales.
  const renamed = await partitionFacets(s, { pairs: ["a", "b"], as: { x: "px", y: "py" } });
  assert.equal(renamed.cells[1].view.get("px"), s.get("b"));
  assert.equal(renamed.cells[1].view.scale("px"), s.scale("b"));
  renamed.dispose();
  await assert.rejects(partitionFacets(s, { pairs: ["a", "g"] }), { message: 'Facet pairs requires numeric columns; "g" is not one.' });
  await assert.rejects(partitionFacets(s, { pairs: ["a", "zz"] }), { message: 'Facet pairs: the data has no column "zz".' });
  await assert.rejects(partitionFacets(s, { pairs: ["a"], row: "g" }), { message: FACET_SPEC_ERRORS.pairsCombine });
  s.dispose();
});

test("Fold cells carry the scales=\"field\" lookups", async () => {
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const s = table();
  const folded = await runTransform("Fold", s, { fields: ["a", "b"] });
  const p = await partitionFacets(folded, { column: "key" });
  assert.deepEqual(p.cells.map((c) => c.field), ["a", "b"]);
  assert.deepEqual([...p.fieldIdentities.values()], ["a", "b"]);
  assert.equal(p.fieldIdentities.get(s.columnIdentity("b")), "b");
  p.dispose();
  folded.dispose();
  // A plain categorical facet has none.
  const g = await partitionFacets(s, { column: "g" });
  assert.equal(g.fieldIdentities.size, 0);
  assert.ok(g.inputIdentities.has(s.columnIdentity("a")));
  g.dispose();
  s.dispose();
});
