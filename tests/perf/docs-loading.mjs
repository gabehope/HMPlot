// The docs site's loading audit (TODO 68.0). It serves production builds as a static host would
// (gzip; /_app/immutable/ and content-hashed example assets immutable; HTML, manifests and other
// files revalidated) and loads docs routes in Chrome with WebGPU at a device pixel ratio of 2,
// in a fresh context each time, under several profiles, several runs each, alternating builds
// run by run so two builds see the same machine load. It reports medians and ranges of:
//   fcp, lcp       first contentful and largest contentful paint (ms from navigation start)
//   preview        the first example preview shown: the frame after the snapshot is in the page
//                  (an inline SVG) or its image has loaded (an <img>)
//   frame          the first frame drawn into a WebGPU canvas (getCurrentTexture's first call)
//   live           the live plot shown in place of the preview (.live without .pending, as the
//                  preview starts to fade out over it; a gallery program's canvas no longer busy)
//   gpu            the first requestDevice's call to its resolution
//   scrolled       for an example below the fold, when the audit scrolled it into view (its live
//                  plot starts only then)
//   font           the first plot font's request and response end
//   js, bytes      compressed bytes of JavaScript and of everything but the page's HTML;
//                  jsBeforeRuntime: the JavaScript requested before the plotting runtime's
//   cls            cumulative layout shift
//   runtime        compressed bytes of the plotting runtime's JavaScript (chunks that construct
//                  WebGPU renderers or devices), and requests for it
//   thumbnails     bytes of the gallery cards' thumbnails the page loaded, and their number
//   long           the long tasks' total and the longest
// --trace records one Chrome trace per build and route (localhost) and prints the main thread's
// time by activity (script compile and evaluation, HTML parsing, style and layout, paint, GC,
// image decoding) and, inside long tasks, the JavaScript functions sampled most.
//
//   node tests/perf/docs-loading.mjs [--build name=dir ...] [--profiles localhost,constrained,cpu4x,warm,nav]
//        [--routes home,intro,points,guide,lorenz,legacy,gallery] [--runs 5] [--port 4173] [--trace] [--h2] [--json file]
//   node tests/perf/docs-loading.mjs --dev name=checkout ... [--missing <id>] [--stale] [--vite-config file] [--runs 3]
//   node tests/perf/docs-loading.mjs --budget        # npm run check:docs-budget: the budgets below
//
// --build defaults to after=build (npm run build first). Profiles: localhost (no throttling, cache
// disabled), constrained (10 Mbps down, 5 up, 80 ms latency, cache disabled), cpu4x (4x CPU
// slowdown), warm (the constrained network, a primed HTTP cache: /docs/start first, then the route
// in the same context) and nav (constrained, the route reached by a client-side link from
// /docs/start; times from the click). The machine's other load and its GPU shader caches are not
// controlled: compare builds within one run of this script.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { createSecureServer } from "node:http2";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const builds = args.flatMap((value, i) => args[i - 1] === "--build" ? [value] : []).map((value) => {
  const [name, dir] = value.includes("=") ? value.split("=") : ["after", value];
  return { name, dir: path.resolve(dir) };
});
if (!builds.length) builds.push({ name: "after", dir: path.resolve("build") });
const ROUTES = {
  home: "/",
  intro: "/docs/introduction",
  points: "/reference/svelte/points",
  guide: "/docs/export",
  lorenz: "/examples/lorenz-attractor",
  legacy: "/examples/pie",
  gallery: "/examples",
};
// Routes with no example: the audit waits for no preview or live plot there.
const TEXT_ROUTES = new Set(["intro", "gallery"]);
const routes = option("routes", args.includes("--budget") ? "intro,points,home" : Object.keys(ROUTES).join(",")).split(",");
const budget = args.includes("--budget");
const profiles = option("profiles", budget ? "localhost" : "localhost,constrained,cpu4x").split(",");
const runs = Number(option("runs", budget ? 1 : 5));
// The builds are served on this port and the next ones (one each), a dev server on it: --port, else
// $HM_AUDIT_PORT, else Vite's preview port. Every server stops when the script ends.
const port = Number(option("port", process.env.HM_AUDIT_PORT ?? 4173));
const trace = args.includes("--trace"), h2 = args.includes("--h2");
const NETWORK = { offline: false, latency: 80, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 };

