import { test, expect } from "./fixtures.js";

// A band y axis lists its first category at the top, and invert turns it bottom-up (TODO 136.15).
const labels = (page, fixture) =>
  page.locator(`[data-fixture="${fixture}"] .y-tick`).evaluateAll((elements) =>
    elements.map((e) => [e.getBoundingClientRect().top, e.textContent.trim()]).sort((a, b) => a[0] - b[0]).map(([, text]) => text));

test("a band y axis reads from the top; invert reads from the bottom", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/band-order");
  await expect.poll(() => labels(page, "top")).toEqual(["first", "second", "third"]);
  await expect.poll(() => labels(page, "bottom")).toEqual(["third", "second", "first"]);
  expect(errors).toEqual([]);
});
