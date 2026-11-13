import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 136.14b: keyframes read at frozen times: linear between stops, held past the last, and a
// per-row time shift staggering the opacity.
test("keyframes move a channel through its stops as the clock runs", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/test/keyframes");
  await page.waitForFunction(() => window.keyframesPage?.plot?.whenSettled);
  const at = (ms) => page.evaluate(async (ms) => {
    const plot = window.keyframesPage.plot;
    await plot.setAnimationTime(ms);
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    return [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("circle")]
      .map((c) => ({ x: +c.getAttribute("cx"), r: +c.getAttribute("r"), opacity: +(c.getAttribute("fill-opacity") ?? c.getAttribute("opacity") ?? 1) }))
      .sort((a, b) => a.x - b.x);
  }, ms);
  const start = await at(0), middle = await at(500), late = await at(3000);
  expect(middle[0].r / start[0].r).toBeCloseTo(12 / 4, 1);
  expect(late[0].r / start[0].r).toBeCloseTo(20 / 4, 1);
  // At 200 ms the first row is half way (0.6), the second just starting (0.2), the third not yet.
  const staggered = await at(200);
  expect(staggered[0].opacity).toBeCloseTo(0.6, 1);
  expect(staggered[1].opacity).toBeCloseTo(0.2, 1);
  expect(staggered[2].opacity).toBeCloseTo(0.2, 1);
  expect(problems).toEqual([]);
});
