import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

async function disk(page) {
  return page.evaluate(async () => {
    const plot = window.stage14SphericalFit.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    const root = document.querySelector("section.plot").getBoundingClientRect();
    canvas.width = root.width; canvas.height = root.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const groups = Object.fromEntries(["right", "top", "left", "bottom"].map(key =>
      [key, { x: 0, y: 0, count: 0 }]));
    let red = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4,
        r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (r > 100 && r > 1.4 * g && r > 1.3 * b) red++;
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
    return { groups, red, error: plot.getRenderError(), scale,
      offset: [(surface.left - root.left) * scale, (surface.top - root.top) * scale] };
  });
}

test("an orthographic child fits a circular disk and retains its own center", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-spherical-fit");
  await page.waitForFunction(() => window.stage14SphericalFit?.globe?.getFrameOptions());
  const first = await disk(page);
  expect(first.error).toBe("");
  expect(first.red).toBe(0);
  const firstSvg = await page.evaluate(async () =>
    (await window.stage14SphericalFit.plot.exportSVG({ mode: "vector" })).blob.text());
  expect(firstSvg).not.toContain("<image");
  expect(firstSvg).toContain("#2468a0");
  expect(firstSvg).not.toContain("#cb453a");
  for (const group of Object.values(first.groups)) expect(group.count).toBeGreaterThan(20);
  const { right, top, left, bottom } = first.groups,
    width = (right.x - left.x) / 2, height = (bottom.y - top.y) / 2;
  expect(width).toBeGreaterThan(45);
  expect(Math.abs(width - height)).toBeLessThan(8);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + (top.x - first.offset[0]) / first.scale,
    bounds.y + (top.y - first.offset[1]) / first.scale);
  await expect.poll(() => page.evaluate(() => window.stage14SphericalFit.lastPick?.instanceId)).toBe(1);
  const picked = await page.evaluate(() => window.stage14SphericalFit.lastPick.axisValue);
  expect(Math.abs(picked.x)).toBeLessThan(0.1);
  expect(Math.abs(picked.y - 45)).toBeLessThan(0.1);

  await page.evaluate(() => window.stage14SphericalFit.setXHalf(1));
  await expect.poll(() => page.evaluate(() =>
    window.stage14SphericalFit.globe.getFrameOptions().get("_frameXRange")?.[1])).toBe(1);
  const narrow = await disk(page);
  expect(narrow.error).toBe("");
  expect(narrow.red).toBe(0);
  expect(top.y - narrow.groups.top.y).toBeLessThan(-20);
  await page.evaluate(() => window.stage14SphericalFit.setCenter(10));
  await disk(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14SphericalFit.setCenter(30));
  await expect.poll(() => page.evaluate(() =>
    window.stage14SphericalFit.globe.getFrameOptions().get("projectionCenter")?.[0])).toBe(30);
  const rotated = await disk(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys,
      existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter(key => !existing.has(key)).length;
  }, before.renderKeys);
  expect(rotated.error).toBe("");
  expect(rotated.red).toBe(0);
  expect(rotated.groups.right.x).toBeLessThan(narrow.groups.right.x - 10);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});
