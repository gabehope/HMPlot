import { test, expect } from "./fixtures.js";

// Stage 13.8: keyed updates in quick succession and after an idle gap, keyed re-orders
// under animate(), per-axis animate(), animate() on a constant, and tween provenance through
// an expression. Every test also fails on any page error or console error.
let problems;
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  await page.goto("/test/keyed-updates");
  await page.waitForFunction(() => window.keyedUpdates?.idlePoints?.getMark?.()?.fields?.get("position")?.count === 3);
  await page.evaluate(async () => {
    const f = window.keyedUpdates;
    await Promise.all([f.keyedPlot, f.reorderPlot, f.axisPlot, f.constantPlot, f.tweenPlot, f.idlePlot, f.sortPlot]
      .map((plot) => plot.whenAnimationsFinished()));
    // Marks animate only after their first drawn frame: wait for it rather than for a time.
    const { markAnimation } = await import("/src/lib/plot/utils/markAnimation.js");
    const marks = [f.keyedPoints, f.reorderPoints, f.axisPoints, f.constantPoints, f.tweenPoints, f.idlePoints, f.sortPoints]
      .map((handle) => handle.getMark());
    for (let frame = 0; frame < 300 && !marks.every((mark) => markAnimation(mark).ready); frame++)
      await new Promise((resolve) => requestAnimationFrame(resolve));
  });
});
test.afterEach(async ({ page }) => {
  const errors = await page.evaluate(() => window.keyedUpdates?.errors ?? []);
  expect([...problems, ...errors]).toEqual([]);
});
// Rows by key: x is the key's letter index (a = 1).
const byKey = (rows) => Object.fromEntries(rows.map(([x, y]) => [String.fromCharCode(96 + Math.round(x)), y]));
const between = (value, low, high) => value > low && value < high;

test("a transition after an idle gap animates instead of jumping to the end", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    f.setIdle([10, 10, 10]);
    await f.idlePlot.whenAnimationsFinished();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return f.sample(f.idlePoints, { until: 900, steps: { 0: () => f.setIdle([0, 0, 0]) } });
  });
  const ys = result.map((s) => s.rows[0][1]);
  expect(ys.some((y) => between(y, 1, 9)), JSON.stringify(ys)).toBe(true);
  expect(ys.at(-1)).toBe(0);
});

test("a keyed update after an idle gap animates retained rows", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    f.setKeyed(["b", "c", "d"], [10, 10, 10]);
    await f.keyedPlot.whenAnimationsFinished();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return f.sample(f.keyedPoints, { until: 1000, steps: { 0: () => f.setKeyed(["c", "d", "e"], [0, 0, 0]) } });
  });
  const c = result.map((s) => byKey(s.rows).c).filter((y) => y !== undefined);
  expect(c.some((y) => between(y, 1, 9)), JSON.stringify(c)).toBe(true);
});

test("a second keyed update mid-flight continues from where rows are, and departing rows stay", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    let second = Infinity;
    const samples = await f.sample(f.keyedPoints, {
      until: 1400, every: 20,
      steps: {
        0: () => f.setKeyed(["b", "c", "d"], [10, 10, 10]),
        150: () => { second = performance.now(); f.setKeyed(["c", "d", "e"], [0, 0, 0]); },
      },
    });
    await f.keyedPlot.whenAnimationsFinished();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { samples, final: (await f.read(f.keyedPoints)).rows };
  });
  const samples = result.samples.map((s) => ({ at: s.at, keys: byKey(s.rows) }));
  const before = samples.filter((s) => s.at < 150), after = samples.filter((s) => s.at >= 150);
  const reached = Math.max(0, ...before.map((s) => s.keys.c ?? 0));
  // c was on its way from 0 to 10 when it was sent back to 0: it must never jump to 10.
  const highest = Math.max(...after.map((s) => s.keys.c ?? 0));
  expect(highest, JSON.stringify(samples.slice(0, 20))).toBeLessThan(reached + 1.5);
  // a was fading out from the first update; the second update must not drop it at once.
  const early = after.filter((s) => s.at < 330);
  expect(early.length).toBeGreaterThan(0);
  expect(early.every((s) => "a" in s.keys), JSON.stringify(early)).toBe(true);
  // Everything lands: c, d and e at 0.
  expect(result.final.map(([x, y]) => [Math.round(x), y]).sort((p, q) => p[0] - q[0])).toEqual([[3, 0], [4, 0], [5, 0]]);
});

