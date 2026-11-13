import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 142: two Plots draw one live Filter > Group output through explicit references. They draw
// what the same pipeline draws by context, the Group runs once per input change however many
// Plots read it, external table updates and parameter changes reach both, rapid changes end at
// the last one, and removing either consumer leaves the other drawing.
test("explicit references share one live pipeline output across Plots", async ({ page }) => {
  await page.goto("/test/pipeline-reference");
  await page.waitForFunction(() => window.pipelineReference?.plots?.c?.whenSettled);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(3);
  const settle = () => page.evaluate(async () => {
    const { a, b, c } = window.pipelineReference.plots;
    await Promise.all([a, b, c].filter(Boolean).map((plot) => plot.whenSettled()));
    await Promise.all([window.pipelineReference.grouped.whenSettled(), window.pipelineReference.byContext.whenSettled()]);
  });
  // Each plot's drawn points (vector export): their centers, by x then y.
  const drawn = () => page.evaluate(async () => {
    const out = {};
    for (const [name, plot] of Object.entries(window.pipelineReference.plots)) {
      if (!plot) continue;
      await plot.whenSettled();
      const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      out[name] = [...doc.querySelectorAll("circle")].map((c) => [Math.round(+c.getAttribute("cx")), Math.round(+c.getAttribute("cy"))]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    }
    return out;
  });
  await settle();
  const first = await drawn();
  expect(first.c.length).toBe(4);
  expect(first.a).toEqual(first.c);
  expect(first.b).toEqual(first.c);
  // A parameter change: the referenced Group runs once (and its Filter once), as the context one.
  const before = await page.evaluate(() => window.pipelineReference.runs());
  await page.evaluate(() => window.pipelineReference.setThreshold(6));
  await settle();
  const runs = (await page.evaluate(() => window.pipelineReference.runs())) - before;
  // Two pipelines, a Filter and a Group each: four runs, however many Plots read them.
  expect(runs).toBe(4);
  const changed = await drawn();
  expect(changed.a).toEqual(changed.c);
  expect(changed.b).toEqual(changed.c);
  expect(changed.c).not.toEqual(first.c);
  // An external table update reaches both references.
  await page.evaluate(() => window.pipelineReference.setRows(80, 3));
  await settle();
  const updated = await drawn();
  expect(updated.a).toEqual(updated.c);
  expect(updated.b).toEqual(updated.c);
  // Rapid changes: every plot ends at the last.
  await page.evaluate(() => { for (const value of [1, 7, 3, 8, 4]) window.pipelineReference.setThreshold(value); });
  await settle();
  const rapid = await drawn();
  expect(rapid.a).toEqual(rapid.c);
  expect(rapid.b).toEqual(rapid.c);
  // Removing one consumer leaves the other drawing, and later changes still reach it.
  await page.evaluate(() => window.pipelineReference.show(false, true));
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(2);
  await page.evaluate(() => window.pipelineReference.setThreshold(5));
  await settle();
  const remaining = await drawn();
  expect(remaining.a).toBeUndefined();
  expect(remaining.b).toEqual(remaining.c);
  // And back: a new consumer reads the current output.
  await page.evaluate(() => window.pipelineReference.show(true, false));
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(2);
  await settle();
  const swapped = await drawn();
  expect(swapped.a).toEqual(swapped.c);
  expect(await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent))).toEqual([]);
});

// TODO 142.5: a referenced pipeline that reads view state binds the views that draw it. Two Plots
// with their own clocks are ambiguous (an error naming the fix); in one InputContext they share one.
test("a referenced pipeline reading @time requires one clock among the Plots drawing it", async ({ page }) => {
  await page.goto("/test/pipeline-reference?clock=separate");
  await expect(page.getByRole("alert").filter({ hasText: "different clocks" })).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: "InputContext" })).toHaveCount(1);
  // A valid run may have started before both consumers adopted the pipeline. Its completion
  // must not erase the newer validation error. Removing the conflicting consumer recovers.
  await expect(page.evaluate(() => window.pipelineReference.timed.whenSettled())).rejects.toThrow("different clocks");
  await expect(page.getByRole("alert").filter({ hasText: "different clocks" })).toHaveCount(1);
  await page.evaluate(() => window.pipelineReference.setTimedSecond(false));
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(4);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goto("/test/pipeline-reference?clock=shared");
  await page.waitForFunction(() => window.pipelineReference?.plots?.c?.whenSettled);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(5);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
