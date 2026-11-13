import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { createDataScope, axisCategory } from "../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { Array as JaxArray } from "@hmplot/jax";
import { planPartitions, partitionFields, groupLabel, keyCodes } from "../../src/lib/plot/utils/partition.js";
import { prepareNamed } from "../../src/lib/plot/utils/namedData.js";
import { createPartitionSettingsSync } from "../../src/lib/options/partitionSettingsSync.js";
import { optionsRoot } from "../../src/lib/options/options.js";
import { FieldType, BooleanType, ScalarType } from "../../src/lib/plot/objects/types.js";

const data = (value) => {
  const scope = createDataScope();
  scope.update(value);
  return scope;
};
const rows = async (view, key) => {
  const column = view.get(key)?.codes ?? view.get(key);
  return column?.data ? Array.from(await column.ref.data()) : column;
};

test("groups follow the key's first-appearance order and carry their own rows", async () => {
  const scope = data({ x: [1, 2, 3, 4, 5], g: ["b", "a", "b", "c", "a"] });
  const plan = await planPartitions(scope, "g");
  assert.deepEqual(plan.groups.map((group) => group.label), ["b", "a", "c"]);
  assert.deepEqual(plan.groups.map((group) => group.key), ['["b"]', '["a"]', '["c"]']);
  assert.deepEqual(plan.groups.map((group) => group.values), [{ g: "b" }, { g: "a" }, { g: "c" }]);
  assert.deepEqual(await rows(plan.groups[0].view, "x"), [1, 3]);
  assert.deepEqual(await rows(plan.groups[1].view, "x"), [2, 5]);
  assert.deepEqual(await rows(plan.groups[2].view, "x"), [4]);
  plan.dispose();
  scope.dispose();
});

test("a key that disappears from the table takes its group with it", async () => {
  const scope = data({ x: [1, 2, 3], g: ["a", "b", "a"] });
  const first = await planPartitions(scope, "g");
  assert.deepEqual(first.groups.map((group) => group.label), ["a", "b"]);
  first.dispose();
  scope.update({ x: [1, 3], g: ["a", "a"] });
  const second = await planPartitions(scope, "g");
  assert.deepEqual(second.groups.map((group) => group.label), ["a"]);
  second.dispose();
  scope.dispose();
});

test("several keys make one group per combination, including combinations with no rows", async () => {
  const scope = data({ x: [1, 2, 3], g: ["a", "a", "b"], h: ["p", "q", "p"] });
  const plan = await planPartitions(scope, ["g", "h"]);
  assert.deepEqual(plan.groups.map((group) => group.label), ["a · p", "a · q", "b · p", "b · q"]);
  assert.deepEqual(await rows(plan.groups[0].view, "x"), [1]);
  assert.equal(plan.groups[3].view.length, 0);
  plan.dispose();
  scope.dispose();
});

test("a third key nests, and every branch makes the same combinations", async () => {
  const scope = data({ x: [1, 2, 3, 4], g: ["a", "a", "b", "b"], h: ["p", "q", "p", "p"], i: ["u", "u", "u", "v"] });
  const plan = await planPartitions(scope, ["g", "h", "i"]);
  assert.equal(plan.groups.length, 8);
  assert.deepEqual(plan.groups.map((group) => group.label).slice(0, 4),
    ["a · p · u", "a · p · v", "a · q · u", "a · q · v"]);
  assert.deepEqual(await rows(plan.groups[0].view, "x"), [1]);
  assert.deepEqual(await rows(plan.groups[5].view, "x"), [4]); // b · p · v
  assert.equal(plan.groups[7].view.length, 0); // b · q · v has no rows
  plan.dispose();
  scope.dispose();
});

