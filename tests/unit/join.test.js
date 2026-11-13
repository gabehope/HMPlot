// TODO 43: the join plan (utils/tableJoin.js) and the Join transform (transforms/join.js).
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { joinRows, keyValues, createJoinTable } from "../../src/lib/plot/utils/tableJoin.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform, disposeTransformCache } from "../../src/lib/plot/utils/transforms.js";
import { resolveColumn } from "../../src/lib/plot/interaction/channelWriteback.js";
import { rememberHostSource } from "../../src/lib/plot/utils/hostSources.js";

/** The rows `left` matches in `right` by a host reference: a linear search per row. */
function reference(left, right) {
  const same = (a, b) => a !== null && a !== undefined && !(typeof a === "number" && Number.isNaN(a)) && a === b;
  return left[0].map((_, i) => right[0].findIndex((_, j) => left.every((part, k) => same(part[i], right[k][j]))));
}

test("joinRows matches each key kind, composite keys and big integers against a host reference; missing keys match nothing", () => {
  const cases = [
    [[["a", "b", null, "c"]], [["c", "a", "x"]]],
    [[[1, 2, NaN, 3, 2]], [[3, 2, 1]]],
    [[[true, false, true]], [[false, true]]],
    [[["a", "a", "b"], [1, 2, 1]], [["b", "a", "a"], [1, 2, 1]]],
  ];
  for (const [left, right] of cases) assert.deepEqual([...joinRows(left, right)], reference(left, right), JSON.stringify(left));
  // Integers past 2^24 (and past 2^53, as BigInts) stay apart; 7n is 7.
  assert.deepEqual([...joinRows([[2 ** 24, 2 ** 24 + 1, 7n, 2n ** 60n]], [[2 ** 24 + 1, 7, 2n ** 60n, 2 ** 24]])], [3, 0, 1, 2]);
  assert.deepEqual([...joinRows([[]], [["a"]])], []);
  assert.deepEqual([...joinRows([["a"]], [[]])], [-1]);
  // Missing keys in the joined table are not duplicates of each other.
  assert.deepEqual([...joinRows([["a"]], [[null, null, "a"]])], [2]);
});

test("a composite key is its parts, whatever text they hold (TODO 69.2)", () => {
  // CODEX_REVIEW #3: parts holding the delimiter and a kind tag ran together into one key.
  assert.deepEqual([...joinRows([["a\u0000string:b"], ["c"]], [["a"], ["b\u0000string:c"]])], [-1]);
  // So two different rows of the joined table were "the same key".
  const right = [["a\u0000string:b", "a"], ["c", "b\u0000string:c"]];
  assert.deepEqual([...joinRows([["a", "a\u0000string:b"], ["b\u0000string:c", "c"]], right)], [1, 0]);
  assert.deepEqual([...joinRows([["ab", "a"], ["c", "bc"]], [["a", "ab"], ["bc", "c"]])], [1, 0], "lengths split the parts");
  // A true repeat is still an error; numbers match BigInts and not text, part by part.
  assert.throws(() => joinRows([["x"], ["y"]], [["x", "x"], ["y", "y"]]), { message: 'Join: the joined table has the key "x", "y" more than once; each row takes one row\'s columns (many-to-one).' });
  assert.deepEqual([...joinRows([[7, 2n ** 60n], ["a", "b"]], [[2n ** 60n, 7n], ["b", "a"]])], [1, 0]);
  assert.deepEqual([...joinRows([[1, "1"], ["a", "a"]], [["1", 2], ["a", "a"]], { mismatch: false })], [-1, 0]);
});

test("joinRows errors: a repeated key, keys of different kinds, unpaired key columns", () => {
  assert.throws(() => joinRows([["a"]], [["a", "b", "a"]]),
    { message: 'Join: the joined table has the key "a" more than once; each row takes one row\'s columns (many-to-one).' });
  assert.throws(() => joinRows([["1"]], [[1]], { names: { left: ["id"], right: ["code"] } }),
    { message: "Join: id holds text and the joined table's code holds numbers; keys match only values of the same kind." });
  assert.throws(() => joinRows([["a"], [1]], [["a"]]), { message: "Join: 2 key columns on the table, 1 on the joined table." });
});

test("key values come from the table's host columns, datetimes as epoch milliseconds", async () => {
  const scope = createDataScope(), T0 = Date.UTC(2026, 0, 1);
  scope.update({ g: ["b", "a", null], n: [3, null, 1], t: [new Date(T0), new Date(T0 + 1000), null] });
  assert.deepEqual((await keyValues(scope, "g")).values, ["b", "a", null]);
  assert.deepEqual((await keyValues(scope, "n")).values, [3, null, 1]);
  const t = await keyValues(scope, "t");
  assert.equal(t.source, true, "no readback");
  assert.deepEqual(t.values, [T0, T0 + 1000, null]);
  scope.dispose();
});

