import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

const fixture = (page, name) => page.locator(`[data-fixture="${name}"]`);
async function open(page) {
  await page.goto("/test/reductions");
  await page.waitForFunction(() => window.reductionFixture?.zPlot?.getFrames?.().length);
  await page.evaluate(() => window.reductionFixture.zPlot.whenSettled());
}
test("a Calculate with reductions renders standard scores centred on zero", async ({ page }) => {
  await open(page);
  await expect(fixture(page, "z").locator("canvas")).toHaveCount(1);
  const domain = await page.evaluate(() => {
    const options = window.reductionFixture.zPlot.getFrames()[0].getFrameOptions();
    return options.get("xbounds");
  });
  // Standard scores of 400 normal values: symmetric about zero, a few units wide.
  expect(domain[0]).toBeLessThan(-1.5);
  expect(domain[1]).toBeGreaterThan(1.5);
  expect(Math.abs(domain[0] + domain[1])).toBeLessThan(1.5);
  expect(await page.evaluate(() => window.reductionFixture.zPlot.getRenderError())).toBeFalsy();
});

// Two red and three blue 7 px points: the pixel counts below hold at a device pixel ratio of 2
// (at 1, the two red points cover about 73 pixels).
test.describe("at a device pixel ratio of 2", () => {
  test.use({ deviceScaleFactor: 2 });
  test("shared ordered expressions draw boolean feedback and selected totals with warm programs", async ({ page }, info) => {
    await page.addInitScript(installGpuCounters);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await open(page);
    const area = fixture(page, "operations");
    await area.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every(node => node.getAttribute('aria-busy') === 'false'));
    await page.evaluate(() => window.reductionFixture.operationsPlot.whenSettled());
    const snapshot = () => page.evaluate(async () => {
      const plot = window.reductionFixture.operationsPlot;
      await plot.whenSettled();
      const result = await plot.exportSVG({mode:'vector'}), text = await result.blob.text();
      const svg = new DOMParser().parseFromString(text,'image/svg+xml');
      const bitmap = await createImageBitmap(await plot.exportPNG());
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap,0,0); bitmap.close();
      let red=0, blue=0;
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      for(let i=0;i<pixels.length;i+=4){if(pixels[i]>180 && pixels[i+1]<90 && pixels[i+2]<100)red++;
        if(pixels[i]<90 && pixels[i+1]<130 && pixels[i+2]>170)blue++;}
      return {red,blue,svg:text,points:svg.querySelectorAll('g[clip-path^="url(#axis-mask"] circle').length,
        frames:plot.getDiagnostics().completedFrame,error:plot.getRenderError(),plans:plot.getDiagnostics().expressionPlans};
    });
    const before = await snapshot();
    expect(before.red).toBeGreaterThan(100); expect(before.blue).toBeGreaterThan(100);
    expect(before.points).toBe(5); expect(before.error).toBeFalsy();
    await area.locator('canvas').screenshot({path:info.outputPath('ordered-expressions-dpr2.png')});
    const counters = await gpuCounters(page);
    await area.getByRole('slider').fill('1');
    await page.evaluate(() => window.reductionFixture.operationsPlot.getSelection().replace([0,3]));
    const changed = await snapshot();
    expect(changed.svg).not.toBe(before.svg); expect(changed.frames).toBeGreaterThan(before.frames);
    expect(changed.red).toBeGreaterThan(100); expect(changed.blue).toBeGreaterThan(100);
    await area.getByRole('slider').fill('2');
    await page.evaluate(() => window.reductionFixture.operationsPlot.getSelection().replace([]));
    const restored = await snapshot();
    expect(restored.svg).toBe(before.svg);
    const work = await countersDelta(page, counters, await gpuCounters(page));
    expect(work.compute).toBe(0);
    expect(errors).toEqual([]);
  });
});

test("bins from a rule and bins from a reduction both reach the transform", async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(async () => {
    const fixture = window.reductionFixture;
    await Promise.all([fixture.rulePlot.whenSettled(), fixture.sizedPlot.whenSettled()]);
    return { rule: fixture.ruleRect.getMark()?.count, sized: fixture.sizedRect.getMark()?.count };
  });
  // Sturges on 400 values is 10 bins; sqrt(400) is 20, rounded from single precision.
  expect(counts).toEqual({ rule: 10, sized: 20 });
});

