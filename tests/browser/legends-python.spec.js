import { test, expect } from "./fixtures.js";

// 6.11 A6/B1: legends over Python integer and datetime64 columns, from the scene snapshot of
// python/examples/48_legend_columns.ipynb (static/test/notebook-48_legend_columns.json).
async function open(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=48_legend_columns");
  await page.waitForFunction(() => window.notebookReady === true);
  return errors;
}
const date = /^[A-Z][a-z]{2} \d{2}$/;

test("datetime64 columns label colorbar and ramp ticks as dates", async ({ page }) => {
  const errors = await open(page);
  // 2024-01-01 12:00 plus eight steps of 45 days: the column ends on 2024-12-26.
  const ticks = page.locator('[role=group][aria-label="When"] svg text');
  await expect(ticks).toHaveText(["Jan 01", date, date, date, "Dec 26"]);
  const ramp = page.locator('[role=group][aria-label="When (size)"] svg[data-ramp=size] text');
  await expect(ramp).toHaveText(["Jan 01", date, date, "Dec 26"]);
  expect(errors).toEqual([]);
});

// 6.11 B2: a Python scale label reaches the browser and titles the colorbar its marks share;
// the mark with an automatic scale keeps its own colorbar, titled by its label.
test("a Python scale label titles the shared colorbar", async ({ page }) => {
  const errors = await open(page);
  // The plot-level Legend's groups sit in an unlabeled group; each is labeled by its title.
  const titles = page.locator("[data-guide-position] [role=group]:not([aria-label]) .colorbar .guide-title");
  await expect(titles).toHaveText(["Shared value", "Diagonal"]);
  expect(errors).toEqual([]);
});

// Python int64 columns keep their values (7C A1): fill 100..180 and mass 10..310 label as such.
test("integer fill and size columns label their own values", async ({ page }) => {
  const errors = await open(page);
  const ticks = page.locator('[role=group][aria-label="Count"] svg text');
  await expect(ticks).toHaveText(["100", "120", "140", "160", "180"], { timeout: 10_000 });
  const ramp = page.locator('[role=group][aria-label="Mass"] svg[data-ramp=size] text');
  await expect(ramp).toHaveText(["10", "110", "210", "310"], { timeout: 10_000 });
  expect(errors).toEqual([]);
});
