// TODO 38: dragging marks writes offsets on the table's rows (fixture: src/routes/test/drag).
// Rows are found by color, so "under the pointer" is checked the same way in every frame.
import { test, expect } from "./fixtures.js";
import { pixelReader } from "./png.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

const RED = [214, 39, 40], BLUE = [31, 119, 180], GREEN = [44, 160, 44], PURPLE = [148, 103, 189];

async function open(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/test/drag");
  await page.waitForFunction(() => window.drag?.follows && window.drag?.animated);
  await ready(page);
  return errors;
}
const ready = (page) => expect.poll(() => page.evaluate(() => {
  const canvases = [...document.querySelectorAll(".canvas")];
  return canvases.length >= 11 && canvases.every((canvas) => canvas.getAttribute("aria-busy") === "false");
}), { timeout: 30000 }).toBe(true);
const settle = (page) => page.evaluate(async () => {
  for (const handle of Object.values(window.drag)) await handle?.whenSettled?.();
});
const frames = (page, n = 2) => page.evaluate((n) => new Promise((resolve) => {
  const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
  step(n);
}), n);

/** Where `color` is drawn on the canvas: the centroid of its pixels, in page coordinates. */
async function find(page, canvas, color) {
  // A screenshot scrolls the canvas into view: measure it after.
  const read = pixelReader(await canvas.screenshot()), box = await canvas.boundingBox();
  const scale = await page.evaluate(() => devicePixelRatio);
  let x = 0, y = 0, n = 0;
  for (let py = 0; py < Math.round(box.height * scale); py++)
    for (let px = 0; px < Math.round(box.width * scale); px++) {
      const [r, g, b] = read(px, py);
      if (Math.abs(r - color[0]) + Math.abs(g - color[1]) + Math.abs(b - color[2]) < 70) { x += px; y += py; n++; }
    }
  return n ? { x: box.x + x / n / scale, y: box.y + y / n / scale } : null;
}
const canvasIn = (page, section, index = 0) => page.locator(`#${section} .canvas canvas`).nth(index);
const offsets = (page, handle) => page.evaluate((handle) => window.drag[handle].getOffsets().entries(), handle);
const near = (actual, expected, tolerance = 3) => {
  expect(Math.abs(actual.x - expected.x), `x ${actual.x} vs ${expected.x}`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y), `y ${actual.y} vs ${expected.y}`).toBeLessThanOrEqual(tolerance);
};
/** Press at `from`, move by `by` in `steps`, and release unless `hold`. */
async function drag(page, from, by, { steps = 6, hold = false } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (by.x * i) / steps, from.y + (by.y * i) / steps);
    await frames(page, 1);
  }
  if (!hold) await page.mouse.up();
}

test("a drag moves the row where views read moved(), and nowhere else, the dragged mark included", async ({ page }) => {
  const errors = await open(page);
  await settle(page);
  const fixed = canvasIn(page, "moved", 1), follows = canvasIn(page, "moved", 0);
  const fixedStart = await find(page, fixed, BLUE), followsStart = await find(page, follows, BLUE);
  await drag(page, fixedStart, { x: 60, y: 0 });
  await settle(page);
  // The mark without moved() stays; the one with it moves by the drag.
  near(await find(page, fixed, BLUE), fixedStart);
  near(await find(page, follows, BLUE), { x: followsStart.x + 60, y: followsStart.y });
  const entries = await offsets(page, "data");
  expect(entries.map(({ row, column }) => [row, column])).toEqual([[1, "x"]]);
  expect(entries[0].delta).toBeGreaterThan(1.5);
  expect(errors).toEqual([]);
});

test("a drag in one scatterplot-matrix cell moves the row in every cell", async ({ page }) => {
  const errors = await open(page);
  await settle(page);
  const cells = await page.evaluate(() => window.drag.matrix.getPlots().map(({ row, column }) => ({ row, column })));
  expect(cells.length).toBe(4);
  const starts = [];
  for (let i = 0; i < 4; i++) starts.push(await find(page, canvasIn(page, "matrix", i), RED));
  const dragged = cells.findIndex(({ row, column }) => row !== column);
  // Drag inward so the row stays inside its cell's Cartesian mask.
  const movement = -40;
  await drag(page, starts[dragged], { x: movement, y: 0 });
  await settle(page);
  // Offsets land on the dragged cell's x field only, and every cell showing that field moves.
  const field = cells[dragged].column;
  expect((await offsets(page, "matrixData")).map(({ row, column }) => [row, column])).toEqual([[0, field]]);
  for (let i = 0; i < 4; i++) {
    const now = await find(page, canvasIn(page, "matrix", i), RED), { row, column } = cells[i];
    const dx = now.x - starts[i].x, dy = now.y - starts[i].y;
    expect(Math.abs(dx) > 10, `cell ${i} x`).toBe(column === field);
    expect(Math.abs(dy) > 10, `cell ${i} y`).toBe(row === field);
  }
  near(await find(page, canvasIn(page, "matrix", dragged), RED), { x: starts[dragged].x + movement, y: starts[dragged].y });
  expect(errors).toEqual([]);
});

