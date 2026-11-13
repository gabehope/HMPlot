import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView, rootScope } from "../../src/lib/plot/utils/dataView.js";
import { identity, interactionVersion, onMembershipChange } from "../../src/lib/plot/utils/interaction.js";
import { createOffsetLayer, applyOffsets } from "../../src/lib/plot/utils/offsets.js";
import {
  offset, moved, col, add, abs, sum, greater, evaluateExpression, expressionFields, expressionDescriptor,
  expressionFromDescriptor, resolveOffsetShorthands,
} from "../../src/lib/plot/utils/expressions.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { SceneResources } from "../../src/lib/scene/resources.js";

const read = async (array) => Array.from(await array.ref.data(), Number);
const readOwned = async (array) => { try { return await read(array); } finally { array.dispose(); } };
const evaluate = async (expression, scope) => {
  const result = evaluateExpression(expression, scope);
  try { return await read(result.value); } finally { result.dispose(); }
};

test("an offset layer sets, reads, lists, snapshots and clears per-row deltas", async () => {
  const layer = createOffsetLayer();
  layer.rows(4);
  const statuses = [];
  const stop = layer.subscribe((status) => statuses.push(status));
  assert.equal(layer.active, false);
  // Zeros never create a column.
  layer.set("x", [1], 0);
  assert.deepEqual(layer.columns(), []);
  layer.set("x", [1, 3], [2.5, -1]);
  layer.set("y", [0], 4);
  assert.deepEqual(layer.columns(), ["x", "y"]);
  assert.equal(layer.value("x", 1), 2.5);
  assert.equal(layer.value("z", 1), 0);
  assert.deepEqual([...layer.host("x")], [0, 2.5, 0, -1]);
  assert.deepEqual(layer.entries(), [
    { row: 1, column: "x", delta: 2.5 }, { row: 3, column: "x", delta: -1 }, { row: 0, column: "y", delta: 4 },
  ]);
  assert.deepEqual(await read(layer.device("x")), [0, 2.5, 0, -1]);
  assert.deepEqual(await read(layer.device("never")), [0, 0, 0, 0]);
  const snapshot = layer.snapshot();
  layer.set("x", [1], 9).clear("y");
  assert.deepEqual(layer.columns(), ["x"]);
  layer.restore(snapshot);
  assert.equal(layer.value("x", 1), 2.5);
  assert.equal(layer.value("y", 0), 4);
  layer.setColumn("y", [1, 2, 3, 4]);
  assert.deepEqual(await read(layer.device("y")), [1, 2, 3, 4]);
  layer.clear();
  assert.equal(layer.active, false);
  assert.deepEqual(statuses.map((status) => status.active), [false, true, true, true, true, true, true, false]);
  assert.equal(interactionVersion(layer), layer.version);
  stop();
  layer.dispose();
});

test("offset layers reject rows, deltas and names they cannot hold", () => {
  const layer = createOffsetLayer();
  layer.rows(3);
  assert.throws(() => layer.set("x", [3], 1), /Offset rows must be integers from 0 to 2; received 3\./);
  assert.throws(() => layer.set("x", [0, 1], [1]), /Offsets for x: 2 rows and 1 deltas\./);
  assert.throws(() => layer.set("x", [0], [NaN]), /Offsets for x must be finite numbers\./);
  assert.throws(() => layer.set("@offset:x", [0], 1), /Offsets need a column name; received "@offset:x"\./);
  assert.throws(() => layer.setColumn("x", [1, 2]), /Offsets for x need 3 values; received 2\./);
  layer.dispose();
});

