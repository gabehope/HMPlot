import { test, expect } from "./fixtures.js";

async function open(page) {
  await page.goto("/test/axis-invert");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.invertFixture?.points?.getMark())?.interaction);
  await page.evaluate(async () => {
    const plot = window.invertFixture.plot;
    for (let i = 0; i < 100 && !plot.getAxes()[0]?.getAxisLayout(); i++) await new Promise((r) => setTimeout(r, 50));
    await plot.whenSettled();
  });
}
// Red pixel runs along the columns through the two points, from a PNG export.
const redRows = (page) => page.evaluate(async () => {
  const plot = window.invertFixture.plot;
  const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const layout = plot.getAxes()[0].getAxisLayout();
  const live = window.invertFixture.points.getMark().renderer.domElement;
  const sx = width / live.clientWidth, sy = height / live.clientHeight;
  const column = (x) => {
    const rows = [];
    for (let y = 0; y < height; y++) {
      const i = (y * width + Math.round(x * sx)) * 4;
      if (data[i] > 180 && data[i + 1] < 120 && data[i + 2] < 120) rows.push(y);
    }
    return rows.length ? (rows[0] + rows.at(-1)) / (2 * sy) : null;
  };
  const px = (fx) => layout.left + fx * (layout.right - layout.left);
  return { low: column(px(0.3)), high: column(px(0.7)), top: layout.top, bottom: layout.bottom };
});

test("an inverted y axis draws the smallest value at the top and labels ticks top-down", async ({ page }) => {
  await open(page);
  const rows = await redRows(page);
  expect(rows.low).not.toBeNull();
  expect(rows.high).not.toBeNull();
  // y = 10 near the top, y = 90 near the bottom.
  expect(rows.low).toBeLessThan(rows.top + 0.25 * (rows.bottom - rows.top));
  expect(rows.high).toBeGreaterThan(rows.top + 0.75 * (rows.bottom - rows.top));
  const labels = await page.evaluate(() => {
    const svg = document.querySelector('[aria-label="2D coordinate axes"]');
    return [...svg.querySelectorAll(".y-tick text")].map((t) => ({ y: t.getBoundingClientRect().top, value: Number(t.textContent) }))
      .filter((t) => Number.isFinite(t.value) && [0, 50, 100].includes(t.value));
  });
  const zero = labels.find((l) => l.value === 0), hundred = labels.find((l) => l.value === 100);
  if (zero && hundred) expect(zero.y).toBeLessThan(hundred.y);
});

test("brushing and nearby follow the inverted mapping", async ({ page }) => {
  await open(page);
  const pixel = (fx, fy) => page.evaluate(({ fx, fy }) => {
    const layout = window.invertFixture.plot.getAxes()[0].getAxisLayout();
    const canvas = document.querySelector("canvas").getBoundingClientRect();
    return [canvas.left + layout.left + fx * (layout.right - layout.left), canvas.top + layout.top + fy * (layout.bottom - layout.top)];
  }, { fx, fy });
  // The low point (y = 10) sits 10% down from the top under inversion.
  const [x, y] = await pixel(0.3, 0.1);
  await page.mouse.move(x, y);
  await expect.poll(() => page.evaluate(() => {
    const b = ((m) => m?.view.marks.of(m))(window.invertFixture.points.getMark())?.interaction;
    return b.nearby.getConstraints(b.owner).length;
  })).toBe(1);
  // Shift-drag a box over the top-left quarter: it must brush y in [~0, ~50], i.e. the low point.
  const [x0, y0] = await pixel(0.05, 0.02), [x1, y1] = await pixel(0.55, 0.45);
  await page.keyboard.down("Shift");
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(async () => {
    const plot = window.invertFixture.plot;
    await plot.whenSettled();
    return [...(plot.getBrush()?.rows() ?? [])].length || plot.getBrush()?.status().count;
  })).toBe(1);
  const constraint = await page.evaluate(() => {
    const b = ((m) => m?.view.marks.of(m))(window.invertFixture.points.getMark())?.interaction;
    return b.brush.getConstraints(b.owner).find((c) => c.name === "y")?.bounds;
  });
  expect(constraint[0]).toBeLessThan(15);
  expect(constraint[1]).toBeLessThan(60);
  expect(constraint[1]).toBeGreaterThan(30);
});
