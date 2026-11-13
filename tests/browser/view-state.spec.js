// TODO 28 Part A: @time in transforms (src/routes/test/view-state).
import { test, expect } from "./fixtures.js";

async function open(page) {
  await page.goto("/test/view-state");
  await page.waitForFunction(() => window.viewState?.revealPlot && window.viewState?.stepPlot && window.viewState?.outerPlot && window.viewState?.channelPlot && window.viewState?.facetPlot && window.viewState?.fadePlot && window.viewState?.sharedB);
  // Every plot has revealed before whenSettled (a plot can settle while it still shows "Loading...").
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(async () => {
    const f = window.viewState;
    await Promise.all([f.revealPlot, f.stepPlot, f.outerPlot, f.channelPlot, f.facetPlot, f.fadePlot].map((plot) => plot.whenSettled()));
  });
}

test("a Filter on @time keeps the rows the clock has passed, and set_time reproduces it", { tag: "@gpu" }, async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.viewState, probe = f.probes.reveal, out = {};
    await f.revealPlot.setAnimationTime(450);
    out.at450 = probe.length;
    await f.revealPlot.setAnimationTime(950);
    out.at950 = probe.length;
    await f.revealPlot.setAnimationTime(0);
    out.at0 = probe.length;
    // The same time again changes no value the Filter reads: no run.
    const runs = probe.runs;
    await f.revealPlot.setAnimationTime(0);
    out.rerunsForSameTime = probe.runs - runs;
    await f.revealPlot.setAnimationTime(450);
    out.again = probe.length;
    out.live = probe.live;
    out.png = (await f.revealPlot.exportPNG()).size;
    return out;
  });
  expect(result).toMatchObject({ at450: 5, at950: 10, at0: 0, rerunsForSameTime: 0, again: 5, live: true });
  expect(result.png).toBeGreaterThan(0);
});

test("interval(@time, 500) re-runs a Filter once per step", { tag: "@gpu" }, async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.viewState, probe = f.probes.stepped, out = {};
    await f.stepPlot.setAnimationTime(999);
    out.at999 = probe.length;
    const runs = probe.runs;
    for (const time of [600, 700, 800, 900, 950]) await f.stepPlot.setAnimationTime(time);
    out.rerunsWithinStep = probe.runs - runs;
    await f.stepPlot.setAnimationTime(1000);
    out.at1000 = probe.length;
    out.live = probe.live;
    return out;
  });
  expect(result).toMatchObject({ at999: 5, rerunsWithinStep: 0, at1000: 10, live: false });
});

test("a Calculate outside its Plot reads that Plot's clock", { tag: "@gpu" }, async ({ page }) => {
  await open(page);
  const values = await page.evaluate(async () => {
    const f = window.viewState;
    await f.outerPlot.setAnimationTime(700);
    return f.probes.outer.values;
  });
  expect(values).toEqual(Array.from({ length: 10 }, (_, i) => 700 - i * 100));
});

test("a transform reading @time over two Plots names the problem", { tag: "@gpu" }, async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-fixture="two-views"] [role="alert"]')).toContainText("have different clocks");
});

// TODO 50: Plots in one InputContext share its clock: a transform over them reads @time, and
// setAnimationTime on one holds them all and steps the context's Playback with it (a video's
// frames). Playing, the @time Filter and the Playback's move on the same frames.
test("Plots in one InputContext share @time, and setAnimationTime steps its Playback", { tag: "@gpu" }, async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-fixture="shared-clock"] [role="alert"]')).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const f = window.viewState, a = f.sharedA, b = f.sharedB, playback = f.sharedPlayback;
    playback.setValue(100);
    playback.play(false);
    await a.setAnimationTime(450);
    const held = { a: a.getAnimationTime(), b: b.getAnimationTime(), frozen: b.getAnimationTimeFrozen(), value: playback.getValue() };
    await b.whenSettled();
    const shown = { shared: f.probes.shared.length, played: f.probes.played.length };
    // Frozen: frames move nothing. A step forward moves the Playback by rate x step.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const still = playback.getValue();
    await b.setAnimationTime(650);
    await b.whenSettled();
    const stepped = { value: playback.getValue(), a: a.getAnimationTime(), played: f.probes.played.length };
    // Running: both move on the scope's frames, at most once per frame each.
    await a.setAnimationTime(null);
    const runs = { shared: f.probes.shared.runs, played: f.probes.played.runs };
    let frames = 0, counting = true;
    const count = () => { if (counting) { frames++; requestAnimationFrame(count); } };
    requestAnimationFrame(count);
    await new Promise((resolve) => setTimeout(resolve, 600));
    counting = false;
    playback.pause(false);
    return { held, shown, still, stepped, frames, shared: f.probes.shared.runs - runs.shared, played: f.probes.played.runs - runs.played };
  });
  expect(result.held).toEqual({ a: 450, b: 450, frozen: true, value: 100 });
  // Rows with t < 450 under the @time Filter, and of those t < 100 under the Playback's.
  expect(result.shown).toEqual({ shared: 5, played: 1 });
  expect(result.still).toBe(100);
  expect(result.stepped).toEqual({ value: 300, a: 650, played: 3 });
  expect(result.shared, JSON.stringify(result)).toBeGreaterThan(5);
  expect(result.shared, JSON.stringify(result)).toBeLessThanOrEqual(result.frames + 1);
  expect(result.played, JSON.stringify(result)).toBeLessThanOrEqual(result.frames + 1);
});

