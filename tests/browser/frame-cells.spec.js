import { test, expect } from "./fixtures.js";

// A Frame inside every embedded Facet cell (and inside ranged Frames): the cell's y strip brushes
// the marks of the child Frame that inherits y; a cell dimension no mark plots on draws no axis;
// the root's axes2d={false} holds.
const PLOTS = ["cells", "ranged", "plain", "twin"];
async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/frame-cells");
  await page.waitForFunction(() => window.frameCells?.facet?.getFrames()?.length === 6 &&
    ["points", "autoPoints", "explicitPoints"].every((key) => ((m) => m?.view.marks.of(m))(window.frameCells[key]?.getMark())?.interaction));
  return errors;
}
// Page-space rects of the cell frames, by field.
const cellRects = (page) => page.evaluate(async () => {
  const { cells, facet } = window.frameCells;
  for (let i = 0; i < 100 && !facet.getFrames().every(({ frame }) => frame.getAxisLayout()); i++)
    await new Promise((r) => setTimeout(r, 50));
  await facet.whenSettled();
  await cells.whenSettled();
  const host = document.querySelectorAll('[aria-label="Plot canvas"]')[0].getBoundingClientRect();
  // Each cell lists its own frame first, then the Frame inside it.
  const rects = {};
  for (const { frame, column } of facet.getFrames()) {
    const layout = frame.getAxisLayout();
    rects[column] ??= { left: host.left + layout.left, right: host.left + layout.right, top: host.top + layout.top, bottom: host.top + layout.bottom };
  }
  return rects;
});
// Page-space rects of the ranged plot's named frames.
const rangedRects = (page) => page.evaluate(async () => {
  const { ranged } = window.frameCells;
  for (let i = 0; i < 100 && !(ranged.getAxes().length === 6 && ranged.getAxes().every((a) => a.getAxisLayout())); i++)
    await new Promise((r) => setTimeout(r, 50));
  await ranged.whenSettled();
  const element = document.querySelectorAll('[aria-label="Plot canvas"]')[1];
  element.scrollIntoView({ block: "center" });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const host = element.getBoundingClientRect();
  const named = {};
  for (const axes of ranged.getAxes()) {
    const options = axes.getFrameOptions(), layout = axes.getAxisLayout(), name = options.presentation?.label;
    if (["auto", "explicit", "direct"].includes(name))
      named[name] = { left: host.left + layout.left, right: host.left + layout.right, top: host.top + layout.top, bottom: host.top + layout.bottom };
  }
  return named;
});
const constraints = (page, marks) => page.evaluate((marks) => {
  const binding = ((m) => m?.view.marks.of(m))(window.frameCells[marks].getMark())?.interaction;
  return binding.brush.getConstraints(binding.owner).map(({ name, axis, origin, bounds }) => ({ name, axis, origin, bounds }));
}, marks);
const stripBands = (page, key) => page.evaluate((index) =>
  document.querySelectorAll('[aria-label="Plot canvas"]')[index].querySelectorAll(".brush-region.strip:not([data-dragging])").length, PLOTS.indexOf(key));
