import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters } from "./gpu-counters.js";

// TODO 17.11: jax-js and three never evict compiled pipelines, so growth has to stop at the
// source. Many fresh brushes of varying size and Filter-slider values on /test/filter-chain
// (after a warm-up) compile no pipelines and do not grow live GPU memory. On 500,000 rows the
// Filters compact into buckets (17.3h), each compiling once: growth stops once every bucket
// size has been visited.
test.beforeEach(async ({ page }) => { await page.addInitScript(installGpuCounters); });

const settle = (page) => page.evaluate(async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await window.filterChain.settle();
  await new Promise((resolve) => setTimeout(resolve, 50));
});
/** Seeded brush rectangles, [x0, y0, x1, y1] as plot fractions, sizes from 2% to 60%. */
function rectangles(count, seed) {
  let state = seed;
  const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: count }, () => {
    const w = 0.02 + 0.58 * next(), h = 0.02 + 0.58 * next();
    const x = 0.05 + (0.9 - w) * next(), y = 0.05 + (0.9 - h) * next();
    return [x, y, x + w, y + h];
  });
}
async function brush(page, b, [x0, y0, x1, y1]) {
  await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + b.width * (x0 + (x1 - x0) * i / 6), b.y + b.height * (y0 + (y1 - y0) * i / 6));
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await settle(page);
}
const slide = (page, value) => page.evaluate(async (v) => { window.filterChain.setThreshold(v); }, value).then(() => settle(page));
async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.filterChain?.plots?.a);
  await settle(page);
  await page.waitForTimeout(500);
  return page.locator('[aria-label="Plot canvas"]').first().boundingBox();
}

test("50 fresh brushes and 20 slider values: no new pipelines and no GPU memory growth after warm-up", { tag: "@gpu" }, async ({ page }) => {
  test.setTimeout(600000);
  const b = await open(page, "/test/filter-chain");
  const shapes = rectangles(50, 7), values = Array.from({ length: 20 }, (_, i) => Math.round(((i * 7.3) % 16) * 10) / 10);
  // Warm-up: a few brushes of every size and slider values, including a cleared brush.
  for (const shape of shapes.slice(0, 10)) await brush(page, b, shape);
  for (const value of values.slice(0, 5)) await slide(page, value);
  await page.mouse.click(5, 5); await settle(page);
  const after = await gpuCounters(page), live = [];
  for (const [index, shape] of shapes.slice(10).entries()) {
    await brush(page, b, shape);
    if (index < 15) await slide(page, values[5 + index]);
    live.push((await gpuCounters(page)).liveBytes);
  }
  const end = await gpuCounters(page);
  const summary = JSON.stringify({ compute: end.compute - after.compute, render: end.render - after.render,
    liveMB: live.map((bytes) => Math.round(bytes / 2 ** 20)) });
  expect(end.compute - after.compute, summary).toBe(0);
  expect(end.render - after.render, summary).toBe(0);
  // No trend: the last ten measurements are not above the first ten (5% slack).
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  expect(mean(live.slice(-10)), summary).toBeLessThanOrEqual(mean(live.slice(0, 10)) * 1.05);
});

test("on 500,000 rows, pipelines stop growing once every bucket size has been visited", async ({ page }) => {
  test.setTimeout(600000);
  // Plot F filters on the integer "bucket" column (16 values, 31,250 rows each), so a slider
  // value keeps an exact count: 15.5 none (the smallest bucket), 14.5 one level (32,768),
  // 13.5 two (65,536), 12.5 three (131,072), 11.5 and below the full capacity. Warm up by
  // sweeping down and back up (a bucket grows at once and shrinks late), then fresh values
  // between the same integers visit the same buckets and compile nothing.
  await open(page, "/test/filter-chain?rows=500000&plots=af");
  const sweep = [15.5, 14.5, 13.5, 12.5, 11.5, 9.5, 11.5, 12.5, 13.5, 14.5, 15.5, 15.5, 15.5, 14.5, 14.5, 14.5, 13.5, 13.5, 13.5, 12.5, 12.5, 12.5];
  for (const value of sweep) await slide(page, value);
  const after = await gpuCounters(page), live = [];
  for (const value of sweep.map((value) => value - 0.3)) {
    await slide(page, value);
    live.push((await gpuCounters(page)).liveBytes);
  }
  const end = await gpuCounters(page);
  const summary = JSON.stringify({ compute: end.compute - after.compute, render: end.render - after.render,
    liveMB: live.map((bytes) => Math.round(bytes / 2 ** 20)) });
  expect(end.compute - after.compute, summary).toBe(0);
  expect(end.render - after.render, summary).toBe(0);
  expect(Math.max(...live.slice(-6)), summary).toBeLessThanOrEqual(Math.max(...live.slice(0, 11)) * 1.05);
});