test("too many groups is an error that names the limit", async () => {
  const scope = data({ x: [1, 2, 3], g: ["a", "b", "c"] });
  await assert.rejects(() => planPartitions(scope, "g", { limit: 2 }), {
    code: "limit.partitionGroups",
    message: "Partition: partitioning by g needs 3 groups; the limit is 2 groups. Raise Partition limit= if that is intended.",
  });
  await assert.rejects(() => planPartitions(scope, "g", { limit: 0 }), { message: "Partition limit must be a positive integer." });
  scope.dispose();
});

test("by must name columns", async () => {
  assert.throws(() => partitionFields([]), { message: "Partition by needs a column name or a list of column names." });
  assert.throws(() => partitionFields(["g", ""]), { message: "Partition by needs a column name or a list of column names." });
  assert.throws(() => partitionFields(["g", "g"]), { message: "Partition by lists g twice." });
  assert.deepEqual(partitionFields("g"), ["g"]);
  const scope = data({ x: [1, 2], g: ["a", "b"] });
  await assert.rejects(() => planPartitions(scope, "missing"), { message: "Partition by missing is not a column in this data." });
  scope.dispose();
  assert.equal(groupLabel({ g: null }), "(missing)");
  assert.equal(groupLabel({ g: "a", h: null }), "a · (missing)");
});

// A3: Python sends every numeric column as a typed or device array; the groups are the
// distinct finite values, ascending.
test("a numeric key makes one group per distinct value, ascending", async () => {
  for (const key of [new Float64Array([4, 6, 4, 8]), new Int32Array([4, 6, 4, 8])]) {
    const scope = data({ x: [1, 2, 3, 4], cyl: key });
    const plan = await planPartitions(scope, "cyl");
    assert.deepEqual(plan.groups.map((group) => group.label), ["4", "6", "8"]);
    assert.deepEqual(plan.groups.map((group) => group.values), [{ cyl: 4 }, { cyl: 6 }, { cyl: 8 }]);
    assert.deepEqual(await rows(plan.groups[0].view, "x"), [1, 3]);
    assert.equal(plan.groups[0].view.constants.cyl, 4);
    plan.dispose();
    scope.dispose();
  }
  // A device column (what a data view hands down) reads the same way.
  const device = np.array([8, 6, 6], { dtype: np.float32 });
  const scope = data({ x: [1, 2, 3], cyl: device });
  const plan = await planPartitions(scope, "cyl");
  assert.deepEqual(plan.groups.map((group) => group.label), ["6", "8"]);
  assert.deepEqual(await rows(plan.groups[0].view, "x"), [2, 3]);
  plan.dispose();
  scope.dispose();
  device.dispose(); // Data borrows the array; the fixture owns its original reference.
});

// A4: rows whose key is missing are drawn too, in a trailing "(missing)" group, so the
// partitioned plot has the same domain and brush counts as the plain one.
test("rows with a missing key form a trailing (missing) group", async () => {
  const scope = data({ x: [1, 2, 3, 4, 5], g: ["a", null, "b", "a", undefined] });
  const plan = await planPartitions(scope, "g");
  assert.deepEqual(plan.groups.map((group) => group.label), ["a", "b", "(missing)"]);
  assert.deepEqual(plan.groups[2].values, { g: null });
  assert.equal(plan.groups[2].key, "[null]");
  assert.deepEqual(await rows(plan.groups[2].view, "x"), [2, 5]);
  assert.equal(plan.groups.reduce((sum, group) => sum + group.view.length, 0), 5);
  assert.equal("g" in plan.groups[2].view.constants, false);
  plan.dispose();
  // NaN in a numeric key, and an out-of-range dictionary code, are missing too.
  const numeric = data({ x: [1, 2, 3], v: new Float64Array([1, NaN, 1]) });
  const numericPlan = await planPartitions(numeric, "v");
  assert.deepEqual(numericPlan.groups.map((group) => group.label), ["1", "(missing)"]);
  assert.deepEqual(await rows(numericPlan.groups[1].view, "x"), [2]);
  numericPlan.dispose();
  numeric.dispose();
  const codes = np.array([0, -1, 1], { dtype: np.int32 });
  const dictionary = data({ x: [1, 2, 3], g: { codes, categories: ["a", "b"] } });
  const dictionaryPlan = await planPartitions(dictionary, "g");
  assert.deepEqual(dictionaryPlan.groups.map((group) => group.label), ["a", "b", "(missing)"]);
  assert.deepEqual(await rows(dictionaryPlan.groups[2].view, "x"), [2]);
  dictionaryPlan.dispose();
  dictionary.dispose();
  codes.dispose();
  // With several keys the missing slot is part of the product.
  const two = data({ x: [1, 2, 3], g: ["a", "a", "b"], h: ["p", null, "p"] });
  const twoPlan = await planPartitions(two, ["g", "h"]);
  assert.deepEqual(twoPlan.groups.map((group) => group.label), ["a · p", "a · (missing)", "b · p", "b · (missing)"]);
  assert.deepEqual(await rows(twoPlan.groups[1].view, "x"), [2]);
  assert.equal(twoPlan.groups[3].view.length, 0);
  twoPlan.dispose();
  two.dispose();
  scope.dispose();
});

