// TODO 28 Part B: tween() as a stateful column (src/routes/test/tween-pipeline).
import { test, expect } from "./fixtures.js";
import { installGpuCounters, installGpuErrors } from "./gpu-counters.js";

async function open(page) {
  await page.goto("/test/tween-pipeline");
  await page.waitForFunction(() => window.tweenPipeline?.plot);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => window.tweenPipeline.plot.whenSettled());
}

test.describe("interval tween columns", () => {
  test.use({ deviceScaleFactor: 2 });
  test("polar Rect interpolates rendered bounds from Calculate after a discrete Tree layout", async ({ page }, testInfo) => {
    await open(page);
    const canvas = page.locator('canvas').nth(1);
    await canvas.scrollIntoViewIfNeeded();
    const result = await page.evaluate(async () => {
      const f = window.tweenPipeline, plot = f.treePlot;
      const read = async () => {
        const mark = f.treeRect.getMark(), field = mark.fields.get("extent");
        const device = mark.renderer.backend.device, gpu = mark.renderer.backend.get(field.bufferNodeSource).buffer;
        const staging = device.createBuffer({ size: field.count * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(gpu, 0, staging, 0, field.count * 16);
        device.queue.submit([encoder.finish()]); await staging.mapAsync(GPUMapMode.READ);
        const values = new Float32Array(staging.getMappedRange()), x1 = values[(field.count - 1) * 4];
        staging.destroy(); return x1;
      };
      const paths = async () => {
        const { blob } = await plot.exportSVG({ mode: "vector" });
        const doc = new DOMParser().parseFromString(await blob.text(), "image/svg+xml");
        return [...doc.querySelectorAll("path")].map((path) => path.getAttribute("d"));
      };
      await plot.setAnimationTime(1000); await plot.whenSettled();
      const before = await read(); f.raiseTree(); await plot.whenSettled();
      const start = await read(), startSVG = await paths();
      await plot.setAnimationTime(1500); const middle = await read(), middleSVG = await paths();
      await plot.setAnimationTime(2000); const end = await read(), endSVG = await paths();
      return { before, start, middle, end, startSVG, middleSVG, endSVG, error: plot.getRenderError() };
    });
    expect(result.error).toBeFalsy();
    expect(result.before).toBeCloseTo(2); expect(result.start).toBeCloseTo(2);
    expect(result.middle).toBeCloseTo(3); expect(result.end).toBeCloseTo(4);
    expect(result.startSVG).not.toEqual(result.middleSVG);
    expect(result.middleSVG).not.toEqual(result.endSVG);
    await canvas.screenshot({ path: testInfo.outputPath("tree-rect-tween.png") });
  });

  test("an atomic preparation wait delays drawing without extending Rect's duration", async ({ page }) => {
    await open(page);
    await page.locator('canvas').nth(1).scrollIntoViewIfNeeded();
    const result = await page.evaluate(async () => {
      const f = window.tweenPipeline, plot = f.treePlot;
      await plot.setAnimationTime(1000);
      f.raiseTree(); await plot.whenSettled();
      const started = performance.now();
      await plot.setAnimationTime(null);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const release = plot.beginUpdate();
      await new Promise((resolve) => setTimeout(resolve, 650));
      await release(); await plot.whenAnimationsFinished(); await plot.whenSettled();
      const elapsed = performance.now() - started;
      const mark = f.treeRect.getMark(), field = mark.fields.get("extent");
      const device = mark.renderer.backend.device, gpu = mark.renderer.backend.get(field.bufferNodeSource).buffer;
      const staging = device.createBuffer({ size: field.count * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(gpu, 0, staging, 0, field.count * 16);
      device.queue.submit([encoder.finish()]); await staging.mapAsync(GPUMapMode.READ);
      const end = new Float32Array(staging.getMappedRange())[(field.count - 1) * 4];
      staging.destroy();
      return { elapsed, end, error: plot.getRenderError() };
    });
    expect(result.error).toBeFalsy(); expect(result.end).toBeCloseTo(4);
    expect(result.elapsed).toBeGreaterThan(900);
    expect(result.elapsed, "one-second motion includes the 650 ms preparation wait").toBeLessThan(1450);
  });
});

test("a Filter, a Bin and a nested tween see a tweened column move", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.tweenPipeline, p = f.probes, out = {};
    const snap = (label) => { out[label] = { g: p.calc.values, kept: p.filter.length, bins: p.bins.values }; };
    await f.plot.setAnimationTime(1000);
    f.raise();
    await f.plot.whenSettled();
    snap("start");
    await f.plot.setAnimationTime(1500);
    snap("half");
    await f.plot.setAnimationTime(2000);
    snap("end");
    return out;
  });
  // x goes 0,10,20,30 -> 100,110,120,130 over 1 s, linearly, from t = 1000.
  expect(result.start).toEqual({ g: [0, 20, 40, 60], kept: 0, bins: [4, 0, 0] });
  expect(result.half).toEqual({ g: [100, 120, 140, 160], kept: 2, bins: [0, 4, 0] });
  expect(result.end).toEqual({ g: [200, 220, 240, 260], kept: 4, bins: [0, 0, 4] });
});

test("in real time, consumers re-run while the tween moves, whenAnimationsFinished waits, and re-runs stop when it lands", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.tweenPipeline, p = f.probes;
    const runs = p.filter.runs, started = performance.now(), drawn = f.plot.getDiagnostics().completedFrame;
    f.raise();
    await f.plot.whenSettled();
    await f.plot.whenAnimationsFinished();
    const waited = performance.now() - started, during = p.filter.runs - runs, drew = f.plot.getDiagnostics().completedFrame - drawn;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { waited, during, drew, after: p.filter.runs - runs - during, kept: p.filter.length, g: p.calc.values, bins: p.bins.values };
  });
  expect(result.waited).toBeGreaterThan(900);
  expect(result.during).toBeGreaterThan(10);
  expect(result.drew, "frames drawn during the one-second flight").toBeGreaterThan(15);
  expect(result.after).toBe(0);
  expect(result).toMatchObject({ kept: 4, g: [200, 220, 240, 260], bins: [0, 0, 4] });
});

