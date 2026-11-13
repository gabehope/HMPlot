import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
// TODO 29.6: what does not depend on which rows are visible is kept across runs in the
// transform's cache: Sort's order by its keys, Sample's random keys.
import test from "node:test";
import { createJoinTable } from "../../src/lib/plot/utils/tableJoin.js";
import assert from "node:assert/strict";
import { profiler, Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { decodedSourceRows } from "../../src/lib/plot/utils/sourceRows.js";
import { createMaskedRowMapping } from "../../src/lib/plot/utils/dataView.js";
import { numpy as np } from "@hmplot/jax";
import {
  runTransform,
  disposeTransformCache,
  bucketing,
} from "../../src/lib/plot/utils/transforms.js";
import { count, mean, sum } from "../../src/lib/plot/utils/expressions.js";

const scopeOf = (table) => {
  const scope = createDataScope();
  scope.update(table);
  return scope;
};
/** Primitives bound while `run` runs, by name. */
async function primitives(run) {
  const seen = new Map();
  profiler.setOpHook((name) => seen.set(name, (seen.get(name) ?? 0) + 1));
  try {
    await run();
  } finally {
    profiler.setOpHook(null);
  }
  return seen;
}
const read = async (view, key) =>
  Array.from(await view.get(key).ref.data(), Number);

test("grouping reuses unchanged keys only across a proven update interval", async () => {
  const { cachedGroupRows } =
    await import("../../src/lib/plot/utils/grouping.js");
  const keys = ["a", "b", "a"],
    scope = scopeOf({ key: keys, value: [1, 2, 3] });
  const cache = {},
    held = [];
  const group = async () => {
    const result = await cachedGroupRows(cache, scope, "key");
    held.push(result);
    return result;
  };
  try {
    const first = await group();
    scope.update({ key: keys, value: [4, 5, 6] });
    const unchanged = await group();
    assert.equal(
      unchanged,
      first,
      "one unrelated update keeps the grouped rows",
    );
    scope.update({ key: keys, value: [7, 8, 9] });
    assert.equal(
      await group(),
      first,
      "repeated runs advance the proven version",
    );
    scope.update({ key: ["b", "a", "b"], value: [7, 8, 9] });
    const changed = await group();
    assert.notEqual(changed, first, "a key update invalidates grouping");
    scope.update({ key: keys, value: [7, 8, 9] });
    scope.update({ key: keys, value: [10, 11, 12] });
    const skipped = await group();
    assert.notEqual(
      skipped,
      changed,
      "the latest change cannot prove a skipped key update",
    );
    assert.deepEqual(Array.from(await skipped.codes.ref.data()), [0, 1, 0]);
    scope.update({ key: keys, value: [13, 14, 15] });
    scope.update({ key: keys, value: [16, 17, 18] });
    const unrelatedGap = await group();
    assert.notEqual(unrelatedGap, skipped, "skipped unrelated updates also rebuild conservatively");
    scope.update({ key: keys, value: [16, 17, 18] }, {});
    const schemaChange = await group();
    assert.notEqual(schemaChange, unrelatedGap, "a schema update has no unchanged-column proof");
    scope.update({ key: ["a", "b", "c", "a"], value: [1, 2, 3, 4] });
    const rowsChange = await group();
    assert.equal(rowsChange.count, 3);
    assert.deepEqual(Array.from(await first.codes.ref.data()), [0, 1, 0], "retained prior results remain valid");
  } finally {
    held.forEach((result) => result.dispose());
    disposeTransformCache(cache);
    scope.dispose();
  }
});

test("grouping does not cache a result after its live input advances during discovery", async () => {
  const { cachedGroupRows } = await import("../../src/lib/plot/utils/grouping.js");
  const scope = scopeOf({ key: ["a", "a", "b"] }), cache = {};
  const data = JaxArray.prototype.data;
  let advanced = false, first, current;
  try {
    JaxArray.prototype.data = function (...args) {
      if (!advanced) {
        advanced = true;
        scope.update({ key: ["a", "b", "c"] });
      }
      return data.apply(this, args);
    };
    first = await cachedGroupRows(cache, scope, "key");
    JaxArray.prototype.data = data;
    assert.equal(first.count, 2, "the requested result still owns its original columns");
    assert.equal(cache.grouping, undefined, "old results cannot acquire a newer version stamp");
    current = await cachedGroupRows(cache, scope, "key");
    assert.equal(current.count, 3);
    assert.equal(cache.grouping.groups, current);
  } finally {
    JaxArray.prototype.data = data;
    first?.dispose(); current?.dispose();
    disposeTransformCache(cache); scope.dispose();
  }
});

test("Group reuses grouping through runner snapshots while refreshing unrelated values", async () => {
  const keys = ["a", "b", "a"], scope = scopeOf({ key: keys, value: [1, 2, 3] });
  const cache = {}, views = [];
  const config = { by: "key", columns: { average: mean("value") } };
  try {
    views.push(await runTransform("Group", scope, config, { cache }));
    const groups = cache.grouping.groups;
    scope.update({ key: keys, value: [10, 20, 30] });
    views.push(await runTransform("Group", scope, config, { cache }));
    assert.equal(cache.grouping.groups, groups, "snapshots retain a bounded source-change witness");
    assert.deepEqual(await read(views[1], "average"), [20, 20]);
    assert.deepEqual(await read(views[0], "average"), [2, 2], "old results keep their owned values");
  } finally {
    views.reverse().forEach((view) => view.dispose());
    disposeTransformCache(cache); scope.dispose();
  }
});

test("derived grouping keys cannot reuse a forwarded-column change witness", async () => {
  const scope = scopeOf({ key: [0, 1, 0], shift: [0, 0, 0] }), cache = {}, views = [];
  const { add } = await import("../../src/lib/plot/utils/expressions.js");
  const config = { columns: { groupedKey: add("key", "shift") } };
  try {
    const calculated = await runTransform("Calculate", scope, config); views.push(calculated);
    views.push(await runTransform("Group", calculated, { by: "groupedKey" }, { cache }));
    const groups = cache.grouping.groups;
    scope.update({ key: scope.get("key"), shift: [0, 0, 1] });
    const changed = await runTransform("Calculate", scope, config); views.push(changed);
    views.push(await runTransform("Group", changed, { by: "groupedKey" }, { cache }));
    assert.notEqual(cache.grouping.groups, groups);
    assert.equal(cache.grouping.groups.count, 2);
    assert.deepEqual(Array.from(await cache.grouping.groups.codes.ref.data()), [0, 1, 1]);
  } finally {
    views.reverse().forEach((view) => view.dispose());
    disposeTransformCache(cache); scope.dispose();
  }
});

test("expression Filter reuses membership across unrelated data updates and releases its cache", async () => {
  const { greater, col } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = scopeOf({ depth: [0, 1, 2], x: [1, 2, 3] }), cache = {}, views = [];
  const config = { where: greater(col.depth, 0) };
  try {
    const first = await runTransform("Filter", scope, config, { cache }); views.push(first);
    scope.update({ depth: scope.get("depth"), x: [4, 5, 6] });
    const next = await runTransform("Filter", scope, config, { cache }); views.push(next);
    assert.equal(first.padded().valid, next.padded().valid);
    assert.deepEqual(await read(next, "x"), [5, 6]);
    scope.update({ depth: [0, 0, 2], x: [4, 5, 6] });
    const changed = await runTransform("Filter", scope, config, { cache }); views.push(changed);
    assert.notEqual(changed.padded().valid, first.padded().valid);
    assert.deepEqual(await read(changed, "x"), [6]);
  } finally { views.forEach(view => view.dispose()); disposeTransformCache(cache); scope.dispose(); }
  assert.equal(cache.filterMask, null);
});

test("Calculate releases expression temporaries while retaining numerical, categorical, scalar and tween outputs", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { add, multiply, mean, first, tween } = await import("../../src/lib/plot/utils/expressions.js");
  const input = np.array([1, 2, 3]), scope = scopeOf({ x: input, group: ["a", "b", "a"] });
  const cache = {}, views = [], options = { duration: 100, easing: "linear" };
  const columns = { result: add(multiply("x", 2), 3), average: mean("x"),
    category: first("group"), moving: tween("x", options) };
  let held;
  try {
    const plain = await runTransform("Calculate", scope, { columns: { result: add(multiply("x", 2), 3) } }); views.push(plain);
    assert.deepEqual(await read(plain, "result"), [5, 7, 9]);
    assert.equal(input.refCount, 1, "an ordinary expression retains its output, not its borrowed input temporaries");
    const first = await runTransform("Calculate", scope, { columns, __viewState: { time: 0 } }, { cache }); views.push(first);
    held = first.get("result").ref;
    assert.deepEqual(await read(first, "result"), [5, 7, 9]);
    assert.deepEqual(await read(first, "average"), [2, 2, 2]);
    assert.deepEqual(Array.from(await first.get("category").codes.ref.data()), [0, 0, 0]);
    assert.deepEqual(first.get("category").categories, ["a", "b"]);
    scope.update({ x: [11, 12, 13], group: ["b", "a", "b"] });
    const start = await runTransform("Calculate", scope, { columns, __viewState: { time: 0 } }, { cache }); views.push(start);
    const middle = await runTransform("Calculate", scope, { columns, __viewState: { time: 50 } }, { cache }); views.push(middle);
    assert.deepEqual(await read(middle, "moving"), [6, 7, 8]);
    assert.deepEqual(Array.from(await first.get("category").codes.ref.data()), [0, 0, 0], "old dictionary codes stay retained");
    assert.deepEqual(first.get("category").categories, ["a", "b"]);
    await assert.rejects(runTransform("Calculate", scope, { columns: { temporary: add("x", 1), invalid: add("missing", 1) } }, { cache }), /missing field/);
  } finally { views.reverse().forEach(view => view.dispose()); disposeTransformCache(cache); scope.dispose(); }
  assert.deepEqual(Array.from(await held.ref.data()), [5, 7, 9]);
  assert.equal(held.refCount, 1, "only the retained reader survives producer teardown");
  held.dispose();
  assert.equal(input.refCount, 1, "temporary expressions and tween state released the original device input");
  input.dispose();
});

