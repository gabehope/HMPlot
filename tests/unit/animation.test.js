import test from "node:test";
import assert from "node:assert/strict";
import {
  ease,
  easings,
  ensureAnimation,
  ensureBoundsAnimation,
  holdAnimation,
} from "../../src/lib/plot/utils/animation.js";
import { OptionsNode } from "../../src/lib/options/options.js";
import { markAnimation } from "../../src/lib/plot/utils/markAnimation.js";
import { createViewServices } from "../../src/lib/plot/utils/viewServices.ts";
test("overlapping update and export holds release independently in any order", () => {
  const view = createViewServices();
  const update = holdAnimation(view), png = holdAnimation(view), svg = holdAnimation(view);
  update(); svg(); svg();
  assert.equal(view.clock.held, true);
  png();
  assert.equal(view.clock.held, false);
  const next = holdAnimation(view);
  next();
  assert.equal(view.clock.held, false);
});
test("animation easing endpoints, monotonicity and bounded intermediate values", () => {
  for (const name of easings) {
    assert.equal(ease(0, name), 0);
    assert.equal(ease(1, name), 1);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const v = ease(i / 100, name);
      assert.ok(v >= previous && v >= 0 && v <= 1);
      previous = v;
    }
  }
  assert.equal(ease(0.25, "linear"), 0.25);
  assert.equal(ease(0.25, "quad-in"), 0.0625);
  assert.equal(ease(0.25, "cubic-in-out"), 0.0625);
});
test("animation settings inherit with zero duration and mark overrides", () => {
  const root = new OptionsNode();
  ensureAnimation(root);
  ensureBoundsAnimation(root);
  assert.equal(root.get("animation"), false);
  assert.equal(root.get("animationDuration"), 300);
  assert.equal(root.get("animateBounds"), false);
  root.set("animateBounds", true);
  root.set("boundsDuration", 900);
  root.set("boundsEasing", "linear");
  root.set("animationDuration", 700);
  const child = root.splitUnique("mark");
  ensureAnimation(child);
  ensureBoundsAnimation(child);
  assert.equal(child.get("animation"), false);
  assert.equal(child.get("boundsDuration"), 900);
  assert.equal(child.get("boundsEasing"), "linear");
  assert.throws(() => child.set("boundsDuration", -1), /nonnegative/);
  assert.equal(child.get("animationDuration"), 700);
  child.set("animationDuration", 0);
  assert.equal(child.get("animationDuration"), 0);
  assert.equal(root.get("animationDuration"), 700);
  root.dispose();
});

// Stage 13: animate/tween descriptors, the scale-space blend reference, and @time.
test("animate() is a descriptor, not an expression, and must be outermost", async () => {
  const { animate, isAnimate, easings } = await import("../../src/lib/plot/utils/animation.js");
  const { multiply, tween, isExpression, expressionHasTween, expressionHasTime, expressionTweens, col, add, view } =
    await import("../../src/lib/plot/utils/expressions.js");
  const a = animate("y", { duration: 500, easing: "linear", enter: 0, exit: 10 });
  assert.ok(isAnimate(a) && !isExpression(a));
  assert.deepEqual([a.value, a.duration, a.easing, a.enter, a.exit], ["y", 500, "linear", 0, 10]);
  assert.throws(() => multiply(animate("y"), 2), /outermost operator/);
  assert.throws(() => tween(animate("y")), /outermost operator/);
  assert.throws(() => animate(animate("y")), /wrap another/);
  assert.throws(() => animate("y", { easing: "bouncy" }), /Unknown easing/);
  assert.throws(() => animate("y", { duration: -1 }), /nonnegative/);
  assert.ok(easings.includes("cubic-in-out"));
  const t = multiply(tween("x", { duration: 200 }), 2);
  assert.ok(expressionHasTween(t) && !expressionHasTime(t));
  assert.equal(expressionTweens(t)[0].duration, 200);
  assert.ok(expressionHasTime(add(view.time, 1)));
  assert.throws(() => tween("x", { duration: NaN }), /duration/);
});