test("marks: a nested tween and a tween column inside an operator move exactly; a tween of @time trails it", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.tweenPipeline;
    const position = async (handle, component) => {
      const mark = handle.getMark(), field = mark.fields.get("position"), attribute = field.bufferNodeSource;
      const device = mark.renderer.backend.device, gpu = mark.renderer.backend.get(attribute).buffer, bytes = field.count * 16;
      const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(gpu, 0, staging, 0, bytes);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(staging.getMappedRange());
      const out = Array.from({ length: field.count }, (_, i) => Math.round(values[i * 4 + component] * 1000) / 1000);
      staging.destroy();
      return out;
    };
    const snap = async () => ({ nested: await position(f.nestedPoints, 1), operator: await position(f.operatorPoints, 1),
      follow: (await position(f.followPoints, 0))[0] });
    const out = {};
    await f.markPlot.setAnimationTime(1000);
    await f.markPlot.whenAnimationsFinished();
    f.raiseMarks();
    await f.markPlot.whenSettled();
    out.start = await snap();
    await f.markPlot.setAnimationTime(1750);
    out.later = await snap();
    await f.markPlot.setAnimationTime(2000);
    out.end = await snap();
    await f.markPlot.setAnimationTime(4000);
    out.far = await snap();
    return out;
  });
  // v goes 0 -> 10 over 1 s from t = 1000: 2v is 15 at 1750 and 20 at 2000.
  expect(result.start.nested).toEqual([0, 0, 0]);
  expect(result.start.operator).toEqual([0, 0, 0]);
  expect(result.later.nested).toEqual([15, 15, 15]);
  expect(result.later.operator).toEqual([15, 15, 15]);
  expect(result.end.nested).toEqual([20, 20, 20]);
  expect(result.end.operator).toEqual([20, 20, 20]);
  // tween(@time) retargets at every step from where it is, so it trails the clock. At t = 1000 it
  // was somewhere behind (it has trailed since the view mounted); set_time(1750) moves it 3/4 of
  // the way to 1000 (1 s, linear), then retargets to 1750; then it keeps catching up.
  const s = result.start.follow;
  expect(s).toBeLessThanOrEqual(1000);
  expect(Math.abs(result.later.follow - (s + 0.75 * (1000 - s)))).toBeLessThan(0.5);
  expect(result.end.follow).toBeGreaterThan(result.later.follow);
  expect(result.far.follow).toBeGreaterThan(result.end.follow);
  expect(result.far.follow).toBeLessThanOrEqual(4000);
});

test("under reduced motion, tweens in the pipeline land at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.tweenPipeline, p = f.probes, started = performance.now();
    f.raise();
    await f.plot.whenSettled();
    const settled = { g: p.calc.values, kept: p.filter.length, bins: p.bins.values };
    await f.plot.whenAnimationsFinished();
    return { settled, waited: performance.now() - started };
  });
  expect(result.settled).toEqual({ g: [200, 220, 240, 260], kept: 4, bins: [0, 0, 4] });
  expect(result.waited).toBeLessThan(900);
});