test("Filter shares lazy source rows across numerical publications and retains old membership after replacement", async () => {
  const { greater, col } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = scopeOf({ depth: [0, 1, 0, 1], x: [1, 2, 3, 4] }), cache = {}, views = [], arrays = [];
  const config = { where: greater(col.depth, 0) }, data = JaxArray.prototype.data;
  let reads = 0;
  try {
    const first = await runTransform("Filter", scope, config, { cache }); views.push(first);
    scope.update({ depth: scope.get("depth"), x: [5, 6, 7, 8] });
    const next = await runTransform("Filter", scope, config, { cache }); views.push(next);
    const a = first.sourceIndices(), b = next.sourceIndices(); arrays.push(a, b);
    assert.equal(a, b, "one immutable source mapping for the same mask");
    assert.equal(first.indices, next.indices, "column gathering shares the same lazy compaction");
    JaxArray.prototype.data = function (...args) { reads++; return data.apply(this, args); };
    const [left, right] = await Promise.all([decodedSourceRows(a), decodedSourceRows(b)]);
    assert.deepEqual(left, [1, 3]); assert.equal(left, right); assert.equal(reads, 1, "overlapping reads share one download");
    JaxArray.prototype.data = data;
    scope.update({ depth: [1, 0, 1, 0], x: [5, 6, 7, 8] });
    const changed = await runTransform("Filter", scope, config, { cache }); views.push(changed);
    const c = changed.sourceIndices(); arrays.push(c);
    assert.notEqual(c, a, "equal row counts do not imply the same membership");
    assert.deepEqual(await decodedSourceRows(c), [0, 2]);
    disposeTransformCache(cache);
    const retained = first.sourceIndices(); arrays.push(retained);
    assert.deepEqual(await decodedSourceRows(retained), [1, 3], "old views retain their own immutable rows");
    assert.deepEqual(await read(next, "x"), [6, 8]);
  } finally {
    JaxArray.prototype.data = data;
    arrays.forEach(array => array.dispose()); views.forEach(view => view.dispose());
    disposeTransformCache(cache); scope.dispose();
  }
});