test("a live Filter re-runs as the clock runs; whenSettled resolves and marks swap masks (T5)", { tag: "@gpu" }, async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.viewState, probe = f.probes.reveal;
    await f.revealPlot.setAnimationTime(null);
    // A full preparation writes the position field (BufferedField.version); a mask swap does not.
    const position = () => f.revealPoints.getMark().fields.get("position").version;
    const drawn = () => f.revealPlot.getDiagnostics().completedFrame;
    const runs = probe.runs, writes = position(), drawnBefore = drawn();
    // Count the animation frames in the same window: the clock's time moves once per frame.
    let frames = 0, counting = true;
    const count = () => { if (counting) { frames++; requestAnimationFrame(count); } };
    requestAnimationFrame(count);
    await new Promise((resolve) => setTimeout(resolve, 600));
    counting = false;
    const ran = probe.runs - runs, drew = drawn() - drawnBefore;
    const started = performance.now();
    await f.revealFilter.whenSettled();
    const settle = performance.now() - started;
    return { runs: ran, frames, drew, writes: position() - writes, settle };
  });
  // About one run per frame (runs chain: a slow one is followed by the newest time only).
  expect(result.runs).toBeGreaterThan(5);
  expect(result.runs, JSON.stringify(result)).toBeLessThanOrEqual(result.frames + 1);
  // Rendering keeps up: a re-run waits for the frame showing the last one, so uploads never
  // starve the render loop (it drew 3 frames a second before).
  expect(result.drew, JSON.stringify(result)).toBeGreaterThan(result.frames / 4);
  expect(result.settle).toBeLessThan(3000);
  // Explicit domains: the mark swaps its row opacity instead of preparing again each frame.
  expect(result.writes).toBe(0);
});

test("a channel on interval(@time) or floor(@time) writes its field only when its value changes", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.viewState;
    const version = (handle) => handle.getMark().fields.get("position").version;
    const y = async (handle) => {
      const mark = handle.getMark(), field = mark.fields.get("position"), attribute = field.bufferNodeSource;
      const device = mark.renderer.backend.device, gpu = mark.renderer.backend.get(attribute).buffer;
      const staging = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(gpu, 0, staging, 0, 16);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const value = new Float32Array(staging.getMappedRange())[1];
      staging.destroy();
      return value;
    };
    const out = {};
    await f.channelPlot.setAnimationTime(600);
    out.stepped600 = await y(f.steppedPoints);
    const stepped = version(f.steppedPoints), floored = version(f.flooredPoints);
    for (const time of [700, 800, 900, 990]) await f.channelPlot.setAnimationTime(time);
    out.steppedWrites = version(f.steppedPoints) - stepped;
    out.flooredWrites = version(f.flooredPoints) - floored;
    await f.channelPlot.setAnimationTime(1000);
    out.stepped1000 = await y(f.steppedPoints);
    out.floored1000 = await y(f.flooredPoints);
    out.steppedWritesAtStep = version(f.steppedPoints) - stepped;
    return out;
  });
  expect(result).toMatchObject({ stepped600: 5, steppedWrites: 0, flooredWrites: 0, stepped1000: 10, floored1000: 1 });
  expect(result.steppedWritesAtStep).toBeGreaterThan(0);
});

test("a Filter on @time in a Facet filters every cell at the plot's time", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.viewState, probe = f.probes.facet, out = {};
    for (const time of [450, 950, 0]) {
      await f.facetPlot.setAnimationTime(time);
      out[time] = [...probe.cells.values()].sort();
    }
    return out;
  });
  // Two cells (a, b) of ten rows each: t < time in each.
  expect(result).toEqual({ 450: [5, 5], 950: [10, 10], 0: [0, 0] });
});

test("a row entering through a live Filter animates once; later re-runs do not restart it", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.viewState;
    const ys = async () => {
      const mark = f.fadePoints.getMark(), field = mark.fields.get("position"), attribute = field.bufferNodeSource;
      const device = mark.renderer.backend.device, gpu = mark.renderer.backend.get(attribute).buffer, bytes = field.count * 16;
      const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(gpu, 0, staging, 0, bytes);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(staging.getMappedRange());
      const out = Array.from({ length: field.count }, (_, i) => Math.round(values[i * 4 + 1] * 1000) / 1000);
      staging.destroy();
      return out;
    };
    // Rows 0-4 enter at 10450, row 5 at 10550, rows 6-7 at 10750; each rises from y = -1 to y = i
    // over 400 ms, linearly.
    await f.fadePlot.setAnimationTime(10450);
    await f.fadePlot.setAnimationTime(10550);
    await f.fadePlot.setAnimationTime(10750);
    return ys();
  });
  const expected = (row, entered) => -1 + (row + 1) * Math.min(1, (10750 - entered) / 400);
  const entered = [10450, 10450, 10450, 10450, 10450, 10550, 10750, 10750];
  expect(result.length).toBe(8);
  // Row 5 is halfway: the re-runs at 10750 (rows 6 and 7 entering) did not start it again.
  result.forEach((y, row) => expect(Math.abs(y - expected(row, entered[row])), `row ${row}: ${JSON.stringify(result)}`).toBeLessThan(0.02));
});

