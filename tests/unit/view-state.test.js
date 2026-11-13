import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
// TODO 28 Part A: view state (@time) in transforms, interval(), floor(), round(), and the change
// key that decides when a consumer re-runs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform, resolveTransformParameters, transformDependencies } from "../../src/lib/plot/utils/transforms.js";
import { analyzeDependencies } from "../../src/lib/plot/utils/transforms/dependencies.js";
import * as expressions from "../../src/lib/plot/utils/expressions.js";
import { createProceduralChannels, queueLiveGeometry } from "../../src/lib/plot/utils/proceduralChannels.js";
import { channelDependencyKey, sameDependencyKey, capturePreparationDependencies, changedPreparationChannels } from "../../src/lib/plot/binding/preparationDependencies.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { numpy as np } from "@hmplot/jax";
import {
  viewState, viewStateKey, viewStateReads, sameKey, isViewStateSubtree, hostValue, roundHalfEven,
} from "../../src/lib/plot/utils/viewState.js";

const { col, view, add, subtract, multiply, divide, less, greater, floor, round, interval, sin, where, mean, tween, clip,
  evaluateExpression } = expressions;
const time = view.time;
const data = (value) => {
  const scope = createDataScope();
  scope.update(value);
  return scope;
};
const values = async (array) => Array.from(await (array?.codes ?? array).ref.data());

test("procedural change keys advance only after a still-current applied write", async () => {
  let result = { status: "failed", error: Error("upload") }, writes = 0, follows = 0, complete;
  const expression = divide(time, 1000);
  let entry = { animation: { procedural: { fill: expression } }, channelResults: { fill: { cardinality: "scalar" } }, props: {} };
  let shown = entry;
  const field = { async update() { writes++; return result; } };
  const mark = { fields: new Map([["fill", field]]), connectionFollowers: [() => follows++] };
  const step = createProceduralChannels({ getKind: () => "Points", getMark: () => mark,
    getEntry: () => entry, getShown: () => shown, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail });
  assert.equal(await step(500), false);
  result = { status: "superseded" };
  assert.equal(await step(500), false);
  result = { status: "applied" };
  await step(500);
  assert.equal(await step(500), false);
  assert.equal(writes, 3, "failed and superseded values remain eligible for retry");
  result = new Promise((resolve) => { complete = resolve; });
  const pending = step(1000), old = entry;
  entry = shown = { ...entry };
  complete({ status: "applied" });
  await pending;
  entry = shown = old;
  result = { status: "applied" };
  await step(1000);
  assert.equal(writes, 5, "a replaced frame cannot commit its pending change key");
  assert.equal(follows, 2, "failed, superseded and replaced frames cannot notify downstream connectors");
});

test("a failed procedural position write leaves axis change keys eligible for retry", async () => {
  const scope = data({ x: [0, 1] }), position = np.array([[0, 0], [1, 1]]);
  const entry = { animation: { procedural: { x: divide(time, 1000) } }, markScope: scope, props: { position } };
  let applied = false, writes = 0;
  const field = { async update() { writes++; return { status: applied ? "applied" : "failed" }; } };
  const mark = { fields: new Map([["position", field]]) };
  const step = createProceduralChannels({ getKind: () => "Points", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail });
  try {
    await step(500);
    applied = true;
    await step(500);
    assert.equal(await step(500), false);
    assert.equal(writes, 2);
  } finally { position.dispose(); scope.dispose(); }
});

test("live producer publications update shared render fields without another clock", async () => {
  const initial = data({ x: [0, 1], y: [2, 3] }), next = data({ x: [10, 11], y: [2, 3] });
  initial.liveColumns = next.liveColumns = new Set(["x"]);
  const position = np.array([[0, 2, 0], [1, 3, 0]]);
  const entry = { animation: { procedural: {}, liveChannels: { x: "x" } }, markScope: initial, props: { position } };
  const drawn = [];
  const mark = { fields: new Map([["position", { async update(array) {
    drawn.push(await array.ref.js()); return { status: "applied" };
  } }]]) };
  const step = createProceduralChannels({ getKind: () => "Points", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail });
  try {
    assert.equal(await step(500), false, "the consumer does not clock upstream producers");
    assert.equal(await step(500, { scope: next, channels: entry.animation.liveChannels }), true);
    assert.deepEqual(drawn, [[[10, 2, 0], [11, 3, 0]]]);
  } finally { position.dispose(); initial.dispose(); next.dispose(); }
});

test("aliased live geometry channels release each acquired source reference", async () => {
  const value = np.array([3, 4], { dtype: np.float32 }), position = np.zeros([2, 3]);
  const scope = { length: 2, has: name => name === "v", get: () => value,
    liveColumns: new Set(["v"]) };
  const entry = { animation: { procedural: {} }, markScope: scope, props: { position } };
  let status = "applied";
  const mark = { fields: new Map([["position", { async update(array) {
    assert.deepEqual(await array.ref.js(), [[3, 3, 0], [4, 4, 0]]);
    return { status };
  } }]]) };
  const step = createProceduralChannels({ getKind: () => "Points", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail });
  try {
    for (status of ["applied", "superseded", "applied"]) {
      assert.equal(await step(500, { scope, channels: { x: "v", y: "v" } }), status === "applied");
      assert.equal(value.refCount, 1, "each alias acquired its own reference, including skipped writes");
    }
  } finally {
    position.dispose();
    while (value.refCount > 0) value.dispose();
  }
});

