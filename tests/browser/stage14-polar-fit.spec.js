import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

async function ring(page) {
  return page.evaluate(async () => {
    const plot = window.stage14PolarFit.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    const root = document.querySelector("section.plot").getBoundingClientRect();
    // The 200px center, distances and pick coordinates below are CSS pixels.
    canvas.width = root.width;
    canvas.height = Math.round(image.height * root.width / image.width);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const groups = Object.fromEntries(["right", "top", "left", "bottom"].map(key =>
      [key, { x: 0, y: 0, count: 0 }]));
    const inherited = { left: Infinity, right: -Infinity, top: Infinity,
      bottom: -Infinity, count: 0 };
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4,
        r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (g > 90 && g > r * 1.3 && g > b * 1.05) {
        inherited.left = Math.min(inherited.left, x);
        inherited.right = Math.max(inherited.right, x);
        inherited.top = Math.min(inherited.top, y);
        inherited.bottom = Math.max(inherited.bottom, y);
        inherited.count++;
      }
      if (!(b > 120 && b > r * 1.8 && b > g * 1.2)) continue;
      const dx = x - 200, dy = y - 200,
        key = Math.abs(dx) > Math.abs(dy)
          ? dx > 0 ? "right" : "left" : dy < 0 ? "top" : "bottom";
      groups[key].x += x; groups[key].y += y; groups[key].count++;
    }
    for (const group of Object.values(groups)) {
      group.x /= group.count; group.y /= group.count;
    }
    const surface = document.querySelector("section.plot .canvas").getBoundingClientRect(),
      scale = canvas.width / root.width;
    return { groups, inherited, error: plot.getRenderError(), scale,
      offset: [(surface.left - root.left) * scale, (surface.top - root.top) * scale] };
  });
}

test("a polar child keeps a circular disk in unequal Cartesian ranges", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-polar-fit");
  await page.waitForFunction(() => window.stage14PolarFit?.disk?.getFrameOptions());
  const first = await ring(page);
  expect(first.error).toBe("");
  for (const group of Object.values(first.groups)) expect(group.count).toBeGreaterThan(20);
  const { right, top, left, bottom } = first.groups,
    width = (right.x - left.x) / 2, height = (bottom.y - top.y) / 2;
  expect(width).toBeGreaterThan(60);
  expect(Math.abs(width - height)).toBeLessThan(8);
  expect(first.inherited.count).toBeGreaterThan(40);
  expect((first.inherited.right - first.inherited.left) / (right.x - left.x))
    .toBeGreaterThan(0.5);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + (top.x - first.offset[0]) / first.scale,
    bounds.y + (top.y - first.offset[1]) / first.scale);
  await expect.poll(() => page.evaluate(() => window.stage14PolarFit.lastPick?.instanceId)).toBe(1);
  const picked = await page.evaluate(() => window.stage14PolarFit.lastPick.axisValue);
  expect(Math.abs(picked.x - 6)).toBeLessThan(0.05);
  expect(Math.abs(picked.y - 1)).toBeLessThan(0.05);

  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14PolarFit.setXHalf(1));
  await expect.poll(() => page.evaluate(() =>
    window.stage14PolarFit.disk.getFrameOptions().get("_frameXRange")?.[1])).toBe(1);
  const narrow = await ring(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys,
      existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter(key => !existing.has(key)).length;
  }, before.renderKeys);
  expect(narrow.error).toBe("");
  expect(top.y - narrow.groups.top.y).toBeLessThan(-25);
  expect(narrow.groups.right.x - narrow.groups.left.x).toBeLessThan(right.x - left.x - 40);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});
