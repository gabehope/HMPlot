import { test, expect } from "./fixtures.js";

// Fold > embedded Facet(column="key") builds one cell per field over the source rows (like
// Pairs): a strip brush in a cell constrains that field, and the cells show the observations.
async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/fold-brush");
  await page.waitForFunction(() => window.foldBrush?.facet?.getFrames()?.length === 3 &&
    ((m) => m?.view.marks.of(m))(window.foldBrush.points?.getMark())?.interaction);
  return errors;
}
// Page-space rects of the cells' frames, by field.
const cells = (page) => page.evaluate(async () => {
  const { plot, facet } = window.foldBrush;
  for (let i = 0; i < 100 && !facet.getFrames().every(({ frame }) => frame.getAxisLayout()); i++)
    await new Promise((r) => setTimeout(r, 50));
  await facet.whenSettled();
  await plot.whenSettled();
  const host = document.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect();
  return Object.fromEntries(facet.getFrames().map(({ frame, column }) => {
    const layout = frame.getAxisLayout();
    return [column, { left: host.left + layout.left, top: host.top + layout.top, bottom: host.top + layout.bottom }];
  }));
});
const constraints = (page) => page.evaluate(() => {
  const binding = ((m) => m?.view.marks.of(m))(window.foldBrush.points.getMark())?.interaction;
  return binding.brush.getConstraints(binding.owner);
});
const brushCount = (page) => page.evaluate(() => window.foldBrush.plot.getBrush().status().committedCount);
const stripBands = (page) => page.evaluate(() =>
  document.querySelectorAll('[aria-label="Plot canvas"] .brush-region.strip:not([data-dragging])').length);
