import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

// The source probes and pointer coordinates use the fixture's 400×400 CSS-pixel frame.
// Only scratch-canvas sampling is rescaled; native DPR rendering/export are preserved.

test("a Cartesian child range warps through its polar parent's angle and radius", async ({ page }) => {
  await page.goto("/test/stage14-polar-warp");
  await page.waitForFunction(() => window.stage14PolarWarp?.inset?.getFrameOptions());
  const result = await page.evaluate(async () => {
    const plot = window.stage14PolarWarp.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const quadrants = { innerRight: 0, outerRight: 0, innerTop: 0, outerTop: 0 };
    let topX = 0, topY = 0, orangeX = 0, orangeY = 0, orangeCount = 0;
    for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
      const offset = (row * canvas.width + column) * 4,
        r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (r > 130 && r > g * 1.3 && r > b * 1.3) {
        orangeX += column; orangeY += row; orangeCount++;
      }
      if (!(b > 95 && b > r * 1.3 && b > g * 1.05)) continue;
      const dx = column - 200, dy = row - 200;
      if (dx > 35 && dx < 95 && Math.abs(dy) < 20) quadrants.innerRight++;
      if (dx > 100 && dx < 155 && Math.abs(dy) < 20) quadrants.outerRight++;
      if (dy < -35 && dy > -95 && Math.abs(dx) < 20) quadrants.innerTop++;
      if (dy < -100 && dy > -155 && Math.abs(dx) < 20) {
        quadrants.outerTop++; topX += column; topY += row;
      }
    }
    return { quadrants, top: [topX / quadrants.outerTop, topY / quadrants.outerTop],
      orange: [orangeX / orangeCount, orangeY / orangeCount, orangeCount],
      error: plot.getRenderError(), bytes: (await plot.exportPNG()).size };
  });
  expect(result.error).toBe("");
  expect(result.bytes).toBeGreaterThan(1000);
  for (const count of Object.values(result.quadrants)) expect(count).toBeGreaterThan(20);
  expect(result.orange[2]).toBeGreaterThan(4);
  expect(result.orange[0]).toBeGreaterThan(240);
  expect(result.orange[0]).toBeLessThan(300);
  expect(result.orange[1]).toBeGreaterThan(100);
  expect(result.orange[1]).toBeLessThan(160);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + result.top[0] * bounds.width / 400,
    bounds.y + result.top[1] * bounds.height / 400);
  await expect.poll(() => page.evaluate(() => window.stage14PolarWarp.lastPick?.instanceId)).toBe(2);
  const picked = await page.evaluate(() => window.stage14PolarWarp.lastPick.axisValue);
  expect(Math.abs(picked.x - 1)).toBeLessThan(0.05);
  expect(Math.abs(picked.y - 1)).toBeLessThan(0.05);
});

test("changing a warped child's numeric angular range keeps its warm pipelines", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-polar-warp");
  await page.waitForFunction(() => window.stage14PolarWarp?.inset?.getFrameOptions());
  await page.evaluate(() => window.stage14PolarWarp.angleEnd(8));
  await expect.poll(() => page.evaluate(() =>
    window.stage14PolarWarp.inset.getFrameOptions().get("_frameXRange")?.[1])).toBe(8);
  await page.evaluate(() => window.stage14PolarWarp.plot.whenSettled());
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14PolarWarp.angleEnd(12));
  await expect.poll(() => page.evaluate(() =>
    window.stage14PolarWarp.inset.getFrameOptions().get("_frameXRange")?.[1])).toBe(12);
  await page.evaluate(() => window.stage14PolarWarp.plot.whenSettled());
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const moved = await page.evaluate(async () => {
    const image = await createImageBitmap(await window.stage14PolarWarp.plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let y = 180; y < 220; y++) for (let x = 45; x < 100; x++) {
      const offset = (y * canvas.width + x) * 4,
        r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (b > 95 && b > r * 1.3 && b > g * 1.05) count++;
    }
    let x = 0, y = 0, orange = 0;
    for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
      const offset = (row * canvas.width + column) * 4,
        r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (r > 130 && r > g * 1.3 && r > b * 1.3) { x += column; y += row; orange++; }
    }
    return { left: count, orange: [x / orange, y / orange, orange] };
  });
  expect(moved.left).toBeGreaterThan(20);
  expect(moved.orange[2]).toBeGreaterThan(4);
  expect(Math.abs(moved.orange[0] - 200)).toBeLessThan(10);
  expect(moved.orange[1]).toBeLessThan(130);
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("sqrt and log child scales reach the same polar pixels and inverse pick", async ({ page }) => {
  await page.goto("/test/stage14-polar-warp");
  await page.waitForFunction(() => window.stage14PolarWarp?.nonlinear?.getFrameOptions());
  const green = await page.evaluate(async () => {
    const plot = window.stage14PolarWarp.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let x = 0, y = 0, count = 0;
    for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
      const offset = (row * canvas.width + column) * 4,
        r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (g > 85 && g > r * 1.3 && g > b * 1.15) { x += column; y += row; count++; }
    }
    return { x: x / count, y: y / count, count, error: plot.getRenderError() };
  });
  expect(green.error).toBe("");
  expect(green.count).toBeGreaterThan(20);
  expect(green.x).toBeGreaterThan(100);
  expect(green.x).toBeLessThan(160);
  expect(green.y).toBeGreaterThan(240);
  expect(green.y).toBeLessThan(300);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + green.x * bounds.width / 400,
    bounds.y + green.y * bounds.height / 400);
  await expect.poll(() => page.evaluate(() => window.stage14PolarWarp.lastNonlinearPick?.instanceId)).toBe(0);
  const picked = await page.evaluate(() => window.stage14PolarWarp.lastNonlinearPick.axisValue);
  expect(Math.abs(picked.x - 1)).toBeLessThan(0.05);
  expect(Math.abs(picked.y - 10)).toBeLessThan(0.1);
});

test("interval brushing reports an error and recovers; warped guides draw along the chain", async ({ page }) => {
  await page.goto("/test/stage14-polar-warp");
  await page.waitForFunction(() => window.stage14PolarWarp?.nonlinear?.getFrameOptions());
  const error = () => page.evaluate(() => window.stage14PolarWarp.plot.getRenderError());
  await expect.poll(error).toBe("");
  await page.evaluate(() => window.stage14PolarWarp.brush(true));
  await expect.poll(error).toMatch(/cannot produce a Cartesian interval brush inside a nested coordinate override/);
  await page.evaluate(() => window.stage14PolarWarp.brush(false));
  await expect.poll(error).toBe("");
  // Guides on the warped chart are drawn through the chain, not an error.
  const warpedGuides = () => page.evaluate(() =>
    document.querySelectorAll('svg[aria-label="Warped frame guides"] .warped-grid').length);
  await page.evaluate(() => window.stage14PolarWarp.guides(true));
  await expect.poll(warpedGuides).toBeGreaterThan(0);
  expect(await error()).toBe("");
  await page.evaluate(() => window.stage14PolarWarp.guides(false));
  await expect.poll(warpedGuides).toBe(0);
  expect(await error()).toBe("");
});