const brushCount = (page, key) => page.evaluate((key) => window.frameCells[key].getBrush().status().committedCount, key);
const renderError = (page, key) => page.evaluate((key) => window.frameCells[key].getRenderError(), key);
// Axis decorations drawn in a plot, in page pixels: x ticks (position and value) and x titles.
const decorations = (page, key) => page.evaluate((index) => {
  const host = document.querySelectorAll('[aria-label="Plot canvas"]')[index], origin = host.getBoundingClientRect();
  const svgs = [...host.querySelectorAll('svg[aria-label="2D coordinate axes"]')];
  const place = (element) => { const m = element.transform.baseVal.consolidate()?.matrix; return [origin.left + (m?.e ?? 0), origin.top + (m?.f ?? 0)]; };
  return {
    xTicks: svgs.flatMap((svg) => [...svg.querySelectorAll(".x-tick")].map((tick) => ({ at: place(tick), value: Number(tick.dataset.value) }))),
    yTicks: svgs.flatMap((svg) => [...svg.querySelectorAll(".y-tick")].map((tick) => ({ at: place(tick), value: Number(tick.dataset.value) }))),
    xTitles: svgs.flatMap((svg) => [...svg.querySelectorAll(".x-title")].map((title) => [origin.left + Number(title.getAttribute("x")), origin.top + Number(title.getAttribute("y"))])),
    yTitles: svgs.reduce((count, svg) => count + svg.querySelectorAll(".y-title").length, 0),
  };
}, PLOTS.indexOf(key));
// x ticks and titles drawn along a frame rect's bottom edge.
const onBottom = (items, rect, depth = 12) => items.filter(([x, y]) => y >= rect.bottom - 1 && y < rect.bottom + depth && x >= rect.left - 1 && x <= rect.right + 1);
// Shift-drag down a frame's y strip (just left of its rect) between two fractions of its height.
async function stripDrag(page, rect, from, to) {
  const x = rect.left - 8, h = rect.bottom - rect.top;
  await page.keyboard.down("Shift");
  await page.mouse.move(x, rect.top + from * h); await page.mouse.down();
  await page.mouse.move(x, rect.top + to * h, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
}

test("a cell's y strip brushes the marks of a child Frame that inherits y, per field", async ({ page }) => {
  const errors = await open(page);
  const { a, b } = await cellRects(page);
  await stripDrag(page, b, 0.2, 0.6);
  await expect.poll(async () => (await constraints(page, "points")).map((c) => c.name)).toEqual(["b"]);
  const [first] = await constraints(page, "points");
  expect(first).toMatchObject({ axis: "y", origin: "strip" });
  // Bounds are in b's units (0 to 990), not the folded values'.
  expect(first.bounds[1] - first.bounds[0]).toBeGreaterThan(200);
  await expect.poll(() => stripBands(page, "cells")).toBe(1);
  // A second field ANDs with the first.
  await stripDrag(page, a, 0.3, 0.9);
  await expect.poll(async () => (await constraints(page, "points")).map((c) => c.name).sort()).toEqual(["a", "b"]);
  await expect.poll(() => stripBands(page, "cells")).toBe(2);
  const both = await page.evaluate((list) => {
    const { data } = window.frameCells;
    return data.id.filter((_, i) => list.every((c) => data[c.name][i] >= c.bounds[0] && data[c.name][i] <= c.bounds[1])).length;
  }, await constraints(page, "points"));
  expect(both).toBeGreaterThan(0);
  expect(both).toBeLessThan(24);
  await expect.poll(() => brushCount(page, "cells")).toBe(both);
  expect(await renderError(page, "cells")).toBe("");
  expect(errors).toEqual([]);
});

test("a ranged Frame's y strip brushes a child Frame's marks that plot on it", async ({ page }) => {
  const errors = await open(page);
  const frames = await rangedRects(page);
  await stripDrag(page, frames.auto, 0.1, 0.5);
  await expect.poll(async () => (await constraints(page, "autoPoints")).map((c) => c.name)).toEqual(["a"]);
  await stripDrag(page, frames.explicit, 0.1, 0.5);
  await expect.poll(async () => (await constraints(page, "explicitPoints")).map((c) => c.name).sort()).toEqual(["a", "b"]);
  const b = (await constraints(page, "explicitPoints")).find((c) => c.name === "b");
  // The explicit frame's y domain is [0, 1000]: the top half of its strip is about 500..1000.
  expect(b.bounds[0]).toBeGreaterThan(400);
  expect(b.bounds[1]).toBeGreaterThan(850);
  await expect.poll(() => stripBands(page, "ranged")).toBe(2);
  expect(await renderError(page, "ranged")).toBe("");
  expect(errors).toEqual([]);
});

test("a frame dimension that no mark plots on draws no axis; an explicit or contributed domain does", async ({ page }) => {
  const errors = await open(page);
  // Cells: the Frame inside each cell owns x, so nothing plots on the cell's x and it draws no x axis,
  // while the cell's y (the Frame inherits it) keeps its axis.
  const cells = await cellRects(page);
  await expect.poll(async () => {
    const drawn = await decorations(page, "cells");
    return Object.values(cells).map((rect) => onBottom([...drawn.xTicks.map((tick) => tick.at), ...drawn.xTitles], rect).length);
  }).toEqual([0, 0, 0]);
  const cellY = await decorations(page, "cells");
  for (const rect of Object.values(cells))
    expect(cellY.yTicks.filter(({ at: [x, y] }) => Math.abs(x - rect.left) < 1 && y >= rect.top - 1 && y <= rect.bottom + 1).length).toBeGreaterThan(1);
  // Ranged frames: automatic x without contributions draws nothing; an explicit domain draws its
  // ticks although no mark plots on it (and no title: no mark names its x, TODO 21); marks in the
  // frame itself give it an axis, titled by their column.
  const frames = await rangedRects(page);
  await expect.poll(async () => {
    const drawn = await decorations(page, "ranged");
    const ticks = (rect) => onBottom(drawn.xTicks.map((tick) => tick.at), rect).length, titles = (rect) => onBottom(drawn.xTitles, rect, 45).length;
    return { auto: [ticks(frames.auto), titles(frames.auto)], explicit: ticks(frames.explicit) > 1 && titles(frames.explicit), direct: ticks(frames.direct) > 1 && titles(frames.direct) };
  }).toEqual({ auto: [0, 0], explicit: 0, direct: 1 });
  const drawn = await decorations(page, "ranged");
  const explicit = drawn.xTicks.filter((tick) => onBottom([tick.at], frames.explicit).length).map((tick) => tick.value);
  expect(Math.min(...explicit)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...explicit)).toBeLessThanOrEqual(10);
  expect(await renderError(page, "ranged")).toBe("");
  expect(errors).toEqual([]);
});

