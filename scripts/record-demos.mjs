// The flagship demos' screen recordings for the README and the announcement (OPEN-SOURCE-PLAN.md,
// R2.11): each demo's gallery page (/examples/<id>) in Chrome with WebGPU at a device pixel ratio of
// 2, driven by a script (sliders dragged, a brush drawn, the globe turned and zoomed) while Chrome
// streams its frames (DevTools' screencast, at CSS-pixel size), cropped to the demo's controls and
// plots and encoded with ffmpeg as an H.264 MP4 and a smaller GIF:
//
//   static/media/<id>.mp4 and static/media/<id>.gif
//
// The globe's map tiles are served from a local folder (--tiles, default a folder in the system's
// temporary directory), so a recording does not depend on the network: a tile missing there is
// downloaded once from VersaTiles and kept, or, with --offline, fails the recording. Run
// `npm run build:examples` first: the paired demos' pages draw their Python builds.
//
//   node scripts/record-demos.mjs [id ...] [--tiles dir] [--offline] [--out dir] [--vite-config file] [--base url]
//
// Without --base it starts a dev server of the site (--vite-config, default $HM_VITE_CONFIG, else
// vite.config.js); --base records from a server already running.
// ffmpeg comes from $FFMPEG, else the PATH (it needs libx264; Playwright's own ffmpeg has only VP8).
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const only = args.filter((value, i) => !value.startsWith("--") && !["--tiles", "--out", "--vite-config", "--base"].includes(args[i - 1]));
const OUT = path.resolve(ROOT, option("out", "static/media"));
const TILES = path.resolve(option("tiles", path.join(tmpdir(), "hmplot-demo-tiles")));
const offline = args.includes("--offline");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const TILE_SERVER = "https://tiles.versatiles.org/tiles/osm/";

// The page at the docs' column width (818 CSS pixels; the frames are CSS-pixel sized). The MP4 is
// the whole recording; the GIF, for the README, a part of it (each demo's `gif`: start and seconds),
// narrower and slower, with fewer colors and no dithering, so it stays a few megabytes.
const VIEWPORT = { width: 1300, height: 1100 };
const GIF = { width: 480, fps: 10, colors: 64 };

/** Animate in the page, every frame for `ms`: set(t) with t from 0 to 1, eased. */
const glide = (page, ms, set) => page.evaluate(({ ms, set }) => new Promise((done) => {
  const apply = new Function("t", set), start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    apply(t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);
    if (t < 1) requestAnimationFrame(tick); else done();
  };
  requestAnimationFrame(tick);
}), { ms, set });
/** In-page source that moves the slider labelled `name` from `from` to `to` at t (0 to 1). */
const slide = (name, from, to) => `{ const el = document.querySelector('input[type="range"][aria-label="${name}"]');
  el.value = String(${from} + (${to} - ${from}) * t); el.dispatchEvent(new Event("input", { bubbles: true })); }`;
const wait = (page, ms) => page.waitForTimeout(ms);