// B2: a dictionary key (every string column from Python) follows dictionary order and mounts
// only the values that have rows, so a Partition under a Filter loses the filtered-out groups.
test("a dictionary key mounts its categories in dictionary order, only those with rows", async () => {
  const codes = np.array([2, 0, 2], { dtype: np.int32 });
  const scope = data({ x: [1, 2, 3], g: { codes, categories: ["a", "b", "c"] } });
  const plan = await planPartitions(scope, "g");
  assert.deepEqual(plan.groups.map((group) => group.label), ["a", "c"]);
  assert.deepEqual(await rows(plan.groups[1].view, "x"), [1, 3]);
  plan.dispose();
  scope.dispose();
  codes.dispose();
});

// A7: the limit is checked from the key's distinct values before any group view is built or
// any scale is touched.
test("the limit is refused before any group is built, leaving the key's scale alone", async () => {
  const scope = data({ x: [1, 2, 3], g: new Float64Array([1, 2, 3]) });
  await assert.rejects(() => planPartitions(scope, "g", { limit: 2 }), /needs 3 groups; the limit is 2 groups/);
  assert.deepEqual(scope.scale("g").domain, []);
  const codes = await keyCodes(scope, "g");
  assert.deepEqual(codes.order, [1, 2, 3]);
  assert.deepEqual(Array.from(codes.codes), [0, 1, 2]);
  assert.equal(codes.missing, false);
  // Two keys: the product counts, not the combinations that have rows.
  const two = data({ x: [1, 2], g: ["a", "b"], h: ["p", "q"] });
  await assert.rejects(() => planPartitions(two, ["g", "h"], { limit: 3 }), /needs 4 groups/);
  two.dispose();
  scope.dispose();
});

// A1: with legendGroups each group is its own legend entry, so `visible` stays per group while
// every other option keeps propagating.
test("options named local stay per group while the rest are linked", () => {
  const root = optionsRoot.splitUnique("Partition local test");
  let legendGroups = false;
  const link = createPartitionSettingsSync({ local: () => (legendGroups ? ["visible"] : []) });
  const scope = (name) => root.splitUnique(name, "group", "Group");
  const mark = (parent) => {
    const node = parent.splitUnique("Points", "mark", "Points");
    node.ensure("size", new FieldType({ defaultValue: 4 }));
    node.ensure("visible", new BooleanType({ defaultValue: true }));
    return node;
  };
  const first = scope("a"), second = scope("b");
  link.add("a", first);
  link.add("b", second);
  const firstMark = mark(first), secondMark = mark(second);
  legendGroups = true;
  firstMark.set("visible", false);
  assert.equal(secondMark.get("visible"), true);
  firstMark.set("size", 9);
  assert.equal(secondMark.get("size"), 9);
  // A late group adopts the linked options only.
  const third = scope("c");
  link.add("c", third);
  const thirdMark = mark(third);
  assert.equal(thirdMark.get("size"), 9);
  assert.equal(thirdMark.get("visible"), true);
  link.dispose();
  root.dispose();
});

