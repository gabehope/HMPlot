import { test, expect } from "./fixtures.js";

// TODO 17.14e: a Violin's and a BoxPlot's parts sit on their categories when the x axis orders the
// categories differently from the data. Fixture /test/category-order: groups first appear North,
// West, South, East; the axis orders them North, East, South, West, and each group's values lie in
// its own band (North lowest, West highest). The middle of the drawn pixels in each category's
// column must therefore rise along the axis order. Before, East's column carried West's whiskers,
// median and violin.
const middles = (page, name) => page.evaluate(async (name) => {
  const plot = window.categoryOrder[name];
  for (let i = 0; i < 100 && !plot.getAxes()[0]?.getAxisLayout(); i++) await new Promise((r) => setTimeout(r, 50));
  await window.categoryOrder.settle();
  const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  // The probes and layout are in CSS pixels; preserve that coordinate system at DPR 2.
  const live = document.querySelectorAll(".canvas canvas")[["points", "violins", "boxes"].indexOf(name)];
  canvas.width = live.clientWidth; canvas.height = Math.round(bitmap.height * live.clientWidth / bitmap.width);
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
  const layout = plot.getAxes()[0].getAxisLayout();
  const result = {};
  for (const tick of layout.x.major) {
    // A few columns around the category's center, so a one-pixel whisker is not missed.
    const center = Math.round(tick.fraction * width), rows = [];
    for (let y = Math.ceil(layout.top) + 2; y < Math.floor(layout.bottom) - 2; y++)
      for (let x = center - 3; x <= center + 3; x++) {
        const i = (y * width + x) * 4, [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        // Drawn: not background (transparent or near white).
        if (a > 40 && Math.max(r,g,b)-Math.min(r,g,b)>35) { rows.push(y); break; }
      }
    result[tick.label] = rows.length ? { top: rows[0], bottom: rows.at(-1), middle: (rows[0] + rows.at(-1)) / 2 } : null;
  }
  return result;
}, name);

for (const name of ["violins", "boxes"])
  test(`${name} sit on their categories when the axis orders them differently from the data`, async ({ page }) => {
    await page.goto("/test/category-order");
    await page.waitForFunction((name) => window.categoryOrder?.[name], name);
    const rows = await middles(page, name);
    const order = ["North", "East", "South", "West"].map((label) => rows[label]);
    expect(order.every((row) => row !== null), JSON.stringify(rows)).toBe(true);
    // Screen rows grow downward: higher values have smaller rows.
    for (let i = 1; i < order.length; i++) {
      expect(order[i].middle, JSON.stringify(rows)).toBeLessThan(order[i - 1].middle);
      // A box and its whiskers stay in their group's band: they end where the next band starts
      // (violins' smooth tails overlap their neighbors', so only their middles are compared).
      if (name === "boxes") expect(order[i].bottom, JSON.stringify(rows)).toBeLessThanOrEqual(order[i - 1].top + 2);
    }
  });
