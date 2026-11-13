import { test, expect } from "@playwright/test";
import { installGpuCounters, gpuCounters, countersDelta } from "../browser/gpu-counters.js";

// TODO 143: a 24-step brush across the sensor wall's overview (36 detail Plots whose x domains
// read the brush bounds). Reports the drag's wall time to settlement and, with PROFILE=1, the
// functions with the most self time (a CPU profile of the drag).
test.use({ deviceScaleFactor: 2, viewport: { width: 1300, height: 1400 } });
test("sensor wall brush drag", async ({ page }) => {
  test.setTimeout(600000);
  await page.addInitScript(installGpuCounters);
  await page.addInitScript(() => { globalThis.__hmplotWork = {}; });
  await page.goto("/test/sensor-wall");
  await page.waitForFunction(() => window.sensorWall?.cells?.length === 36 && window.sensorWall.overview?.whenSettled, null, { timeout: 300000 });
  await page.evaluate(() => Promise.all([window.sensorWall.overview.whenSettled(), ...window.sensorWall.cells.map((c) => c.whenSettled())]));
  const settle = () => page.evaluate(() => Promise.all([window.sensorWall.overview.whenSettled(), ...window.sensorWall.cells.map((c) => c.whenSettled())]));
  const box = await page.locator('[aria-label="Plot canvas"]').nth(36).boundingBox();
  const cdp = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start"); }
  const gpuBefore = await gpuCounters(page);
  const frames = () => page.evaluate(() => [window.sensorWall.overview, ...window.sensorWall.cells].reduce((n, p) => n + (p.getDiagnostics().completedFrame ?? 0), 0));
  const framesBefore = await frames();
  await page.evaluate(() => { for (const key of Object.keys(globalThis.__hmplotWork)) delete globalThis.__hmplotWork[key]; });
  const t0 = Date.now();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(box.x + box.width * (0.2 + 0.4 * i / 24), box.y + box.height * 0.5);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  }
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await settle();
  const elapsed = Date.now() - t0;
  const work = await page.evaluate(() => ({ ...globalThis.__hmplotWork }));
  const gpu = await countersDelta(page, gpuBefore, await gpuCounters(page));
  console.log(`work: ${JSON.stringify(work)}; frames: ${(await frames()) - framesBefore}; readbacks: ${gpu.readbacks} ${JSON.stringify(gpu.readbackKinds)}; submits: ${gpu.submits}; render pipelines: ${gpu.render}`);
  const domain = await page.evaluate(() => window.sensorWall.cells[0].getFrames()[0].getFrameOptions().get("xbounds"));
  console.log(`drag+settle ms: ${elapsed}; first cell x: ${JSON.stringify(domain)}`);
  expect(domain[1] - domain[0]).toBeLessThan(250);
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const counts = new Map();
    for (const id of profile.samples) counts.set(id, (counts.get(id) ?? 0) + 1);
    const total = profile.samples.length;
    for (const [id, n] of counts) {
      const f = byId.get(id).callFrame, key = `${f.functionName || "(anon)"} ${f.url.split("/").slice(-2).join("/")}:${f.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + n);
    }
    const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 40);
    console.log(top.map(([k, n]) => `${(100 * n / total).toFixed(1)}% ${k}`).join("\n"));
  }
});
