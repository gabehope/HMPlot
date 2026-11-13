import { test, expect } from "./fixtures.js";

test("numeric scales share by source identity and explicit resources cross data scopes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/scale-fixture");
  await page.waitForFunction(() => window.__scaleFixture?.read().every((entry) => entry?.scale));
  await page.evaluate(() => window.__scaleFixture.settled());
  const [a, b, c, d, e, f, g, h] = await page.evaluate(() => window.__scaleFixture.read());
  expect(a.scale).toBe(b.scale);
  expect(a.scale).not.toBe(c.scale);
  expect(a.domain).toEqual([0, 10]);
  expect(b.domain).toEqual([0, 10]);
  expect(c.domain).toEqual([100, 200]);
  expect(d.scale).toBe(e.scale);
  expect(d.domain).toEqual([0, 200]);
  expect(e.domain).toEqual([0, 200]);
  expect(f.scale).toBe(d.scale);
  expect(f.domain).toEqual([0, 200]);
  expect(g.domain).toEqual([0, 3]);
  expect(g.normalization).toBe("none");
  expect(d.colormap).toBe("Inferno");
  expect(h.scale).toBe(a.scale);
  expect(h.domain).toEqual([0, 10]);
  expect(h.colormap).toBe("Inferno");
  await page.evaluate(() => window.__scaleFixture.setAutomaticColormap("Magma"));
  await page.waitForFunction(() => window.__scaleFixture.read().slice(0, 3).every((entry) => entry.colormap === "Magma"));
  const updated = await page.evaluate(() => window.__scaleFixture.read());
  expect(updated[0].scale).toBe(a.scale);
  expect(updated[1].scale).toBe(b.scale);
  expect(updated[2].scale).toBe(c.scale);
  expect(updated[3].colormap).toBe("Inferno");
  expect(updated[7].colormap).toBe("Inferno");
  expect(updated[7].scale).toBe(updated[0].scale);
  expect(errors).toEqual([]);
});

test("facets share numeric colors by default and can resolve them per cell", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/scale-facet-fixture");
  await page.waitForFunction(() => {
    const state = window.__scaleFacetFixture?.read();
    return state?.shared.length === 2 && state?.independent.length === 2 &&
      state?.transformed.length === 2 &&
      [...state.shared, ...state.independent, ...state.transformed].every((entry) => entry.scale);
  });
  await page.evaluate(() => window.__scaleFacetFixture.settled());
  const { shared, independent, transformed } = await page.evaluate(() => window.__scaleFacetFixture.read());
  expect(shared.map((entry) => entry.domain)).toEqual([[0, 200], [0, 200]]);
  expect(shared[0].scale).toBe(shared[1].scale);
  expect(independent.map((entry) => entry.domain)).toEqual([[0, 10], [100, 200]]);
  expect(independent[0].scale).not.toBe(independent[1].scale);
  expect(transformed.map((entry) => entry.domain)).toEqual([[0, 4], [0, 4]]);
  expect(transformed[0].scale).toBe(transformed[1].scale);
  expect(errors).toEqual([]);
});

