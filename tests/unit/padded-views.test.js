import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
// TODO 17.3: padded views. A Filter keeps its input's physical rows and a valid mask; consumers
// that have not opted in see the compacted rows (the adapter), exactly as before.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import {
  runTransform,
  resolveTransformParameters,
  bucketing,
  bucketSize,
  disposeTransformCache,
} from "../../src/lib/plot/utils/transforms.js";
import {
  createDataView,
  createMaskedRowMapping,
  snapshotDataScope,
  sameRows,
} from "../../src/lib/plot/utils/dataView.js";
import { kernelsOf } from "./compiled-programs.js";
import { createGatherCache } from "../../src/lib/plot/utils/gatherCache.js";
import {
  greater,
  col,
  subtract,
  multiply,
  power,
  evaluateExpression,
  is_in,
  mean,
  sum,
  count,
  min,
  max,
  std,
  variance,
  median,
  quantile,
  divide,
  mode,
  first,
  last,
} from "../../src/lib/plot/utils/expressions.js";

const scopeOf = (table) => {
  const scope = createDataScope();
  scope.update(table);
  return scope;
};
const read = async (value) => {
  const array = value?.codes ?? value;
  return Array.from(await array.ref.data(), Number);
};
const readOwned = async (array) => {
  try {
    return await read(array);
  } finally {
    array.dispose();
  }
};
const table = () => ({
  x: Float32Array.from([5, 1, 7, 3, 9, 2]),
  k: Int32Array.from([0, 1, 0, 1, 0, 1]),
  g: {
    codes: Int32Array.from([0, 1, 2, 0, 1, 2]),
    categories: ["a", "b", "c"],
  },
  s: ["p", "q", "p", "r", "q", "p"],
});

test("retained row mappings reuse immutable gathers and invalidate changed columns and dictionaries", async () => {
  const names = ["B", "A", "B"],
    source = scopeOf({ names, x: [1, 2, 3] });
  const snapshot = snapshotDataScope(source),
    mask = np.array([1, 0, 1], { dtype: np.int32 });
  const mapping = createMaskedRowMapping(mask, 2),
    firstX = np.array([1, 2, 3]),
    nextX = np.array([4, 5, 6]);
  const early = createDataView(snapshot, { columns: { moving: firstX } });
  const late = createDataView(snapshot, { columns: { moving: nextX } });
  const a = createDataView(early, {
    mask: mask.ref,
    count: 2,
    rowMapping: mapping,
  });
  const b = createDataView(late, {
    mask: mask.ref,
    count: 2,
    rowMapping: mapping,
  });
  assert.equal(a.get("names").codes, b.get("names").codes);
  assert.notEqual(a.get("moving"), b.get("moving"));
  assert.deepEqual(await read(b.get("moving")), [4, 6]);
  const lease = a.get("names").codes.ref;
  const oldCode = a.get("names").codes;
  a.dispose();
  b.dispose();
  early.dispose();
  late.dispose();
  snapshot.dispose();
  assert.deepEqual(lease.ref.js(), [0, 0]);
  const codes = np.array([0, 1, 0], { dtype: np.int32 }),
    categories = ["old", "other"];
  const dictionary = { codes, categories };
  const parent = createDataView(snapshotDataScope(source), {
    columns: { changed: dictionary },
  });
  const c = createDataView(parent, {
    mask: mask.ref,
    count: 2,
    rowMapping: mapping,
  });
  const previous = c.get("changed");
  categories[0] = "new";
  const d = createDataView(parent, {
    mask: mask.ref,
    count: 2,
    rowMapping: mapping,
  });
  assert.equal(
    d.get("changed").codes,
    previous.codes,
    "label edits reuse unchanged gathered codes",
  );
  assert.deepEqual(previous.categories, ["new", "other"]);
  dictionary.categories = ["new", "other"];
  const e = createDataView(parent, {
    mask: mask.ref,
    count: 2,
    rowMapping: mapping,
  });
  assert.notEqual(
    e.get("changed").codes,
    previous.codes,
    "a replacement dictionary has its own cache entry",
  );
  assert.deepEqual(await read(e.get("changed")), [0, 0]);
  const renamed = createDataView(parent, {
    mask: mask.ref,
    count: 2,
    rowMapping: mapping,
    columnMetadata: {
      changed: {
        type: "categorical",
        domain: ["new", "other"],
        label: "Current label",
      },
    },
  });
  assert.equal(
    renamed.get("changed").codes,
    e.get("changed").codes,
    "view metadata does not change gathered codes",
  );
  assert.equal(
    renamed.metadata("changed").label,
    "Current label",
    "metadata remains owned by the current view",
  );
  renamed.dispose();
  e.dispose();
  assert.deepEqual(d.get("changed").categories, ["new", "other"]);
  assert.notEqual(
    c.get("@selected"),
    d.get("@selected"),
    "virtual columns keep their revision-owned path",
  );
  c.dispose();
  d.dispose();
  parent.parent.dispose();
  parent.dispose();
  mapping.dispose();
  assert.equal(
    oldCode.refCount,
    1,
    "only the caller lease remains after mapping disposal",
  );
  lease.dispose();
  assert.equal(oldCode.refCount, 0);
  codes.dispose();
  mask.dispose();
  firstX.dispose();
  nextX.dispose();
  source.dispose();
});

test("gather-cache eviction and payload limits preserve callers while releasing cache references", () => {
  const cache = createGatherCache({ maxEntries: 2, maxBytes: 16 });
  const input = np.array([1, 2]),
    other = np.array([3, 4]),
    third = np.array([5, 6]);
  let calls = 0;
  const make = (source) => () => {
    calls++;
    return source.ref.add(1);
  };
  const first = cache.get(input, "numeric", make(input));
  const shared = cache.get(input, "numeric", make(input));
  assert.equal(shared, first);
  assert.equal(calls, 1);
  shared.dispose();
  const second = cache.get(other, "numeric", make(other));
  const last = cache.get(third, "numeric", make(third));
  assert.equal(cache.size, 2);
  assert.equal(cache.bytes, 16);
  assert.equal(first.refCount, 1, "eviction releases the cache reference only");
  assert.deepEqual(first.ref.js(), [2, 3]);
  const oversized = np.array([1, 2, 3, 4, 5]);
  const uncached = cache.get(oversized, "numeric", make(oversized));
  assert.equal(cache.size, 2);
  assert.equal(uncached.refCount, 1);
  const host = [1, 2];
  cache.get(host, "unversioned", () => np.array(host)).dispose();
  host[0] = 9;
  assert.deepEqual(
    cache.get(host, "unversioned", () => np.array(host)).js(),
    [9, 2],
  );
  cache.dispose();
  assert.equal(second.refCount, 1);
  assert.equal(last.refCount, 1);
  for (const value of [
    first,
    second,
    last,
    uncached,
    input,
    other,
    third,
    oversized,
  ])
    value.dispose();
});

