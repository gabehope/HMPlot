// TODO 28 Part B: tween() as a stateful column (utils/tweenState.js).
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { table } from "../../src/lib/plot/utils/interaction.js";
import { runTransform, transformProducerDeadline, disposeTransformCache } from "../../src/lib/plot/utils/transforms.js";
import { tween, add, multiply, mean, greater } from "../../src/lib/plot/utils/expressions.js";
import { easings, ease } from "../../src/lib/plot/utils/animation.js";
import { TweenState, easeArray } from "../../src/lib/plot/utils/tweenState.js";

const linear = { duration: 1000, easing: "linear" };
// values() reads a borrowed array (a view's column); consume() reads one the caller owns.
const values = async (array) => Array.from(await (array instanceof JaxArray ? array.ref.data() : array));
const consume = async (array) => Array.from(await array.data());
const near = (actual, expected, label) =>
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-3, `${label}: ${actual} vs ${expected}`));

test("the jax easings match the host ones", async () => {
  const points = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
  for (const easing of easings) {
    const owned = [], own = (a) => (owned.push(a), a);
    const p = own(np.array(points, { dtype: np.float32 }));
    near(await values(easeArray(p, easing, own)), points.map((t) => ease(t, easing)), easing);
    for (const a of owned) a.dispose();
  }
});

test("a retarget starts changed rows from where they are and leaves the others moving", async () => {
  const state = new TweenState(linear);
  // retarget() borrows its target.
  const retarget = (list, time) => {
    const target = np.array(list, { dtype: np.float32 });
    state.retarget(target, null, 3, time);
    target.dispose();
  };
  retarget([0, 0, 0], 0);
  near(await consume(state.valuesAt(0)), [0, 0, 0], "at rest");
  assert.equal(state.inFlight(0), false);
  retarget([10, 10, 10], 0);
  near(await consume(state.valuesAt(500)), [5, 5, 5], "halfway");
  assert.equal(state.end, 1000);
  // Row 0 is sent elsewhere at 500: it starts again from 5; rows 1 and 2 keep going.
  retarget([20, 10, 10], 500);
  near(await consume(state.valuesAt(1000)), [12.5, 10, 10], "retargeted");
  near(await consume(state.valuesAt(1500)), [20, 10, 10], "landed");
  assert.equal(state.end, 1500);
  // A missing end point jumps.
  retarget([NaN, 10, 10], 1500);
  const next = await consume(state.valuesAt(1600));
  assert.ok(Number.isNaN(next[0]));
  state.dispose();
});

async function calculate(scope, columns, time, cache, read = Object.keys(columns)) {
  const view = await runTransform("Calculate", scope, { columns, __viewState: { time } }, { cache });
  const out = { liveUntil: view.liveUntil };
  for (const name of read) out[name] = await values(view.get(name));
  out.view = view;
  return out;
}

test("tween state follows each observation through a Sort", async () => {
  const scope = createDataScope();
  scope.update({ x: [0, 10, 20, 30], k: [3, 1, 4, 2] });
  const cache = {}, columns = { g: add(tween("x", linear), 0), x: "x" };
  const run = async (order, time) => {
    const sorted = await runTransform("Sort", scope, { by: "k", order });
    const out = await calculate(sorted, columns, time, cache);
    out.view.dispose(); sorted.dispose();
    return out;
  };
  await run("asc", 0);
  scope.update({ x: [100, 110, 120, 130], k: [3, 1, 4, 2] });
  const start = await run("asc", 0);
  near(start.g, [10, 30, 0, 20], "k ascending: rows 1, 3, 0, 2 at rest");
  // Reversing the order moves no row: each keeps its own motion.
  const half = await run("desc", 500);
  near(half.g, [70, 50, 80, 60], "k descending at 500: rows 2, 0, 3, 1 halfway");
  disposeTransformCache(cache); scope.dispose();
});