test("axes2d={false} keeps the root axes hidden with Frames inside embedded facet cells", async ({ page }) => {
  const errors = await open(page);
  const cells = await cellRects(page);
  const axes2d = (key) => page.evaluate(async (key) => {
    const plot = window.frameCells[key];
    await plot.whenSettled();
    return plot.getAxes()[0].getFrameOptions().child("plot").get("axes2d");
  }, key);
  expect(await axes2d("cells")).toBe(false);
  // Only the three cells' y axes draw: no root x axis (no x ticks or titles at all) and no fourth y axis.
  await expect.poll(async () => {
    const drawn = await decorations(page, "cells");
    return { xTicks: drawn.xTicks.length, xTitles: drawn.xTitles.length, yTitles: drawn.yTitles };
  }).toEqual({ xTicks: 0, xTitles: 0, yTitles: 3 });
  // Nothing drew left of the first cell's y axis except its own tick labels.
  const drawn = await decorations(page, "cells");
  expect(drawn.yTicks.every(({ at: [x] }) => Object.values(cells).some((rect) => Math.abs(x - rect.left) < 1))).toBe(true);
  // A Cartesian Plot without an explicit choice uses the new automatic axes.
  await expect.poll(() => axes2d("plain")).toBe(true);
  expect((await decorations(page, "plain")).xTicks.length).toBeGreaterThan(0);
  // An explicit axes2d={false} holds beside a twin axis; the twin still draws its own y axis.
  await expect.poll(() => axes2d("twin")).toBe(false);
  const twin = await decorations(page, "twin");
  expect(twin.xTicks.length).toBe(0);
  expect(twin.yTicks.length).toBeGreaterThan(1);
  expect(twin.yTicks.every(({ value }) => value >= 0 && value <= 1200)).toBe(true);
  expect(twin.yTicks.some(({ value }) => value > 100)).toBe(true);
  expect(await renderError(page, "cells")).toBe("");
  expect(errors).toEqual([]);
});

test("frame titles name the columns their marks plot (TODO 21)", async ({ page }) => {
  const errors = await open(page);
  const titles = () => page.evaluate(() => [...document.querySelectorAll('[aria-label="Plot canvas"]')].map((host) => ({
    x: [...host.querySelectorAll(".x-title")].map((e) => e.textContent), y: [...host.querySelectorAll(".y-title")].map((e) => e.textContent) })));
  await expect.poll(titles).toEqual([
    // Fold-key cells: each cell's y is its field; the Frame inside owns x, which nothing names.
    { x: [], y: ["a", "b", "c"] },
    // Ranged frames: their own y columns; only the direct frame's marks name its x.
    { x: ["a"], y: ["a", "b", "c"] },
    { x: [], y: ["a"] },
    // A twin y axis owns its dimension: titled by its own marks' column (the root draws no axes).
    { x: [], y: ["b"] },
  ]);
  expect(errors).toEqual([]);
});