test("sameRows follows transparent current-value views through retained snapshots, preserving row-changing barriers", async () => {
  const source = scopeOf({ x: [1, 2, 3] }),
    first = snapshotDataScope(source),
    second = snapshotDataScope(source);
  const early = await runTransform("Calculate", first, {
    columns: { y: multiply("x", 2) },
  });
  const late = await runTransform("Calculate", second, {
    columns: { y: multiply("x", 3) },
  });
  assert.equal(sameRows(early, late), true);
  const alias = createDataView(late);
  assert.equal(sameRows(early, alias), true);
  const order = np.array([2, 1, 0], { dtype: np.int32 }),
    reordered = createDataView(second, { indices: order });
  const filtered = createDataView(second, {
    mask: np.array([1, 1, 1], { dtype: np.int32 }),
    count: 3,
  });
  const total = np.array([1, 2, 3]),
    aggregate = createDataView(second, { columns: { total }, aggregate: true });
  assert.equal(sameRows(early, reordered), false);
  assert.equal(sameRows(early, filtered), false);
  assert.equal(sameRows(early, aggregate), false);
  const otherOrder = np.array([1, 0, 2], { dtype: np.int32 });
  const otherReordered = createDataView(first, { indices: otherOrder });
  const leftMask = createDataView(first, {
    mask: np.array([1, 1, 0], { dtype: np.int32 }),
    count: 2,
  });
  const rightMask = createDataView(second, {
    mask: np.array([0, 1, 1], { dtype: np.int32 }),
    count: 2,
  });
  const otherTotal = np.array([3, 2, 1]);
  const otherAggregate = createDataView(first, {
    columns: { total: otherTotal },
    aggregate: true,
  });
  assert.equal(sameRows(reordered, otherReordered), false);
  assert.equal(sameRows(leftMask, rightMask), false);
  assert.equal(sameRows(aggregate, otherAggregate), false);
  assert.equal(sameRows(reordered, aggregate), false);
  const sameOrder = createDataView(first, { indices: order });
  assert.equal(
    sameRows(reordered, sameOrder),
    true,
    "one immutable reorder over unchanged input rows is reusable",
  );
  const valid = np.array([1, 0, 1], { dtype: np.int32 }),
    mapping = createMaskedRowMapping(valid, 2);
  const mappedEarly = createDataView(early, {
    mask: valid.ref,
    count: 2,
    rowMapping: mapping,
  });
  const mappedLate = createDataView(late, {
    mask: valid.ref,
    count: 2,
    rowMapping: mapping,
  });
  assert.equal(
    sameRows(mappedEarly, mappedLate),
    true,
    "cached membership survives current numerical publications",
  );
  const shorter = createDataView(late, { mask: valid.ref, count: 1 });
  assert.equal(
    sameRows(mappedEarly, shorter),
    false,
    "equal mask identity alone does not prove the logical count",
  );
  source.update({ x: [4, 5, 6] });
  const changed = snapshotDataScope(source);
  assert.equal(sameRows(early, changed), false);
  const mappedChanged = createDataView(changed, {
    mask: valid.ref,
    count: 2,
    rowMapping: mapping,
  });
  assert.equal(
    sameRows(mappedLate, mappedChanged),
    false,
    "a cached mapping cannot hide a changed input generation",
  );
  for (const view of [
    alias,
    early,
    late,
    reordered,
    sameOrder,
    otherReordered,
    filtered,
    leftMask,
    rightMask,
    aggregate,
    otherAggregate,
    mappedEarly,
    mappedLate,
    shorter,
    mappedChanged,
    first,
    second,
    changed,
  ])
    view.dispose();
  mapping.dispose();
  valid.dispose();
  order.dispose();
  otherOrder.dispose();
  total.dispose();
  otherTotal.dispose();
  source.dispose();
});

test("a Filter is a padded view: physical rows, a valid mask, the count; compacted reads are unchanged", async () => {
  const scope = scopeOf(table());
  const view = await runTransform("Filter", scope, {
    where: { field: "x", op: "gt", value: 2.5 },
  });
  assert.equal(view.length, 4);
  const physical = view.padded();
  assert.equal(physical.capacity, 6);
  assert.equal(physical.length, 6);
  assert.equal(physical.count, 4);
  assert.equal(physical.prefix, false);
  assert.deepEqual(await read(physical.valid), [1, 0, 1, 1, 1, 0]);
  assert.deepEqual(
    await readOwned(physical.sourceIndices()),
    [0, -1, 2, 3, 4, -1],
  );
  // The adapter: compacted columns of every kind, and source rows.
  assert.deepEqual(await read(view.get("x")), [5, 7, 3, 9]);
  assert.deepEqual(await read(view.get("k")), [0, 0, 1, 0]);
  assert.deepEqual(await read(view.get("g")), [0, 2, 0, 1]);
  assert.deepEqual(view.get("g").categories, ["a", "b", "c"]);
  assert.deepEqual(await read(view.get("s")), [0, 0, 2, 1]);
  assert.deepEqual(await readOwned(view.sourceIndices()), [0, 2, 3, 4]);
  view.dispose();
  scope.dispose();
});

test("padded().get() of a Filter is the parent's own column (no copy)", async () => {
  const columns = table(),
    scope = scopeOf(columns);
  const view = await runTransform("Filter", scope, {
    where: { field: "x", op: "lt", value: 6 },
  });
  assert.equal(view.padded().get("x"), scope.get("x"));
  assert.equal(view.padded().get("g"), scope.get("g"));
  view.dispose();
  scope.dispose();
});

test("prefixed() keeps the capacity and puts the valid rows first, in order", async () => {
  const scope = scopeOf(table());
  const view = await runTransform("Filter", scope, {
    where: { field: "x", op: "gt", value: 2.5 },
  });
  const prefix = view.prefixed();
  assert.equal(prefix.capacity, 6);
  assert.equal(prefix.prefix, true);
  assert.deepEqual(await read(prefix.valid), [1, 1, 1, 1, 0, 0]);
  assert.deepEqual((await read(prefix.get("x"))).slice(0, 4), [5, 7, 3, 9]);
  assert.deepEqual(
    await readOwned(prefix.sourceIndices()),
    [0, 2, 3, 4, -1, -1],
  );
  assert.equal(view.prefixed(), prefix);
  view.dispose();
  scope.dispose();
});

test("a Filter after a Filter ANDs the masks over the same physical rows", async () => {
  const scope = scopeOf(table());
  const first = await runTransform("Filter", scope, {
    where: { field: "x", op: "gt", value: 2.5 },
  });
  const second = await runTransform("Filter", first, {
    where: { field: "k", op: "eq", value: 0 },
  });
  assert.equal(second.length, 3);
  assert.equal(second.padded().capacity, 6);
  assert.deepEqual(await read(second.padded().valid), [1, 0, 1, 0, 1, 0]);
  assert.deepEqual(await read(second.get("x")), [5, 7, 9]);
  assert.deepEqual(await readOwned(second.sourceIndices()), [0, 2, 4]);
  // An expression condition sees the physical rows too.
  const third = await runTransform("Filter", first, {
    where: greater(col("x"), 6),
  });
  assert.deepEqual(await read(third.get("x")), [7, 9]);
  third.dispose();
  second.dispose();
  first.dispose();
  scope.dispose();
});

