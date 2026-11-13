import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// A Filter keeps `count` at the full row count and reports the rows its GPU mask keeps
// through its accepted binding's row count.
const filteredRows = (page) => page.evaluate(() => {
  const mark = window.__selectionExample.filtered?.getMark?.();
  return mark?.view.marks.of(mark)?.rows.count ?? mark?.count;
});

test("data-owned selection filters a sibling plot and survives keyed updates", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/data-selections");
  await page.waitForFunction(() => window.__selectionExample?.source?.getSelection?.());
  await page.waitForTimeout(1500);
  const mounted = await page.evaluate(() => {
    const example = window.__selectionExample;
    let filterStatus;
    const stop = example.filtering?.subscribe?.((status) => { filterStatus = status; });
    stop?.();
    return {
      filtering: Boolean(example.filtering),
      filtered: Boolean(example.filtered),
      mark: Boolean(example.filtered?.getMark?.()),
      filterStatus,
      renderError: example.selected?.getRenderError?.(),
    };
  });
  expect(mounted).toMatchObject({ filtering: true, filtered: true, mark: true, renderError: "" });
  await page.evaluate(() => Promise.all([
    window.__selectionExample.source.whenSettled(),
    window.__selectionExample.selected.whenSettled(),
  ]));
  expect(await page.evaluate(() => window.__selectionExample.source.getSelection() === window.__selectionExample.selected.getSelection())).toBe(true);
  expect(await page.evaluate(() => window.__selectionExample.source.getSelection().status().count)).toBe(0);
  await expect.poll(() => filteredRows(page)).toBe(30);
  await page.evaluate(() => window.__selectionExample.source.getSelection().replace([1, 3, 5]));
  await expect.poll(() => page.getByText("3 selected", { exact: true }).count()).toBe(1);
  await page.evaluate(() => Promise.all([
    window.__selectionExample.source.whenSettled(),
    window.__selectionExample.selected.whenSettled(),
  ]));
  await expect.poll(() => filteredRows(page)).toBe(3);
  const plot = page.locator(".views section").first();
  const box = await plot.locator("canvas").first().boundingBox();
  const center = await page.evaluate(() => {
    const layout = window.__selectionExample.source.getAxisLayout();
    const fraction = (axis, value) => {
      const ticks = layout[axis].major;
      const first = ticks[0], last = ticks.at(-1);
      return first.fraction + (value - first.value) / (last.value - first.value) * (last.fraction - first.fraction);
    };
    return { x: fraction("x", 1 / 29), y: 1 - fraction("y", 0.5 + 0.32 * Math.sin(0.75) + 0.12 * Math.cos(1.7)) };
  });
  await page.mouse.click(box.x + box.width * center.x, box.y + box.height * center.y);
  await expect.poll(() => page.evaluate(() => window.__selectionExample.source.getSelection().status().count)).toBe(1);
  await expect.poll(() => filteredRows(page)).toBe(1);

  // An exact plain repeat clears; the sibling visibly draws every source observation again.
  await page.mouse.click(box.x + box.width * center.x, box.y + box.height * center.y);
  await expect.poll(() => filteredRows(page)).toBe(30);
  await expect.poll(() => page.evaluate(async () => {
    const result = await window.__selectionExample.selected.exportSVG();
    const svg = new DOMParser().parseFromString(await result.blob.text(), "image/svg+xml");
    return svg.querySelectorAll("g[clip-path] circle").length;
  })).toBe(30);
  await page.mouse.click(box.x + box.width * center.x, box.y + box.height * center.y);
  await expect.poll(() => filteredRows(page)).toBe(1);

  const togglePoint = await page.evaluate(() => {
    const layout = window.__selectionExample.source.getAxisLayout();
    const fraction = (axis, value) => {
      const ticks = layout[axis].major, first = ticks[0], last = ticks.at(-1);
      return first.fraction + (value - first.value) / (last.value - first.value) * (last.fraction - first.fraction);
    };
    const index = 3, x = index / 29;
    const y = 0.5 + 0.32 * Math.sin(index * 0.75) + 0.12 * Math.cos(index * 1.7);
    return { x: fraction("x", x), y: 1 - fraction("y", y) };
  });
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + box.width * togglePoint.x, box.y + box.height * togglePoint.y);
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => window.__selectionExample.source.getSelection().status().count)).toBe(2);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + box.width * togglePoint.x, box.y + box.height * togglePoint.y);
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => window.__selectionExample.source.getSelection().status().count)).toBe(1);
  await expect(plot.locator(".brush-region")).toHaveCount(0);

  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.65, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => window.__selectionExample.source.getBrush().status().count)).toBeGreaterThan(0);
  const brush = plot.locator(".brush-region");
  await expect(brush).toBeVisible();
  const beforeMove = await brush.boundingBox();
  await page.mouse.move(beforeMove.x + beforeMove.width / 2, beforeMove.y + beforeMove.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeMove.x + beforeMove.width / 2 + box.width * 0.12, beforeMove.y + beforeMove.height / 2 + box.height * 0.08, { steps: 4 });
  await page.mouse.up();
  const afterMove = await brush.boundingBox();
  expect(afterMove.x).toBeGreaterThan(beforeMove.x + 4);
  expect(afterMove.y).toBeGreaterThan(beforeMove.y + 4);

  await page.mouse.click(box.x + box.width * 0.95, box.y + box.height * 0.05);
  await expect.poll(() => page.evaluate(() => window.__selectionExample.source.getBrush().status().count)).toBe(0);
  await expect(brush).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("hover preview reevaluates only the interaction-dependent size expression", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/hover-selection");
  await page.waitForFunction(() => window.__hoverSelectionExample?.points?.getMark?.());
  await page.evaluate(() => window.__hoverSelectionExample.plot.whenSettled());
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const target = await page.evaluate(() => {
    const layout = window.__hoverSelectionExample.plot.getAxisLayout();
    const fraction = (axis, value) => {
      const ticks = layout[axis].major, first = ticks[0], last = ticks.at(-1);
      return first.fraction + (value - first.value) / (last.value - first.value) * (last.fraction - first.fraction);
    };
    return { x: fraction("x", 0.1), y: 1 - fraction("y", 0.18) };
  });
  await page.mouse.move(box.x + box.width * target.x, box.y + box.height * target.y);
  await expect(page.getByText(/1 hovered/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__hoverSelectionExample.plot.getHover().status().previewActive)).toBe(true);
  await page.mouse.move(box.x + box.width - 2, box.y + 2);
  await expect(page.getByText(/0 hovered/)).toBeVisible();
  expect(errors).toEqual([]);
});

