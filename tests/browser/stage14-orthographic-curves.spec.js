import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

test("orthographic curved paths follow the live projection center", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-orthographic-curves");
  await page.waitForFunction(() => window.stage14OrthographicCurves?.plot?.whenSettled);
  await page.locator("canvas").waitFor();
  const sample = () => page.evaluate(async () => {
    const plot = window.stage14OrthographicCurves.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0, sumX = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [r, g, b, a] = pixels.subarray(offset, offset + 4);
      if (a < 128 || g < 110 || g < r * 1.5 || g < b * 1.2) continue;
      count++;
      sumX += (offset / 4) % canvas.width;
    }
    return { count, x: sumX / count, width: canvas.width, error: plot.getRenderError() };
  });
  await expect.poll(async () => (await sample()).count).toBeGreaterThan(150);
  const centered = await sample();
  expect(Math.abs(centered.x - centered.width / 2)).toBeLessThan(15);
  expect(centered.error).toBe("");
  await page.evaluate(() => window.stage14OrthographicCurves.plot.setViewport({ center: [-120, 0] }));
  await expect.poll(async () => (await sample()).count).toBeLessThan(10);
  await page.evaluate(() => window.stage14OrthographicCurves.plot.setViewport({ center: [60, 0] }));
  await expect.poll(async () => (await sample()).count).toBeGreaterThan(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14OrthographicCurves.plot.setViewport({ center: [-120, 0] }));
  await expect.poll(async () => (await sample()).count).toBeLessThan(10);
  await page.evaluate(() => window.stage14OrthographicCurves.plot.setViewport({ center: [60, 0] }));
  await expect.poll(async () => (await sample()).count).toBeGreaterThan(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys;
    const existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});
