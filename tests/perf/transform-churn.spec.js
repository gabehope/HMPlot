// Compute pipelines per transform run (TODO Stage 17.0):
//   PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/transform-churn.spec.js
// Phases, each on a fresh data scope, at a length n near 50k that is unique to the case (so no
// case reuses kernels another case compiled for the same length):
//   cold n         first run;
//   warm n         the same table and config again (every cache hits);
//   values n       the SAME length with different parameter values or data values (a new
//                  Filter value, other Bin extents, other expression literals): this is what
//                  brushing and sliders pay, and what "warm" cannot see;
//   n+1, 2n, 2n again   new lengths.
// Every output column is read back before counting compiles, so lazy kernels are dispatched
// (reading only the first key would read an input column of a row-preserving transform).
// Cells read "<compute pipelines>k/<readbacks during the run>r/<ms>"; the readbacks exclude the
// harness's own reads of the outputs.
import { test as base } from "@playwright/test";
import { installGpuCounters } from "../browser/gpu-counters.js";
const test = process.env.PERF ? base : base.skip;

test("transforms", async ({ page }) => {
  test.setTimeout(900000);
  await page.addInitScript(installGpuCounters);
  await page.goto("/examples/categories");
  await page.waitForFunction(() => window.__examples?.plot);
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(async () => {
    const { createDataScope } = await import("/src/lib/plot/utils/categorical.js");
    const { runTransform } = await import("/src/lib/plot/utils/transforms.js");
    const { multiply, add, greater, subtract, mean, clip, quantile } = await import("/src/lib/plot/utils/expressions.js");
    const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    // `shift` changes every value (not the length): other extents, other group sizes.
    const table = (n, shift = 0) => ({
      x: Float32Array.from({ length: n }, (_, i) => noise(i + shift, 1) * (1 + shift / 7)),
      y: Float32Array.from({ length: n }, (_, i) => noise(i + shift, 2)),
      v: Float32Array.from({ length: n }, (_, i) => noise(i + shift, 3) * 100),
      group: Array.from({ length: n }, (_, i) => "g" + ((i + shift) % 8)),
    });
    const edges = (offset) => Array.from({ length: 65 }, (_, i) => offset + i / 64);
    // [config for cold/warm, config for the "values" phase (null = same config, shifted data)]
    const cases = {
      "Filter gt": [{ where: { field: "x", op: "gt", value: 0.5 } }, { where: { field: "x", op: "gt", value: 0.55 } }],
      "Filter eq (category)": [{ where: { field: "group", op: "eq", value: "g1" } }, { where: { field: "group", op: "eq", value: "g2" } }],
      "Filter in (one value)": [{ where: { field: "group", op: "in", value: ["g1"] } }, { where: { field: "group", op: "in", value: ["g3"] } }],
      "Calculate multiply": [{ columns: { z: multiply("x", "y") } }, null],
      "Calculate literal": [{ columns: { z: multiply("x", 2) } }, { columns: { z: multiply("x", 3) } }],
      "Calculate literal left": [{ columns: { z: subtract(1, "x") } }, { columns: { z: subtract(2, "x") } }],
      "Calculate clip": [{ columns: { z: clip("x", 0.2, 0.8) } }, { columns: { z: clip("x", 0.3, 0.7) } }],
      "Calculate reduction": [{ columns: { z: subtract("v", mean("v")) } }, null],
      "Bin 30 auto edges": [{ x: "x", bins: 30 }, null],
      "Bin 64 edges + weight": [{ x: "x", bins: edges(0), weight: "y" }, { x: "x", bins: edges(0.01), weight: "y" }],
      "Bin 2D 30x30": [{ x: "x", y: "y", bins: 30 }, null],
      "Bin assign": [{ x: "x", bins: 30, mode: "assign" }, null],
      "Group mean": [{ by: "group", columns: { m: mean("v") } }, null],
      "Calculate mean by": [{ columns: { m: mean("v", { by: "group" }) } }, null],
      "Sort": [{ by: "x" }, null],
      "Stack": [{ y: "v", series: "group" }, null],
      "Normalize": [{ field: "x", as: "n" }, null],
      "Window 7": [{ field: "x", size: 7, as: "s" }, null],
      "Calculate quantile by": [{ columns: { q: quantile("v", 0.9, { by: "group" }) } }, { columns: { q: quantile("v", 0.5, { by: "group" }) } }],
      "Hexbin 8": [{ x: "x", y: "y", bins: 8 }, null],
      "Density 1D": [{ x: "x", resolution: 256 }, null],
      "Sample": [{ size: 1000 }, { size: 1000, seed: 7 }],
      "Sample shuffle": [{ order: "random" }, { order: "random", seed: 7 }],
    };
    const readAll = async (view) => {
      for (const key of view.keys()) {
        if (key.startsWith("@")) continue;
        const value = view.get(key), array = value?.codes ?? value;
        if (array?.ref?.data) await array.ref.data();
      }
    };
    const out = [];
    for (const [index, [name, [config, values]]] of Object.entries(cases).entries()) {
      const kind = name.split(" ")[0];
      const row = { name }, n = 50000 + 16 * index;
      try {
        const phases = [["cold n", n, config, 0], ["warm n", n, config, 0], ["values n", n, values ?? config, values ? 0 : 3],
          ["n+1", n + 1, config, 0], ["2n", 2 * n, config, 0], ["2n again", 2 * n, config, 0]];
        for (const [label, length, settings, shift] of phases) {
          const scope = createDataScope(); scope.update(table(length, shift));
          const before = window.__gpuCounters.snapshot(), start = performance.now();
          const view = await runTransform(kind, scope, settings);
          const ran = window.__gpuCounters.snapshot();
          await readAll(view);
          const after = window.__gpuCounters.snapshot();
          row[label] = `${after.compute - before.compute}k/${ran.readbacks - before.readbacks}r/${Math.round(performance.now() - start)}ms`;
          view.dispose(); scope.dispose();
        }
      } catch (error) { row.error = error.message.slice(0, 100); }
      out.push(row);
    }
    return out;
  });
  for (const row of rows) console.log("T", JSON.stringify(row));
});
