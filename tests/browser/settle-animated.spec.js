import { test, expect } from "./fixtures.js";

// TODO 17.15: continuous updates (a Slice at an animated `at`) must not keep a plot hidden or
// whenSettled() waiting; a change made before whenSettled() is still drawn when it resolves.
test("a plot whose data changes every frame reveals, and whenSettled resolves while it plays", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/test/settle-animated");
  await page.waitForFunction(() => window.settleAnimated?.plot);
  const canvas = page.locator('[aria-label="Plot canvas"]').first();
  await expect(canvas).toHaveAttribute("aria-busy", "false", { timeout: 20000 });
  const before = await page.evaluate(() => window.settleAnimated.frames);
  const waited = await page.evaluate(async () => {
    const start = performance.now();
    await window.settleAnimated.plot.whenSettled();
    return performance.now() - start;
  });
  expect(waited).toBeLessThan(10000);
  // Still animating: the frames kept coming while it waited, and after.
  await expect.poll(() => page.evaluate(() => window.settleAnimated.frames)).toBeGreaterThan(before + 5);
  expect(errors).toEqual([]);
});

test("while it plays, a change made before whenSettled() is drawn when it resolves", async ({ page }) => {
  await page.goto("/test/settle-animated");
  await page.waitForFunction(() => window.settleAnimated?.plot);
  await expect(page.locator('[aria-label="Plot canvas"]').first()).toHaveAttribute("aria-busy", "false", { timeout: 20000 });
  const all = await page.evaluate(() => window.settleAnimated.count);
  expect(all).toBeGreaterThan(350);
  // Keep x > 0.5 (about a third of the entities at any time): once whenSettled() resolves, the
  // mark already draws the filtered entities, though the time kept changing meanwhile.
  const filtered = await page.evaluate(async () => {
    window.settleAnimated.setMinimum(0.5);
    await window.settleAnimated.plot.whenSettled();
    return window.settleAnimated.count;
  });
  expect(filtered, JSON.stringify({ all, filtered })).toBeLessThan(250);
  expect(filtered).toBeGreaterThan(0);
  const frames = await page.evaluate(() => window.settleAnimated.frames);
  expect(frames).toBeGreaterThan(10);
});