test("rectangle bound producers update both vector corners with coherent validation", async () => {
  const scope = data({ lo: [2, 7], hi: [5, 4] }); scope.liveColumns = new Set(["lo", "hi"]);
  const position = np.array([[0, 1, 0], [0, 2, 0]]), extent = np.array([[1, 4, 0], [1, 5, 0]]);
  const entry = { kind: "Rect", animation: { procedural: {}, liveChannels: { x0: "lo", x1: "hi" } },
    markScope: scope, props: { position, extent } };
  const drawn = {};
  const mark = { fields: new Map(["position", "extent"].map((name) => [name, { async update(array) {
    drawn[name] = await array.ref.js(); return { status: "applied" };
  } }])) };
  const step = createProceduralChannels({ getKind: () => "Rect", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail });
  try {
    await step(500, { scope, channels: entry.animation.liveChannels });
    assert.deepEqual(drawn.position[0], [2, 1, 0]); assert.deepEqual(drawn.extent[0], [5, 4, 0]);
    assert.ok(drawn.position[1].every(Number.isNaN)); assert.ok(drawn.extent[1].every(Number.isNaN));
  } finally { position.dispose(); extent.dispose(); scope.dispose(); }
});

test("live writes reject superseded publications and teardown before notifying consumers", async () => {
  const scope = data({ x: [1, 2] }); scope.liveColumns = new Set(["x"]);
  const position = np.array([[0, 0, 0], [0, 0, 0]]), pending = [];
  const entry = { animation: { procedural: {}, liveChannels: { x: "x" } }, markScope: scope, props: { position } };
  let follows = 0;
  const mark = { fields: new Map([["position", { update() { return new Promise(resolve => pending.push(resolve)); } }]]),
    connectionFollowers: [() => follows++] };
  const step = createProceduralChannels({ getKind: () => "Points", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail });
  const run = () => step(500, { scope, channels: entry.animation.liveChannels });
  try {
    const old = run(), newest = run();
    pending[1]({ status: "applied" }); assert.equal(await newest, true);
    pending[0]({ status: "superseded" }); assert.equal(await old, false);
    const removed = run(); mark.isDisposed = true;
    pending[2]({ status: "applied" }); assert.equal(await removed, false);
    assert.equal(follows, 1, "only the current successfully applied revision reaches consumers");
  } finally { position.dispose(); scope.dispose(); }
});

test("current Text opacity writes reuse evaluation and preserve position fields", async () => {
  const scope = data({ x: [2, 4], visible: [1, 0] });
  const position = np.array([[2, 0, 0], [4, 0, 0]]), opacity = np.ones([2]);
  const entry = { animation: { procedural: {} }, expressionOpacity: opacity, props: { position }, markScope: scope };
  let writes = 0, published;
  const mark = { fields: new Map([["interactionOpacity", { async update(array) {
    writes++; assert.deepEqual(await values(array), [1, 0]); return { status: "applied" };
  } }]]) };
  const step = createProceduralChannels({ getKind: () => "Text", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail,
    afterWrites: ({ updatedProps }) => { published = updatedProps.interactionOpacity.ref; } });
  try {
    assert.equal(await step(325, { scope, channels: { opacity: "visible" } }), true);
    assert.equal(writes, 1); assert.equal(entry.props.position, position);
    assert.deepEqual(await values(published), [1, 0]);
  } finally { published?.dispose(); opacity.dispose(); position.dispose(); scope.dispose(); }
});

test("current geometry reuse captures only consumed static columns and interaction versions", () => {
  const source = data({ id: [0, 1], group: ["a", "b"] });
  const arrays = [np.array([0, 0]), np.array([1, 1]), np.array([10, 10]), np.array([20, 20])];
  const first = createDataView(source, { columns: { moving: arrays[0], unused: arrays[1] } });
  const next = createDataView(source, { columns: { moving: arrays[2], unused: arrays[3] } });
  const channels = { y: "moving" }, props = { x: "id", y: "moving", fill: "group", opacity: where(view.selected, 0.2, 1) };
  try {
    const key = channelDependencyKey(props, first, channels);
    assert.ok(key);
    assert.equal(sameDependencyKey(key, channelDependencyKey(props, next, channels)), true,
      "new numeric geometry and an unrelated column need no new paint preparation");
    source.identity.selection.replace(source.identity, [0]);
    assert.equal(sameDependencyKey(key, channelDependencyKey(props, next, channels)), false,
      "a changed interaction target must take ordinary preparation");
    const selected = channelDependencyKey(props, next, channels);
    source.update({ id: [0, 1], group: ["b", "a"] });
    assert.equal(sameDependencyKey(selected, channelDependencyKey(props, next, channels)), false);
    assert.equal(channelDependencyKey({ x: "id", y: "moving", fill: ["red", "blue"] }, next, channels), null);
    assert.equal(channelDependencyKey({ x: "id", y: "moving", opacity: divide(time, 1000) }, next, channels), null);
    const name = np.array([0, 1]);
    const dictionary = { codes: name, categories: ["a", "b"] }, own = { version: 1, length: 2,
      has: field => field === "name", get: () => dictionary, metadata: () => undefined };
    const before = channelDependencyKey({ text: "name" }, own);
    dictionary.categories[0] = "changed"; own.version++;
    assert.equal(sameDependencyKey(before, channelDependencyKey({ text: "name" }, own)), false,
      "immutable dictionary codes do not certify mutable category labels");
    name.dispose();
  } finally { first.dispose(); next.dispose(); arrays.forEach(array => array.dispose()); source.dispose(); }
});