test("a keyed re-order under animate() keeps every row where it is", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    return f.sample(f.reorderPoints, { until: 700, steps: { 0: () => f.setReorder(["c", "a", "b"], [3, 1, 2]) } });
  });
  for (const s of result)
    for (const [x, y] of s.rows) expect(Math.abs(y - Math.round(x)), JSON.stringify(s.rows)).toBeLessThan(1e-3);
});

test("animate() on x leaves y to the mark: a y change snaps with the mark's animation off", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    f.setAxis({ x: [1, 2, 3], y: [5, 5, 5] });
    await f.axisPlot.whenSettled();
    const snapped = (await f.read(f.axisPoints)).rows.map((row) => row[1]);
    const moving = await f.sample(f.axisPoints, { until: 1000, steps: { 0: () => f.setAxis({ x: [4, 5, 6], y: [5, 5, 5] }) } });
    return { snapped, xs: moving.map((s) => s.rows[0][0]) };
  });
  expect(result.snapped).toEqual([5, 5, 5]);
  expect(result.xs.some((x) => between(x, 1.5, 3.5)), JSON.stringify(result.xs)).toBe(true);
});

test("animate() on a constant uses its own duration with the mark's animation off", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  const values = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    const samples = await f.sample(f.constantPoints, { until: 1300, option: "opacity", steps: { 0: () => f.setOpacity(0.9) } });
    return samples.map((s) => s.value);
  });
  expect(values.some((v) => between(v, 0.3, 0.8)), JSON.stringify(values)).toBe(true);
  expect(values.at(-1)).toBeCloseTo(0.9, 5);
});

test("an expression over a tweened Calculate column animates", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  const ys = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    const samples = await f.sample(f.tweenPoints, { until: 1300, steps: { 0: () => f.setTween([10, 10, 10]) } });
    return samples.map((s) => s.rows[0][1]);
  });
  expect(ys.some((y) => between(y, 3, 17)), JSON.stringify(ys)).toBe(true);
  expect(ys.at(-1)).toBe(20);
});

test("holding the clock pauses transitions, and they resume where they were", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    f.setIdle([10, 10, 10]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const release = f.idlePlot.holdAnimations();
    const held = (await f.read(f.idlePoints)).rows[0][1];
    await new Promise((resolve) => setTimeout(resolve, 700));
    const still = (await f.read(f.idlePoints)).rows[0][1];
    release();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const resumed = (await f.read(f.idlePoints)).rows[0][1];
    return { held, still, resumed };
  });
  expect(between(result.held, 0.5, 9.5), JSON.stringify(result)).toBe(true);
  expect(Math.abs(result.still - result.held)).toBeLessThan(0.5);
  // Resuming continues from the held value; it does not jump to the end.
  expect(result.resumed, JSON.stringify(result)).toBeLessThan(9.9);
});

test("a re-sort keeps each row where it is instead of sliding rows between positions", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates;
    return f.sample(f.sortPoints, { until: 900, steps: { 0: () => f.setSortOrder("desc") } });
  });
  // x and y are equal for every row, and a re-sort changes neither.
  for (const s of result)
    for (const [x, y] of s.rows) expect(Math.abs(x - y), JSON.stringify(s.rows)).toBeLessThan(1e-3);
});

test("setAnimationTime places an in-flight transition deterministically", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates, y = async () => (await f.read(f.idlePoints)).rows[0][1];
    await f.idlePlot.setAnimationTime(5000);
    f.setIdle([10, 10, 10]);
    await f.idlePlot.whenSettled();
    const values = [];
    // Back and forth while it runs; once past its end a transition is finished.
    for (const time of [5300, 5150, 5300, 5600]) {
      await f.idlePlot.setAnimationTime(time);
      values.push(await y());
    }
    const frozen = f.idlePlot.getAnimationTimeFrozen();
    await f.idlePlot.setAnimationTime(null);
    await f.idlePlot.whenAnimationsFinished();
    return { values, frozen, end: await y() };
  });
  // Linear over 600 ms from 0 to 10, started at 5000.
  result.values.forEach((value, index) => expect(value).toBeCloseTo([5, 2.5, 5, 10][index], 3));
  expect(result.frozen).toBe(true);
  expect(result.end).toBe(10);
});

