// TODO 141: navigating a 2D globe with its guides on and off. Not part of the regular suite:
//   PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/globe-guides.spec.js
// Identical 40-event wheel sequences (in and out, off center, so the center also turns) over
// /test/globe-guide-perf at DPR 2, guides on, off, on, off, each on a fresh page. Reported per
// run: mean and p95 frame interval while the sequence plays, completed frames, render pipelines,
// shader modules and buffers created, and frames drawn in a second of idle afterwards.
import { test as base, expect } from "@playwright/test";
import { installGpuCounters, gpuCounters, countersDelta } from "../browser/gpu-counters.js";
const test = process.env.PERF ? base : base.skip;
test.use({ deviceScaleFactor: 2 });

test("globe navigation with guides on and off", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  const results = [];
  for (const guides of ["on", "off", "on", "off"]) {
    await page.goto(`/test/globe-guide-perf?guides=${guides}`);
    await page.waitForFunction(() => window.globeGuidePerf?.plot?.whenSettled);
    await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(1);
    await page.evaluate(() => window.globeGuidePerf.plot.whenSettled());
    const box = await page.locator('[aria-label="Plot canvas"]').boundingBox();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.4);
    // Warm once, then measure the identical sequence.
    for (const measure of [false, true]) {
      const before = await gpuCounters(page);
      await page.evaluate(() => {
        window.__frames = [];
        const tick = (now) => { window.__frames.push(now); if (window.__frames.length < 100000) window.__tick = requestAnimationFrame(tick); };
        window.__tick = requestAnimationFrame(tick);
      });
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, i % 20 < 10 ? -120 : 120);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      }
      const frames = await page.evaluate(() => { cancelAnimationFrame(window.__tick); return window.__frames; });
      await page.evaluate(() => window.globeGuidePerf.plot.whenSettled());
      const work = await countersDelta(page, before, await gpuCounters(page));
      if (!measure) continue;
      const intervals = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
      const idle = await page.evaluate(async () => {
        const start = window.__gpuCounters.snapshot().submits;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return window.__gpuCounters.snapshot().submits - start;
      });
      results.push({ guides, frames: frames.length,
        meanMs: +(intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(2),
        p95Ms: +intervals[Math.floor(intervals.length * 0.95)].toFixed(2),
        render: work.render, shaders: work.shaders, buffers: work.buffers, bufferKB: work.bufferKB, idleSubmits: idle });
    }
  }
  console.log("RESULT " + JSON.stringify(results));
});