test("preparation dependencies distinguish geometry, footprints, labels and reduction paint", () => {
  const source = data({ name: ["one", "two"], id: [0, 1] });
  const x = np.array([0, 1]), moved = np.array([2, 3]);
  const first = createDataView(source, { columns: { x }, live: true });
  const next = createDataView(source, { columns: { x: moved }, live: true });
  const props = { x: "x", y: 0, text: "name", size: 12, opacity: where(greater(col.x, mean(col.x)), 1, 0) };
  try {
    const before = capturePreparationDependencies(props, first), after = capturePreparationDependencies(props, next);
    assert.deepEqual(Object.keys(changedPreparationChannels(before, after, props)), ["x", "opacity"]);
    assert.deepEqual(Object.keys(changedPreparationChannels(after, capturePreparationDependencies(props, next), props)), []);
    source.update({ name: ["changed", "two"], id: [0, 1] });
    assert.ok("text" in changedPreparationChannels(after, capturePreparationDependencies(props, next), props));
    assert.equal(changedPreparationChannels(before, capturePreparationDependencies({ ...props, text: ["a", "b"] }, next), props), null,
      "unversioned mutable text takes complete validation");
  } finally { first.dispose(); next.dispose(); x.dispose(); moved.dispose(); source.dispose(); }
});

test("live geometry serializes complete batches and drops queued obsolete snapshots", async () => {
  const entry = {}, calls = [], releases = [], held = [], pending = [];
  const run = order => {
    held.push(order);
    return queueLiveGeometry(entry, order, async () => {
      calls.push(order);
      await new Promise(resolve => pending.push(resolve));
      return true;
    }).finally(() => releases.push(order));
  };
  const first = run(1);
  await Promise.resolve(); await Promise.resolve();
  const obsolete = run(2), latest = run(3);
  assert.deepEqual(calls, [1]);
  pending.shift()(); assert.equal(await first, true);
  assert.equal(await obsolete, false);
  await Promise.resolve();
  assert.deepEqual(calls, [1, 3]);
  pending.shift()(); assert.equal(await latest, true);
  assert.deepEqual(releases.sort(), held, "both applied and skipped publications release their caller lease");
});

test("automatic domains only receive a complete accepted rectangle geometry batch", async () => {
  const scope = data({ lo: [2], hi: [5] });
  const entry = { kind: "Rect", animation: { procedural: {} }, markScope: scope,
    props: { x0: 0, x1: 1, y0: 1, y1: 4 } };
  let extentApplied = false, accepted = true, domains = 0;
  const mark = { fields: new Map(["position", "extent"].map(name => [name, { update: async () =>
    ({ status: name === "position" || extentApplied ? "applied" : "superseded" }) }])) };
  const step = createProceduralChannels({ getKind: () => "Rect", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail,
    afterWrites: async ({ props, acceptWrites }) => {
      assert.deepEqual(await props.position.ref.js(), [[2, 1, 0]]);
      assert.deepEqual(await props.extent.ref.js(), [[5, 4, 0]]);
      if (acceptWrites()) domains++;
    } });
  const run = () => step(500, { scope, channels: { x0: "lo", x1: "hi" }, acceptWrites: () => accepted });
  try {
    assert.equal(await run(), false); assert.equal(domains, 0, "one updated corner cannot set bounds");
    extentApplied = true; accepted = false;
    await run(); assert.equal(domains, 0, "an obsolete batch cannot set bounds");
    accepted = true; assert.equal(await run(), true); assert.equal(domains, 1);
  } finally { scope.dispose(); }
});

test("partial raw rectangle updates recover invalid bounds without losing borrowed static corners", async () => {
  const scope = data({ hi: [6, 9] }), x0 = np.array([0, 10]), y0 = np.array([1, 2]);
  const entry = { kind: "Rect", animation: { procedural: {} }, markScope: scope,
    props: { x0, x1: -1, y0, y1: 4 } };
  const drawn = {};
  const mark = { fields: new Map(["position", "extent"].map(name => [name, { async update(array) {
    drawn[name] = await array.ref.js(); return { status: "applied" };
  } }])) };
  const step = createProceduralChannels({ getKind: () => "Rect", getMark: () => mark,
    getEntry: () => entry, getShown: () => entry, pointerNow: () => null, visibleNow: () => null,
    tweenOptions: () => ({}), invalidate: assert.fail, report: assert.fail, landed: assert.fail });
  const run = () => step(500, { scope, channels: { x1: "hi" } });
  try {
    assert.equal(await run(), true);
    assert.deepEqual(drawn.position[0], [0, 1, 0]); assert.deepEqual(drawn.extent[0], [6, 4, 0]);
    assert.ok(drawn.position[1].every(Number.isNaN)); assert.ok(drawn.extent[1].every(Number.isNaN));
    scope.update({ hi: [8, 12] });
    assert.equal(await run(), true);
    assert.deepEqual(drawn.position, [[0, 1, 0], [10, 2, 0]]);
    assert.deepEqual(drawn.extent, [[8, 4, 0], [12, 4, 0]]);
    assert.equal(x0.refCount, 1); assert.equal(y0.refCount, 1, "unchanged input arrays remain borrowed");
    entry.props.rotation = NaN;
    await run();
    assert.ok(drawn.position.flat().every(Number.isNaN), "the final shared validator still rejects invalid rotation");
  } finally { x0.dispose(); y0.dispose(); scope.dispose(); }
});

