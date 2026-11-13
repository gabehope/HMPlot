import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 136.16 slice 3: Panels' Plots show one x domain (the union of their data), draw the x axis
// and its title once (under the last), line up their plot areas, and pan together.
test("Panels share one x, drawn once, and pan together", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/test/panels");
  await page.waitForFunction(() => window.panels?.lower?.whenSettled);
  const state = () => page.evaluate(async () => {
    const out = {};
    for (const name of ["upper", "lower"]) {
      const plot = window.panels[name];
      await plot.whenSettled();
      const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
      const texts = [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("text")].map((t) => t.textContent.trim());
      const canvas = document.querySelectorAll(".canvas")[name === "upper" ? 0 : 1].getBoundingClientRect(), layout = plot.getAxisLayout();
      out[name] = { bounds: plot.getFrames()[0].getFrameOptions().get("xbounds"), texts, viewport: plot.getViewport(),
        left: canvas.left + layout.left, right: canvas.left + layout.right };
    }
    return out;
  });
  const first = await state();
  expect(first.upper.bounds).toEqual(first.lower.bounds);
  expect(first.upper.bounds[0]).toBeLessThanOrEqual(0);
  expect(first.upper.bounds[1]).toBeGreaterThanOrEqual(60);
  expect(first.lower.texts).toContain("Day");
  expect(first.upper.texts).not.toContain("Day");
  expect(first.upper.texts).toContain("Price");
  // "Volume"'s wider tick labels (410,000) set both plots' left edge.
  await expect.poll(async () => { const now = await state(); return Math.abs(now.upper.left - now.lower.left) < 1 && Math.abs(now.upper.right - now.lower.right) < 1; }).toBe(true);
  await page.evaluate(() => window.panels.upper.setViewport({ x: 0.3, zoomX: 2 }, "x"));
  await expect.poll(async () => (await state()).lower.viewport?.zoomX ?? (await state()).lower.viewport?.zoom).toBeCloseTo(2, 1);
  expect(problems).toEqual([]);
});