test("a bandwidth bound to the data re-resolves when the table is replaced", async ({ page }) => {
  await open(page);
  const peak = () => page.evaluate(async () => {
    const fixture = window.reductionFixture;
    await fixture.densityPlot.whenSettled();
    return fixture.densityPlot.getFrames()[0].getFrameOptions().get("xbounds");
  });
  const before = await peak();
  await page.evaluate(() => window.reductionFixture.widen());
  await expect.poll(peak).not.toEqual(before);
  const after = await peak();
  // Four times the spread, so the estimated curve covers a much wider range.
  expect(after[1] - after[0]).toBeGreaterThan(2.5 * (before[1] - before[0]));
  expect(await page.evaluate(() => window.reductionFixture.densityPlot.getRenderError())).toBeFalsy();
});

// 12C A1: shared facet bins resolve a rule or an expression once, over every cell's rows.
test("a faceted Histogram with a rule or an expression count gives every cell the same bins", async ({ page }) => {
  await open(page);
  const cells = (name) => page.evaluate(async (name) => {
    const facet = window.reductionFixture[name];
    await facet.whenSettled();
    return facet.getPlots().map(({ plot }) =>
      plot.getDiagnostics().marks.find((mark) => mark.fields.position)?.fields.position?.count);
  }, name);
  // Facets mount visible cells only.
  await fixture(page, "facet-bins").locator(".facet-cell").first().scrollIntoViewIfNeeded();
  await expect.poll(async () => (await cells("ruleFacet")).length).toBe(2);
  // Sturges over all 116 rows is 8 bins (the 16-row cell alone would be 5).
  expect(await cells("ruleFacet")).toEqual([8, 8]);
  // sqrt(116) rounds to 11 (the cells alone would be 4 and 10).
  await fixture(page, "facet-bins").locator(".facet-cell").last().scrollIntoViewIfNeeded();
  await expect.poll(async () => (await cells("sizedFacet")).length).toBe(2);
  expect(await cells("sizedFacet")).toEqual([11, 11]);
  // No cell reports a render error (a rule name used to fail with "Bin count must be positive").
  await expect(fixture(page, "facet-bins").getByRole("alert")).toHaveCount(0);
});

// 12C A2 and C3: a Filter expression that reads @brushed follows the brush; a Calculate with a
// reduction and no interaction column does not re-run while the brush moves.
test("a brushed Filter expression follows the brush and a Calculate the brush does not touch stays put", async ({ page }) => {
  await open(page);
  const area = fixture(page, "brush");
  await area.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    const fixture = window.reductionFixture;
    await fixture.brushPlot.whenSettled();
    window.__calculateRuns = 0;
    let pending = false;
    fixture.centred.subscribe((status) => {
      if (status.pending && !pending) window.__calculateRuns++;
      pending = status.pending;
    });
    window.__calculateRuns = 0;
  });
  const shown = () => page.evaluate(async () => {
    const fixture = window.reductionFixture;
    await fixture.brushPlot.whenSettled();
    // A mark under a Filter draws the Filter's input rows and reports the rows it shows in
    // its accepted binding's rows (padded views, TODO 17.3b).
    const mark = fixture.aboveBrushed.getMark();
    return (mark?.view.marks.of(mark)?.rows.count ?? mark?.count) ?? 0;
  });
  // The rows the Filter should keep: inside every brush constraint and right of mean(x) = 19.5.
  const expected = () => page.evaluate(() => {
    const { brushRows, brushPlot } = window.reductionFixture;
    const constraints = brushPlot.getBrush().getConstraints();
    return brushRows.x.filter((x, i) => x > 19.5 && constraints.length &&
      constraints.every((c) => { const v = { x, y: brushRows.y[i] }[c.name]; return v >= c.bounds[0] && v <= c.bounds[1]; })).length;
  });
  expect(await shown()).toBe(0); // nothing brushed: @brushed is 0 on every row
  const box = await area.locator('[aria-label="Plot canvas"]').boundingBox();
  const drag = async (from, to) => {
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
  };
  const constraints = () => page.evaluate(() => window.reductionFixture.brushPlot.getBrush().getConstraints().length);
  await drag([0.15, 0.1], [0.95, 0.9]);
  await expect.poll(constraints).toBeGreaterThan(0);
  const wide = await expected();
  expect(wide).toBeGreaterThan(5);
  await expect.poll(shown).toBe(wide);
  // A narrower brush keeps fewer rows, and the Filter follows it again.
  await page.evaluate(() => window.reductionFixture.brushPlot.clearBrush());
  await expect.poll(shown).toBe(0);
  await drag([0.35, 0.1], [0.75, 0.9]);
  await expect.poll(constraints).toBeGreaterThan(0);
  await expect.poll(async () => {
    const next = await expected();
    return next > 0 && next < wide && (await shown()) === next;
  }).toBe(true);
  // Two brush drags re-ran the Filter but never the Calculate, which reads no @ column.
  expect(await page.evaluate(() => window.__calculateRuns)).toBe(0);
});