test("unbroadcast channels preserve host, device scalar and row results with their dependencies", async () => {
  const scope = data({ x: [2, 4, 6] });
  const results = [];
  const evaluate = (expression) => {
    const result = evaluateExpression(expression, scope, { broadcast: false, time: 1000 });
    results.push(result);
    return result;
  };
  try {
    const constant = evaluate(divide(3, 4));
    assert.equal(constant.value, 0.75);
    assert.equal(constant.representation, "host-scalar");
    const boolean = evaluate(less(3, 4));
    assert.equal(boolean.value, 1);
    assert.equal(boolean.metadata.type, "boolean", 'cardinality must not erase categorical meaning');
    const clock = evaluate(divide(time, 2000));
    assert.equal(clock.value, 0.5);
    assert.equal(clock.cardinality, "scalar");
    assert.equal(clock.dependencies.membership, false);
    const reduction = evaluate(mean("x"));
    assert.equal(reduction.representation, "device-scalar");
    assert.deepEqual(reduction.value.shape, []);
    assert.equal(reduction.dependencies.membership, true);
    assert.deepEqual(await values(reduction.value), [4]);
    const rows = evaluate(add("x", 1));
    assert.equal(rows.cardinality, "rows");
    assert.deepEqual(await values(rows.value), [3, 5, 7]);
    const broadcast = evaluateExpression(divide(time, 2000), scope, { time: 1000 });
    results.push(broadcast);
    assert.deepEqual(await values(broadcast.value), [0.5, 0.5, 0.5]);
  } finally {
    results.forEach((result) => result.dispose());
    scope.dispose();
  }
});

test("a view-state subtree reads view state and no data", () => {
  assert.ok(isViewStateSubtree(time));
  assert.ok(isViewStateSubtree("@time"));
  assert.ok(isViewStateSubtree(floor(divide("@time", 1000))));
  assert.ok(isViewStateSubtree(interval(subtract(time, 250), 500)));
  assert.ok(isViewStateSubtree(where(greater(time, 1000), 1, 0)));
  assert.ok(!isViewStateSubtree(divide(3, 4)), "no view state read");
  assert.ok(!isViewStateSubtree(add("x", time)), "a data column");
  assert.ok(!isViewStateSubtree(mean(time)), "a reduction");
  assert.ok(!isViewStateSubtree(tween(time)), "a tween (Part B)");
});

test("reads are live outside interval() and stepped inside it", () => {
  assert.deepEqual(viewStateReads(add("x", time)), { live: true, stepped: false, tracked: false });
  assert.deepEqual(viewStateReads(add("x", interval(time, 500))), { live: false, stepped: true, tracked: false });
  assert.deepEqual(viewStateReads(add(interval("x", 500), "@time")), { live: true, stepped: false, tracked: false });
  assert.deepEqual(viewStateReads(add("x", 1)), { live: false, stepped: false, tracked: false });
  // The pointer and the visible domain change with the pointer and the view, not the clock.
  assert.deepEqual(viewStateReads(add("x", "@pointer_x")), { live: false, stepped: false, tracked: true });
  assert.deepEqual(viewStateReads(view.view_y_max), { live: false, stepped: false, tracked: true });
});

test("the host evaluator follows numpy: truth, NaN, rounding half to even", () => {
  const at = viewState({ time: 2500 });
  assert.equal(hostValue(floor(divide(time, 1000)), at), 2);
  assert.equal(hostValue(round(divide(time, 1000)), at), 2, "2.5 rounds to 2");
  assert.equal(hostValue(round(divide(time, 1000)), viewState({ time: 3500 })), 4, "3.5 rounds to 4");
  assert.equal(hostValue(where(greater(time, 1000), 7, 9), at), 7);
  assert.equal(hostValue(clip(time, 0, 1000), at), 1000);
  assert.equal(hostValue(interval(time, 1000), viewState({ time: 2999 })), 2000);
  // The outer interval steps what the inner one reads: 1299 -> 1200 -> 1000.
  assert.equal(hostValue(interval(interval(time, 500), 300), viewState({ time: 1299 })), 1000);
  assert.equal(hostValue(expressions.logical_and(divide(0, 0), 1), at), true, "NaN is true, as in numpy");
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, -2.5, 2.4, 2.6].map(roundHalfEven), [0, 2, 2, -0, -2, 2, 3]);
});

test("the change key moves only when a value the consumer reads moves", () => {
  const key = (expression, t) => viewStateKey([expression], viewState({ time: t }));
  // One key entry per maximal view-state subtree; data columns contribute nothing.
  assert.deepEqual(key(less("x", subtract(time, 1000)), 1500), [500]);
  assert.deepEqual(key(add("x", 1), 1500), []);
  const seconds = less("x", floor(divide(time, 1000)));
  assert.ok(sameKey(key(seconds, 1000), key(seconds, 1999)), "within a second");
  assert.ok(!sameKey(key(seconds, 1999), key(seconds, 2000)), "across a second");
  const stepped = add("x", interval(add(time, "x"), 500));
  assert.deepEqual(key(stepped, 1234), [1000], "@time inside the interval reads the step");
  assert.ok(sameKey(key(stepped, 1000), key(stepped, 1499)));
  assert.ok(!sameKey(key(stepped, 1499), key(stepped, 1500)));
});

test("a transform lists the expressions it evaluates", () => {
  const expressionsOf = (kind, settings) => analyzeDependencies(transformDependencies(kind, settings)).expressions;
  const where = [less("t", time), { field: "x", op: "gt", value: 1 }];
  assert.deepEqual(expressionsOf("Filter", { where }), [where[0]]);
  const columns = { a: add("x", time), b: "x" };
  assert.deepEqual(expressionsOf("Calculate", { columns }), [columns.a]);
  const bins = floor(divide(time, 1000));
  assert.deepEqual(expressionsOf("Bin", { bins: { x: bins, y: 5 } }), [bins]);
  // A kind without a declaration: its expression-valued parameters.
  assert.deepEqual(expressionsOf("Density", { bandwidth: bins, resolution: 64 }), [bins]);
});