test("a row a Filter hides keeps moving, and a sampled-out row resumes where its motion is", async () => {
  const scope = createDataScope();
  scope.update({ x: [0, 10, 20, 30], show: [1, 0, 1, 1] });
  const cache = {}, columns = { g: add(tween("x", linear), 0) };
  const filtered = async (time) => {
    const view = await runTransform("Filter", scope, { where: [greater("show", 0)] });
    const out = await calculate(view, columns, time, cache);
    const at = await values(out.view.padded().get("g"));
    out.view.dispose(); view.dispose();
    return at;
  };
  await filtered(0);
  scope.update({ x: [100, 110, 120, 130], show: [1, 0, 1, 1] });
  await filtered(0);
  scope.update({ x: [100, 110, 120, 130], show: [1, 1, 1, 1] });
  near(await filtered(500), [50, 60, 70, 80], "row 1 was hidden and moved all the same");
  disposeTransformCache(cache); scope.dispose();

  // Sample: find two seeds whose samples of 2 of 4 rows differ.
  const rows = createDataScope();
  rows.update({ x: [0, 10, 20, 30] });
  const sampleRows = async (seed) => {
    const view = await runTransform("Sample", rows, { size: 2, seed });
    const source = await consume(view.sourceIndices());
    view.dispose();
    return source;
  };
  let a = 1, b = 2, left;
  for (; b < 40; b++) {
    const [first, second] = [await sampleRows(a), await sampleRows(b)];
    left = first.find((row) => !second.includes(row));
    if (left !== undefined) break;
  }
  assert.notEqual(left, undefined, "two seeds with different samples");
  const sampleCache = {};
  const sampled = async (seed, time) => {
    const view = await runTransform("Sample", rows, { size: 2, seed });
    const out = await calculate(view, columns, time, sampleCache);
    const source = await consume(view.sourceIndices());
    out.view.dispose(); view.dispose();
    return Object.fromEntries(source.map((row, i) => [row, out.g[i]]));
  };
  await sampled(a, 0);
  rows.update({ x: [100, 110, 120, 130] });
  await sampled(a, 0); // the rows of sample a start moving at 0
  await sampled(b, 250); // row `left` is out
  const back = await sampled(a, 500); // and back: halfway, not starting over
  assert.ok(Math.abs(back[left] - (left * 10 + 50)) < 1e-3, `row ${left}: ${JSON.stringify(back)}`);
  disposeTransformCache(sampleCache); rows.dispose();
});

test("a keyed table's new version moves each key from its old value", async () => {
  const scope = createDataScope();
  scope.update(table({ id: ["a", "b", "c"], x: [0, 10, 20] }, { key: "id" }));
  const cache = {}, columns = { g: add(tween("x", linear), 0) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  // Rows reordered and c replaced by d: each key goes from its own old value; d rests.
  scope.update(table({ id: ["c", "a", "d"], x: [120, 100, 130] }, { key: "id" }));
  const half = await calculate(scope, columns, 500, cache);
  half.view.dispose();
  // Retargeted at 500 (this run): still at the old values, in the new order.
  near(half.g, [20, 0, 130], "at the retarget");
  const later = await calculate(scope, columns, 1000, cache);
  near(later.g, [70, 50, 130], "halfway to the new values");
  later.view.dispose();
  disposeTransformCache(cache); scope.dispose();
});

test("without a key, a new length matches rows by position and says so", async () => {
  const warnings = [], warn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const scope = createDataScope();
    scope.update({ x: [0, 10] });
    const cache = {}, columns = { g: add(tween("x", linear), 0) };
    (await calculate(scope, columns, 0, cache)).view.dispose();
    scope.update({ x: [100, 110, 120] });
    const out = await calculate(scope, columns, 0, cache);
    out.view.dispose();
    near(out.g, [0, 10, 120], "rows 0 and 1 by position; row 2 rests at its target");
    assert.ok(warnings.some((message) => message.startsWith("tween.positional")), warnings.join("\n"));
    disposeTransformCache(cache); scope.dispose();
  } finally {
    console.warn = warn;
  }
});