test("scale gallery example renders and exposes ordered category labels", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/scale-resources");
  await expect(page.getByRole("heading", { name: "Shared and independent scales" })).toBeVisible();
  // The paired example's live scene (TODO 69.10); window.__examples.plot is its first plot.
  const live = page.locator(".live");
  await expect(live.getByRole("button", { name: "Toggle Low" })).toBeVisible({ timeout: 60000 });
  await expect(live.getByRole("button", { name: "Toggle Middle" })).toBeVisible();
  await expect(live.getByRole("button", { name: "Toggle High" })).toBeVisible();
  const coloredPoints = await page.evaluate(async () => {
    await window.__examples.settle();
    const image = await createImageBitmap(await window.__examples.plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width * 0.72; x++) {
      const i = (y * canvas.width + x) * 4;
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
          Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 55) count++;
    }
    image.close();
    return count;
  });
  expect(coloredPoints).toBeGreaterThan(100);
  await expect(page.locator("[role='alert']")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("automatic scale controls live in Axes settings", async ({ page }) => {
  await page.goto("/examples/scale-resources");
  // The plot's trigger, named for its plot, shows while the pointer is over the plot.
  const live = page.locator(".live.ready");
  await live.locator("canvas").first().hover();
  await live.getByRole("button", { name: /^Settings for / }).first().click();
  const panel = page.getByRole("dialog").first();
  await panel.getByRole("treeitem", { name: "Axes", exact: true }).click();
  await expect(panel.getByText("Color scale", { exact: true })).toBeVisible();
  await expect(panel.getByText("Size scale", { exact: true })).toBeVisible();
  await expect(panel.getByText("Width scale", { exact: true })).toBeVisible();
});

test("Python scene snapshot hydrates shared numeric and ordinal scales", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=30_scale_resources");
  await page.waitForFunction(() => window.notebookReady === true);
  const state = await page.evaluate(() => {
    const runtime = window.notebookRuntime;
    const scales = [...runtime.resources.scales.values()];
    const marks = [...runtime.handles.values()].map((entry) => entry.handle?.getMark?.()).filter(Boolean);
    return {
      count: scales.length,
      normalizationCount: runtime.resources.normalizations.size,
      shared: scales.filter((scale) => scale.isContinuous).every((scale) =>
        scale.normalization === [...runtime.resources.normalizations.values()][0]),
      ordinal: scales.some((scale) => scale.isOrdinal && scale.domain.join(",") === "Low,Middle,High"),
      inheritedSize: marks.some((mark) => mark.view.marks.of(mark)?.scales?.size?.range?.join(",") === "8,22"),
    };
  });
  expect(state).toEqual({ count: 3, normalizationCount: 1, shared: true, ordinal: true, inheritedSize: true });
  await expect(page.getByRole("application", { name: "Plot canvas" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a symlog axis ticks 0 and powers of ten with a point at 0 on the 0 tick; a zero on a log axis is not drawn", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/scale-fixture");
  await page.waitForFunction(() => window.__scaleFixture?.transformed.log()?.getAxes()[0]?.getAxisLayout());
  // Red pixel rows along the columns through x = 1, 2, 3, from a PNG export.
  const read = (name) => page.evaluate(async (name) => {
    const plot = window.__scaleFixture.transformed[name]();
    for (let i = 0; i < 100 && !plot.getAxes()[0]?.getAxisLayout(); i++) await new Promise((r) => setTimeout(r, 50));
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const layout = plot.getAxes()[0].getAxisLayout();
    // Tick fractions run across (and up) the whole canvas.
    const column = (value) => {
      const x = Math.round(layout.x.major.find((t) => t.value === value).fraction * width), rows = [];
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        if (data[i] > 180 && data[i + 1] < 120 && data[i + 2] < 120) rows.push(y);
      }
      return rows.length ? (rows[0] + rows.at(-1)) / 2 : null;
    };
    return { points: [1, 2, 3].map(column), height,
      ticks: layout.y.major.map(({ value, fraction }) => ({ value, row: height - fraction * height })) };
  }, name);
  const symlog = await read("symlog");
  const values = symlog.ticks.map((t) => t.value).filter(v=>Math.abs(v)<=1000);
  expect(values).toContain(0);
  expect(values.every((v) => v === 0 || Number.isInteger(Math.log10(Math.abs(v))))).toBe(true);
  expect(values).toEqual([...values].reverse().map((v) => (v === 0 ? 0 : -v)));
  // The point at 0 sits on the 0 tick; ±1000 are symmetric about it; 10 and -100 sit where
  // symlog puts them (log1p(|v|) / log1p(1000) of the way to ±1000; linear would be 1% and 10%).
  const row = (value) => symlog.ticks.find((t) => t.value === value).row;
  const unit = (row(-1000) - row(1000)) / 2, expected = (v) => row(0) - Math.sign(v) * unit * Math.log1p(Math.abs(v)) / Math.log1p(1000);
  expect(Math.abs((row(0) - row(1000)) - (row(-1000) - row(0)))).toBeLessThan(1);
  symlog.points.forEach((point, i) => expect(Math.abs(point - expected([0, 10, -100][i]))).toBeLessThan(2));
  const log = await read("log");
  expect(log.points[0]).toBeNull();
  expect(log.points[1]).not.toBeNull();
  expect(log.points[2]).not.toBeNull();
  expect(errors).toEqual([]);
});