// 12C C4 and A3: Histogram(bins=<expression>) reaches its Bin; the settings pane shows the
// expression read-only, and a count typed into the pane's text box (once bins is a plain value
// again) is a count, not a rule name.
test("a Histogram bin count from an expression reaches the Bin and is shown read-only", async ({ page }) => {
  await open(page);
  const area = fixture(page, "histogram");
  await area.scrollIntoViewIfNeeded();
  const bars = () => page.evaluate(async () => {
    const fixture = window.reductionFixture;
    await fixture.histogramPlot.whenSettled();
    return fixture.histogram.getMark()?.count;
  });
  expect(await bars()).toBe(20); // sqrt(400)
  await page.evaluate(() => window.reductionFixture.histogramPlot.openSettings());
  await page.getByText("Histogram 1 defaults").click();
  const text = page.locator('[data-setting="histogramBins"] input');
  if (!(await text.isVisible())) await page.getByText("Binning", { exact: true }).first().click();
  await expect(text).toBeVisible();
  await expect(text).toBeDisabled();
  await expect(text).toHaveValue("power(count(x), 0.5)");
  // A plain count makes the box editable again; typing a number or a list of edges works.
  await page.evaluate(() => window.reductionFixture.histogram.update({ bins: 12 }));
  await expect(text).toBeEnabled();
  await expect(text).toHaveValue("12");
  await text.fill("7");
  await expect.poll(bars).toBe(7);
  await text.fill("0, 1, 2, 3");
  await expect.poll(bars).toBe(3);
  await text.fill("sturges");
  await expect.poll(bars).toBe(10);
  expect(await page.evaluate(() => window.reductionFixture.histogramPlot.getRenderError())).toBeFalsy();
});

// 12C B1: an @time channel is re-evaluated every frame with its reductions cached per data
// revision; the channel still reads the reductions of the current data.
test("an @time channel built on reductions moves about the data's mean", async ({ page }) => {
  await open(page);
  await fixture(page, "clock").scrollIntoViewIfNeeded();
  const ys = (time) => page.evaluate(async (time) => {
    const { clockPlot, clockPoints } = window.reductionFixture;
    await clockPlot.setAnimationTime(time);
    const mark = clockPoints.getMark(), field = mark.fields.get("position");
    const renderer = mark.renderer, device = renderer.backend.device;
    const gpu = renderer.backend.get(field.bufferNodeSource).buffer;
    const bytes = field.count * 16;
    const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpu, 0, staging, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Float32Array(staging.getMappedRange()));
    staging.destroy();
    return Array.from({ length: field.count }, (_, i) => values[i * 4 + 1]);
  }, time);
  await page.waitForFunction(() => window.reductionFixture.clockPoints?.getMark()?.fields.get("position")?.count === 4);
  // mean(r) = 2.5 and std(r) = sqrt(1.25) for r = 1..4.
  for (const y of await ys(0)) expect(y).toBeCloseTo(2.5, 3);
  for (const y of await ys(500 * Math.PI)) expect(y).toBeCloseTo(2.5 + Math.sqrt(1.25), 3);
  for (const y of await ys(1500 * Math.PI)) expect(y).toBeCloseTo(2.5 - Math.sqrt(1.25), 3);
  // New data is a new revision: the cached reductions are dropped and computed again.
  await page.evaluate(async () => {
    window.reductionFixture.doubleClock();
    await window.reductionFixture.clockPlot.whenSettled();
  });
  await expect.poll(async () => (await ys(0))[0]).toBeCloseTo(5, 3);
  for (const y of await ys(500 * Math.PI)) expect(y).toBeCloseTo(5 + Math.sqrt(5), 3);
  expect(await page.evaluate(() => window.reductionFixture.clockPlot.getRenderError())).toBeFalsy();
});

