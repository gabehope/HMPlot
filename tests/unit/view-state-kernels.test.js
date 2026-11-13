// TODO 28 T5: a transform that reads @time re-runs as the clock moves, and a new time compiles
// nothing: view-state values reach kernels from buffers (utils/viewState.js hoisting).
import test from "node:test";
import { assertReused } from "./compiled-programs.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { disposeTransformCache } from "../../src/lib/plot/utils/transforms/common.js";
import { col, add, subtract, multiply, divide, less, sin, floor, round, interval, mean, view } from "../../src/lib/plot/utils/expressions.js";

const time = view.time;
const n = 2000;
// Each test owns its scope, and so the device copies of its columns (made on first read).
let scope;
const withScope = (body) => async () => {
  scope = createDataScope();
  scope.update({
    t: Float32Array.from({ length: n }, (_, i) => i * 10),
    x: Float32Array.from({ length: n }, (_, i) => Math.sin(i)),
  });
  try { await body(); } finally { scope.dispose(); }
};
const run = async (kind, config, at) => {
  const view = await runTransform(kind, scope, { ...config, __viewState: { time: at, live: true } });
  // Read every output, so its kernels run inside the recording (jax-js dispatches lazily).
  for (const name of Object.keys(config.columns ?? {})) await view.get(name).ref.data();
  if (view.padded) await view.padded().valid.ref.data();
  view.dispose();
};

test("a Calculate over @time compiles nothing new for a new time", withScope(async () => {
  const columns = {
    wave: multiply("x", sin(divide(time, 1000))),
    age: subtract(time, "t"),
    second: add("x", floor(divide(time, 1000))),
    stepped: add("t", interval(round(divide(time, 250)), 500)),
    centered: subtract("x", add(mean("x"), divide(time, 1e6))),
  };
  await assertReused(() => run("Calculate", { columns }, 16), () => run("Calculate", { columns }, 12345.5), "Calculate");
}));

test("a Filter on @time compiles nothing new as the time or the kept count changes", withScope(async () => {
  const where = [less("t", time)];
  // 0 rows kept, then some, then all: the count is a readback, never a kernel literal.
  await assertReused(() => run("Filter", { where }, 0), () => run("Filter", { where }, 7777), "Filter partial");
  await assertReused(() => run("Filter", { where }, 0), () => run("Filter", { where }, 1e9), "Filter full");
  const stepped = [less("t", interval(time, 500))];
  await assertReused(() => run("Filter", { where: stepped }, 499), () => run("Filter", { where: stepped }, 5100), "Filter interval");
}));

test("tween state compiles nothing new as the clock moves or the targets change (TODO 28 Part B)", async () => {
  const { tween, greater, mean } = await import("../../src/lib/plot/utils/expressions.js");
  const tweens = createDataScope();
  const make = (offset) => ({ x: Float32Array.from({ length: n }, (_, i) => Math.cos(i) + offset), y: Float32Array.from({ length: n }, (_, i) => i) });
  tweens.update(make(0));
  const cache = {};
  const timing = { duration: 1000, easing: "cubic-in-out" };
  const columns = { h: tween("x", timing), d: multiply(tween("x", timing), 2), m: subtract("y", mean(tween("x", timing))) };
  const step = async (at) => {
    const view = await runTransform("Calculate", tweens, { columns, __viewState: { time: at } }, { cache });
    for (const name of ["d", "m"]) await view.get(name).ref.data();
    // Consumers read the producer's current snapshot without a sampling transform.
    const kept = await runTransform("Filter", view, { where: [greater("h", 0.5)] });
    kept.dispose(); view.dispose();
  };
  await step(0);
  tweens.update(make(1));
  await assertReused(() => step(100), () => step(700), "a tween moving");
  await assertReused(() => { tweens.update(make(2)); return step(800); }, () => { tweens.update(make(3)); return step(900); }, "a retarget");
  disposeTransformCache(cache);
  tweens.dispose();
});