test("view-state subtrees are computed on the host and broadcast", async () => {
  const scope = data({ x: [1, 2, 3] });
  const evaluated = evaluateExpression(add("x", floor(divide("@time", 1000))), scope, { time: 2500 });
  assert.deepEqual(await values(evaluated.value), [3, 4, 5]);
  evaluated.dispose();
  // @time inside an interval reads the step; the data column inside it applies at once.
  const stepped = evaluateExpression(interval(add("x", time), 500), scope, { viewState: viewState({ time: 1234 }) });
  assert.deepEqual(await values(stepped.value), [1001, 1002, 1003]);
  stepped.dispose();
  const alone = evaluateExpression(time, scope, { time: 42 });
  assert.deepEqual(await values(alone.value), [42, 42, 42]);
  alone.dispose();
  scope.dispose();
});

test("floor and round agree between the GPU and the host", async () => {
  const xs = [0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 2.4, 2.6, -0.2, 7];
  const scope = data({ x: xs });
  for (const [op, host] of [[floor, Math.floor], [round, roundHalfEven]]) {
    const evaluated = evaluateExpression(op("x"), scope);
    assert.deepEqual((await values(evaluated.value)).map((v) => v + 0), xs.map((v) => host(v) + 0), op.name);
    evaluated.dispose();
  }
  scope.dispose();
});

test("Calculate and Filter read @time from the view state in their config", async () => {
  const scope = data({ t: [0, 1000, 2000, 3000] });
  const calculated = await runTransform("Calculate", scope, {
    columns: { age: subtract("@time", "t"), second: floor(divide(time, 1000)) },
    __viewState: { time: 2500, live: true },
  });
  assert.deepEqual(await values(calculated.get("age")), [2500, 1500, 500, -500]);
  assert.deepEqual(await values(calculated.get("second")), [2, 2, 2, 2]);
  assert.equal(calculated.live, true, "a live read makes the output live");
  calculated.dispose();
  const filtered = await runTransform("Filter", scope, { where: [less("t", time)], __viewState: { time: 1500, live: true } });
  assert.equal(filtered.length, 2);
  assert.equal(filtered.live, true);
  const below = await runTransform("Calculate", filtered, { columns: { u: multiply("t", 2) } });
  assert.equal(below.live, true, "views under a live view are live");
  below.dispose();
  filtered.dispose();
  const stepped = await runTransform("Filter", scope, { where: [less("t", interval(time, 1000))], __viewState: { time: 1500, live: false } });
  assert.equal(stepped.length, 1, "the interval reads 1000");
  assert.equal(stepped.live, false, "an interval step is an ordinary data change");
  stepped.dispose();
  scope.dispose();
});

test("expression parameters read @time", async () => {
  const scope = data({ x: [1, 2, 3] });
  const resolved = await resolveTransformParameters("Bin", { bins: add(2, floor(divide(time, 1000))), __viewState: { time: 3200 } }, scope);
  assert.equal(resolved.bins, 5);
  scope.dispose();
});

test("reading @time with no view state is an error", async () => {
  const scope = data({ t: [0, 1] });
  await assert.rejects(runTransform("Calculate", scope, { columns: { a: add("t", time) } }), /@time and @pointer_\* are not available here/);
  scope.dispose();
});

test("a data column named @time is rejected: expressions read the view's", () => {
  assert.throws(() => data({ "@time": [1, 2] }), /names starting with @ are reserved for state/);
});

test("interval() checks its period, and decodes from a Python descriptor", async () => {
  assert.throws(() => interval(time, 0), /at least 1/);
  assert.throws(() => interval(time, "500"), /period in milliseconds/);
  assert.equal(expressions.expressionText(interval(time, 500)), "interval(@time, 500)");
  const { SceneResources } = await import("../../src/lib/scene/resources.js");
  const decoded = new SceneResources().resolve(
    { $expression: { op: "interval", args: [{ $expression: { op: "column", args: ["@time"] } }, { $expression_options: { period: 500 } }] } },
    () => { throw Error("no references here"); });
  assert.equal(hostValue(decoded, viewState({ time: 1499 })), 1000);
  assert.throws(() => new SceneResources().resolve(
    { $expression: { op: "interval", args: ["@time", { $expression_options: { period: -1 } }] } }, () => {}), /at least 1/);
});

test("every Python operator has a JS operator of the same name", () => {
  const source = readFileSync(new URL("../../python/hmplot/expressions.py", import.meta.url), "utf8");
  const names = source.match(/_NAMES = "(.*?)"\.split\(\)/)[1].split(" ");
  const stub = readFileSync(new URL("../../python/hmplot/expressions.pyi", import.meta.url), "utf8");
  const index = readFileSync(new URL("../../src/lib/index.ts", import.meta.url), "utf8");
  const packageStub = readFileSync(new URL("../../python/hmplot/__init__.pyi", import.meta.url), "utf8");
  // offset and moved (TODO 38) take one column name, in both languages.
  for (const name of ["offset", "moved"]) assert.match(source, new RegExp(`^def ${name}\\(column\\):`, "m"));
  // Calendar functions (TODO 53.1) take a column and options, as time_floor its interval.
  const calendar = source.match(/_CALENDAR = "(.*?)"\.split\(\)/)[1].split(" ");
  // Casts (R2.0) take a value and options.
  const casts = source.match(/_CASTS = "(.*?)"\.split\(\)/)[1].split(" ");
  for (const name of [...names, ...calendar, ...casts, "is_in", "tween", "interval", "offset", "moved", "time_floor"]) {
    assert.equal(typeof expressions[name], "function", `expressions.js exports ${name}`);
    assert.match(index, new RegExp(`\\b${name}\\b`), `index.ts exports ${name}`);
    assert.ok(stub.includes(`def ${name}(`), `expressions.pyi declares ${name}`);
    assert.ok(packageStub.includes(`${name} as ${name}`), `__init__.pyi re-exports ${name}`);
    if (calendar.includes(name) || casts.includes(name) || name === "time_floor")
      assert.equal(expressions[name]("x", ...(name === "time_floor" ? ["1 day"] : [])).op, name);
    else if (name !== "is_in" && name !== "tween" && name !== "interval") {
      const built = expressions[name]("x", "y", "z");
      assert.equal(built.op, name);
    }
  }
  assert.match(source, /_BUILTIN_NAMES = \("min", "max", "sum", "round", "any", "all"\)/);
});

