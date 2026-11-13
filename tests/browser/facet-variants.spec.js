import { test, expect } from "./fixtures.js";
import { installGpuCounters } from "./gpu-counters.js";

// TODO 17.6: cells of one faceted mark compile one shader, not one each. An unnamed storage
// buffer node is named NodeBuffer_<node id> in WGSL, so every cell used to differ by that name
// (interaction-matrix: 33 distinct render pipelines over 16 cells, now 3). Pipelines are still
// created per canvas; Dawn absorbs those (a device-level cache measured no gain).
// The gallery components these counts were taken on, at their legacy fixture: the public pages
// draw the paired Python programs (TODO 69.16, 69.10), whose other plots (Facets & transforms' 3D
// columns) add pipelines of their own.
for (const [id, most] of [["interaction-matrix", 3], ["facets", 2], ["interaction-dashboard", 4]])
  test(`${id}: distinct render pipelines do not grow with cells`, async ({ page }) => {
    await page.addInitScript(installGpuCounters);
    await page.addInitScript(() => {
      const codes = new WeakMap(), keys = [];
      const device = GPUDevice.prototype, module = device.createShaderModule;
      device.createShaderModule = function(d) { const result = module.call(this,d); codes.set(result,d.code); return result; };
      for (const name of ['createRenderPipeline','createRenderPipelineAsync']) {
        const original = device[name];
        device[name] = function(d) {
          if ((codes.get(d.vertex.module) ?? '').includes('ruleColor'))
            keys.push(JSON.stringify([codes.get(d.vertex.module),codes.get(d.fragment.module),d.primitive]));
          return original.call(this,d);
        };
      }
      window.axisGridPipelines = () => new Set(keys).size;
    });
    await page.goto(`/test/gallery-example?id=${id}`);
    await page.waitForFunction(() => window.__examples?.plot);
    await page.evaluate(() => window.__examples.settle());
    await page.waitForTimeout(1500);
    const counts = await page.evaluate(() => window.__gpuCounters.distinct());
    // The shared major grid adds two face pipelines; it must not grow per cell.
    const grids = await page.evaluate(() => window.axisGridPipelines());
    expect(grids).toBe(2);
    expect(counts.renderDistinct, JSON.stringify(counts)).toBeLessThanOrEqual(most + grids);
  });