test("keyed replacements keep the offsets of surviving keys; unkeyed ones keep rows by position", async () => {
  const keyed = createDataScope({ key: "id" });
  keyed.update({ id: ["a", "b", "c"], x: [1, 2, 3] });
  keyed.identity.offsets.set("x", [0, 1], [10, 20]);
  keyed.update({ id: ["c", "b", "d"], x: [30, 20, 40] });
  assert.deepEqual([...keyed.identity.offsets.host("x")], [0, 20, 0]);
  keyed.update({ id: ["e"], x: [5] });
  assert.deepEqual(keyed.identity.offsets.columns(), []);
  keyed.dispose();

  // Another key over the same rows: every row keeps its offsets (the old key's values name no
  // rows of the new one).
  const rekeyed = createDataScope({ key: "id" });
  rekeyed.update({ id: ["a", "b", "c"], name: ["c", "a", "b"], x: [1, 2, 3] });
  rekeyed.identity.offsets.set("x", [0], 7);
  rekeyed.setKey("name");
  assert.deepEqual([...rekeyed.identity.offsets.host("x")], [7, 0, 0]);
  rekeyed.dispose();

  const unkeyed = createDataScope();
  unkeyed.update({ x: [1, 2, 3] });
  unkeyed.identity.offsets.set("x", [2], 5);
  unkeyed.update({ x: [4, 5, 6] });
  assert.equal(unkeyed.identity.offsets.value("x", 2), 5);
  unkeyed.update({ x: [4, 5] });
  assert.deepEqual(unkeyed.identity.offsets.columns(), []);
  unkeyed.dispose();

  const owner = identity({ keys: ["p", "q"] });
  assert.equal(owner.offsets.length, 2);
  owner.dispose();
});

test("a table scope reads offsets as @offset columns and refuses non-numeric ones", async () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3], g: ["a", "b", "a"] });
  assert.equal(scope.has("@offset:x"), true);
  assert.equal(scope.has("@offset:missing"), false);
  assert.deepEqual(await read(scope.get("@offset:x")), [0, 0, 0]);
  scope.identity.offsets.set("x", [1], 0.5);
  assert.deepEqual(await read(scope.get("@offset:x")), [0, 0.5, 0]);
  assert.equal(scope.interactionResource("@offset:x"), scope.identity.offsets);
  assert.throws(() => scope.get("@offset:g"), /offset\("g"\): g is a categorical column; offsets are numeric deltas in a numeric column's units\./);
  assert.throws(() => createDataScope().update({ "@offset:x": [1] }), /Data column @offset:x: names starting with @ are reserved for state/);
  scope.dispose();
  // An empty table (a Provider's empty result) reads empty offsets.
  const empty = createDataScope();
  empty.update({ x: [] }, { x: "numeric" });
  assert.deepEqual(await read(empty.get("@offset:x")), []);
  empty.dispose();
});

test("offset() and moved() evaluate, list their fields and round-trip as descriptors", async () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3], g: ["a", "b", "a"] });
  scope.identity.offsets.set("x", [0, 2], [10, -1]);
  assert.deepEqual(await evaluate(offset("x"), scope), [10, 0, -1]);
  assert.deepEqual(await evaluate(moved("x"), scope), [11, 2, 2]);
  assert.deepEqual(await evaluate(add(moved("x"), offset("x")), scope), [21, 2, 1]);
  assert.deepEqual([...expressionFields(moved("x"))], ["x", "@offset:x"]);
  assert.deepEqual([...expressionFields(abs(offset("x")))], ["@offset:x"]);
  assert.deepEqual(expressionFromDescriptor(expressionDescriptor(moved("x"))), moved("x"));
  // col.x and ":x" name the column too (R2.0).
  assert.deepEqual([moved(col("x")), moved(":x")], [moved("x"), moved("x")]);
  assert.throws(() => moved(add("x", 1)), /moved\(\) needs the name of a table column, such as moved\("weight"\)/);
  assert.throws(() => offset("@brushed"), /offset\(\) needs the name of a table column/);
  assert.throws(() => evaluateExpression(moved("g"), scope), /moved\("g"\): g is categorical; offsets move numeric columns\./);
  assert.throws(() => evaluateExpression(offset("nope"), scope), /missing field "nope"/);
  scope.dispose();
});