// TODO 62: a Line draws series. Hover and select take a whole series and hover fades nothing; a
// brush takes every series with a row inside; a width of literals is pixels. Three flat lines
// (a red at y 5, b green at 15, c blue at 25), 11 rows each, width where(@hovered, 8, 4):
// /test/opacity's plots.series.
test("a Line hovers, selects and brushes whole series; hover fades nothing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/opacity");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.opacityFixture?.marks?.series?.getMark?.())?.interaction);
  await page.evaluate(() => window.opacityFixture.plots.series.whenSettled());
  const canvas = page.locator('[data-fixture="series"] [aria-label="Plot canvas"]');
  await canvas.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.opacityFixture.plots.series.whenSettled());
  const box = await canvas.boundingBox();
  // A data point's page position, from the axes' ticks.
  const at = async (x, y) => {
    const fraction = await page.evaluate(({ x, y }) => {
      const layout = window.opacityFixture.plots.series.getAxisLayout();
      const along = (axis, value) => {
        const ticks = layout[axis].major, first = ticks[0], last = ticks.at(-1);
        return first.fraction + (value - first.value) / (last.value - first.value) * (last.fraction - first.fraction);
      };
      return { x: along("x", x), y: 1 - along("y", y) };
    }, { x, y });
    return [box.x + box.width * fraction.x, box.y + box.height * fraction.y];
  };
  // Pure red, green and blue pixels of the plot's PNG export: a faded line is a pale tint.
  const colors = () => page.evaluate(async () => {
    const plot = window.opacityFixture.plots.series;
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const count = { red: 0, green: 0, blue: 0, redWidth: 0 };
    const middle = Math.round(canvas.width / 2), scale = canvas.width / 400;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r > 200 && g < 70 && b < 70) { count.red++; if ((i / 4) % canvas.width === middle) count.redWidth += 1 / scale; }
      if (g > 140 && r < 70 && b < 70) count.green++;
      if (b > 200 && r < 70 && g < 70) count.blue++;
    }
    return count;
  });
  const rows = (kind, phase) => page.evaluate(({ kind, phase }) => {
    const resource = window.opacityFixture.plots.series[kind]();
    return [...resource.rows(undefined, phase)].sort((a, b) => a - b);
  }, { kind, phase });
  const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const before = await colors();
  expect(before.red).toBeGreaterThan(200);
  // where(@hovered, 8, 4) is pixels, as width={4} is, not values for the width scale (62.4).
  expect(before.redWidth).toBeGreaterThan(2.5);
  expect(before.redWidth).toBeLessThan(5.5);
  // Hovering line b at one row highlights all of b: twice as wide, and the others keep their color.
  await page.mouse.move(...await at(5, 15));
  await expect.poll(() => rows("getHover", "preview")).toEqual(range(11, 21));
  await expect.poll(async () => (await colors()).green).toBeGreaterThan(before.green * 1.6);
  const hovered = await colors();
  expect(hovered.red).toBeGreaterThan(before.red * 0.95);
  expect(hovered.blue).toBeGreaterThan(before.blue * 0.95);
  // A click selects all of c.
  await page.mouse.click(...await at(3, 25));
  await expect.poll(() => rows("getSelection", "committed")).toEqual(range(22, 32));
  // Shift-drag over a short piece of a (days 2-4) brushes all of a.
  const [left, top] = await at(1.6, 9), [right, bottom] = await at(4.4, 1);
  await page.keyboard.down("Shift");
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const brushed = () => page.evaluate(async () => {
    const brush = window.opacityFixture.plots.series.getBrush(), mask = brush.mask(brush.owner, brush.owner.length);
    const values = Array.from(await mask.data(), Number);
    return { series: brush.getConstraints().map((value) => value.series), rows: values.flatMap((value, row) => (value ? [row] : [])) };
  });
  await expect.poll(brushed).toEqual({ series: ["city", "city"], rows: range(0, 10) });
  expect(errors).toEqual([]);
});