test("edge masks: nothing kept, everything kept, one row", async () => {
  const scope = scopeOf(table());
  const none = await runTransform("Filter", scope, {
    where: { field: "x", op: "gt", value: 100 },
  });
  assert.equal(none.length, 0);
  assert.deepEqual(await read(none.padded().valid), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(await read(none.get("x")), []);
  const all = await runTransform("Filter", scope, {
    where: { field: "x", op: "finite" },
  });
  assert.equal(all.length, 6);
  assert.deepEqual(await read(all.get("x")), [5, 1, 7, 3, 9, 2]);
  const one = scopeOf({ x: [4] });
  const single = await runTransform("Filter", one, {
    where: { field: "x", op: "gt", value: 1 },
  });
  assert.deepEqual(await read(single.get("x")), [4]);
  const empty = await runTransform("Filter", one, {
    where: { field: "x", op: "gt", value: 10 },
  });
  assert.deepEqual(await read(empty.get("x")), []);
  [none, all, single, empty, one].forEach((item) => item.dispose());
  scope.dispose();
});

test("an inactive interaction Filter keeps every row with no readback, and follows the selection", async () => {
  const scope = scopeOf(table());
  let view = await runTransform("Filter", scope, { where: "@selected" });
  assert.equal(view.length, 6);
  view.dispose();
  scope.identity.selection.replace(scope.identity, [1, 4]);
  view = await runTransform("Filter", scope, { where: "@selected" });
  assert.equal(view.length, 2);
  assert.deepEqual(await read(view.get("x")), [1, 9]);
  view.dispose();
  view = await runTransform("Filter", scope, {
    where: scope.identity.selection,
  });
  assert.deepEqual(await read(view.get("x")), [1, 9]);
  // Over a padded input, a selection keeps only rows the input kept.
  const first = await runTransform("Filter", scope, {
    where: { field: "x", op: "gt", value: 2.5 },
  });
  const second = await runTransform("Filter", first, {
    where: scope.identity.selection,
  });
  assert.deepEqual(await read(second.get("x")), [9]);
  [view, second, first].forEach((item) => item.dispose());
  scope.dispose();
});

test("a padded view built directly checks its count and owns its mask", async () => {
  const scope = scopeOf({ x: [1, 2, 3] }),
    uncounted = np.array([1, 0, 1], { dtype: np.int32 });
  assert.throws(
    () => createDataView(scope, { mask: uncounted }),
    /needs its row count/,
  );
  uncounted.dispose();
  const view = createDataView(scope, {
    mask: np.array([1, 0, 1], { dtype: np.int32 }),
    count: 2,
  });
  assert.deepEqual(await read(view.get("x")), [1, 3]);
  view.dispose();
  scope.dispose();
});

// --- 17.3c: consumers of padded views. Each padded result must equal the same transform over
// the kept rows filtered on the host (the compacted reference).
const noise = (i, k) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const wide = (n = 60) => ({
  x: Float32Array.from({ length: n }, (_, i) =>
    i % 11 === 3 ? NaN : Math.round(noise(i, 1) * 100) / 10,
  ),
  y: Float32Array.from(
    { length: n },
    (_, i) => Math.round(noise(i, 2) * 50) / 10,
  ),
  k: Int32Array.from({ length: n }, (_, i) => i % 4),
  g: {
    codes: Int32Array.from({ length: n }, (_, i) => (i * 7) % 5),
    categories: ["a", "b", "c", "d", "e"],
  },
  s: Array.from(
    { length: n },
    (_, i) => ["p", "q", "r"][(i * 3) % 3 === 0 ? i % 3 : (i + 1) % 3],
  ),
  w: Float32Array.from({ length: n }, (_, i) => 1 + (i % 3)),
});
/** A column as plain values: numbers, or category values for codes (null where missing). */
async function valuesOf(column) {
  if (column?.codes !== undefined) {
    const codes =
      column.codes instanceof JaxArray
        ? Array.from(await column.codes.ref.data(), Number)
        : Array.from(column.codes);
    return codes.map((code) =>
      code < 0 ? null : (column.categories[code] ?? null),
    );
  }
  if (column instanceof JaxArray)
    return Array.from(await column.ref.data(), Number);
  return Array.from(column);
}
const same = (actual, expected, label) => {
  assert.equal(
    actual.length,
    expected.length,
    `${label}: ${actual.length} rows, expected ${expected.length}`,
  );
  actual.forEach((value, i) => {
    const e = expected[i];
    if (typeof e !== "number") assert.equal(value, e, `${label}[${i}]`);
    else if (Number.isNaN(e))
      assert.ok(Number.isNaN(value), `${label}[${i}]: ${value}, expected NaN`);
    else
      assert.ok(
        Math.abs(value - e) <= 1e-4 * Math.max(1, Math.abs(e)),
        `${label}[${i}]: ${value}, expected ${e}`,
      );
  });
};
async function sameView(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  for (const key of expected.keys()) {
    if (key.startsWith("@")) continue;
    same(
      await valuesOf(actual.get(key)),
      await valuesOf(expected.get(key)),
      `${label}.${key}`,
    );
  }
}
/**
 * Filter `table` by `where` and run kind/config on the padded Filter view, and on a pass-through
 * view of it that has no padded(): the compacted rows, exactly the path before padded views.
 */
async function againstReference(
  kind,
  config,
  where,
  table = wide(),
  label = `${kind} ${JSON.stringify(config)} where ${JSON.stringify(where)}`,
) {
  const scope = scopeOf(table);
  const filtered = await runTransform("Filter", scope, { where });
  const compacted = createDataView(filtered);
  const padded = await runTransform(kind, filtered, config);
  const reference = await runTransform(kind, compacted, config);
  try {
    await sameView(padded, reference, label);
  } finally {
    [padded, reference, compacted, filtered, scope].forEach((item) =>
      item.dispose(),
    );
  }
}
const KEEP = { field: "y", op: "gt", value: 2.2 };

test("Group over a padded view equals the compacted reference (every reducer, every key kind)", async () => {
  const columns = {
    sum: sum("x"),
    mean: mean("x"),
    low: min("x"),
    high: max("x"),
    first: first("x"),
    last: last("x"),
    spread: std("x"),
    middle: median("x"),
  };
  for (const by of ["k", "g", "s", ["k", "g"]])
    await againstReference("Group", { by, columns }, KEEP);
});

test("Group shows only groups with a kept row; the physical output keeps them all", async () => {
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, {
    where: { field: "k", op: "lt", value: 2 },
  });
  const grouped = await runTransform("Group", filtered, { by: "k" });
  assert.equal(grouped.length, 2);
  assert.deepEqual(await read(grouped.get("k")), [0, 1]);
  assert.equal(grouped.padded().capacity, 4);
  assert.deepEqual(await read(grouped.padded().valid), [1, 1, 0, 0]);
  assert.deepEqual(await read(grouped.padded().get("count")), [15, 15, 0, 0]);
  [grouped, filtered, scope].forEach((item) => item.dispose());
});

test("Bin over a padded view equals the compacted reference (auto and explicit edges, 2D, weights, rules, empty bins)", async () => {
  for (const config of [
    { x: "x", bins: 6 },
    { x: "x", bins: [0, 2.5, 5, 7.5, 10] },
    { x: "x", y: "y", bins: 3 },
    { x: "x", bins: 5, weight: "w" },
    {
      x: "x",
      bins: 5,
      columns: { m: mean("y"), top: max("y") },
    },
    // Expression columns: an empty bin's is missing.
    { x: "x", bins: 8, columns: { mid: median("y"), share: divide(sum("y"), count()) } },
    { x: "x", bins: 5, weight: "w", columns: { mid: median("y") } },
    { x: "x", bins: "sturges" },
    { x: "x", bins: "fd" },
    { x: "x", bins: 12, empty: false },
    { x: "x", bins: 6, normalization: "density" },
  ])
    await againstReference("Bin", config, KEEP);
});

test("Bin assign is row-preserving over a padded view", async () => {
  await againstReference("Bin", { x: "x", bins: 5, mode: "assign" }, KEEP);
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const assigned = await runTransform("Bin", filtered, {
    x: "x",
    bins: 5,
    mode: "assign",
  });
  assert.equal(assigned.padded().capacity, 60);
  assert.equal(assigned.length, filtered.length);
  [assigned, filtered, scope].forEach((item) => item.dispose());
});

