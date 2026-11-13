import { test, expect } from "./fixtures.js";

// Six categories over y in [-20, 50], no axes: category i is at x fraction (i + 0.5) / 6 and a
// value v at y fraction 1 - (v + 20) / 70.
const fx = (i) => (i + 0.5) / 6, fy = (v) => 1 - (v + 20) / 70;
const pixels = (page, key, points) => page.evaluate(async ({ key, points }) => {
  const plot = window.lollipopFixture.plots[key];
  await plot.whenSettled();
  const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  return points.map(([fx, fy, dx = 0, dy = 0]) => {
    const x = Math.round(width * fx) + dx, y = Math.round(height * fy) + dy;
    return [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)];
  });
}, { key, points });
const blue = (pixel) => pixel[2] > 200 && pixel[0] < 80 && pixel[1] < 80;
const background = (pixel) => pixel.every((v) => v > 230);

test.beforeEach(async ({ page }) => {
  await page.goto("/test/lollipop");
  await page.waitForFunction(() => window.lollipopFixture?.marks?.custom?.getLegendSource?.());
  await page.evaluate(() => Promise.all(Object.values(window.lollipopFixture.plots).map((p) => p.whenSettled())));
  await page.waitForTimeout(300);
});

test("stems reach values below the baseline and below a raised baseline", async ({ page }) => {
  // Halfway between the baseline (0) and the heads of the two negative rows, and of one positive row.
  const negative = await pixels(page, "negative", [[fx(2), fy(-6)], [fx(5), fy(-4.5)], [fx(0), fy(9)]]);
  for (const pixel of negative) expect(blue(pixel), String(pixel)).toBe(true);
  // Baseline 25: every stem is drawn, whichever side of it the value lies.
  const raised = await pixels(page, "raised", [[fx(0), fy(21.5)], [fx(3), fy(34.5)], [fx(2), fy(6.5)]]);
  for (const pixel of raised) expect(blue(pixel), String(pixel)).toBe(true);
  expect(await page.evaluate(() => window.lollipopFixture.plots.negative.getRenderError())).toBeFalsy();
});

const stems = (page, key) => page.evaluate(async (key) => {
  const plot = window.lollipopFixture.plots[key];
  await plot.whenSettled();
  const handle = plot.getLegendSource().entries().find((h) => /stems/.test(h.entry()?.label ?? ""));
  const mark = handle?.guideMark?.();
  const read = async (field) => (await mark.fields.get(field).data.ref.jsAsync()).flat(Infinity);
  const head = window.lollipopFixture.marks[key].getMark();
  return { start: await read("start"), end: await read("end"), heads: (await head.fields.get("position").data.ref.jsAsync()).flat(Infinity) };
}, key);

test("in 3D every stem meets its head at the head's z", async ({ page }) => {
  const { start, end, heads } = await stems(page, "three");
  // Each stem runs from the baseline to its head, a negative value's included.
  const rows = [[1, 3, 1], [2, -2, 2], [3, 4, 3], [4, 1, 4]];
  expect(heads).toEqual(rows.flat());
  for (const [i, [x, y, z]] of rows.entries()) {
    expect(end.slice(i * 3, i * 3 + 3)).toEqual([x, y, z]);
    expect(start.slice(i * 3, i * 3 + 3)).toEqual([x, 0, z]);
  }
});

test("a categorical y lays the stems along x", async ({ page }) => {
  expect(await page.evaluate(() => window.lollipopFixture.plots.horizontal.getRenderError())).toBeFalsy();
  // The first category is at the top (TODO 136.15): row c (value -12) sits 2.5/6 of the way
  // down; halfway along its stem x = -6.
  const gx = (v) => (v + 20) / 70, gy = (i) => (i + 0.5) / 6;
  const found = await pixels(page, "horizontal", [[gx(-6), gy(2)], [gx(22), gy(3)], [gx(9), gy(0)]]);
  for (const pixel of found) expect(blue(pixel), String(pixel)).toBe(true);
  const { start, end } = await stems(page, "horizontal");
  expect(start.slice(0, 2)).toEqual([0, 0]);
  expect(end.slice(0, 2)).toEqual([18, 0]);
});

test("visible=false hides the stems with the heads, and so does the legend entry", async ({ page }) => {
  const hidden = await pixels(page, "hidden", [[fx(2), fy(-6)], [fx(0), fy(9)], [fx(0), fy(18)]]);
  for (const pixel of hidden) expect(background(pixel), String(pixel)).toBe(true);
  await page.evaluate(async () => {
    const plot = window.lollipopFixture.plots.negative;
    plot.getLegendSource().entries().find((h) => h.entry()?.label === "pops").setVisible(false);
    await plot.whenSettled();
  });
  await page.waitForTimeout(200);
  const toggled = await pixels(page, "negative", [[fx(2), fy(-6)], [fx(0), fy(9)]]);
  for (const pixel of toggled) expect(background(pixel), String(pixel)).toBe(true);
  await page.evaluate(async () => {
    const plot = window.lollipopFixture.plots.negative;
    plot.getLegendSource().entries().find((h) => h.entry()?.label === "pops").setVisible(true);
    await plot.whenSettled();
  });
  await page.waitForTimeout(200);
  const restored = await pixels(page, "negative", [[fx(2), fy(-6)]]);
  expect(blue(restored[0]), String(restored[0])).toBe(true);
});

test("theme.marks.Lollipop sizes the heads and colors and widens the stems", async ({ page }) => {
  // Stem midpoint of row a is green; 7 px above the head's centre is inside a size-20 head
  // (20 px across) and outside the size-5 head.
  const [stem, head, plain] = await Promise.all([
    pixels(page, "themed", [[fx(0), fy(9)], [fx(0), fy(18), 0, -7]]).then((p) => [p[0], p[1]]),
    pixels(page, "negative", [[fx(0), fy(18), 0, -7]]),
  ]).then(([[stem, head], [plain]]) => [stem, head, plain]);
  expect(stem[1]).toBeGreaterThan(120);
  expect(stem[0]).toBeLessThan(80);
  expect(head[0]).toBeGreaterThan(150);
  expect(head[1]).toBeLessThan(120);
  expect(background(plain), String(plain)).toBe(true);
});

test("the docs' third-party Lollipop renders through hmplot/compound's composition surface", async ({ page }) => {
  expect(await page.evaluate(() => window.lollipopFixture.plots.custom.getRenderError())).toBeFalsy();
  const found = await pixels(page, "custom", [[fx(2), fy(-6)], [fx(0), fy(9)]]);
  for (const pixel of found) expect(blue(pixel), String(pixel)).toBe(true);
});