test("a @time mark leaves rendering room: frames complete continuously", async ({ page }) => {
  const frames = await page.evaluate(async () => {
    const { lifecycle } = window.keyedUpdates.satellitePoints.getMark().view;
    const before = lifecycle.completedFrame;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return lifecycle.completedFrame - before;
  });
  expect(frames).toBeGreaterThan(20);
});

test("updates never draw the scene straight to the canvas, bypassing the output pass", async ({ page }) => {
  const direct = await page.evaluate(async () => {
    const f = window.keyedUpdates, renderer = f.examplePoints.getMark().renderer, render = renderer.render;
    let count = 0;
    renderer.render = function (scene, camera) {
      if (scene.isScene && !this.getRenderTarget()) count++;
      return render.call(this, scene, camera);
    };
    try {
      f.advanceExample();
      await new Promise((resolve) => setTimeout(resolve, 800));
    } finally { renderer.render = render; }
    return count;
  });
  expect(direct).toBe(0);
});

test("300 tween revisions: a bounded queue, no material recompiles, no transition buffers, no errors (T5)", async ({ page }) => {
  // y = multiply(t, 2) reads the tween column t inside an operator: since Stage 28 the mark writes
  // it at the clock time (2 * the moving t), not through a mark transition of 2t.
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates, plot = f.tweenPlot, mark = f.tweenPoints.getMark();
    const device = mark.renderer.backend.device, { RowTransition } = f.animation;
    // The first revisions compile what they need.
    for (let i = 0; i < 5; i++) { f.setTween([i, i, i]); await plot.whenSettled(); }
    await plot.whenAnimationsFinished();
    let renderPipelines = 0, allocations = 0, queue = 0;
    const saved = [device.createRenderPipeline, device.createRenderPipelineAsync, RowTransition.prototype.allocate];
    device.createRenderPipeline = function (...args) { renderPipelines++; return saved[0].apply(this, args); };
    device.createRenderPipelineAsync = function (...args) { renderPipelines++; return saved[1].apply(this, args); };
    RowTransition.prototype.allocate = function (...args) { allocations++; return saved[2].apply(this, args); };
    let last;
    try {
      for (let i = 0; i < 300; i++) {
        last = [i % 7, (i * 3) % 11, (i * 5) % 13];
        f.setTween(last);
        await new Promise((resolve) => setTimeout(resolve, i % 3 ? 0 : 16));
        queue = Math.max(queue, mark.manager.pendingUpdates);
      }
      await plot.whenAnimationsFinished();
    } finally {
      [device.createRenderPipeline, device.createRenderPipelineAsync, RowTransition.prototype.allocate] = saved;
    }
    const rows = (await f.read(f.tweenPoints)).rows.map((row) => row[1]);
    return { queue, fields: mark.fields.size, renderPipelines, allocations, rows, expected: last.map((v) => 2 * v) };
  });
  // At most one revision preparing and one pending, each writing the mark's fields once.
  expect(result.queue).toBeLessThanOrEqual(2 * result.fields);
  expect(result.renderPipelines).toBe(0);
  expect(result.allocations).toBe(0);
  expect(result.rows).toEqual(result.expected);
});

// Count render (or, with kind "Compute", compute) pipelines created on `device` while `run()` executes.
const countRenderPipelines = async (device, run, kind = "Render") => {
  let count = 0;
  const names = [`create${kind}Pipeline`, `create${kind}PipelineAsync`], saved = names.map((name) => device[name]);
  names.forEach((name, i) => { device[name] = function (...args) { count++; return saved[i].apply(this, args); }; });
  try { await run(); } finally { names.forEach((name, i) => { device[name] = saved[i]; }); }
  return count;
};