test("np.logicalAnd takes a bool column beside a float view-state value", async () => {
  // Hoisted values are float32 buffers; comparisons produce bool columns.
  const scope = data({ x: [1, 5, 9] });
  const evaluated = evaluateExpression(expressions.logical_and(greater("x", 2), greater(time, 100)), scope, { time: 200 });
  assert.deepEqual((await values(evaluated.value)).map(Boolean), [false, true, true]);
  evaluated.dispose();
  scope.dispose();
});

// TODO 41: inputs are read by name and replaced by their values before a consumer sees its props.
import { input, inputRead, resolveInputs, initialValue, foldConstants } from "../../src/lib/plot/utils/inputs.js";
import { isLiteral } from "../../src/lib/plot/utils/categorical.js";

test("input reads are replaced by the inputs' values, and only where they read", () => {
  const { col, greater, equal, is_in } = expressions;
  const values = { k: 0.5, metric: "sine", chosen: ["a", "b"] };
  const store = { read(name, where) {
    if (!(name in values)) throw Error(`${where} reads $${name}, but no input named "${name}" is here.`);
    return values[name];
  } };
  const props = resolveInputs({
    x: "$metric", title: "$metric", bins: input("k"),
    where: greater(col("a"), input("k")), keep: is_in(col("s"), input("chosen")),
  }, store, "Mark", (key) => key === "x");
  // A whole property takes the value: a string input in x names a column.
  assert.equal(props.x, "sine");
  // "$name" reads only where a string names a column; a title stays literal.
  assert.equal(props.title, "$metric");
  assert.equal(props.bins, 0.5);
  // Inside an expression the value is a constant; a list is is_in's values.
  assert.equal(props.where.args[1], 0.5);
  assert.deepEqual(props.keep.args[1].values, ["a", "b"]);
  // A string input inside an expression is a constant, not a column name.
  const named = resolveInputs({ where: equal(col("species"), input("metric")) }, store, "Filter");
  assert.ok(isLiteral(named.where.args[1]) && named.where.args[1].value === "sine");
  // Nothing reads: the same object back, so a consumer sees no change.
  const plain = { x: "a", where: greater(col("a"), 1) };
  assert.equal(resolveInputs(plain, store, "Mark", () => true), plain);
  // An unknown name, and a read with no input context, name the property.
  assert.throws(() => resolveInputs({ y: input("nope") }, store, "Line"), /Line\.y reads \$nope/);
  assert.throws(() => resolveInputs({ y: input("k") }, null, "Line"), /Line\.y reads \$k, but there is no input context/);
  assert.equal(inputRead("$k", true), "k");
  assert.equal(inputRead("$k"), null);
  assert.throws(() => input("not a name"), /an identifier/);
});

// TODO 69.10: a plain-valued prop given as an expression of inputs (a Python scene's Frame
// placement, a Force's dimensions) is evaluated on the host once the reads are replaced.
test("expressions of inputs fold to values where a prop takes a plain value", async () => {
  const { col, cos, equal } = expressions;
  const { literal } = await import("../../src/lib/plot/utils/categorical.js");
  const store = { read: (name) => ({ day: 29, view: "3d", start: new Date(Date.UTC(2000, 0, 2)) })[name] };
  const props = resolveInputs({
    placement: { anchor: [multiply(8, cos(divide(input("day"), 58))), 0, 1], size: [1, 1, 1] },
    dimensions: where(equal(input("view"), literal("3d")), 3, 2),
    days: divide(subtract(input("start"), Date.UTC(2000, 0, 1)), 86400000),
    fill: add(col("x"), input("day")),
  }, store, "Frame");
  const folded = Object.fromEntries(Object.entries(props).map(([name, value]) => [name, foldConstants(value)]));
  assert.ok(Math.abs(folded.placement.anchor[0] - 8 * Math.cos(0.5)) < 1e-12);
  assert.deepEqual(folded.placement.anchor.slice(1), [0, 1]);
  assert.equal(folded.dimensions, 3);
  assert.equal(folded.days, 1, "a Date input's value subtracts as its time");
  // An expression that reads a column stays one; a value with nothing to fold is the same object.
  assert.equal(folded.fill, props.fill);
  const plain = { anchor: [1, 2, 3], size: [1, 1, 1] };
  assert.equal(foldConstants(plain), plain);
});