test("the scale-space blend reference: log midpoints are geometric, categorical steps at 0.5", async () => {
  const { blendValue, TRANSFORM_KINDS, ROW_BLEND_SOURCE, easings } = await import("../../src/lib/plot/utils/animation.js");
  const K = TRANSFORM_KINDS;
  assert.ok(Math.abs(blendValue(1, 100, 0.5, K.log, "linear") - 10) < 1e-9);
  assert.ok(Math.abs(blendValue(0, 16, 0.5, K.sqrt, "linear") - 4) < 1e-9);
  assert.equal(blendValue(0, 10, 0.5, K.linear, "linear"), 5);
  assert.equal(blendValue(3, 5, 0.49, K.step, "linear"), 3);
  assert.equal(blendValue(3, 5, 0.5, K.step, "linear"), 5);
  // An out-of-domain value is missing, as a nonfinite one is: the row takes its target (39.1).
  assert.equal(blendValue(0, 100, 0.5, K.log, "linear"), 100);
  assert.equal(blendValue(NaN, 7, 0.2, K.linear, "linear"), 7);
  // symlog blends in its own space, with its constant: halfway between ±9 (c 1) is 0.
  assert.ok(Math.abs(blendValue(-9, 9, 0.5, K.symlog, "linear")) < 1e-9);
  assert.ok(Math.abs(blendValue(0, 99, 0.5, K.symlog, "linear", 1) - 9) < 1e-9);
  // Easing applies before the mix: quad-in halfway is a quarter of the way.
  assert.equal(blendValue(0, 8, 0.5, K.linear, "quad-in"), 2);
  // The shader carries the easing table and every transform kind.
  for (const entry of ["init", "retarget", "snap", "blend"]) assert.ok(ROW_BLEND_SOURCE.includes(`fn ${entry}(`), entry);
  assert.ok(ROW_BLEND_SOURCE.includes("fn ease(") && ROW_BLEND_SOURCE.includes("fn blendForward(") && ROW_BLEND_SOURCE.includes("fn blendInverse("));
  for (let index = 0; index < easings.length; index++) if (index !== 6) assert.ok(ROW_BLEND_SOURCE.includes(`case ${index}u`), easings[index]);
});

// jax-js's wasm backend compiles one WebAssembly module per distinct kernel source; count them.
async function countCompiledKernels(run) {
  const { Module, compile } = WebAssembly;
  let compiled = 0;
  WebAssembly.Module = new Proxy(Module, { construct(target, args) { compiled++; return new target(...args); } });
  WebAssembly.compile = (...args) => { compiled++; return compile(...args); };
  try { await run(); } finally { WebAssembly.Module = Module; WebAssembly.compile = compile; }
  return compiled;
}

test("@time reaches kernels as a device value, so a new clock value compiles no kernel (13.8 N4)", async () => {
  const { createDataScope } = await import("../../src/lib/plot/utils/categorical.js");
  const { evaluateExpression, add, divide, col, deviceScalar, view } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = createDataScope();
  scope.update({ angle: [0, 1, 2] });
  const channel = add(divide(view.time, 700), "angle");
  const run = async (time) => {
    const result = evaluateExpression(channel, scope, { time });
    try { return Array.from(await result.value.ref.data()); } finally { result.dispose(); }
  };
  await run(0);
  const values = [];
  const compiled = await countCompiledKernels(async () => { for (const time of [350, 700, 1400, 1234.5]) values.push(await run(time)); });
  [350, 700, 1400, 1234.5].forEach((time, i) => values[i].forEach((value, row) => assert.ok(Math.abs(value - (time / 700 + row)) < 1e-5, `${time}: ${values[i]}`)));
  assert.equal(compiled, 0);
  // Scalar consumers keep the host value; array consumers retain the default broadcast.
  const alone = evaluateExpression(view.time, scope, { time: 5, broadcast: false });
  assert.equal(alone.value, 5);
  alone.dispose();
  const broadcast = evaluateExpression(view.time, scope, { time: 5 });
  assert.deepEqual(Array.from(await broadcast.value.ref.data()), [5, 5, 5]);
  broadcast.dispose();
  for (const value of [0, -2.5, 1e9]) {
    const scalar = deviceScalar(value);
    assert.deepEqual(scalar.shape, []);
    assert.equal((await scalar.data())[0], Math.fround(value));
  }
  scope.dispose();
});

