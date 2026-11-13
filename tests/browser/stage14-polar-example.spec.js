import { test, expect } from "./fixtures.js";

test("migrated polar example and paired lesson render with angle on X and radius on Y", async ({ page }) => {
  await page.goto("/examples/polar-radius");
  await page.waitForFunction(() => window.__examples?.plot?.whenSettled);
  await expect(page.getByRole("heading", { name: "Polar radius", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Example source" })).toContainText('coordinates="polar"');
  await page.getByRole("slider", { name: "Angle origin" }).fill("45");
  const result = await page.evaluate(async () => {
    const plot = window.__examples.plot;
    await plot.whenSettled();
    return { error: plot.getRenderError(), bytes: (await plot.exportPNG()).size };
  });
  expect(result.error).toBe("");
  expect(result.bytes).toBeGreaterThan(1000);
  await page.goto("/docs/coordinates");
  await expect(page.locator("article")).toContainText("Polar coordinates interpret X as angle, Y as radius");
});
