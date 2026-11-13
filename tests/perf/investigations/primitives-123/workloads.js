import {
  init,
  defaultDevice,
  numpy as np,
  blockUntilReady,
  getWebGPUDevice,
} from "@hmplot/jax";
import { tick } from "svelte";
import { waitForFrame, requireFrames } from "./guards.js";
import {
  scanCompact,
  sortCompact,
  scanBucket,
  sortBucket,
  scanBrackets,
  visibleNeighbors,
  searchBrackets,
} from "./candidates.js";
import { selected, history, bracketOracle, assertBrackets } from "./oracles.js";
import {
  deviceArray,
  deviceScalar,
} from "../../../../src/lib/plot/utils/deviceParams.js";
import { createDataScope } from "../../../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../../../src/lib/plot/utils/dataView.js";
import { interpolateSlice } from "../../../../src/lib/plot/utils/slice.js";
import { bucketSize } from "../../../../src/lib/plot/utils/transforms/filter.js";
import { resetSearchCache } from "./runtime.js";
import {
  runTransform,
  disposeTransformCache,
} from "../../../../src/lib/plot/utils/transforms.js";

export async function initialize() {
  const devices = await init();
  if (!devices.includes("webgpu")) throw Error("Real WebGPU is required");
  defaultDevice("webgpu");
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter.info.isFallbackAdapter)
    throw Error("Software adapter is not a timing target");
  return {
    devices,
    adapter: {
      vendor: adapter.info.vendor,
      architecture: adapter.info.architecture,
      device: adapter.info.device,
      description: adapter.info.description,
      isFallbackAdapter: adapter.info.isFallbackAdapter,
    },
  };
}

let completed = 0;
function drawProgress() {
  const ctx = document.getElementById("progress")?.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = completed % 2 ? "#fcaf32" : "#19c9a4";
  ctx.fillRect(0, 0, 300, 100);
  completed++;
}
const elapsed = (start) => performance.now() - start;
const counter = () => window.__gpuCounters?.snapshot() ?? null;
const delta = (a, b) =>
  a &&
  Object.fromEntries(
    [
      "compute",
      "render",
      "buffers",
      "bufferBytes",
      "liveBytes",
      "readbacks",
      "submits",
      "fences",
    ].map((k) => [k, b[k] - a[k]]),
  );

export async function compaction({
  n,
  visibility,
  phase = 0,
  method,
  bucket = false,
  verify = false,
  exactCount,
}) {
  const maskHost = Int32Array.from({ length: n }, (_, i) =>
    exactCount != null
      ? +((i * 17) % n < exactCount)
      : visibility === "none"
        ? 0
        : visibility === "all"
          ? 1
          : +(
              (((i + phase) % n) * 17) % 997 <
              (visibility === "sparse" ? 100 : 900)
            ),
  );
  const expected = selected(maskHost);
  const mask = deviceArray(maskHost, { dtype: "int32" });
  const source = deviceArray(Float32Array.from({ length: n }, (_, i) => i / 8));
  await blockUntilReady([mask, source]); // Uploads and fixture generation excluded in both arms.
  const before = counter(),
    begin = performance.now();
  // Match selectedIndices / Filter: exactly one scalar count read before dynamic size choice.
  const count = Number((await np.sum(mask.ref).data())[0]);
  const countMs = elapsed(begin);
  const size = bucket ? bucketSize(null, n, count) : count;
  const start = performance.now();
  const output = bucket
    ? (method === "scan" ? scanBucket : sortBucket)(
        mask.ref,
        deviceScalar(count, { dtype: "int32" }),
        size,
      )
    : [(method === "scan" ? scanCompact : sortCompact)(mask.ref, size)];
  const values = np.take(source.ref, output[0].ref, 0);
  await blockUntilReady([...output, values]);
  const operationMs = elapsed(start),
    totalMs = elapsed(begin),
    after = counter();
  drawProgress();
  if (verify) {
    const ids = Array.from(await output[0].ref.data());
    const want = Array.from(
      { length: size },
      (_, i) => expected[i] ?? expected[0] ?? 0,
    );
    if (ids.some((id, i) => id !== want[i]) || count !== expected.length)
      throw Error("Stable compaction parity failed");
    if (bucket) {
      const visible = Array.from(await output[1].ref.data());
      if (visible.some((v, i) => v !== +(i < count)))
        throw Error("Bucket mask parity failed");
    }
  }
  [...output, values, mask, source].forEach((a) => a.dispose());
  return {
    n,
    visibility,
    phase,
    method,
    bucket,
    count,
    size,
    countMs,
    operationMs,
    totalMs,
    completed,
    counters: delta(before, after),
  };
}