test("masked source rows compose and preserve retained mappings when the parent order changes", async () => {
  const { less, col } = await import("../../src/lib/plot/utils/expressions.js");
  const mask = np.array([1, 0, 1], { dtype: np.int32 }), rows = createMaskedRowMapping(mask, 2);
  const one = np.array([2, 0, 1], { dtype: np.int32 }), two = np.array([1, 2, 0], { dtype: np.int32 });
  const parent = { sourceIndices: () => one.ref }, next = { sourceIndices: () => two.ref };
  const a = rows.sourceIndices(parent), b = rows.sourceIndices(next), old = rows.sourceIndices(parent);
  rows.dispose(); mask.dispose(); one.dispose(); two.dispose();
  assert.deepEqual(await decodedSourceRows(a), [2, 1]);
  assert.deepEqual(await decodedSourceRows(b), [1, 0]);
  assert.deepEqual(await decodedSourceRows(old), [2, 1]);
  a.dispose(); b.dispose(); old.dispose();
  const fallbackMask = np.array([0, 1, 1], { dtype: np.int32 });
  const fallbackRows = createMaskedRowMapping(fallbackMask, 2), plain = { length: 3 };
  const fallback = fallbackRows.sourceIndices(plain), again = fallbackRows.sourceIndices(plain);
  assert.equal(fallback, again); assert.deepEqual(await decodedSourceRows(fallback), [1, 2]);
  fallback.dispose(); again.dispose(); fallbackRows.dispose(); fallbackMask.dispose();
  const scope = scopeOf({ x: [0, 1, 2, 3] });
  const coldCache = {}, cold = await runTransform("Filter", scope, { where: less(col.x, 2) }, { cache: coldCache });
  assert.ok(coldCache.filterMask, "the undemanded row descriptor has a cache lease");
  disposeTransformCache(coldCache);
  const lateRows = cold.sourceIndices();
  assert.deepEqual(await decodedSourceRows(lateRows), [0, 1]);
  assert.deepEqual(await read(cold, "x"), [0, 1]);
  assert.equal(coldCache.filterMask, null, "late reads do not recreate a disposed transform cache");
  lateRows.dispose(); cold.dispose();
  const first = await runTransform("Filter", scope, { where: { field: "x", op: "gt", value: 0 } });
  const second = await runTransform("Filter", first, { where: { field: "x", op: "lt", value: 3 } });
  const nested = second.sourceIndices();
  try { assert.deepEqual(await decodedSourceRows(nested), [1, 2]); }
  finally { nested.dispose(); second.dispose(); first.dispose(); scope.dispose(); }
});