// A10: a mark's automatic category axis goes on the enclosing Frame's options, where the axis
// and its layout look for it, not on the group scope between the Frame and the mark.
test("a categorical position under a group scope registers its axis on the Frame", () => {
  const scope = data({ category: ["A", "B", "C"], value: [1, 2, 3] });
  const frame = optionsRoot.splitUnique("Partition frame test");
  frame.categoryAxes = {};
  frame.ensure("xbounds", new FieldType({ defaultValue: undefined }));
  frame.ensure("_categoryRevision", new ScalarType({ defaultValue: 0, ui: false }));
  const group = frame.splitUnique("Partition", "group", "Partition").splitUnique("Adelie", "group", "Group");
  const prepared = prepareNamed({ x: "category", y: "value" }, scope, group, "Points",
    { auto: {}, hidden: {} }, { options: frame });
  assert.deepEqual(axisCategory(frame, "x").domain, ["A", "B", "C"]);
  assert.equal(group.categoryAxes, undefined);
  assert.deepEqual(frame.get("xbounds"), [-0.5, 2.5]);
  assert.equal(frame.get("_categoryRevision"), 1);
  // The second group finds the scale through the chain and does not register again.
  const again = prepareNamed({ x: "category", y: "value" }, scope, group, "Points",
    { auto: {}, hidden: {} }, { options: frame });
  assert.equal(frame.get("_categoryRevision"), 1);
  again.dispose();
  prepared.dispose();
  frame.dispose();
  scope.dispose();
});

// TODO 33.2: int32 codes skip the float checks, and a dictionary in the axis's order skips the
// lookup; both give what the general path (float codes) gives, invalid codes included.
test("dictionary codes place the same as int32 or float, in either category order", async () => {
  const placed = async (dtype) => {
    const ownedCodes = [];
    const codes = (values) => {
      const array = np.array(values, { dtype });
      ownedCodes.push(array);
      return { codes: array, categories: undefined };
    };
    const scope = data({
      value: [1, 2, 3, 4],
      first: { ...codes([0, -1, 7, 1]), categories: ["A", "C"] },
      second: { ...codes([1, 0, 1, 2]), categories: ["C", "A", "B"] },
    });
    const frame = optionsRoot.splitUnique(`Dictionary codes ${dtype.name ?? dtype}`);
    frame.categoryAxes = {};
    frame.ensure("xbounds", new FieldType({ defaultValue: undefined }));
    frame.ensure("_categoryRevision", new ScalarType({ defaultValue: 0, ui: false }));
    const out = [];
    for (const x of ["first", "second"]) {
      const prepared = prepareNamed({ x, y: "value" }, scope, frame, "Points", { auto: {}, hidden: {} }, { options: frame });
      out.push(Array.from(await prepared.props.position.ref.data()));
      prepared.dispose();
    }
    out.push(axisCategory(frame, "x").domain);
    frame.dispose();
    scope.dispose();
    ownedCodes.forEach((array) => array.dispose());
    return out;
  };
  const fast = await placed(np.int32);
  assert.deepEqual(fast, [[0, 1, NaN, 2, NaN, 3, 1, 4], [0, 1, 1, 2, 0, 3, 2, 4], ["A", "C", "B"]]);
  assert.deepEqual(await placed(np.float32), fast);
});

