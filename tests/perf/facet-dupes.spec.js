// Duplicate pipeline compiles at page load, e.g. across facet cells (TODO Stage 17.0, 17.6):
//   PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/facet-dupes.spec.js
// "distinct" compares the FULL pipeline descriptor (both WGSL stages, layouts, vertex buffers,
// primitive, depth/stencil, multisample incl. alphaToCoverage, fragment targets with blend and
// write mask); "byWgsl" compares the shader code only, which merges pipelines that differ in
// blend, depth or sample state and so under-counts what a shared cache could reuse.
import { test as base } from "@playwright/test";
import { installGpuCounters } from "../browser/gpu-counters.js";
const test = process.env.PERF ? base : base.skip;

for (const id of ["interaction-matrix", "facets", "categories", "interaction-dashboard"]) test(id, async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  const start = Date.now();
  // The matrix and the dashboard: the gallery components they had, at their legacy fixture (TODO 69.10).
  await page.goto(id.startsWith("interaction-") ? `/test/gallery-example?id=${id}` : `/examples/${id}`);
  await page.waitForFunction(() => window.__examples?.plot);
  await page.evaluate(() => window.__examples.settle());
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => ({ ...window.__gpuCounters.distinct(), canvases: document.querySelectorAll('[aria-label="Plot canvas"]').length }));
  console.log(`RESULT ${JSON.stringify({ id, ms: Date.now() - start, ...result })}`);
});
