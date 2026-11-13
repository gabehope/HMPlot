import { test, expect } from "./fixtures.js";

// The overflow policy (TODO 136.10 slice 6): what does not fit shrinks or clips, and warns.
async function open(page, scene) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/test/overflow?case=${scene}`);
  await page.waitForFunction(() => window.overflowReady);
  const warnings = () => page.evaluate(() =>
    window.overflowScene.runtime.diagnostics().filter((d) => d.severity === "warning").map((d) => d.code));
  return { errors, warnings };
}

test("a Plot wider than its container warns", async ({ page }) => {
  const { errors, warnings } = await open(page, "wide");
  await expect.poll(warnings).toContain("layout.width");
  expect(errors).toEqual([]);
});

test("axis labels past 45% of a small plot clip there and warn", async ({ page }) => {
  const { errors, warnings } = await open(page, "clip");
  await expect.poll(warnings).toContain("layout.overflow");
  expect(errors).toEqual([]);
});

test("a Facet's columns share the width instead of scrolling, and narrow cells warn", async ({ page }) => {
  const { errors, warnings } = await open(page, "facet");
  await expect.poll(warnings).toContain("layout.facetCells");
  await expect.poll(() => page.locator(".facet-cell").count()).toBe(8);
  const grid = await page.locator(".facets").evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
  expect(grid.scroll).toBeLessThanOrEqual(grid.client + 1);
  expect(errors).toEqual([]);
});