test("padded consumers: an empty mask, an all-true mask, masks that change, and a padded parent", async () => {
  for (const where of [
    { field: "y", op: "gt", value: 100 },
    { field: "y", op: "finite" },
    { field: "y", op: "lt", value: 1.5 },
  ]) {
    await againstReference(
      "Group",
      { by: "g", columns: { m: mean("x") } },
      where,
    );
    await againstReference("Bin", { x: "x", bins: 4 }, where);
  }
  // A padded parent: Filter > Filter > Group.
  const scope = scopeOf(wide());
  const first = await runTransform("Filter", scope, { where: KEEP });
  const second = await runTransform("Filter", first, {
    where: { field: "k", op: "ne", value: 1 },
  });
  const compacted = createDataView(second);
  const grouped = await runTransform("Group", second, {
    by: "g",
    columns: { m: mean("x") },
  });
  const reference = await runTransform("Group", compacted, {
    by: "g",
    columns: { m: mean("x") },
  });
  await sameView(grouped, reference, "Filter > Filter > Group");
  [grouped, reference, compacted, second, first, scope].forEach((item) =>
    item.dispose(),
  );
});

test("a padded Group's selection mask and contributors cover only kept rows", async () => {
  const { selectionMask } =
    await import("../../src/lib/plot/utils/interaction.js");
  const scope = scopeOf(wide(20));
  const filtered = await runTransform("Filter", scope, {
    where: { field: "k", op: "ne", value: 2 },
  });
  const grouped = await runTransform("Group", filtered, { by: "k" });
  // Row 2 has k = 2 (filtered out), row 5 has k = 1.
  scope.identity.selection.replace(scope.identity, [2, 5]);
  assert.deepEqual(
    await readOwned(selectionMask(grouped, scope.identity.selection)),
    [0, 1, 0],
  );
  assert.deepEqual(
    await readOwned(selectionMask(grouped.padded(), scope.identity.selection)),
    [0, 1, 0, 0],
  );
  assert.deepEqual(await read(grouped.get("@selected")), [0, 1, 0]);
  const rows = await readOwned(await grouped.contributors(1));
  assert.deepEqual(rows, [1, 5, 9, 13, 17]);
  assert.deepEqual((await grouped.aggregateInfo(2)).k, 3);
  [grouped, filtered, scope].forEach((item) => item.dispose());
});

// --- 17.3d: Calculate and expressions over padded views. Row-wise arithmetic runs on every
// physical row; every reduction (and count()) sees only the shown rows.
const REDUCED = {
  dv: subtract("x", mean("x")),
  total: sum("x"),
  n: count(),
  nx: count("x"),
  sd: std("x"),
  va: variance("x"),
  lo: min("x"),
  hi: max("x"),
  med: median("x"),
  fi: first("x"),
  la: last("x"),
  mo: mode("g"),
  byG: mean("x", { by: "g" }),
  byS: sum("y", { by: "s" }),
  byN: count(null, { by: "g" }),
  y2: multiply("y", 2),
  c: 3,
};

test("Calculate over a padded view equals the compacted reference (every reduction, by groups, count())", async () => {
  await againstReference("Calculate", { columns: REDUCED }, KEEP);
  for (const where of [
    { field: "y", op: "gt", value: 100 },
    { field: "y", op: "finite" },
    { field: "k", op: "eq", value: 2 },
  ])
    await againstReference("Calculate", { columns: REDUCED }, where);
});

test("Calculate over a padded view is padded: the input's physical rows and valid mask carry through", async () => {
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const reduced = await runTransform("Calculate", filtered, {
    columns: { dv: subtract("x", mean("x")), c: 3 },
  });
  const plain = await runTransform("Calculate", filtered, {
    columns: { y2: multiply("y", 2) },
  });
  assert.equal(reduced.length, filtered.length);
  assert.equal(reduced.padded().capacity, 60);
  assert.deepEqual(
    await read(reduced.padded().valid),
    await read(filtered.padded().valid),
  );
  // A literal broadcasts at the capacity; a reduction's values follow the mask, arithmetic's do not.
  assert.equal(reduced.padded().get("c").shape[0], 60);
  assert.equal(reduced.followsMask, true);
  assert.equal(plain.followsMask, false);
  // Downstream consumers read it padded too: Filter > Calculate > Group.
  const compacted = createDataView(filtered);
  const reference = await runTransform("Calculate", compacted, {
    columns: { dv: subtract("x", mean("x")) },
  });
  const [grouped, groupedReference] = await Promise.all(
    [reduced, reference].map((view) =>
      runTransform("Group", view, {
        by: "g",
        columns: { m: mean("dv") },
      }),
    ),
  );
  await sameView(grouped, groupedReference, "Filter > Calculate > Group");
  [
    grouped,
    groupedReference,
    reference,
    compacted,
    plain,
    reduced,
    filtered,
    scope,
  ].forEach((item) => item.dispose());
});

test("expressions over a physical scope: count() is the valid count, literals broadcast at the capacity", async () => {
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const physical = filtered.padded();
  for (const [expression, expected] of [
    [count(), filtered.length],
    [sum(1), filtered.length],
    [min("y"), 2.3],
  ]) {
    const evaluated = evaluateExpression(expression, physical, {
      broadcast: false,
    });
    try {
      same(await read(evaluated.value), [expected], JSON.stringify(expression));
    } finally {
      evaluated.dispose();
    }
  }
  const broadcast = evaluateExpression(7, physical);
  try {
    assert.deepEqual(broadcast.value.shape, [60]);
  } finally {
    broadcast.dispose();
  }
  [filtered, scope].forEach((item) => item.dispose());
});

test("expression-valued transform parameters see only the shown rows", async () => {
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, {
    where: { field: "k", op: "eq", value: 1 },
  });
  const compacted = createDataView(filtered);
  const config = { x: "x", bins: power(count(), 0.5) };
  const [padded, reference, whole] = await Promise.all(
    [filtered, compacted, scope].map((input) =>
      resolveTransformParameters("Bin", config, input),
    ),
  );
  assert.equal(padded.bins, reference.bins);
  assert.equal(padded.bins, Math.round(Math.sqrt(15)));
  assert.notEqual(padded.bins, whole.bins);
  [compacted, filtered, scope].forEach((item) => item.dispose());
});

// --- 17.3e: Sort, Window, Normalize and Stack over padded views. Sort and Window put the kept
// rows first (a prefix view); Normalize and Stack are row-preserving padded.
const signed = (n = 60) => {
  const table = wide(n);
  return {
    ...table,
    d: Float32Array.from(table.y, (v, i) => (i % 13 === 5 ? NaN : v - 2.5)),
  };
};

