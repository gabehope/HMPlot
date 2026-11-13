import { test, expect } from "./fixtures.js";

// TODO 29.2: data past maxElements grows the mark's buffers instead of being cut off.
test("a mark grows past maxElements: 40 points allocated for 16 all draw", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/max-elements");
  await page.waitForFunction(() => window.maxElements?.points?.getMark());
  await page.evaluate(() => window.maxElements.plot.whenSettled());
  const state = await page.evaluate(() => {
    const mark = window.maxElements.points.getMark();
    return { capacity: mark.manager.maxElements, rows: mark.fields.get("position")?.count, error: window.maxElements.plot.getRenderError?.() ?? "" };
  });
  expect(state).toEqual({ capacity: 64, rows: 40, error: "" });
  // The last points (past the first 16) are drawn.
  await expect.poll(() => page.evaluate(() => window.maxElements.lastPointsDrawn())).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