test("keyed Label updates swap the text atlas without compiling a pipeline (N3)", async ({ page }) => {
  const result = await page.evaluate(async (source) => {
    const countRenderPipelines = eval(source);
    const f = window.keyedUpdates, plot = f.examplePlot, mark = f.exampleLabels.getMark();
    const settle = async () => {
      await plot.whenSettled(); await plot.whenAnimationsFinished();
      await new Promise((resolve) => setTimeout(resolve, 50));
    };
    // The first updates compile what the transitions need.
    for (let i = 0; i < 2; i++) { f.advanceExample(); await settle(); }
    const atlases = new Set();
    const pipelines = await countRenderPipelines(mark.renderer.backend.device, async () => {
      for (let i = 0; i < 5; i++) { f.advanceExample(); await settle(); atlases.add(mark.atlas.texture.uuid); }
    });
    return { pipelines, atlases: atlases.size };
  }, countRenderPipelines.toString());
  // Every update brings new row ids, hence a new atlas.
  expect(result.atlases).toBe(5);
  expect(result.pipelines, JSON.stringify(result)).toBe(0);
});

test("a Label draws its new text after the atlas changes (N3)", async ({ page }) => {
  const result = await page.evaluate(async (source) => {
    const countRenderPipelines = eval(source);
    const f = window.keyedUpdates, plot = f.labelPlot;
    // Red label pixels in a PNG export.
    const red = async () => {
      await plot.whenSettled();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const bitmap = await createImageBitmap(await plot.exportPNG()), canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 150 && data[i + 1] < 110 && data[i + 2] < 110) count++;
      return count;
    };
    const counts = [await red()], device = f.labelMark.getMark().renderer.backend.device;
    let pipelines = 0, exports = 0;
    for (const text of ["WWWWWW", "I", "MMMMMMMMMM"]) {
      pipelines += await countRenderPipelines(device, async () => {
        f.setLabelText(text); await plot.whenSettled();
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      exports += await countRenderPipelines(device, async () => counts.push(await red()));
    }
    return { counts, pipelines, exports };
  }, countRenderPipelines.toString());
  const [narrow, wide, narrowAgain, wider] = result.counts;
  expect(narrow, JSON.stringify(result)).toBeGreaterThan(20);
  expect(wide, JSON.stringify(result)).toBeGreaterThan(narrow * 4);
  expect(Math.abs(narrowAgain - narrow), JSON.stringify(result)).toBeLessThan(narrow * 0.2 + 5);
  expect(wider, JSON.stringify(result)).toBeGreaterThan(wide);
  expect(result.pipelines, JSON.stringify(result)).toBe(0);
});

test("@time channels reuse their GPU kernels from frame to frame (N4)", async ({ page }) => {
  const result = await page.evaluate(async (source) => {
    const countRenderPipelines = eval(source);
    const f = window.keyedUpdates, mark = f.satellitePoints.getMark(), renderer = mark.renderer;
    // Let the satellites run first: the first frames compile their kernels.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const before = (await f.read(f.satellitePoints)).rows, frame = mark.view.lifecycle.completedFrame;
    const pipelines = await countRenderPipelines(renderer.backend.device, () => new Promise((resolve) => setTimeout(resolve, 600)), "Compute");
    const after = (await f.read(f.satellitePoints)).rows;
    return { pipelines, frames: mark.view.lifecycle.completedFrame - frame, moved: before.some((row, i) => Math.abs(row[0] - after[i][0]) > 1e-4) };
  }, countRenderPipelines.toString());
  expect(result.moved, JSON.stringify(result)).toBe(true);
  expect(result.frames).toBeGreaterThan(10);
  expect(result.pipelines, JSON.stringify(result)).toBe(0);
});

test("a channel over a reduction reuses its GPU kernels across data revisions (N4)", async ({ page }) => {
  const result = await page.evaluate(async (source) => {
    const countRenderPipelines = eval(source);
    const f = window.keyedUpdates, plot = f.reductionPlot, device = f.reductionPoints.getMark().renderer.backend.device;
    const revise = async (ys) => { f.setReduction(ys); await plot.whenSettled(); await new Promise((resolve) => setTimeout(resolve, 30)); };
    // The first revisions compile what the channel needs.
    await revise([2, 4, 6, 8]); await revise([0, 1, 0, 1]);
    const values = [];
    const pipelines = await countRenderPipelines(device, async () => {
      // Not all equal: jax-js folds a small constant-filled column into the kernel as a literal.
      for (const ys of [[1, 1, 1, 5], [3, 0, 0, 1], [-2, 2, -2, 6], [7, 6, 8, 7]]) {
        await revise(ys);
        values.push((await f.read(f.reductionPoints)).rows.map((row) => row[1]));
      }
    }, "Compute");
    return { pipelines, values };
  }, countRenderPipelines.toString());
  // y minus its mean, per revision.
  const expected = [[-1, -1, -1, 3], [2, -1, -1, 0], [-3, 1, -3, 5], [0, -1, 1, 0]];
  result.values.forEach((ys, i) => ys.forEach((y, j) => expect(y, JSON.stringify(result.values)).toBeCloseTo(expected[i][j], 4)));
  expect(result.pipelines).toBe(0);
});

test("the animation-engine satellites stay put on a keyed update: @time is their only motion (N6)", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates, plot = f.enginePlot;
    // A frozen clock leaves the data as the only thing that could move them.
    await plot.setAnimationTime(2000);
    const before = (await f.read(f.satellitePoints)).rows;
    f.nextEngine();
    await plot.whenSettled();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = (await f.read(f.satellitePoints)).rows;
    await plot.setAnimationTime(null);
    return { before, after };
  });
  expect(result.after.length).toBe(12);
  result.after.forEach((row, i) => row.forEach((value, axis) =>
    expect(Math.abs(value - result.before[i][axis]), JSON.stringify(result)).toBeLessThan(1e-4)));
});