test("safe int64 keys have the same identity through host and uploaded-column key readers", async () => {
  const array = np.array([0, 1, 2]);
  rememberHostSource(array, Float32Array.from([0, 1, 2]), [3], { exact: BigInt64Array.from([0n, 1n, 2n]) });
  const fallback = { get: () => array, metadata: () => undefined };
  assert.deepEqual((await keyValues(fallback, 'id')).values, [0, 1, 2]);
  const host = { hostColumn: () => BigInt64Array.from([0n, 1n, 2n]), length: 3 };
  assert.deepEqual((await keyValues(host, 'id')).values, [0, 1, 2]);
  const large = { hostColumn: () => [2n ** 60n], length: 1 };
  assert.deepEqual((await keyValues(large, 'id')).values, [2n ** 60n], 'unsafe integers stay exact');
  array.dispose();
});

async function joined(left, right, config, schema) {
  const scope = createDataScope(), tables = createJoinTable();
  scope.update(left, schema);
  const view = await runTransform("Join", scope, { data: tables.table(right), ...config });
  return { scope, tables, view, read: (name) => {
    const value = view.get(name);
    return value?.categories ? Array.from(value.codes.ref.js(), (code) => (code < 0 ? null : value.categories[code])) : value.ref.js();
  } };
}

test("a left Join adds the joined table's columns by key; unmatched rows get missing values", async () => {
  const flights = { airport: ["SFO", "JFK", "XXX", "SFO"], delay: [5, 20, 7, 1] };
  const airports = { airport: ["JFK", "SFO", "ORD"], region: ["East", "West", "Midwest"], elevation: [13, 4, 668] };
  const { scope, tables, view, read } = await joined(flights, airports, { on: "airport" });
  assert.deepEqual(view.keys().sort(), ["airport", "delay", "elevation", "region"]);
  assert.deepEqual(read("region"), ["West", "East", null, "West"]);
  assert.deepEqual(read("elevation"), [4, 13, NaN, 4]);
  assert.equal(view.length, 4, "a left join keeps every row");
  assert.equal(view.metadata("region").type, "categorical");
  // The joined column uses the joined table's scale: its categories in its own order.
  assert.deepEqual(view.scale("region").domain.slice(0, 3), ["East", "West", "Midwest"]);
  // A drag of a joined column names the join (TODO 38).
  assert.equal(resolveColumn(view, "region").reason, "region is joined from another table");
  view.dispose(); tables.dispose(); scope.dispose();
});

test("an inner Join hides unmatched rows; fields, as, leftOn/rightOn and composite keys", async () => {
  const left = { code: ["a", "b", "c"], year: [1, 1, 2], value: [10, 20, 30] };
  const right = { key: ["a", "c", "b"], when: [1, 2, 2], label: ["A", "C", "B"], extra: [0, 0, 0] };
  const { scope, tables, view, read } = await joined(left, right,
    { leftOn: ["code", "year"], rightOn: ["key", "when"], how: "inner", fields: ["label"], as: { label: "name" } });
  assert.deepEqual(view.keys().sort(), ["code", "name", "value", "year"]);
  assert.equal(view.length, 2, "b in year 1 has no match");
  assert.deepEqual(read("name"), ["A", "C"], "the view shows the matched rows");
  view.dispose(); tables.dispose(); scope.dispose();
});

test("Join errors name the column: a missing key, a collision, a bad how", async () => {
  const scope = createDataScope(), tables = createJoinTable();
  scope.update({ id: [1, 2], name: ["x", "y"] });
  const run = (right, config) => runTransform("Join", scope, { data: tables.table(right), ...config });
  await assert.rejects(run({ id: [1] }, { on: "nope" }), { message: "the table has no column nope to join on." });
  await assert.rejects(run({ key: [1] }, { on: "id" }), { message: "the joined table has no column id to join on." });
  await assert.rejects(run({ id: [1, 2], name: ["p", "q"] }, { on: "id" }),
    { message: "name is already a column of the table; choose the joined columns with fields, or rename it with as." });
  await assert.rejects(run({ id: [1] }, { on: "id", how: "outer" }), { message: 'Join how must be "left" or "inner", not "outer".' });
  await assert.rejects(runTransform("Join", scope, { on: "id" }), { message: "Join requires data=, the table to join." });
  tables.dispose(); scope.dispose();
});

test("a Join's table in a config is JSON of its identity and version (Facet cache keys), and the same value keeps its reference", () => {
  const tables = createJoinTable(), value = { k: [1] };
  const first = tables.table(value);
  assert.equal(tables.table(value), first);
  const json = JSON.parse(JSON.stringify({ data: first, on: "k" }));
  assert.deepEqual(Object.keys(json.data), ["joinTable", "version"]);
  const next = tables.table({ k: [2] });
  assert.notEqual(JSON.stringify(next), JSON.stringify(first), "a new table is a new key");
  tables.dispose();
});

