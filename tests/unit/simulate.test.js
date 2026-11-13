// TODO 42: Simulate's step core (utils/simulate.js): updates read the previous state only, steps are
// counted from the elapsed time whatever the frame rate, and rows keep their state by key.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { add, multiply, subtract, col, square, where, less, view, sum, logical_and, lag, mode } from "../../src/lib/plot/utils/expressions.js";
import { brushColumn } from "../../src/lib/plot/utils/interaction.js";
import { brushConstraint } from "../../src/lib/plot/utils/brushStrips.js";
import {
  prev, checkSimulation, stepScope, evaluateColumns, disposeState, stepsDue, remapState, largestChange, rowTokens,
  createSimulationEvaluator,
} from "../../src/lib/plot/utils/simulate.js";
import { resolveColumn } from "../../src/lib/plot/interaction/channelWriteback.js";

const read = async (state) => Object.fromEntries(await Promise.all(
  Object.entries(state).map(async ([name, array]) => [name, [...(await array.ref.data())]])));

test("a step reads the previous state only, so column order does not matter", async () => {
  const parent = createDataScope();
  parent.update({ x0: new Float32Array([1, 2]), k: new Float32Array([1, 1]) });
  const initial = { x: "x0", v: 0 };
  // v reads prev("x") and x reads prev("v"): both see the state before this step.
  const update = { x: add(prev("x"), multiply(prev("v"), "@dt")), v: subtract(prev("v"), multiply(multiply(prev("x"), col("k")), "@dt")) };
  checkSimulation({ initial, update, step: 1 });
  let state = evaluateColumns(initial, parent, 2, "initial");
  try {
    for (let i = 0; i < 2; i++) {
      const next = evaluateColumns(update, stepScope(parent, state, null, 0.5), 2, "update");
      disposeState(state);
      state = next;
    }
    // Step 1: x = 1 + 0, v = 0 - 0.5; step 2: x = 1 - 0.25, v = -0.5 - 0.5.
    const values = await read(state);
    assert.deepEqual(values.x, [0.75, 1.5]);
    assert.deepEqual(values.v, [-1, -2]);
  } finally {
    disposeState(state);
    parent.dispose?.();
  }
});

test("compiled row updates match eager shared expressions with changing inputs, dt and row counts", async () => {
  const parent = createDataScope(), evaluator = createSimulationEvaluator();
  let state;
  try {
    for (const rows of [2, 5]) {
      parent.update({ x: Float32Array.from({ length: rows }, (_, i) => i + 1) });
      state = evaluateColumns({ x: "x", v: 0 }, parent, rows, "initial");
      for (const gain of [1, 2, 3]) {
        const shared = add(square(prev("x")), multiply(prev("v"), gain));
        const update = { x: where(less(shared, 9), add(prev("x"), multiply(gain, "@dt")), prev("x")),
          v: subtract(shared, 1), constant: gain, clock: add(view.time, gain) };
        const scope = stepScope(parent, state, null, gain / 4);
        const options = { time: gain * 1000 };
        const expected = evaluateColumns(update, scope, rows, "update", options);
        const next = evaluator.evaluate(update, scope, rows, options);
        try { assert.deepEqual(await read(next), await read(expected)); }
        finally { disposeState(expected); }
        disposeState(state);
        state = next;
      }
      disposeState(state);
      state = null;
    }
  } finally {
    disposeState(state);
    evaluator.dispose();
    parent.dispose();
  }
});

test("simulation compilation retains the eager path for reductions, time and integer columns", async () => {
  const parent = createDataScope(), evaluator = createSimulationEvaluator();
  parent.update({ x: new Int32Array([16777217, 16777218]) });
  try {
    for (const columns of [{ x: where(less(col.x, 16777218), 1, 2) }, { x: sum(col.x) }, { x: add(col.x, view.time) }]) {
      const options = { time: 3 }, expected = evaluateColumns(columns, parent, 2, "update", options);
      const next = evaluator.evaluate(columns, parent, 2, options);
      try { assert.deepEqual(await read(next), await read(expected)); }
      finally { disposeState(next); disposeState(expected); }
    }
    assert.throws(() => evaluator.evaluate({ x: col.missing }, parent, 2), /missing field "missing"/);
    parent.update({ x: new Int32Array([1, 2]), species: ["a", "b"] });
    for (const x of [lag("species"), mode("species")])
      assert.throws(() => evaluator.evaluate({ x }, parent, 2), /update\.x must be numeric/);
  } finally {
    evaluator.dispose();
    parent.dispose();
  }
});