test("Sort over a padded view equals the compacted reference and puts the kept rows first", async () => {
  for (const config of [
    { by: "x" },
    { by: "y", order: "desc" },
    { by: ["k", "x"] },
    { by: "g" },
    { by: ["s", "y"], order: "desc" },
  ])
    await againstReference("Sort", config, KEEP);
  for (const where of [
    { field: "y", op: "gt", value: 100 },
    { field: "y", op: "finite" },
  ])
    await againstReference("Sort", { by: "x" }, where);
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const compacted = createDataView(filtered);
  const [sorted, reference] = await Promise.all(
    [filtered, compacted].map((input) =>
      runTransform("Sort", input, { by: "x" }),
    ),
  );
  const physical = sorted.padded();
  assert.equal(physical.prefix, true);
  assert.equal(physical.capacity, 60);
  assert.equal(sorted.prefixed(), physical);
  assert.deepEqual(
    await read(physical.valid),
    Array.from({ length: 60 }, (_, i) => (i < filtered.length ? 1 : 0)),
  );
  assert.deepEqual(
    await readOwned(sorted.sourceIndices()),
    await readOwned(reference.sourceIndices()),
  );
  assert.equal(sorted.followsMask, true);
  // Row-preserving consumers of a prefix view stay prefix; a Filter after it does not.
  const calculated = await runTransform("Calculate", sorted, {
    columns: { y2: multiply("y", 2) },
  });
  assert.equal(calculated.padded().prefix, true);
  const refiltered = await runTransform("Filter", sorted, {
    where: { field: "k", op: "ne", value: 1 },
  });
  assert.equal(refiltered.padded().prefix, false);
  const refilteredReference = await runTransform("Filter", reference, {
    where: { field: "k", op: "ne", value: 1 },
  });
  await sameView(refiltered, refilteredReference, "Filter > Sort > Filter");
  [
    refilteredReference,
    refiltered,
    calculated,
    reference,
    sorted,
    compacted,
    filtered,
    scope,
  ].forEach((item) => item.dispose());
});

test("Window over a padded view equals the compacted reference", async () => {
  for (const reduce of ["mean", "sum", "count"])
    for (const align of ["trailing", "center", "leading"])
      await againstReference(
        "Window",
        { field: "x", size: 4, reduce, align },
        KEEP,
      );
  // Other reducers and `by` read the compacted rows (the adapter).
  await againstReference(
    "Window",
    { field: "x", size: 3, reduce: "max" },
    KEEP,
    wide(24),
  );
  await againstReference("Window", { field: "x", size: 3, by: "g" }, KEEP);
  for (const where of [
    { field: "y", op: "gt", value: 100 },
    { field: "y", op: "finite" },
    { field: "y", op: "lt", value: 0.4 },
  ])
    await againstReference("Window", { field: "x", size: 5 }, where);
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const smoothed = await runTransform("Window", filtered, {
    field: "x",
    size: 4,
  });
  assert.equal(smoothed.padded().prefix, true);
  assert.equal(smoothed.padded().capacity, 60);
  // Filter > Sort > Window: windows over the kept rows in sorted order.
  const sorted = await runTransform("Sort", filtered, { by: "y" });
  const windowed = await runTransform("Window", sorted, {
    field: "x",
    size: 3,
  });
  const compacted = createDataView(filtered),
    sortedReference = await runTransform("Sort", compacted, { by: "y" });
  const reference = await runTransform("Window", sortedReference, {
    field: "x",
    size: 3,
  });
  await sameView(windowed, reference, "Filter > Sort > Window");
  [
    reference,
    sortedReference,
    compacted,
    windowed,
    sorted,
    smoothed,
    filtered,
    scope,
  ].forEach((item) => item.dispose());
});

/** Host rows grouped by `keys` (NaN keys together, as groupRows does), in first-seen order. */
function hostGroups(keys) {
  const groups = new Map();
  keys.forEach((key, i) => {
    const id = JSON.stringify(key);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(i);
  });
  return [...groups.values()];
}
function hostNormalize(x, groups, method) {
  const out = new Array(x.length).fill(NaN);
  for (const rows of groups) {
    const finite = rows.filter((i) => Number.isFinite(x[i])),
      values = finite.map((i) => x[i]);
    const count = Math.max(values.length, 1),
      sum = values.reduce((a, b) => a + b, 0),
      mean = sum / count;
    const sd = Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / count,
    );
    const low = Math.min(...values),
      high = Math.max(...values);
    for (const i of finite) {
      if (method === "deviation") out[i] = (x[i] - mean) / (sd > 0 ? sd : 1);
      else if (method === "extent")
        out[i] = high - low > 0 ? (x[i] - low) / (high - low) : 0.5;
      else {
        const d =
          method === "sum" ? sum : method === "first" ? values[0] : high;
        out[i] = d !== 0 ? x[i] / d : NaN;
      }
    }
  }
  return out;
}
function hostStack(y, groups, rank) {
  const y0 = new Array(y.length).fill(NaN),
    y1 = new Array(y.length).fill(NaN);
  for (const rows of groups) {
    let positive = 0,
      negative = 0;
    for (const i of rank
      ? [...rows].sort((a, b) => rank[a] - rank[b] || a - b)
      : rows) {
      if (!Number.isFinite(y[i])) continue;
      const top = y[i] >= 0 ? (positive += y[i]) : (negative += y[i]),
        start = top - y[i];
      y0[i] = Math.min(start, top);
      y1[i] = Math.max(start, top);
    }
  }
  return { y0, y1 };
}

test("grouped Normalize and Stack match host arithmetic", async () => {
  const table = signed(),
    scope = scopeOf(table);
  const g = Array.from(table.g.codes),
    s = table.s;
  for (const method of ["deviation", "extent", "sum", "first", "max"])
    for (const [by, keys] of [
      ["g", g],
      ["s", s],
      [["k", "g"], g.map((code, i) => [table.k[i], code])],
      [undefined, g.map(() => 0)],
    ]) {
      const view = await runTransform("Normalize", scope, {
        field: "d",
        method,
        ...(by ? { by } : {}),
      });
      try {
        same(
          await valuesOf(view.get("normalized")),
          hostNormalize(table.d, hostGroups(keys), method),
          `Normalize ${method} by ${by}`,
        );
      } finally {
        view.dispose();
      }
    }
  const order = ["r", "p", "q"],
    firstSeen = [...new Set(s)];
  for (const [config, keys, rank] of [
    [{ x: "g", y: "d" }, g],
    [{ y: "d" }, g.map(() => 0)],
    [{ x: "x", y: "d" }, Array.from(table.x)],
    [{ x: "g", y: "d", series: "s" }, g, s.map((v) => firstSeen.indexOf(v))],
    [{ x: "g", y: "d", series: "s", order }, g, s.map((v) => order.indexOf(v))],
    [{ x: "k", y: "d", series: "y" }, Array.from(table.k), Array.from(table.y)],
  ]) {
    const view = await runTransform("Stack", scope, config),
      expected = hostStack(table.d, hostGroups(keys), rank);
    try {
      same(
        await valuesOf(view.get("y0")),
        expected.y0,
        `Stack ${JSON.stringify(config)} y0`,
      );
      same(
        await valuesOf(view.get("y1")),
        expected.y1,
        `Stack ${JSON.stringify(config)} y1`,
      );
    } finally {
      view.dispose();
    }
  }
  scope.dispose();
});

test("Normalize and Stack over a padded view equal the compacted reference", async () => {
  for (const method of ["deviation", "extent", "sum", "first", "max"])
    for (const by of [undefined, "g", "s"])
      await againstReference(
        "Normalize",
        { field: "d", method, ...(by ? { by } : {}) },
        KEEP,
        signed(),
      );
  for (const config of [
    { x: "g", y: "d" },
    { y: "d" },
    { x: "s", y: "d", series: "g" },
    { x: "g", y: "d", series: "s", order: ["r", "p", "q"] },
  ])
    await againstReference("Stack", config, KEEP, signed());
  for (const where of [
    { field: "y", op: "gt", value: 100 },
    { field: "y", op: "finite" },
  ]) {
    await againstReference(
      "Normalize",
      { field: "d", by: "g" },
      where,
      signed(),
    );
    await againstReference("Stack", { x: "g", y: "d" }, where, signed());
  }
  const scope = scopeOf(signed());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  for (const [kind, config] of [
    ["Normalize", { field: "d", by: "g" }],
    ["Stack", { x: "g", y: "d" }],
  ]) {
    const view = await runTransform(kind, filtered, config);
    assert.equal(view.padded().capacity, 60, kind);
    assert.equal(view.followsMask, true, kind);
    view.dispose();
  }
  [filtered, scope].forEach((item) => item.dispose());
});