test("current tween publications update two retained mark buffers and keep drawing without shader or readback churn", async ({ page }, testInfo) => {
  await page.addInitScript(installGpuCounters);
  await page.addInitScript(installGpuErrors);
  await open(page);
  await page.locator('canvas').last().scrollIntoViewIfNeeded();
  const result = await page.evaluate(async () => {
    const f = window.tweenPipeline, p = f.probes;
    const plot = f.fastPlot, marks = [f.fastPoints, f.fastOtherPoints].map(h => h.getMark());
    await plot.whenSettled();
    await plot.setAnimationTime(1000);
    f.raiseFast(); await plot.whenSettled();
    await plot.setAnimationTime(1500); // Warm interpolation and both field-write paths.
    const read = async mark => {
      const field = mark.fields.get("position"), device = mark.renderer.backend.device;
      const buffer = mark.renderer.backend.get(field.bufferNodeSource).buffer, bytes = field.count * 16;
      const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(buffer, 0, staging, 0, bytes);
      device.queue.submit([encoder.finish()]); await staging.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(staging.getMappedRange());
      const rows = Array.from({ length: field.count }, (_, row) => values[row * 4 + 1]);
      staging.destroy(); return rows;
    };
    const half = await Promise.all(marks.map(read));
    await plot.setAnimationTime(2000);
    f.lowerFast(); await plot.whenSettled();
    await plot.setAnimationTime(3000);
    const fields = marks.map(mark => mark.fields.get("position").bufferNodeSource);
    const counters = marks[0].view.diagnostics.counters, before = window.__gpuCounters.snapshot();
    const runs = p.fast.runs, writes = counters.liveFieldUpdates;
    const frame = plot.getDiagnostics().completedFrame, started = performance.now();
    f.raiseFast(); await plot.whenSettled();
    await plot.setAnimationTime(null);
    await f.fastPlot.whenAnimationsFinished();
    await plot.whenSettled();
    const after = window.__gpuCounters.snapshot();
    const completedFrames = plot.getDiagnostics().completedFrame - frame;
    const activeTransition = marks.some(mark => {
      const transition = mark.fields.get("position").bufferNodeSource.transition;
      return !!transition && transition.clock.tracks.has(transition);
    });
    const endedRuns = p.fast.runs;
    await new Promise(resolve => setTimeout(resolve, 120));
    return { half, end: await Promise.all(marks.map(read)),
      runs: endedRuns - runs, landedRuns: p.fast.runs - endedRuns,
      stableBuffers: marks.every((mark, i) => mark.fields.get("position").bufferNodeSource === fields[i]),
      writes: counters.liveFieldUpdates - writes, completedFrames,
      shaders: after.shaders - before.shaders, readbacks: after.readbacks - before.readbacks,
      wallMs: performance.now() - started, activeTransition,
      errors: window.__gpuErrors, error: plot.getRenderError() };
  });
  expect(result.half).toEqual([[5, 5, 5], [10, 10, 10]]);
  expect(result.end).toEqual([[10, 10, 10], [20, 20, 20]]);
  expect(result.stableBuffers).toBe(true);
  expect(result.runs).toBeGreaterThan(10);
  expect(result.writes).toBeGreaterThan(result.runs);
  expect(result.completedFrames).toBeGreaterThan(15);
  expect(result.landedRuns).toBe(0);
  expect(result.activeTransition).toBe(false);
  expect(result.shaders).toBe(0);
  expect(result.readbacks).toBe(0);
  expect(result.errors).toEqual([]); expect(result.error).toBeFalsy();
  console.log("current tween two-consumer progress", result);
  await page.locator('canvas').last().screenshot({ path: testInfo.outputPath("current-tween-two-consumers.png") });
});

