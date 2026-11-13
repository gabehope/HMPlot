import { test, expect } from "./fixtures.js";

// Segment marks within WebGPU's 8 vertex buffers (fixtures: src/routes/test/line-buffers).
async function open(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/test/line-buffers");
  await page.waitForFunction(() => window.lineBuffers?.marks.connector?.getMark() && ((m) => m?.view.marks.of(m))(window.lineBuffers.marks.columnA?.getMark())?.interaction);
  return errors;
}
const pipelineErrors = (errors) => errors.filter((e) => /vertex buffer|Invalid RenderPipeline/i.test(e));
const probe = (page, key, fraction = 0.3) => page.evaluate(({ key, fraction }) =>
  window.lineBuffers.probe(window.lineBuffers.plots[key], fraction), { key, fraction });
const renderError = (page, key) => page.evaluate((key) => window.lineBuffers.plots[key].getRenderError() ?? "", key);

test("thick curved Lines cover their joins, including varying widths", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 2 }), page = await context.newPage();
  try {
    const errors = await open(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
    for (const key of ["curveJoins", "curveWidths"]) {
      const coverage = await page.evaluate(async (key) => {
        const plot = window.lineBuffers.plots[key];
        await plot.whenSettled();
        const bitmap = await createImageBitmap(await plot.exportPNG({ scale: 2 }));
        const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0); bitmap.close();
        const gpu = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const svg = (await plot.exportSVG({ mode: "vector" })).blob;
        const image = new Image(), url = URL.createObjectURL(svg);
        try { image.src = url; await image.decode(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); }
        finally { URL.revokeObjectURL(url); }
        const ref = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const red = (data, x, y) => { const i = (y * canvas.width + x) * 4; return data[i] - Math.max(data[i + 1], data[i + 2]) > 40; };
        let interior = 0, missing = 0, dark = 0;
        for (let i = 0; i < ref.length; i += 4)
          if (ref[i] > 240 && ref[i + 1] < 50 && ref[i + 2] < 50) dark++;
        // Ignore antialiasing at the stroke's edge; gaps inside the stroke are bugs.
        for (let y = 3; y < canvas.height - 3; y++) for (let x = 3; x < canvas.width - 3; x++) {
          if (![-3, 0, 3].every(dx => [-3, 0, 3].every(dy => red(ref, x + dx, y + dy)))) continue;
          interior++; if (!red(gpu, x, y)) missing++;
        }
        return { interior, missing, dark };
      }, key);
      expect(coverage.interior).toBeGreaterThan(1000);
      expect(coverage.missing, `${key}: ${JSON.stringify(coverage)}`).toBeLessThan(5);
      if (key === "curveWidths") expect(coverage.dark, "SVG joins apply opacity once").toBe(0);
      expect(await renderError(page, key)).toBe("");
    }
    expect(pipelineErrors(errors)).toEqual([]);
  } finally { await context.close(); }
});
// Commit a y interval on the first point column, the way Python or another view would.
const brushY = (page, bounds) => page.evaluate((bounds) => {
  const binding = ((m) => m?.view.marks.of(m))(window.lineBuffers.marks.columnA.getMark())?.interaction, column = binding.brushColumns.y;
  binding.brush.setConstraints(binding.owner, [{ identity: column.identity, name: column.name, type: column.type, bounds,
    evaluate: () => column.evaluateConstraint({ bounds }), release: () => {} }]);
}, bounds);

test("axes wait for the canvas while a scrubbed curve is preparing", async ({ page }) => {
  await open(page);
  const host = page.locator('[data-fixture="curve-axis"]');
  await expect(host.locator('.canvas')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => window.lineBuffers.plots.curveAxis.whenSettled());
  const axes = host.locator('svg[data-export-axes]');
  const before = await axes.innerHTML();
  await page.evaluate(() => {
    const mark = window.lineBuffers.marks.curveAxis.getMark(), curves = mark.curvedPaths;
    const prepare = curves.prepare;
    curves.prepare = () => false;
    window.lineBuffers.resumeCurve = () => { curves.prepare = prepare; mark.invalidate(); };
    window.lineBuffers.setCurveDomain([0, 200]);
  });
  await page.waitForTimeout(200);
  expect(await axes.innerHTML()).toBe(before);
  await page.evaluate(() => window.lineBuffers.resumeCurve());
  await expect.poll(() => axes.innerHTML()).not.toBe(before);
  await page.evaluate(() => window.lineBuffers.plots.curveAxis.whenSettled());
});

