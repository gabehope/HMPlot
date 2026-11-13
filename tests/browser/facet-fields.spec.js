import { test, expect } from "./fixtures.js";

// Facet fields and pairs (TODO 21 Part F): one cell per field over the same rows (`value` is
// the cell's field), and scatterplot matrices (`x`/`y` are the cell's fields).
async function open(page, scene, ready = (facet) => facet.getFrames().length > 0) {
  const errors = [], warnings = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "warning") warnings.push(m.text()); });
  await page.goto(`/test/facet-fields?case=${scene}`);
  await page.waitForFunction((source) => window.facetFields?.facet && new Function("facet", `return (${source})(facet)`)(window.facetFields.facet),
    ready.toString());
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  await page.evaluate(() => window.facetFields.facet.whenSettled());
  return { errors, warnings };
}
/** Each cell frame's (the first frame per cell) bounds and ranges, in facet order. */
const frames = (page) => page.evaluate(() => {
  const seen = new Set();
  return window.facetFields.facet.getFrames().flatMap(({ frame, row, column }) => {
    const key = JSON.stringify([row, column]);
    if (seen.has(key)) return [];
    seen.add(key);
    const options = frame.getFrameOptions();
    return [{ row, column, xbounds: options.get("xbounds"), ybounds: options.get("ybounds"),
      xrange: options.get("xrange"), yrange: options.get("yrange") }];
  });
});
const center = (range) => (range[0] + range[1]) / 2;
/** A field's extent padded as an automatic axis pads it (4% each side). */
const padded = (values) => {
  const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * 0.04;
  return [lo - pad, hi + pad];
};
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6 * Math.max(1, Math.abs(b[i])));