// The settings pane shows one Partition subtree per group; an edit to any of them is an edit
// to the authored mark, so it has to reach the matching node in the others.
test("linked group scopes share edits, and a late group adopts them", () => {
  const root = optionsRoot.splitUnique("Partition link test");
  const scope = (name) => {
    const node = root.splitUnique(name, "group", "Group");
    return node;
  };
  const mark = (parent) => {
    const node = parent.splitUnique("Sprites", "mark", "Sprites");
    node.ensure("size", new FieldType({ defaultValue: 4 }));
    node.ensure("visible", new BooleanType({ defaultValue: true }));
    return node;
  };
  const link = createPartitionSettingsSync();
  const first = scope("a"), second = scope("b");
  link.add("a", first);
  link.add("b", second);
  const firstMark = mark(first), secondMark = mark(second);
  firstMark.set("size", 9);
  assert.equal(secondMark.get("size"), 9);
  // Without a local set (no legendGroups) visibility is linked too: one legend entry, all groups.
  secondMark.set("visible", false);
  assert.equal(firstMark.get("visible"), false);
  const third = scope("c");
  link.add("c", third);
  const thirdMark = mark(third);
  assert.equal(thirdMark.get("size"), 9);
  assert.equal(thirdMark.get("visible"), false);
  // A group that leaves stops following along.
  link.remove("b");
  firstMark.set("size", 3);
  assert.equal(secondMark.get("size"), 9);
  assert.equal(thirdMark.get("size"), 3);
  link.dispose();
  root.dispose();
});

// Aggregating transforms drop the columns they did not produce, which would make the key
// unusable for fill= inside a Density or Bin. Group keys are constants, so they survive.
test("a group's key survives an aggregating transform", async () => {
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const scope = data({ x: [1, 2, 3, 9, 10], g: ["a", "a", "a", "b", "b"] });
  const plan = await planPartitions(scope, "g");
  const binned = await runTransform("Bin", plan.groups[0].view, { x: "x", bins: 2 });
  assert.ok(binned.has("g"));
  assert.deepEqual(binned.keys().includes("g"), true);
  const column = binned.get("g");
  assert.deepEqual(column.categories, ["a"]);
  assert.deepEqual(Array.from(await column.codes.ref.data()), [0, 0]);
  assert.equal(binned.get("count").shape[0], 2);
  binned.dispose();
  plan.dispose();
  scope.dispose();
});

// TODO 17.9: a data scope records the columns an update changed; a plan given the previous one
// hands back the same group object (and view) for every group whose rows the update left alone.
test("createDataScope records which columns an update changed", () => {
  const x = [1, 2, 3], g = ["a", "b", "a"], scope = data({ x, g });
  assert.deepEqual(scope.lastChange, { from: 0, to: 1, columns: null });
  scope.update({ x: [1, 2, 4], g });
  assert.deepEqual([scope.lastChange.from, scope.lastChange.to, [...scope.lastChange.columns]], [1, 2, ["x"]]);
  scope.update([{ x: 1, g: "a" }]);
  assert.equal(scope.lastChange.columns, null);
  scope.dispose();
});

test("a plan reuses the groups an update leaves alone, positionally", async () => {
  const g = ["a", "b", "c", "a", "b", "c"], scope = data({ x: [1, 2, 3, 4, 5, 6], g });
  const first = await planPartitions(scope, "g");
  // In place: only group c's x changes.
  scope.update({ x: [1, 2, 30, 4, 5, 60], g });
  const second = await planPartitions(scope, "g", { previous: first });
  assert.deepEqual([...second.reused].sort(), ['["a"]', '["b"]']);
  assert.equal(second.groups[0], first.groups[0]);
  assert.equal(second.groups[1], first.groups[1]);
  assert.notEqual(second.groups[2], first.groups[2]);
  first.dispose();
  // The reused views outlive the first plan, and still read their rows.
  assert.deepEqual(await rows(second.groups[0].view, "x"), [1, 4]);
  assert.deepEqual(await rows(second.groups[2].view, "x"), [30, 60]);
  // Appending a row to group b: every column is new, the old rows' values are equal.
  scope.update({ x: [1, 2, 30, 4, 5, 60, 7], g: [...g, "b"] });
  const third = await planPartitions(scope, "g", { previous: second });
  assert.deepEqual([...third.reused].sort(), ['["a"]', '["c"]']);
  second.dispose();
  // A new column: nothing is reused (the groups' children may read it).
  scope.update({ x: [1, 2, 30, 4, 5, 60, 7], g: [...g, "b"], y: [0, 0, 0, 0, 0, 0, 0] });
  const fourth = await planPartitions(scope, "g", { previous: third });
  assert.equal(fourth.reused.size, 0);
  third.dispose();
  // Another `by`, or another scope, is never reused.
  const other = await planPartitions(scope, "x", { previous: fourth });
  assert.equal(other.reused.size, 0);
  [fourth, other].forEach((plan) => plan.dispose());
  scope.dispose();
});