test("root and nested tween columns publish current values with private state", async () => {
  const scope = createDataScope();
  scope.update({ x: [0, 10] });
  const cache = {}, columns = { m: mean(tween("x", linear)), h: tween("x", linear), d: multiply(tween("x", linear), 2) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ x: [100, 110] });
  (await calculate(scope, columns, 0, cache)).view.dispose();
  const half = await calculate(scope, columns, 500, cache);
  near(half.m, [55, 55], "mean of the moving values");
  near(half.d, [100, 120], "a nested tween moves its column");
  near(half.h, [50, 60], "ordinary root-column reads return the moving values");
  assert.equal(half.liveUntil, 1000);
  assert.equal(half.view.live, true);
  assert.equal("tweenColumns" in half.view, false, "no private interpolation state is published");
  assert.deepEqual([...half.view.liveColumns].sort(), ["d", "h", "m"]);
  half.view.dispose();
  const landed = await calculate(scope, columns, 1000, cache);
  assert.equal(landed.liveUntil, undefined);
  landed.view.dispose();
  disposeTransformCache(cache); scope.dispose();
});

test("Group, Filter and Bin consume root tween columns through ordinary reads", async () => {
  const scope = createDataScope();
  scope.update({ g: ["a", "a", "b"], x: [0, 10, 20] });
  const cache = {}, columns = { h: tween("x", linear) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ g: ["a", "a", "b"], x: [100, 110, 120] });
  (await calculate(scope, columns, 0, cache)).view.dispose();
  const view = (await calculate(scope, columns, 500, cache)).view;
  const grouped = await runTransform("Group", view, { by: "g", columns: { m: mean("h") } });
  near(await values(grouped.get("m")), [55, 70], "group means of the current values");
  const filtered = await runTransform("Filter", view, { where: [greater("h", 55)] });
  near(await values(filtered.get("h")), [60, 70], "filter of the current values");
  const binned = await runTransform("Bin", view, { x: "h", bins: [0, 65, 130] });
  near(await values(binned.get("count")), [2, 1], "bins of the current values");
  for (const item of [grouped, filtered, binned, view]) item.dispose();
  disposeTransformCache(cache); scope.dispose();
});

test("a Calculate owner schedules only its own producers, while outputs retain upstream liveness", async () => {
  const scope = createDataScope(); scope.update({ x: [0], y: [0] });
  const upstreamCache = {}, localCache = {},
    upstreamColumns = { x: tween("x", linear) },
    localColumns = { y: tween("y", { duration: 100, easing: "linear" }) };
  const run = async (time) => {
    const upstream = await runTransform("Calculate", scope, { columns: upstreamColumns, __viewState: { time } }, { cache: upstreamCache });
    const local = await runTransform("Calculate", upstream, { columns: localColumns, __viewState: { time } }, { cache: localCache });
    upstream.dispose();
    return local;
  };
  (await run(0)).dispose();
  scope.update({ x: [10], y: [10] });
  const moving = await run(0);
  assert.equal(moving.liveUntil, 1000);
  assert.equal(transformProducerDeadline(moving), 100);
  moving.dispose();
  const landed = await run(100);
  assert.equal(landed.liveUntil, 1000);
  assert.equal(transformProducerDeadline(landed), -Infinity);
  near(await values(landed.get("y")), [10], "local producer landed");
  landed.dispose(); disposeTransformCache(upstreamCache); disposeTransformCache(localCache); scope.dispose();
});

test("published tween revisions retain their values when a later frame advances", async () => {
  const scope = createDataScope();
  scope.update({ x: [0, 10] });
  const cache = {}, columns = { x: tween("x", linear) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ x: [100, 110] });
  (await calculate(scope, columns, 0, cache)).view.dispose();
  const early = await calculate(scope, columns, 250, cache);
  const late = await calculate(scope, columns, 750, cache);
  near(await values(early.view.get("x")), [25, 35], "retained earlier frame");
  near(late.x, [75, 85], "later frame");
  early.view.dispose(); late.view.dispose(); disposeTransformCache(cache); scope.dispose();
});

test("a whole categorical channel steps at halfway and keeps its dictionary", async () => {
  const scope = createDataScope();
  scope.update({ group: ["a", "b"] });
  const cache = {}, columns = { group: tween("group", linear) };
  const run = (time) => runTransform("Calculate", scope, { columns, __viewState: { time } }, { cache });
  (await run(0)).dispose();
  scope.update({ group: ["c", "a"] });
  (await run(0)).dispose();
  const before = await run(499), after = await run(500);
  const decode = async (column) => (await values(column.codes)).map((code) => column.categories[code]);
  assert.deepEqual(await decode(before.get("group")), ["a", "b"]);
  assert.deepEqual(await decode(after.get("group")), ["c", "a"]);
  assert.equal(after.metadata("group").type, "categorical");
  before.dispose(); after.dispose(); disposeTransformCache(cache); scope.dispose();
});