// --- 17.3f: less common aggregations over padded views. Groups come from every physical row,
// statistics from the shown ones, and only groups with a shown row (and the separators between
// them) are valid, so the compacted output is what the compacted input gives.
const spiky = (n = 60) => {
  const table = signed(n);
  return {
    ...table,
    d: Float32Array.from(table.d, (v, i) =>
      i % 9 === 4 ? 30 + i : i % 17 === 8 ? -25 : v,
    ),
  };
};
const DROP_B = { field: "g", op: "ne", value: "b" },
  DROP_FIRST = { field: "g", op: "ne", value: "a" },
  DROP_LAST = { field: "g", op: "ne", value: "e" },
  ONLY_C = { field: "g", op: "eq", value: "c" };

test("BoxStats and BoxOutliers over a padded view equal the compacted reference", async () => {
  for (const where of [KEEP, DROP_B, DROP_FIRST, DROP_LAST, ONLY_C])
    for (const by of ["g", "s"]) {
      await againstReference("BoxStats", { by, value: "d" }, where, spiky());
      await againstReference("BoxOutliers", { by, value: "d" }, where, spiky());
    }
  // Nothing kept: no groups (the compacted input has none).
  const scope = scopeOf(spiky());
  const none = await runTransform("Filter", scope, {
    where: { field: "y", op: "gt", value: 100 },
  });
  const [stats, outliers] = await Promise.all([
    runTransform("BoxStats", none, { by: "g", value: "d" }),
    runTransform("BoxOutliers", none, { by: "g", value: "d" }),
  ]);
  assert.equal(stats.length, 0);
  assert.equal(outliers.length, 0);
  assert.equal(stats.padded().capacity, 5);
  assert.equal(outliers.padded().capacity, 60);
  [outliers, stats, none, scope].forEach((item) => item.dispose());
});

// TODO 137.3: the Quantile transform became the quantile reducer.
test("quantile over a padded view equals the compacted reference", async () => {
  for (const where of [KEEP, DROP_B, DROP_FIRST, DROP_LAST, ONLY_C])
    await againstReference("Calculate", { columns: {
      q: quantile("d", 0.3), g: quantile("d", 0.75, { by: "g" }), s: quantile("d", 0.1, { by: "s" }),
    } }, where, spiky());
});

test("Summary over a padded view equals the compacted reference (bootstrap reads compacted rows)", async () => {
  for (const where of [KEEP, DROP_B, DROP_FIRST, DROP_LAST])
    for (const config of [
      { field: "d", by: "g" },
      { field: "d", by: "s", interval: "normal" },
      { field: "d", by: "g", estimate: "median" },
      { field: "d", by: ["k", "g"], interval: "deviation" },
      { field: "d", interval: "standard-error" },
      { field: "d", by: "g", interval: "bootstrap", samples: 16 },
    ])
      await againstReference("Summary", config, where, spiky());
});

test("Pivot and Hexbin over a padded view equal the compacted reference", async () => {
  for (const where of [KEEP, DROP_B, DROP_LAST]) {
    for (const config of [
      { field: "s", value: sum("d"), by: "g" },
      {
        field: "g",
        value: mean("x"),
        by: "k",
        as: ["ga", "gb", "gc", "gd", "ge"],
      },
      { field: "s", value: sum("d") },
    ])
      await againstReference("Pivot", config, where, spiky());
    for (const config of [
      { x: "x", y: "y", bins: 4 },
      { x: "x", y: "y", radius: 1.5 },
      {
        x: "x",
        y: "y",
        radius: 1.5,
        columns: { m: mean("d"), mid: median("d") },
      },
      { x: "x", y: "y", bins: 4, bounds: { x: [0, 10], y: [0, 10] }, columns: { mid: median("d") } },
    ])
      await againstReference("Hexbin", config, where, spiky());
  }
  // A Hexbin cell's contributors are the kept rows in it.
  const scope = scopeOf(spiky());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const compacted = createDataView(filtered);
  const [cells, reference] = await Promise.all(
    [filtered, compacted].map((input) =>
      runTransform("Hexbin", input, { x: "x", y: "y", radius: 1.5 }),
    ),
  );
  for (const index of [0, 2, reference.length - 1])
    assert.deepEqual(
      await readOwned(await cells.contributors(index)),
      await readOwned(await reference.contributors(index)),
      `cell ${index}`,
    );
  [reference, cells, compacted, filtered, scope].forEach((item) =>
    item.dispose(),
  );
});

test("Density over a padded view equals the compacted reference (groups, violins, 2D, weights)", async () => {
  for (const where of [KEEP, DROP_B, DROP_FIRST, DROP_LAST])
    for (const config of [
      { x: "x", resolution: 12 },
      { x: "x", by: "g", resolution: 12 },
      { x: "x", by: "g", resolution: 12, violin: {} },
      {
        x: "x",
        by: "g",
        resolution: 12,
        violin: { scale: "count", side: "left" },
      },
      { x: "x", y: "y", resolution: 6 },
      { x: "x", weight: "w", resolution: 12, normalization: "count" },
    ])
      await againstReference("Density", config, where, spiky());
});

// --- 17.3g: Sample (shuffling too), Fold and Slice over padded views.
const numbered = (n = 60) => ({
  ...wide(n),
  id: Float32Array.from({ length: n }, (_, i) => i),
});
const ascending = (values) =>
  values.every((value, i) => !i || values[i - 1] < value);

test("Sample order=random over a padded view: every kept row once, first, in a seeded order", async () => {
  const scope = scopeOf(numbered());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const [a, b] = await Promise.all(
    [0, 1].map(() => runTransform("Sample", filtered, { seed: 7, order: "random" })),
  );
  const kept = await readOwned(filtered.sourceIndices()),
    rows = await readOwned(a.sourceIndices());
  assert.equal(a.padded().prefix, true);
  assert.equal(a.padded().capacity, 60);
  assert.deepEqual(
    [...rows].sort((x, y) => x - y),
    kept,
  );
  assert.notDeepEqual(rows, kept);
  assert.deepEqual(rows, await readOwned(b.sourceIndices()));
  assert.deepEqual(await read(a.get("id")), rows);
  [b, a, filtered, scope].forEach((item) => item.dispose());
});

test("Sample over a padded view: min(size, count) distinct kept rows in row order, at a fixed capacity", async () => {
  const scope = scopeOf(numbered());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const kept = new Set(await readOwned(filtered.sourceIndices())),
    count = kept.size;
  for (const [config, expected, capacity] of [
    [{ size: 10, seed: 3 }, 10, 10],
    [{ proportion: 0.5, seed: 3 }, Math.round(count * 0.5), 30],
    [{ size: 100 }, count, 60],
    [{}, count, 60],
    [{ size: 0 }, 0, 0],
  ]) {
    const view = await runTransform("Sample", filtered, config),
      label = JSON.stringify(config);
    try {
      assert.equal(view.length, expected, label);
      assert.equal(view.padded().capacity, capacity, label);
      const rows = await readOwned(view.sourceIndices());
      assert.equal(rows.length, expected, label);
      assert.ok(ascending(rows), `${label}: row order`);
      assert.ok(
        rows.every((row) => kept.has(row)),
        `${label}: kept rows only`,
      );
      assert.deepEqual(await read(view.get("id")), rows, label);
    } finally {
      view.dispose();
    }
  }
  // Hiding rows outside the sample leaves the sample as it was.
  const sample = await runTransform("Sample", filtered, { size: 8, seed: 5 });
  const rows = await readOwned(sample.sourceIndices());
  const extra = [...kept].filter((row) => !rows.includes(row)).slice(0, 3);
  const narrower = await runTransform("Filter", filtered, {
    where: is_in(col("id"), [...rows, ...extra]),
  });
  const again = await runTransform("Sample", narrower, { size: 8, seed: 5 });
  assert.deepEqual(await readOwned(again.sourceIndices()), rows);
  [again, narrower, sample, filtered, scope].forEach((item) => item.dispose());
});

