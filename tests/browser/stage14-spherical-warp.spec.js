import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

async function pixels(page) {
  return page.evaluate(async () => {
    const plot = window.stage14SphericalWarp.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    // Corner regions, centroids and pointer coordinates use the 400 CSS-pixel frame.
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const corners = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
    let topX = 0, topY = 0, orangeX = 0, orangeY = 0, orange = 0, hiddenRed = 0;
    for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
      const offset = (row * canvas.width + column) * 4,
        r = data[offset], g = data[offset + 1], b = data[offset + 2];
      if (r > 130 && r > g * 1.3 && r > b * 1.3) {
        orangeX += column; orangeY += row; orange++;
      }
      if (r > 130 && g < r * 0.45 && b < r * 0.45) hiddenRed++;
      // Geographic guide labels have blue antialiasing. Identify the point
      // fill itself when choosing the source row's click location.
      if (!(b > 130 && r < 85 && g > 70 && b > r * 1.6 && b > g * 1.2)) continue;
      if (column < 140 && row < 165) corners.topLeft++;
      if (column > 260 && row < 165) { corners.topRight++; topX += column; topY += row; }
      if (column < 140 && row > 235) corners.bottomLeft++;
      if (column > 260 && row > 235) corners.bottomRight++;
    }
    return { corners, top: [topX / corners.topRight, topY / corners.topRight],
      orange: [orangeX / orange, orangeY / orange, orange], hiddenRed,
      error: plot.getRenderError() };
  });
}

test("a Cartesian child range warps onto a centered orthographic spherical parent", async ({ page }) => {
  await page.goto("/test/stage14-spherical-warp");
  await page.waitForFunction(() => window.stage14SphericalWarp?.inset?.getFrameOptions());
  const result = await pixels(page);
  expect(result.error).toBe("");
  expect(result.hiddenRed).toBe(0);
  for (const count of Object.values(result.corners)) expect(count).toBeGreaterThan(20);
  expect(result.orange[2]).toBeGreaterThan(4);
  expect(Math.abs(result.orange[0] - 200)).toBeLessThan(10);
  expect(Math.abs(result.orange[1] - 200)).toBeLessThan(10);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + result.top[0] * bounds.width / 400,
    bounds.y + result.top[1] * bounds.height / 400);
  await expect.poll(() => page.evaluate(() => window.stage14SphericalWarp.lastPick?.instanceId)).toBe(2);
  const picked = await page.evaluate(() => window.stage14SphericalWarp.lastPick.axisValue);
  expect(Math.abs(picked.x - 1)).toBeLessThan(0.05);
  expect(Math.abs(picked.y - 1)).toBeLessThan(0.05);
});

test("the warped chart and third-level anchor follow root orthographic rotation", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-spherical-warp");
  await page.waitForFunction(() => window.stage14SphericalWarp?.globe?.getFrameOptions()?.frameDefinition?.parent === null);
  await page.evaluate(() => window.stage14SphericalWarp.plot.setViewport({ center: [20, 0] }));
  await pixels(page);
  await page.evaluate(() => window.stage14SphericalWarp.plot.setViewport({ center: [10, 0] }));
  await pixels(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14SphericalWarp.plot.setViewport({ center: [0, 0] }));
  await expect.poll(() => page.evaluate(() =>
    window.stage14SphericalWarp.globe.getFrameOptions().get("projectionCenter")?.[0])).toBe(0);
  const moved = await pixels(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys,
      existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(moved.error).toBe("");
  expect(moved.hiddenRed).toBe(0);
  expect(moved.orange[2]).toBeGreaterThan(4);
  expect(moved.orange[0]).toBeGreaterThan(250);
  expect(Math.abs(moved.orange[1] - 200)).toBeLessThan(10);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});