test("current geometry updates automatic bounds while static paint and title fades keep their schedule", async ({ page }, testInfo) => {
  await page.goto("/test/live-geometry");
  await page.waitForFunction(() => window.liveGeometry?.rectangle?.getMark?.() && window.liveGeometry?.caption?.getLegendSource?.()?.guideMark?.() && [...document.querySelectorAll(".canvas")]
    .every(canvas => canvas.getAttribute("aria-busy") === "false"));
  const result = await page.evaluate(async () => {
    const f = window.liveGeometry, plot = f.plot;
    const rectangle = f.rectangle.getMark(), caption = f.caption.getLegendSource().guideMark();
    const { liveRows, element, captureMarkRows } = await import("/src/lib/plot/utils/vectorExport/capture.js");
    const { project } = await import("/src/lib/plot/utils/vectorExport/geometry.js");
    const snapshot = async time => {
      await plot.setAnimationTime(time); await plot.whenSettled();
      const { blob } = await plot.exportSVG({ mode: "vector" });
      const svg = new DOMParser().parseFromString(await blob.text(), "image/svg+xml");
      const rectRows = await captureMarkRows(rectangle), titleRows = await captureMarkRows(caption);
      const path = [...svg.querySelectorAll("path[fill]")].find(node => node.getAttribute("fill") === rectRows.colorAt(0));
      const coordinates = (path?.getAttribute("d")?.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number);
      const xs = coordinates.filter((_, i) => i % 2 === 0), ys = coordinates.filter((_, i) => i % 2 === 1);
      const lower = element(await liveRows(rectangle, "position", 3), 0, 3);
      const upper = element(await liveRows(rectangle, "extent", 3), 0, 3);
      const [, , width, height] = svg.documentElement.getAttribute('viewBox').split(/\s+/).map(Number);
      const projected = [project(lower, rectangle.options, rectangle.view.picking.camera.current(), width, height),
        project(upper, rectangle.options, rectangle.view.picking.camera.current(), width, height)];
      return {
        lower, upper,
        alpha: rectRows.opacityAt(0), titleAlpha: titleRows.opacityAt(0), color: rectRows.colorAt(0),
        domain: [...rectangle.view.marks.of(rectangle).extents.x],
        svgBounds: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)],
        projectedBounds: [Math.min(...projected.map(point => point[0])), Math.max(...projected.map(point => point[0])),
          Math.min(...projected.map(point => point[1])), Math.max(...projected.map(point => point[1]))],
        titles: [...svg.querySelectorAll("text")].map(node => node.textContent),
      };
    };
    await plot.whenAnimationsFinished(); await plot.whenSettled();
    await plot.setAnimationTime(1000); f.move(); await plot.whenSettled();
    await plot.setAnimationTime(1200);
    const fields = [rectangle.fields.get("position"), rectangle.fields.get("extent")];
    const buffers = fields.map(field => field.bufferNodeSource), counters = rectangle.view.diagnostics.counters;
    const before = [counters.liveFieldUpdates, counters.staticMarkReuses];
    const halfway = await snapshot(1500), late = await snapshot(1800), end = await snapshot(2000);
    const stable = fields.every((field, i) => field.bufferNodeSource === buffers[i]);
    const writes = counters.liveFieldUpdates - before[0];
    const reuses = counters.staticMarkReuses - before[1];
    return { halfway, late, end, stable, writes, reuses, error: plot.getRenderError() };
  });
  expect(result.error).toBeFalsy();
  expect(result.halfway.lower[0]).toBeCloseTo(4); expect(result.halfway.upper[0]).toBeCloseTo(8);
  expect(result.halfway.domain).toEqual([4, 8]); expect(result.end.domain).toEqual([6, 12]);
  for (const state of [result.halfway, result.end])
    state.svgBounds.forEach((bound, i) => expect(bound).toBeCloseTo(state.projectedBounds[i], 3));
  expect(result.halfway.alpha).toBeCloseTo(0.6); expect(result.halfway.titleAlpha).toBeCloseTo(0.6);
  expect(result.end.alpha).toBeCloseTo(0.2); expect(result.end.titleAlpha).toBeCloseTo(0.2);
  expect(result.halfway.color).not.toBe("#d63c32"); expect(result.halfway.color).not.toBe(result.end.color);
  expect(result.end.color).toBe("#315dd8");
  expect(result.stable).toBe(true); expect(result.writes).toBeGreaterThan(0); expect(result.reuses).toBeGreaterThan(0);
  // The latest live publication owns tooltip values too; this re-entry happens before any
  // ordinary re-preparation could refresh the callback's original scope.
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + (result.end.svgBounds[0] + result.end.svgBounds[1]) / 2,
    box.y + (result.end.svgBounds[2] + result.end.svgBounds[3]) / 2);
  await expect(page.locator('.plot-tooltip tr').filter({ has: page.locator('th', { hasText: /^moving$/ }) }).locator('td')).toHaveText('6');
  await page.mouse.move(box.x - 5, box.y - 5);
  const renamed = await page.evaluate(async () => {
    const f = window.liveGeometry; f.rename(); await f.plot.whenSettled(); await f.plot.setAnimationTime(2300);
    const { blob } = await f.plot.exportSVG({ mode: "vector" });
    return [...new DOMParser().parseFromString(await blob.text(), "image/svg+xml").querySelectorAll('text')]
      .map(node => node.textContent);
  });
  expect(renamed).toContain("Changed"); expect(renamed).not.toContain("Original");
  await page.locator("canvas").screenshot({ path: testInfo.outputPath("live-geometry-automatic-bounds.png") });
});

