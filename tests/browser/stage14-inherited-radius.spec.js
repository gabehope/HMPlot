import { test, expect } from "./fixtures.js";

test("a plain Frame inherits its polar parent's chosen base radius", async ({ page }) => {
  await page.goto("/test/stage14-inherited-radius");
  await page.waitForFunction(() => window.stage14InheritedRadius?.nested?.getMark?.());
  const result = await page.evaluate(async () => {
    const { framePoint } = await import("/src/lib/plot/utils/framePlacement.js");
    const { plot, direct, nested } = window.stage14InheritedRadius;
    await plot.whenSettled();
    const directOptions = direct.getMark().options, nestedOptions = nested.getMark().options;
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let blue = 0, centerBlue = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i + 2] > 90 && pixels[i + 2] > 1.5 * pixels[i] && pixels[i + 2] > 1.2 * pixels[i + 1]) {
        blue++;
        if (Math.hypot(x - 200, y - 200) < 20) centerBlue++;
      }
    }
    return { direct: framePoint(directOptions, [6, 0, 0]),
      nested: framePoint(nestedOptions, [6, 0, 0]),
      ownsRadius: nestedOptions.values.has("baseRadius"),
      inheritedRadius: nestedOptions.get("baseRadius"),
      blue, centerBlue, error: plot.getRenderError() };
  });
  expect(result.error).toBe("");
  expect(result.ownsRadius).toBe(false);
  expect(result.inheritedRadius).toBe(1);
  result.nested.forEach((value, axis) => expect(value).toBeCloseTo(result.direct[axis], 5));
  expect(result.blue).toBeGreaterThan(40);
  expect(result.centerBlue).toBe(0);
});
