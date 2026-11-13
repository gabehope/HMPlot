import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// Centroids of the actual rendered bound markers; PNG includes the device pixel ratio.
const markers = (page) => page.evaluate(async () => {
  const plot = window.brushExtents.plot;
  await plot.whenSettled();
  const bitmap = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const groups = { lower: { count: 0, x: 0 }, upper: { count: 0, x: 0 } };
  for (let i = 0; i < pixels.length; i += 4) {
    const key = pixels[i] > 160 && pixels[i + 1] < 80 && pixels[i + 2] < 80 ? "lower"
      : pixels[i + 2] > 160 && pixels[i] < 80 && pixels[i + 1] < 80 ? "upper" : null;
    if (key) { groups[key].count++; groups[key].x += (i / 4) % canvas.width; }
  }
  return Object.fromEntries(Object.entries(groups).map(([key, value]) => [key,
    value.count ? value.x / value.count / devicePixelRatio : null]));
});

test("brush extent marks follow a live gesture, remain for an empty brush, and clear", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/brush-extents");
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.brushExtents?.points?.getMark())?.interaction);
  const geometry = await page.evaluate(async () => {
    await window.brushExtents.plot.whenSettled();
    const element = document.querySelector('[aria-label="Plot canvas"]'), host = element.getBoundingClientRect();
    const layout = window.brushExtents.plot.getAxes()[0].getAxisLayout();
    return { left: host.left, top: host.top, ...layout };
  });
  const host = await page.locator('[aria-label="Plot canvas"]').boundingBox();
  const x = (value) => host.x + geometry.left + (geometry.right - geometry.left) * value / 10;
  const y = host.y + geometry.top + (geometry.bottom - geometry.top) * 0.65;
  await page.keyboard.down("Shift"); await page.mouse.move(x(2), y); await page.mouse.down();
  await page.mouse.move(x(6), y, { steps: 6 });
  await expect.poll(() => page.evaluate(() => window.brushExtents.plot.getBrush().status().previewActive)).toBe(true);
  const preview = await markers(page);
  expect(preview.lower).not.toBeNull(); expect(preview.upper).not.toBeNull();
  expect(preview.lower).toBeCloseTo(x(2) - host.x, 0);
  expect(preview.upper).toBeCloseTo(x(6) - host.x, 0);
  await page.mouse.up(); await page.keyboard.up("Shift");
  const committed = await markers(page);
  expect(committed.lower).toBeCloseTo(preview.lower, 0);
  expect(committed.upper).toBeCloseTo(preview.upper, 0);
  // A narrow empty brush still draws its two bounds, and the renderer completes another frame.
  const before = await page.evaluate(() => {
    const mark = window.brushExtents.points.getMark(), binding = ((m) => m?.view.marks.of(m))(mark)?.interaction;
    const column = binding.brushColumns.x, bounds = [5, 6];
    binding.brush.setConstraints(binding.owner, [{ identity: column.identity, name: column.name,
      type: column.type, bounds, evaluate: () => column.evaluateConstraint({ bounds }), release() {} }]);
    return mark.view.lifecycle.completedFrame;
  });
  await expect.poll(() => page.evaluate(() => window.brushExtents.plot.getBrush().status().committedCount)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.brushExtents.points.getMark().view.lifecycle.completedFrame)).toBeGreaterThan(before);
  const empty = await markers(page);
  expect(empty.lower).toBeCloseTo(x(5) - host.x, 0);
  expect(empty.upper).toBeCloseTo(x(6) - host.x, 0);
  await page.evaluate(() => window.brushExtents.plot.clearBrush());
  expect(await markers(page)).toEqual({ lower: null, upper: null });
  expect(errors).toEqual([]);
});

test("200000 events draw 40 locations whose brush filters events and responds to delay brushes", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/grouped-locations");
  await expect(page.locator('.canvas[aria-busy="false"]')).toHaveCount(2);
  await page.evaluate(async () => {
    await window.groupedLocations.map.whenSettled();
    await window.groupedLocations.histogram.whenSettled();
  });
  const initial = await page.evaluate(() => {
    const state = window.groupedLocations,
      mark = state.points.getMark();
    const binding = mark.view.marks.of(mark);
    return {
      count: binding.rows.count ?? mark.count,
      events: binding.interaction.owner.length,
      groups: state.group.output().length,
      filtered: state.filter.output().length,
    };
  });
  expect(initial).toEqual({
    count: 40,
    events: 200000,
    groups: 40,
    filtered: 200000,
  });
  const host = await page
    .locator('[aria-label="Plot canvas"]')
    .first()
    .boundingBox();
  const layout = await page.evaluate(() =>
    window.groupedLocations.map.getAxes()[0].getAxisLayout(),
  );
  const x = (value) =>
    host.x + layout.left + ((layout.right - layout.left) * (value + 3)) / 48;
  const y = (value) =>
    host.y + layout.bottom - ((layout.bottom - layout.top) * (value + 3)) / 26;
  await page.keyboard.down("Shift");
  await page.mouse.move(x(-1), y(-1));
  await page.mouse.down();
  await page.mouse.move(x(1), y(21), { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.groupedLocations.airports.status().committedCount,
      ),
    )
    .toBe(25000);
  await expect
    .poll(() =>
      page.evaluate(() => window.groupedLocations.filter.output().length),
    )
    .toBe(25000);
  // A delay brush selects events at one location. Check pixels, not just the resource mask:
  // that location stays red while another point dims; the map completes another frame.
  const before = await page.evaluate(() => {
    const s = window.groupedLocations,
      mark = s.points.getMark();
    const owner = mark.view.marks.of(mark).interaction.owner;
    s.airports.clear();
    s.delays.replace(
      owner,
      Array.from({ length: 5000 }, (_, i) => i * 40),
    );
    return mark.view.lifecycle.completedFrame;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.groupedLocations.points.getMark().view.lifecycle
            .completedFrame,
      ),
    )
    .toBeGreaterThan(before);
  const colors = await page.evaluate(
    async ({ layout }) => {
      const s = window.groupedLocations;
      await s.map.whenSettled();
      const bitmap = await createImageBitmap(await s.map.exportPNG());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return [0, 6].map((value) => {
        const x = Math.round(
          (layout.left + ((layout.right - layout.left) * (value + 3)) / 48) *
            devicePixelRatio,
        );
        const y = Math.round(
          (layout.bottom - ((layout.bottom - layout.top) * 3) / 26) *
            devicePixelRatio,
        );
        return [...context.getImageData(x, y, 1, 1).data];
      });
    },
    { layout },
  );
  expect(colors[0][0]).toBeGreaterThan(140);
  expect(colors[0][1]).toBeLessThan(30);
  expect(colors[1][1]).toBeGreaterThan(colors[0][1] + 70);
  expect(errors).toEqual([]);
});
