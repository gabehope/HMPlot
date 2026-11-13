// GPU and CPU work per gesture (TODO Stage 17.0). Not part of the regular suite:
//   PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/gesture-churn.spec.js
// Each scenario runs its gesture three times on one page:
//   cold  = the first time (compiles everything the gesture needs);
//   warm  = the IDENTICAL gesture again (every literal value repeats, so it hits every cache);
//   fresh = a DIFFERENT gesture of the same kind (another path, other brush extents or slider
//           values). This is what a user pays; warm alone hides kernels that bake values in.
// Reported per phase: compute / render pipelines, shader modules, buffers created and their KB,
// readbacks (by source) with latency percentiles, mark build() calls, wall time, and main-thread
// CPU by package (jax-js hashing separately). One "RESULT {json}" line per scenario.
import { test as base } from "@playwright/test";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta, profileCpu } from "../browser/gpu-counters.js";
const test = process.env.PERF ? base : base.skip;

const box = (page, index = 0) => page.locator('[aria-label="Plot canvas"]').nth(index).boundingBox();
async function drag(page, b, from, to, shift = false, steps = 20) {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(b.x + b.width * (from[0] + (to[0] - from[0]) * i / steps), b.y + b.height * (from[1] + (to[1] - from[1]) * i / steps));
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
async function sweep(page, b, y, steps = 30) {
  for (let i = 0; i <= steps; i++) await page.mouse.move(b.x + b.width * (0.1 + 0.8 * i / steps), b.y + b.height * y);
}
async function wheel(page, b, at, delta, times = 10) {
  await page.mouse.move(b.x + b.width * at[0], b.y + b.height * at[1]);
  for (let i = 0; i < times; i++) { await page.mouse.wheel(0, delta); await page.waitForTimeout(40); }
}
const settle = (page) => page.evaluate(async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  // A page with no plot handle to settle (an example that binds its plot) gets a fixed wait,
  // or the phase would end before the work it caused is counted.
  const handle = window.__examples?.plot ?? window.filterChain ?? window.labelHover?.plot;
  if (!handle) await new Promise((resolve) => setTimeout(resolve, 800));
  await window.__examples?.settle?.();
  await window.filterChain?.settle?.();
  await window.labelHover?.plot?.whenSettled?.();
});
const clear = async (page) => { await page.mouse.click(5, 5); await settle(page); };
async function slide(page, values) {
  for (const value of values) {
    await page.evaluate((v) => window.filterChain.setThreshold(v), value);
    await settle(page);
  }
}
// variant 0 is the cold/warm gesture, variant 1 the fresh one.
const brush = (a, b) => async (page, box, variant) => drag(page, box, ...(variant ? b : a), true);
const BRUSHES = brush([[0.2, 0.2], [0.6, 0.6]], [[0.25, 0.3], [0.7, 0.55]]);
const scenarios = {
  "categories hover": { url: "/examples/categories", run: (page, b, v) => sweep(page, b, v ? 0.42 : 0.5) },
  "categories brush": { url: "/examples/categories", run: BRUSHES, reset: clear },
  "categories brush resize": {
    url: "/examples/categories", setup: (page, b) => drag(page, b, [0.2, 0.2], [0.6, 0.6], true),
    run: (page, b, v) => drag(page, b, v ? [0.62, 0.58] : [0.6, 0.6], v ? [0.75, 0.85] : [0.8, 0.8]),
  },
  "categories legend toggle": {
    url: "/examples/categories",
    run: async (page, b, v) => { const button = page.locator("[data-plot-guide] button").nth(v ? 1 : 0); await button.click({ timeout: 10000 }); await settle(page); await button.click({ timeout: 10000 }); },
  },
  "dashboard brush": { url: "/test/gallery-example?id=interaction-dashboard", run: BRUSHES, reset: clear },
  "dashboard hover": { url: "/test/gallery-example?id=interaction-dashboard", run: (page, b, v) => sweep(page, b, v ? 0.42 : 0.5) },
  "keyed updates advance": {
    url: "/test/gallery-example?id=interaction-keyed-updates",
    run: async (page) => { for (let i = 0; i < 4; i++) { await page.getByRole("button", { name: /advance|next/i }).first().click(); await settle(page); } },
  },
  "timeseries zoom": { url: "/examples/timeseries", run: (page, b, v) => wheel(page, b, v ? [0.4, 0.6] : [0.5, 0.5], v ? -90 : -120) },
  "timeseries pan": { url: "/examples/timeseries", run: (page, b, v) => drag(page, b, v ? [0.55, 0.45] : [0.6, 0.5], v ? [0.35, 0.6] : [0.3, 0.5]) },
  "large-graph zoom": { url: "/examples/large-graph", run: (page, b, v) => wheel(page, b, v ? [0.4, 0.6] : [0.5, 0.5], v ? -90 : -120) },
  "histogram bins": {
    url: "/examples/histograms",
    // The bin count is the example's Bins slider (an input).
    run: async (page, b, v) => { const s = page.getByRole("slider", { name: "Bins", exact: true }); for (const value of v ? ["16", "30", "48"] : ["12", "24", "40"]) { await s.fill(value, { timeout: 10000 }); await settle(page); } },
  },
  "matrix scroll": {
    url: "/test/gallery-example?id=interaction-matrix",
    run: async (page, b, v) => { for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, v ? 430 : 500); await page.waitForTimeout(250); } await page.mouse.wheel(0, -4000); await page.waitForTimeout(500); },
  },
  "mona brush": { url: "/examples/mona-lisa-histogram", run: BRUSHES, reset: clear },
  "label-hover hover": { url: "/test/label-hover", run: (page, b, v) => sweep(page, b, v ? 0.42 : 0.5) },
  "filter-chain brush": { url: "/test/filter-chain", run: BRUSHES, reset: clear },
  "filter-chain brush 500k": { url: "/test/filter-chain?rows=500000", run: BRUSHES, reset: clear },
  "filter-chain narrow brush 500k": { url: "/test/filter-chain?rows=500000", run: brush([[0.4, 0.4], [0.47, 0.47]], [[0.52, 0.3], [0.58, 0.38]]), reset: clear },
  // Values between two integers of "bucket" keep the match count: only the literal changes.
  "filter-chain slider (same count)": { url: "/test/filter-chain", run: (page, b, v) => slide(page, v ? [7.15, 7.45, 7.85] : [7.2, 7.4, 7.7]) },
  "filter-chain slider (new counts)": { url: "/test/filter-chain", run: (page, b, v) => slide(page, v ? [4.5, 9.5, 11.5] : [5.5, 6.5, 8.5]) },
};