// 12C C5: a Python Filter whose condition is a single value (hm.Filter(where=hm.mean("x")))
// fails the scene with the Filter's message, which is what the widget sends to Python as a
// scene diagnostic (static/test/notebook-filter-reduction.json is that scene's snapshot).
test("a Python Filter with a single-value condition surfaces as a scene diagnostic", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/test/notebook?fixture=filter-reduction");
  const expected = /Filter condition must be one value per row; a reduction is a single value, so compare it \(x > mean\(x\)\)/;
  await expect.poll(() => errors.join("\n")).toMatch(expected);
  // The same failure, re-applied the way the widget applies a Python revision, and the
  // payload the widget's error() builds from it for Python.
  const payload = await page.evaluate(async () => {
    const { diagnosticPayload } = await import("/src/lib/plot/utils/diagnostics.js");
    const { state, buffers, metadata } = await (await fetch("/test/notebook-filter-reduction.json")).json();
    try {
      await window.notebookRuntime.apply({ ...state, revision: state.revision + 1 }, (id) => ({
        payload: Uint8Array.from(atob(buffers[id]), (c) => c.charCodeAt(0)),
        descriptor: metadata?.[id],
      }));
      return null;
    } catch (error) {
      return diagnosticPayload(error);
    }
  });
  expect(payload?.message).toMatch(expected);
  expect(payload.code).toBe("frontend");
});

test("large skewed Groups draw accurate reductions and keep completing frames after updates", async ({ page }) => {
  await page.goto("/test/group-reductions");
  const snapshot = async () => {
    // Observe publication of this input revision before reading its derived columns.
    await page.waitForFunction(() => {
      const fixture = window.groupReductions;
      return fixture?.output?.parent?.length === fixture?.data.key.length;
    });
    await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
    return page.evaluate(async () => {
      const fixture = window.groupReductions;
      await fixture.plot.whenSettled();
      const columns = {};
      for (const key of ["key", "average", "total", "lo", "hi", "n", "deviation"])
        columns[key] = Array.from(await fixture.output.get(key).ref.data());
      const expected = new Map();
      fixture.data.key.forEach((key, i) => {
        if (!expected.has(key)) expected.set(key, []);
        expected.get(key).push(fixture.data.value[i]);
      });
      let error = 0, worst = null;
      columns.key.forEach((key, i) => {
        const values = expected.get(key), n = values.length;
        const total = values.reduce((a, b) => a + b, 0), average = total / n;
        const deviation = Math.sqrt(values.reduce((s, v) => s + (v - average) ** 2, 0) / n);
        const reference = { n, total, average, deviation,
          lo: values.reduce((a, b) => Math.min(a, b), Infinity),
          hi: values.reduce((a, b) => Math.max(a, b), -Infinity) };
        for (const name of Object.keys(reference)) {
          const difference = Math.abs(columns[name][i] - reference[name]) / Math.max(1, Math.abs(reference[name]));
          if (difference > error) { error = difference; worst = { key, name, actual: columns[name][i], expected: reference[name] }; }
        }
      });
      const svg = await (await fixture.plot.exportSVG({ mode: "vector" })).blob.text();
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      return { error, worst, rows: expected.size, points: document.querySelectorAll("circle").length,
        svg, frames: fixture.plot.getDiagnostics().completedFrame, renderError: fixture.plot.getRenderError() };
    });
  };
  await page.waitForFunction(() => window.groupReductions?.output);
  const before = await snapshot();
  expect(before.rows).toBe(512);
  expect(before.points).toBe(before.rows);
  expect(before.error).toBeLessThan(1e-4);
  await page.evaluate(() => window.groupReductions.update(1, 262145));
  const after = await snapshot();
  expect(after.error, JSON.stringify(after.worst)).toBeLessThan(1e-4);
  expect(after.points).toBe(after.rows);
  expect(after.svg).not.toBe(before.svg);
  expect(after.frames).toBeGreaterThan(before.frames);
  expect(after.renderError).toBeFalsy();
});