test("@time evaluates to the clock and tween to its target; Calculate refuses animate, and reads @time from its view state", async () => {
  const { createDataScope } = await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const { evaluateExpression, add, col, tween, multiply, view } = await import("../../src/lib/plot/utils/expressions.js");
  const { animate } = await import("../../src/lib/plot/utils/animation.js");
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3] });
  const timed = evaluateExpression(add(view.time, "x"), scope, { time: 1000 });
  assert.deepEqual(Array.from(await timed.value.ref.data()), [1001, 1002, 1003]);
  timed.dispose();
  const output = await runTransform("Calculate", scope, { columns: { doubled: multiply(tween("x", { duration: 300 }), 2) } });
  assert.deepEqual(Array.from(await output.get("doubled").ref.data()), [2, 4, 6]);
  assert.deepEqual([...output.liveColumns], ["doubled"]);
  assert.equal("tweenColumns" in output, false);
  output.dispose();
  await assert.rejects(() => runTransform("Calculate", scope, { columns: { y: animate("x") } }), /belongs on a mark channel/);
  // A Calculate reads @time from the view state transform.svelte gives it (TODO 28); with none,
  // reading it is an error, never a silent 0.
  await assert.rejects(() => runTransform("Calculate", scope, { columns: { y: add(view.time, 1) } }), /not available here/);
  const clocked = await runTransform("Calculate", scope, { columns: { y: add(view.time, 1) }, __viewState: { time: 41 } });
  assert.deepEqual(Array.from(await clocked.get("y").ref.data()), [42, 42, 42]);
  clocked.dispose();
  scope.dispose();
});

// Stage 13.8: the clock's bookkeeping, one timebase for CPU and GPU, buffer ownership.
function fakeGPU(limit = 1 << 20) {
  globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128 };
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  const created = [], writes = [];
  const device = {
    limits: { maxStorageBufferBindingSize: limit, maxBufferSize: limit * 4 },
    createBuffer({ size }) {
      const buffer = { size, destroyed: 0, destroy() { this.destroyed++; } };
      created.push(buffer);
      return buffer;
    },
    createBindGroupLayout: () => ({}), createShaderModule: () => ({}), createPipelineLayout: () => ({}),
    createComputePipeline: () => ({}), createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      copyBufferToBuffer() {}, finish: () => ({}),
    }),
    queue: {
      writeBuffer(buffer, offset, data) { writes.push({ buffer, data: new Uint8Array(data.buffer ?? data).slice() }); },
      submit() {}, onSubmittedWorkDone: () => Promise.resolve(),
    },
  };
  const settings = { animation: true, animationDuration: 100, animationEasing: "linear" };
  const renderer = { backend: { device } };
  const owner = { renderer, options: { get: (key) => settings[key] }, manager: { animationBatch: 1 }, invalidate() {} };
  markAnimation(owner).ready = true;
  return { device, created, writes, renderer, owner };
}
// No real frames: tests drive the clock with advance(frameTime).
function withoutFrames(run) {
  return async () => {
    const saved = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame];
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    try { await run(); } finally { [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = saved; }
  };
}
const moving = (duration, easing = "linear") => ({ mode: 1, duration, easing });
const paramsOf = (write) => ({ count: new Uint32Array(write.data.buffer)[0], now: new Float32Array(write.data.buffer)[1] });