test("a plan compares GPU columns and dictionary columns at the group rows", async () => {
  const g = { codes: Int32Array.from([0, 1, 0, 1]), categories: ["p", "q"] };
  const initial = np.array(new Float32Array([1, 2, 3, NaN]));
  const updated = np.array(new Float32Array([1, 5, 3, NaN]));
  const scope = data({ x: initial, g });
  const first = await planPartitions(scope, "g");
  scope.update({ x: updated, g });
  const second = await planPartitions(scope, "g", { previous: first });
  // p (rows 0 and 2) is unchanged; q's row 1 changed (NaN equals NaN at row 3).
  assert.deepEqual([...second.reused], ['["p"]']);
  [first, second].forEach((plan) => plan.dispose());
  scope.dispose();
  initial.dispose();
  updated.dispose();
});

// TODO 29.12: under a Filter each brush move gives a new scope object; a group whose rows are the
// same source rows over the same columns is reused, so nothing under it reruns.
test("Partition groups are reused across Filter views when their source rows are unchanged", async () => {
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const { multiply } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = data({
    x: Float32Array.from([1, 2, 3, 4, 5, 6]),
    g: { codes: Int32Array.from([0, 0, 0, 1, 1, 1]), categories: ["a", "b"] },
  });
  const filterAbove = (value) => runTransform("Filter", scope, { where: { field: "x", op: "gt", value } });
  const first = await filterAbove(0), second = await filterAbove(4.5);
  const plan1 = await planPartitions(first, "g");
  // x > 4.5 drops b's first row and all of a: a's group is gone, b's rows changed.
  const plan2 = await planPartitions(second, "g", { previous: plan1 });
  assert.deepEqual([...plan2.reused], []);
  const third = await filterAbove(0.5);
  // x > 0.5 keeps every row, as x > 0 did: both groups are the same source rows.
  const plan3 = await planPartitions(third, "g", { previous: plan1 });
  assert.deepEqual([...plan3.reused].sort(), ['["a"]', '["b"]']);
  assert.equal(plan3.groups[0].view, plan1.groups[0].view);
  // x > 1.5 drops a's first row only: b is reused, a is rebuilt.
  const mixed = await filterAbove(1.5), plan8 = await planPartitions(mixed, "g", { previous: plan3 });
  assert.deepEqual([...plan8.reused], ['["b"]']);
  plan8.dispose();
  mixed.dispose();
  // A column derived after the Filter may hold other values: nothing is reused.
  const derived1 = await runTransform("Calculate", first, { columns: { y: multiply("x", 2) } });
  const derived3 = await runTransform("Calculate", third, { columns: { y: multiply("x", 2) } });
  const plan4 = await planPartitions(derived1, "g");
  const plan5 = await planPartitions(derived3, "g", { previous: plan4 });
  assert.deepEqual([...plan5.reused], []);
  // New data (a new generation): nothing is reused.
  const plan6 = await planPartitions(third, "g", { previous: plan3 });
  scope.update({ x: Float32Array.from([1, 2, 3, 4, 5, 6]), g: { codes: Int32Array.from([0, 0, 0, 1, 1, 1]), categories: ["a", "b"] } });
  const fourth = await filterAbove(0.5);
  const plan7 = await planPartitions(fourth, "g", { previous: plan6 });
  assert.deepEqual([...plan7.reused], []);
  for (const item of [plan7, plan6, plan5, plan4, plan3, plan2, plan1, derived3, derived1, fourth, third, second, first]) item.dispose();
  scope.dispose();
});