test("source row downloads release rejected reads and do not retain completed GPU arrays", async () => {
  const array = np.array([3, 1], { dtype: np.int32 }), data = JaxArray.prototype.data;
  const initial = array.refCount;
  let finish, calls = 0;
  JaxArray.prototype.data = function () {
    calls++;
    return new Promise((resolve, reject) => { finish = reject; });
  };
  try {
    const first = decodedSourceRows(array), second = decodedSourceRows(array);
    await Promise.resolve();
    assert.equal(first, second); assert.equal(calls, 1); assert.equal(array.refCount, initial + 1);
    finish(Error("failed read"));
    await assert.rejects(first, /failed read/); assert.equal(array.refCount, initial);
    JaxArray.prototype.data = data;
    assert.deepEqual(await decodedSourceRows(array), [3, 1]); assert.equal(array.refCount, initial);
    const departing = np.array([4, 2], { dtype: np.int32 }), pending = decodedSourceRows(departing);
    departing.dispose();
    assert.deepEqual(await pending, [4, 2]); assert.equal(departing.refCount, 0, "an in-flight read owns its ref through view disposal");
  } finally { JaxArray.prototype.data = data; array.dispose(); }
});

test("Sort after a Filter sorts by its keys once; a new mask only puts the visible rows first", async () => {
  const scope = scopeOf({
    x: Float32Array.from([5, 1, 4, 2, 3, 6]),
    k: Int32Array.from([1, 0, 1, 0, 1, 0]),
  });
  const cache = {};
  const sortAfter = async (value) => {
    const filtered = await runTransform("Filter", scope, {
      where: { field: "x", op: "gt", value },
    });
    const sorted = await runTransform(
      "Sort",
      filtered,
      { by: ["k", "x"] },
      { cache },
    );
    const x = await read(sorted, "x");
    sorted.dispose();
    filtered.dispose();
    return x;
  };
  assert.deepEqual(await sortAfter(1.5), [2, 6, 3, 4, 5]);
  let x;
  const second = await primitives(async () => (x = await sortAfter(2.5)));
  assert.deepEqual(x, [6, 3, 4, 5]);
  // Two keys sort twice on a first run; the next runs sort once (visible first).
  assert.equal(second.get("argsort"), 1);
  disposeTransformCache(cache);
  scope.dispose();
});

