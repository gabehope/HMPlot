// Steady-state Lorenz animation (/examples/lorenz-attractor: Simulate republishes every step to
// three canvases) for the performance gate in docs/REFACTOR-PLAN-2026-10-09.md. Each run opens the
// page twice, serially, and each time waits for the plots and warms up before its windows:
//   timing page: frames (rAF intervals, presented frames per canvas), then a CPU profile;
//   GPU page:    GPU counters (submits, readbacks, builds), then GPU pass timing.
// Measure a production build (npm run build, then vite preview): dev servers cost about a third
// more CPU. One JSON per run and summary.json (median and spread across runs) go to LORENZ_OUT.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join } from "node:path";
import {
  installGpuCounters,
  installGpuErrors,
  gpuCounters,
  countersDelta,
} from "../../browser/gpu-counters.js";
import {
  gpuTimingArgs,
  installGpuTiming,
  startGpuTiming,
  stopGpuTiming,
} from "./gpu-timing.mjs";

const base = process.env.LORENZ_URL ?? "http://127.0.0.1:4173";
const route = process.env.LORENZ_ROUTE ?? "/examples/lorenz-attractor";
const output =
  process.env.LORENZ_OUT ?? join(tmpdir(), "hmplot-lorenz-profile");
const runs = Number(process.env.LORENZ_RUNS ?? 3);
const warmupMs = 1000 * Number(process.env.LORENZ_WARMUP_S ?? 4);
const sampleMs = 1000 * Number(process.env.LORENZ_SAMPLE_S ?? 6);
if (!Number.isInteger(runs) || runs < 1)
  throw Error("LORENZ_RUNS must be a positive integer.");
if (!(warmupMs >= 0) || !(sampleMs > 0))
  throw Error("LORENZ_WARMUP_S and LORENZ_SAMPLE_S must be seconds.");

/** A presented frame: getCurrentTexture returning a new texture (it repeats within a frame). */
function installPresentedFrames() {
  const state = (window.__presented = { record: false, counts: new Map() });
  const last = new WeakMap(),
    get = GPUCanvasContext.prototype.getCurrentTexture;
  GPUCanvasContext.prototype.getCurrentTexture = function () {
    const texture = get.call(this);
    if (last.get(this) !== texture) {
      last.set(this, texture);
      if (state.record)
        state.counts.set(this.canvas, (state.counts.get(this.canvas) ?? 0) + 1);
    }
    return texture;
  };
}

async function open(browser, scripts) {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1100 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  for (const script of [installGpuErrors, installPresentedFrames, ...scripts])
    await page.addInitScript(script);
  await page.goto(base + route);
  await page.waitForFunction(
    () =>
      document.querySelector(".canvas") &&
      [...document.querySelectorAll(".canvas")].every(
        (canvas) => canvas.getAttribute("aria-busy") === "false",
      ),
    null,
    { timeout: 90000 },
  );
  // window.__examples exists on a dev server only (Example.svelte): a production page has no settle.
  const settled = await page.evaluate(() =>
    window.__examples?.plot
      ? Promise.race([
          window.__examples.settle().then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
        ])
      : null,
  );
  await page.locator(".example").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(warmupMs);
  return { page, errors, settled };
}