test("a plan over a Filter view reads its source rows once, not each key (TODO 29.12)", async () => {
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const { Array: JaxArray } = await import("@hmplot/jax");
  const scope = data({
    x: Float32Array.from([1, 2, 3, 4, 5, 6]),
    g: { codes: Int32Array.from([0, 1, 0, 1, 0, 1]), categories: ["a", "b"] },
    h: ["p", "q", "q", "p", "p", "q"],
    k: Float32Array.from([2, 1, 2, NaN, 1, 2]),
  });
  // x > 1.5 keeps source rows 1-5: g b a b a b, h q q p p q, k 1 2 NaN 1 2.
  const view = await runTransform("Filter", scope, { where: { field: "x", op: "gt", value: 1.5 } });
  const data0 = JaxArray.prototype.data;
  let reads = 0;
  JaxArray.prototype.data = function (...args) {
    reads++;
    return data0.apply(this, args);
  };
  let plan;
  try {
    plan = await planPartitions(view, ["g", "h", "k"]);
  } finally {
    JaxArray.prototype.data = data0;
  }
  // Only the source-row mapping is read back; known group row lists need no regrouping.
  assert.equal(reads, 1);
  assert.deepEqual(
    Object.fromEntries(plan.groups.filter((group) => group.rows.length).map((group) => [group.label, [...group.rows]])),
    { "a · q · 2": [1], "a · p · 1": [3], "b · q · 1": [0], "b · q · 2": [4], "b · p · (missing)": [2] },
  );
  // The keys' orders are the ones the view's own columns give (h in the table's order).
  const codes = await Promise.all(["g", "h", "k"].map((key) => keyCodes(view, key)));
  assert.deepEqual(codes.map((key) => key.order), [["a", "b"], ["p", "q"], [1, 2]]);
  plan.dispose();
  view.dispose();
  scope.dispose();
});


test("reused Partition groups construct no replacement views or regrouping reads", async () => {
  const source = data({ x: [1, 2, 3, 4], g: ["a", "b", "a", "b"] });
  const scope = createDataView(source);
  const retain = scope.retain;
  let snapshotRetains = 0;
  scope.retain = function () {
    snapshotRetains++;
    return retain.call(this);
  };
  const first = await planPartitions(scope, "g");
  assert.equal(snapshotRetains, 3); // One plan snapshot and two group views.
  const data0 = JaxArray.prototype.data;
  let reads = 0, second;
  JaxArray.prototype.data = function (...args) {
    reads++;
    return data0.apply(this, args);
  };
  try {
    second = await planPartitions(scope, "g", { previous: first });
    assert.equal(snapshotRetains, 4); // The second plan owns just its snapshot.
    assert.equal(reads, 0);
    assert.deepEqual(second.groups, first.groups);
    first.dispose();
    assert.deepEqual(await rows(second.groups[1].view, "x"), [2, 4]);
  } finally {
    JaxArray.prototype.data = data0;
    second?.dispose();
    scope.dispose();
    source.dispose();
  }
});

test("a canceled Partition releases its snapshot without constructing groups", async () => {
  const source = data({ x: [1, 2], g: ["a", "b"] });
  const scope = createDataView(source);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => planPartitions(scope, "g", { signal: abort.signal }),
    { name: "AbortError" });
  assert.deepEqual(await rows(scope, "x"), [1, 2]);
  scope.dispose();
  source.dispose();
});