test("Sample keeps its random keys while the seed and row count are the same, shuffling or not", async () => {
  const scope = scopeOf({ x: Float32Array.from({ length: 40 }, (_, i) => i) });
  const kind = "Sample";
  for (const config of [{ seed: 5, order: "random" }, { size: 8, seed: 5 }]) {
    const cache = {};
    const run = async (value) => {
      const filtered = await runTransform("Filter", scope, {
        where: { field: "x", op: "gt", value },
      });
      const out = await runTransform(kind, filtered, config, { cache });
      const x = await read(out, "x");
      out.dispose();
      filtered.dispose();
      return x;
    };
    const first = await run(3),
      kept = cache.kept.get("sample").value;
    // (random.uniform is jitted inside jax-js: counting its primitives shows only a first trace.)
    const counted = await primitives(async () =>
      assert.deepEqual(await run(3), first, config.order),
    );
    assert.equal(cache.kept.get("sample").value, kept, `${config.order}: the same keys`);
    // A shuffle's order is the keys': the one sort left puts the visible rows first.
    if (config.order === "random") assert.equal(counted.get("argsort"), 1);
    disposeTransformCache(cache);
  }
  scope.dispose();
});

test("under a bucketing Filter, grouped transforms group the Filter's rows once (TODO 29.10)", async () => {
  const saved = { ...bucketing };
  Object.assign(bucketing, {
    minimumSource: 64,
    minimumBucket: 8,
    shrinkAfter: 3,
  });
  const n = 400;
  const scope = scopeOf({
    x: Float32Array.from({ length: n }, (_, i) => i),
    g: {
      codes: Int32Array.from({ length: n }, (_, i) => i % 7),
      categories: ["a", "b", "c", "d", "e", "f", "h"],
    },
  });
  const filterCache = {},
    groupCache = {};
  const run = async (low) => {
    const filtered = await runTransform(
      "Filter",
      scope,
      {
        where: [
          { field: "x", op: "gte", value: low },
          { field: "x", op: "lt", value: low + 30 },
        ],
      },
      { cache: filterCache },
    );
    const grouped = await runTransform(
      "Group",
      filtered,
      { by: "g", columns: { m: mean("x") } },
      { cache: groupCache },
    );
    return { filtered, grouped };
  };
  try {
    const first = await run(10);
    // Every group of the input, the ones with a kept row shown (here all seven).
    assert.equal(first.grouped.padded().capacity, 7);
    assert.equal(first.grouped.length, 7);
    first.grouped.dispose();
    first.filtered.dispose();
    let second;
    const counted = await primitives(async () => (second = await run(100)));
    // No sort outside a compiled program: the bucket's (its kept rows first) is inside the
    // bucket's program since TODO 33.3, traced on the first run; regrouping the bucket's rows
    // would sort again.
    assert.equal(counted.get("argsort") ?? 0, 0);
    // Each group's mean of the kept x (100 <= x < 130), computed on the host.
    const expected = Array.from({ length: 7 }, (_, g) => {
      const kept = Array.from({ length: 30 }, (_, k) => 100 + k).filter(
        (x) => x % 7 === g,
      );
      return kept.reduce((a, b) => a + b, 0) / kept.length;
    });
    assert.deepEqual(await read(second.grouped, "m"), expected);
    second.grouped.dispose();
    second.filtered.dispose();
  } finally {
    Object.assign(bucketing, saved);
    disposeTransformCache(filterCache);
    disposeTransformCache(groupCache);
    scope.dispose();
  }
});