test("a connector Line with per-row color and a brushed per-row opacity draws and fades unbrushed rows", async ({ page }) => {
  const errors = await open(page);
  // At rest every connector draws in its own color at 0.7 (alpha to coverage reads about 0.5).
  await expect.poll(async () => Object.values(await probe(page, "connector")).every(({ alpha }) => alpha > 0.3 && alpha < 0.8)).toBe(true);
  // Brushing the blue row (y 80) on the first column keeps it and fades the others to 0.05.
  await brushY(page, [70, 90]);
  await expect.poll(async () => {
    const { red, green, blue } = await probe(page, "connector");
    return blue.alpha > 0.8 && red.alpha < 0.2 && green.alpha < 0.2;
  }).toBe(true);
  expect(await renderError(page, "connector")).toBe("");
  expect(pipelineErrors(errors)).toEqual([]);
});

test("a plain Line with per-row color, opacity and width draws every series", async ({ page }) => {
  const errors = await open(page);
  await expect.poll(async () => (await probe(page, "series")).blue.thickness).toBeGreaterThan(0);
  // Three per-row channels beside the quad and four position buffers: eight vertex buffers.
  const channels = await page.evaluate(() => {
    const mark = window.lineBuffers.marks.series.getMark();
    return mark.vertexBufferFields().channels.filter((name) => mark.fields.get(name)?.isBufferNode || !!mark.fields.get(name)?.bufferMode);
  });
  expect(channels).toEqual(["categoryColor", "width", "interactionOpacity"]);
  // Each series in its own color and width (2, 5 and 10 pixels).
  const { red, green, blue } = await probe(page, "series");
  for (const line of [red, green, blue]) expect(line.alpha).toBeGreaterThan(0);
  expect(red.thickness).toBeLessThan(green.thickness);
  expect(green.thickness).toBeLessThan(blue.thickness);
  // No joins between the series: no red diagonal from the red line's end to the green's start
  // crosses the row between them (y = 35).
  expect(await page.evaluate(() => window.lineBuffers.redRuns(window.lineBuffers.plots.series, 0.65))).toBe(0);
  // Under a Filter that hides a series' rows, the others still draw apart.
  await expect.poll(async () => (await probe(page, "filtered")).green.thickness).toBeGreaterThan(0);
  expect((await probe(page, "filtered")).blue.thickness).toBe(0);
  expect(await page.evaluate(() => window.lineBuffers.redRuns(window.lineBuffers.plots.filtered, 0.65))).toBe(0);
  expect(await renderError(page, "filtered")).toBe("");
  expect(await renderError(page, "series")).toBe("");
  expect(pipelineErrors(errors)).toEqual([]);
});

test("Lines over the vertex buffer limit read the extra channels from storage and draw", async ({ page }) => {
  const errors = await open(page);
  // A dashed Line's path distances are a storage read (TODO 73.2): its three channels fit.
  await expect.poll(async () => (await probe(page, "dashed", 0.25)).blue.thickness).toBeGreaterThan(0);
  expect(await renderError(page, "dashed")).toBe("");
  // A connector whose endpoints carry Dodge offsets: the offsets are a fourth channel, nine
  // vertex buffers. Per-row opacity, the last, is read from storage (TODO 136.11).
  await expect.poll(async () => (await probe(page, "dodged")).blue.thickness).toBeGreaterThan(0);
  expect(await renderError(page, "dodged")).toBe("");
  expect(await page.evaluate(() => [...(window.lineBuffers.marks.dodged.getMark().storageFields ?? [])]))
    .toEqual(["interactionOpacity"]);
  // Each row keeps its own width (2, 5, 10) and opacity (1, 0.5, 0.2).
  const { red, green, blue } = await probe(page, "dodged");
  expect(red.thickness).toBeLessThan(green.thickness);
  expect(green.thickness).toBeLessThan(blue.thickness);
  expect(red.alpha).toBeGreaterThan(green.alpha);
  expect(green.alpha).toBeGreaterThan(blue.alpha);
  expect(pipelineErrors(errors)).toEqual([]);
});