test("a nonlinear expression outside a tween reads the interpolated input", async () => {
  const { square } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = createDataScope(); scope.update({ x: [0, 2] });
  const cache = {}, columns = { squared: square(tween("x", linear)) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ x: [10, 12] });
  (await calculate(scope, columns, 0, cache)).view.dispose();
  const half = await calculate(scope, columns, 500, cache);
  near(half.squared, [25, 49], "square of current values rather than interpolation of squares");
  half.view.dispose(); disposeTransformCache(cache); scope.dispose();
});

test("producer facts are shared across frames, inherited by aliases and invalidated by expressions", async () => {
  const { validateLayoutInput } = await import("../../src/lib/plot/utils/layoutInput.js");
  const scope = createDataScope(); scope.update({ x: [0, 4] });
  const cache = {}, columns = { h: tween("x", linear) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ x: [2, 8] });
  const start = (await calculate(scope, columns, 0, cache)).view;
  const first = start.columnFact("h", "finiteNonnegative");
  assert.equal(await first, true);
  const half = (await calculate(scope, columns, 500, cache)).view;
  assert.equal(half.columnFact("h", "finiteNonnegative"), first, "one certificate per producer endpoint revision");
  const alias = await runTransform("Calculate", half, { columns: { copied: "h", changed: multiply("h", -1) } });
  assert.equal(await alias.columnFact("copied", "finiteNonnegative"), true);
  assert.equal(alias.columnFact("changed", "finiteNonnegative"), undefined, "nonlinear/changed output needs its own proof");
  await validateLayoutInput("copied", alias, "nodeWidth", new Map());
  await assert.rejects(validateLayoutInput("changed", alias, "nodeWidth", new Map()), /nonnegative and finite/);
  for (const view of [alias, half, start]) view.dispose();
  // A negative new target cannot receive a safe interval certificate or bypass validation.
  scope.update({ x: [-2, -8] });
  const changed = (await calculate(scope, columns, 1000, cache)).view;
  assert.equal(await changed.columnFact("h", "finiteNonnegative"), false);
  changed.dispose();
  const negative = (await calculate(scope, columns, 2000, cache)).view;
  await assert.rejects(validateLayoutInput("h", negative, "nodeWidth", new Map()), /nonnegative and finite/);
  negative.dispose(); disposeTransformCache(cache); scope.dispose();
});

test("reduced motion establishes the displayed origin for the next retarget", async () => {
  const scope = createDataScope(); scope.update({ x: [0] });
  const cache = {}, columns = { x: tween("x", linear) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ x: [10] });
  const reduced = await runTransform("Calculate", scope, { columns, __viewState: { time: 0, landed: true } }, { cache });
  near(await values(reduced.get("x")), [10], "reduced motion lands");
  assert.equal(reduced.liveUntil, undefined); reduced.dispose();
  scope.update({ x: [20] });
  (await calculate(scope, columns, 0, cache)).view.dispose();
  const next = await calculate(scope, columns, 500, cache);
  near(next.x, [15], "motion resumes from the displayed value");
  next.view.dispose(); disposeTransformCache(cache); scope.dispose();
});

test("vector tween rows retain their keyed slot coordinates", async () => {
  const state = new TweenState(linear), slots = np.array([1, 0], { dtype: np.int32 });
  const a = np.array([[0, 10], [2, 12]]), b = np.array([[10, 20], [12, 22]]);
  try {
    state.retarget(a, slots, 2, 0);
    state.retarget(b, slots, 2, 0);
    near(await consume(state.rowsAt(slots, 500)), [5, 15, 7, 17], "vector rows at halfway");
    state.remap([1, 0], 2);
    near(await consume(state.valuesAt(500)), [5, 15, 7, 17], "vector slots after reordering");
  } finally { state.dispose(); slots.dispose(); a.dispose(); b.dispose(); }
});

