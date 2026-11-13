import { test, expect } from "./fixtures.js";
import { installGpuCounters, installGpuErrors } from "./gpu-counters.js";
import { installDragRecorder, measureForceDrag, nodeOnScreen } from "./force-drag.js";
import { pixelReader } from "./png.js";
import { subdivisionProgress } from "./subdivision-progress.js";
function errors(page) {
  const list = [];
  page.on("pageerror", (e) => list.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") list.push(m.text());
  });
  return list;
}
test("force nodes stay behind atomic loading until their configured size is ready", async ({ page }) => {
  await page.goto("/test/gallery-example?id=transform-force");
  await page.waitForFunction(() => window.__transformExample?.graphPoints?.getMark?.());
  // Frame by frame until the configured size is ready: once atomic loading starts it does not
  // end early, and no drawn frame shows nodes at another size. (Before the data arrives the
  // mark holds a placeholder row with no size.) Read in the same frame: read apart, loading
  // can finish between.
  const shownEarly = await page.evaluate(async () => {
    const mark = window.__transformExample.graphPoints.getMark();
    const canvas = document.querySelector('[aria-label="Live example"] .canvas');
    const early = [];
    let pendingSeen = false;
    for (let frame = 0; frame < 600; frame++) {
      const size = mark.fields.get("size")?.data, pending = canvas.classList.contains("atomic-pending");
      if (size === 14) break;
      if (pending) pendingSeen = true;
      else if (pendingSeen) early.push({ frame, size, reason: "loading ended before the size" });
      else if (size != null && mark.view.lifecycle.completedFrame) early.push({ frame, size, reason: "drawn at another size" });
      await new Promise(requestAnimationFrame);
    }
    return early;
  });
  expect(shownEarly).toEqual([]);
  await page.evaluate(() => window.__transformExample.force.whenSettled());
  await page.evaluate(() => window.__transformExample.plot.whenSettled());
  await expect(page.getByLabel("Live example").locator(".canvas")).not.toHaveClass(/atomic-pending/);
  expect(await page.evaluate(() => window.__transformExample.graphPoints.getMark().fields.get("size")?.data)).toBe(14);
});
test("repeated paused node edits remain bounded and simulation still runs", async ({
  page,
}) => {
  test.setTimeout(90000);
  const issues = errors(page);
  await page.goto("/test/gallery-example?id=transform-force");
  await page.waitForFunction(() => window.__transformExample?.force);
  const result = await page.evaluate(async () => {
    const f = window.__transformExample.force;
    await f.whenSettled();
    await f.update({ selected: 1 });
    let status;
    const stop = f.subscribe((s) => (status = s));
    const times = [];
    for (let i = 0; i < 140; i++) {
      let t = performance.now();
      await f.update({
        selectedPosition: [10 + i * 0.1, Math.sin(i * 0.1) * 8],
      });
      times.push(performance.now() - t);
    }
    const before = status.iteration;
    for (let i = 0; i < 4; i++) await f.action("step");
    const after = status.iteration;
    stop();
    return {
      before,
      after,
      error: status.error,
      first: times.slice(10, 30).reduce((a, b) => a + b) / 20,
      last: times.slice(-20).reduce((a, b) => a + b) / 20,
    };
  });
  console.log("constraint timing ms", result);
  expect(result.before).toBe(0);
  expect(result.after).toBe(4);
  expect(result.error).toBe("");
  expect(result.last).toBeLessThan(Math.max(100, result.first * 3));
  expect(issues).toEqual([]);
});
test.describe("dragging a node with native moves at 120 per second", () => {
  test.use({ deviceScaleFactor: 2 });
  test("curved edges keep drawing while force positions change @gpu @timing", async ({ page }, testInfo) => {
    const issues = errors(page);
    await page.addInitScript(installGpuCounters);
    await page.addInitScript(installGpuErrors);
    await page.goto("/test/gallery-example?id=transform-force");
    await page.waitForFunction(() => window.__transformExample?.graphPoints && window.__transformExample?.plot);
    await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every(c => c.getAttribute("aria-busy") === "false"));
    await page.getByRole("checkbox", { name: "Run", exact: true }).check();
    await page.evaluate(async () => {
      const h = window.__transformExample;
      await h.plot.whenSettled();
      let root = h.graphPoints.getMark();
      while (root.parent) root = root.parent;
      root.traverse(o => { if (o.curvedPaths && o.fields?.has("start")) window.__curveEdges ??= o; });
      window.__curveEdges.options.set("curve", "link-horizontal");
      await h.plot.whenSettled();
    });
    // Warm the simulation kernels and curve allocation, rather than counting the first
    // Force tick's compute shaders as an interaction-time render rebuild.
    await page.waitForTimeout(500);
    await page.getByRole("checkbox", { name: "Run", exact: true }).uncheck();
    await page.evaluate(() => window.__transformExample.plot.whenSettled());
    const before = await page.evaluate(() => window.__gpuCounters.snapshot());
    await page.getByRole("checkbox", { name: "Run", exact: true }).check();
    const recording = page.evaluate(async (measure) => {
      const h = window.__transformExample;
      let state;
      const stop = h.force.subscribe(s => state = s);
      const start = state.iteration;
      try { return { ...await (0, eval)(`(${measure})`)(h.plot), iterations: state.iteration - start,
        pieces: window.__curveEdges.curvedPaths.drawCount, rows: window.__curveEdges.count }; }
      finally { stop(); }
    }, subdivisionProgress.toString());
    await page.waitForTimeout(750);
    const png = await page.locator('[aria-label="Live example"] canvas').screenshot({ path: testInfo.outputPath("curved-force-live.png") });
    const progress = await recording;
    console.log("force subdivision progress", progress);
    await page.getByRole("checkbox", { name: "Run", exact: true }).uncheck();
    await page.evaluate(() => window.__transformExample.plot.whenSettled());
    expect(progress.iterations).toBeGreaterThan(progress.animationFrames * 0.5);
    expect(progress.completedFrames).toBeGreaterThan(progress.animationFrames * 0.5);
    expect(progress.maxGap).toBeLessThan(250);
    expect(progress.pieces).toBeGreaterThan(progress.rows);
    const after = await page.evaluate(() => window.__gpuCounters.snapshot());
    expect(after.shaders - before.shaders).toBe(0);
    const pixel = pixelReader(png);
    let ink = 0;
    for (let y = 0; y < png.readUInt32BE(20); y++) for (let x = 0; x < png.readUInt32BE(16); x++) {
      const [r, g, b] = pixel(x, y);
      if (r > 95 && r < 180 && g > r && b > g) ink++;
    }
    expect(ink).toBeGreaterThan(200);
    expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);
    expect(issues).toEqual([]);
  });
  // TODO 65: the drag applies its latest move once per display frame, and a running layout's
  // ticks go in the same batch, so the plot draws every frame while the layout keeps moving. It
  // drew 3-147 of 150 frames (gaps up to 1.6 s) and ticked about 20 times in 2.5 s before.
  for (const running of [false, true])
    test(`${running ? "running" : "paused"}: the plot draws every frame and the node follows the pointer @gpu @timing`, async ({ page }) => {
      test.setTimeout(90000);
      const issues = errors(page);
      await page.addInitScript(installGpuCounters);
      await page.addInitScript(installDragRecorder);
      await page.goto("/test/gallery-example?id=transform-force");
      await page.waitForFunction(() => window.__transformExample?.graphPoints && window.__transformExample?.plot);
      await page.evaluate(() => window.__transformExample.plot.whenSettled());
      // The endpoints of node 3's edges: as many before the drag as after it, at its new position.
      const endpointsAt = (position) => page.evaluate(async (p) => {
        const mark = window.__transformExample.graphPoints.getLegendSource().guideMark();
        let root = mark, segments = null;
        while (root.parent) root = root.parent;
        root.traverse((o) => { if (o !== mark && o.fields?.get?.("start")?.data?.ref) segments ??= o; });
        await segments.manager.chain;
        let n = 0;
        for (const key of ["start", "end"]) {
          const data = segments.fields.get(key).data, width = data.shape[1], values = await data.ref.data();
          for (let i = 0; i < values.length; i += width) if (Math.hypot(values[i] - p[0], values[i + 1] - p[1]) < 1e-3) n++;
        }
        return n;
      }, position);
      const before = await nodeOnScreen(page, 3), edges = await endpointsAt(before.data);
      expect(edges).toBeGreaterThan(0);
      const r = await measureForceDrag(page, { running, rate: 120 });
      console.log("drag", JSON.stringify(r));
      expect(r.selected).toBe(3);
      // The page received the moves; the plot drew about every frame, without a long gap, and
      // published at most once a frame.
      expect(r.moves).toBeGreaterThan(200);
      expect(r.completedFrames).toBeGreaterThan(r.animationFrames * 0.8);
      expect(r.completedGap.max).toBeLessThan(100);
      expect(r.perFrame).toBeLessThanOrEqual(1.1);
      // A paused layout does not tick; a running one ticks about once a frame during the drag.
      if (running) expect(r.iterations).toBeGreaterThan(r.animationFrames * 0.5);
      else expect(r.iterations).toBe(0);
      // No wait for the GPU per move (a zero-byte readback each, three a move before): a running
      // layout's tick waits once.
      expect(r.gpu.jaxMaps).toBeLessThanOrEqual(running ? r.iterationsAfter + 2 : 2);
      // The last move's position was published while the button was down.
      expect(Math.abs(r.lastPublished[0] - r.lastTarget[0])).toBeLessThan(0.05);
      await page.evaluate(() => window.__transformExample.plot.whenSettled());
      const after = await nodeOnScreen(page, 3);
      if (!running) {
        // Paused, the release leaves the node at the pointer, drawn there, with its edges.
        expect(Math.abs(after.data[0] - r.lastTarget[0])).toBeLessThan(0.05);
        expect(after.data[1]).toBeCloseTo(r.origin[1], 4);
        const png = await page.screenshot({ clip: { x: r.end.x - 1, y: r.end.y - 1, width: 3, height: 3 } });
        const [red, green, blue] = pixelReader(png)(3, 3);
        expect(Math.max(red, green, blue) - Math.min(red, green, blue), "the node's fill under the pointer").toBeGreaterThan(45);
      }
      expect(await endpointsAt(after.data)).toBe(edges);
      // The controls are back, and the node is not pinned (a Step moves it).
      expect(await page.evaluate(() => window.__transformExample.graphPoints.getLegendSource().guideMark().view.navigation.controls.current.enabled)).toBe(true);
      await page.getByRole("button", { name: "Step", exact: true }).click();
      await expect.poll(async () => Math.hypot(...(await nodeOnScreen(page, 3)).data.map((v, i) => v - after.data[i]))).toBeGreaterThan(1e-3);
      expect(issues).toEqual([]);
    });
});
test("combined demos render, large graph steps, and sidebar scrolls", async ({
  page,
}) => {
  test.setTimeout(90000);
  const issues = errors(page);
  for (const id of ["large-graph", "layered-signal", "globe-routes"]) {
    // The large graph's gallery component, with its dev hooks (TODO 69.10).
    await page.goto(id === "large-graph" ? "/test/gallery-example?id=large-graph" : "/examples/" + id);
    await page.locator("canvas").first().waitFor();
    if (id === "large-graph") {
      await page.waitForFunction(() => window.__largeGraph?.force);
      await page.evaluate(() => window.__largeGraph.force.whenSettled());
      const result = await page.evaluate(async () => {
        let s;
        const f = window.__largeGraph.force,
          u = f.subscribe((v) => (s = v));
        const start = performance.now();
        await f.action("step");
        await f.action("step");
        u();
        return {
          ms: performance.now() - start,
          n: s.selection.count,
          step: s.iteration,
          error: s.error,
        };
      });
      console.log("512 node two steps", result);
      expect(result.n).toBe(512);
      expect(result.step).toBe(2);
      expect(result.error).toBe("");
      await page.getByLabel("Nodes", { exact: true }).selectOption("2048");
      await page.waitForTimeout(100);
      await page.evaluate(() => window.__largeGraph.force.whenSettled());
      const largest = await page.evaluate(async () => {
        let s;
        const f = window.__largeGraph.force,
          u = f.subscribe((v) => (s = v));
        await f.action("step");
        u();
        return { count: s.selection.count, step: s.iteration, error: s.error };
      });
      expect(largest).toEqual({ count: 2048, step: 1, error: "" });
    } else {
      await page.waitForTimeout(1500);
      if (id === "layered-signal") {
        await page.getByRole("button", { name: "New target" }).click();
        await page.waitForTimeout(150);
        await page.getByRole("button", { name: "New target" }).click();
      }
      if (id === "globe-routes") {
        await page.getByLabel("View", { exact: true }).selectOption("2d");
        await page
          .locator(".toolbar")
          .getByLabel("Projection", { exact: true })
          .selectOption("mercator");
      }
      await page.waitForTimeout(900);
    }
    expect(await page.locator('[role="alert"]').allTextContents()).toEqual([]);
    await page.screenshot({ path: "/tmp/" + id + "-performance.png" });
    // In a window too short for it, the section navigation scrolls on its own.
    await page.setViewportSize({ width: 1500, height: 420 });
    expect(
      await page
        .getByRole("complementary", { name: "Section navigation" })
        .evaluate(
          (e) =>
            e.scrollHeight > e.clientHeight &&
            getComputedStyle(e).overflowY === "auto",
        ),
    ).toBe(true);
    await page.setViewportSize({ width: 1500, height: 1100 });
  }
  expect(issues).toEqual([]);
});
test("globe zoom out reuses refined topology", async ({ page }) => {
  const issues = errors(page);
  await page.goto("/examples/geojson-globe");
  await page.waitForFunction(() => window.__geoExample?.mark);
  await page.evaluate(() => window.__geoExample.mark.whenSettled());
  await page.waitForTimeout(800);
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -350);
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__geoExample.mark.whenSettled());
  const before = await page.evaluate(
    () => window.__geoExample.mark.getDiagnostics().geometryPreparations,
  );
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__geoExample.mark.whenSettled());
  expect(
    await page.evaluate(
      () => window.__geoExample.mark.getDiagnostics().geometryPreparations,
    ),
  ).toBe(before);
  expect(issues).toEqual([]);
});