const DEMOS = {
  // 10M points: drag the age range from everything to the youngest stars (the arms), to the oldest
  // (the disk and bar), back, then zoom into the galaxy until single stars show.
  "ten-million-stars": {
    gif: [0.3, 14],
    async play(page, region) {
      await wait(page, 800);
      await glide(page, 2600, slide("Oldest (billion years)", 10, 1));
      await wait(page, 900);
      await glide(page, 2600, `${slide("Youngest (billion years)", 0, 7)} ${slide("Oldest (billion years)", 1, 10)}`);
      await wait(page, 900);
      await glide(page, 1500, slide("Youngest (billion years)", 7, 0));
      // Into an arm, three units from the center, four times closer (the viewport, eased).
      await page.evaluate(() => new Promise((done) => {
        const plot = window.__examples.plot, from = plot.getViewport(), start = performance.now(), ms = 2500;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / ms), e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2, zoom = from.zoom * 4 ** e;
          plot.setViewport({ x: from.x + (0.351 - from.x) * e, y: from.y + (0.482 - from.y) * e, zoom, zoomX: zoom, zoomY: zoom });
          if (t < 1) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      }));
      await wait(page, 1500);
    },
  },
  // A running simulation: start again, then drop dye with a Shift-drag box in the left eddy and
  // watch the flow stretch it; the wobble rises midway.
  "double-gyre": {
    gif: [2, 5],
    async play(page, region) {
      await page.getByRole("button", { name: "Start again" }).click();
      await wait(page, 1800);
      const plot = region.canvases[0];
      await page.keyboard.down("Shift");
      await page.mouse.move(plot.x + plot.width * 0.16, plot.y + plot.height * 0.32);
      await page.mouse.down();
      await page.mouse.move(plot.x + plot.width * 0.26, plot.y + plot.height * 0.62, { steps: 12 });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await wait(page, 5000);
      await glide(page, 1500, slide("Wobble ε", 0.25, 0.45));
      await wait(page, 3500);
    },
  },
  // The globe: turn it by hand, then fly from the whole hemisphere down to Tokyo's streets (the
  // plot's viewport, eased, every frame) while the tiles of each zoom stream in.
  "globe-tiles": {
    tiles: true,
    gif: [2.4, 9],
    async play(page, region) {
      const plot = region.canvases[0], cx = plot.x + plot.width / 2, cy = plot.y + plot.height / 2;
      await wait(page, 800);
      await page.mouse.move(cx + 100, cy);
      await page.mouse.down();
      for (let i = 1; i <= 30; i++) { await page.mouse.move(cx + 100 - 5 * i, cy + 2 * i); await wait(page, 30); }
      await page.mouse.up();
      await wait(page, 1000);
      await page.evaluate(() => new Promise((done) => {
        const plot = window.__examples.plot, from = plot.getViewport(), to = [139.76, 35.68], start = performance.now(), ms = 8500;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / ms), e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
          // The center arrives in the first third; the zoom doubles evenly, eleven times.
          const c = Math.min(1, e * 3), zoom = from.zoom * 2 ** (11 * e);
          plot.setViewport({ ...from, zoom, zoomX: zoom, zoomY: zoom,
            center: [from.center[0] + (to[0] - from.center[0]) * c, from.center[1] + (to[1] - from.center[1]) * c] });
          if (t < 1) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      }));
      await wait(page, 2500);
    },
  },
};

/** The page's demo: its controls and plots, the rectangle around them (CSS pixels), and its canvases. */
async function demoRegion(page) {
  return page.evaluate(() => {
    const host = document.querySelector("section.example .plot");
    // The guidance above the controls is left out: the README and the page say it.
    const rects = [...host.querySelectorAll(".canvas, input, button, select")]
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const canvases = [...host.querySelectorAll(".canvas")].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0).map(({ x, y, width, height }) => ({ x, y, width, height }));
    const outer = host.getBoundingClientRect(), pad = 8;
    const top = Math.min(...rects.map((r) => r.top)) - pad, bottom = Math.max(...rects.map((r) => r.bottom)) + pad;
    return { x: outer.left, y: top, width: outer.width, height: bottom - top, canvases };
  });
}

/** Serve VersaTiles requests from TILES, downloading (unless offline) and keeping a missing tile. */
async function routeTiles(page) {
  const counts = { local: 0, downloaded: 0, missing: 0 };
  await page.route(`${TILE_SERVER}**`, async (route) => {
    const tile = new URL(route.request().url()).pathname.replace("/tiles/osm/", ""), file = path.join(TILES, `${tile}.mvt`);
    if (!existsSync(file)) {
      if (offline) { counts.missing++; return route.fulfill({ status: 404, body: "" }).catch(() => {}); }
      const response = await route.fetch().catch(() => null);
      if (!response?.ok()) { counts.missing++; return route.fulfill({ status: 404, body: "" }).catch(() => {}); }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, await response.body());
      counts.downloaded++;
    } else counts.local++;
    return route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: readFileSync(file) }).catch(() => {});
  });
  return counts;
}

function ffmpeg(...list) {
  const result = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...list], { encoding: "utf8" });
  if (result.error) throw Error(`ffmpeg (${FFMPEG}) did not run: ${result.error.message}. Set $FFMPEG to an ffmpeg with libx264.`);
  if (result.status !== 0) throw Error(`ffmpeg failed: ${result.stderr.trim().split("\n").at(-1)}`);
}