// TODO 72: nearest without a tooltip. The tolerant pick reaches a 1 px line from 6 px away (its
// whole series) and a small point from 8 px away, not from 20: @nearest widens the series and
// enlarges the point, hover (the exact pick) stays empty off them, and no box is drawn.
// /test/opacity's plots.nearest: the three flat lines 1 px wide, magenta points at (2, 20), (8, 10).
test("nearest marks the row the tolerant pick finds (a 1 px Line's series too) and draws no box; hover stays exact", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/opacity");
  await page.waitForFunction(() => ["nearestLine", "nearestPoints"].every((name) => ((m) => m?.view.marks.of(m))(window.opacityFixture?.marks?.[name]?.getMark?.())?.interaction));
  const canvas = page.locator('[data-fixture="nearest"] [aria-label="Plot canvas"]');
  await canvas.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.opacityFixture.plots.nearest.whenSettled());
  const box = await canvas.boundingBox();
  const at = async (x, y) => {
    const fraction = await page.evaluate(({ x, y }) => {
      const layout = window.opacityFixture.plots.nearest.getAxisLayout();
      const along = (axis, value) => {
        const ticks = layout[axis].major, first = ticks[0], last = ticks.at(-1);
        return first.fraction + (value - first.value) / (last.value - first.value) * (last.fraction - first.fraction);
      };
      return { x: along("x", x), y: 1 - along("y", y) };
    }, { x, y });
    return [box.x + box.width * fraction.x, box.y + box.height * fraction.y];
  };
  const rows = (mark, kind) => page.evaluate(({ mark, kind }) =>
    [...((m) => m?.view.marks.of(m))(window.opacityFixture.marks[mark].getMark())?.interaction.owner[kind].rows(undefined, "preview")].sort((a, b) => a - b), { mark, kind });
  // Line b's green and the points' magenta in the plot's PNG export.
  const colors = () => page.evaluate(async () => {
    const plot = window.opacityFixture.plots.nearest;
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const count = { green: 0, magenta: 0 };
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      // A 1 px line is antialiased to a paler tint: compare the channels, not their values.
      if (g - Math.max(r, b) > 40) count.green++;
      if (Math.min(r, b) - g > 40) count.magenta++;
    }
    return count;
  });
  const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const before = await colors();
  expect(before.green).toBeGreaterThan(100);
  // 6 px above line b: off the 1 px line, within nearest's 16 px. All of b is nearest and drawn 5 px wide.
  const [lineX, lineY] = await at(5, 15);
  await page.mouse.move(lineX, lineY - 6);
  await expect.poll(() => rows("nearestLine", "nearest")).toEqual(range(11, 21));
  await expect.poll(async () => (await colors()).green).toBeGreaterThan(before.green * 2.5);
  expect(await rows("nearestLine", "hover")).toEqual([]);
  await expect(page.locator(".plot-tooltip")).toHaveCount(0);
  // 8 px right of the point at (8, 10): the point (radius 12), and no line is nearest any more.
  const [pointX, pointY] = await at(8, 10);
  await page.mouse.move(pointX + 8, pointY);
  await expect.poll(() => rows("nearestPoints", "nearest")).toEqual([1]);
  await expect.poll(() => rows("nearestLine", "nearest")).toEqual([]);
  await expect.poll(async () => (await colors()).magenta).toBeGreaterThan(before.magenta * 1.5);
  expect(await rows("nearestPoints", "hover")).toEqual([]);
  await expect(page.locator(".plot-tooltip")).toHaveCount(0);
  // 20 px away: beyond its radius.
  await page.mouse.move(pointX + 20, pointY);
  await expect.poll(() => rows("nearestPoints", "nearest")).toEqual([]);
  // On the point, hover takes it too.
  await page.mouse.move(pointX, pointY);
  await expect.poll(() => rows("nearestPoints", "hover")).toEqual([1]);
  expect(await rows("nearestPoints", "nearest")).toEqual([1]);
  expect(errors).toEqual([]);
});
