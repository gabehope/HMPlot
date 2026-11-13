import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

// TODO 17.3b: a mark under a Filter draws the Filter's input rows and hides the rest (points,
// rectangles), or draws the kept rows first and stops at their count (a straight line), so the
// lengths it uploads do not change with the rows kept. It must look, fit its axes and pick
// exactly like the same rows filtered beforehand (the reference plots of /test/padded-marks).
let problems;
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/padded-marks");
  await page.waitForFunction(() => window.paddedMarks?.plots?.densityReference && window.paddedMarks.marks.density?.getMark?.());
  await page.evaluate(() => window.paddedMarks.settle());
  await page.waitForTimeout(300);
});
test.afterEach(() => expect(problems).toEqual([]));

const threshold = (page, value) => page.evaluate(async (v) => {
  window.paddedMarks.setThreshold(v);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await window.paddedMarks.settle();
  await new Promise((resolve) => setTimeout(resolve, 150));
}, value);
/** Pixels that differ between two plots' PNG exports (per channel difference > 8). */
const difference = (page, a, b) => page.evaluate(async ([a, b]) => {
  const image = async (name) => {
    const bitmap = await createImageBitmap(await window.paddedMarks.plots[name].exportPNG());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0); bitmap.close();
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const [x, y] = [await image(a), await image(b)];
  if (x.length !== y.length) return -1;
  let count = 0, drawn = 0;
  for (let i = 0; i < x.length; i += 4) {
    if (Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])) > 8) count++;
    if (x[i] + x[i + 1] + x[i + 2] < 600) drawn++;
  }
  return { count, drawn };
}, [a, b]);

test("points, a line and rectangles under a Filter draw what the filtered rows draw", async ({ page }) => {
  for (const value of [4.5, 8.5, 0.5, 11.5]) {
    await threshold(page, value);
    for (const kind of ["points", "line", "rect", "centered", "scaled", "sorted", "density"]) {
      const result = await difference(page, kind, `${kind}Reference`);
      expect(result.drawn, `${kind} at ${value}`).toBeGreaterThan(50);
      expect(result.count, `${kind} at ${value}: ${JSON.stringify(result)}`).toBe(0);
    }
  }
});

// 17.3d: on explicit axes a mark may swap only its row opacity when the kept rows change; a
// Calculate's arithmetic keeps its values, but a reduction's follow the kept rows.
test("a Calculate after a Filter redraws values that follow the kept rows", async ({ page }) => {
  for (const value of [4.5, 9.5, 2.5]) {
    await threshold(page, value);
    for (const kind of ["centered", "scaled"]) {
      const result = await difference(page, kind, `${kind}Reference`);
      expect(result.drawn, `${kind} at ${value}`).toBeGreaterThan(50);
      expect(result.count, `${kind} at ${value}: ${JSON.stringify(result)}`).toBe(0);
    }
  }
});

// TODO 118.2: a Calculate before the Filter: one update rescales the column a mark draws and
// changes the kept rows, so the mark must redraw its values, not only swap its row opacity.
test("a column that changes with the kept rows is redrawn", async ({ page }) => {
  for (const [factor, value] of [[2, 8.5], [0.5, 4.5], [1.5, 2.5]]) {
    await page.evaluate((factor) => window.paddedMarks.setFactor(factor), factor);
    await threshold(page, value);
    const result = await difference(page, "rescaled", "rescaledReference");
    expect(result.drawn, `rescaled by ${factor} at ${value}`).toBeGreaterThan(50);
    expect(result.count, `rescaled by ${factor} at ${value}: ${JSON.stringify(result)}`).toBe(0);
  }
});

test("axis domains follow the rows a Filter keeps", async ({ page }) => {
  for (const value of [4.5, 9.5]) {
    await threshold(page, value);
    const bounds = await page.evaluate(() => Object.fromEntries(["points", "line", "rect", "pointsReference", "lineReference", "rectReference"]
      .map((name) => [name, ["xbounds", "ybounds"].map((key) => window.paddedMarks.marks[name].getMark().options.get(key))])));
    for (const kind of ["points", "line", "rect"])
      for (const axis of [0, 1])
        bounds[kind][axis].forEach((v, i) => expect(v, `${kind} ${axis} at ${value}`).toBeCloseTo(bounds[`${kind}Reference`][axis][i], 4));
  }
});

