import { test, expect } from "./fixtures.js";
import { pixelReader } from "./png.js";
import { installGpuErrors } from "./gpu-counters.js";
test.use({ deviceScaleFactor: 2 });

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text()); });
  await page.addInitScript(installGpuErrors);
});
test.afterEach(async ({ page }) => {
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);
});
async function open(page, scene) {
  await page.goto(`/test/scale-summary?scene=${scene}`);
  await page.waitForFunction(() => window.scaleSummaryFixture?.plot?.getAxes().length &&
    [...document.querySelectorAll(".canvas")].every(canvas => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(async () => {
    const plot = window.scaleSummaryFixture.plot;
    await plot.setAnimationTime(0); await plot.whenSettled();
  });
}
const snapshot = page => page.evaluate(() => window.scaleSummaryFixture.snapshot());
const bounds = page => page.evaluate(() => window.scaleSummaryFixture.bounds());
async function colorPixels(page, matches) {
  const png = await page.locator('[aria-label="Plot canvas"]').screenshot({ scale: "css" });
  const color = pixelReader(png); let count = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < 320; y++) for (let x = 0; x < 480; x++)
    if (matches(color(x, y))) { count++; sumX += x; sumY += y; }
  return { count, x: sumX / count, y: sumY / count };
}

test("autobounds re-read same-identity mutable mark arrays after an authored prop update", async ({ page }) => {
  await open(page, "mutable");
  const before = await snapshot(page);
  expect(before.bounds).toEqual({ x: [1, 3], y: [2, 6] }); expect(before.fixed).toHaveLength(3);
  const identity = await page.evaluate(async () => {
    const f = window.scaleSummaryFixture, x = f.arrays.x, y = f.arrays.y;
    await f.mutate(); return [x === f.arrays.x, y === f.arrays.y];
  });
  expect(identity).toEqual([true, true]);
  await expect.poll(() => bounds(page)).toEqual({ x: [1, 20], y: [2, 40] });
  const after = await snapshot(page);
  expect(after.fixed).toHaveLength(3); expect(after.fixed).not.toEqual(before.fixed);
  expect(after.frames).toBeGreaterThan(before.frames); expect(after.error).toBeFalsy();
  expect((await colorPixels(page, ([r, g, b]) => r > 90 && b > 120 && b > g + 50)).count).toBeGreaterThan(40);
});

test("time geometry publishes evolving automatic domains with its rendered frame", async ({ page }) => {
  await open(page, "time");
  await page.evaluate(() => window.scaleSummaryFixture.plot.setAnimationTime(1000));
  await expect.poll(() => bounds(page)).toEqual({ x: [0, 3], y: [0, 4] });
  const first = await snapshot(page);
  expect(first.fixed).toHaveLength(2); expect(first.moving).toHaveLength(2);
  await page.evaluate(() => window.scaleSummaryFixture.plot.setAnimationTime(5000));
  await expect.poll(() => bounds(page)).toEqual({ x: [0, 3], y: [0, 8] });
  const later = await snapshot(page);
  expect(later.moving).toHaveLength(2); expect(later.moving).not.toEqual(first.moving);
  expect(later.frames).toBeGreaterThan(first.frames); expect(later.error).toBeFalsy();
  expect((await colorPixels(page, ([r, g, b]) => r > 170 && g < 120 && b > 100)).count).toBeGreaterThan(40);
});

test("changing and clearing point size units publishes the matching footprint and autobounds", async ({ page }) => {
  await open(page, "units");
  const before = await snapshot(page);
  expect(before.bounds).toEqual({ x: [1, 3], y: [1, 3] });
  expect(before.radii).toEqual([1, 1, 1]);
  await page.evaluate(() => window.scaleSummaryFixture.units("data"));
  // Under aspect=auto, a data-unit glyph is x units wide; y retains its center domain.
  await expect.poll(() => bounds(page)).toEqual({ x: [0, 4], y: [1, 3] });
  const data = await snapshot(page);
  expect(data.fixed).toHaveLength(3); expect(data.radii[1]).toBeGreaterThan(20);
  expect(data.frames).toBeGreaterThan(before.frames);
  expect((await colorPixels(page, ([r, g, b]) => r > 90 && b > 120 && b > g + 50)).count).toBeGreaterThan(500);
  for (const next of ["px", "data"]) {
    await page.evaluate(value => window.scaleSummaryFixture.units(value), next);
    await expect.poll(() => bounds(page), { message: `automatic bounds after sizeUnits=${next}` })
      .toEqual(next === "data" ? { x: [0, 4], y: [1, 3] } : { x: [1, 3], y: [1, 3] });
  }
  await page.evaluate(() => window.scaleSummaryFixture.units(undefined));
  const cleared = await snapshot(page);
  // Omitting a pass-through option preserves the local effective setting. The domain must
  // match the rendered data-unit glyph rather than assuming that omission resets to pixels.
  expect(cleared.units).toBe("data"); expect(cleared.radii[1]).toBeGreaterThan(20);
  expect(cleared.bounds).toEqual({ x: [0, 4], y: [1, 3] }); expect(cleared.frames).toBeGreaterThan(data.frames);
  expect(cleared.error).toBeFalsy();
});

test("pointer geometry moves visibly while abstaining from automatic axis domains", async ({ page }) => {
  await open(page, "pointer");
  const canvas = await page.locator('[aria-label="Plot canvas"]').boundingBox();
  const move = async fraction => {
    await page.mouse.move(canvas.x + canvas.width * fraction, canvas.y + canvas.height * 0.5);
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await window.scaleSummaryFixture.plot.whenSettled();
    });
    return colorPixels(page, ([r, g, b]) => r > 170 && g < 120 && b > 100);
  };
  const first = await move(0.35), second = await move(0.75);
  expect(first.count).toBeGreaterThan(40); expect(second.count).toBeGreaterThan(40);
  expect(second.x - first.x).toBeGreaterThan(100);
  expect(await bounds(page)).toEqual({ x: [1, 3], y: [1, 3] });
  expect((await snapshot(page)).fixed).toHaveLength(3);
});

test("Image grid placement contributes new cell-edge autobounds after coordinate replacement", async ({ page }) => {
  await open(page, "image");
  expect(await bounds(page)).toEqual({ x: [0, 3], y: [0, 2] });
  const frame = await page.evaluate(() => window.scaleSummaryFixture.plot.getDiagnostics().completedFrame);
  await page.evaluate(() => window.scaleSummaryFixture.moveGrid());
  await expect.poll(() => bounds(page)).toEqual({ x: [9, 15], y: [2, 10] });
  await page.evaluate(() => window.scaleSummaryFixture.plot.whenSettled());
  const state = await page.evaluate(() => ({ frames: window.scaleSummaryFixture.plot.getDiagnostics().completedFrame,
    error: window.scaleSummaryFixture.plot.getRenderError() }));
  expect(state.frames).toBeGreaterThan(frame); expect(state.error).toBeFalsy();
  expect((await colorPixels(page, ([r, g, b]) => r > 180 && g < 80 && b < 80)).count).toBeGreaterThan(100);
  expect((await colorPixels(page, ([r, g, b]) => g > 180 && r < 80 && b < 80)).count).toBeGreaterThan(100);
});
