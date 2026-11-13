import { getWebGPUDevice } from "@hmplot/jax";
import { initializePlot } from "../../src/lib/jaxExtensions/setup.js";
import {
  animationClock,
  BufferTransition,
} from "../../src/lib/plot/utils/animation.js";
import { markAnimation } from "../../src/lib/plot/utils/markAnimation.js";
import { NormalizeGPU } from "../../src/lib/plot/utils/normalizeGPU.js";
export async function numericalAnimations() {
  await initializePlot();
  const d = getWebGPUDevice(),
    owned = [];
  d.pushErrorScope("validation");
  const buffer = (values) => {
    const b = d.createBuffer({
      size: Math.max(16, values.byteLength),
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
    d.queue.writeBuffer(b, 0, values);
    owned.push(b);
    return b;
  };
  const read = async (b, n) => {
    const s = d.createBuffer({
      size: n * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const e = d.createCommandEncoder();
      e.copyBufferToBuffer(b, 0, s, 0, n * 4);
      d.queue.submit([e.finish()]);
      await s.mapAsync(GPUMapMode.READ);
      return Array.from(new Float32Array(s.getMappedRange()));
    } finally {
      s.destroy();
    }
  };
  const renderer = { backend: { device: d } },
    settings = {
      animation: true,
      animationDuration: 300,
      animationEasing: "linear",
    },
    owner = {
      renderer,
      options: { get: (k) => settings[k] },
      manager: { animationBatch: 1 },
      invalidate() {},
    };
  markAnimation(owner).ready = true;
  const clock = animationClock(renderer),
    unregister = clock.register(owner),
    output = buffer(new Float32Array([0, 2, 4, 6]));
  const t = new BufferTransition(renderer, owner, output, 4);
  try {
    await t.prepare((b) =>
      d.queue.writeBuffer(b, 0, new Float32Array([2, 4, 6, 8])),
    );
    clock.tracks.delete(t);
    t.apply(0.5, false);
    const midpoint = await read(output, 4);
    owner.manager.animationBatch++;
    await t.prepare((b) =>
      d.queue.writeBuffer(b, 0, new Float32Array([5, 7, 9, 11])),
    );
    clock.tracks.delete(t);
    t.apply(0.5, false);
    const retarget = await read(output, 4);
    const normal = new NormalizeGPU(d),
      normalized = buffer(new Float32Array(4));
    normal.run(output, normalized, 4, "auto");
    const auto = await read(normalized, 4);
    normal.run(output, normalized, 4, "symmetric");
    const symmetric = await read(normalized, 4);
    normal.dispose();
    owner.manager.animationBatch++;
    await t.prepare((b) =>
      d.queue.writeBuffer(b, 0, new Float32Array([NaN, 12, 14, 16])),
    );
    clock.tracks.delete(t);
    t.apply(0.25, false);
    const changedMask = await read(output, 4);
    const rgbaOut = buffer(new Float32Array([1, 0, 0, 0])),
      rgba = new BufferTransition(renderer, owner, rgbaOut, 4, undefined, true);
    owner.manager.animationBatch++;
    await rgba.prepare((b) =>
      d.queue.writeBuffer(b, 0, new Float32Array([0, 0, 1, 1])),
    );
    clock.tracks.delete(rgba);
    rgba.apply(0.5, false);
    const premultiplied = await read(rgbaOut, 4);
    rgba.dispose();
    const error = await d.popErrorScope();
    return {
      midpoint,
      retarget,
      auto,
      symmetric,
      premultiplied,
      changedMask: changedMask.map((v) => (Number.isNaN(v) ? "NaN" : v)),
      error: error?.message,
    };
  } finally {
    t.dispose();
    unregister();
    clock.dispose();
    await d.queue.onSubmittedWorkDone();
    owned.forEach((b) => b.destroy());
  }
}

// Per-row, scale-space transitions (Stage 13): eight rows with distinct start times, three
// transform kinds and a step channel, checked against the CPU reference blendValue.
export async function rowTransitions() {
  const { RowTransition, blendValue, TRANSFORM_KINDS } = await import("../../src/lib/plot/utils/animation.js");
  await initializePlot();
  const d = getWebGPUDevice(), owned = [];
  d.pushErrorScope("validation");
  const buffer = (values) => {
    const b = d.createBuffer({ size: Math.max(16, values.byteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(b, 0, values);
    owned.push(b);
    return b;
  };
  const read = async (b, n) => {
    const s = d.createBuffer({ size: n * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const e = d.createCommandEncoder();
      e.copyBufferToBuffer(b, 0, s, 0, n * 4);
      d.queue.submit([e.finish()]);
      await s.mapAsync(GPUMapMode.READ);
      return Array.from(new Float32Array(s.getMappedRange()));
    } finally { s.destroy(); }
  };
  const renderer = { backend: { device: d } };
  const settings = { animation: true, animationDuration: 1000, animationEasing: "linear" };
  const owner = { renderer, options: { get: (k) => settings[k] }, manager: { animationBatch: 1 }, invalidate() {} };
  markAnimation(owner).ready = true;
  const clock = animationClock(renderer), unregister = clock.register(owner);
  try {
    // Four components per row: linear, log, sqrt, step; two rows.
    const kinds = [TRANSFORM_KINDS.linear, TRANSFORM_KINDS.log, TRANSFORM_KINDS.sqrt, TRANSFORM_KINDS.step];
    const from = [0, 1, 0, 3, 10, 10, 4, 7], to = [10, 100, 16, 5, 20, 1000, 64, 9];
    const output = buffer(new Float32Array(from));
    const moving = { mode: 1, duration: 1000, easing: "quad-in" };
    const spec = { kinds, stride: 4, explicit: true, components: [moving, moving, moving, moving] };
    const t = new RowTransition(renderer, owner, output, 8, undefined, spec);
    clock.time = 1000;
    await t.prepare((b) => d.queue.writeBuffer(b, 0, new Float32Array(to)), { spec });
    clock.tracks.delete(t);
    clock.time = 1500;
    t.apply(0, false);
    const half = await read(output, 8);
    const expectedHalf = from.map((a, i) => blendValue(a, to[i], 0.5, kinds[i % 4], "quad-in"));
    // Retarget row 0 only; row 1 keeps its start and keeps moving.
    const next = [...to]; next[0] = 0; next[1] = 1;
    clock.time = 1500;
    await t.prepare((b) => d.queue.writeBuffer(b, 0, new Float32Array(next)), { spec });
    clock.tracks.delete(t);
    clock.time = 1750;
    t.apply(0, false);
    const retargeted = await read(output, 8);
    const expectedRetarget = [
      blendValue(half[0], 0, 0.25, kinds[0], "quad-in"), blendValue(half[1], 1, 0.25, kinds[1], "quad-in"),
      ...from.slice(2).map((a, j) => blendValue(a, to[j + 2], 0.75, kinds[(j + 2) % 4], "quad-in")),
    ];
    t.apply(0, true);
    const finished = await read(output, 8);
    t.dispose();
    const error = await d.popErrorScope();
    return { half, expectedHalf, retargeted, expectedRetarget, finished, expectedFinished: next, error: error?.message };
  } finally {
    unregister();
    owned.forEach((b) => b.destroy());
  }
}