test("the row mapping is built once per key column and table version, and taken through a Filter's rows", async () => {
  const scope = createDataScope(), tables = createJoinTable(), cache = {};
  scope.update({ k: [1, 2, 3, 4], v: [1, 2, 3, 4] });
  const airports = { k: [4, 3, 2, 1], label: ["d", "c", "b", "a"] };
  const filtered = await runTransform("Filter", scope, { where: { field: "v", op: "gt", value: 2 } });
  const first = await runTransform("Join", filtered, { data: tables.table(airports), on: "k" }, { cache });
  const kept = cache.hostValues.get("join:host");
  const second = await runTransform("Join", filtered, { data: tables.table(airports), on: "k" }, { cache });
  assert.equal(cache.hostValues.get("join:host"), kept, "the same table and key column reuse the mapping");
  const label = second.get("label");
  assert.deepEqual(Array.from(label.codes.ref.js(), (code) => label.categories[code]), ["c", "d"]);
  first.dispose(); second.dispose(); filtered.dispose(); tables.dispose(); scope.dispose(); disposeTransformCache(cache);
  assert.ok(np, "jax is loaded");
});

test("GeoJSON keys preserve typed identity and reject duplicate measurement keys (TODO 43.5)", async () => {
  const { geoRows } = await import("../../src/lib/plot/utils/geoAttributes.js");
  // GeoJSON: features by a property, "12" never matching 12, and its duplicate message.
  const features = [{ properties: { iso: "FRA" } }, { properties: { iso: "12" } }, { properties: {} }];
  const measurements = createDataScope();
  measurements.update({ country: ["DEU", "FRA"] });
  assert.deepEqual((await geoRows(features, measurements, undefined, "iso", "country")).js(), [1, -1, -1]);
  measurements.update({ country: [12, 7] });
  assert.deepEqual((await geoRows(features, measurements, undefined, "iso", "country")).js(), [-1, -1, -1], "no coercion");
  measurements.update({ country: ["FRA", "FRA"] });
  await assert.rejects(geoRows(features, measurements, undefined, "iso", "country"), { message: "Duplicate measurement key: FRA" });
  measurements.dispose();
});

// TODO 140: a Join of another transform's live output (a Group's statistics per route): its
// values follow each new output, keys and fields keep their semantics, unmatched left rows get
// missing values (or are hidden by "inner"), and a repeated right key is still an error.
test("a Join's data can be a live transform output: statistics follow it, keys stay many-to-one", async () => {
  const { count, mean } = await import("../../src/lib/plot/utils/expressions.js");
  const flights = createDataScope(), routes = createDataScope(), tables = createJoinTable(), cache = {};
  flights.update({ route: ["a", "a", "b", "c", "c", "c"], delay: [10, 20, 5, 1, 2, 3] });
  routes.update({ route: ["a", "b", "c", "d"], x: [0, 1, 2, 3] });
  const views = [];
  const values = (array) => Array.from(array.ref.js()).map((v) => (Number.isNaN(v) ? null : Math.round(v * 100) / 100));
  const statistics = async (where) => {
    const filtered = await runTransform("Filter", flights, { where });
    const grouped = await runTransform("Group", filtered, { by: "route", columns: { flights: count(), delay: mean("delay") } });
    views.push(filtered, grouped);
    return grouped;
  };
  try {
    let stats = await statistics({ field: "delay", op: "gte", value: 0 });
    let joined = await runTransform("Join", routes, { data: tables.live(stats), on: "route", fields: ["flights", "delay"] }, { cache });
    views.push(joined);
    assert.deepEqual(values(joined.get("flights")), [2, 1, 3, null]);
    assert.deepEqual(values(joined.get("delay")), [15, 5, 2, null]);
    // A brush-like change: new statistics, the same routes.
    stats = await statistics({ field: "delay", op: "gte", value: 3 });
    joined = await runTransform("Join", routes, { data: tables.live(stats), on: "route", fields: ["flights", "delay"] }, { cache });
    views.push(joined);
    assert.deepEqual(values(joined.get("flights")), [2, 1, 1, null]);
    assert.deepEqual(values(joined.get("delay")), [15, 5, 3, null]);
    // A key set that changes (route c filtered out), inner: the unmatched routes hide.
    stats = await statistics({ field: "delay", op: "gte", value: 5 });
    joined = await runTransform("Join", routes, { data: tables.live(stats), on: "route", how: "inner", fields: ["flights"] }, { cache });
    views.push(joined);
    // sourceIndices() returns the caller's array: read it without another reference.
    const kept = joined.sourceIndices();
    assert.deepEqual(Array.from(kept.js()), [0, 1]);
    // An empty output joins nothing.
    stats = await statistics({ field: "delay", op: "gt", value: 100 });
    joined = await runTransform("Join", routes, { data: tables.live(stats), on: "route", fields: ["flights"] }, { cache });
    views.push(joined);
    assert.deepEqual(values(joined.get("flights")), [null, null, null, null]);
    // Duplicate right keys (rows, not groups) remain an error.
    await assert.rejects(runTransform("Join", routes, { data: tables.live(flights), on: "route", fields: ["delay"] }, { cache }), /more than once/);
  } finally {
    for (const view of views.reverse()) view.dispose();
    disposeTransformCache(cache);
    tables.dispose(); flights.dispose(); routes.dispose();
  }
});
