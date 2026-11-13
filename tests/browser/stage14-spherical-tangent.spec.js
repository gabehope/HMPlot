import { test, expect } from "./fixtures.js";

async function coloredPixels(page) {
  return page.evaluate(async () => {
    const plot = window.stage14SphericalTangent.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const groups = Object.fromEntries(["blue", "red", "green"].map(key => [key, { x: 0, y: 0, count: 0 }]));
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4,
        r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const key = b > 120 && b > 1.8 * r && b > 1.2 * g ? "blue"
        : r > 100 && r > 1.35 * g && r > 1.25 * b ? "red"
        : g > 90 && g > 1.3 * r && g > 1.05 * b ? "green" : null;
      if (key) { groups[key].x += x; groups[key].y += y; groups[key].count++; }
    }
    for (const group of Object.values(groups)) {
      group.x /= group.count;
      group.y /= group.count;
    }
    const root = document.querySelector("section.plot").getBoundingClientRect(),
      surface = document.querySelector("section.plot .canvas").getBoundingClientRect(),
      scale = canvas.width / root.width;
    return { groups, error: plot.getRenderError(),
      offset: [(surface.left - root.left) * scale, (surface.top - root.top) * scale], scale,
      matrix: window.stage14SphericalTangent.inset.getFrameOptions().frameDefinition.matrix.elements.slice() };
  });
}

test("a Cartesian inset follows the orthographic sphere's local tangent", async ({ page }) => {
  await page.goto("/test/stage14-spherical-tangent");
  await page.waitForFunction(() => window.stage14SphericalTangent?.inset?.getFrameOptions());
  const first = await coloredPixels(page);
  expect(first.error).toBe("");
  for (const group of Object.values(first.groups)) expect(group.count).toBeGreaterThan(20);
  const { blue, red, green } = first.groups;
  expect(red.x - blue.x).toBeGreaterThan(20);
  expect(blue.y - red.y).toBeGreaterThan(5);
  expect(blue.x - green.x).toBeGreaterThan(5);
  expect(blue.y - green.y).toBeGreaterThan(20);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + (blue.x - first.offset[0]) / first.scale,
    bounds.y + (blue.y - first.offset[1]) / first.scale);
  await expect.poll(() => page.evaluate(() =>
    Math.abs(window.stage14SphericalTangent.lastPick?.axisValue?.x ?? Infinity))).toBeLessThan(0.05);
  const picked = await page.evaluate(() => window.stage14SphericalTangent.lastPick.axisValue);
  expect(Math.abs(picked.y)).toBeLessThan(0.05);

  await page.evaluate(() => window.stage14SphericalTangent.plot.setViewport({ center: [-20, 10] }));
  const rotated = await coloredPixels(page);
  expect(rotated.error).toBe("");
  for (const group of Object.values(rotated.groups)) expect(group.count).toBeGreaterThan(20);
  expect(rotated.groups.blue.x - blue.x).toBeGreaterThan(20);
  expect(rotated.matrix[12] - first.matrix[12]).toBeGreaterThan(0.1);
  await page.evaluate(() => window.stage14SphericalTangent.plot.setViewport({ center: [-140, -30] }));
  await expect.poll(() => page.evaluate(() =>
    window.stage14SphericalTangent.plot.getRenderError())).toBe("");
  const hidden = await coloredPixels(page);
  expect(hidden.groups.blue.count).toBe(0);
  expect(hidden.matrix[12]).toBeGreaterThan(1e10);
  await page.evaluate(() => window.stage14SphericalTangent.plot.setViewport({ center: [0, 30] }));
  await expect.poll(() => page.evaluate(() =>
    window.stage14SphericalTangent.plot.getRenderError())).toBe("");
});