// TODO 73.2: a dash is measured in CSS pixels along the drawn path, on screen: 8-pixel dashes and
// gaps along x and along y of a plot that scales them differently, and the same after a zoom.
test("dashes are CSS pixels along the drawn path, along x and y alike and under zoom", async ({ page, browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 2 }), sharp = await context.newPage();
  const errors = await open(sharp);
  const keys = await sharp.evaluate(() => Object.keys(window.lineBuffers.plots));
  const canvas = sharp.locator('[data-fixture="pixels"] canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  await sharp.evaluate(() => window.lineBuffers.plots.pixels.whenSettled());
  // Red runs along the horizontal leg's row and the vertical leg's column (the row and column
  // with the most red), in CSS pixels; the full ones only.
  const dashes = async () => sharp.evaluate(async (b64) => {
    const image = new Image(); image.src = "data:image/png;base64," + b64; await image.decode();
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const context = c.getContext("2d"); context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, c.width, c.height), scale = width / 320;
    const red = (x, y) => { const i = (y * width + x) * 4; return data[i] - Math.max(data[i + 1], data[i + 2]) > 100; };
    const runs = (at) => {
      const out = []; let run = 0;
      for (let k = 0; ; k++) { const [x, y] = at(k); if (x >= width || y < 0) break; if (red(x, y)) run++; else if (run) { out.push(run / scale); run = 0; } }
      return out.slice(1, -1);
    };
    const rows = new Array(height).fill(0), columns = new Array(width).fill(0);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (red(x, y)) { rows[y]++; columns[x]++; }
    const row = rows.indexOf(Math.max(...rows)), column = columns.indexOf(Math.max(...columns));
    return { x: runs((k) => [k, row]).filter((_, i, all) => i < all.length - 1), y: runs((k) => [column, height - 1 - k]) };
  }, (await canvas.screenshot()).toString("base64"));
  const near = (values) => values.length >= 2 && values.every((v) => Math.abs(v - 8) <= 1.5);
  const before = await dashes();
  expect(near(before.x) && near(before.y), JSON.stringify(before)).toBe(true);
  await canvas.hover();
  await sharp.mouse.wheel(0, -300);
  await sharp.waitForTimeout(600);
  await sharp.evaluate(() => window.lineBuffers.plots.pixels.whenSettled());
  const after = await dashes();
  expect(near(after.x), JSON.stringify(after)).toBe(true);
  expect(pipelineErrors(errors)).toEqual([]);
  expect(keys).toContain("pixels");
  await context.close();
});

test("a solid Line made dashed measures its path: dashes run across its short segments", async ({ page }) => {
  const errors = await open(page);
  const runs = () => page.evaluate(() => window.lineBuffers.redRuns(window.lineBuffers.plots.dashing, 0.5));
  // Solid, it draws one run.
  await expect.poll(runs).toBe(1);
  // Dashed, each 3-pixel segment continues the pattern from the path's start (the screen-space
  // prefix sum, TODO 73.2): each segment starting its own dash would draw it solid.
  await page.evaluate(() => window.lineBuffers.setDashing(true));
  await expect.poll(runs).toBeGreaterThan(4);
  await page.evaluate(() => window.lineBuffers.setDashing(false));
  await expect.poll(runs).toBe(1);
  expect(pipelineErrors(errors)).toEqual([]);
});
test("a basis Line can become empty while the plot keeps drawing its other marks", async ({ page }) => {
  const errors = await open(page);
  const canvas = page.locator('[data-fixture="empty-basis"] .canvas');
  await canvas.scrollIntoViewIfNeeded();
  const settled = async () => {
    await expect(canvas).toHaveAttribute("aria-busy", "false");
    await page.evaluate(() => window.lineBuffers.plots.emptyBasis.whenSettled());
  };
  await settled();
  expect((await probe(page, "emptyBasis", 0.3)).red.thickness).toBe(0);
  expect((await probe(page, "emptyBasis", 0.5)).green.thickness).toBeGreaterThan(5);
  expect(await renderError(page, "emptyBasis")).toBe("");
  await page.evaluate(() => window.lineBuffers.setBasisRows([[10, 50], [90, 50]]));
  await settled();
  expect((await probe(page, "emptyBasis", 0.3)).red.thickness).toBeGreaterThan(3);
  await page.evaluate(() => window.lineBuffers.setBasisRows([]));
  await settled();
  expect((await probe(page, "emptyBasis", 0.3)).red.thickness).toBe(0);
  expect((await probe(page, "emptyBasis", 0.5)).green.thickness).toBeGreaterThan(5);
  expect(await renderError(page, "emptyBasis")).toBe("");
  expect(errors).toEqual([]);
});
