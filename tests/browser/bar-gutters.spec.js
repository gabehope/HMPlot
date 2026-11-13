import { test, expect } from "./fixtures.js";

// TODO 136.17: a legend strip that arrives takes height from the canvas, and the first solve at
// the new size reads the camera's old fit. Its gutters were damped as a rest, so a draw kept
// them (a side 2 to 6 px wider) or not, by the order its data and legend arrived. Every draw of
// one scene lands on the same gutters, mounted together and remounted.
test("each draw of a bar scene lands on the same gutters", async ({ page }) => {
  await page.goto("/test/bar-gutters");
  const seen = { stack: new Set(), group: new Set() };
  for (let round = 0; round < 3; round++) {
    await page.waitForFunction(() => window.barGutters?.plots?.length === 6 && window.barGutters.plots.every(Boolean));
    await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(6);
    const gutters = await page.evaluate(async () => {
      const plots = window.barGutters.plots;
      await Promise.all(plots.map((p) => p.whenSettled()));
      return plots.map((p) => JSON.stringify(p.getAxisLayout().own));
    });
    gutters.forEach((g, i) => seen[i % 2 ? "group" : "stack"].add(g));
    await page.evaluate(() => window.barGutters.remount());
  }
  expect([...seen.stack]).toHaveLength(1);
  expect([...seen.group]).toHaveLength(1);
  // The grouped bars' top label needs less room than the stacked ones' (25 under the top, not 50).
  expect(JSON.parse([...seen.group][0]).top).toBeLessThan(JSON.parse([...seen.stack][0]).top);
});
