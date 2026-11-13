import { test, expect } from "./fixtures.js";

// sampling="uniform-x" (fixture: src/routes/test/sampled-line). The rows it reduces are located
// from the visible x range; the automatic domain is padded past the first and last x, so zoomed
// in off center they were taken as if the rows filled the padded domain: the line stopped short
// of one edge of the view (the docs' Long time series example, 2026-10-02).
test("a uniform-x Line zoomed in draws across the whole visible x range", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/sampled-line");
  await page.waitForFunction(() => window.sampledLine?.plot);
  await page.evaluate(() => window.sampledLine.plot.whenSettled());
  // Zoomed 10x about 80% of the domain (rows about 14,000 to 16,200 of 20,000).
  await page.evaluate(() => window.sampledLine.plot.setViewport({ x: 0.8, zoom: 10 }, "x"));
  const columns = await page.evaluate(() => window.sampledLine.redColumns());
  // Every tenth of the width has the line, the outer tenths included.
  const tenths = Array.from({ length: 10 }, (_, i) =>
    columns.slice(Math.floor((i * columns.length) / 10), Math.floor(((i + 1) * columns.length) / 10)).filter(Boolean).length);
  expect(Math.min(...tenths), `line columns per tenth: ${tenths}`).toBeGreaterThan(columns.length / 20);
  expect(errors).toEqual([]);
});