test("a drag through log, polar and map frames lands under the pointer, with no readbacks while it moves", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  const errors = await open(page);
  await settle(page);
  for (const [section, by] of [["log", { x: 50, y: 0 }], ["polar", { x: 30, y: 25 }], ["map", { x: 30, y: -20 }]]) {
    const canvas = canvasIn(page, section), start = await find(page, canvas, RED);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + by.x / 6, start.y + by.y / 6);
    await frames(page, 3);
    // A drag under way writes offsets and redraws; it reads nothing back (T5).
    const before = await gpuCounters(page);
    for (let i = 2; i <= 6; i++) {
      await page.mouse.move(start.x + (by.x * i) / 6, start.y + (by.y * i) / 6);
      await frames(page, 2);
    }
    const work = await countersDelta(page, before, await gpuCounters(page));
    await page.mouse.up();
    await settle(page);
    expect(work.readbackKinds.jax + work.readbackKinds.picking, `${section}: ${JSON.stringify(work)}`).toBe(0);
    near(await find(page, canvas, RED), { x: start.x + by.x, y: start.y + by.y }, 4);
  }
  expect(errors).toEqual([]);
});

test("a row dragged out of a Filter's range disappears, and returns when dragged back", async ({ page }) => {
  const errors = await open(page);
  await settle(page);
  const shown = () => page.evaluate(() => {
    const mark = window.drag.filteredPoints.getMark();
    return mark.view.marks.of(mark)?.rows.count ?? mark.count;
  });
  expect(await shown()).toBe(1);
  const start = await find(page, canvasIn(page, "moved", 0), PURPLE);
  // Row d (x = 4) moves left past 3, the Filter's bound, while the pointer stays down.
  await drag(page, start, { x: -60, y: 0 }, { hold: true });
  await expect.poll(shown).toBe(0);
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(start.x - 60 + i * 15, start.y);
    await frames(page, 1);
  }
  await expect.poll(shown).toBe(1);
  await page.mouse.up();
  await settle(page);
  const [entry] = await offsets(page, "data");
  expect(entry.row).toBe(3);
  expect(entry.delta).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test("an animate() mark's dragged row stays under the pointer every frame, and Escape animates it back", async ({ page }) => {
  const errors = await open(page);
  await settle(page);
  const canvas = canvasIn(page, "animated"), start = await find(page, canvas, RED);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    const x = start.x + i * 20;
    await page.mouse.move(x, start.y);
    await frames(page, 3);
    // Decision 7: no 1.5 s transition toward each frame's target.
    near(await find(page, canvas, RED), { x, y: start.y }, 4);
  }
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await offsets(page, "animatedData")).toEqual([]);
  await frames(page, 6);
  const leaving = await find(page, canvas, RED);
  expect(leaving.x, "animating back, not snapped").toBeGreaterThan(start.x + 20);
  await expect.poll(async () => Math.abs((await find(page, canvas, RED)).x - start.x), { timeout: 5000 }).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("dragging a selected row moves every selected row by the same change", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.drag.picksData.getSelection().replace([0, 2]));
  await settle(page);
  const canvas = canvasIn(page, "selection"), blue = await find(page, canvas, BLUE), green = await find(page, canvas, GREEN);
  await drag(page, green, { x: 30, y: 0 });
  await settle(page);
  const entries = await offsets(page, "picksData");
  expect(entries.map(({ row }) => row)).toEqual([0, 2]);
  expect(entries[0].delta).toBeCloseTo(entries[1].delta, 5);
  near(await find(page, canvas, BLUE), blue);
  near(await find(page, canvas, GREEN), { x: green.x + 30, y: green.y });
  // A drag ends with the browser's click, which neither selects nor clears: the last press the
  // canvas picked (a click on empty space at the drop point) must not make it one.
  const selected = () => page.evaluate(() => window.drag.picksData.getSelection().status().count);
  const empty = { x: (blue.x + green.x + 30) / 2, y: blue.y };
  await page.mouse.click(empty.x, empty.y);
  await expect.poll(selected).toBe(0);
  await page.evaluate(() => window.drag.picksData.getSelection().replace([0, 2]));
  await drag(page, blue, { x: empty.x - blue.x, y: 0 });
  await settle(page);
  near(await find(page, canvas, BLUE), empty);
  await frames(page, 4);
  expect(await selected()).toBe(2);
  expect(errors).toEqual([]);
});

test("a strip plot drags along its numeric axis only", async ({ page }) => {
  const errors = await open(page);
  await settle(page);
  const canvas = canvasIn(page, "strip"), start = await find(page, canvas, RED);
  await drag(page, start, { x: 40, y: -40 });
  await settle(page);
  const entries = await offsets(page, "stripData");
  expect(entries.map(({ row, column }) => [row, column])).toEqual([[0, "v"]]);
  expect(entries[0].delta).toBeGreaterThan(0.5);
  near(await find(page, canvas, RED), { x: start.x, y: start.y - 40 }, 4);
  expect(errors).toEqual([]);
});

test("an aggregate's mean follows the pointer, moving its group's rows", async ({ page }) => {
  const errors = await open(page);
  await settle(page);
  const canvas = canvasIn(page, "aggregate"), start = await find(page, canvas, RED), other = await find(page, canvas, BLUE);
  await drag(page, start, { x: 0, y: -40 });
  await settle(page);
  near(await find(page, canvas, RED), { x: start.x, y: start.y - 40 }, 4);
  near(await find(page, canvas, BLUE), other);
  // Both members of group a move by the mean's change; group b's rows stay.
  const entries = await offsets(page, "groupedData");
  expect(entries.map(({ row }) => row)).toEqual([0, 1]);
  expect(entries[0].delta).toBeCloseTo(entries[1].delta, 5);
  expect(entries[0].delta).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