// The rows inside every constraint, counted on the host from the source columns.
const expected = (page, list) => page.evaluate((list) => {
  const { data } = window.foldBrush;
  return data.id.filter((_, i) => list.every((c) => data[c.name][i] >= c.bounds[0] && data[c.name][i] <= c.bounds[1])).length;
}, list);
// Shift-drag down a cell's y strip (just left of its frame) between two fractions of its height.
async function stripDrag(page, cell, from, to) {
  const x = cell.left - 8, h = cell.bottom - cell.top;
  await page.keyboard.down("Shift");
  await page.mouse.move(x, cell.top + from * h); await page.mouse.down();
  await page.mouse.move(x, cell.top + to * h, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
}

test("a strip brush in a Fold + Facet cell constrains that cell's field, and fields AND together", async ({ page }) => {
  const errors = await open(page);
  const { a, b } = await cells(page);
  // Nothing brushed: the @brushed Filter in each cell keeps every observation.
  await expect.poll(() => page.evaluate(() => ((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(window.foldBrush.brushed.getMark()))).toBe(24);

  await stripDrag(page, b, 0.2, 0.6);
  await expect.poll(async () => (await constraints(page)).map((c) => c.name)).toEqual(["b"]);
  const [first] = await constraints(page);
  expect(first.origin).toBe("strip");
  expect(first.axis).toBe("y");
  // Bounds are in b's units (0 to 990), not a's or the folded values'.
  expect(first.bounds[1] - first.bounds[0]).toBeGreaterThan(200);
  // The band shows only on b's strip: no other cell plots b.
  await expect.poll(() => stripBands(page)).toBe(1);
  const single = await expected(page, [first]);
  expect(single).toBeGreaterThan(0);
  expect(single).toBeLessThan(24);
  await expect.poll(() => brushCount(page)).toBe(single);

  // A second field's brush ANDs with the first; the observation count is the host's.
  await stripDrag(page, a, 0.3, 0.9);
  await expect.poll(async () => (await constraints(page)).map((c) => c.name).sort()).toEqual(["a", "b"]);
  await expect.poll(() => stripBands(page)).toBe(2);
  const both = await expected(page, await constraints(page));
  expect(both).toBeGreaterThan(0);
  expect(both).toBeLessThan(single);
  await expect.poll(() => brushCount(page)).toBe(both);
  // Every cell shows the same observations, so @brushed keeps the same rows in each (the
  // mark draws the Filter's input rows and shows the kept ones: filteredCount).
  await expect.poll(() => page.evaluate(() => ((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(window.foldBrush.brushed.getMark()))).toBe(both);
  // The connector (respond="brushed") keeps the brushed observations' paths opaque: connection
  // c is observation c, and its first segment (cell a -> cell b) is segment 4c.
  const paths = () => page.evaluate(async () => {
    const data = window.foldBrush.lines.getMark().fields.get("interactionOpacity")?.data;
    if (!data?.shape) return null;
    const opacity = Array.from(await data.ref.data());
    return window.foldBrush.data.id.flatMap((_, c) => (opacity[4 * c] === 1 && opacity[4 * c + 1] === 1 ? [c] : []));
  });
  const rows = await page.evaluate((list) => {
    const { data } = window.foldBrush;
    return data.id.flatMap((_, i) => (list.every((c) => data[c.name][i] >= c.bounds[0] && data[c.name][i] <= c.bounds[1]) ? [i] : []));
  }, await constraints(page));
  expect(rows).toHaveLength(both);
  await expect.poll(paths).toEqual(rows);
  expect(await page.evaluate(() => window.foldBrush.plot.getRenderError())).toBe("");
  expect(errors).toEqual([]);
});

test("a connector over the repeated Anchor matches observations across Fold + Facet cells without a key", async ({ page }) => {
  const errors = await open(page);
  await cells(page);
  const result = await page.evaluate(async () => {
    const { lines, data, fields, plot } = window.foldBrush;
    await plot.whenSettled();
    const mark = lines.getMark();
    const read = async (name) => Array.from(await mark.fields.get(name).data.ref.data());
    const [start, end] = await Promise.all([read("start"), read("end")]);
    // A Line path per connection: slot 0 -> 1 -> 2, then a separator (4 rows, 3 segments
    // plus the break). Connection c is observation c (implicit matching, first appearance).
    const n = data.id.length, y = (array, segment) => array[3 * segment + 1];
    const slotY = [0, 1, 2].map((slot) => Array.from({ length: n }, (_, c) =>
      slot < 2 ? y(start, 4 * c + slot) : y(end, 4 * c + 1)));
    // Each slot's world y is a linear map of that cell's field at the connection's row.
    const correlation = (u, v) => {
      const mean = (w) => w.reduce((s, x) => s + x, 0) / w.length, mu = mean(u), mv = mean(v);
      let uv = 0, uu = 0, vv = 0;
      u.forEach((x, i) => { uv += (x - mu) * (v[i] - mv); uu += (x - mu) ** 2; vv += (v[i] - mv) ** 2; });
      return uv / Math.sqrt(uu * vv);
    };
    return { error: plot.getRenderError(), segments: mark.count, correlations: fields.map((field, slot) => correlation(slotY[slot], data[field])) };
  });
  expect(result.error).toBe("");
  expect(result.segments).toBe(4 * 24 - 2);
  for (const r of result.correlations) expect(Math.abs(r)).toBeGreaterThan(0.9999);
  expect(errors).toEqual([]);
});

test("selecting a point in one Fold + Facet cell selects that observation in every cell", async ({ page }) => {
  const errors = await open(page);
  await cells(page);
  // Observation 5's point in cell b, from the cell's frame mapping.
  const point = await page.evaluate(() => {
    const { facet, data } = window.foldBrush, row = 5;
    const host = document.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect();
    const { frame } = facet.getFrames().find((entry) => entry.column === "b");
    const layout = frame.getAxisLayout(), options = frame.getFrameOptions();
    const [x0, x1] = options.get("xbounds"), [y0, y1] = options.get("ybounds");
    return [host.left + layout.left + ((0 - x0) / (x1 - x0)) * (layout.right - layout.left),
      host.top + layout.bottom - ((data.b[row] - y0) / (y1 - y0)) * (layout.bottom - layout.top)];
  });
  await page.mouse.click(...point);
  await expect.poll(() => page.evaluate(() => {
    const binding = ((m) => m?.view.marks.of(m))(window.foldBrush.points.getMark())?.interaction;
    return [...binding.selection.rows(binding.owner)];
  })).toEqual([5]);
  // Whichever cell's instance the binding holds, its selected row is observation 5.
  await expect.poll(() => page.evaluate(async () => {
    const data = window.foldBrush.points.getMark().fields.get("interactionOpacity")?.data;
    return data?.shape ? Array.from(await data.ref.data()).flatMap((value, row) => (value === 1 ? [row] : [])) : null;
  })).toEqual([5]);
  expect(errors).toEqual([]);
});