test("Bin reads every automatic extent at once, and keeps its edges while its rows are unchanged (TODO 29.3-29.4)", async () => {
  const scope = scopeOf({
    x: Float32Array.from({ length: 50 }, (_, i) => i % 17),
    y: Float32Array.from({ length: 50 }, (_, i) => (i * 7) % 23),
    w: Float32Array.from({ length: 50 }, (_, i) => 1 + (i % 3)),
  });
  const cache = {},
    data = JaxArray.prototype.data;
  let reads = 0;
  const readbacks = async (run) => {
    reads = 0;
    JaxArray.prototype.data = function (...args) {
      reads++;
      return data.apply(this, args);
    };
    try {
      return await run();
    } finally {
      JaxArray.prototype.data = data;
    }
  };
  const bin = async (config) => {
    const out = await runTransform("Bin", scope, config, { cache });
    out.dispose();
  };
  try {
    // Two automatic axes: one readback for both extents.
    await readbacks(() => bin({ x: "x", y: "y", bins: 4, weight: "w" }));
    assert.equal(reads, 1);
    // Again (a weight that changes each run, over the same rows): the edges are kept.
    await readbacks(() => bin({ x: "x", y: "y", bins: 4, weight: "w" }));
    assert.equal(reads, 0);
    // Another bin count: new edges.
    await readbacks(() => bin({ x: "x", y: "y", bins: 5, weight: "w" }));
    assert.equal(reads, 1);
  } finally {
    disposeTransformCache(cache);
    scope.dispose();
  }
});

// TODO 39.7: Stack's center and wiggle need non-negative values. The column's minimum is read once
// and kept while the column is the same: a new mask over a Filter reads nothing more, unless the
// column has a negative value (here hidden by the Filter), when each run reads the shown minimum.
test("Stack center and wiggle read a column's minimum once, not per new mask", async () => {
  const scope = scopeOf({
    x: Int32Array.from({ length: 40 }, (_, i) => i % 5),
    y: Float32Array.from({ length: 40 }, (_, i) => 1 + (i % 7)),
    z: Float32Array.from({ length: 40 }, (_, i) => (i === 7 ? -2 : 1 + (i % 7))),
    g: { codes: Int32Array.from({ length: 40 }, (_, i) => i % 3), categories: ["a", "b", "c"] },
  });
  const data = JaxArray.prototype.data;
  let reads = 0;
  JaxArray.prototype.data = function (...args) {
    reads++;
    return data.apply(this, args);
  };
  try {
    for (const [config, first, next] of [
      // The x groups' count and the minimum, then nothing.
      [{ x: "x", y: "y", series: "g", offset: "wiggle", order: "insideOut" }, 2, 0],
      // The groups, the column's minimum (negative), the shown rows' minimum; then the last.
      [{ x: "x", y: "z", series: "g", offset: "center" }, 3, 1],
    ]) {
      const cache = {}, filterCache = {};
      const stackAfter = async (value) => {
        const filtered = await runTransform("Filter", scope, { where: { field: "y", op: "gt", value } }, { cache: filterCache });
        const before = reads;
        const view = await runTransform("Stack", filtered, config, { cache });
        const count = reads - before;
        view.dispose();
        filtered.dispose();
        return count;
      };
      assert.equal(await stackAfter(1.5), first, `${config.offset}: first run`);
      assert.equal(await stackAfter(2.5), next, `${config.offset}: a new mask`);
      disposeTransformCache(cache);
      disposeTransformCache(filterCache);
    }
  } finally {
    JaxArray.prototype.data = data;
    scope.dispose();
  }
});

