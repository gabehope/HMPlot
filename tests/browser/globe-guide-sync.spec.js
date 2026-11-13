import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

test.use({ deviceScaleFactor: 2 });

// TODO 141: globe guides are GPU lines projected through the live center, as marks are. A rule over
// a Line along the same meridian covers it while the globe turns and zooms (no lag, no shimmer at
// the horizon or a pole), and navigating builds no geometry, buffers or pipelines.
test("a globe's reference rule stays on its meridian's Line through rotation and zoom", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/globe-guide-sync");
  await page.waitForFunction(() => window.globeGuideSync?.plot?.whenSettled);
  await page.locator("canvas").first().waitFor();
  const sample = () => page.evaluate(async () => {
    const plot = window.globeGuideSync.plot;
    await plot.whenSettled();
    const canvas = document.querySelector(".canvas canvas");
    const image = await createImageBitmap(await plot.exportPNG());
    const surface = document.createElement("canvas");
    surface.width = image.width; surface.height = image.height;
    const context = surface.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
    let red = 0, blue = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (r > 150 && r > 2.5 * g && r > 2.5 * b) red++;
      if (b > 150 && b > 2.5 * r && b > 2 * g) blue++;
    }
    return { red, blue, error: plot.getRenderError(), size: [canvas.width, surface.width] };
  });
  const views = [
    { center: [0, 0] }, { center: [45, 0] }, { center: [30, 70] }, { center: [45, 89] },
    { center: [135, 0] }, { center: [40, 10], zoom: 4 }, { center: [80, -30], zoom: 2 }, { center: [0, 0], zoom: 1 },
  ];
  const set = (view) => page.evaluate((v) => window.globeGuideSync.plot.setViewport(v), view);
  const frame = () => page.evaluate(async () => {
    await window.globeGuideSync.plot.whenSettled();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  for (const view of views) {
    await set(view);
    const drawn = await sample();
    expect(drawn.error).toBe("");
    // The line is under the wider rule wherever it shows; a sliver of red at a covered edge is
    // antialiasing, not a line drawn elsewhere.
    expect(drawn.red, JSON.stringify({ view, drawn })).toBeLessThan(12);
    if (!(view.center[0] === 135)) expect(drawn.blue, JSON.stringify(view)).toBeGreaterThan(200);
  }
  // Navigating again (each view drawn once already): the guides' uniforms move, nothing is built.
  const before = await gpuCounters(page);
  for (const view of views) { await set(view); await frame(); }
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.shaders, JSON.stringify(work)).toBe(0);
  // Buffers: only small staging and uniform buffers, no geometry (a guide level is tens of KB).
  expect(work.bufferKB, JSON.stringify(work)).toBeLessThan(8);
  // Idle: nothing draws without a change.
  const idle = await page.evaluate(async () => {
    await window.globeGuideSync.plot.whenSettled();
    const start = window.__gpuCounters.snapshot().submits;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return window.__gpuCounters.snapshot().submits - start;
  });
  expect(idle).toBe(0);
});