test("the marks draw the Filter's input rows, report the kept count, and a line stops at it", async ({ page }) => {
  await threshold(page, 4.5);
  const state = await page.evaluate(() => {
    const { marks, table } = window.paddedMarks, kept = [...table.k].filter((k) => k > 4.5).length;
    // The rows a padded view shows are in the mark's accepted binding.
    const shown = (m) => m.view.marks.of(m).rows.count;
    return { kept, points: [marks.points.getMark().count, shown(marks.points.getMark())],
      line: marks.line.getMark().count, rect: shown(marks.rect.getMark()) };
  });
  expect(state.points).toEqual([24, state.kept]);
  expect(state.line).toBe(state.kept - 1);
  expect(state.rect).toBe(state.kept);
});

test("hidden rows cannot be hovered", async ({ page }) => {
  await threshold(page, 6.5);
  await page.evaluate(() => {
    const mark = window.paddedMarks.marks.points.getMark(), scope = mark.view.marks.of(mark).interaction?.owner;
    window.__hovered = new Set();
    scope.hover.subscribe(() => { for (const row of scope.hover.rows(scope, "preview")) window.__hovered.add(row); });
  });
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  for (let y = 0.05; y < 1; y += 0.05)
    for (let x = 0.02; x < 1; x += 0.02) await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  const { hovered, k } = await page.evaluate(() => ({ hovered: [...window.__hovered], k: [...window.paddedMarks.table.k] }));
  expect(hovered.length).toBeGreaterThan(3);
  for (const row of hovered) expect(k[row], `row ${row}`).toBeGreaterThan(6.5);
});

test("a new threshold compiles nothing once warm (17.3b)", async ({ page }) => {
  await page.evaluate(() => window.paddedMarks.setReferences(false));
  for (const value of [4.5, 5.5, 8.5]) await threshold(page, value);
  const before = await gpuCounters(page);
  for (const value of [3.5, 6.5, 9.5, 2.5]) await threshold(page, value);
  const work = await countersDelta(page, before, await gpuCounters(page));
  // Render pipelines are not counted here: axis lines (three's Line2 material) still compile
  // one per domain change (TODO 17.5/17.6).
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

// TODO 32.12: a mark animated by the `animation` switch keeps the Filter's rows (the hidden-rows
// form, no keys read back) and behaves as before: rows a new threshold shows or hides do so at
// once, and when the rows and their values change together, a row that enters is drawn at its
// new value at once while the rows that stay move.
test("an animated mark under a Filter keeps its rows: rows show at once, entering rows start at their new values", async ({ page }) => {
  const animated = (next) => page.evaluate(async (next) => {
    window.paddedMarks.setAnimated(next);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await window.paddedMarks.plots.animated.whenSettled();
    return window.paddedMarks.readAnimated();
  }, next);
  const table = await page.evaluate(() => ({ k: [...window.paddedMarks.table.k], y: [...window.paddedMarks.table.y] }));
  const between = table.k.map((k) => k > 4.5 && k <= 8.5), above = table.k.map((k) => k > 8.5);
  let rows = await animated({ threshold: 8.5 });
  expect(rows).toHaveLength(24);
  rows.forEach(([, , opacity], i) => expect(opacity, `row ${i}`).toBe(above[i] ? 1 : 0));
  rows = await animated({ threshold: 4.5 });
  rows.forEach(([, , opacity], i) => expect(opacity, `row ${i}`).toBe(above[i] || between[i] ? 1 : 0));
  // Hide the middle rows again, then show them while y switches to k.
  await animated({ threshold: 8.5 });
  rows = await animated({ threshold: 4.5, y: "k" });
  for (const [i, [, y]] of rows.entries())
    if (between[i]) expect(y, `entering row ${i}`).toBeCloseTo(table.k[i], 3);
  const moving = rows.filter(([, y], i) => above[i] && Math.abs(table.y[i] - table.k[i]) > 1 && Math.abs(y - table.k[i]) > 0.5);
  expect(moving.length).toBeGreaterThan(0);
});