// Parallel coordinates: helpers as in fold-brush.spec.js.
const cells = (page) => page.evaluate(async () => {
  const { plot, facet } = window.facetFields;
  for (let i = 0; i < 100 && !facet.getFrames().every(({ frame }) => frame.getAxisLayout()); i++)
    await new Promise((r) => setTimeout(r, 50));
  await facet.whenSettled();
  await plot.whenSettled();
  const host = document.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect(), out = {};
  for (const { frame, column } of facet.getFrames()) {
    if (out[column]) continue;
    const layout = frame.getAxisLayout();
    out[column] = { left: host.left + layout.left, top: host.top + layout.top, bottom: host.top + layout.bottom };
  }
  return out;
});
const constraints = (page) => page.evaluate(() => {
  const binding = ((m) => m?.view.marks.of(m))(window.facetFields.points.getMark())?.interaction;
  return binding.brush.getConstraints(binding.owner);
});
const brushCount = (page) => page.evaluate(() => window.facetFields.plot.getBrush().status().committedCount);
const expected = (page, list) => page.evaluate((list) => {
  const { data } = window.facetFields;
  return data.id.filter((_, i) => list.every((c) => data[c.name][i] >= c.bounds[0] && data[c.name][i] <= c.bounds[1])).length;
}, list);
async function stripDrag(page, cell, from, to) {
  const x = cell.left - 8, h = cell.bottom - cell.top;
  await page.keyboard.down("Shift");
  await page.mouse.move(x, cell.top + from * h); await page.mouse.down();
  await page.mouse.move(x, cell.top + to * h, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
}

test("parallel coordinates with Facet fields: per-field domains, strip brushes, selection and a keyless connector", async ({ page }) => {
  const { errors } = await open(page, "parallel", (facet) => facet.getFrames().length === 6);
  const data = await page.evaluate(() => window.facetFields.data);
  // scales="field" by default: each cell's y is its field's extent.
  for (const frame of await frames(page)) expect(close(frame.ybounds, padded(data[frame.column])), frame.column).toBe(true);
  const { a, b } = await cells(page);
  await expect.poll(() => page.evaluate(() => ((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(window.facetFields.brushed.getMark()))).toBe(24);
  // A strip brush in cell b constrains b, in b's units.
  await stripDrag(page, b, 0.2, 0.6);
  await expect.poll(async () => (await constraints(page)).map((c) => c.name)).toEqual(["b"]);
  const [first] = await constraints(page);
  expect([first.origin, first.axis]).toEqual(["strip", "y"]);
  expect(first.bounds[1] - first.bounds[0]).toBeGreaterThan(200);
  const single = await expected(page, [first]);
  expect(single).toBeGreaterThan(0);
  expect(single).toBeLessThan(24);
  await expect.poll(() => brushCount(page)).toBe(single);
  // A second field ANDs.
  await stripDrag(page, a, 0.3, 0.9);
  await expect.poll(async () => (await constraints(page)).map((c) => c.name).sort()).toEqual(["a", "b"]);
  const both = await expected(page, await constraints(page));
  expect(both).toBeLessThan(single);
  await expect.poll(() => brushCount(page)).toBe(both);
  await expect.poll(() => page.evaluate(() => ((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(window.facetFields.brushed.getMark()))).toBe(both);
  // The connector keeps the brushed observations' paths opaque (connection c is observation c;
  // its first segment, a -> b, is segment 4c).
  const rows = await page.evaluate((list) => {
    const { data } = window.facetFields;
    return data.id.flatMap((_, i) => (list.every((c) => data[c.name][i] >= c.bounds[0] && data[c.name][i] <= c.bounds[1]) ? [i] : []));
  }, await constraints(page));
  await expect.poll(() => page.evaluate(async () => {
    const values = window.facetFields.lines.getMark().fields.get("interactionOpacity")?.data;
    if (!values?.shape) return null;
    const opacity = Array.from(await values.ref.data());
    return window.facetFields.data.id.flatMap((_, c) => (opacity[4 * c] === 1 && opacity[4 * c + 1] === 1 ? [c] : []));
  })).toEqual(rows);
  expect(await page.evaluate(() => window.facetFields.plot.getRenderError())).toBe("");
  expect(errors).toEqual([]);
});

test("the keyless connector across Facet fields cells matches observations, and a click selects in every cell", async ({ page }) => {
  const { errors } = await open(page, "parallel", (facet) => facet.getFrames().length === 6);
  await cells(page);
  const result = await page.evaluate(async () => {
    const { lines, data, fields, plot } = window.facetFields;
    await plot.whenSettled();
    const mark = lines.getMark();
    const read = async (name) => Array.from(await mark.fields.get(name).data.ref.data());
    const [start, end] = await Promise.all([read("start"), read("end")]);
    // A Line path per connection: slot 0 -> 1 -> 2, then a separator (4 rows, 3 segments
    // plus the break), as in fold-brush.spec.js.
    const n = data.id.length, y = (array, segment) => array[3 * segment + 1];
    const slotY = [0, 1, 2].map((slot) => Array.from({ length: n }, (_, c) =>
      slot < 2 ? y(start, 4 * c + slot) : y(end, 4 * c + 1)));
    const correlation = (u, v) => {
      const mean = (w) => w.reduce((s, x) => s + x, 0) / w.length, mu = mean(u), mv = mean(v);
      let uv = 0, uu = 0, vv = 0;
      u.forEach((x, i) => { uv += (x - mu) * (v[i] - mv); uu += (x - mu) ** 2; vv += (v[i] - mv) ** 2; });
      return uv / Math.sqrt(uu * vv);
    };
    return { error: plot.getRenderError(), correlations: fields.map((field, slot) => correlation(slotY[slot], data[field])) };
  });
  expect(result.error).toBe("");
  for (const r of result.correlations) expect(Math.abs(r)).toBeGreaterThan(0.9999);
  // Observation 5 in cell b, from the cell's frame mapping.
  const point = await page.evaluate(() => {
    const { facet, data } = window.facetFields, row = 5;
    const host = document.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect();
    const { frame } = facet.getFrames().filter((entry) => entry.column === "b")[1];
    const layout = frame.getAxisLayout(), options = frame.getFrameOptions();
    const [x0, x1] = options.get("xbounds"), [y0, y1] = options.get("ybounds");
    return [host.left + layout.left + ((0.5 - x0) / (x1 - x0)) * (layout.right - layout.left),
      host.top + layout.bottom - ((data.b[row] - y0) / (y1 - y0)) * (layout.bottom - layout.top)];
  });
  await page.mouse.click(...point);
  await expect.poll(() => page.evaluate(() => {
    const binding = ((m) => m?.view.marks.of(m))(window.facetFields.points.getMark())?.interaction;
    return [...binding.selection.rows(binding.owner)];
  })).toEqual([5]);
  expect(errors).toEqual([]);
});

test("small multiples of different variables share x and scale y per field", async ({ page }) => {
  const { errors } = await open(page, "series", (facet) => facet.getFrames().length === 2);
  const data = await page.evaluate(() => window.facetFields.data);
  const [temp, rain] = await frames(page);
  expect([temp.column, rain.column]).toEqual(["temp", "rain"]);
  // time is an input column: one x domain. value is the field: its own y domain.
  expect(temp.xbounds).toEqual(rain.xbounds);
  expect(close(temp.xbounds, padded(data.time))).toBe(true);
  expect(close(temp.ybounds, padded(data.temp))).toBe(true);
  expect(close(rain.ybounds, padded(data.rain))).toBe(true);
  // An embedded fields Facet defaults to a grid: side by side.
  expect(center(temp.xrange)).toBeLessThan(center(rain.xrange));
  expect(errors).toEqual([]);
});

test("stacked fields x a column split: grid places, a field's domain across categories, Partition and one legend", async ({ page }) => {
  const { errors } = await open(page, "rows", (facet) => facet.getFrames().length === 6);
  const data = await page.evaluate(() => window.facetFields.data);
  const list = await frames(page);
  expect(list.map((f) => `${f.row}·${f.column}`)).toEqual(["a·p", "a·q", "a·r", "b·p", "b·q", "b·r"]);
  // Row a above row b; columns p, q, r left to right.
  for (const f of list) {
    const other = list.find((g) => g.column === f.column && g.row !== f.row);
    if (f.row === "a") expect(center(f.yrange)).toBeGreaterThan(center(other.yrange));
    expect(close(f.ybounds, padded(data[f.row])), `${f.row} ${f.column}`).toBe(true);
  }
  expect(center(list[0].xrange)).toBeLessThan(center(list[1].xrange));
  expect(center(list[1].xrange)).toBeLessThan(center(list[2].xrange));
  // Partition by species inside each cell, and color="species": one legend of three entries.
  await expect(page.locator("[aria-label=Species]")).toHaveCount(1);
  await expect(page.locator("[aria-label=Species] button")).toHaveText(["Adelie", "Gentoo", "Chinstrap"]);
  expect(await page.evaluate(() => window.facetFields.plot.getRenderError())).toBe("");
  expect(errors).toEqual([]);
});

test("an external fields x row grid: labels, per-field domains offscreen, export and settings", async ({ page }) => {
  const { errors } = await open(page, "external", (facet) => facet.getPlots().length > 0);
  await expect(page.locator(".facet-label")).toHaveText(["p · a", "p · b", "p · c", "q · a", "q · b", "q · c", "r · a", "r · b", "r · c"]);
  // External Plots round automatic domains outward to ticks; embedded frames above only pad.
  const domains = { a: [-3.84, 100], b: [-38, 1000], c: [-0.388, 10.088] };
  // The last cell mounts on scroll and gets its field's domain (shared by the engine route).
  await page.locator(".facet-cell").last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.facetFields.facet.getPlots().some((p) => p.row === "r" && p.column === "c"))).toBe(true);
  await page.evaluate(() => window.facetFields.facet.whenSettled());
  for (const f of await frames(page)) expect(close(f.ybounds, domains[f.column]), `${f.row} ${f.column}`).toBe(true);
  // Export: every cell, and the labels in the composed SVG.
  const exported = await page.evaluate(async () => {
    const { facet } = window.facetFields;
    const svg = await (await facet.exportSVG()).blob.text();
    const cells = await facet.exportCells("svg");
    return { labels: [...svg.matchAll(/<text[^>]*>([^<]*·[^<]*)<\/text>/g)].map((m) => m[1]), items: cells.items.map((item) => item.key) };
  });
  expect(exported.labels).toContain("r · c");
  expect(exported.items).toHaveLength(9);
  // The pane shows the effective default; nothing echoes it back as an explicit prop.
  const settings = await page.evaluate(() => new Promise((resolve) => {
    const seen = [];
    const off = window.facetFields.facet.subscribeSettings((value) => seen.push(value.scales));
    setTimeout(() => { off(); resolve(seen); }, 300);
  }));
  expect(settings.every((value) => value === undefined)).toBe(true);
  // Setting shared equalizes the y domains.
  await page.evaluate(async () => {
    const { facet } = window.facetFields;
    facet.openSettings();
  });
  const section = page.locator("summary").filter({ hasText: /^Scales and navigation/ });
  if ((await section.getAttribute("aria-expanded")) !== "true") await section.click();
  const select = page.getByLabel("Domains", { exact: true });
  await expect(select).toHaveValue("field");
  await select.selectOption("shared");
  await expect.poll(async () => new Set((await frames(page)).map((f) => JSON.stringify(f.ybounds))).size).toBe(1);
  expect(errors).toEqual([]);
});

test("an embedded lower-triangle pairs matrix places cells and shares a field's domain on x and y", async ({ page }) => {
  const { errors } = await open(page, "pairs", (facet) => facet.getFrames().length === 6);
  const data = await page.evaluate(() => window.facetFields.data);
  const list = await frames(page);
  expect(list.map((f) => `${f.row}·${f.column}`)).toEqual(["a·a", "b·a", "b·b", "c·a", "c·b", "c·c"]);
  const at = (row, column) => list.find((f) => f.row === row && f.column === column);
  // Lower triangle: row a (top) has one cell at column a; column c has one cell at row c (bottom).
  expect(center(at("a", "a").yrange)).toBeGreaterThan(center(at("b", "a").yrange));
  expect(center(at("b", "a").yrange)).toBeGreaterThan(center(at("c", "a").yrange));
  expect(center(at("c", "a").xrange)).toBeLessThan(center(at("c", "b").xrange));
  expect(center(at("b", "b").xrange)).toBeCloseTo(center(at("c", "b").xrange), 6);
  expect(center(at("c", "c").xrange)).toBeGreaterThan(center(at("c", "b").xrange));
  // Field a: one domain on x (column a) and on y (row a).
  for (const f of list) {
    expect(close(f.xbounds, padded(data[f.column])), `x ${f.row}·${f.column}`).toBe(true);
    expect(close(f.ybounds, padded(data[f.row])), `y ${f.row}·${f.column}`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("an external rectangular pairs matrix labels its cells y · x", async ({ page }) => {
  const { errors } = await open(page, "pairs-xy", (facet) => facet.getPlots().length === 2);
  await expect(page.locator(".facet-label")).toHaveText(["c · a", "c · b"]);
  const [ca, cb] = await frames(page);
  expect(ca.ybounds).toEqual(cb.ybounds);
  expect(ca.xbounds).not.toEqual(cb.xbounds);
  expect(errors).toEqual([]);
});

const SAME_DIMENSION = 'Facet fields lays its cells out along columns, so it cannot combine with column="g"; use fields={{row: [...]}} or row="g".';
test("a fields Facet on a split dimension reports the exact error, embedded and external", async ({ page }) => {
  for (const scene of ["error-embedded", "error-external"]) {
    await page.goto(`/test/facet-fields?case=${scene}`);
    await page.waitForFunction(() => window.facetFields?.facet);
    await expect(page.getByRole("alert").first()).toHaveText(SAME_DIMENSION);
    if (scene === "error-embedded")
      await expect.poll(() => page.evaluate(() => window.facetFields.plot.getRenderError())).toBe(SAME_DIMENSION);
    await expect(page.evaluate(() => window.facetFields.facet.whenSettled())).rejects.toThrow(SAME_DIMENSION);
  }
});

test("changing the fields keeps the cells that remain and drops the others", async ({ page }) => {
  const { errors } = await open(page, "update", (facet) => facet.getFrames().length === 3);
  const before = await page.evaluate(() => window.facetFields.facet.getFrames().map(({ frame, column }) => [column, frame.getFrameOptions().get("ybounds")]));
  await page.evaluate(() => window.facetFields.setFields(["c", "a"]));
  await expect.poll(() => page.evaluate(() => window.facetFields.facet.getFrames().map(({ column }) => column))).toEqual(["c", "a"]);
  await page.evaluate(() => window.facetFields.facet.whenSettled());
  const after = Object.fromEntries(await page.evaluate(() => window.facetFields.facet.getFrames().map(({ frame, column }) => [column, frame.getFrameOptions().get("ybounds")])));
  expect(after.c).toEqual(Object.fromEntries(before).c);
  expect(await page.evaluate(() => window.facetFields.plot.getRenderError())).toBe("");
  expect(errors).toEqual([]);
});
