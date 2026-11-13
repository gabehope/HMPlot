import { test, expect } from "./fixtures.js";

// Axis titles in scenes built from Python (existing notebook fixtures; TODO 21 Part T): the same
// JavaScript titles each axis by the column its marks plot.
const titles = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-label="Plot canvas"]')].map((host) => ({
  x: [...host.querySelectorAll(".x-title")].map((e) => e.textContent),
  y: [...host.querySelectorAll(".y-title")].map((e) => e.textContent),
})));
const pairs = ["time", "sine", "cosine"].flatMap((y) => ["time", "sine", "cosine"].map((x) => ({ x: [x], y: [y] })));

for (const [fixture, expected] of [
  // y is a pandas Series (frame["width"]): titled by the Series' name (TODO 40.1).
  ["01_dataframe", [{ x: ["length"], y: ["width"] }]],
  // One row of cells sharing y: the left one labels it (TODO 136.10 slice 5).
  ["11_histograms", [{ x: ["value"], y: ["density"] }, { x: ["value"], y: [] }, { x: ["value"], y: [] }]],
  ["17_pairs", pairs],
  ["60_facet_fields", [
    { x: ["time", "time"], y: ["temp", "rain"] },
    { x: Array(9).fill("time"), y: ["bill", "depth", "mass", "bill", "depth", "mass", "bill", "depth", "mass"] },
    { x: ["bill", "bill", "depth", "bill", "depth", "mass"], y: ["bill", "depth", "depth", "mass", "mass", "mass"] },
  ]],
  ["22_violin", [{ x: ["group"], y: ["value"] }]],
  ["25_bar", [{ x: ["group"], y: ["total"] }]],
  ["27_lollipop", [{ x: ["category"], y: ["change"] }]],
]) {
  test(`Python fixture ${fixture}: axes titled by their columns`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/test/notebook?fixture=${fixture}`);
    await page.waitForFunction(() => window.notebookReady, null, { timeout: 30000 });
    await expect.poll(() => titles(page), { timeout: 20000 }).toEqual(expected);
    expect(errors).toEqual([]);
  });
}