// R2.0: a column, an input and state are nodes of their own, each with an exact accessor and a
// string shorthand (":x", "$bins", "@time"); plain strings in expressions are columns.
test("names in a column's place: col, input and view, and their strings", async () => {
  const { mean, expressionFields } = expressions;
  const { settingNames, placeName } = await import("../../src/lib/plot/utils/names.js");
  // Called or read by property; `then` stays undefined, so await does not take col for a promise.
  assert.deepEqual([col.weight, col["$price"].args, input.bins.op, view.time.op], [col("weight"), ["$price"], "input", "state"]);
  // A snapshot's descriptor (Python's hm.view.time) comes back as the same node.
  assert.deepEqual(expressions.expressionFromDescriptor({ $expression: { op: "state", args: ["time"] } }), view.time);
  assert.equal(col.then, undefined);
  assert.equal(await col, col);
  // col("$price") reads the column $price, never the input price.
  const scope = data({ $price: [1, 2], g: ["a", "b"] });
  const prices = evaluateExpression(add(col("$price"), 1), scope);
  try {
    assert.deepEqual(await values(prices.value), [2, 3]);
    assert.equal(inputRead(col("$price")), null);
    // @ names state: col() refuses it, and view is a closed set that lists its names.
    assert.throws(() => col("@time"), /cannot start with @, which names state: use view\.time/);
    assert.throws(() => view.selcted, /no state named "selcted"\. State names are selected, brushed/);
    // Another "@" name is an Interaction's column (TODO 64), missing here.
    assert.throws(() => evaluateExpression(add("@nope", 1), scope), /no state or Interaction column named "@nope"/);
    const clock = evaluateExpression(add(view.time, "@time"), scope, { time: 2, broadcast: false });
    try { assert.equal(clock.value, 4); } finally { clock.dispose(); }
    assert.deepEqual([...expressionFields(add(view.brushed, ":g"))], ["@brushed", "g"]);
    // In a column's place: ":g" must be a column, view.brushed is "@brushed", "@focus" an
    // Interaction's column (checked where it is read), and "@1" no name at all.
    const placed = resolveInputs({ x: ":g", fill: view.brushed, title: ":g", size: "@focus" }, null, "Mark", (key) => key !== "title");
    assert.deepEqual([placed.x, placed.fill, placed.title, placed.size], [col("g"), "@brushed", ":g", "@focus"]);
    assert.throws(() => placeName("@1", "Mark.fill"), /Mark\.fill: there is no state named "1"/);
    // Accessors wherever a column name goes: a transform's by, a reducer's field, a reduction's by.
    assert.deepEqual(settingNames({ by: [col.g, "h"], reduce: { n: { op: "sum", field: col.v } }, bins: col.n }, { bins: "integer" }),
      { by: ["g", "h"], reduce: { n: { op: "sum", field: "v" } }, bins: col.n });
    assert.equal(mean("$price", { by: col.g }).args[1].by, "g");
    assert.throws(() => evaluateExpression(add("$bins", 1), scope), /\$bins reads an input, but there is no input context/);
  } finally {
    prices.dispose();
    scope.dispose();
  }
});

test("each input's value before the viewer sets it", () => {
  assert.equal(initialValue("Slider", { min: 4 }), 4);
  assert.equal(initialValue("Slider", { min: 4, value: 9 }), 9);
  assert.equal(initialValue("Checkbox"), false);
  assert.equal(initialValue("Button"), 0);
  assert.equal(initialValue("Select", { options: ["a", "b"] }), "a");
  assert.equal(initialValue("Select", { options: { First: 1, Second: 2 } }), 1);
  assert.deepEqual(initialValue("Select", { multiple: true, options: ["a"] }), []);
});

test("an input's props read from the data: columns, categories and a single value", async () => {
  // TODO 41.2: options={categories("species")}, options={columnNames()}, min={min("x")}.
  const { scopeValue, categories, columnNames, pendingInitial } = await import("../../src/lib/plot/utils/inputs.js");
  const { min, max, col } = expressions;
  const scope = createDataScope();
  scope.update({ x: new Float32Array([3, -1, 2]), species: ["b", "a", "b"] });
  try {
    assert.deepEqual(await scopeValue(columnNames(), scope, "Select.options"), ["x", "species"]);
    assert.deepEqual(await scopeValue(categories("species"), scope, "Select.options"), ["b", "a"]);
    assert.equal(await scopeValue(min("x"), scope, "Slider.min"), -1);
    assert.equal(await scopeValue(max("x"), scope, "Slider.max"), 3);
    await assert.rejects(scopeValue(categories("x"), scope, "Select.options"), /needs a categorical column; x is numeric/);
    await assert.rejects(scopeValue(col("x"), scope, "Slider.min"), /must be a single value/);
  } finally {
    scope.dispose();
  }
  // Its first value waits for the data when it (or the default it takes) reads the data.
  assert.equal(pendingInitial("Slider", { min: min("x") }), true);
  assert.equal(pendingInitial("Slider", { min: min("x"), value: 1 }), false);
  assert.equal(pendingInitial("Select", { options: categories("species") }), true);
  assert.equal(pendingInitial("Slider", { min: 0 }), false);
});

test("pointer columns: the pointer in the frame's data, missing off it, a category on a band axis (TODO 45)", async () => {
  const { equal, is_missing } = expressions;
  const { literal } = await import("../../src/lib/plot/utils/categorical.js");
  const over = viewState({ time: 5, pointer: { x: 3, y: 12 } }), off = viewState({ time: 5, pointer: { x: NaN, y: NaN } });
  assert.equal(hostValue(add("@pointer_x", 1), over), 4);
  assert.equal(hostValue(is_missing("@pointer_y"), off), true);
  assert.equal(hostValue(view.pointer_x, viewState({ time: 0 })), NaN, "no pointer: missing");
  assert.deepEqual(viewStateKey([add("x", "@pointer_x")], over), [3]);
  const visible = viewState({ visible: { x: [0, 10], y: [-5, 5] } });
  assert.deepEqual(["@view_x_min", "@view_x_max", "@view_y_min", "@view_y_max"].map((name) => hostValue(view(name.slice(1)), visible)), [0, 10, -5, 5]);
  // A category under the pointer matches a categorical column by value, on the GPU and the host.
  const scope = data({ species: ["Adelie", "Gentoo", "Adelie"], v: [1, 2, 3] });
  const onBand = viewState({ pointer: { x: "Adelie", y: 2 } });
  const pointer = evaluateExpression(view.pointer_x, scope, { viewState: onBand, broadcast: false });
  try {
    assert.equal(pointer.category, "Adelie", "the scalar category is its name, not a boolean flag");
    assert.equal(pointer.cardinality, "scalar");
    assert.equal(pointer.representation, "host-scalar");
  } finally { pointer.dispose(); }
  const result = evaluateExpression(equal("species", "@pointer_x"), scope, { viewState: onBand });
  assert.deepEqual((await values(result.value)).map(Boolean), [true, false, true]);
  result.dispose();
  assert.ok(isViewStateSubtree(equal("@pointer_x", literal("Adelie"))));
  assert.equal(hostValue(equal("@pointer_x", literal("Adelie")), onBand), true);
  scope.dispose();
});

