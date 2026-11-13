import { test, expect } from "./fixtures.js";

// python/examples/60_facet_fields.ipynb (fixture static/test/notebook-60_facet_fields.json):
// Facet fields small multiples, fields x species with strip brushing, a lower-triangle pairs matrix.
async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/notebook?fixture=60_facet_fields");
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const facets = [...window.notebookRuntime.handles.values()].filter((e) => e.id.includes("-facet-"));
    return facets.length === 3 && facets.every((e) => e.handle.getFrames().length > 0);
  });
  await page.evaluate(async () => {
    for (const entry of window.notebookRuntime.handles.values()) await entry.handle?.whenSettled?.();
  });
  return errors;
}
/** Per Facet (in scene order): its cells' [row, column, ybounds]. */
const facets = (page) => page.evaluate(() => [...window.notebookRuntime.handles.values()]
  .filter((e) => e.id.includes("-facet-"))
  .map((e) => e.handle.getFrames().map(({ row, column, frame }) => [row, column, frame.getFrameOptions().get("ybounds")])));

test("Facet fields and pairs from Python: cells and per-field domains", async ({ page }) => {
  const errors = await open(page);
  const [series, grid, pairs] = await facets(page);
  expect(series.map(([, column]) => column)).toEqual(["temp", "rain"]);
  expect(series[0][2]).not.toEqual(series[1][2]);
  expect(grid).toHaveLength(9);
  // A field keeps one domain across the species.
  for (const field of ["bill", "depth", "mass"])
    expect(new Set(grid.filter(([, column]) => column === field).map(([, , y]) => JSON.stringify(y))).size).toBe(1);
  expect(pairs.map(([row, column]) => `${row}·${column}`)).toEqual(
    ["bill·bill", "depth·bill", "depth·depth", "mass·bill", "mass·depth", "mass·mass"]);
  // Row mass's y is the same field domain as the grid's mass column.
  expect(pairs.find(([row]) => row === "mass")[2]).toEqual(grid.find(([, column]) => column === "mass")[2]);
  expect(errors).toEqual([]);
});

test("a strip brush in a Python fields cell constrains that field", async ({ page }) => {
  const errors = await open(page);
  // The depth cell of the Adelie row, in page space.
  const cell = await page.evaluate(() => {
    const entries = [...window.notebookRuntime.handles.values()];
    const facet = entries.filter((e) => e.id.includes("-facet-"))[1];
    const { frame } = facet.handle.getFrames().find(({ row, column }) => row === "Adelie" && column === "depth");
    const plot = entries.filter((e) => e.id.includes("-plot-"))[1];
    const host = plot.element.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect(), layout = frame.getAxisLayout();
    return { left: host.left + layout.left, top: host.top + layout.top, bottom: host.top + layout.bottom };
  });
  await page.mouse.move(cell.left + 4, cell.top + 4);
  const x = cell.left - 8, h = cell.bottom - cell.top;
  await page.keyboard.down("Shift");
  await page.mouse.move(x, cell.top + 0.2 * h); await page.mouse.down();
  await page.mouse.move(x, cell.top + 0.7 * h, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => {
    const mark = [...window.notebookRuntime.handles.values()]
      .find((e) => e.id.includes("-points-") && ((m) => m?.view.marks.of(m))(e.handle?.getMark?.())?.interaction?.brush)?.handle.getMark();
    const binding = ((m) => m?.view.marks.of(m))(mark)?.interaction;
    return binding?.brush.getConstraints(binding.owner).map((c) => c.name) ?? null;
  })).toEqual(["depth"]);
  expect(errors).toEqual([]);
});