test("removed Calculate expressions retire their private tween state", async () => {
  const scope = createDataScope(); scope.update({ x: [1, 2] });
  const cache = {};
  (await calculate(scope, { h: tween("x", linear) }, 0, cache)).view.dispose();
  assert.ok(cache.tweens.size > 0);
  (await calculate(scope, { h: "x" }, 10, cache)).view.dispose();
  assert.equal(cache.tweens.size, 0);
  disposeTransformCache(cache); scope.dispose();
});

test("datetime tween columns keep a stable time origin across source updates", async () => {
  const start = Date.UTC(2026, 0, 1), day = 86400000;
  const scope = createDataScope(); scope.update({ date: [new Date(start), new Date(start + day)] });
  const cache = {}, columns = { date: tween("date", linear) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ date: [new Date(start + day * 2), new Date(start + day * 3)] });
  (await calculate(scope, columns, 0, cache)).view.dispose();
  const half = await calculate(scope, columns, 500, cache);
  assert.equal(half.view.metadata("date").type, "datetime");
  assert.equal(half.view.metadata("date").origin, start);
  assert.deepEqual(half.date.map((value) => value + half.view.metadata("date").origin), [start + day, start + day * 2]);
  half.view.dispose(); disposeTransformCache(cache); scope.dispose();
});

test("a boolean root tween steps and zero duration lands immediately", async () => {
  const scope = createDataScope(); scope.update({ x: [0, 1] });
  const cache = {}, columns = { flag: tween(greater("x", 1), linear) };
  (await calculate(scope, columns, 0, cache)).view.dispose();
  scope.update({ x: [2, 3] });
  (await calculate(scope, columns, 0, cache)).view.dispose();
  const before = await calculate(scope, columns, 499, cache), after = await calculate(scope, columns, 500, cache);
  assert.deepEqual(before.flag.map(Number), [0, 0]); assert.deepEqual(after.flag.map(Number), [1, 1]);
  assert.equal(after.view.metadata("flag").type, "boolean");
  before.view.dispose(); after.view.dispose();
  const instant = await calculate(scope, { x: tween("x", { duration: 0 }) }, 500, cache);
  near(instant.x, [2, 3], "zero-duration producer"); assert.equal(instant.liveUntil, undefined);
  instant.view.dispose(); disposeTransformCache(cache); scope.dispose();
});

test("animation groups match filtered country/year snapshots and reset when the scheme changes", async () => {
  const { equal } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = createDataScope();
  scope.setKey(["country", "year"]);
  scope.update({ country: ["A", "B", "B", "A", "C"], year: [0, 0, 1, 1, 1], x: [0, 10, 30, 20, 50] });
  const cache = {};
  const run = async (year, time, group = "country") => {
    const filtered = await runTransform("Filter", scope, { where: equal("year", year) });
    try {
      const view = await runTransform("Calculate", filtered, {
        columns: { motion: tween("x", linear) }, __animationGroup: group, __viewState: { time },
      }, { cache });
      try { return await values(view.get("motion")); } finally { view.dispose(); }
    } finally { filtered.dispose(); }
  };
  try {
    near(await run(0, 0), [0, 10], "first snapshot");
    near(await run(1, 0), [10, 0, 50], "groups follow countries across source rows; entering C starts at target");
    near(await run(1, 500), [20, 10, 50], "both countries move halfway");
    near(await run(0, 500), [10, 20], "return starts from current country values, exiting C is dropped");
    near(await run(1, 500, ["country", "year"]), [30, 20, 50], "changed scheme resets history");
    assert.deepEqual(await run(2, 600), [], "all groups can leave");
    near(await run(0, 700), [0, 10], "returning from an empty snapshot starts at targets");
    await assert.rejects(runTransform("Calculate", scope, {
      columns: { motion: tween("x", linear) }, __animationGroup: "country",
    }, { cache }), /unique within each tweened snapshot/);
    assert.equal(scope.identity.tokens.length, 5, "Data keys remain full observation identities");
  } finally { disposeTransformCache(cache); scope.dispose(); }
});