let state;
export async function setupHistory({ entities, steps, visibility }) {
  disposeHistory();
  const host = history(entities, steps, visibility);
  const time = deviceArray(host.times),
    shown = deviceArray(host.mask);
  const position = np.arange(host.times.length).astype(np.float32);
  const start = deviceArray(host.starts, { dtype: "int32" }),
    end = deviceArray(host.ends, { dtype: "int32" });
  const scope = createDataScope();
  scope.update({
    id: Int32Array.from({ length: entities * steps }, (_, i) =>
      Math.floor(i / steps),
    ),
    time: host.times,
    x: Float32Array.from({ length: entities * steps }, (_, i) =>
      Math.sin(i / 71),
    ),
    y: Float32Array.from({ length: entities * steps }, (_, i) =>
      Math.cos(i / 71),
    ),
    speed: Float32Array.from(
      { length: entities * steps },
      (_, i) => (i % 31) / 31,
    ),
  });
  const view = createDataView(scope, {
    mask: deviceArray(host.mask, { dtype: "int32" }),
    count: selected(host.mask).length,
  });
  state = {
    entities,
    steps,
    visibility,
    host,
    time,
    shown,
    position,
    start,
    end,
    scope,
    view,
    cache: {},
  };
  globalThis.__historySteps = steps;
  globalThis.__maskEpoch = (globalThis.__maskEpoch ?? 0) + 1;
  await blockUntilReady([time, shown, position, start, end]);
  return { entities, steps, visibility, rows: host.times.length };
}

export function disposeHistory() {
  resetSearchCache();
  if (!state) return;
  state.neighbors?.forEach((a) => a.dispose());
  state.view.dispose();
  state.cache.slice?.dispose();
  state.scope.dispose();
  [state.time, state.shown, state.position, state.start, state.end].forEach(
    (a) => a.dispose(),
  );
  state = null;
}

export async function bracket({
  method,
  at,
  changing = false,
  phase = 1,
  verify = false,
}) {
  const s = state;
  if (changing) {
    s.shown.dispose();
    s.host.mask = history(s.entities, s.steps, s.visibility, phase).mask;
    s.shown = deviceArray(s.host.mask);
    await blockUntilReady(s.shown);
    s.neighbors?.forEach((a) => a.dispose());
    s.neighbors = null;
  }
  const before = counter(),
    begin = performance.now();
  let setupMs = 0;
  if (method === "search" && !s.neighbors) {
    s.neighbors = visibleNeighbors(s.time.ref, s.shown.ref, s.position.ref);
    await blockUntilReady(s.neighbors);
    setupMs = elapsed(begin);
  }
  const output =
    method === "scan"
      ? scanBrackets(
          s.time.ref,
          s.shown.ref,
          s.position.ref,
          s.start.ref,
          s.end.ref,
          deviceScalar(at),
        )
      : searchBrackets(
          s.time.ref,
          s.neighbors[0].ref,
          s.neighbors[1].ref,
          s.start.ref,
          s.end.ref,
          deviceScalar(at),
          s.steps,
        );
  await blockUntilReady(output);
  const ms = elapsed(begin),
    after = counter();
  drawProgress();
  if (verify)
    assertBrackets(
      await Promise.all(output.map((a) => a.ref.data())),
      bracketOracle(s.host.times, s.host.mask, s.host.starts, s.host.ends, at),
      s.host.starts,
      s.host.ends,
    );
  output.forEach((a) => a.dispose());
  return {
    method,
    at,
    changing,
    phase,
    ms,
    setupMs,
    completed,
    counters: delta(before, after),
  };
}

export async function fullSlice({ method, at, verify = false }) {
  globalThis.__primitiveMode =
    method === "search" || method === "oracle" ? method : "sort";
  const s = state;
  if (method === "oracle") {
    const expected = bracketOracle(
      s.host.times,
      s.host.mask,
      s.host.starts,
      s.host.ends,
      at,
    );
    // Causal upper bound only: an impossible free bracket kernel with preuploaded endpoints.
    globalThis.__oracleBrackets = [
      deviceArray(expected.map((e) => e.lo)),
      deviceArray(expected.map((e) => e.hi)),
    ];
    await blockUntilReady(globalThis.__oracleBrackets);
  }
  const before = counter(),
    begin = performance.now();
  const view = await interpolateSlice(
    s.view,
    { field: "time", by: "id", at, values: ["x", "y", "speed"] },
    { cache: s.cache },
  );
  const values = ["x", "y", "speed"].map((k) => view.padded().get(k));
  await blockUntilReady([
    ...values,
    view.slice.lower,
    view.slice.upper,
    view.padded().valid,
  ]);
  const ms = elapsed(begin),
    after = counter();
  drawProgress();
  if (verify) {
    // Output entity order is first SHOWN source occurrence. Entirely hidden entities sort last.
    const expected = bracketOracle(
      s.host.times,
      s.host.mask,
      s.host.starts,
      s.host.ends,
      at,
    );
    const idsColumn = view.padded().get("id");
    const ids = Array.from(await (idsColumn.codes ?? idsColumn).ref.data());
    const actual = await Promise.all([
      view.slice.lower.ref.data(),
      view.slice.upper.ref.data(),
      view.padded().valid.ref.data(),
    ]);
    for (let i = 0; i < ids.length; i++) {
      const e = expected[ids[i]];
      if (
        Boolean(actual[2][i]) !== e.valid ||
        (e.valid && (actual[0][i] !== e.lo || actual[1][i] !== e.hi))
      )
        throw Error("Full Slice endpoint provenance mismatch");
    }
  }
  view.dispose();
  globalThis.__oracleBrackets?.forEach((a) => a.dispose());
  globalThis.__oracleBrackets = null;
  return { method, at, ms, completed, counters: delta(before, after) };
}

