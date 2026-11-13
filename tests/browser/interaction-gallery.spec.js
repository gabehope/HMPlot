import { test, expect } from "./fixtures.js";

// Examples mount through src/lib/docs/Example.svelte on /examples/<id>: the plot sits in
// [aria-label="Live example"] and window.__examples exposes {plot, settle, finished}.
async function openExample(page, id) {
  await page.goto(`/examples/${id}`);
  await page.waitForFunction(() => Boolean(window.__examples?.plot), undefined, { timeout: 30000 });
  await page.evaluate(() => window.__examples.settle());
  await expect(page.locator(".live-example canvas").first()).toBeVisible();
}

for (const id of ["hover-selection", "brush-filter", "shared-selection", "enter-exit"]) {
  test(`${id} example mounts and remains interactive`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openExample(page, id);
    if (id === "enter-exit") {
      // The paired program (TODO 69.10): the button's count picks the state, whose status line
      // and labels the plot draws. A departing label (A) stays until its fade ends.
      const labels = () => page.evaluate(async () => [...new DOMParser().parseFromString(
        await (await window.__examples.plot.exportSVG()).blob.text(), "image/svg+xml").querySelectorAll("text")]
        .map((e) => e.textContent.trim()).filter((t) => /^[A-E]$|^State/.test(t)).sort());
      expect(await labels()).toEqual(["A", "B", "C", "State 1: A, B, C"]);
      await page.locator(".live").getByRole("button", { name: "Next keyed update" }).click();
      await page.evaluate(() => window.__examples.finished());
      await expect.poll(labels).toEqual(["B", "C", "D", "State 2: B, C, D"]);
    }
    expect(errors).toEqual([]);
  });
}


test("complex interaction examples survive compound updates", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ids = ["facet-interactions", "coordinated-explorer", "selection-compare", "lifecycle-stress"];

  for (const id of ids) {
    await openExample(page, id);
    const canvases = page.locator(".live-example canvas");

    if (id === "lifecycle-stress") {
      await page.getByRole("button", { name: "Select six current rows" }).click();
      await expect(page.getByText(/6 selected/)).toBeVisible();
      await page.getByRole("button", { name: "Interrupt with four targets" }).click();
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__examples.finished());
      await expect(page.getByText(/Frame [1-4]/)).toBeVisible();
    } else if (id === "coordinated-explorer" || id === "facet-interactions") {
      // Facet cells publish their marks after the grid shell has settled.
      await page.waitForTimeout(400);
      const box = await canvases.first().boundingBox();
      await page.keyboard.down("Shift");
      await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.28);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.65, { steps: 5 });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await expect(page.locator(".brush-region").first()).toBeVisible();
    } else {
      expect(await canvases.count()).toBeGreaterThanOrEqual(3);
    }
  }
  expect(errors).toEqual([]);
});

test("brush filters publish preview rows before pointer release", async ({ page }) => {
  await page.goto("/examples/brush-filter");
  await page.waitForFunction(() => window.__brushFilterExample?.filtered?.getMark?.());
  await page.evaluate(() => Promise.all([
    window.__brushFilterExample.source.whenSettled(),
    window.__brushFilterExample.brushed.whenSettled(),
  ]));
  const shown = () => page.evaluate(() => {
    const mark = window.__brushFilterExample.filtered.getMark();
    return mark.view.marks.of(mark)?.rows.count ?? mark.count;
  });
  expect(await shown()).toBe(48);
  const canvas = page.locator(".views section").first().locator("canvas"), box = await canvas.boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.65, { steps: 4 });
  await expect.poll(() => page.evaluate(() => window.__brushFilterExample.source.getBrush().status().previewActive)).toBe(true);
  await expect.poll(shown).toBeLessThan(48);
  await expect.poll(shown).toBeGreaterThan(0);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => window.__brushFilterExample.source.getBrush().status().previewActive)).toBe(false);
});

// TODO 43: a column joined from a second table is an axis, a color and a brush.
test("join-tables: a brush on the joined region brushes the flights from those regions", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openExample(page, "join-tables");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.__joinTablesExample?.regionPoints?.getMark())?.interaction);
  const result = await page.evaluate(async () => {
    const { flights, airports, flightsPlot, regionPoints } = window.__joinTablesExample;
    const binding = ((m) => m?.view.marks.of(m))(regionPoints.getMark())?.interaction, column = binding.brushColumns.x;
    // What a Shift-drag across two regions on the x axis commits.
    const regions = ["West", "East"];
    binding.brush.setConstraints(binding.owner, [{ identity: column.identity, name: column.name, type: column.type,
      categories: regions, evaluate: () => column.evaluateConstraint({ categories: regions }), release: () => {} }]);
    await flightsPlot.whenSettled();
    const region = new Map(airports.code.map((code, i) => [code, airports.region[i]]));
    return { name: column.name, categories: column.categories,
      expected: flights.origin.filter((code) => regions.includes(region.get(code))).length,
      error: flightsPlot.getRenderError() };
  });
  expect(result.name).toBe("region");
  expect(result.categories).toEqual(expect.arrayContaining(["West", "Mountain", "Central", "East"]));
  expect(result.expected).toBeGreaterThan(0);
  // The brushed rows are counted once the constraint's evaluation reads back: after settling.
  await expect.poll(() => page.evaluate(() => window.__joinTablesExample.flightsPlot.getBrush().status().committedCount))
    .toBe(result.expected);
  expect(result.error).toBe("");
  await expect(page.locator(".live-example output")).toContainText(`${result.expected} flights brushed`);
  expect(errors).toEqual([]);
});