test("uniform animation retains unchanged targets and retargets current values with its queued policy", withoutFrames(async () => {
  const { animationClock, uniformTransition } = await import("../../src/lib/plot/utils/animation.js");
  const { Color } = await import("three/webgpu");
  const { renderer, owner } = fakeGPU(), clock = animationClock(renderer), state = markAnimation(owner);
  const policy = { spec: { explicit: true, components: [{ explicit: true, duration: 500, easing: "linear" }] } };
  state.live = true;
  const scalar = { value: 1 }, color = { value: new Color(1, 0, 0) }, vector = { value: [0, 2] };
  try {
    uniformTransition(owner, "field:opacity", scalar, 0, policy);
    uniformTransition(owner, "field:color", color, new Color(0, 0, 1), policy);
    uniformTransition(owner, "field:position", vector, [2, 4], policy);
    const tracks = [...clock.tracks];
    clock.time = 250; await clock.step();
    assert.equal(scalar.value, 0.5);
    assert.deepEqual(color.value.toArray(), [0.5, 0, 0.5]);
    assert.deepEqual(vector.value, [1, 3]);
    state.specs = { position: { components: [{ suppressed: true }] } };
    uniformTransition(owner, "field:opacity", scalar, 0, policy);
    uniformTransition(owner, "field:color", color, new Color(0, 0, 1), policy);
    uniformTransition(owner, "field:position", vector, [2, 4], policy);
    assert.deepEqual([...clock.tracks], tracks, "unchanged targets keep the original tracks");
    clock.time = 375; await clock.step();
    assert.equal(scalar.value, 0.25);
    assert.deepEqual(color.value.toArray(), [0.25, 0, 0.75]);
    assert.deepEqual(vector.value, [1.5, 3.5]);
    uniformTransition(owner, "field:opacity", scalar, 1, policy);
    clock.time = 625; await clock.step();
    assert.equal(scalar.value, 0.625, "a changed target starts from the displayed alpha");
    const retargeted = state.uniforms.get('field:opacity');
    uniformTransition(owner, "field:opacity", scalar, 1, { ...policy, arrive: true });
    assert.equal(state.uniforms.get('field:opacity'), retargeted, "an unrelated arriving channel keeps this target's schedule");
    uniformTransition(owner, "field:opacity", scalar, 0, { spec: policy.spec, staging: {} });
    assert.equal(scalar.value, 0.625, "a keyed source frame holds the displayed uniform while rows reindex");
    uniformTransition(owner, "field:opacity", scalar, 1, policy);
    uniformTransition(owner, "field:opacity", scalar, 1, { ...policy, schemeReset: true });
    assert.equal(scalar.value, 1, "scheme reset lands an unchanged pending target");
    clock.scope.media = { matches: true, removeEventListener() {} };
    uniformTransition(owner, "field:opacity", scalar, 1, policy);
    assert.equal(scalar.value, 1, "reduced motion lands even an unchanged pending target");
    assert.equal(clock.tracks.size, 0);
  } finally { clock.dispose(); }
}));

