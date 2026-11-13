// Frame delivery while a Force node is dragged (TODO 65.0), on /test/gallery-example?id=transform-force
// (the gallery component with its dev hooks; TODO 69.10): native
// pointer moves at a fixed rate, not awaited one by one and not sent from requestAnimationFrame
// (either paces the input to the page and hides a renderer that starves under it).
//
//   await page.addInitScript(installGpuCounters); await page.addInitScript(installDragRecorder);
//   const result = await measureForceDrag(page, { running: false, rate: 120 });
//
// The page's handle (window[handle]) has the Force (force), the Plot (plot) and the node Points
// (window[handle][points]): window.__transformExample.graphPoints by default.
//
// It reports the moves the page received, its animation frames, the plot's completed frames
// (its view's lifecycle.completedFrame) and the gaps between them, the time from a move to the first
// completed frame showing its position, the layout's iterations and the plot's publications
// (begun updates) during the gesture, mark preparations, the time the render stage was held, and
// the GPU's maps, submits and completion waits (gpu-counters.js), per gesture and per update.

/** Runs in the page before any script: pointer moves and animation frames, while recording. */
export function installDragRecorder() {
  if (window.__dragRecorder) return;
  const recorder = (window.__dragRecorder = { on: false, moves: [], frames: [] });
  window.addEventListener("pointermove", (event) => {
    if (recorder.on) recorder.moves.push([performance.now(), event.clientX, event.clientY]);
  }, { capture: true, passive: true });
  const loop = () => {
    if (recorder.on) recorder.frames.push(performance.now());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const round = (value, digits = 1) => value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
/** Gaps between `times`, the window's edges included. */
function gaps(times, start, end) {
  const points = [start, ...times.filter((t) => t > start && t < end), end];
  return points.slice(1).map((t, i) => t - points[i]);
}
const summary = (values) => ({
  mean: round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)),
  p95: round(percentile(values, 0.95)),
  max: round(values.length ? Math.max(...values) : null),
});

const NAMES = { handle: "__transformExample", points: "graphPoints" };

/** The screen position of node `index`, its data position and the data units per CSS pixel. */
export function nodeOnScreen(page, index, names = NAMES) {
  return page.evaluate(async ({ index, names }) => {
    const h = window[names.handle], mark = h[names.points].getLegendSource().guideMark();
    await mark.manager.chain;
    const p = Array.from(await mark.fields.get("position").data.ref.slice([index, index + 1]).data());
    const layout = h.plot.getAxisLayout(), box = mark.renderer.domElement.getBoundingClientRect();
    const scale = (axis) => {
      const ticks = layout[axis].major, [a, b] = [ticks[0], ticks.at(-1)];
      return { a, perFraction: (b.value - a.value) / (b.fraction - a.fraction) };
    };
    const sx = scale("x"), sy = scale("y");
    const fx = sx.a.fraction + (p[0] - sx.a.value) / sx.perFraction, fy = sy.a.fraction + (p[1] - sy.a.value) / sy.perFraction;
    return { x: box.x + box.width * fx, y: box.y + box.height * (1 - fy), data: p,
      perPixel: [sx.perFraction / box.width, sy.perFraction / box.height] };
  }, { index, names });
}

/** The Force's status, read once. */
export const forceStatus = (page, names = NAMES) => page.evaluate((names) => {
  let status;
  window[names.handle].force.subscribe((s) => (status = s))();
  return { iteration: status.iteration, selected: status.selected, selectedPosition: status.selectedPosition, error: status.error };
}, names);

/**
 * Drag node `index` `distance` CSS pixels right over `duration` ms with native moves at `rate`
 * per second, Run on (`running`) or paused. The node is pressed, the drag waits until the layout
 * has selected it (`selected` in the result), and the gesture is recorded from the first move to
 * the last; then the button is released. Needs installGpuCounters and installDragRecorder.
 */