test("views carry offsets through Filter and Sort, follow facet aliases, and refuse aggregates", async () => {
  const scope = createDataScope();
  scope.update({ x: [5, 1, 7, 3], g: ["a", "b", "a", "b"] });
  scope.identity.offsets.set("x", [0, 3], [100, 30]);
  // A Filter that reads moved() keeps the rows whose moved value passes.
  const filtered = await runTransform("Filter", scope, { where: greater(moved("x"), 6) });
  assert.deepEqual(await evaluate(moved("x"), filtered), [105, 7, 33]);
  const sorted = await runTransform("Sort", scope, { by: "x" });
  assert.deepEqual(await evaluate(offset("x"), sorted), [0, 30, 100, 0]);
  // A facet cell's alias (x names weight) moves the table's column.
  const cell = createDataView(scope, { columns: { v: scope.get("x") } });
  cell.fieldIdentity = { v: "x" };
  assert.equal(cell.has("@offset:v"), true);
  assert.deepEqual(await evaluate(moved("v"), cell), [105, 1, 7, 33]);
  // A view borrows its columns: the test owns twice.
  const twice = np.array([1, 2, 3, 4]), computed = createDataView(scope, { columns: { twice } });
  assert.throws(() => computed.get("@offset:twice"), /offset\("twice"\): twice is computed by a transform, not a column of the table; read moved\(\) of its source columns before that transform\./);
  const grouped = await runTransform("Group", scope, { by: "g", columns: { total: sum("x") } });
  assert.throws(() => grouped.get("@offset:x"), /offset\("x"\) is not available after an aggregate: compute moved\("x"\) in a Calculate before it\./);
  assert.equal(rootScope(sorted), scope);
  // A column named "a:b": reading a's offsets keeps its cached ones.
  const named = createDataScope();
  named.update({ a: [2, 1], "a:b": [3, 4] });
  const reordered = await runTransform("Sort", named, { by: "a" });
  const ab = reordered.get("@offset:a:b");
  reordered.get("@offset:a");
  assert.deepEqual(await read(ab), [0, 0]);
  for (const view of [filtered, sorted, cell, computed, grouped, reordered]) view.dispose();
  twice.dispose();
  scope.dispose();
  named.dispose();
});

test("offset changes notify transforms and marks that read them", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2] });
  const calls = [];
  const stop = onMembershipChange(scope.interactionResource("@offset:x"), (status) => calls.push(status.active));
  const before = scope.interactionRevision;
  scope.identity.offsets.set("x", [0], 1);
  assert.deepEqual(calls, [true]);
  assert.ok(scope.interactionRevision > before);
  stop();
  scope.dispose();
});

test("@offset_x, @offset_y and @offset_z read the offset of the column their channel names", () => {
  const props = resolveOffsetShorthands({ x: moved("weight"), y: "age", size: abs("@offset_x"), fill: "@offset_y" });
  assert.deepEqual(props.size, abs(offset("weight")));
  assert.deepEqual(props.fill, offset("age"));
  assert.throws(() => resolveOffsetShorthands({ x: add("a", "b"), size: "@offset_x" }, "Points"),
    /Points size: @offset_x reads the offset of the column x names, but x is not one column; name the column instead: offset\(name\)\./);
  assert.throws(() => resolveOffsetShorthands({ x: "a", size: "@offset_z" }, "Points"), /but z is not set/);
});