test("Fold over a padded view equals the compacted reference", async () => {
  for (const where of [
    KEEP,
    { field: "y", op: "gt", value: 100 },
    { field: "y", op: "finite" },
  ])
    await againstReference("Fold", { fields: ["x", "y"] }, where);
  await againstReference(
    "Fold",
    { fields: ["x", "y", "w"], as: { key: "which", value: "amount" } },
    KEEP,
  );
  const scope = scopeOf(wide());
  const filtered = await runTransform("Filter", scope, { where: KEEP });
  const folded = await runTransform("Fold", filtered, { fields: ["x", "y"] });
  assert.equal(folded.padded().capacity, 120);
  assert.equal(folded.length, 2 * filtered.length);
  assert.equal(folded.followsMask, false);
  [folded, filtered, scope].forEach((item) => item.dispose());
});

const timeline = (n = 64) => ({
  id: Array.from({ length: n }, (_, i) => `e${i % 4}`),
  t: Float32Array.from({ length: n }, (_, i) => Math.floor(i / 4)),
  v: Float32Array.from(
    { length: n },
    (_, i) => Math.round(noise(i, 5) * 100) / 10,
  ),
  c: Array.from({ length: n }, (_, i) => ["u", "w"][Math.floor(i / 8) % 2]),
  keep: Float32Array.from({ length: n }, (_, i) => noise(i, 6)),
  row: Float32Array.from({ length: n }, (_, i) => i),
});

test("Slice over a padded view equals the compacted reference (values, endpoints, uniqueness)", async () => {
  for (const where of [
    { field: "keep", op: "gt", value: 0.3 },
    { field: "id", op: "ne", value: "e2" },
    { field: "t", op: "lt", value: 6 },
  ])
    for (const at of [2.5, 7.25, 0, 20]) {
      const config = { field: "t", by: "id", at, values: ["v", "c"] },
        label = `Slice at ${at} where ${JSON.stringify(where)}`;
      const scope = scopeOf(timeline());
      const filtered = await runTransform("Filter", scope, { where });
      const compacted = createDataView(filtered);
      const [padded, reference] = await Promise.all(
        [filtered, compacted].map((input) =>
          runTransform("Slice", input, config),
        ),
      );
      try {
        await sameView(padded, reference, label);
        // A padded output has a row per entity (a fixed length): its valid rows' endpoints are the
        // reference's.
        const valid = await read(padded.padded().valid);
        assert.equal(
          valid.length,
          4,
          `${label}: one row per entity (e0 to e3)`,
        );
        for (const end of ["lower", "upper"])
          same(
            (await read(padded.slice[end])).filter((_, i) => valid[i]),
            await read(reference.slice[end]),
            `${label} ${end}`,
          );
      } finally {
        [padded, reference, compacted, filtered, scope].forEach((item) =>
          item.dispose(),
        );
      }
    }
  // Only the shown rows need unique key/time combinations: row 5 (e1) moved to t = 0 repeats row 1.
  const table = {
    ...timeline(),
    t: Float32Array.from(timeline().t, (t, i) => (i === 5 ? 0 : t)),
  };
  const scope = scopeOf(table);
  const hidden = await runTransform("Filter", scope, {
    where: { field: "row", op: "ne", value: 5 },
  });
  const shown = await runTransform("Filter", scope, {
    where: { field: "row", op: "ne", value: 9 },
  });
  const sliced = await runTransform("Slice", hidden, {
    field: "t",
    by: "id",
    at: 3,
  });
  await assert.rejects(
    runTransform("Slice", shown, { field: "t", by: "id", at: 3 }),
    /unique key\/time/,
  );
  [sliced, shown, hidden, scope].forEach((item) => item.dispose());
});

// --- 17.3h: bucketed compaction. The thresholds are lowered here so small tables bucket.
const withBuckets = async (limits, run) => {
  const saved = { ...bucketing };
  Object.assign(bucketing, limits);
  try {
    return await run();
  } finally {
    Object.assign(bucketing, saved);
  }
};

test("bucket sizes grow at once, shrink after three low runs, and do not thrash at a boundary", () =>
  withBuckets(
    { minimumSource: 1024, minimumBucket: 64, shrinkAfter: 3 },
    () => {
      const state = {},
        counts = [
          1000, 200, 200, 200, 200, 90, 70, 65, 20, 20, 20, 300, 0, 0, 0, 1024,
          255, 257,
        ];
      assert.deepEqual(
        counts.map((count) => bucketSize(state, 1024, count)),
        [
          1024, 1024, 1024, 256, 256, 256, 256, 256, 256, 256, 64, 1024, 1024,
          1024, 64, 1024, 1024, 1024,
        ],
      );
      const edge = {};
      assert.deepEqual(
        [60, 65, 60, 65, 60, 65].map((count) => bucketSize(edge, 1024, count)),
        [64, 128, 128, 128, 128, 128],
      );
      // A new source length starts over; a small source and a stateless call take their size at once.
      assert.equal(bucketSize(edge, 2048, 20), 64);
      assert.equal(bucketSize({}, 512, 3), 512);
      assert.equal(bucketSize(undefined, 1024, 3), 64);
      assert.equal(bucketSize(undefined, 1024, 0), 64);
      assert.equal(bucketSize(undefined, 1024, 256), 1024);
    },
  ));

