// Force node dragging: frame delivery, latency, simulation progress and GPU waits (TODO 65.0). Not
// part of the regular suite:
//   PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/force-drag.spec.js
// Start a fresh server for each series. On /examples/transform-force (eight nodes, ten edges) at a
// device pixel ratio of 2, node 3 is dragged 65 CSS pixels over 2.5 s with native moves at 60 and
// 120 per second (tests/browser/force-drag.js), with Run paused and on. One JSON line per gesture
// is printed (and appended to OUT=<file>); REPEAT=<n> repeats each gesture on a fresh page;
// MODES=paused-120,running-60,... runs only those; EXAMPLE=large-graph drags a node of the
// large-graph page (512 nodes, 1,536 edges) instead.
import { test as base, expect } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { installGpuCounters } from "../browser/gpu-counters.js";
import { installDragRecorder, measureForceDrag } from "../browser/force-drag.js";
const test = process.env.PERF ? base : base.skip;
test.use({ deviceScaleFactor: 2 });

const MODES = (process.env.MODES ?? "paused-60,paused-120,running-60,running-120").split(",");
const REPEAT = Number(process.env.REPEAT ?? 1);
const EXAMPLE = process.env.EXAMPLE ?? "transform-force";
const NAMES = EXAMPLE === "large-graph" ? { handle: "__largeGraph", points: "points" } : { handle: "__transformExample", points: "graphPoints" };

test("Force node drag: frames, latency, iterations and GPU waits", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.addInitScript(installDragRecorder);
  for (let round = 0; round < REPEAT; round++)
    for (const mode of MODES) {
      const [state, rate] = mode.split("-");
      // The gallery component with its dev hooks: the public page draws the paired program (TODO 69.10).
      await page.goto(`/test/gallery-example?id=${EXAMPLE}`);
      await page.waitForFunction((n) => window[n.handle]?.[n.points] && window[n.handle]?.force && window[n.handle]?.plot, NAMES);
      await expect(page.locator(".canvas[aria-busy='false']").first()).toBeVisible();
      await page.evaluate((n) => window[n.handle].plot.whenSettled(), NAMES);
      await page.waitForTimeout(500);
      const result = await measureForceDrag(page, { running: state === "running", rate: Number(rate), names: NAMES });
      const line = JSON.stringify({ mode, round, label: process.env.LABEL ?? "", example: EXAMPLE, ...result, start: undefined, end: undefined });
      console.log(line);
      if (process.env.OUT) appendFileSync(process.env.OUT, line + "\n");
    }
});
