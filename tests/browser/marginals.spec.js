import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// Marginals (TODO 136.16): a scatter and two histograms whose plot areas line up, whose
// histograms share the scatter's domain on their axis and follow it as it zooms, with the
// caller's children in the scatter and exports that compose the three views.
async function open(page, query = "") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/test/marginals${query}`);
  await page.waitForFunction(() => window.marginalsReady);
  await expect.poll(() => page.evaluate(() => Object.values(window.marginals.areas()).every(Boolean))).toBe(true);
  await page.evaluate(() => window.marginals.settled());
  return errors;
}
const close = (a, b) => Math.abs(a - b) < 1;
// Where each tick value sits along the axis, as a fraction: the same in two views over one domain.
const ticks = (page, view, axis) => page.evaluate(([view, axis]) =>
  Object.fromEntries(window.marginals.layout(view)[axis].major.map((tick) => [tick.value, tick.fraction])), [view, axis]);
const same = (a, b) => Object.keys(a).length > 1 && Object.keys(a).every((value) => Math.abs(a[value] - b[value]) < 1e-6);

test("the views line up, the histograms share the scatter's domains, and the children draw in the scatter", async ({ page }) => {
  const errors = await open(page);
  await expect.poll(async () => {
    const { top, main, right } = await page.evaluate(() => window.marginals.areas());
    return close(top.left, main.left) && close(top.right, main.right) && close(right.top, main.top) && close(right.bottom, main.bottom);
  }).toBe(true);
  // The scatter's y labels (to 500,000) widen its left gutter; the histogram above follows it.
  const { top, main } = await page.evaluate(() => window.marginals.areas());
  expect(top.left - (await page.evaluate(() => window.marginals.figure().left))).toBeGreaterThan(40);
  expect(main.bottom - main.top).toBeGreaterThan(200);
  expect(same(await ticks(page, "top", "x"), await ticks(page, "main", "x"))).toBe(true);
  expect(same(await ticks(page, "right", "y"), await ticks(page, "main", "y"))).toBe(true);
  const svg = await page.evaluate(() => window.marginals.exportSVG());
  expect(svg).toContain("inside the scatter");
  const figure = await page.evaluate(() => window.marginals.figure());
  const png = await page.evaluate(() => window.marginals.exportPNG());
  expect(Math.abs(png.width - figure.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(png.height - figure.height)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("zooming the scatter zooms each histogram along its shared axis", async ({ page }) => {
  const errors = await open(page);
  const { main } = await page.evaluate(() => window.marginals.areas());
  await page.mouse.move((main.left + main.right) / 2 + 40, (main.top + main.bottom) / 2 - 30);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => page.evaluate(() => window.marginals.viewport("main").zoomX)).toBeGreaterThan(1.2);
  await expect.poll(async () => {
    const [scatter, top, right] = await page.evaluate(() => ["main", "top", "right"].map((view) => window.marginals.viewport(view)));
    return Math.abs(top.zoomX - scatter.zoomX) < 1e-6 && Math.abs(top.x - scatter.x) < 1e-6 &&
      Math.abs(right.zoomY - scatter.zoomY) < 1e-6 && Math.abs(right.y - scatter.y) < 1e-6;
  }).toBe(true);
  await page.evaluate(() => window.marginals.settled());
  expect(same(await ticks(page, "top", "x"), await ticks(page, "main", "x"))).toBe(true);
  expect(errors).toEqual([]);
});

test("a scene's exports draw the whole figure, and the scatter's children stay the caller's", async ({ page }) => {
  const errors = await open(page);
  const figure = await page.evaluate(() => window.marginals.figure());
  // The scene measures the figure whole, not its first view (the top histogram).
  const png = await page.evaluate(() => window.marginals.scenePNG());
  expect(Math.abs(png.width - figure.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(png.height - figure.height)).toBeLessThanOrEqual(2);
  const svg = await page.evaluate(() => window.marginals.sceneSVG());
  expect(svg).toContain("inside the scatter");
  expect(Number(svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)[2])).toBeGreaterThan(figure.height - 2);
  // The child is not one of the template's parts: not hidden from the settings pane.
  await expect.poll(() => page.evaluate(() => window.marginals.childRegistered())).toBe(true);
  expect(await page.evaluate(() => window.marginals.childHidden())).toBe(false);
  expect(errors).toEqual([]);
});

test("the figure's viewport is the scatter's: set, replayed from a prop, and sent to Python", async ({ page }) => {
  let errors = await open(page);
  const follows = () => page.evaluate(() => {
    const [scatter, top] = ["main", "top"].map((view) => window.marginals.viewport(view));
    return Math.abs(top.zoomX - scatter.zoomX) < 1e-6 && Math.abs(top.x - scatter.x) < 1e-6 && scatter.zoomX > 1.5;
  });
  await page.evaluate(() => window.marginals.setViewport({ x: 0.4, zoomX: 2 }));
  await expect.poll(follows).toBe(true);
  // The viewer's zoom reaches Python as the figure's viewportchange.
  const { main } = await page.evaluate(() => window.marginals.areas());
  await page.mouse.move((main.left + main.right) / 2, (main.top + main.bottom) / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => page.evaluate(() => window.marginals.events()
    .some((e) => e.target === "marginals" && e.event === "viewportchange" && e.payload.viewport.zoomX > 2))).toBe(true);
  expect(errors).toEqual([]);
  // An exported page's viewport prop opens the scatter zoomed, and the histograms follow it.
  errors = await open(page, "?viewport");
  await expect.poll(follows).toBe(true);
  expect(errors).toEqual([]);
});


test("wide marginal panels fill their cells and exported distributions meet the scatter", async ({ page }) => {
  const errors = await open(page, "?wide");
  const geometry = await page.evaluate(() => {
    const areas = window.marginals.areas(), figure = window.marginals.figure();
    return { areas, figure };
  });
  const { main, top, right } = geometry.areas;
  expect(main.right - main.left).toBeGreaterThan(900);
  expect(right.left - main.right).toBeLessThan(35);
  expect(close(top.left, main.left) && close(top.right, main.right)).toBe(true);
  expect(same(await ticks(page, "top", "x"), await ticks(page, "main", "x"))).toBe(true);
  expect(same(await ticks(page, "right", "y"), await ticks(page, "main", "y"))).toBe(true);
  const pixels = await page.evaluate(async ({ areas, figure }) => {
    const bitmap = await createImageBitmap(await window.marginals.pngBlob());
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = Infinity, count = 0;
    for (let y = Math.ceil(areas.right.top - figure.top); y < Math.floor(areas.right.bottom - figure.top); y++)
      for (let x = Math.ceil(areas.main.right - figure.left); x < canvas.width; x++) {
        const at = (y * canvas.width + x) * 4;
        if (data[at + 2] > data[at] + 40 && data[at + 2] > data[at + 1] + 20) {
          left = Math.min(left, x); count++;
        }
      }
    return { left, count, width: canvas.width };
  }, geometry);
  expect(pixels.count).toBeGreaterThan(100);
  expect(pixels.left - (main.right - geometry.figure.left)).toBeLessThan(35);
  expect(errors).toEqual([]);
});