test("applyOffsets replaces each dragged column by its moved values and leaves the table alone", async () => {
  const layer = createOffsetLayer();
  layer.rows(3);
  layer.set("x", [0, 2], [1, -1]).set("w", [1], 0.5);
  const columns = { x: Float64Array.from([10, 20, 30]), w: [1, 2, 3], label: ["a", "b", "c"] };
  const applied = applyOffsets(columns, layer);
  assert.deepEqual([...applied.x], [11, 20, 29]);
  assert.ok(applied.x instanceof Float64Array);
  assert.deepEqual(applied.w, [1, 2.5, 3]);
  assert.equal(applied.label, columns.label);
  assert.deepEqual([...columns.x], [10, 20, 30]);
  const rows = applyOffsets([{ x: 1, w: 1 }, { x: 2, w: 2 }, { x: 3, w: 3 }], layer);
  assert.deepEqual(rows, [{ x: 2, w: 1 }, { x: 2, w: 2.5 }, { x: 2, w: 3 }]);
  // applyOffsets borrows device columns and returns new ones.
  const deviceColumns = { x: np.array([1, 2, 3]), w: np.array([0, 0, 0]) };
  const device = applyOffsets(deviceColumns, layer);
  assert.deepEqual(await readOwned(device.x), [2, 2, 2]);
  device.w.dispose();
  Object.values(deviceColumns).forEach((column) => column.dispose());
  assert.throws(() => applyOffsets([{ x: 1 }], layer), /The table has 1 rows and its offsets 3\./);
  const scope = createDataScope();
  scope.update([{ x: 1 }, { x: 2 }]);
  scope.identity.offsets.set("x", [1], 3);
  assert.deepEqual(scope.applyOffsets(), [{ x: 1 }, { x: 5 }]);
  scope.dispose();
  layer.dispose();
});

test("offsets from Python apply to the rows they index, after a keyed remap when the data changed too", () => {
  const scope = createDataScope({ key: "id" });
  scope.update({ id: ["a", "b"], x: [1, 2] });
  const layer = scope.identity.offsets;
  layer.hydrate({ length: 2, columns: { x: { rows: [1], deltas: [5] } } });
  assert.deepEqual([...layer.host("x")], [0, 5]);
  // A new version (b moved to row 0) with its offsets: they wait for the rows they index.
  layer.hydrate({ length: 3, columns: { x: { rows: [0], deltas: [7] } } }, { pending: true });
  assert.deepEqual([...layer.host("x")], [0, 5]);
  scope.update({ id: ["b", "c", "a"], x: [2, 3, 1] });
  assert.deepEqual([...layer.host("x")], [7, 0, 0]);
  assert.throws(() => layer.hydrate({ length: 3, columns: { x: { rows: [3], deltas: [1] } } }), /Offset rows must be integers from 0 to 2; received 3\./);
  scope.dispose();
});

test("a scene takes a table's offsets from Python once per version, so a republish keeps a drag", async () => {
  const resources = new SceneResources();
  // A column already held, so nothing is uploaded.
  resources.columns.set("c-x", [1, 2, 3]);
  const state = (version, offsets) => ({
    columns: { "c-x": { id: "c-x", shape: [3], dtype: "float32", byte_order: "little" } },
    tables: { t: { version: 1, key: null, columns: { x: { $column: "c-x" } }, offsets } },
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {},
  });
  const fail = () => { throw Error("unexpected column"); };
  resources.commit(await resources.prepare(state(1, { version: 1, length: 3, columns: { x: { rows: [2], deltas: [5] } } }), fail));
  const scope = createDataScope();
  scope.update(resources.tables.get("t").value);
  const layer = scope.identity.offsets;
  assert.deepEqual([...layer.host("x")], [0, 0, 5]);
  // A drag, then the same snapshot again (a republish for another reason): the drag stays.
  layer.set("x", [0], 1);
  resources.commit(await resources.prepare(state(1, { version: 1, length: 3, columns: { x: { rows: [2], deltas: [5] } } }), fail));
  assert.deepEqual([...layer.host("x")], [1, 0, 5]);
  // A newer version from Python replaces them, at once: the table's data did not change.
  resources.commit(await resources.prepare(state(1, { version: 2, length: 3, columns: {} }), fail));
  assert.deepEqual(layer.columns(), []);
  scope.dispose();
});
