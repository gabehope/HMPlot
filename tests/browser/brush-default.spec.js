import { test, expect } from "./fixtures.js";

// TODO 145.5: interactive="brush" makes a plain drag brush (Shift-drag pans); the default pans
// on a plain drag and brushes on Shift-drag; interactive=false brushes on a plain drag.
const KEYS = ["brush", "pan", "still"];

async function open(page) {
  await page.goto("/test/brush-default");
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(3);
  await page.evaluate(() => Promise.all(Object.values(window.brushDefault).map((plot) => plot.whenSettled())));
  // Zoomed in, so a pan has room to move the view (at zoom 1 it is held to the data).
  await page.evaluate(async () => {
    for (const key of ["brush", "pan"]) window.brushDefault[key].setViewport({ x: 0.5, y: 0.5, zoom: 2 });
    await Promise.all(["brush", "pan"].map((key) => window.brushDefault[key].whenSettled()));
  });
}
// Page coordinates of a point given as fractions of a plot's canvas.
async function at(page, key, fx, fy) {
  const box = await page.locator('[aria-label="Plot canvas"]').nth(KEYS.indexOf(key)).boundingBox();
  return [box.x + box.width * fx, box.y + box.height * fy];
}
async function drag(page, key, from, to, { shift = false } = {}) {
  const [x0, y0] = await at(page, key, ...from), [x1, y1] = await at(page, key, ...to);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await page.evaluate((key) => window.brushDefault[key].whenSettled(), key);
}
const brushed = (page, key) => page.evaluate((key) => window.brushDefault[key].getBrush().status().count, key);
const center = (page, key) => page.evaluate((key) => { const v = window.brushDefault[key].getViewport(); return [v.x, v.y]; }, key);

test('interactive="brush": a plain drag brushes and leaves the view where it was', async ({ page }) => {
  await open(page);
  const before = await center(page, "brush");
  await drag(page, "brush", [0.3, 0.3], [0.7, 0.7]);
  await expect.poll(() => brushed(page, "brush")).toBeGreaterThan(0);
  expect(await center(page, "brush")).toEqual(before);
});

test('interactive="brush": Shift-drag pans and does not brush', async ({ page }) => {
  await open(page);
  const before = await center(page, "brush");
  await drag(page, "brush", [0.3, 0.5], [0.6, 0.5], { shift: true });
  await expect.poll(async () => (await center(page, "brush"))[0]).not.toBe(before[0]);
  expect(await brushed(page, "brush")).toBe(0);
});

test('interactive="brush": a drag inside the brush moves it, and a click outside clears it', async ({ page }) => {
  await open(page);
  await drag(page, "brush", [0.3, 0.3], [0.55, 0.7]);
  await expect.poll(() => brushed(page, "brush")).toBeGreaterThan(0);
  const [first] = await page.evaluate(() => window.brushDefault.brush.getBrush().getConstraints());
  await drag(page, "brush", [0.42, 0.5], [0.62, 0.5]);
  await expect.poll(async () => (await page.evaluate(() => window.brushDefault.brush.getBrush().getConstraints()))[0]?.bounds?.[0])
    .toBeGreaterThan(first.bounds[0]);
  const [x, y] = await at(page, "brush", 0.92, 0.15);
  await page.mouse.click(x, y);
  await expect.poll(() => brushed(page, "brush")).toBe(0);
});

test("the default pans on a plain drag and brushes on Shift-drag; interactive=false brushes on a plain drag", async ({ page }) => {
  await open(page);
  const before = await center(page, "pan");
  await drag(page, "pan", [0.3, 0.5], [0.6, 0.5]);
  await expect.poll(async () => (await center(page, "pan"))[0]).not.toBe(before[0]);
  expect(await brushed(page, "pan")).toBe(0);
  await drag(page, "pan", [0.3, 0.3], [0.7, 0.7], { shift: true });
  await expect.poll(() => brushed(page, "pan")).toBeGreaterThan(0);
  await drag(page, "still", [0.3, 0.3], [0.7, 0.7]);
  await expect.poll(() => brushed(page, "still")).toBeGreaterThan(0);
});