// TODO 33.6: operation budgets. A warm run over a Filter's new mask issues a few operations per
// transform (compiled programs, TODO 33.3); a budget a little above today's counts catches a
// transform falling back to eager work (a Bin was ~35 operations before it compiled).
test("transforms issue a budgeted number of operations per warm run over a new mask", async () => {
  const n = 400;
  const scope = scopeOf({
    x: Float32Array.from({ length: n }, (_, i) => (i % 11 === 3 ? NaN : Math.sin(i) * 5 + 5)),
    y: Float32Array.from({ length: n }, (_, i) => ((i * 37) % 101) / 20),
    k: Int32Array.from({ length: n }, (_, i) => i % 4),
    g: { codes: Int32Array.from({ length: n }, (_, i) => (i * 7) % 5), categories: ["a", "b", "c", "d", "e"] },
  });
  const joined = createJoinTable();
  const BUDGETS = [
    ["Bin", { x: "x", bins: 6 }, 6],
    ["Hexbin", { x: "x", y: "y", bins: 4, bounds: { x: [0, 10], y: [0, 5] } }, 8],
    ["Group", { by: "g", columns: { m: mean("x") } }, 6],
    ["Pivot", { by: "k", field: "g", value: sum("y") }, 15],
    ["Pivot", { by: "k", field: "g", value: count() }, 15],
    ["Normalize", { field: "x", by: "k" }, 4],
    ["Stack", { x: "k", y: "y", series: "g" }, 13],
    ["Stack", { x: "k", y: "y", series: "g", offset: "wiggle", order: "insideOut" }, 13],
    ["Summary", { field: "x", by: "g", interval: "normal" }, 8],
    ["Window", { field: "x", size: 5, reduce: "mean" }, 18],
    ["BoxStats", { by: "g", value: "x" }, 15],
    ["Density", { x: "x", by: "g", resolution: 16 }, 18],
    ["Regression", { x: "x", y: "y", method: "poly", order: 2 }, 3],
    ["ECDF", { x: "x", by: "g" }, 11],
    ["Sort", { by: "x" }, 13],
    // TODO 43: the row mapping is kept; a run takes it at the rows and gathers in one program.
    ["Join", { data: joined.table({ k: [0, 1, 2], w: [1, 2, 3], label: ["a", "b", "c"] }), on: "k" }, 4],
  ];
  try {
    for (const [kind, config, budget] of BUDGETS) {
      const cache = {}, filterCache = {};
      const once = async (value) => {
        const filtered = await runTransform("Filter", scope, { where: { field: "y", op: "gt", value } }, { cache: filterCache });
        let view;
        const seen = await primitives(async () => (view = await runTransform(kind, filtered, config, { cache })));
        view.dispose();
        filtered.dispose();
        return [...seen.values()].reduce((a, b) => a + b, 0);
      };
      await once(1.1);
      await once(1.3);
      const count = await once(1.7);
      assert.ok(count <= budget, `${kind}: ${count} operations, budget ${budget}`);
      disposeTransformCache(cache);
      disposeTransformCache(filterCache);
    }
  } finally {
    scope.dispose();
    joined.dispose();
  }
});