// TODO 32.13: keyed enter and exit on every kind that stages its instances besides points and
// labels (utils/markKinds.js `keyed`). Mid-way the union is drawn: the kept rows opaque, the
// entering one fading in and the departing one fading out; then the departing one is gone.
test("keyed enter and exit fade the instances of every keyed kind", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates, out = {};
    const plots = () => f.kinds.map((kind) => f.kindPlots[kind]);
    while (!f.kinds.every((kind) => f.kindMarks[kind]?.getMark?.())) await new Promise((resolve) => setTimeout(resolve, 50));
    await Promise.all(plots().map((plot) => plot.whenSettled()));
    await new Promise((resolve) => setTimeout(resolve, 300));
    f.setKindKeys(["b", "c", "d"]);
    await Promise.all(plots().map((plot) => plot.whenSettled()));
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const kind of f.kinds) out[kind] = { mid: await f.readOpacity(kind) };
    await Promise.all(plots().map((plot) => plot.whenAnimationsFinished()));
    await new Promise((resolve) => setTimeout(resolve, 400));
    for (const kind of f.kinds) out[kind].after = await f.readOpacity(kind);
    return out;
  });
  for (const [kind, { mid, after }] of Object.entries(result)) {
    // The union: b, c, d, then the departing a.
    expect(mid.rows, kind).toBe(4);
    expect(mid.opacity?.slice(0, 2), kind).toEqual([1, 1]);
    const [entering, departing] = mid.opacity.slice(2);
    expect(entering > 0.05 && entering < 0.95, `${kind} entering ${entering}`).toBe(true);
    expect(departing > 0.05 && departing < 0.95, `${kind} departing ${departing}`).toBe(true);
    expect(after.rows, kind).toBe(3);
  }
});

// TODO 32.13: every kind with row opacity dims the rows a hover leaves out (selectionOpacity
// 0.25); Line and both Area forms per segment, each taking the larger of its two rows'. The marks
// ask for it with respond="hovered": since TODO 62.2 hover alone fades nothing.
test("hover dims the other rows of every kind with row opacity", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.keyedUpdates, kinds = [...f.kinds, ...f.rowKinds], out = {};
    while (!kinds.every((kind) => f.kindMarks[kind]?.getMark?.())) await new Promise((resolve) => setTimeout(resolve, 50));
    await Promise.all(kinds.map((kind) => f.kindPlots[kind].whenSettled()));
    for (const kind of kinds) f.hoverKind(kind, 0);
    await Promise.all(kinds.map((kind) => f.kindPlots[kind].whenSettled()));
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const kind of kinds) out[kind] = await f.readOpacity(kind);
    return out;
  });
  expect(Object.keys(result)).toHaveLength(12);
  for (const [kind, { opacity }] of Object.entries(result))
    expect(opacity, kind).toEqual(["Line", "Area", "Area band"].includes(kind) ? [1, 0.25] : [1, 0.25, 0.25]);
});
