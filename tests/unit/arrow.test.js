import test from "node:test";
import assert from "node:assert/strict";
import * as arrow from "apache-arrow";
import { arrowColumns, isArrowTable } from "../../src/lib/plot/utils/arrow.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { asArray } from "../../src/lib/plot/utils/data.js";
import { table as table_ } from "../../src/lib/plot/utils/interaction.js";

const T0 = Date.UTC(2026, 0, 1);
const values = (column) => [...(column.__hmplotColumn ? column.values : column)];

test("Arrow columns by type: numbers, strings, dictionaries, booleans, times, lists (TODO 48.2)", () => {
  const table = new arrow.Table({
    f: arrow.vectorFromArray([1.5, null, 3.5], new arrow.Float32),
    half: arrow.vectorFromArray([1.5, -4, null], new arrow.Float16),
    i: arrow.vectorFromArray([1, 2, null], new arrow.Int32),
    u: arrow.vectorFromArray([1, 4e9, 3], new arrow.Uint32),
    big: arrow.vectorFromArray([1n, null, 2n ** 40n], new arrow.Int64),
    s: arrow.vectorFromArray(["a", null, "b"], new arrow.Utf8),
    d: arrow.vectorFromArray(["x", "y", null], new arrow.Dictionary(new arrow.Utf8, new arrow.Int32, 0, true)),
    b: arrow.vectorFromArray([true, null, false], new arrow.Bool),
    ts: arrow.vectorFromArray([new Date(T0), null, new Date(T0 + 1500)], new arrow.TimestampMillisecond("Europe/Paris")),
    day: arrow.vectorFromArray([new Date(T0), new Date(T0 + 864e5), null], new arrow.DateDay),
    pos: arrow.vectorFromArray([[1, 2], null, [5, 6]], new arrow.FixedSizeList(2, new arrow.Field("v", new arrow.Float32))),
  });
  assert.equal(isArrowTable(table), true);
  assert.equal(isArrowTable({ x: [1] }), false);
  const out = arrowColumns(table);
  assert.deepEqual(values(out.f), [1.5, NaN, 3.5], "a missing row is NaN");
  assert.deepEqual(values(out.half), [1.5, -4, NaN], "Float16 is decoded from its bits");
  assert.deepEqual(values(out.i), [1, 2, NaN]);
  assert.equal(out.i.metadata.integer, true);
  assert.deepEqual(values(out.u), [1, 4e9, 3], "uint32 is exact on the host");
  assert.deepEqual(values(out.big), [1n, NaN, 2n ** 40n], "int64 stays exact");
  assert.deepEqual([...out.s.codes], [0, -1, 1]);
  assert.deepEqual(out.s.categories, ["a", "b"]);
  assert.deepEqual([...out.d.codes], [0, 1, -1]);
  assert.equal(out.d.metadata.type, "ordinal", "an ordered dictionary is ordinal");
  assert.deepEqual(values(out.b), [true, null, false]);
  assert.deepEqual(values(out.ts), [T0, NaN, T0 + 1500]);
  assert.deepEqual(out.ts.metadata, { type: "datetime", unit: "ms", timezone: "Europe/Paris" });
  assert.deepEqual(values(out.day), [T0, T0 + 864e5, NaN]);
  assert.deepEqual(out.pos, [[1, 2], [NaN, NaN], [5, 6]]);
});

test("Arrow chunks, slices and merged dictionaries read as one column", () => {
  // Two chunks, each with its own dictionary (as batches of an IPC stream carry them).
  const type = new arrow.Dictionary(new arrow.Utf8, new arrow.Int32);
  const table = new arrow.Table({
    x: arrow.vectorFromArray([1, 2], new arrow.Float64).concat(arrow.vectorFromArray([3, 4], new arrow.Float64)),
    g: arrow.vectorFromArray(["a", "b"], type).concat(arrow.vectorFromArray(["b", "c"], type)),
  });
  assert.equal(table.getChild("x").data.length, 2);
  const out = arrowColumns(table);
  assert.deepEqual(values(out.x), [1, 2, 3, 4]);
  assert.deepEqual(out.g.categories, ["a", "b", "c"], "each batch's dictionary maps into one list");
  assert.deepEqual([...out.g.codes], [0, 1, 1, 2]);
  const sliced = arrowColumns(new arrow.Table({
    v: arrow.vectorFromArray([1, null, 3, 4], new arrow.Int32),
    pos: arrow.vectorFromArray([[1, 2], null, [5, 6], [7, 8]], new arrow.FixedSizeList(2, new arrow.Field("v", new arrow.Float32))),
  }).slice(1, 3));
  assert.deepEqual(values(sliced.v), [NaN, 3]);
  assert.deepEqual(sliced.pos, [[NaN, NaN], [5, 6]]);
});

test("unsupported Arrow columns are refused, naming the column", () => {
  const table = new arrow.Table({ nested: arrow.vectorFromArray([[1, 2], [3]], new arrow.List(new arrow.Field("v", new arrow.Int32))) });
  assert.throws(() => arrowColumns(table), {
    message: "Arrow column nested is a List column, which is not supported. Columns can be numbers, strings, dictionaries, " +
      "booleans, timestamps, dates, durations, decimals or lists of 2 or 3 numbers.",
  });
  const wide = new arrow.Table({ p: arrow.vectorFromArray([[1, 2, 3, 4]], new arrow.FixedSizeList(4, new arrow.Field("v", new arrow.Float32))) });
  assert.throws(() => arrowColumns(wide), { message: "Arrow column p is a list of 4; only lists of 2 or 3 numbers (positions) are columns." });
});

test("an Arrow table is a Data value: columns, datetimes from their first time, and the same table skips the update", () => {
  const table = new arrow.Table({
    t: arrow.vectorFromArray([new Date(T0), new Date(T0 + 1000)], new arrow.TimestampMillisecond),
    y: arrow.vectorFromArray([1, null], new arrow.Float64),
    g: arrow.vectorFromArray(["a", "b"], new arrow.Utf8),
  });
  const scope = createDataScope();
  scope.update(table);
  assert.deepEqual(scope.keys(), ["t", "y", "g"]);
  assert.equal(scope.length, 2);
  assert.equal(scope.metadata("t").origin, T0);
  assert.deepEqual(asArray(scope.get("t")).js(), [0, 1000]);
  assert.deepEqual(asArray(scope.get("y")).js(), [1, NaN]);
  assert.equal(scope.metadata("g").type, "categorical");
  const version = scope.version;
  scope.update(table);
  assert.equal(scope.version, version, "the same table is not prepared again");
  assert.throws(() => scope.applyOffsets(), { message: "applyOffsets works on column or row tables, not Arrow tables." });
  // table() shares one identity between the scopes of an Arrow table.
  const shared = createDataScope(), other = createDataScope();
  shared.update(table_(table)); other.update(table);
  assert.equal(shared.identity, other.identity);
  scope.dispose(); shared.dispose(); other.dispose();
});