test("a small selection of a large input offers a bucket: kept rows first, copies of the first after", () =>
  withBuckets(
    { minimumSource: 128, minimumBucket: 16, shrinkAfter: 3 },
    async () => {
      const scope = scopeOf(numbered(400));
      const filtered = await runTransform("Filter", scope, {
        where: { field: "y", op: "gt", value: 4.6 },
      });
      // The output stays the physical rows with a mask (TODO 25.1); the bucket is built on request.
      assert.equal(filtered.padded().capacity, 400);
      assert.equal(filtered.padded().prefix, false);
      assert.equal(filtered.followsMask, false);
      const bucket = filtered.bucketed();
      assert.equal(filtered.bucketed(), bucket, "built once");
      const count = bucket.length,
        physical = bucket.padded();
      const compacted = createDataView(filtered),
        kept = await readOwned(compacted.sourceIndices());
      compacted.dispose();
      assert.equal(count, 31);
      assert.equal(filtered.length, 31);
      assert.equal(physical.capacity, 32);
      assert.equal(physical.prefix, true);
      assert.equal(bucket.followsMask, true);
      assert.deepEqual(
        await read(physical.valid),
        Array.from({ length: physical.capacity }, (_, i) =>
          i < count ? 1 : 0,
        ),
      );
      const ids = await read(physical.get("id"));
      assert.deepEqual(ids.slice(0, count), kept);
      assert.ok(
        ids.slice(count).every((id) => id === kept[0]),
        "padding repeats the first kept row",
      );
      assert.deepEqual(
        (await readOwned(physical.sourceIndices())).slice(count),
        Array(physical.capacity - count).fill(-1),
      );
      // Nothing kept: the smallest bucket; everything kept: no bucket.
      const none = await runTransform("Filter", scope, {
        where: { field: "y", op: "gt", value: 100 },
      });
      assert.equal(none.length, 0);
      assert.equal(none.bucketed().padded().capacity, 16);
      const all = await runTransform("Filter", scope, {
        where: { field: "y", op: "finite" },
      });
      assert.equal(all.bucketed, undefined);
      assert.equal(all.padded().capacity, 400);
      assert.equal(all.padded().prefix, false);
      // A Filter's transform cache keeps its bucket: 50 rows take 64; 4 keep it for two more
      // runs, then take 16. (Counts compare in float32: 4.4 keeps no row equal to 4.4.)
      const cache = {},
        sizes = [];
      for (const value of [4.4, 4.9, 4.9, 4.9, 4.9]) {
        const view = await runTransform(
          "Filter",
          scope,
          { where: { field: "y", op: "gt", value } },
          { cache },
        );
        sizes.push([
          view.length,
          (view.bucketed?.() ?? view).padded().capacity,
        ]);
        view.dispose();
      }
      assert.deepEqual(sizes, [
        [50, 64],
        [4, 64],
        [4, 64],
        [4, 16],
        [4, 16],
      ]);
      disposeTransformCache(cache);
      [all, none, filtered, scope].forEach((item) => item.dispose());
    },
  ));

// TODO 25.1: the bucket's sort runs only for a consumer that reads the bucket. A Slice, the
// controls, a parameter expression and the compacted rows read the Filter's own rows.
test("a Filter builds its bucket only when a consumer reads it", () =>
  withBuckets(
    { minimumSource: 128, minimumBucket: 16, shrinkAfter: 3 },
    async () => {
      const scope = scopeOf(numbered(400));
      const argsorts = (kernels) =>
        [...kernels].filter((k) => k.startsWith("routine Argsort")).length;
      let filtered;
      const own = await kernelsOf(async () => {
        filtered = await runTransform("Filter", scope, {
          where: { field: "y", op: "gt", value: 4.6 },
        });
        await read(filtered.padded().valid);
      });
      assert.equal(
        argsorts(own),
        0,
        "the Filter and its physical rows sort nothing",
      );
      const grouped = await kernelsOf(async () => {
        const view = await runTransform("Group", filtered, {
          by: "g",
          columns: { m: mean("y") },
        });
        await read(view.padded?.().get("m") ?? view.get("m"));
        view.dispose();
      });
      assert.ok(argsorts(grouped) > 0, "a Group reads the bucket");
      assert.equal(filtered.bucketed().padded().capacity, 32);
      [filtered, scope].forEach((item) => item.dispose());
    },
  ));

test("consumers of a bucketed Filter equal the compacted reference", () =>
  withBuckets(
    { minimumSource: 128, minimumBucket: 16, shrinkAfter: 3 },
    async () => {
      const table = {
        ...spiky(400),
        id: Float32Array.from({ length: 400 }, (_, i) => i),
      };
      for (const where of [
        { field: "y", op: "gt", value: 4.4 },
        { field: "y", op: "gt", value: 100 },
        { field: "y", op: "lt", value: 0.3 },
      ])
        for (const [kind, config] of [
          ["Group", { by: "g", columns: { m: mean("d") } }],
          ["Bin", { x: "x", bins: 6 }],
          ["Bin", { x: "x", bins: 6, empty: false }],
          [
            "Calculate",
            { columns: { dv: subtract("d", mean("d")), n: count() } },
          ],
          ["Sort", { by: "x" }],
          ["Window", { field: "d", size: 3 }],
          ["Normalize", { field: "d", by: "g" }],
          ["Stack", { x: "g", y: "d" }],
          ["Calculate", { columns: { q: quantile("d", 0.9, { by: "g" }) } }],
          ["BoxStats", { by: "g", value: "d" }],
          ["Pivot", { field: "s", value: sum("d"), by: "g" }],
          ["Density", { x: "x", by: "g", resolution: 8, violin: {} }],
          ["Fold", { fields: ["x", "y"] }],
        ])
          await againstReference(kind, config, where, table);
    },
  ));

// A Slice over a bucketing Filter slices the Filter's own rows, never the bucket (TODO 25.1): one
// row per entity of the Filter's input whatever the selection keeps, and its valid rows equal the
// compacted reference (the bucket's rows are the kept ones, so the entities would follow the brush).
test("Slice over a bucketed Filter has a row per input entity and equals the compacted reference", () =>
  withBuckets(
    { minimumSource: 128, minimumBucket: 16, shrinkAfter: 3 },
    async () => {
      // Eight entities of 50 rows each; the Filters keep rows of two or three of them (under a
      // quarter of the rows, so they bucket).
      const n = 400,
        table = {
          id: Array.from({ length: n }, (_, i) => `e${Math.floor(i / 50)}`),
          t: Float32Array.from({ length: n }, (_, i) => i % 50),
          v: Float32Array.from({ length: n }, (_, i) => (i * 7) % 13),
          row: Float32Array.from({ length: n }, (_, i) => i),
        };
      for (const where of [
        { field: "row", op: "lt", value: 60 },
        { field: "row", op: "gt", value: 320 },
      ]) {
        const scope = scopeOf(table),
          cache = {};
        const filtered = await runTransform(
          "Filter",
          scope,
          { where },
          { cache },
        );
        assert.ok(filtered.bucketed, `${JSON.stringify(where)}: bucketed`);
        const compacted = createDataView(filtered);
        const config = { field: "t", by: "id", at: 20.5, values: ["v"] };
        const [padded, reference] = await Promise.all(
          [filtered, compacted].map((input) =>
            runTransform("Slice", input, config),
          ),
        );
        try {
          assert.equal(
            padded.padded().capacity,
            8,
            "one row per entity of the input",
          );
          await sameView(padded, reference, JSON.stringify(where));
        } finally {
          [padded, reference, compacted, filtered, scope].forEach((item) =>
            item.dispose(),
          );
        }
      }
    },
  ));

// Found in 17.3h (pre-existing): grouped transforms over no rows (an empty table, or zero kept
// rows read compacted) threw "Need at least one array to stack/concatenate".
test("grouped transforms over no rows give no groups", async () => {
  const scope = scopeOf({
    ...spiky(12),
    g: {
      codes: Int32Array.from({ length: 12 }, (_, i) => i % 3),
      categories: ["a", "b", "c"],
    },
  });
  const none = await runTransform("Filter", scope, {
    where: { field: "y", op: "gt", value: 100 },
  });
  const empty = createDataView(none);
  for (const [kind, config] of [
    ["Pivot", { field: "s", value: sum("d"), by: "g" }],
    ["Density", { x: "x", by: "g", resolution: 8, violin: {} }],
    ["BoxStats", { by: "g", value: "d" }],
  ]) {
    const view = await runTransform(kind, empty, config);
    try {
      assert.equal(view.length, 0, kind);
      for (const key of view.keys())
        if (!key.startsWith("@"))
          assert.deepEqual(await valuesOf(view.get(key)), [], `${kind}.${key}`);
      if (view.get("g")?.categories)
        assert.deepEqual(view.get("g").categories, ["a", "b", "c"], kind);
    } finally {
      view.dispose();
    }
  }
  [empty, none, scope].forEach((item) => item.dispose());
});