export async function measureForceDrag(page, { running = false, rate = 120, duration = 2500, distance = 65, index = 3, release = true, names = NAMES } = {}) {
  const run = page.getByRole("checkbox", { name: "Run", exact: true });
  if (running) { await run.check(); await page.waitForTimeout(400); }
  const start = await nodeOnScreen(page, index, names);
  await page.evaluate((names) => {
    const h = window[names.handle], mark = h[names.points].getLegendSource().guideMark(),
      lifecycle = mark.view.lifecycle;
    const r = window.__dragRecorder;
    if (!r.hooked) {
      r.hooked = true;
      // Completed plot frames and the render stage's holds, as they happen.
      let completed = lifecycle.completedFrame, held = mark.view.clock.held;
      Object.defineProperty(lifecycle, "completedFrame", { configurable: true, get: () => completed,
        set: (value) => { completed = value; if (r.on) r.completed.push(performance.now()); } });
      Object.defineProperty(mark.view.clock, "held", { configurable: true, get: () => held,
        set: (value) => { if (value !== held && r.on) r.holds.push([performance.now(), value]); held = value; } });
      const gate = h[names.points].getLegendSource().guideMark().view.updates.gate, begin = gate.current;
      gate.install((...args) => { if (r.on) r.updates.push(performance.now()); return begin(...args); });
      h.force.subscribe((s) => { if (r.on) r.status.push([performance.now(), s.iteration, [...(s.selectedPosition ?? [])]]); });
    }
    Object.assign(r, { moves: [], frames: [], completed: [], holds: [], status: [], updates: [],
      preparations: h[names.points].getLegendSource().guideMark().view.diagnostics.counters.markPreparations });
  }, names);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // The press picks, then selects the node (or, in a crowded graph, a node over it): the gesture
  // starts once it has.
  await page.waitForFunction((names) => {
    let status;
    window[names.handle].force.subscribe((s) => (status = s))();
    return status.selected !== null && status.selected !== undefined;
  }, names);
  await page.waitForTimeout(100);
  // Where the drag starts in the layout (a running layout moves the node before the press).
  const { selectedPosition: origin, selected } = await forceStatus(page, names);
  const cdp = await page.context().newCDPSession(page);
  const counters = await page.evaluate(() => window.__gpuCounters.snapshot());
  const iterations = (await forceStatus(page, names)).iteration;
  const t0 = await page.evaluate(() => { window.__dragRecorder.on = true; return performance.now(); });
  const count = Math.round((rate * duration) / 1000), sent = [];
  const began = Date.now();
  for (let k = 1; k <= count; k++) {
    const due = began + (k * 1000) / rate;
    while (Date.now() < due - 1) await new Promise((resolve) => setTimeout(resolve, 1));
    sent.push(cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved", x: start.x + (distance * k) / count, y: start.y, button: "left", buttons: 1,
    }));
  }
  await Promise.all(sent);
  // Long enough for the last move to show.
  await page.waitForTimeout(300);
  const raw = await page.evaluate((names) => {
    const r = window.__dragRecorder;
    r.on = false;
    const counters = window[names.handle][names.points].getLegendSource().guideMark().view.diagnostics.counters;
    return { moves: r.moves, frames: r.frames, completed: r.completed, holds: r.holds, status: r.status, updates: r.updates,
      preparations: counters.markPreparations - r.preparations, now: performance.now() };
  }, names);
  const after = await page.evaluate(() => window.__gpuCounters.snapshot());
  const iterationsAfter = (await forceStatus(page, names)).iteration;
  await cdp.detach();
  if (release) await page.mouse.up();
  if (running) await run.uncheck();
  // The window: from the first move to the last move the page received.
  const end = raw.moves.at(-1)?.[0] ?? raw.now;
  const inWindow = (t) => t >= t0 && t <= end;
  const completed = raw.completed.filter(inWindow), frames = raw.frames.filter(inWindow), updates = raw.updates.filter(inWindow).length;
  // Held time inside the window.
  let heldMs = 0, heldSince = null;
  for (const [t, on] of raw.holds) {
    if (on) heldSince = t;
    else if (heldSince !== null) { heldMs += Math.max(0, Math.min(t, end) - Math.max(heldSince, t0)); heldSince = null; }
  }
  // A running layout moves the node between its measurement here and the press, and the drag
  // keeps the node where the pick found it relative to the pointer: that offset, in data units
  // (2-4 px on a loaded machine, TODO 69.15), is the largest gap between a position the drag
  // published and the predicted position of the latest move before it (a publication follows its
  // own move or a newer one, which predicts further along the drag).
  const along = Math.sign(distance) || 1, predicted = (x) => origin[0] + (x - start.x) * start.perPixel[0];
  let grab = null;
  for (const [t, , position] of raw.status) {
    if (t < t0 || !position.length || position[0] === origin[0]) continue;
    const move = raw.moves.findLast((m) => m[0] <= t);
    if (move) grab = Math.max(grab ?? -Infinity, along * (position[0] - predicted(move[1])));
  }
  grab = (grab ?? 0) * along;
  // Each published position to the move it came from (the nearest pointer x among the moves
  // before it), and to the first completed frame after it: the time from that move until it was
  // drawn.
  const latencies = [];
  let previous = null;
  for (const [t, , position] of raw.status) {
    const same = previous && position.every((v, i) => v === previous[i]);
    previous = position;
    if (!position.length || t < t0 || same) continue;
    const x = start.x + (position[0] - grab - origin[0]) / start.perPixel[0];
    let move = null;
    for (const m of raw.moves) if (m[0] <= t && (!move || Math.abs(m[1] - x) < Math.abs(move[1] - x))) move = m;
    const drawn = raw.completed.find((c) => c >= t);
    if (move && drawn !== undefined) latencies.push(drawn - move[0]);
  }
  // GPU work is counted over the whole recording (to 300 ms after the last move): per update, so.
  const allUpdates = Math.max(1, raw.updates.length);
  const delta = (key) => after[key] - counters[key];
  return {
    running, rate, ms: round(end - t0, 0),
    moves: raw.moves.filter((m) => inWindow(m[0])).length,
    animationFrames: frames.length,
    completedFrames: completed.length,
    completedGap: summary(gaps(completed, t0, end)),
    animationGap: summary(gaps(frames, t0, end)),
    latency: { median: round(percentile(latencies, 0.5)), p95: round(percentile(latencies, 0.95)), max: round(latencies.length ? Math.max(...latencies) : null) },
    // The layout's ticks from the first move to the last (and to 300 ms after it).
    iterations: Math.max(iterations, ...raw.status.filter(([t]) => t <= end).map(([, i]) => i)) - iterations,
    iterationsAfter: iterationsAfter - iterations,
    updates, perFrame: round(updates / Math.max(1, frames.length), 2),
    preparations: raw.preparations, heldMs: round(heldMs, 0), heldShare: round(heldMs / Math.max(1, end - t0), 2),
    gpu: {
      maps: after.readbacks - counters.readbacks, jaxMaps: after.readbackKinds.jax - counters.readbackKinds.jax,
      submits: delta("submits"), fences: delta("fences"),
      fenceSources: Object.fromEntries(Object.entries(after.fenceSources).map(([key, n]) => [key, n - (counters.fenceSources[key] ?? 0)]).filter(([, n]) => n)),
      mapsPerUpdate: round((after.readbacks - counters.readbacks) / allUpdates, 2),
      fencesPerUpdate: round(delta("fences") / allUpdates, 2), submitsPerUpdate: round(delta("submits") / allUpdates, 1),
    },
    // Where the drag started in the layout, the last position it published, the pick's offset
    // and the last move's target (start plus the offset and the pointer's change), in data units.
    selected, origin, lastPublished: raw.status.at(-1)?.[2] ?? null, grab,
    lastTarget: [predicted(raw.moves.at(-1)?.[1] ?? start.x) + grab, origin[1]],
    start, end: { x: raw.moves.at(-1)?.[1] ?? start.x, y: start.y },
  };
}