test("frame intervals arrive once, retarget displayed values, snap reversals and dispose", withoutFrames(async () => {
  const { animationClock, attachClockView, createFrameAnimation } = await import("../../src/lib/plot/utils/animation.js");
  const { renderer } = fakeGPU(), view = createViewServices();
  attachClockView(renderer, view);
  view.lifecycle.completedFrame = 1;
  const values = { animateBounds: true, boundsDuration: 100, boundsEasing: "linear", animation: false, animationDuration: 700, ybounds: [0, 1] };
  const listeners = new Set();
  const options = { get: key => values[key], set: (key, value) => {
    values[key] = value; for (const fn of listeners) fn(value, key);
  }, on: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const frame = createFrameAnimation(renderer, options), clock = animationClock(renderer);
  try {
    frame.set("ybounds", [0, 10]);
    assert.deepEqual(values.ybounds, [0, 10]);
    frame.set("ybounds", [0, 20]);
    clock.time = 50; await clock.step();
    assert.deepEqual(values.ybounds, [0, 15]);
    frame.set("ybounds", [-0.04, 1.04]);
    clock.time = 150; await clock.step();
    assert.deepEqual(values.ybounds, [-0.04, 1.04]);
    frame.set("ybounds", [0, 30]);
    assert.deepEqual(values.ybounds, [-0.04, 1.04]);
    clock.time = 200; await clock.step();
    assert.deepEqual(values.ybounds, [-0.02, 15.52]);
    frame.set("ybounds", [0, 40]);
    assert.deepEqual(values.ybounds, [-0.02, 15.52]);
    clock.time = 250; await clock.step();
    assert.equal(values.ybounds[0], -0.01);
    assert.ok(Math.abs(values.ybounds[1] - 27.76) < 1e-12);
    assert.equal(frame.running("ybounds"), true);
    frame.set("ybounds", [30, 0]);
    assert.deepEqual(values.ybounds, [30, 0]);
    assert.equal(frame.running("ybounds"), false);
    frame.set("ybounds", [40, 0]);
    options.set("ybounds", null);
    assert.equal(frame.running("ybounds"), false);
    assert.equal(frame.target("ybounds"), undefined);
    assert.equal(values.animation, false);
    assert.equal(values.animationDuration, 700);
    values.animation = true;
    values.animateBounds = false;
    frame.set("ybounds", [50, 0]);
    assert.deepEqual(values.ybounds, [50, 0]);
    frame.dispose();
    assert.equal(clock.owners.size, 0);
  } finally { frame.dispose(); clock.dispose(); }
}));

test("the clock keeps its bookkeeping off the tracks and advances by the frame delta", withoutFrames(async () => {
  const { animationClock } = await import("../../src/lib/plot/utils/animation.js");
  const { renderer, owner } = fakeGPU();
  const clock = animationClock(renderer), unregister = clock.register(owner), applied = [];
  const track = { owner, start: "own", duration: "own", elapsed: "own", easing: "own", customDuration: 100,
    customEasing: "linear", explicit: true, apply: (t, done) => applied.push([t, done]) };
  clock.add(track);
  await clock.advance(1000);
  await clock.advance(1050);
  assert.deepEqual([track.start, track.duration, track.elapsed, track.easing], ["own", "own", "own", "own"]);
  assert.deepEqual(applied, [[0, false], [0.5, false]]);
  assert.equal(clock.time, 50);
  await clock.advance(1100);
  assert.deepEqual(applied.at(-1), [1, true]);
  assert.equal(clock.tracks.has(track), false);
  // The idle gap before the next transition is not animation time.
  clock.add(track);
  await clock.advance(60000);
  assert.equal(clock.time, 100);
  assert.deepEqual(applied.at(-1), [0, false]);
  unregister();
  clock.dispose();
}));

test("a frozen or held clock does not move transitions; View-wide waits resolve while frozen", withoutFrames(async () => {
  const { attachClockView } = await import("../../src/lib/plot/utils/animation.js");
  const { renderer, owner } = fakeGPU(), view = createViewServices();
  const clock = attachClockView(renderer, view), unregister = clock.register(owner), applied = [];
  const track = { owner, customDuration: 100, customEasing: "linear", explicit: true, apply: (t) => applied.push(t) };
  clock.add(track);
  await clock.advance(0);
  view.clock.held = true;
  await clock.advance(500);
  view.clock.held = false;
  await clock.advance(510);
  assert.equal(clock.time, 10);
  view.clock.scope.frozen = true;
  await clock.advance(2000);
  assert.equal(clock.time, 10);
  let all = false, mine = false;
  clock.finished().then(() => { all = true; });
  clock.finished({ owner }).then(() => { mine = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(all, true);
  assert.equal(mine, false);
  // A cap counts clock time: it fires once the clock moves past it, never on its own.
  view.clock.scope.frozen = false;
  let capped = false;
  clock.finished({ owner, cap: 20 }).then(() => { capped = true; });
  await clock.advance(2010);
  await clock.advance(2040);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(capped, true);
  unregister();
  clock.dispose();
}));

test("preparation waits skip frames without stretching a transition's elapsed duration", withoutFrames(async () => {
  const { attachClockView } = await import("../../src/lib/plot/utils/animation.js");
  const { renderer, owner } = fakeGPU(), view = createViewServices();
  const clock = attachClockView(renderer, view), unregister = clock.register(owner), applied = [];
  clock.add({ owner, customDuration: 650, customEasing: "linear", explicit: true,
    apply: (progress, done) => applied.push([progress, done]) });
  await clock.advance(0);
  view.lifecycle.renderHeld = true;
  await clock.advance(100);
  view.lifecycle.renderHeld = false;
  owner.manager.pendingUpdates = true;
  await clock.advance(300);
  owner.manager.pendingUpdates = false;
  clock.busy = Promise.resolve();
  await clock.advance(450);
  clock.busy = null;
  assert.deepEqual(applied, [[0, false]]);
  await clock.advance(500);
  assert.equal(clock.time, 500);
  assert.deepEqual(applied.at(-1), [500 / 650, false]);
  await clock.advance(650);
  assert.deepEqual(applied.at(-1), [1, true]);
  unregister(); clock.dispose();
}));

// TODO 50: one clock per scope. Its views share the time and hold it together; its tickers
// (Playback, Simulate) move by the frame delta, capped at 250 ms, not while held or frozen, and
// by a step of setAnimationTime.
test("a clock scope times its views and tickers together", withoutFrames(async () => {
  const { attachClockView } = await import("../../src/lib/plot/utils/animation.js");
  const { ClockScope } = await import("../../src/lib/plot/utils/clockScope.js");
  const { playbackStep } = await import("../../src/lib/plot/utils/inputs.js");
  const scope = new ClockScope();
  const views = [fakeGPU(), fakeGPU()].map(({ renderer, owner }) => {
    const view = createViewServices({ clockScope: scope }), clock = attachClockView(renderer, view);
    return { view, clock, unregister: clock.register(owner), owner };
  });
  const applied = [];
  views[1].clock.add({ owner: views[1].owner, customDuration: 1000, customEasing: "linear", explicit: true, apply: (t) => applied.push(t) });
  // A Playback, rate 2 per second, looping over [0, 1].
  let position = 0, value = 0;
  scope.subscribe({ active: () => true, tick(dt) {
    ({ position, value } = playbackStep(position, dt, { lo: 0, hi: 1, rate: 2, loop: true }));
  } });
  await scope.frame(0);
  await scope.frame(100);
  assert.equal(views[0].view.clock.time, 100);
  assert.equal(views[1].view.clock.time, 100);
  assert.deepEqual(applied, [0, 0.1]);
  assert.equal(value, 0.2);
  // One view's export holds the whole scope, its tickers too.
  views[0].view.clock.held = true;
  await scope.frame(600);
  views[0].view.clock.held = false;
  await scope.frame(700);
  assert.equal(scope.time, 200);
  assert.equal(value, 0.4);
  // Transitions and @time catch up after a slow frame; tickers retain their safety cap.
  await scope.frame(5000);
  assert.equal(scope.time, 4500);
  assert.ok(Math.abs(value - 0.9) < 1e-9);
  // setAnimationTime freezes it and moves the tickers by each step forward (a video's frames);
  // a step back moves only the time, and frames move nothing while it is frozen.
  await scope.setTime(4550);
  assert.ok(Math.abs(value - 0) < 1e-9 && Math.abs(position - 0) < 1e-9);
  assert.equal(scope.frozen, true);
  await scope.setTime(100);
  await scope.frame(6000);
  await scope.frame(6100);
  assert.equal(scope.time, 100);
  assert.ok(Math.abs(position - 0) < 1e-9);
  await scope.setTime(null);
  assert.equal(scope.frozen, false);
  // Under reduced motion a ticker that plays by itself (a Simulate running from the start) waits
  // for the frames; one the reader started moves; setAnimationTime moves both (TODO 69.16).
  const steps = { own: 0, started: 0 };
  scope.subscribe({ active: () => true, autoplay: () => true, tick(dt) { steps.own += dt; } });
  scope.subscribe({ active: () => true, autoplay: () => false, tick(dt) { steps.started += dt; } });
  scope.media = { matches: true, removeEventListener() {} };
  await scope.frame(7000);
  await scope.frame(7100);
  assert.deepEqual(steps, { own: 0, started: 100 });
  await scope.setTime(scope.time + 40);
  assert.deepEqual(steps, { own: 40, started: 140 });
  views.forEach(({ clock, unregister }) => { unregister(); clock.dispose(); });
  scope.dispose();
}));

test("a Playback steps, loops and stops by its clock's elapsed time", async () => {
  const { playbackStep } = await import("../../src/lib/plot/utils/inputs.js");
  const range = { lo: 0, hi: 10, rate: 4 };
  assert.deepEqual(playbackStep(1, 500, range), { position: 3, value: 3, stopped: false });
  // With step, the value is the last step passed.
  assert.equal(playbackStep(1, 500, { ...range, step: 2.5 }).value, 2.5);
  // At max it stops there, or wraps to min with loop.
  assert.deepEqual(playbackStep(9, 500, range), { position: 10, value: 10, stopped: true });
  assert.deepEqual(playbackStep(9, 500, { ...range, loop: true }), { position: 1, value: 1, stopped: false });
});

test("RowTransition stamps and blends with the clock time and frees exactly the buffers it made", withoutFrames(async () => {
  const { animationClock, RowTransition } = await import("../../src/lib/plot/utils/animation.js");
  const { device, created, writes, renderer, owner } = fakeGPU();
  const clock = animationClock(renderer), unregister = clock.register(owner);
  const output = device.createBuffer({ size: 4096 });
  const spec = { stride: 1, kinds: [0, 0, 0, 0], components: [moving(1000), moving(1000), moving(1000), moving(1000)], explicit: true };
  const t = new RowTransition(renderer, owner, output, 8, undefined, spec);
  const dispatched = [], dispatch = t.dispatch.bind(t);
  t.dispatch = (entry, finish) => { dispatched.push(entry); dispatch(entry, finish); };
  clock.time = 1000;
  await t.prepare(async () => {}, { spec });
  assert.deepEqual(dispatched.splice(0), ["init", "retarget", "blend"]);
  assert.equal(clock.unapplied(), false);
  assert.equal(clock.pending(owner), true);
  assert.equal(paramsOf(writes.at(-1)).now, 1000);
  clock.time = 1250;
  t.apply(0, false);
  assert.equal(paramsOf(writes.at(-1)).now, 1250);
  assert.equal(clock.progress(t), 0.25);
  // A fresh target stays animated but is ready to draw at this same clock time.
  dispatched.length = 0;
  await t.prepare(async () => {}, { spec });
  assert.deepEqual(dispatched.splice(0), ["retarget", "blend"]);
  assert.equal(clock.unapplied(), false);
  assert.equal(paramsOf(writes.at(-1)).now, 1250);
  // Growing past the capacity replaces the state buffers once; a snap keeps the transition.
  const first = [t.fromBuffer, t.toBuffer, t.startBuffer, t.incomingBuffer];
  await t.prepare(async () => {}, { snap: true, count: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(first.map((buffer) => buffer.destroyed), [1, 1, 1, 1]);
  assert.equal(paramsOf(writes.at(-1)).count, 1000);
  assert.equal(clock.tracks.has(t), false);
  assert.deepEqual(dispatched, ["snap"]);
  t.dispose();
  t.dispose();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const mine = created.filter((buffer) => buffer !== output && !first.includes(buffer));
  assert.ok(mine.length >= 5);
  assert.deepEqual(mine.map((buffer) => buffer.destroyed), mine.map(() => 1));
  assert.equal(output.destroyed, 0);
  unregister();
  clock.dispose();
}));

test("the animation limit is per state buffer, and over it the error says so", withoutFrames(async () => {
  const { RowTransition } = await import("../../src/lib/plot/utils/animation.js");
  const { device, renderer, owner } = fakeGPU(4096);
  const output = device.createBuffer({ size: 4096 });
  const spec = { stride: 1, kinds: [0, 0, 0, 0], components: [moving(10)], explicit: true };
  // 1000 floats is 4000 bytes per buffer: under the limit although four buffers are not.
  new RowTransition(renderer, owner, output, 1000, undefined, spec).dispose();
  assert.throws(() => new RowTransition(renderer, owner, output, 1100, undefined, spec), {
    code: "limit.animation",
    message: "Plot: animating values needs 1,100 values; the limit is 1,024 values on this device. Animate fewer rows or channels.",
  });
}));

test("tween options and @time placement are checked, and decoded trees follow the JS rules", async () => {
  const { tween, expressionFromDescriptor, add, col, greater, view } = await import("../../src/lib/plot/utils/expressions.js");
  const { animate } = await import("../../src/lib/plot/utils/animation.js");
  const { createDataScope } = await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform, resolveTransformParameters } = await import("../../src/lib/plot/utils/transforms.js");
  assert.throws(() => tween("x", { easing: "bogus" }), /Unknown easing "bogus"/);
  assert.throws(() => tween("x", { duration: Infinity }), /finite/);
  assert.throws(() => tween("x", { enter: 0 }), /only animate\(\)/);
  assert.throws(() => expressionFromDescriptor({ $expression: { op: "tween", args: ["x", { __expressionLiteral: true, easing: "bogus" }] } }), /Unknown easing/);
  assert.throws(() => expressionFromDescriptor({ $expression: { op: "add", args: [animate("x"), 1] } }), /outermost operator/);
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3] });
  await assert.rejects(() => runTransform("Filter", scope, { where: greater(view.time, 1) }), /not available here/);
  await assert.rejects(() => resolveTransformParameters("Sample", { size: add(view.time, 1) }, scope), /not available here/);
  // A Calculate column computed from a tweened column is tweened too.
  const first = await runTransform("Calculate", scope, { columns: { a: tween("x", { duration: 300 }) } });
  const second = await runTransform("Calculate", first, { columns: { b: add("a", 1), c: "x" } });
  assert.deepEqual([...second.liveColumns].sort(), ["a", "b"]);
  assert.equal("tweenColumns" in second, false);
  second.dispose(); first.dispose(); scope.dispose();
});

// TODO 32.6: channel animation parsed and turned into field specs, without a mark component.
test("channel animation: animate(), tween(), @time and interval(), and the field specs they give", async () => {
  const { animate: animateChannel, TRANSFORM_KINDS } = await import("../../src/lib/plot/utils/animation.js");
  const { tween, interval, multiply } = await import("../../src/lib/plot/utils/expressions.js");
  const { channelAnimation, fieldAnimation } = await import("../../src/lib/plot/utils/channelAnimation.js");
  const options = { get: (key) => ({ animationDuration: 400, animationEasing: "linear" })[key] };
  const props = {
    y: animateChannel("value", { duration: 200, enter: 0 }),
    size: tween("weight"),
    x: multiply("@time", 2),
    opacity: interval("@time", 500),
    name: "points",
  };
  const animation = channelAnimation(props, { options, scope: null });
  // animate() unwraps to its value and keeps its timing and enter value; tween() moves in raw units.
  assert.equal(props.y, "value");
  assert.deepEqual(animation.channels.y, { duration: 200, easing: "linear", scale: true });
  assert.deepEqual(animation.enter, { y: 0 });
  assert.equal(animation.channels.size, undefined, "the producer owns tween timing");
  assert.equal(animation.tweened.size, props.size);
  assert.deepEqual(Object.keys(animation.procedural), ["x"]);
  assert.deepEqual(Object.keys(animation.stepped), ["opacity"]);
  assert.throws(() => channelAnimation({ name: animateChannel("a") }, { options, scope: null }), /name: animate\(\) belongs on a mark channel/);
  assert.throws(() => channelAnimation({ depthWrite: animateChannel(false) }, { options, scope: null }), /depthWrite: animate\(\) belongs on a mark channel/);
  // Field specs: y is position's second component, explicit; x (procedural) is suppressed; a
  // log y axis gives position's second component its kind.
  const { specs, kinds } = fieldAnimation(animation, { props: {} }, (axis) => (axis === "y" ? TRANSFORM_KINDS.log : TRANSFORM_KINDS.linear));
  assert.equal(specs.position.components[1].duration, 200);
  assert.deepEqual(specs.position.components[0], { suppressed: true });
  assert.equal(specs.position.kinds[1], TRANSFORM_KINDS.log);
  assert.equal(specs.size.kinds[0], TRANSFORM_KINDS.linear);
  assert.deepEqual(kinds.position.slice(0, 2), [TRANSFORM_KINDS.linear, TRANSFORM_KINDS.log]);
  const live = channelAnimation({ x: "moving", size: animateChannel("moving", { duration: 75 }) },
    { options, scope: { liveColumns: new Set(["moving"]) } });
  assert.deepEqual(live.liveChannels, { x: "moving", size: "moving" });
  assert.deepEqual(live.procedural, {}, "a dependent column does not start another clock");
  const current = fieldAnimation(live, { props: {} }, () => TRANSFORM_KINDS.linear);
  assert.deepEqual(current.specs.position.components[0], { suppressed: true });
  assert.equal(current.specs.size.components[0].duration, 75, "explicit animate wins over live suppression");
  const rect = fieldAnimation({ channels: { x0: { duration: 100, scale: true },
    y1: { duration: 250, scale: true } } }, { kind: "Rect", props: {} },
    axis => axis === "y" ? TRANSFORM_KINDS.log : TRANSFORM_KINDS.linear);
  assert.equal(rect.specs.position.components[0].duration, 100);
  assert.equal(rect.specs.extent.components[1].duration, 250);
  assert.equal(rect.specs.extent.kinds[1], TRANSFORM_KINDS.log);
  assert.equal(rect.specs.position.components[1], null);
});