export async function movingMode(method) {
  resetSearchCache();
  globalThis.__primitiveMode = method;
  globalThis.__historySteps = 60;
  globalThis.__maskEpoch = (globalThis.__maskEpoch ?? 0) + 1;
  const moving = window.__movingParticles;
  moving.setTime(18.25);
  await tick();
  await moving.plot.whenSettled();
}

export async function movingFrame({ time, minimum }) {
  const moving = window.__movingParticles;
  const before = moving.plot.getDiagnostics().completedFrame,
    countersBefore = counter(),
    begin = performance.now();
  if (minimum != null) {
    globalThis.__maskEpoch++;
    moving.setMinimum(minimum);
  }
  moving.setTime(time);
  await tick();
  await waitForFrame(moving.plot, before);
  return {
    time,
    minimum,
    ms: elapsed(begin),
    completedFrames: moving.plot.getDiagnostics().completedFrame - before,
    counters: delta(countersBefore, counter()),
  };
}

export async function movingLive(ms) {
  const moving = window.__movingParticles,
    before = moving.plot.getDiagnostics().completedFrame;
  const countersBefore = counter(),
    times = [],
    begin = performance.now();
  moving.setPlaying(true);
  await new Promise((resolve) => {
    const tick = (now) => {
      times.push(now);
      if (now - begin < ms) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  moving.setPlaying(false);
  await tick();
  const durationMs = elapsed(begin),
    completedFrames = moving.plot.getDiagnostics().completedFrame - before;
  requireFrames(completedFrames);
  await moving.plot.whenSettled();
  return {
    durationMs,
    completedFrames,
    fps: (completedFrames * 1000) / durationMs,
    raf: times,
    counters: delta(countersBefore, counter()),
  };
}

export async function integrationCorrectness() {
  const checks = [];
  for (const method of ["sort", "scan"]) {
    globalThis.__primitiveMode = method;
    for (const exactCount of [
      0, 1, 16383, 16384, 16385, 32767, 32768, 32769, 124999, 125000,
    ]) {
      await compaction({
        n: 500000,
        exactCount,
        method,
        bucket: true,
        verify: true,
      });
    }
    const scope = createDataScope(),
      cache = {},
      views = [];
    const n = 90000,
      steps = 60;
    scope.update({
      id: Int32Array.from({ length: n }, (_, i) => Math.floor(i / steps)),
      time: Float32Array.from({ length: n }, (_, i) => i % steps),
      x: Float32Array.from({ length: n }, (_, i) => i),
    });
    try {
      for (const count of [100, 0, 1500, 200]) {
        const first = await runTransform(
          "Filter",
          scope,
          { where: { field: "id", op: "lt", value: count } },
          { cache },
        );
        views.push(first);
        const second = await runTransform("Filter", first, {
          where: { field: "time", op: "gt", value: 5 },
        });
        views.push(second);
        const ids = await second.sourceIndices().data();
        const expected = Array.from(
          { length: count * steps },
          (_, i) => i,
        ).filter((i) => i % steps > 5);
        if (
          ids.length !== expected.length ||
          ids.some((id, i) => id !== expected[i])
        )
          throw Error("Chained Filter provenance mismatch");
        if (count > 0) {
          const slice = await interpolateSlice(second, {
            field: "time",
            by: "id",
            at: 18.5,
            values: ["x"],
          });
          views.push(slice);
          const physical = slice.padded(),
            entities = await physical.get("id").ref.data();
          const [lower, upper, valid] = await Promise.all([
            slice.slice.lower.ref.data(),
            slice.slice.upper.ref.data(),
            physical.valid.ref.data(),
          ]);
          for (let i = 0; i < entities.length; i++)
            if (
              valid[i] &&
              (lower[i] !== entities[i] * steps + 18 ||
                upper[i] !== entities[i] * steps + 19)
            )
              throw Error("Filter -> Slice source endpoint mismatch");
        }
      }
      // Keep the first result alive through mask/cache replacement and later candidates.
      const retained = await views[0].sourceIndices().data();
      if (retained.length !== 6000 || retained.some((id, i) => id !== i))
        throw Error("Retained Filter result invalidated by cache replacement");
    } finally {
      views.reverse().forEach((view) => view.dispose());
      disposeTransformCache(cache);
      scope.dispose();
    }
    checks.push({
      method,
      bucketBoundaryCounts: [
        0, 1, 16383, 16384, 16385, 32767, 32768, 32769, 124999, 125000,
      ],
      chainedFilterSlice: true,
      retainedProvenance: true,
    });
  }
  return checks;
}