async function record(context, base, id) {
  const demo = DEMOS[id], page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const tiles = demo.tiles ? await routeTiles(page) : null;
  // A dev server compiles the page on its first visit.
  await page.goto(`${base}/examples/${id}`, { waitUntil: "load", timeout: 180000 });
  // A program pair's live scene, or a gallery program's plots, drawn.
  await page.waitForFunction(() => {
    const host = document.querySelector("section.example .plot");
    const canvases = host ? [...host.querySelectorAll(".canvas")] : [];
    const live = host?.querySelector(".live.ready, .program:not(.pending)");
    return live && canvases.length && canvases.every((canvas) => canvas.getAttribute("aria-busy") === "false");
  }, undefined, { timeout: 180000 });
  await page.evaluate(() => window.__examples?.settle?.());
  // The demo at the top of the viewport.
  await page.evaluate(() => window.scrollTo(0, document.querySelector("section.example").getBoundingClientRect().top + window.scrollY - 16));
  await wait(page, 1500);
  const region = await demoRegion(page);
  const cdp = await context.newCDPSession(page), frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ data, time: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  const started = Date.now();
  await demo.play(page, region);
  await cdp.send("Page.stopScreencast");
  const seconds = (Date.now() - started) / 1000;
  await page.close();
  if (errors.length) throw Error(`page error: ${errors[0]}`);
  if (frames.length < 2) throw Error("no frames were captured");

  // The frames as images, each shown until the next one (an ffconcat list with durations).
  const work = mkdtempSync(path.join(tmpdir(), `record-${id}-`));
  try {
    const list = ["ffconcat version 1.0"];
    frames.forEach((frame, i) => {
      const name = `frame-${String(i).padStart(5, "0")}.jpg`;
      writeFileSync(path.join(work, name), Buffer.from(frame.data, "base64"));
      list.push(`file ${name}`, `duration ${((frames[i + 1]?.time ?? frame.time + 1 / 30) - frame.time).toFixed(4)}`);
    });
    list.push(`file frame-${String(frames.length - 1).padStart(5, "0")}.jpg`);
    writeFileSync(path.join(work, "frames.txt"), list.join("\n"));
    const even = (v) => 2 * Math.floor(v / 2);
    const crop = `crop=${even(region.width)}:${even(region.height)}:${Math.round(region.x)}:${Math.round(region.y)}`;
    mkdirSync(OUT, { recursive: true });
    const mp4 = path.join(OUT, `${id}.mp4`), gif = path.join(OUT, `${id}.gif`);
    ffmpeg("-f", "concat", "-safe", "0", "-i", path.join(work, "frames.txt"), "-vf", `${crop},fps=30`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "32", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4);
    const [from, length] = demo.gif;
    ffmpeg("-ss", String(from), "-t", String(length), "-i", mp4, "-vf", `fps=${GIF.fps},scale=${GIF.width}:-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=max_colors=${GIF.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, "-loop", "0", gif);
    const kb = (file) => `${Math.round(statSync(file).size / 1024)} KB`;
    console.log(`Recorded ${id}: ${seconds.toFixed(1)} s, ${frames.length} frames (${(frames.length / seconds).toFixed(0)} a second), ` +
      `${Math.round(region.width)} x ${Math.round(region.height)} CSS px; ${path.relative(ROOT, mp4)} ${kb(mp4)}, ${path.relative(ROOT, gif)} ${kb(gif)}` +
      (tiles ? `; tiles ${tiles.local} local, ${tiles.downloaded} downloaded, ${tiles.missing} missing` : ""));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const ids = only.length ? only : Object.keys(DEMOS);
for (const id of ids) if (!DEMOS[id]) throw Error(`No demo ${id}; the demos are ${Object.keys(DEMOS).join(", ")}.`);
const freePort = () => new Promise((resolve) => { const server = createNetServer().listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
let base = option("base"), server = null;
if (!base) {
  const { createServer } = await import("vite");
  const config = (await import(pathToFileURL(path.resolve(ROOT, option("vite-config", process.env.HM_VITE_CONFIG ?? "vite.config.js"))))).default;
  const port = await freePort();
  // The site's dev server without the docs' example builder: the pages draw the builds on disk.
  server = await createServer({ ...config, configFile: false, root: ROOT, logLevel: "warn",
    plugins: (config.plugins ?? []).filter((plugin) => plugin?.name !== "hmplot-examples"),
    server: { ...config.server, host: "127.0.0.1", port, strictPort: true } });
  await server.listen();
  base = `http://127.0.0.1:${port}`;
}
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu"] });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
let failed = false;
try {
  for (const id of ids) {
    try { await record(context, base, id); }
    catch (error) { failed = true; console.log(`Failed ${id}: ${error.message.split("\n")[0]}`); }
  }
} finally {
  await browser.close();
  await server?.close();
}
process.exit(failed ? 1 : 0);