// ---- A static host -------------------------------------------------------------------------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".wasm": "application/wasm", ".whl": "application/octet-stream", ".txt": "text/plain", ".csv": "text/csv" };
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".ttf", ".txt", ".csv", ".wasm"]);
function serve(dir, listenPort) {
  const cache = new Map();
  const resolve = (pathname) => {
    const file = path.join(dir, decodeURIComponent(pathname));
    if (!file.startsWith(dir)) return null;
    for (const candidate of [file, `${file}.html`, path.join(file, "index.html")])
      if (existsSync(candidate) && statSync(candidate).isFile()) return { file: candidate, status: 200 };
    if (existsSync(path.join(dir, "404.html"))) return { file: path.join(dir, "404.html"), status: 404 };
    return { file: path.join(dir, "index.html"), status: 200 };
  };
  const handle = (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const found = resolve(url.pathname);
    if (!found) { response.writeHead(403).end(); return; }
    const ext = path.extname(found.file), stat = statSync(found.file), etag = `"${stat.size}-${stat.mtimeMs}"`;
    const immutable = url.pathname.startsWith("/_app/immutable/") || /^\/example-builds\/.*\.[0-9a-f]{8,}\.\w+$/.test(url.pathname);
    const headers = { "content-type": TYPES[ext] ?? "application/octet-stream", etag,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" };
    if (request.headers["if-none-match"] === etag && found.status === 200) { response.writeHead(304, headers).end(); return; }
    let body = cache.get(found.file);
    if (!body) {
      const raw = readFileSync(found.file);
      body = { raw, gzip: COMPRESSIBLE.has(ext) && raw.length > 1024 ? gzipSync(raw, { level: 6 }) : null };
      cache.set(found.file, body);
    }
    if (body.gzip && /\bgzip\b/.test(request.headers["accept-encoding"] ?? "")) {
      response.writeHead(found.status, { ...headers, "content-encoding": "gzip", vary: "Accept-Encoding", "content-length": body.gzip.length });
      response.end(body.gzip);
    } else {
      response.writeHead(found.status, { ...headers, "content-length": body.raw.length });
      response.end(body.raw);
    }
  };
  // --h2: HTTP/2 over TLS (a self-signed certificate Chrome is told to accept), as hosts serve
  // sites; requests then share one connection instead of queuing for six.
  let server;
  if (h2) {
    const folder = mkdtempSync(path.join(tmpdir(), "docs-loading-")), key = path.join(folder, "key.pem"), cert = path.join(folder, "cert.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
    server = createSecureServer({ key: readFileSync(key), cert: readFileSync(cert), allowHTTP1: true }, handle);
  } else server = createServer(handle);
  return new Promise((done) => server.listen(listenPort, "127.0.0.1", () => done(server)));
}

// A gallery card's thumbnail (TODO 69.19): a program pair's thumbnail-<width>.<hash>.webp, or a
// gallery program's under gallery/.
const THUMBNAIL = /\/example-builds\/.*\/thumbnail-[^/]*\.(webp|png|svg)$/;

// Whether a served script is the plotting runtime: it requests WebGPU devices or creates renderers.
const runtimeFiles = new Map();
function isRuntime(dir, pathname) {
  const key = `${dir}${pathname}`;
  if (!runtimeFiles.has(key)) {
    let runtime = false;
    try { const text = readFileSync(path.join(dir, pathname), "utf8"); runtime = /requestDevice\(|WebGPURenderer/.test(text); } catch {}
    runtimeFiles.set(key, runtime);
  }
  return runtimeFiles.get(key);
}

// ---- In the page -----------------------------------------------------------------------------
function observe() {
  const audit = (window.__audit = { marks: {}, lcp: 0, cls: 0, longtasks: [], element: {} });
  const mark = (name, time = performance.now()) => { if (!(name in audit.marks)) audit.marks[name] = time; };
  // The frame after `time`: rAF runs before the frame's paint, a task after it runs after.
  const painted = (name) => requestAnimationFrame(() => setTimeout(() => mark(name), 0));
  const observeType = (type, callback) => { try { new PerformanceObserver((list) => list.getEntries().forEach(callback)).observe({ type, buffered: true }); } catch {} };
  observeType("paint", (entry) => { if (entry.name === "first-contentful-paint") mark("fcp", entry.startTime); });
  observeType("largest-contentful-paint", (entry) => { audit.lcp = entry.startTime; });
  observeType("longtask", (entry) => audit.longtasks.push([entry.startTime, entry.duration]));
  observeType("layout-shift", (entry) => { if (!entry.hadRecentInput) audit.cls += entry.value; });
  observeType("element", (entry) => { audit.element[entry.identifier] ??= entry.renderTime || entry.loadTime; });
  const seen = new WeakSet();
  // A client-side navigation's marks count only the new page's examples.
  const fresh = (element) => !audit.stale?.has(element.closest(".example"));
  const check = () => {
    for (const image of document.querySelectorAll(".example .snapshot img")) {
      if (seen.has(image) || !fresh(image)) continue;
      seen.add(image);
      if (image.complete && image.naturalWidth) painted("preview");
      else image.addEventListener("load", () => painted("preview"), { once: true });
    }
    if ([...document.querySelectorAll(".example .snapshot svg")].some(fresh)) painted("preview");
    if ([...document.querySelectorAll(".example .live:not(.pending)")].some(fresh)) painted("live");
    if ([...document.querySelectorAll(".example .program .canvas")].some((canvas) => fresh(canvas) && canvas.getAttribute("aria-busy") === "false")) painted("live");
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-busy"] });
  document.addEventListener("DOMContentLoaded", check);
  if (navigator.gpu) {
    const device = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = function (...rest) { mark("gpuStart"); return device.apply(this, rest).then((value) => { mark("gpuDevice"); return value; }); };
    const texture = GPUCanvasContext.prototype.getCurrentTexture;
    GPUCanvasContext.prototype.getCurrentTexture = function () { mark("frame"); return texture.call(this); };
  }
}

async function measure(browser, build, routeName, profile, recordTrace) {
  const base = `${h2 && profile !== "dev" ? "https" : "http"}://127.0.0.1:${build.port}`;
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  await context.addInitScript(observe);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  const cold = !["warm", "nav"].includes(profile);
  await client.send("Network.setCacheDisabled", { cacheDisabled: cold });
  if (["constrained", "warm", "nav"].includes(profile)) await client.send("Network.emulateNetworkConditions", NETWORK);
  if (profile === "cpu4x") await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const route = ROUTES[routeName] ?? routeName, example = !TEXT_ROUTES.has(routeName);
  let origin = 0, before = 0;
  if (!cold) {
    await page.goto(`${base}/docs/start`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector(".example .live.ready") || !navigator.gpu, undefined, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    if (profile === "nav") before = await page.evaluate(() => performance.getEntriesByType("resource").length);
  }
  if (recordTrace) await browser.startTracing(page, { categories: ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline",
    "v8", "v8.execute", "disabled-by-default-v8.cpu_profiler", "blink.user_timing", "loading"] });
  if (profile === "nav") {
    // A client-side navigation: SvelteKit routes clicks on links in its root element.
    origin = await page.evaluate((href) => {
      for (const key of Object.keys(window.__audit.marks)) delete window.__audit.marks[key];
      window.__audit.longtasks.length = 0;
      window.__audit.stale = new Set(document.querySelectorAll(".example"));
      const link = Object.assign(document.createElement("a"), { href });
      document.querySelector("body > div").append(link);
      const time = performance.now();
      link.click();
      return time;
    }, route);
    await page.waitForURL(`**${route}`);
  } else await page.goto(`${base}${route}`, { waitUntil: "load", timeout: profile === "dev" ? 300000 : 120000 });
  const limit = { localhost: 30000, dev: 300000 }[profile] ?? 90000;
  if (example) {
    // An example below the fold goes live when it comes near the viewport: scroll to it.
    const shown = await page.waitForFunction(() => window.__audit.marks.live, undefined, { timeout: 3000 }).then(() => true, () => false);
    if (!shown) await page.evaluate(() => { const example = document.querySelector(".example"); if (example && example.getBoundingClientRect().top > innerHeight) { window.__audit.marks.scrolled = performance.now(); example.scrollIntoView(); } });
    await page.waitForFunction(() => window.__audit.marks.live, undefined, { timeout: limit }).catch(() => errors.push("live: timed out"));
  }
  else await page.waitForFunction(() => window.__audit.marks.fcp !== undefined || document.querySelector("article h1"), undefined, { timeout: limit }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  const result = await page.evaluate(([origin, before]) => {
    const audit = window.__audit, navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource").slice(before).map((entry) => ({ url: new URL(entry.name).pathname,
      type: entry.initiatorType, start: entry.startTime - origin, end: entry.responseEnd - origin, encoded: entry.encodedBodySize,
      transfer: entry.transferSize, decoded: entry.decodedBodySize }));
    const relative = (value) => value === undefined ? undefined : value - origin;
    return { marks: Object.fromEntries(Object.entries(audit.marks).map(([key, value]) => [key, relative(value)])), lcp: origin ? undefined : audit.lcp, cls: audit.cls,
      element: audit.element, longtasks: audit.longtasks.filter(([start]) => start >= origin), resources,
      html: navigation && !origin ? { end: navigation.responseEnd, encoded: navigation.encodedBodySize, dcl: navigation.domContentLoadedEventEnd, load: navigation.loadEventEnd } : null };
  }, [origin, before]);
  let traced = null;
  if (recordTrace) {
    const buffer = await browser.stopTracing();
    if (option("trace-dir")) writeFileSync(path.join(option("trace-dir"), `${build.name}-${routeName}.json`), buffer);
    traced = await summarizeTrace(JSON.parse(buffer.toString()), build.dir);
  }
  await context.close();
  const js = result.resources.filter((r) => r.url.endsWith(".js"));
  const runtime = js.filter((r) => isRuntime(build.dir, r.url));
  const font = result.resources.find((r) => /\.(ttf|woff2?)$/.test(r.url));
  const sum = (list, key = "encoded") => list.reduce((total, r) => total + (r[key] || 0), 0);
  return {
    build: build.name, route: routeName, profile, errors,
    fcp: result.marks.fcp, lcp: result.lcp, preview: result.marks.preview, frame: result.marks.frame, live: result.marks.live, scrolled: result.marks.scrolled,
    gpu: result.marks.gpuDevice !== undefined ? result.marks.gpuDevice - result.marks.gpuStart : undefined, gpuEnd: result.marks.gpuDevice,
    fontStart: font?.start, fontEnd: font?.end,
    requests: result.resources.length, bytes: sum(result.resources), js: sum(js), jsDecoded: sum(js, "decoded"), jsRequests: js.length, cls: result.cls,
    jsBeforeRuntime: sum(js.filter((r) => r.start < Math.min(Infinity, ...runtime.map((x) => x.start)))),
    runtime: sum(runtime), runtimeRequests: runtime.length,
    previewBytes: sum(result.resources.filter((r) => /\/example-builds\/.*(snapshot|preview)[^/]*\.(svg|webp|png)$/.test(r.url))),
    payloadBytes: sum(result.resources.filter((r) => /\/example-builds\/.*payload[^/]*\.json$/.test(r.url))),
    thumbnailBytes: sum(result.resources.filter((r) => THUMBNAIL.test(r.url))), thumbnails: result.resources.filter((r) => THUMBNAIL.test(r.url)).length,
    previewRequest: result.resources.find((r) => /\/example-builds\/.*(snapshot|preview)[^/]*\.(svg|webp|png)$/.test(r.url))?.start,
    longTotal: result.longtasks.reduce((total, [, duration]) => total + duration, 0), longMax: Math.max(0, ...result.longtasks.map(([, d]) => d)),
    html: result.html, resources: result.resources, trace: traced,
  };
}

// ---- Trace summary -----------------------------------------------------------------------------
const ACTIVITY = [
  [/^(v8\.compile|v8\.compileModule|V8\.CompileCode|v8\.produceModuleCache|v8\.parseOnBackground)$/, "script compile"],
  [/^(EvaluateScript|v8\.evaluateModule|v8\.run)$/, "script evaluate"],
  [/^(FunctionCall|TimerFire|EventDispatch|FireAnimationFrame|RunMicrotasks|v8\.callFunction|XHRReadyStateChange|FireIdleCallback)$/, "script (calls)"],
  [/^(ParseHTML|ParseAuthorStyleSheet)$/, "parse HTML/CSS"],
  [/^(UpdateLayoutTree|Layout|RecalculateStyles|HitTest|ScheduleStyleRecalculation)$/, "style and layout"],
  [/^(Paint|PrePaint|Layerize|Commit|UpdateLayer|CompositeLayers|PaintImage|RasterTask)$/, "paint"],
  [/(GC|GarbageCollection|BlinkGC)/, "GC"],
  [/^(Decode Image|ImageDecodeTask|Decode LazyPixelRef|DecodeImage)$/, "image decode"],
];
// A sampled function's source module, through the build's source maps when it has them
// (vite build --sourcemap): a package's name, or a path under src/.
const consumers = new Map();
async function sourceModule(dir, frame) {
  if (!frame.url) return frame.functionName ? `(native) ${frame.functionName}` : "(native)";
  const pathname = new URL(frame.url).pathname, file = path.join(dir, `${pathname}.map`);
  if (!consumers.has(file)) {
    let consumer = null;
    try {
      const { SourceMapConsumer } = await import("source-map-js");
      consumer = existsSync(file) ? new SourceMapConsumer(JSON.parse(readFileSync(file, "utf8"))) : null;
    } catch {}
    consumers.set(file, consumer);
  }
  const consumer = consumers.get(file);
  const source = consumer?.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber })?.source;
  if (!source) return path.basename(pathname);
  const packageName = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source)?.[1];
  return packageName ?? source.replace(/^(\.\.\/)+/, "").replace(/^.*?(src\/)/, "$1");
}
async function summarizeTrace(trace, dir) {
  const events = trace.traceEvents ?? trace;
  const names = new Map();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name);
  const counts = new Map();
  for (const e of events) if (e.ph === "X" && names.get(`${e.pid}:${e.tid}`) === "CrRendererMain") counts.set(`${e.pid}:${e.tid}`, (counts.get(`${e.pid}:${e.tid}`) ?? 0) + 1);
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) return null;
  const list = events.filter((e) => e.ph === "X" && `${e.pid}:${e.tid}` === main && e.dur !== undefined).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // Self times: each event's duration less its children's.
  const stack = [], self = new Map(), tasks = [];
  for (const e of list) {
    while (stack.length && stack.at(-1).ts + stack.at(-1).dur <= e.ts) stack.pop();
    if (stack.length) self.set(stack.at(-1), (self.get(stack.at(-1)) ?? stack.at(-1).dur) - e.dur);
    if (!stack.length && e.name === "RunTask" && e.dur >= 50000) tasks.push(e);
    self.set(e, self.get(e) ?? e.dur);
    stack.push(e);
  }
  const byActivity = (from = -Infinity, to = Infinity) => {
    const totals = {};
    for (const e of list) {
      if (e.ts < from || e.ts >= to) continue;
      const activity = ACTIVITY.find(([pattern]) => pattern.test(e.name))?.[1];
      if (activity) totals[activity] = (totals[activity] ?? 0) + Math.max(0, self.get(e)) / 1000;
    }
    return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v)]));
  };
  // Sampled JavaScript, by function and file, inside the long tasks.
  // The main thread's profile: its Profile event, and the chunks (another thread's) with its id.
  const [pid, tid] = main.split(":").map(Number), nodes = new Map(), samples = [];
  const profile = events.find((e) => e.name === "Profile" && e.pid === pid && e.tid === tid);
  let time = profile?.args.data.startTime ?? 0;
  for (const e of events) {
    if (e.name !== "ProfileChunk" || e.pid !== pid || e.id !== profile?.id) continue;
    const data = e.args.data;
    for (const node of data.cpuProfile?.nodes ?? []) nodes.set(node.id, node);
    (data.cpuProfile?.samples ?? []).forEach((id, i) => { time += data.timeDeltas[i]; samples.push([time, id]); });
  }
  const functions = new Map(), modules = new Map();
  for (let i = 0; i < samples.length - 1; i++) {
    const [t, id] = samples[i];
    if (!tasks.some((task) => t >= task.ts && t < task.ts + task.dur)) continue;
    const frame = nodes.get(id)?.callFrame, ms = (samples[i + 1][0] - t) / 1000;
    const key = frame ? `${frame.functionName || "(anonymous)"} ${frame.url ? path.basename(frame.url) : ""}`.trim() : "?";
    functions.set(key, (functions.get(key) ?? 0) + ms);
    const module = frame ? await sourceModule(dir, frame) : "?";
    modules.set(module, (modules.get(module) ?? 0) + ms);
  }
  const start = list[0].ts;
  return {
    total: byActivity(),
    longTasks: tasks.map((task) => ({ at: Math.round((task.ts - start) / 1000), ms: Math.round(task.dur / 1000), activity: byActivity(task.ts, task.ts + task.dur) })),
    sampled: [...functions].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => [name, Math.round(ms)]),
    modules: [...modules].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, ms]) => [name, Math.round(ms)]),
    measures: events.filter((e) => e.cat?.includes("blink.user_timing") && e.name.startsWith("hmplot:") && e.ph === "b").map((e) => e.name),
  };
}