const only = process.env.SCENARIO ? new RegExp(process.env.SCENARIO) : null;
for (const [name, scenario] of Object.entries(scenarios)) {
  if (only && !only.test(name)) continue;
  test(name, async ({ page }) => {
    await page.addInitScript(installGpuCounters);
    const start = performance.now();
    await page.goto(scenario.url);
    // Some gallery examples bind their plot instead of reporting it (no __examples.plot).
    await page.waitForFunction(() => window.__examples?.plot || window.filterChain?.plots?.a || window.labelHover?.label ||
      document.querySelector('[aria-label="Plot canvas"]'));
    await settle(page); await page.waitForTimeout(1500);
    const load = await gpuCounters(page);
    await countMarkBuilds(page);
    const cdp = await page.context().newCDPSession(page);
    const b = await box(page);
    if (scenario.setup) { await scenario.setup(page, b); await settle(page); await page.waitForTimeout(500); }
    const out = { name, load: { compute: load.compute, render: load.render, shaders: load.shaders, readbacks: load.readbacks, bufferMB: Math.round(load.bufferBytes / 2 ** 20), ms: Math.round(performance.now() - start) } };
    for (const [phase, variant] of [["cold", 0], ["warm", 0], ["fresh", 1]]) {
      const before = await gpuCounters(page);
      const cpu = await profileCpu(page, cdp, async () => { await scenario.run(page, b, variant); await settle(page); await page.waitForTimeout(300); });
      out[phase] = { ...(await countersDelta(page, before, await gpuCounters(page))), cpu };
      await page.waitForTimeout(300);
      if (scenario.reset) await scenario.reset(page);
      await page.waitForTimeout(300);
    }
    console.log(`RESULT ${JSON.stringify(out)}`);
  });
}