test.describe("tooltips at DPR 2 (TODO 44)", () => {
  test.use({ deviceScaleFactor: 2 });

  test("tooltips: the nearest point within 16 px shows its fields, leaving hides it, a bar shows its bin and count; one window read per move", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      // Pick readbacks by size: the tolerant pick's window, and one-pixel reads.
      window.__maps = [];
      const map = GPUBuffer.prototype.mapAsync;
      GPUBuffer.prototype.mapAsync = function (...args) {
        window.__maps.push(this.size);
        return map.apply(this, args);
      };
    });
    await openExample(page, "tooltips");
    await page.waitForFunction(() => window.__tooltipsExample?.histogram);
    const canvases = page.locator(".live-example canvas"), box = page.locator(".plot-tooltip");
    // A point's pixel, from a screenshot: its species color, not the white background.
    const scatter = await canvases.nth(0).boundingBox();
    const point = await page.evaluate(async (png) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      // A lone point: colored, with 24 device pixels of background to its right.
      for (let y = Math.floor(height * 0.3); y < height * 0.8; y++)
        for (let x = Math.floor(width * 0.2); x < width * 0.7; x++) {
          const colored = (px) => { const i = (y * width + px) * 4; return Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 60; };
          if (!colored(x)) continue;
          let clear = true;
          for (let d = 4; d < 48 && clear; d++) clear = !colored(x + d);
          if (clear) return { x: x / 2, y: y / 2 };
        }
      return null;
    }, (await canvases.nth(0).screenshot({ scale: "device" })).toString("base64"));
    expect(point).not.toBeNull();
    // 10 CSS px to the right of the point: off it, within the radius.
    await page.mouse.move(scatter.x + point.x + 10, scatter.y + point.y);
    await expect(box).toBeVisible();
    const text = await box.innerText();
    const [title, island, bill, mass] = text.split("\n");
    const found = await page.evaluate(([title, island, bill, mass]) => {
      const p = window.__tooltipsExample.penguins;
      return p.species.findIndex((species, i) => species === title && `island\t${p.island[i]}` === island && `bill\t${p.bill[i]}` === bill &&
        `body mass (g)\t${p.mass[i].toLocaleString("en-US")}` === mass);
    }, [title, island, bill, mass]);
    expect(found, text).toBeGreaterThanOrEqual(0);
    // @tooltip is that row (the example enlarges it), and so is @nearest (TODO 72): the tooltip
    // shows the row the tolerant pick found.
    const tooltipRows = () => page.evaluate(() => Array.from(window.__examples.plot.getHover().owner.tooltip.rows(undefined, "preview")));
    const nearestRows = () => page.evaluate(() => Array.from(window.__examples.plot.getHover().owner.nearest.rows(undefined, "preview")));
    await expect.poll(tooltipRows).toEqual([found]);
    await expect.poll(nearestRows).toEqual([found]);
    // Moving reads back one window per move (the 16 px radius at DPR 2: 65 x 65 pixels), and frames keep pace.
    const before = await page.evaluate(() => ({ maps: window.__maps.length, drawn: window.__examples.plot.getDiagnostics().completedFrame }));
    for (let i = 0; i < 20; i++) await page.mouse.move(scatter.x + point.x + 10 + (i % 5), scatter.y + point.y + Math.floor(i / 5));
    await page.evaluate(() => window.__examples.settle());
    const after = await page.evaluate(() => ({ maps: window.__maps, drawn: window.__examples.plot.getDiagnostics().completedFrame }));
    const windows = after.maps.slice(before.maps).filter((size) => size === 65 * Math.ceil((65 * 16) / 256) * 256);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.length).toBeLessThanOrEqual(20);
    expect(after.maps.length - before.maps).toBeLessThanOrEqual(20 * 3);
    // Leaving the canvas hides it, and @tooltip is empty again.
    await page.mouse.move(scatter.x + scatter.width / 2, scatter.y - 30);
    await expect(box).toHaveCount(0);
    await expect.poll(tooltipRows).toEqual([]);
    await expect.poll(nearestRows).toEqual([]);
    // A histogram bar: its bin (one line for both ends) and its count.
    const histogram = await canvases.nth(1).boundingBox();
    await page.mouse.move(histogram.x + histogram.width * 0.3, histogram.y + histogram.height * 0.8);
    await expect(box).toBeVisible();
    expect(await box.innerText()).toMatch(/^mass\t[\d,.]+ – [\d,.]+\ncount\t\d+$/);
    expect(errors).toEqual([]);
  });
});

test("unified-x: one tooltip lists each series' value at the pointer's date, with a marker on each line", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openExample(page, "unified-x");
  await page.waitForFunction(() => window.__unifiedXExample?.plot);
  const canvas = await page.locator(".live-example canvas").first().boundingBox(), box = page.locator(".plot-tooltip");
  await page.mouse.move(canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.5);
  await expect(box).toBeVisible();
  const [title, ...lines] = (await box.innerText()).split("\n");
  // The listed prices are the rows at the title's date.
  const expected = await page.evaluate((title) => {
    const { prices } = window.__unifiedXExample;
    const day = prices.date.findIndex((date) => date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }) === title);
    const at = prices.date[day]?.getTime();
    return prices.ticker.map((ticker, i) => (prices.date[i].getTime() === at ? `${ticker}\t${prices.price[i]}` : null)).filter(Boolean);
  }, title);
  expect(expected).toHaveLength(3);
  expect([...lines].sort()).toEqual(expected.map((line) => line.replace(/\t(.*)$/, (_, v) => `\t${Number(Number(v).toPrecision(4))}`)).sort());
  await expect(page.locator(".plot-tooltip-marker")).toHaveCount(3);
  expect(errors).toEqual([]);
});