/** Samples `sampleMs` of frames: rAF timestamps and presented frames per plot canvas. */
async function frames(page) {
  await page.evaluate(() => {
    const state = (window.__lorenzFrames = {
      times: [],
      stop: false,
      start: performance.now(),
    });
    const tick = (time) => {
      state.times.push(time);
      if (!state.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__presented.counts.clear();
    window.__presented.record = true;
  });
  await page.waitForTimeout(sampleMs);
  const { wallMs, times, presented } = await page.evaluate(() => {
    const state = window.__lorenzFrames;
    state.stop = true;
    window.__presented.record = false;
    return {
      wallMs: performance.now() - state.start,
      times: state.times,
      presented: [...document.querySelectorAll(".canvas canvas")].map(
        (canvas) => window.__presented.counts.get(canvas) ?? 0,
      ),
    };
  });
  const intervals = times
    .slice(1)
    .map((time, i) => time - times[i])
    .sort((a, b) => a - b);
  const at = (p) =>
    intervals.length
      ? round(
          intervals[
            Math.min(intervals.length - 1, Math.floor(p * intervals.length))
          ],
        )
      : null;
  return {
    wallMs: round(wallMs),
    frames: times.length,
    fps: round((times.length / wallMs) * 1000),
    frameP50: at(0.5),
    frameP95: at(0.95),
    maxGap: intervals.length ? round(intervals.at(-1)) : null,
    canvases: presented.map((count) => ({
      presented: count,
      fps: round((count / wallMs) * 1000),
    })),
  };
}

/**
 * Active main-thread CPU as on 2026-10-08: a sample lasts until the next one (timeDeltas[i + 1]),
 * and every sample but (idle) is active, (program) and (garbage collector) included; those two
 * are also reported on their own.
 */
function cpuTime(profile, frameCount) {
  const names = new Map(
    profile.nodes.map((node) => [node.id, node.callFrame.functionName]),
  );
  const ms = { "(idle)": 0, "(program)": 0, "(garbage collector)": 0 };
  let sampled = 0;
  profile.samples.forEach((id, i) => {
    const delta = (profile.timeDeltas[i + 1] ?? 0) / 1000,
      name = names.get(id);
    sampled += delta;
    if (name in ms) ms[name] += delta;
  });
  const active = sampled - ms["(idle)"];
  return {
    sampledMs: round(sampled),
    idleMs: round(ms["(idle)"]),
    programMs: round(ms["(program)"]),
    garbageCollectorMs: round(ms["(garbage collector)"]),
    activeMs: round(active),
    activeMsPerFrame: round(active / frameCount),
  };
}

const round = (value, digits = 3) => Number(value.toFixed(digits));
const spread = (values) => {
  const sorted = values
    .filter((value) => typeof value === "number")
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  const median =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    median: round(median),
    min: sorted[0],
    max: sorted.at(-1),
    spread: round(sorted.at(-1) - sorted[0]),
    runs: values,
  };
};

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", ...gpuTimingArgs],
});
const results = [];
try {
  for (let run = 1; run <= runs; run++) {
    const timing = await open(browser, []);
    const devicePixelRatio = await timing.page.evaluate(() => devicePixelRatio);
    const plain = await frames(timing.page);
    const cdp = await timing.page.context().newCDPSession(timing.page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");
    const profiled = await frames(timing.page);
    const { profile } = await cdp.send("Profiler.stop");
    await writeFile(
      join(output, `run-${run}.cpuprofile`),
      JSON.stringify(profile),
    );
    const timingErrors = [
      ...timing.errors,
      ...(await timing.page.evaluate(() => window.__gpuErrors)),
    ];
    await timing.page.close();

    const gpu = await open(browser, [installGpuCounters, installGpuTiming]);
    const before = await gpuCounters(gpu.page);
    const counted = await frames(gpu.page);
    const after = await gpuCounters(gpu.page);
    const work = await countersDelta(gpu.page, before, after);
    await startGpuTiming(gpu.page);
    const timed = await frames(gpu.page);
    const passes = await stopGpuTiming(gpu.page, timed.frames);
    const gpuErrors = [
      ...gpu.errors,
      ...(await gpu.page.evaluate(() => window.__gpuErrors)),
    ];
    await gpu.page.close();

    const result = {
      run,
      base,
      route,
      browser: browser.version(),
      devicePixelRatio,
      warmupMs,
      sampleMs,
      settled: { timing: timing.settled, gpu: gpu.settled },
      frames: plain,
      cpu: { ...cpuTime(profile, profiled.frames), frames: profiled },
      counters: {
        frames: counted,
        submitsPerFrame: round(work.submits / counted.frames),
        readbacksPerFrame: round(work.readbacks / counted.frames),
        // Pipelines and shader modules created while warm: expected 0.
        builds: work.compute + work.render + work.shaders,
        liveMB: round(after.liveBytes / 2 ** 20, 1),
        work,
      },
      gpuTiming: passes && { ...passes, frames: timed },
      errors: [...timingErrors, ...gpuErrors],
    };
    await writeFile(
      join(output, `run-${run}.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        run,
        fps: plain.fps,
        presentedFps: plain.canvases.map((canvas) => canvas.fps),
        frameP50: plain.frameP50,
        frameP95: plain.frameP95,
        cpuMsPerFrame: result.cpu.activeMsPerFrame,
        gpuMsPerFrame: passes?.msPerFrame ?? null,
        submitsPerFrame: result.counters.submitsPerFrame,
        readbacksPerFrame: result.counters.readbacksPerFrame,
        builds: result.counters.builds,
        errors: result.errors.length,
      }),
    );
    if (result.errors.length)
      throw Error(
        `Lorenz run ${run} reported errors:\n${result.errors.join("\n")}`,
      );
    results.push(result);
  }
  const canvasCount = Math.max(
    ...results.map((result) => result.frames.canvases.length),
  );
  const summary = {
    base,
    route,
    browser: browser.version(),
    devicePixelRatio: results[0].devicePixelRatio,
    machine: { cpu: cpus()[0]?.model, platform: platform(), arch: arch() },
    runs,
    warmupMs,
    sampleMs,
    note:
      "Medians and spread (max - min) across runs. Frames: rAF callbacks during the plain window; per-frame values divide by them. " +
      "CPU counts (program) and (garbage collector) as active, as on 2026-10-08. GPU time is the union of timed passes.",
    metrics: {
      fps: spread(results.map((result) => result.frames.fps)),
      presentedFps: Array.from({ length: canvasCount }, (_, i) =>
        spread(results.map((result) => result.frames.canvases[i]?.fps ?? 0)),
      ),
      frameP50: spread(results.map((result) => result.frames.frameP50)),
      frameP95: spread(results.map((result) => result.frames.frameP95)),
      cpuMsPerFrame: spread(
        results.map((result) => result.cpu.activeMsPerFrame),
      ),
      gpuMsPerFrame: spread(
        results.map((result) => result.gpuTiming?.msPerFrame ?? null),
      ),
      submitsPerFrame: spread(
        results.map((result) => result.counters.submitsPerFrame),
      ),
      readbacksPerFrame: spread(
        results.map((result) => result.counters.readbacksPerFrame),
      ),
      builds: spread(results.map((result) => result.counters.builds)),
    },
  };
  await writeFile(
    join(output, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary.metrics));
} finally {
  await browser.close();
}
