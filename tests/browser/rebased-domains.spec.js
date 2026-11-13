import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 143.2: one new input (a new base day) publishes one y domain, the Line's and its end
// labels' together, not one for each as their extents arrive; the labels sit at the lines' ends.
// @timing: the axis holds a change's domains at most HOLD_MS (axis.svelte), which the labels'
// preparation outlasts on SwiftShader under four workers.
test("a rebase publishes the lines' and their labels' y domain once", { tag: "@timing" }, async ({ page }) => {
  await page.goto("/test/rebased-returns");
  await page.waitForFunction(() => window.rebasedReturns?.plot?.whenSettled);
  await page.evaluate(() => window.rebasedReturns.plot.whenSettled());
  const published = await page.evaluate(async () => {
    const { plot } = window.rebasedReturns, options = plot.getFrames()[0].getFrameOptions();
    const seen = [];
    const stop = options.on((value) => seen.push(JSON.stringify(value)), "ybounds");
    const counts = [];
    for (const base of [100, 200, 300, 400]) {
      seen.length = 0;
      window.rebasedReturns.setBase(base);
      await new Promise((r) => setTimeout(r, 30));
      await plot.whenSettled();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      counts.push(new Set(seen).size);
    }
    stop();
    return counts;
  });
  expect(published.every((n) => n <= 1), JSON.stringify(published)).toBe(true);
});