test("the pointer tracker converts only for frames that are read, once per move, and tells readers per frame", async () => {
  const { createPointerTracker } = await import("../../src/lib/plot/utils/pointerTracker.js");
  const conversions = [], frames = [];
  const tracker = createPointerTracker({
    convert: (point, frame) => { conversions.push(frame.name); return { x: point[0] / 10, y: frame.name === "inset" ? NaN : point[1] }; },
    schedule: (update) => frames.push(update),
  });
  const root = { name: "root" }, inset = { name: "inset" };
  tracker.move([30, 5]);
  assert.equal(frames.length, 0, "no readers: a move schedules nothing");
  assert.deepEqual(tracker.at(root), { x: 3, y: 5 });
  let seen = 0;
  const release = tracker.subscribe(root, () => { seen++; return tracker.at(root); });
  tracker.move([40, 5]); tracker.move([50, 5]);
  assert.equal(frames.length, 1, "moves between frames coalesce");
  await frames.shift()();
  assert.equal(seen, 1);
  assert.deepEqual(tracker.at(root), { x: 5, y: 5 });
  assert.deepEqual(tracker.at(inset), { x: 5, y: NaN }, "each frame reads its own values");
  assert.deepEqual(conversions.filter((name) => name === "root").length, 2, "memoized per move");
  tracker.move(null);
  await frames.shift()();
  assert.ok(Number.isNaN(tracker.at(root).x), "no pointer: missing");
  release();
  tracker.move([10, 1]);
  assert.equal(frames.length, 0, "a released reader leaves no reader");
});

test("range, text, color and datetime input values are normalized without losing empty values", () => {
  assert.deepEqual(initialValue("Slider", { min: 2, max: 8, value: [2, 8] }), [2, 8]);
  assert.deepEqual(initialValue("Slider", { min: 2, max: 8, value: [12, -1] }), [2, 8]);
  assert.throws(() => initialValue("Slider", { value: [1] }), /Slider.*two finite numbers/);
  assert.throws(() => initialValue("Slider", { min: 2, max: 1, value: [1, 2] }), /Slider.*min <= max/);
  assert.equal(initialValue("TextInput"), "");
  assert.equal(initialValue("TextInput", { value: "" }), "");
  assert.equal(initialValue("ColorPicker", { value: "#AABBCC" }), "#aabbcc");
  assert.throws(() => initialValue("ColorPicker", { value: "red" }), /ColorPicker.*six-digit/);
  assert.equal(initialValue("DateTimeInput"), null);
  const min = new Date("2024-01-01Z"), max = new Date("2024-12-31Z");
  assert.deepEqual(initialValue("Slider", { min, max, value: [new Date("2025-01-01Z"), min] }), [min, max]);
  assert.throws(() => initialValue("Slider", { min, max, value: [0, 1] }), /Slider.*matching the bounds/);
  assert.equal(initialValue("DateTimeInput", { min, max, value: new Date("2025-01-01Z") }), max);
  assert.throws(() => initialValue("DateTimeInput", { value: new Date(NaN) }), /DateTimeInput.*valid Date/);
});

// TODO 130.1: Text format="axis" reads an axis's view-state field, written as "@" text or a state node.
test("axisField names the axis of a pointer or visible-domain field", async () => {
  const { axisField } = await import("../../src/lib/plot/utils/viewState.js");
  const { view } = await import("../../src/lib/plot/utils/names.js");
  const state = { x: 3, y: "Adelie", visible: { x: [0, 10], y: [-1, 1] } };
  assert.deepEqual([axisField("@pointer_x"), axisField(view.pointer_y), axisField("@view_y_max"), axisField("@view_x_min")]
    .map((f) => [f.axis, f.read(state)]), [["x", 3], ["y", "Adelie"], ["y", 1], ["x", 0]]);
  for (const text of ["@time", "@nope", "x", 2, null]) assert.equal(axisField(text), null, String(text));
});

test("a composed end's bare @view field on its own axis is the frame edge (TODO 130.1)", async () => {
  const { frameEdgeCodes, atFrameEdges } = await import("../../src/lib/plot/utils/frameEdges.js");
  assert.deepEqual(frameEdgeCodes([5, "@view_y_min"], [5, "@view_y_max"]), { start: [0, 1], end: [0, 2] });
  // Another axis's field, an expression or a column stays the host's.
  assert.equal(frameEdgeCodes(["@view_y_min", 0], [{ op: "add", args: ["@view_y_max", 1] }, "y"]), null);
  assert.deepEqual(atFrameEdges([5, 0, 0], [0, 2], [0, 10, -1, 3]), [5, 3, 0]);
});
