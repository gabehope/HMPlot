import { test, expect } from "./fixtures.js";
import { installGpuCounters } from "./gpu-counters.js";

test.use({ deviceScaleFactor: 2 });
test("generated columns render, survive rapid replacement, and settle without GPU work", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/constant-data");
  await page.waitForFunction(() => window.constantFixture?.simulationPlot &&
    document.querySelectorAll('.canvas').length === 3 &&
    [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
  const result = await page.evaluate(async () => {
    const f = window.constantFixture;
    const settle = async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await Promise.all([f.plot, f.nested, f.simulationPlot].map(p => p.whenSettled()));
    };
    const circles = async (plot) => {
      const svg = await (await plot.exportSVG()).blob.text();
      return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('circle')]
        .map(c => ['cx', 'cy', 'fill'].map(k => c.getAttribute(k)));
    };
    await settle();
    const first = await circles(f.plot), nested = await circles(f.nested);
    const before = await circles(f.simulationPlot);
    await f.simulation.seek(320);
    await settle();
    const after = await circles(f.simulationPlot);
    const fill = f.mark.getMark().fields.get('fill').data;
    await f.plot.setViewport({ zoom: 1.2 }); await settle();
    const stable = fill === f.mark.getMark().fields.get('fill').data;
    const counts = [];
    for (const rows of [0, 1, 32]) { f.setRows(rows); await settle(); counts.push((await circles(f.plot)).length); }
    f.setRows(7); f.setRows(3); f.setRows(12); f.setRandom(false); await settle();
    const latest = await circles(f.plot);
    f.setRows(-1); await settle();
    const invalid = document.querySelector('[role="alert"]')?.textContent;
    const retained = await circles(f.plot);
    f.setRows(12); await settle();
    const start = __gpuCounters.snapshot();
    await new Promise(r => setTimeout(r, 400));
    const end = __gpuCounters.snapshot();
    return { first, nested, nestedLayout: f.nested.getAxes()[0].getAxisLayout(), before, after, stable, counts, latest, invalid, retained,
      idle: { buffers: end.buffers-start.buffers, submits: end.submits-start.submits } };
  });
  expect(result.first).toHaveLength(32);
  expect(new Set(result.first.slice(0, 16).map(c => c[2])).size).toBeGreaterThan(1);
  expect(result.nested).toHaveLength(3);
  const {left, right} = result.nestedLayout;
  result.nested.forEach((c,i) => expect(Number(c[0])).toBeCloseTo(left + [.25,.5,.75][i] * (right-left),4));
  expect(result.before).toHaveLength(4);
  expect(result.after).toHaveLength(4);
  expect(Number(result.after[0][1])).toBeLessThan(Number(result.before[0][1]));
  expect(result.stable).toBe(true);
  expect(result.counts).toEqual([0, 2, 64]);
  expect(result.latest).toHaveLength(24);
  expect(result.invalid).toContain('Data.rows must be an integer');
  expect(result.retained).toEqual(result.latest);
  expect(result.idle).toEqual({ buffers: 0, submits: 0 });
  expect(errors).toEqual([]);
});

test("the generated-data gallery simulation draws moving frames and pauses", async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installGpuCounters);
  await page.goto('/examples/constant-data');
  await page.waitForFunction(() => window.__examples?.plot && document.querySelectorAll('.canvas').length &&
    [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
  const snapshot = () => page.evaluate(async () => {
    const plot = __examples.plot;
    await plot.whenSettled();
    return { svg: await (await plot.exportSVG()).blob.text(), frames: plot.getDiagnostics().completedFrame };
  });
  const before = await snapshot();
  expect((before.svg.match(/<circle /g) ?? []).length).toBe(256);
  await page.getByRole('checkbox', { name: 'Run simulation' }).check();
  await expect.poll(() => page.evaluate(() => __examples.plot.getDiagnostics().completedFrame)).toBeGreaterThan(before.frames + 3);
  await page.getByRole('checkbox', { name: 'Run simulation' }).uncheck();
  const after = await snapshot();
  expect(after.svg).not.toBe(before.svg);
  const idle = await page.evaluate(async () => {
    await __examples.settle(); const before = __gpuCounters.snapshot().submits;
    await new Promise(r => setTimeout(r, 400)); return __gpuCounters.snapshot().submits - before;
  });
  expect(idle).toBe(0);
  expect(errors).toEqual([]);
});
