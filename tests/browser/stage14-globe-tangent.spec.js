import { test, expect } from "./fixtures.js";

test("a globe child has a live east/north/outward tangent frame", async ({ page }) => {
  await page.goto("/test/stage14-globe-tangent");
  await page.waitForFunction(() => window.stage14GlobeTangent?.inset?.getFrameOptions());
  const first = await page.evaluate(async () => {
    const plot = window.stage14GlobeTangent.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const groups = Object.fromEntries(["blue", "red", "green"].map(key => [key, { x: 0, y: 0, count: 0 }]));
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4,
        r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const key = b > 120 && b > 1.8 * r && b > 1.2 * g ? "blue"
        : r > 100 && r > 1.35 * g && r > 1.25 * b ? "red"
        : g > 90 && g > 1.3 * r && g > 1.05 * b ? "green" : null;
      if (key) { groups[key].x += x; groups[key].y += y; groups[key].count++; }
    }
    for (const group of Object.values(groups)) {
      group.x /= group.count; group.y /= group.count;
    }
    return { groups, error: plot.getRenderError(),
      matrix: window.stage14GlobeTangent.inset.getFrameOptions().frameDefinition.matrix.elements.slice() };
  });
  expect(first.error).toBe("");
  for (const group of Object.values(first.groups)) expect(group.count).toBeGreaterThan(20);
  expect(first.groups.red.x - first.groups.blue.x).toBeGreaterThan(15);
  expect(first.groups.blue.y - first.groups.green.y).toBeGreaterThan(15);
  expect(Math.abs(first.matrix[12])).toBeLessThan(1e-6);
  expect(Math.abs(first.matrix[14] - 1)).toBeLessThan(1e-6);

  await page.evaluate(() => window.stage14GlobeTangent.move(90));
  await expect.poll(() => page.evaluate(() =>
    window.stage14GlobeTangent.inset.getFrameOptions().frameDefinition.matrix.elements[12])).toBeGreaterThan(0.99);
  const second = await page.evaluate(() => ({
    matrix: window.stage14GlobeTangent.inset.getFrameOptions().frameDefinition.matrix.elements.slice(),
    error: window.stage14GlobeTangent.plot.getRenderError(),
  }));
  expect(second.error).toBe("");
  expect(second.matrix[2]).toBeLessThan(-0.49);
});
