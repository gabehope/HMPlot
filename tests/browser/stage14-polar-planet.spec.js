import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

test("a spherical point inset follows its polar orbital anchor", async ({ page }) => {
  await page.goto("/test/stage14-polar-planet");
  await page.locator("canvas").waitFor();
  await page.waitForFunction(() => window.stage14Planet?.planet?.getFrameOptions());
  const center = () => page.evaluate(async () => {
    const plot = window.stage14Planet.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    // Centroids and click coordinates below are in the 400 CSS-pixel fixture frame.
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let x = 0, y = 0, count = 0;
    for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
      const offset = (row * canvas.width + column) * 4,
        r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (r > 130 && r > g * 1.3 && r > b * 1.3) { x += column; y += row; count++; }
    }
    return { x: x / count, y: y / count, count, error: plot.getRenderError() };
  });
  await expect.poll(async () => (await center()).count).toBeGreaterThan(30);
  const top = await center();
  expect(top.error).toBe("");
  expect(Math.abs(top.x - 200)).toBeLessThan(30);
  expect(top.y).toBeLessThan(150);
  const canvas = page.locator("canvas").first();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + top.x * bounds.width / 400, bounds.y + top.y * bounds.height / 400);
  await expect.poll(() => page.evaluate(() => window.stage14Planet.lastPick?.instanceId)).toBe(0);
  const picked = await page.evaluate(() => window.stage14Planet.lastPick.axisValue);
  expect(Math.abs(picked.x)).toBeLessThan(0.1);
  expect(Math.abs(picked.y)).toBeLessThan(0.1);
  await page.evaluate(() => window.stage14Planet.angle(12));
  await expect.poll(async () => (await center()).x).toBeLessThan(150);
  const left = await center();
  expect(left.error).toBe("");
  expect(Math.abs(left.y - 200)).toBeLessThan(30);
});

test("warm orbital placement changes reuse the planet's GPU pipelines and marks", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-polar-planet");
  await page.waitForFunction(() => window.stage14Planet?.plot?.whenSettled);
  const move = async (angle) => {
    await page.evaluate((value) => window.stage14Planet.angle(value), angle);
    await page.evaluate(() => window.stage14Planet.plot.whenSettled());
    await page.waitForTimeout(150);
  };
  await move(8);
  await move(9);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await move(10);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});