// TODO 45: pointer columns through a Crosshair (src/routes/test/view-state?section=pointer).
async function openPointer(page) {
  await page.goto("/test/view-state?section=pointer");
  await page.waitForFunction(() => window.pointerFixture?.datedPlot && window.pointerFixture?.polarPlot && window.pointerFixture?.mapPlot);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => Promise.all(["datedPlot", "polarPlot", "mapPlot"].map((name) => window.pointerFixture[name].whenSettled())));
}

test("a Crosshair follows the pointer with readouts in Cartesian, polar and map frames, and a still pointer draws nothing (TODO 45)", async ({ page }) => {
  await openPointer(page);
  const canvases = page.locator('[aria-label="Plot canvas"]');
  // After a move: the tracker tells its readers at the next animation frame, then the view settles.
  const settle = (plot) => page.evaluate(async (plot) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await window.pointerFixture[plot].whenSettled();
  }, plot);
  const readout = (crosshair) => page.evaluate((crosshair) => window.pointerFixture[crosshair].getReadout(), crosshair);
  // The crosshair's red and the rule's green in a screenshot of the canvas (exports leave the pointer out).
  const pixels = async (index, at) => page.evaluate(async ({ png, at }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const red = (i) => data[i] > 200 && data[i] - data[i + 1] > 90 && data[i] - data[i + 2] > 90;
    const green = (i) => data[i + 1] - data[i] > 50 && data[i + 1] - data[i + 2] > 30;
    const columns = new Array(width).fill(0), rows = new Array(height).fill(0), greenRows = new Array(height).fill(0);
    let near = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (green(i)) greenRows[y]++;
      if (!red(i)) continue;
      columns[x]++; rows[y]++;
      if (at && Math.hypot(x - at[0], y - at[1]) <= 4) near++;
    }
    // Use the stroke's center, not the first pixel of its equally covered rows/columns.
    const peak = (counts) => {
      const max = Math.max(...counts);
      return (counts.indexOf(max) + counts.lastIndexOf(max)) / 2;
    };
    return { x: peak(columns), y: peak(rows), green: peak(greenRows), red: rows.reduce((a, b) => a + b, 0), near };
  }, { png: (await canvases.nth(index).screenshot({ scale: "css" })).toString("base64"), at });

  // Cartesian, on a datetime axis: a rule through the pointer each way, readouts finer than the ticks.
  const dated = await canvases.nth(0).boundingBox();
  const at = [Math.round(dated.width * 0.6), Math.round(dated.height * 0.3)];
  await page.mouse.move(dated.x + at[0], dated.y + at[1]);
  await settle("datedPlot");
  const lines = await pixels(0);
  expect(Math.abs(lines.x - at[0]), JSON.stringify(lines)).toBeLessThanOrEqual(2);
  expect(Math.abs(lines.y - at[1]), JSON.stringify(lines)).toBeLessThanOrEqual(2);
  const text = await readout("datedCrosshair");
  expect(text.x).toMatch(/^Jan 0[1-5] \d\d:\d\d$/);
  expect(text.y).toMatch(/^\d\.\d{3}$/);
  // The pointer on the rule at 2.5 reads 2.5.
  await page.mouse.move(dated.x + at[0], dated.y + lines.green);
  await settle("datedPlot");
  expect(Math.abs(Number((await readout("datedCrosshair")).y) - 2.5), JSON.stringify(lines)).toBeLessThan(0.05);
  // At rest nothing is drawn (T5).
  const still = await page.evaluate(async () => {
    const plot = window.pointerFixture.datedPlot, before = plot.getDiagnostics().completedFrame;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return plot.getDiagnostics().completedFrame - before;
  });
  expect(still).toBe(0);
  // Off the frame (the axis margin) the pointer is missing: no rules, no readouts.
  await page.mouse.move(dated.x + 3, dated.y + dated.height / 2);
  await settle("datedPlot");
  expect((await pixels(0)).red).toBe(0);
  expect(await readout("datedCrosshair")).toEqual({ x: "", y: "" });

  // A polar frame (a circle and a spoke) and a map (a parallel and a meridian): one readout in degrees.
  for (const [index, plot, crosshair] of [[1, "polarPlot", "polarCrosshair"], [2, "mapPlot", "mapCrosshair"]]) {
    const box = await canvases.nth(index).boundingBox();
    const point = [Math.round(box.width * 0.62), Math.round(box.height * 0.38)];
    await page.mouse.move(box.x + point[0], box.y + point[1]);
    await settle(plot);
    const drawn = await pixels(index, point);
    expect(drawn.near, `${plot}: ${JSON.stringify(drawn)}`).toBeGreaterThan(0);
    expect((await readout(crosshair)).x, plot).toMatch(/°$/);
  }
});
