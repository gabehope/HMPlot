import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 136.18: transparent rows (opacity 0) count in the axes as rows do and are exported as
// transparent; hidden rows (a Filter's) neither widen the axes nor draw.
test("a transparent row is still a row; a hidden row is not", async ({ page }) => {
  await page.goto("/test/hidden-rows");
  await page.waitForFunction(() => window.hiddenRows?.hidden?.whenSettled);
  const read = (name) => page.evaluate(async (name) => {
    const plot = window.hiddenRows[name];
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const circles = [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("circle")];
    return { bounds: plot.getFrames()[0].getFrameOptions().get("xbounds"), drawn: circles.filter((c) => +(c.getAttribute("opacity") ?? 1) > 0).length, all: circles.length };
  }, name);
  const transparent = await read("transparent"), hidden = await read("hidden");
  expect(transparent.bounds[1]).toBeGreaterThanOrEqual(10);
  expect(hidden.bounds[1]).toBeLessThan(10);
  expect(transparent.drawn).toBe(4);
  expect(hidden.drawn).toBe(4);
});
