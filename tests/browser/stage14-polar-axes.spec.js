import { test, expect } from "./fixtures.js";

test("all three polar axes project the known quarter turn in 3D", async ({ page }) => {
  await page.goto("/test/stage14-polar-axes");
  await page.locator("canvas").first().waitFor();
  await page.waitForFunction(() => ["Z", "X", "Y"].every((axis) => window.stage14PolarAxes?.plots?.[axis]));
  const results = await page.evaluate(async () => {
    const samples = {};
    for (const axis of ["Z", "X", "Y"]) {
      const plot = window.stage14PolarAxes.plots[axis];
      await plot.whenSettled();
      const image = await createImageBitmap(await plot.exportPNG());
      const canvas = document.createElement("canvas");
      // The three fixture plots and the centroid expectations are 320 CSS pixels.
      canvas.width = 320; canvas.height = 320;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let x = 0, y = 0, count = 0;
      for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
        const offset = (row * canvas.width + column) * 4,
          r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
        if (b > 80 && b > r * 1.25 && b > g * 1.05) { x += column; y += row; count++; }
      }
      samples[axis] = { x: x / count, y: y / count, count, error: plot.getRenderError() };
    }
    return samples;
  });
  for (const sample of Object.values(results)) {
    expect(sample.error).toBe("");
    expect(sample.count).toBeGreaterThan(20);
  }
  expect(results.Z.y).toBeLessThan(145);
  expect(results.X.x).toBeGreaterThan(165);
  expect(results.Y.x).toBeGreaterThan(results.X.x + 15);
  expect(results.Y.y).toBeLessThan(results.X.y - 10);
});

// Polar guides follow their step controls (tests/polar-axes.mjs, moved here).
test("polar spokes and rings follow the angular and radial steps", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/polar-axes");
  const guide = page.locator('svg[aria-label="Polar coordinate axes"]');
  await expect(guide.locator("line.guide")).toHaveCount(8);
  await expect(guide.locator("ellipse")).toHaveCount(3);
  await page.getByLabel("Angular step").fill("90");
  await page.getByLabel("Radial step").fill("0.5");
  await page.getByLabel("Minor guides").check();
  await expect(guide.locator("line.guide")).toHaveCount(8); // four major and four minor spokes
  await expect(guide.locator("ellipse")).toHaveCount(12); // six major and six minor rings
  await expect(guide).toContainText("1.0");
  expect(errors).toEqual([]);
});