// ---- The development server (68.5) --------------------------------------------------------------
// --dev name=<checkout> (repeatable): starts `vite dev` there (--vite-config, vite.config.js) on
// --port, and times its start (until it answers), the Points page's first load (its routes and
// modules compile) and second, and with --missing <id> (an example whose build it deletes first)
// that example's reference page, before those, until its preview shows; --stale deletes every
// example's digest first, so the dev server's start rebuilds them all.
// The Python with the package's dependencies, as scripts/build-examples.mjs finds it for a checkout.
function python(dir) {
  for (let folder = dir; folder !== path.dirname(folder); folder = path.dirname(folder))
    if (existsSync(path.join(folder, ".venv", "bin", "python"))) return path.join(folder, ".venv", "bin", "python");
  return "python3";
}
// The dev server running, stopped (its process group) if the script is interrupted.
let devChild;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { try { if (devChild) process.kill(-devChild.pid); } catch {} process.exit(130); });
async function devRun(browser, { name, dir }, run) {
  const builds = path.join(dir, "static", "example-builds"), missing = option("missing");
  if (args.includes("--stale")) for (const entry of readdirSync(builds)) if (existsSync(path.join(builds, entry, "digest"))) rmSync(path.join(builds, entry, "digest"));
  if (missing) rmSync(path.join(builds, missing), { recursive: true, force: true });
  const start = Date.now();
  const child = devChild = spawn("npx", ["vite", "dev", "--config", option("vite-config", "vite.config.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: dir, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHON: process.env.PYTHON ?? python(dir) } });
  // The server's output, with times, when --dev-log names a folder.
  const log = option("dev-log") && path.join(option("dev-log"), `${name}-${run}.log`), lines = [];
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { if (log) lines.push(`${Date.now() - start} ${data}`); });
  try {
    for (;;) {
      if (await fetch(`http://127.0.0.1:${port}/@vite/client`).then((r) => r.ok, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const record = { build: name, run, startup: Date.now() - start };
    console.log(`  ${name}: answering after ${record.startup} ms`);
    const build = { name, dir, port };
    // The missing example first: with --stale its wait is for its build, not the others'.
    for (const [key, route] of [...(missing ? [["missing", `/reference/svelte/${missing.replace(/-basic$/, "")}`]] : []), ["first", "points"], ["second", "points"]]) {
      try {
        const result = await measure(browser, build, route, "dev", false);
        record[key] = { fcp: result.fcp, preview: result.preview, live: result.live, errors: result.errors };
      } catch (error) { record[key] = { errors: [error.message.split("\n")[0]] }; }
    }
    return record;
  } finally {
    process.kill(-child.pid);
    devChild = undefined;
    // A build stopped with the server leaves its lock (scripts/build-examples.mjs) and priorities.
    await new Promise((resolve) => setTimeout(resolve, 500));
    rmSync(path.join(builds, ".lock"), { recursive: true, force: true });
    rmSync(path.join(builds, ".priority"), { force: true });
    if (log) writeFileSync(log, lines.join(""));
  }
}

// ---- The gallery (TODO 69.19, --budget) -----------------------------------------------------------
// The examples page, scrolled to its end: every card's thumbnail loads (a card has none only when
// gallery.json says why), and the cards fetch no live plot: no runtime, payloads or example pages.
let galleryCheck;
async function checkGallery(browser, build) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  const page = await context.newPage(), requests = [], errors = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${build.port}${ROUTES.gallery}`, { waitUntil: "load" });
  for (let y = 0; y < await page.evaluate(() => document.body.scrollHeight); y += 800) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(100);
  }
  await page.waitForLoadState("networkidle");
  const cards = await page.evaluate(() => [...document.querySelectorAll("a.card")].map((card) => {
    const image = card.querySelector("img");
    return { id: card.getAttribute("href").split("/").pop(), image: Boolean(image), loaded: Boolean(image?.complete && image.naturalWidth) };
  }));
  await context.close();
  return { cards, errors, runtime: requests.filter((url) => url.endsWith(".js") && isRuntime(build.dir, url)).length,
    payloads: requests.filter((url) => /\/example-builds\/.*(payload|tree)\.[0-9a-f]+\.json$/.test(url)).length };
}

// ---- Run ------------------------------------------------------------------------------------------
const devs = args.flatMap((value, i) => args[i - 1] === "--dev" ? [value] : []).map((value) => {
  const [name, dir] = value.split("=");
  return { name, dir: path.resolve(dir) };
});
if (devs.length) {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu"] });
  try {
    for (let run = 1; run <= runs; run++) for (const dev of run % 2 ? devs : [...devs].reverse())
      console.log(`DEV ${JSON.stringify(await devRun(browser, dev, run), (key, value) => typeof value === "number" ? Math.round(value) : value)}`);
  } finally { await browser.close(); }
  process.exit(0);
}
const servers = [];
for (const [i, build] of builds.entries()) {
  if (!existsSync(path.join(build.dir, "_app"))) throw Error(`${build.dir} is not a docs build (npm run build).`);
  build.port = port + i;
  servers.push(await serve(build.dir, build.port));
}
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu", ...(h2 ? ["--ignore-certificate-errors"] : [])] });
const records = [];
const kb = (bytes) => bytes === undefined ? "" : `${Math.round(bytes / 1024)}`;
try {
  for (const profile of profiles) for (const route of routes) {
    for (let run = 0; run < runs; run++) for (const build of run % 2 ? [...builds].reverse() : builds) {
      const record = await measure(browser, build, route, profile, false);
      records.push(record);
      console.log(`${profile} ${route} ${build.name} #${run + 1}: fcp ${Math.round(record.fcp ?? NaN)} preview ${Math.round(record.preview ?? NaN)} live ${Math.round(record.live ?? NaN)} js ${kb(record.js)} KB runtime ${kb(record.runtime)} KB${record.errors.length ? ` errors: ${record.errors.join("; ").slice(0, 200)}` : ""}`);
    }
  }
  if (trace) for (const route of routes) for (const build of builds) {
    const record = await measure(browser, build, route, "localhost", true);
    console.log(`\nTRACE ${route} ${build.name}: main thread ms ${JSON.stringify(record.trace?.total)}`);
    for (const task of record.trace?.longTasks ?? []) console.log(`  long task at ${task.at} ms, ${task.ms} ms: ${JSON.stringify(task.activity)}`);
    if (record.trace?.sampled.length) console.log(`  sampled in long tasks: ${record.trace.sampled.map(([n, ms]) => `${n} ${ms}`).join("; ")}`);
    if (record.trace?.modules.length) console.log(`  by source module: ${record.trace.modules.map(([n, ms]) => `${n} ${ms}`).join("; ")}`);
    records.push({ ...record, profile: "trace" });
  }
  if (budget) galleryCheck = await checkGallery(browser, builds[0]);
} finally {
  await browser.close();
  for (const server of servers) server.close();
}

const median = (values) => { const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : undefined; };
const range = (values) => { const v = values.filter((x) => Number.isFinite(x)); return v.length ? [Math.min(...v), Math.max(...v)] : undefined; };
const METRICS = [["fcp", "ms"], ["lcp", "ms"], ["preview", "ms"], ["previewRequest", "ms"], ["scrolled", "ms"], ["frame", "ms"], ["live", "ms"], ["gpu", "ms"], ["fontEnd", "ms"], ["cls", ""],
  ["longTotal", "ms"], ["longMax", "ms"], ["requests", ""], ["bytes", "KB"], ["js", "KB"], ["jsBeforeRuntime", "KB"], ["runtime", "KB"], ["previewBytes", "KB"], ["payloadBytes", "KB"],
  ["thumbnails", ""], ["thumbnailBytes", "KB"]];
console.log("\nMedians (min-max) per profile, route and build:");
for (const profile of profiles) for (const route of routes) for (const build of builds) {
  const group = records.filter((r) => r.profile === profile && r.route === route && r.build === build.name);
  if (!group.length) continue;
  const cells = METRICS.map(([key, unit]) => {
    const values = group.map((r) => r[key]), m = median(values), [lo, hi] = range(values) ?? [];
    if (m === undefined) return null;
    const show = (x) => unit === "KB" ? kb(x) : key === "cls" ? x.toFixed(3) : Math.round(x);
    return `${key} ${show(m)}${lo !== hi ? ` (${show(lo)}-${show(hi)})` : ""}${unit === "KB" ? " KB" : ""}`;
  }).filter(Boolean);
  console.log(`${profile.padEnd(11)} ${route.padEnd(7)} ${build.name.padEnd(8)} n=${group.length} ${cells.join(", ")}`);
}
const out = option("json");
if (out) writeFileSync(out, JSON.stringify(records, null, 1));

// --budget (npm run check:docs-budget, after npm run build): the loading budgets of TODO 68.6 on
// the first build, from the localhost runs: a text page under 300 KB of compressed JavaScript and
// none of the runtime's; the Points page's preview requested before any of the runtime; every
// web preview under 500 KB as a host sends it (SVG gzipped). And TODO 69.19's: the thumbnails the
// home page loads, under 300 KB in all; a typical thumbnail (the median of every example's
// largest image) under 75 KB; every thumbnail the manifests list is on disk; on the examples page,
// every card's thumbnail loads and no card loads the runtime or a scene (checkGallery).
if (args.includes("--budget")) {
  const failures = [], build = builds[0], record = (route) => records.find((r) => r.build === build.name && r.route === route && r.profile === "localhost");
  const intro = record("intro"), points = record("points");
  if (!intro || !points) failures.push("--budget needs the localhost profile and the intro and points routes");
  else {
    if (intro.errors.length) failures.push(`the text page: ${intro.errors[0]}`);
    if (points.errors.length) failures.push(`the Points page: ${points.errors[0]}`);
    if (!Number.isFinite(points.live) || !Number.isFinite(points.frame)) failures.push("the Points page shows no completed live frame");
    if (intro.js > 300 * 1024) failures.push(`a text page loads ${kb(intro.js)} KB of JavaScript (budget 300 KB)`);
    if (intro.runtimeRequests) failures.push(`a text page loads ${intro.runtimeRequests} of the runtime's modules`);
    const runtimeStart = Math.min(...points.resources.filter((r) => isRuntime(build.dir, r.url)).map((r) => r.start));
    if (!(points.previewRequest < runtimeStart)) failures.push(`the Points preview was requested at ${points.previewRequest} ms, the runtime at ${runtimeStart} ms`);
  }
  const manifestFile = path.join(build.dir, "example-builds", "manifest.json");
  if (!existsSync(manifestFile)) failures.push("no example-builds/manifest.json (npm run build:examples)");
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
  for (const [id, { views }] of Object.entries(manifest)) for (const [view, { previews }] of Object.entries(views)) {
    const { src, type } = previews.web, body = readFileSync(path.join(build.dir, "example-builds", src));
    const bytes = type === "image/svg+xml" ? gzipSync(body).length : body.length;
    if (bytes > 500 * 1024) failures.push(`${id}'s ${view} preview sends ${kb(bytes)} KB (budget 500 KB)`);
  }
  // Thumbnails: a program pair's in manifest.json, a gallery program's in gallery.json.
  const galleryFile = path.join(build.dir, "example-builds", "gallery.json");
  const gallery = existsSync(galleryFile) ? JSON.parse(readFileSync(galleryFile, "utf8")) : {};
  for (const [id, record] of Object.entries(gallery)) {
    if (record.skipped) continue;
    if (!record.preview?.src) { failures.push(`${id} has no full-column preview (npm run build:thumbnails)`); continue; }
    for (const [file] of record.preview.srcset ?? [[record.preview.src]]) {
      const location = path.join(build.dir, "example-builds", file);
      if (!existsSync(location)) failures.push(`${id}'s preview ${file} is missing`);
      else if (statSync(location).size > 500 * 1024) failures.push(`${id}'s preview ${file} exceeds 500 KB`);
    }
  }
  const thumbnails = [...Object.entries(manifest).map(([id, record]) => [id, record.views.plot.previews.thumbnail]), ...Object.entries(gallery)]
    .filter(([, record]) => record?.src);
  const largest = [];
  for (const [id, { srcset = [], src }] of thumbnails) {
    const files = srcset.length ? srcset.map(([file]) => file) : [src];
    for (const file of files) if (!existsSync(path.join(build.dir, "example-builds", file))) failures.push(`${id}'s thumbnail ${file} is missing`);
    largest.push(Math.max(...files.map((file) => { try { return statSync(path.join(build.dir, "example-builds", file)).size; } catch { return 0; } })));
  }
  const typical = median(largest) ?? 0, home = record("home");
  console.log(`\nThumbnails: ${thumbnails.length}, typical ${kb(typical)} KB, largest ${kb(Math.max(0, ...largest))} KB; the home page loaded ${home?.thumbnails ?? "?"} for ${kb(home?.thumbnailBytes ?? 0)} KB`);
  if (!thumbnails.length) failures.push("no thumbnails (npm run build:examples and npm run build:thumbnails)");
  if (typical > 75 * 1024) failures.push(`a typical thumbnail is ${kb(typical)} KB (budget 75 KB)`);
  const skipped = new Set(Object.entries(gallery).filter(([, record]) => record.skipped).map(([id]) => id));
  const { cards = [], errors = [], runtime = 0, payloads = 0 } = galleryCheck ?? {};
  console.log(`The examples page: ${cards.length} cards, ${cards.filter((card) => card.loaded).length} thumbnails loaded, ${skipped.size} skipped (gallery.json)`);
  for (const card of cards) if (!card.loaded && !skipped.has(card.id)) failures.push(`the examples page's card ${card.id} shows ${card.image ? "a thumbnail that did not load" : "no thumbnail"}`);
  if (!cards.length) failures.push("the examples page shows no cards");
  if (runtime || payloads) failures.push(`the examples page loads ${runtime} of the runtime's modules and ${payloads} scene payloads`);
  if (errors.length) failures.push(`the examples page: ${errors[0]}`);
  if (!home) failures.push("--budget needs the home route");
  else {
    if (home.errors.length) failures.push(`the home page: ${home.errors[0]}`);
    if (!Number.isFinite(home.live) || !Number.isFinite(home.frame)) failures.push("the home page shows no completed live frame");
    if (home.thumbnailBytes > 300 * 1024) failures.push(`the home page loads ${kb(home.thumbnailBytes)} KB of thumbnails (budget 300 KB)`);
  }
  console.log(failures.length ? `\nBudget: FAILED\n  ${failures.join("\n  ")}` : "\nBudget: passed");
  process.exitCode = failures.length ? 1 : 0;
}
