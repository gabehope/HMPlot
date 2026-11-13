import { test, expect } from "./fixtures.js";

test("an embedded equirectangular map draws one canonical copy", async ({ page }) => {
  await page.goto("/test/stage14-embedded-map");
  await page.waitForFunction(() => window.stage14EmbeddedMap?.map?.getFrameOptions());
  const result = await page.evaluate(async () => {
    const { plot, map } = window.stage14EmbeddedMap;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    // The column bounds below describe the fixture's 400 CSS-pixel frame.
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const columns = [];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i + 2] > 100 && pixels[i + 2] > 1.5 * pixels[i] &&
          pixels[i + 2] > 1.2 * pixels[i + 1]) columns.push(x);
    }
    return { columns, svg, error: plot.getRenderError(),
      nested: !!map.getFrameOptions().frameDefinition.parent };
  });
  expect(result.error).toBe("");
  expect(result.nested).toBe(true);
  expect(result.columns.length).toBeGreaterThan(50);
  expect(Math.min(...result.columns)).toBeGreaterThan(160);
  expect(Math.max(...result.columns)).toBeLessThan(240);
  expect(result.svg).not.toContain("<image");
  expect(result.svg).toContain("#2468d0");
});
