import { test, expect } from "./fixtures.js";

// TODO 136.3: no mark draws toward a row its frame cannot map (NaN, <= 0 on a log axis, behind a
// globe), and series breaks stay breaks: each plot's top and right edges stay empty.
test("missing rows draw nothing toward the sentinel, in every mark family and frame", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/missing-matrix");
  await page.waitForFunction(() => window.missingMatrix && Object.keys(window.missingMatrix.plots).length === 32);
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".canvas")];
    return canvases.length === 32 && canvases.every((canvas) => canvas.getAttribute("aria-busy") === "false");
  });
  await page.evaluate(() => Promise.all(Object.values(window.missingMatrix.plots).map((plot) => plot.whenSettled())));
  const smeared = await page.evaluate(async () => {
    const out = [];
    for (const [name, plot] of Object.entries(window.missingMatrix.plots)) {
      const bitmap = await createImageBitmap(await plot.exportPNG());
      const c = document.createElement("canvas"); c.width = bitmap.width; c.height = bitmap.height;
      const context = c.getContext("2d"); context.drawImage(bitmap, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, c.width, c.height);
      const strip = Math.round(width * 0.08);
      let red = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (y >= strip && x < width - strip) continue;
          const i = (y * width + x) * 4;
          if (data[i + 3] > 40 && data[i] > 150 && data[i + 1] < 120) red++;
        }
      if (red > 0) out.push(`${name}: ${red} red pixels at the top or right edge`);
    }
    return out;
  });
  expect(smeared).toEqual([]);
  expect(errors).toEqual([]);
});