test("moving filtered Text retains payload and exports current geometry, then invalidates content and footprints", async ({ page }, testInfo) => {
  await page.goto("/test/text-dependencies");
  await page.waitForFunction(()=>window.textDependencies?.labels?.getLegendSource?.()?.guideMark?.() &&
    [...document.querySelectorAll('.canvas')].every(canvas=>canvas.getAttribute('aria-busy')==='false'));
  const result=await page.evaluate(async()=>{
    const f=window.textDependencies, plot=f.plot, mark=f.labels.getLegendSource().guideMark();
    await plot.whenAnimationsFinished(); await plot.setAnimationTime(1000); await plot.whenSettled();
    const payload=mark.fields.get('textCode').bufferNodeSource, widths=mark.fields.get('textWidth').bufferNodeSource;
    const exports=mark.exportLabels, counters=mark.view.diagnostics.counters, before=counters.liveFieldUpdates;
    const snap=async time=>{
      await plot.setAnimationTime(time); await plot.whenSettled();
      const {liveRows,element}=await import('/src/lib/plot/utils/vectorExport/capture.js');
      const position=await liveRows(mark,'position',3), {blob}=await plot.exportSVG({mode:'vector'});
      const svg=new DOMParser().parseFromString(await blob.text(),'image/svg+xml');
      return {position:element(position,0,3),domain:[...mark.view.marks.of(mark).extents.x],labels:[...svg.querySelectorAll('text')].map(n=>n.textContent)};
    };
    f.move(); await plot.whenSettled(); const middle=await snap(1500), end=await snap(2000);
    const retained=payload===mark.fields.get('textCode').bufferNodeSource && widths===mark.fields.get('textWidth').bufferNodeSource && exports===mark.exportLabels;
    const writes=counters.liveFieldUpdates-before;
    // Alignment refits the label insets around the moved positions, not the preparation's.
    mark.options.set('align','right'); await plot.setAnimationTime(5000); await plot.whenSettled();
    const {project}=await import('/src/lib/plot/utils/vectorExport/geometry.js'), {liveRows,element}=await import('/src/lib/plot/utils/vectorExport/capture.js');
    const {blob}=await plot.exportSVG({mode:'vector'}), rows=await liveRows(mark,'position',3);
    const [, , width, height]=new DOMParser().parseFromString(await blob.text(),'image/svg+xml').documentElement.getAttribute('viewBox').split(/\s+/).map(Number);
    const aligned={width,xs:[0,1].map(i=>project(element(rows,i,3),mark.options,mark.view.picking.camera.current(),width,height)[0])};
    mark.options.set('align','center');
    f.restyle(); await plot.whenSettled(); const changed=await snap(5400);
    return {middle,end,aligned,changed,retained,writes,font:mark.exportFont,size:mark.options.get('size'),error:plot.getRenderError()};
  });
  expect(result.error).toBeFalsy(); expect(result.retained).toBe(true); expect(result.writes).toBeGreaterThan(0);
  expect(result.middle.position[0]).toBeCloseTo(2); expect(result.end.position[0]).toBeCloseTo(3);
  expect(result.middle.domain).toEqual([2,4]); expect(result.end.domain).toEqual([3,6]);
  for (const x of result.aligned.xs) { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(result.aligned.width); }
  expect(result.end.labels).toContain('Original'); expect(result.changed.labels).toContain('Changed label');
  expect(result.changed.labels).not.toContain('Original'); expect(result.font).toContain('serif');
  await page.locator('canvas').screenshot({path:testInfo.outputPath('text-dependencies.png')});
});

test("Text payload validation stays in the plot and recovers with valid content", async ({ page }) => {
  await page.goto('/test/text-dependencies');
  await page.waitForFunction(()=>window.textDependencies?.labels?.getMark?.() &&
    [...document.querySelectorAll('.canvas')].every(canvas=>canvas.getAttribute('aria-busy')==='false'));
  await page.evaluate(()=>window.textDependencies.invalid());
  await page.waitForFunction(()=>window.textDependencies?.plot?.getRenderError()?.includes('Text: its label atlas needs'));
  const labels=await page.evaluate(async()=>{
    const f=window.textDependencies;
    f.restyle(); await f.plot.whenSettled();
    const {blob}=await f.plot.exportSVG({mode:'vector'});
    return {error:f.plot.getRenderError(),labels:[...new DOMParser().parseFromString(await blob.text(),'image/svg+xml').querySelectorAll('text')].map(n=>n.textContent)};
  });
  expect(labels.error).toBeFalsy(); expect(labels.labels).toContain('Changed label');
});
