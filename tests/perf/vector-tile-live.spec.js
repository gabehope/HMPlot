// Live VectorTile: frame delivery, first-use cost, update latency and memory (TODO 63.0). Not part
// of the regular suite:
//   PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/vector-tile-live.spec.js
// Start a fresh server for each run: the build counters read 0 on a server that has seen edits.
//
// The dense local replay (no network): every zoom-14 tile is the bundled Amsterdam tile
// (14/8414/5384, 670 KB), every zoom-13 tile 13/2411/3080, every zoom-12 tile 12/1206/1538, and
// every other tile water. Repeated content is a controlled workload, not a real place. A 1200 x 800
// plot (src/routes/test/vector-tiles) at a device pixel ratio of 2, on one page, phase by phase:
//   pan         six zoom-14 tile widths east over 2 s and back over 2 s (new ground, a reversal);
//   zoom        out four levels and back over 4 s, by 2 ** (-4 sin(pi t / 4000)) (first use);
//   zoom again  the same (warm);
//   pan again   the same pan (warm);
//   fresh zoom  the same zoom 64 zoom-14 tiles east (new tiles at every level);
//   idle        3 s still;
//   restyle     water's fill only.
// Each phase reports: the gaps between animation frames (mean, p95, max), completed plot frames,
// long tasks, the time until the view's tiles all show once the motion stops, the time with tiles
// missing during the motion, mark builds (dev server only), render pipelines, GPU bytes allocated
// and still allocated, worker jobs; with PROFILE=1, CPU time inside three's node builder
// (NodeManager.getForRender) and the picking pass (renderPick, dev server only).
// Env: LABELS=0 hides place names; CLICK=0 leaves out onclick (no picking); DELAY=<ms> delays
// every live tile's response; PROJECTION=orthographic draws the globe; PHASES=pan,zoom,... runs
// only those (load always runs); NODES=1 (dev server) counts node graphs by mark and pass.
//
// FLYOVER=1 runs the 3D flyover instead (TODO 66.5): the same replay (the Amsterdam tile's 6,995
// buildings standing at every zoom-14 tile) under a flyover camera (the fixture's ?flyover=1,
// 0.01 units a meter), phase by phase: flight (400 m up, looking 30 degrees down, 6 km north over
// 4 s: new tiles all the way), climb (up to 4 km and back down over 4 s), flight again (the same
// flight: warm), fresh flight (the same 6 km east of it), idle 3 s, flat (3D buildings off) and
// extrude (on again). Each phase adds the tiles requested and the tiles with extruded buildings.
import { test as base, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { encodeVectorTile } from "../unit/vectorTileEncoder.js";
import { installGpuCounters, installGpuErrors, countMarkBuilds, gpuCounters, countersDelta } from "../browser/gpu-counters.js";
import { pixelReader } from "../browser/png.js";
const test = process.env.PERF && !process.env.FLYOVER ? base : base.skip;
const flyoverTest = process.env.PERF && process.env.FLYOVER ? base : base.skip;

const bundled = (path) => readFileSync(new URL(`../../static/data/vector-tiles/${path}.mvt`, import.meta.url));
const BYTES = { 14: bundled("14/8414/5384"), 13: bundled("13/2411/3080"), 12: bundled("12/1206/1538") };
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const WATER = Buffer.from(encodeVectorTile([{ name: "water_polygons", features: [{ type: 3, properties: { kind: "water" }, geometry: [square(0, 0, 4096, 4096)] }] }]));
const DELAY = Number(process.env.DELAY ?? 0);
const LABELS = process.env.LABELS !== "0", CLICK = process.env.CLICK !== "0", PROJECTION = process.env.PROJECTION ?? "mercator";
const PHASES = process.env.PHASES ? new Set(process.env.PHASES.split(",")) : null;

// Counts the jobs posted to the tile workers, and the GPU queue's submits and buffer writes.
function installJobCounter() {
  window.__tileJobs = 0;
  window.__queue = { submits: 0, writes: 0 };
  performance.setResourceTimingBufferSize(100000);
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (message, ...rest) {
    if (message && typeof message === "object" && message.job) window.__tileJobs++;
    return post.call(this, message, ...rest);
  };
  const submit = GPUQueue.prototype.submit, write = GPUQueue.prototype.writeBuffer;
  GPUQueue.prototype.submit = function (...args) { window.__queue.submits++; return submit.apply(this, args); };
  GPUQueue.prototype.writeBuffer = function (...args) { window.__queue.writes++; return write.apply(this, args); };
}

// CPU time (ms) of the samples whose stack has a frame matching `match`.
function inclusive(profile, match) {
  const parent = new Map(), byId = new Map(profile.nodes.map((node) => [node.id, node])), under = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const test = (id) => {
    if (under.has(id)) return under.get(id);
    const value = match(byId.get(id).callFrame) || (parent.has(id) ? test(parent.get(id)) : false);
    under.set(id, value);
    return value;
  };
  let total = 0;
  profile.samples.forEach((id, i) => { if (test(id)) total += profile.timeDeltas[i] ?? 0; });
  return Math.round(total / 1000);
}

// The `count` functions (name and file) with the most inclusive CPU time (ms).
function top(profile, count) {
  const parent = new Map(), byId = new Map(profile.nodes.map((node) => [node.id, node])), totals = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  profile.samples.forEach((id, i) => {
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) {
      const { functionName, url } = byId.get(at).callFrame, key = `${functionName || "(anonymous)"} ${url.split("/").pop().split("?")[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      totals.set(key, (totals.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
    }
  });
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, count).map(([key, us]) => `${Math.round(us / 1000)} ${key}`);
}

// One motion in the page: setViewport every animation frame for `duration` ms, then the time
// until every tile the view selects shows.
const motion = (page, kind, duration, params = {}) => page.evaluate(async ({ kind, duration, params }) => {
  const plot = window.vectorTiles.plot, tiles = window.vectorTiles.tiles;
  const start = plot.getViewport(), firstFrame = plot.getDiagnostics().completedFrame;
  const view = (t) => {
    const u = Math.min(1, t / duration);
    if (kind === "pan") return { ...start, x: start.x + params.dx * (u < 0.5 ? 2 * u : 2 - 2 * u) };
    const f = 2 ** (-params.levels * Math.sin(Math.PI * u));
    return { ...start, zoom: start.zoom * f, zoomX: start.zoomX * f, zoomY: start.zoomY * f };
  };
  const longTasks = [];
  const observer = new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration)));
  observer.observe({ type: "longtask" });
  const gaps = [];
  let missing = 0, last = 0;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = (now) => {
      if (last) gaps.push(now - last);
      const live = tiles.getStatus().live;
      if (last && live && live.shown < live.selected) missing += now - last;
      last = now;
      const t = now - t0;
      plot.setViewport(view(Math.min(t, duration)));
      if (t < duration) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  const moved = plot.getDiagnostics().completedFrame - firstFrame;
  // Until the view's tiles all show and a frame has drawn them.
  const stopped = performance.now();
  let covered = null;
  while (performance.now() - stopped < 20000) {
    const live = tiles.getStatus().live;
    if (live && live.shown === live.selected) { covered = performance.now() - stopped; break; }
    await new Promise(requestAnimationFrame);
  }
  await plot.whenSettled();
  observer.disconnect();
  const sorted = [...gaps].sort((a, b) => a - b), at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const round = (value) => (value === null || value === undefined ? value : Math.round(value * 10) / 10);
  return {
    frames: moved, rafs: gaps.length + 1, p50: round(at(0.5)), mean: round(gaps.reduce((a, b) => a + b, 0) / gaps.length), p95: round(at(0.95)), max: round(sorted.at(-1)),
    longTasks: longTasks.length, longMs: Math.round(longTasks.reduce((a, b) => a + b, 0)), longMax: Math.round(Math.max(0, ...longTasks)),
    missingMs: Math.round(missing), coveredMs: round(covered), settledMs: Math.round(performance.now() - stopped),
  };
}, { kind, duration, params });

base.use({ deviceScaleFactor: 2 });

// The actual paired gallery scene, including its 6,397 USGS earthquakes and docs layout.
// Use LIVE_NETWORK=1 for unpinned external requests; the default replay keeps arrival time
// controlled. These observations are separate from the dense fixture's before/after sample.
const galleryTest = process.env.PERF && process.env.GLOBE ? base : base.skip;
galleryTest("gallery globe zoom, seam and pole navigation", async ({ page }, testInfo) => {
  galleryTest.setTimeout(180000);
  await page.addInitScript(installGpuCounters);
  await page.addInitScript(installGpuErrors);
  await page.addInitScript(installJobCounter);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  if (!process.env.LIVE_NETWORK) await page.route("**/tiles.versatiles.org/**", async route => {
    const match = /\/(\d+)\/(\d+)\/(\d+)(?:\.[^/]+)?$/.exec(new URL(route.request().url()).pathname);
    requests.push(match?.slice(1).map(Number));
    await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: BYTES[Number(match?.[1])] ?? WATER }).catch(() => {});
  });
  await page.goto("/examples/globe-tiles");
  await page.waitForFunction(() => window.__examples?.plot);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every(c => c.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => window.__examples.settle());
  const phases = {};
  for (const kind of ["zoom", "warm", "seam", "pole"]) {
    const before = await gpuCounters(page);
    const result = await page.evaluate(async kind => {
      const plot = window.__examples.plot, start = plot.getViewport();
      const frame = plot.getDiagnostics().completedFrame, gaps = [];
      let last;
      const t0 = performance.now();
      await new Promise(resolve => {
        const tick = now => {
          if (last) gaps.push(now - last);
          last = now;
          const u = Math.min(1, (now - t0) / 3000);
          const f = kind === "zoom" || kind === "warm" ? 2 ** (8 * Math.sin(Math.PI * u)) : 1;
          const center = kind === "seam" ? [170 + 40 * u, 0] : kind === "pole" ? [0, 70 + 19 * Math.sin(Math.PI * u)] : [139.76, 35.68];
          plot.setViewport({ ...start, zoom: start.zoom * f, zoomX: start.zoomX * f, zoomY: start.zoomY * f, center });
          if (u < 1) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      const frames = plot.getDiagnostics().completedFrame - frame;
      await plot.whenSettled();
      gaps.sort((a,b) => a-b);
      return { frames, rafs: gaps.length + 1, p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1) };
    }, kind);
    phases[kind] = { ...result, gpu: await countersDelta(page, before, await gpuCounters(page)) };
  }
  const gpuErrors = await page.evaluate(() => window.__gpuErrors);
  writeFileSync(testInfo.outputPath("gallery-metrics.json"), JSON.stringify({ liveNetwork: Boolean(process.env.LIVE_NETWORK), requests, phases, errors, gpuErrors }, null, 2));
  await page.locator(".canvas").first().screenshot({ path: testInfo.outputPath("gallery-globe.png") });
  const exports = await page.evaluate(async () => {
    const plot = window.__examples.plot;
    // VectorTile is a raster layer in document exports; supported overlay marks remain vector.
    const svg = await (await plot.exportSVG({ mode: "auto" })).blob.text();
    const pdf = await (await plot.exportPDF({ mode: "auto" })).blob.text();
    const png = await plot.exportPNG();
    return { svgImages: (svg.match(/<image\b/g) ?? []).length, pdf: pdf.slice(0, 5), pngBytes: png.size };
  });
  writeFileSync(testInfo.outputPath("gallery-metrics.json"), JSON.stringify({ liveNetwork: Boolean(process.env.LIVE_NETWORK), requests, phases, exports, errors, gpuErrors: await page.evaluate(() => window.__gpuErrors) }, null, 2));
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);
  expect(exports.svgImages).toBeGreaterThan(0);
  expect(exports.pdf).toBe("%PDF-");
  expect(exports.pngBytes).toBeGreaterThan(1000);
  for (const result of Object.values(phases)) expect(result.frames).toBeGreaterThan(result.rafs * .8);
});

test("live VectorTile frame delivery and first-use cost", async ({ page }, testInfo) => {
  test.setTimeout(300000);
  await page.addInitScript(installGpuCounters);
  await page.addInitScript(installGpuErrors);
  await page.addInitScript(installJobCounter);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/vt-api/**", async (route) => {
    const [z] = new URL(route.request().url()).pathname.replace("/vt-api/", "").split("/").map(Number);
    if (DELAY) await new Promise((resolve) => setTimeout(resolve, DELAY));
    await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: BYTES[z] ?? WATER }).catch(() => {});
  });
  const styles = LABELS ? "" : `&styles=${encodeURIComponent(JSON.stringify({ places: false }))}`;
  const started = Date.now();
  await page.goto(`/test/vector-tiles?url=${encodeURIComponent("/vt-api/{z}/{x}/{y}.mvt")}&tile=14/8414/5384&live=1&width=1200&height=800&projection=${PROJECTION}${CLICK ? "" : "&click=0"}${styles}`);
  await page.waitForFunction(() => window.vectorTiles?.plot && window.vectorTiles?.tiles);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"), null, { timeout: 60000 });
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  const loaded = await gpuCounters(page);
  const out = { dev: true, labels: LABELS, click: CLICK, delay: DELAY, projection: PROJECTION,
    load: { ms: Date.now() - started, render: loaded.render, liveMB: Math.round(loaded.liveBytes / 2 ** 20), jobs: await page.evaluate(() => window.__tileJobs) } };
  try { await countMarkBuilds(page); } catch { out.dev = false; }
  // NODES=1 (dev server only): node graphs built, and their time, by mark class, material and pass.
  if (process.env.NODES && out.dev)
    await page.evaluate(async () => {
      const url = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /deps\/three_webgpu\.js/.test(name));
      const { NodeBuilder } = await import(url);
      const build = NodeBuilder.prototype.build;
      window.__nodeBuilds = {};
      const seen = new WeakMap();
      NodeBuilder.prototype.build = function (...args) {
        const t0 = performance.now();
        try { return build.apply(this, args); } finally {
          const capacity = this.object?.manager?.maxElements;
          const prior = seen.get(this.object);
          // Instrumentation starts after load. A first observation can also be a loaded mark's
          // first rebuild; do not mislabel it as the object's first use.
          const reason = prior === undefined ? "first-observed" : prior !== capacity ? "buffer-growth" : "structural";
          if (this.object) seen.set(this.object, capacity);
          const key = `${this.object?.constructor?.name}:${this.material?.type}:${this.material?.mrtNode ? "pick" : "draw"}:${reason}`;
          const entry = (window.__nodeBuilds[key] ??= { count: 0, ms: 0 });
          entry.count++;
          entry.ms += performance.now() - t0;
        }
      };
    });
  const cdp = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); }
  const phase = async (name, run) => {
    if (PHASES && !PHASES.has(name)) return;
    const before = await gpuCounters(page), jobs = await page.evaluate(() => window.__tileJobs), queue = await page.evaluate(() => ({ ...window.__queue }));
    if (cdp) await cdp.send("Profiler.start");
    const result = await run();
    let cpu;
    if (cdp) {
      const { profile } = await cdp.send("Profiler.stop");
      writeFileSync(testInfo.outputPath(`${name.replaceAll(" ", "-")}.cpuprofile`), JSON.stringify(profile));
      cpu = {
        nodeBuilderMs: inclusive(profile, (frame) => frame.functionName === "getForRender"),
        pickingMs: inclusive(profile, (frame) => frame.functionName === "renderPick"),
        markBuildMs: inclusive(profile, (frame) => frame.functionName === "build" && /\/objects\//.test(frame.url)),
        uploadMs: inclusive(profile, (frame) => frame.functionName === "set" && /vectorTileSlot/.test(frame.url)),
        placesMs: inclusive(profile, (frame) => frame.functionName === "placeNames"),
        labelMs: inclusive(profile, (frame) => /label\.svelte|labels\.js/.test(frame.url)),
        busyMs: inclusive(profile, (frame) => !/^\((idle|program|garbage collector|root)\)$/.test(frame.functionName)),
      };
      if (process.env.TOP) cpu.top = top(profile, Number(process.env.TOP));
    }
    const nodes = process.env.NODES && out.dev ? await page.evaluate(() => {
      const stats = window.__nodeBuilds;
      window.__nodeBuilds = {};
      return Object.fromEntries(Object.entries(stats).map(([key, { count, ms }]) => [key, `${count} ${Math.round(ms)}ms`]));
    }) : undefined;
    const after = await gpuCounters(page), delta = await countersDelta(page, before, after);
    out[name] = { ...result, builds: out.dev ? delta.builds : null, render: delta.render, allocMB: Math.round(delta.bufferKB / 1024),
      liveMB: Math.round(after.liveBytes / 2 ** 20), jobs: (await page.evaluate(() => window.__tileJobs)) - jobs, ...(cpu ? { cpu } : {}), ...(nodes ? { nodes } : {}),
      submits: (await page.evaluate(() => window.__queue.submits)) - queue.submits, writes: (await page.evaluate(() => window.__queue.writes)) - queue.writes,
      live: await page.evaluate(() => window.vectorTiles.tiles.getStatus().live) };
  };
  const pan = () => motion(page, "pan", 4000, { dx: 6 / 16384 });
  const zoom = () => motion(page, "zoom", 4000, { levels: 4 });
  await phase("pan", pan);
  await phase("zoom", zoom);
  await phase("zoom again", zoom);
  await phase("zoom warmed", zoom);
  await phase("pan again", pan);
  await page.evaluate(async () => {
    const plot = window.vectorTiles.plot, v = plot.getViewport();
    plot.setViewport({ ...v, x: v.x + 64 / 16384 });
    await plot.whenSettled();
  });
  await phase("fresh zoom", zoom);
  await phase("idle", async () => { await page.waitForTimeout(3000); return {}; });
  // Ring preparation and the spare-slot trim happen after settlement. Measure actual idle
  // separately, after those bounded jobs, rather than attributing their work to idleness.
  await page.waitForTimeout(1500);
  await phase("idle settled", async () => { await page.waitForTimeout(1000); return {}; });
  await phase("restyle", () => page.evaluate(async (labels) => {
    const plot = window.vectorTiles.plot, t0 = performance.now(), first = plot.getDiagnostics().completedFrame;
    window.vectorTiles.set({ tile: [14, 8414, 5384], styles: { ...(labels ? {} : { places: false }), water: { fill: "#5a8fc0" } } });
    await new Promise(requestAnimationFrame);
    await plot.whenSettled();
    return { settledMs: Math.round(performance.now() - t0), frames: plot.getDiagnostics().completedFrame - first };
  }, LABELS));
  out.errors = errors;
  out.gpuErrors = await page.evaluate(() => window.__gpuErrors);
  writeFileSync(testInfo.outputPath("metrics.json"), JSON.stringify(out, null, 2));
  const png = await page.locator("canvas").first().screenshot({ path: testInfo.outputPath("tiles.png") });
  if (out.restyle) {
    const read = pixelReader(png), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let water = 0;
    for (let x = 0; x < 40; x++) for (let y = 0; y < 30; y++) {
      const rgb = read(Math.floor((x + .5) / 40 * width), Math.floor((y + .5) / 30 * height));
      if (rgb.every((channel, i) => Math.abs(channel - [0x5a, 0x8f, 0xc0][i]) <= 8)) water++;
    }
    expect(water, "restyled tiles must really draw").toBeGreaterThan(20);
  }
  expect(errors).toEqual([]);
  expect(out.gpuErrors).toEqual([]);
  console.log(`RESULT ${JSON.stringify(out)}`);
  const columns = ["frames", "mean", "p95", "max", "longTasks", "longMax", "missingMs", "coveredMs", "builds", "render", "allocMB", "liveMB", "jobs", "submits"];
  console.log(["phase".padEnd(11), ...columns.map((column) => column.padStart(9))].join(""));
  for (const name of ["pan", "zoom", "zoom again", "pan again", "fresh zoom", "idle", "restyle"])
    if (out[name]) console.log([name.padEnd(11), ...columns.map((column) => String(out[name][column] ?? "").padStart(9))].join("") +
      (out[name].cpu ? `  cpu ${JSON.stringify({ ...out[name].cpu, top: undefined })}` : "") + (out[name].nodes ? `  nodes ${JSON.stringify(out[name].nodes)}` : ""));
  for (const name of ["pan", "zoom", "zoom again", "pan again", "fresh zoom", "idle", "restyle"])
    if (out[name]?.cpu?.top) console.log(`${name}:\n  ${out[name].cpu.top.join("\n  ")}`);
});

// One flight in the page: the camera at `path(u)` ({ position, target }, u from 0 to 1) every
// animation frame for `duration` ms, then the time until every tile the view selects shows.
const flight = (page, path, duration) => page.evaluate(async ({ path, duration }) => {
  const plot = window.vectorTiles.plot, tiles = window.vectorTiles.tiles, at = new Function("u", `return (${path})(u)`);
  const firstFrame = plot.getDiagnostics().completedFrame, longTasks = [], gaps = [];
  const observer = new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration)));
  observer.observe({ type: "longtask" });
  let missing = 0, last = 0, slots = 0, requests = 0;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = (now) => {
      if (last) gaps.push(now - last);
      const live = tiles.getStatus().live;
      if (last && live && live.shown < live.selected) missing += now - last;
      slots = Math.max(slots, live?.slots ?? 0);
      requests = Math.max(requests, live?.requests ?? 0);
      last = now;
      const t = now - t0;
      plot.setCamera(at(Math.min(1, t / duration)));
      if (t < duration) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  const moved = plot.getDiagnostics().completedFrame - firstFrame, stopped = performance.now();
  let covered = null;
  while (performance.now() - stopped < 20000) {
    const live = tiles.getStatus().live;
    if (live && live.shown === live.selected) { covered = performance.now() - stopped; break; }
    await new Promise(requestAnimationFrame);
  }
  await plot.whenSettled();
  observer.disconnect();
  const sorted = [...gaps].sort((a, b) => a - b), pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const round = (value) => (value === null || value === undefined ? value : Math.round(value * 10) / 10);
  return {
    frames: moved, rafs: gaps.length + 1, mean: round(gaps.reduce((a, b) => a + b, 0) / gaps.length), p95: round(pick(0.95)), max: round(sorted.at(-1)),
    longTasks: longTasks.length, longMax: Math.round(Math.max(0, ...longTasks)), missingMs: Math.round(missing), coveredMs: round(covered),
    peakSlots: slots, peakRequests: requests,
  };
}, { path: path.toString(), duration });

flyoverTest("live VectorTile under a 3D flyover: frame delivery, requests, builds and memory of first and repeated flights", async ({ page }) => {
  base.setTimeout(300000);
  await page.addInitScript(installGpuCounters);
  await page.addInitScript(installGpuErrors);
  await page.addInitScript(installJobCounter);
  const errors = [], requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/vt-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/vt-api/", "");
    requests.push(path);
    const [z] = path.split("/").map(Number);
    if (DELAY) await new Promise((resolve) => setTimeout(resolve, DELAY));
    await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: BYTES[z] ?? WATER }).catch(() => {});
  });
  const started = Date.now();
  await page.goto(`/test/vector-tiles?url=${encodeURIComponent("/vt-api/{z}/{x}/{y}.mvt")}&tile=14/8414/5384&live=1&flyover=1&width=1200&height=800` +
    `&styles=${encodeURIComponent(JSON.stringify({ places: false }))}${CLICK ? "" : "&click=0"}`);
  await page.waitForFunction(() => window.vectorTiles?.plot && window.vectorTiles?.tiles);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"), null, { timeout: 60000 });
  await page.evaluate(() => window.vectorTiles.plot.setCamera({ position: [0, 4, 8], target: [0, 0, 1.07] }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  const loaded = await gpuCounters(page);
  const out = { dev: true, click: CLICK, delay: DELAY, flyover: true,
    load: { ms: Date.now() - started, render: loaded.render, liveMB: Math.round(loaded.liveBytes / 2 ** 20), jobs: await page.evaluate(() => window.__tileJobs), requests: requests.length } };
  try { await countMarkBuilds(page); } catch { out.dev = false; }
  const phase = async (name, run) => {
    const before = await gpuCounters(page), jobs = await page.evaluate(() => window.__tileJobs), queue = await page.evaluate(() => ({ ...window.__queue })), asked = requests.length;
    const result = await run();
    const after = await gpuCounters(page), delta = await countersDelta(page, before, after), status = await page.evaluate(() => window.vectorTiles.tiles.getStatus());
    out[name] = { ...result, builds: out.dev ? delta.builds : null, render: delta.render, allocMB: Math.round(delta.bufferKB / 1024),
      liveMB: Math.round(after.liveBytes / 2 ** 20), jobs: (await page.evaluate(() => window.__tileJobs)) - jobs, requests: requests.length - asked,
      submits: (await page.evaluate(() => window.__queue.submits)) - queue.submits, extruded: status.extruded, live: status.live };
  };
  // 400 m up, looking 30 degrees down (the target 4 / tan 30 = 6.93 ahead), north (-z) or east.
  const north = (u) => ({ position: [0, 4, 8 - 60 * u], target: [0, 0, 1.07 - 60 * u] });
  const climb = (u) => { const h = 4 + 36 * Math.sin(Math.PI * u); return { position: [0, h, -52], target: [0, 0, -52 - h * 1.732] }; };
  const east = (u) => ({ position: [60, 4, 8 - 60 * u], target: [60, 0, 1.07 - 60 * u] });
  await phase("flight", () => flight(page, north, 4000));
  await phase("climb", () => flight(page, climb, 4000));
  await page.evaluate(() => window.vectorTiles.plot.setCamera({ position: [0, 4, 8], target: [0, 0, 1.07] }).then(() => window.vectorTiles.plot.whenSettled()));
  await phase("flight again", () => flight(page, north, 4000));
  await phase("fresh flight", () => flight(page, east, 4000));
  await phase("idle", async () => { await page.waitForTimeout(3000); return {}; });
  const toggle = (on) => page.evaluate(async (on) => {
    const plot = window.vectorTiles.plot, t0 = performance.now(), first = plot.getDiagnostics().completedFrame;
    window.vectorTiles.setExtrude(on);
    await new Promise(requestAnimationFrame);
    await plot.whenSettled();
    return { settledMs: Math.round(performance.now() - t0), frames: plot.getDiagnostics().completedFrame - first };
  }, on);
  await phase("flat", () => toggle(false));
  await phase("extrude", () => toggle(true));
  out.errors = errors;
  out.gpuErrors = await page.evaluate(() => window.__gpuErrors);
  expect(errors).toEqual([]);
  expect(out.gpuErrors).toEqual([]);
  console.log(`RESULT ${JSON.stringify(out)}`);
  const columns = ["frames", "rafs", "mean", "p95", "max", "longTasks", "longMax", "missingMs", "coveredMs", "peakSlots", "peakRequests", "requests", "jobs",
    "builds", "render", "allocMB", "liveMB", "extruded"];
  console.log(["phase".padEnd(13), ...columns.map((column) => column.padStart(9))].join(""));
  for (const name of ["flight", "climb", "flight again", "fresh flight", "idle", "flat", "extrude"])
    if (out[name]) console.log([name.padEnd(13), ...columns.map((column) => String(out[name][column] ?? "").padStart(9))].join(""));
});
