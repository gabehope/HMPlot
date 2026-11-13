import { test, expect } from "./fixtures.js";

// TODO 32.2: marks that take their alpha from opacityNode applied no row opacity, so a polar
// Rect drew the rows a Filter hid, and an opacity expression did nothing
// (fixture: src/routes/test/row-opacity).
const counts = (page, key) => page.evaluate((key) => window.rowOpacity.colorCounts(window.rowOpacity.plots[key]), key);

test("a polar Rect hides the rows a Filter drops and the rows at opacity 0", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/row-opacity");
  await page.waitForFunction(() => window.rowOpacity?.plots.expression);
  // The reference draws both sectors.
  await expect.poll(async () => (await counts(page, "both")).blue).toBeGreaterThan(500);
  const reference = await counts(page, "both");
  expect(reference.red).toBeGreaterThan(500);
  for (const key of ["filtered", "expression"]) {
    await expect.poll(async () => (await counts(page, key)).red, { message: key }).toBeGreaterThan(reference.red * 0.9);
    expect((await counts(page, key)).blue, key).toBe(0);
  }
  expect(errors).toEqual([]);
});