test("published simulation arrays survive disposal of their compiled program cache", async () => {
  const parent = createDataScope(), evaluator = createSimulationEvaluator();
  parent.update({ x: new Float32Array([1, 2, 3]) });
  let state;
  try {
    state = evaluator.evaluate({ x: add(col.x, 4), constant: 7 }, parent, 3);
    evaluator.dispose();
    assert.deepEqual(await read(state), { x: [5, 6, 7], constant: [7, 7, 7] });
  } finally {
    disposeState(state);
    evaluator.dispose();
    parent.dispose();
  }
});

test("simulation dye follows rectangular brush preview, commit, clear and manual membership", async () => {
  const parent = createDataScope(), output = createDataScope(), evaluator = createSimulationEvaluator();
  const data = { x: new Float32Array([0, 1, 2, 3]), y: new Float32Array([3, 2, 1, 0]) };
  parent.update(data);
  let state = evaluateColumns({ dye: 0 }, parent, 4, "initial");
  output.update({ ...data, ...state });
  const owner = output.identity, brush = owner.brush;
  const update = { dye: where(logical_and(view.brushed, view.any_brushed), 1, multiply(prev("dye"), 0.5)) };
  const advance = async (expected) => {
    const next = evaluator.evaluate(update, stepScope(parent, state, output, 16), 4);
    disposeState(state); state = next;
    output.update({ ...data, ...state });
    assert.deepEqual((await read(state)).dye, expected);
  };
  try {
    await advance([0, 0, 0, 0]);
    brush.setConstraints(owner, [
      brushConstraint(brushColumn(output, "x", "x", "mark"), { axis: "x" }, 1, 3),
      brushConstraint(brushColumn(output, "y", "y", "mark"), { axis: "y" }, 1, 2),
    ], { phase: "preview" });
    assert.equal(output.get("@brushed").dtype, "int32");
    await advance([0, 1, 1, 0]);
    brush.commitConstraintPreview(owner);
    await advance([0, 1, 1, 0]);
    brush.clear(owner);
    await advance([0, 0.5, 0.5, 0]);
    brush.replace(owner, [3]);
    await advance([0, 0.25, 0.25, 1]);
    // A step reading @dt beside manual (int32) membership stays compiled: @dt is a runtime
    // input, and the values and dtype match the reference path.
    const timed = { dye: where(view.brushed, 1, add(prev("dye"), multiply("@dt", 0.001))), held: multiply(view.selected, "@dt") };
    const scope = stepScope(parent, state, output, 16), fallback = evaluator.stats.fallback;
    const compiled = evaluator.evaluate(timed, scope, 4), eager = evaluateColumns(timed, scope, 4, "update");
    try {
      assert.deepEqual(Object.values(compiled).map((a) => a.dtype), Object.values(eager).map((a) => a.dtype));
      assert.deepEqual(await read(compiled), await read(eager)); assert.equal(evaluator.stats.fallback, fallback);
    }
    finally { disposeState(compiled); disposeState(eager); }
  } finally {
    evaluator.dispose(); output.dispose(); disposeState(state); parent.dispose();
  }
});

test("compiled prev reads leave the state's references as they were", async () => {
  const parent = createDataScope(), evaluator = createSimulationEvaluator();
  parent.update({ x: new Float32Array([1, 2, 3]) });
  const state = evaluateColumns({ x: "x" }, parent, 3, "initial"), before = state.x.refCount;
  let next;
  try {
    const scope = stepScope(parent, state, null, 16);
    next = evaluator.evaluate({ x: add(prev("x"), 1) }, scope, 3);
    assert.deepEqual(await read(next), { x: [2, 3, 4] });
    assert.equal(state.x.refCount, before);
  } finally {
    disposeState(next);
    disposeState(state);
    evaluator.dispose();
    parent.dispose();
  }
});

test("steps come from the elapsed time, at any frame rate, capped per frame", () => {
  const run = (frame, total, cap = 8) => {
    let taken = 0;
    for (let time = frame; time <= total + 1e-6; time += frame) taken += stepsDue(time, 16, taken, cap);
    return taken;
  };
  assert.equal(run(1000 / 60, 1000), run(1000 / 120, 1000));
  assert.equal(stepsDue(1000, 16, 0, 8), 8);
  assert.equal(stepsDue(160, 16, 10, 8), 0);
});

// TODO 50: a Simulate takes its frames from its clock scope; the same steps at 60 and 120 Hz.
test("a Simulate on its clock scope takes the same steps at any frame rate", async () => {
  const { ClockScope } = await import("../../src/lib/plot/utils/clockScope.js");
  const saved = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame];
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const run = async (hz) => {
      const scope = new ClockScope();
      let time = 0, taken = 0;
      // Simulate's tick (simulate.svelte): the steps due, capped per frame, running behind at the cap.
      scope.subscribe({ active: () => true, tick(dt) {
        time += dt;
        const due = stepsDue(time, 16, taken, 8);
        taken += due;
        if (due === 8) time = Math.min(time, taken * 16);
      } });
      for (let frame = 0; frame <= hz; frame++) await scope.frame((frame * 1000) / hz);
      scope.dispose();
      return taken;
    };
    assert.equal(await run(60), 62);
    assert.equal(await run(120), 62);
  } finally {
    [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = saved;
  }
});

test("rows keep their state by key, through a Filter too; new rows start from initial", async () => {
  // A Filter's rows are its source rows: their tokens are the source rows' keys, or indices.
  const filtered = { length: 2, sourceLength: 3, sourceIndices: () => np.array(new Int32Array([2, 0])) };
  assert.deepEqual(await rowTokens({ ...filtered, identity: { tokens: ["a", "b", "c"] } }), ["c", "a"]);
  assert.deepEqual(await rowTokens({ ...filtered, identity: { tokens: null } }), ["row:2", "row:0"]);
  // Its output is a root, but a drag cannot move its state (TODO 42.8).
  const output = createDataScope();
  output.update({ x: new Float32Array([1, 2]), y0: new Float32Array([0, 1]) });
  output.stateColumns = new Set(["x"]);
  assert.equal(resolveColumn(output, "x").reason, "x is a Simulate's state, which each step computes");
  assert.equal(resolveColumn(output, "y0").column, "y0");
  output.dispose();
  const state = { x: np.array(new Float32Array([10, 20, 30])) };
  const initial = { x: np.array(new Float32Array([0, 0, 0, 0])) };
  const moved = remapState(state, initial, ["a", "b", "c"], ["c", "a", "d", "b"]);
  try {
    assert.deepEqual((await read(moved)).x, [30, 10, 0, 20]);
  } finally {
    disposeState(moved);
  }
});

test("the stop rule measures the largest change in one step", async () => {
  const before = { x: np.array(new Float32Array([1, 2])) }, after = { x: np.array(new Float32Array([1.5, 1])) };
  try {
    assert.equal(await largestChange(before, after, ["x"]), 1);
  } finally {
    disposeState(before);
    disposeState(after);
  }
  assert.throws(() => checkSimulation({ initial: { x: 0 }, update: { y: 1 }, step: 16 }), /update.y has no initial value/);
  assert.throws(() => checkSimulation({ initial: { x: 0 }, update: { x: prev("z") }, step: 16 }), /reads prev\("z"\)/);
  assert.throws(() => checkSimulation({ initial: { x: 0 }, update: { x: 1 }, step: 16, stop: { tolerance: 0.1, colums: ["x"] } }), /no option "colums"/);
  assert.throws(() => checkSimulation({ initial: { x: 0 }, update: { x: 1 }, step: 16, stop: { tolerance: 0.1, columns: ["v"] } }), /"v", which is not a state column/);
});
