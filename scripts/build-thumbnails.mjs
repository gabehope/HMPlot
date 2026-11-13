// npm run build:thumbnails: the gallery's thumbnails for its programs that have no Python pair
// (TODO 69.19). An example with a pair (src/examples/<id>/<id>.py) gets its thumbnail from
// scripts/build_examples.py (PREVIEWS["thumbnail"]); the others are Svelte programs only
// (src/routes/examples/, previewRegistry.js), which this script draws in Chrome with WebGPU on a dev
// server of the site, at the docs' column width (the /test/gallery-example route), with reduced
// motion (every clock at 0, as the builder's exports), and exports through the plot's own export
// panel: a PNG at 2x (a device pixel ratio of 2, the export's scale 1, as a HiDPI screen shows it)
// of the program's largest plot or facet grid (or the one PANELS names; a plot that hides its
// buttons, from its context menu), fitted within 320 x 200 CSS pixels and encoded as WebP at 1x and
// 2x, as the builder's thumbnails are. The same capture also supplies a full-column WebP preview
// (up to 820 x 1200 CSS pixels without upscaling) for the shared Example component.
//
// It writes static/example-builds/gallery/<id>/thumbnail-<width>.<hash>.webp and
// static/example-builds/gallery.json, each example's record by id: src, srcset, type, width and
// height (CSS pixels), bytes, preview (the full-column image), background (the image's top left color, which the card's frame
// matches), panel and digest; or {skipped: reason} for a known failure (KNOWN_FAILURES). An
// example whose program, local data, the library (src/lib and the bundled jax-js) and this script
// are unchanged since its last capture is skipped. A capture that fails (no plot, a page error, no
// export) is reported, writes no image, and makes the script exit with status 1. One capture runs
// at a time per checkout; another waits.
//
//   node scripts/build-thumbnails.mjs [id ...] [--vite-config file] [--port n] [--base url] [--force]
//
// --vite-config defaults to $HM_VITE_CONFIG, else vite.config.js; --port to a free port. --base
// captures from a dev server of the site already running there instead (the docs' dev server asks
// this way for the thumbnails its pages miss: scripts/vite-examples.js, TODO 73.8).
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquire } from "./build-lock.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "static", "example-builds");
const FOLDER = path.join(OUT, "gallery");
const MANIFEST = path.join(OUT, "gallery.json");
// As build_examples.py's PREVIEWS["thumbnail"].
const THUMBNAIL = { width: 320, height: 200, scales: [1, 2], type: "image/webp", quality: 0.8 };
const PREVIEW = { width: 820, height: 1200, scales: [1, 2], type: "image/webp", quality: 0.85, upscale: false };
// The panel a thumbnail shows, when the largest is not the one that says most (here, views that
// stay empty until something is selected): its index among the program's facet grids and plots
// outside one, in the page's order.
const PANELS = { "facet-interactions": 0, "selection-compare": 0 };
// Programs that fail on a known bug, skipped (their cards show text) until it is fixed: id to reason.
// (None now: custom-shapes and frame-mark-families were fixed in TODO 69, part F.)
const KNOWN_FAILURES = {};
// The capture's device pixel ratio and the export's scale: PNGs at 2 pixels per CSS pixel.
const RATIO = 2, SCALE = 1;

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const only = args.filter((value, i) => !value.startsWith("--") && !["--vite-config", "--port", "--base"].includes(args[i - 1]));
const force = args.includes("--force");

// ---- What to capture, and what each depends on ---------------------------------------------------
const { examples } = await import(pathToFileURL(path.join(ROOT, "src/routes/examples/catalog.js")));
const paired = (id) => existsSync(path.join(ROOT, "src", "examples", id, `${id}.py`));
// Each gallery id's program file, from previewRegistry.js's loaders; the others are the gallery's
// first programs, in routes/examples/Example.svelte.
const registry = readFileSync(path.join(ROOT, "src/routes/examples/previewRegistry.js"), "utf8");
const loaders = Object.fromEntries([...registry.matchAll(/^\s*"?([\w-]+)"?:\s*\(\)\s*=>\s*import\(["']\.\/([^"'?]+)["']\)/gm)]
  .map(([, id, file]) => [id, path.join(ROOT, "src/routes/examples", file)]));
const program = (id) => loaders[id] ?? path.join(ROOT, "src/routes/examples/Example.svelte");

const hashFiles = (hash, files) => { for (const file of files) hash.update(path.relative(ROOT, file)).update(readFileSync(file)); };
function walk(dir) {
  if (!existsSync(dir)) return [];
  if (statSync(dir).isFile()) return [dir];
  return readdirSync(dir).sort().flatMap((name) => name.startsWith(".") ? [] : walk(path.join(dir, name)));
}
// What every capture depends on: this script, the library and the bundled jax-js (not the docs'
// own components, src/lib/docs, which only hold the program on the page).
const common = createHash("sha256");
hashFiles(common, [fileURLToPath(import.meta.url), ...walk(path.join(ROOT, "src/lib")).filter((file) => !file.startsWith(path.join(ROOT, "src/lib/docs/"))),
  ...walk(path.join(ROOT, "vendor/jax-js/dist"))]);
const commonDigest = common.digest("hex");

// A program's files: it, what it imports by relative path (its components, data, catalog.js), and
// the static files it names (/data/..., /examples/...; a folder for a path built from a template).
function sources(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file) || !statSync(file).isFile()) return seen;
  seen.add(file);
  if (!/\.(svelte|js|ts)$/.test(file)) return seen;
  const text = readFileSync(file, "utf8");
  for (const [, spec] of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"'?]+)/g))
    sources(path.resolve(path.dirname(file), spec), seen);
  for (const [, url] of text.matchAll(/["'`](\/(?:data|examples)\/[^"'`?#]*)/g)) {
    const fixed = url.split("${")[0];
    for (const found of walk(path.join(ROOT, "static", fixed.endsWith("/") || url.includes("${") ? path.dirname(fixed + "x") : fixed))) seen.add(found);
  }
  return seen;
}
function digest(entry) {
  const hash = createHash("sha256").update(commonDigest).update(JSON.stringify(entry));
  hashFiles(hash, [...sources(program(entry.id))].sort());
  return hash.digest("hex");
}

const gallery = examples.filter((entry) => !paired(entry.id) && !KNOWN_FAILURES[entry.id]);
if (only.length) {
  const missing = only.filter((id) => !gallery.some((entry) => entry.id === id));
  if (missing.length) throw Error(`No gallery program without a Python pair: ${missing.join(", ")}`);
}
// One capture at a time (a lock left by a capture that died is taken over: scripts/build-lock.mjs).
process.on("exit", await acquire(path.join(OUT, ".thumbnails-lock")));
let manifest = {};
try { manifest = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch {}
// Records of examples no longer here (or now paired) go, with their images. A known failure's
// record says why it has no thumbnail.
for (const id of Object.keys(manifest)) if (!gallery.some((entry) => entry.id === id)) {
  delete manifest[id];
  rmSync(path.join(FOLDER, id), { recursive: true, force: true });
}
for (const [id, reason] of Object.entries(KNOWN_FAILURES)) if (examples.some((entry) => entry.id === id) && !paired(id)) {
  console.log(`Thumbnails: skipping ${id} (${reason}).`);
  manifest[id] = { skipped: reason };
}
const digests = new Map(gallery.map((entry) => [entry.id, digest(entry)]));
const stale = gallery.filter((entry) => (!only.length || only.includes(entry.id)) && (force || manifest[entry.id]?.digest !== digests.get(entry.id)));
function writeManifest() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${MANIFEST}.tmp`, JSON.stringify(manifest));
  renameSync(`${MANIFEST}.tmp`, MANIFEST);
}

// ---- In the page ----------------------------------------------------------------------------------
// The program's plots and facet grids, as the Svelte-versus-Python check counts them; the chosen one
// (its index, else the largest drawn) is marked for the export.
function mark(panel) {
  const all = [...document.querySelectorAll(".program .facet-shell, .program section.plot")]
    .filter((element) => !element.parentElement.closest(".facet-shell"));
  const sizes = all.map((element) => { const box = element.getBoundingClientRect(); return box.width * box.height; });
  const index = panel ?? sizes.indexOf(Math.max(...sizes));
  all[index]?.setAttribute("data-thumbnail", "");
  return { count: all.length, index };
}
// A PNG (base64) fitted within the thumbnail's box, at each scale, encoded; and its top left
// pixel's color when opaque (build_examples.py's ENCODE).
async function encode({ png, width, height, scales, type, quality, scale, upscale = true }) {
  const image = new Image();
  image.src = "data:image/png;base64," + png;
  await image.decode();
  const css = [image.width / scale, image.height / scale], fit = Math.min(upscale ? Infinity : 1, width / css[0], height / css[1]);
  const size = [Math.round(css[0] * fit), Math.round(css[1] * fit)];
  const corner = new OffscreenCanvas(1, 1).getContext("2d");
  corner.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, g, b, a] = corner.getImageData(0, 0, 1, 1).data;
  const encoded = [];
  for (const s of scales) {
    const canvas = new OffscreenCanvas(Math.round(size[0] * s), Math.round(size[1] * s)), context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type, quality })).arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    encoded.push([canvas.width, btoa(binary)]);
  }
  return { size, encoded, background: a === 255 ? "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("") : null };
}

async function capture(context, base, entry) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
  try {
    await page.goto(`${base}/test/gallery-example?id=${entry.id}`, { waitUntil: "load", timeout: 120000 });
    // The dev server compiles a program on its first visit. A program that throws shows its error
    // (DocsPage's boundary) instead of plots.
    const plots = page.locator(".program .facet-shell, .program section.plot"), failed = page.locator(".program [role=alert]");
    await plots.or(failed).first().waitFor({ state: "attached", timeout: 90000 });
    if (await failed.count()) throw Error(await failed.first().innerText());
    await page.waitForFunction(() => [...document.querySelectorAll(".program .canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"),
      undefined, { timeout: 60000 });
    await page.evaluate(() => Promise.race([window.__examples?.settle?.(), new Promise((resolve) => setTimeout(resolve, 20000))]));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(300);
    if (errors.length) throw Error(errors[0]);
    const { count, index } = await page.evaluate(mark, PANELS[entry.id]);
    if (!count) throw Error("no plot");
    const target = page.locator("[data-thumbnail]"), canvas = target.locator(".canvas").first();
    await target.scrollIntoViewIfNeeded();
    // Hovering the canvas shows the plot's controls; a corner, so no mark is hovered.
    await canvas.hover({ position: { x: 2, y: 2 } });
    const button = target.getByRole("button", { name: /^Export / }).first();
    if (await button.isVisible()) await button.click();
    else if (await target.evaluate((element) => element.matches("section.plot"))) {
      // A plot that hides its buttons (settings showTrigger: false: earth, guides) exports from
      // its context menu.
      await canvas.click({ button: "right", position: { x: 2, y: 2 } });
      await page.getByRole("menuitem", { name: "Export…" }).click();
    } else throw Error("the facet grid has no export button");
    const panel = page.getByRole("dialog", { name: /^Export · / });
    await panel.getByLabel("Format").selectOption("png");
    await panel.getByLabel("PNG export scale").fill(String(SCALE));
    const download = page.waitForEvent("download", { timeout: 60000 });
    download.catch(() => {});
    await panel.getByRole("button", { name: "Download" }).click();
    // The export's own error, else the download.
    const alert = panel.getByRole("alert");
    const outcome = await Promise.race([download, alert.waitFor({ timeout: 60000 }).then(() => null)]);
    if (!outcome) throw Error(`export: ${await alert.innerText()}`);
    const png = readFileSync(await outcome.path());
    if (errors.length) throw Error(errors[0]);
    const result = await page.evaluate(encode, { png: png.toString("base64"), ...THUMBNAIL, scale: RATIO * SCALE });
    const preview = await page.evaluate(encode, { png: png.toString("base64"), ...PREVIEW, scale: RATIO * SCALE });
    return { ...result, preview, panel: index, panels: count };
  } finally {
    await page.close();
  }
}

function write(entry, result) {
  const folder = path.join(FOLDER, entry.id);
  mkdirSync(folder, { recursive: true });
  const srcset = result.encoded.map(([width, base64]) => {
    const data = Buffer.from(base64, "base64"), name = `thumbnail-${width}.${createHash("sha256").update(data).digest("hex").slice(0, 10)}.webp`;
    if (!existsSync(path.join(folder, name))) writeFileSync(path.join(folder, name), data);
    return [`gallery/${entry.id}/${name}`, width, data.length];
  });
  const previous = manifest[entry.id];
  const previews = result.preview.encoded.map(([width, base64]) => {
    const data = Buffer.from(base64, "base64"), name = `preview-${width}.${createHash("sha256").update(data).digest("hex").slice(0, 10)}.webp`;
    if (!existsSync(path.join(folder, name))) writeFileSync(path.join(folder, name), data);
    return [`gallery/${entry.id}/${name}`, width, data.length];
  });
  manifest[entry.id] = {
    src: srcset.at(-1)[0], srcset: srcset.map(([src, width]) => [src, width]), type: THUMBNAIL.type,
    width: result.size[0], height: result.size[1], bytes: srcset.map(([, , bytes]) => bytes),
    ...(result.background ? { background: result.background } : {}), panel: result.panel, digest: digests.get(entry.id),
    preview: { src: previews.at(-1)[0], srcset: previews.map(([src, width]) => [src, width]), type: PREVIEW.type,
      width: result.preview.size[0], height: result.preview.size[1], bytes: previews.map(([, , bytes]) => bytes), alt: entry.description || entry.title },
  };
  // This capture's images and the previous one's stay (a page loaded just before a rebuild still
  // finds them); older ones go.
  const kept = new Set([manifest[entry.id], previous].flatMap((record) => [...(record?.srcset ?? []), ...(record?.preview?.srcset ?? [])].map(([src]) => path.basename(src))));
  for (const name of readdirSync(folder)) if (!kept.has(name)) rmSync(path.join(folder, name));
  writeManifest();
}

// ---- Run -----------------------------------------------------------------------------------------
async function freePort() {
  return new Promise((resolve) => { const server = createNetServer().listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
}
const failures = [];
if (stale.length) {
  let base = option("base", "").replace(/\/$/, ""), server = null;
  if (!base) {
    const { createServer, searchForWorkspaceRoot } = await import("vite");
    const configFile = path.resolve(ROOT, option("vite-config", process.env.HM_VITE_CONFIG ?? "vite.config.js"));
    const config = (await import(pathToFileURL(configFile))).default;
    const port = Number(option("port", 0)) || await freePort();
    // The site's dev server without the docs' example builder (scripts/vite-examples.js): it serves
    // the programs only. Its pre-bundled dependencies are its own (a folder in the site's cache), so
    // that a dev server running beside it keeps its own (TODO 73.8: a server re-bundling them
    // replaces the files under the other). It also serves node_modules where it really is: a git
    // worktree's can be a link to another checkout's, outside this one (Vite resolves the link,
    // then refuses the files).
    const cacheDir = path.join(path.resolve(ROOT, config.cacheDir ?? "node_modules/.vite"), "thumbnails");
    const allow = [...(config.server?.fs?.allow ?? [searchForWorkspaceRoot(ROOT)]), realpathSync(path.join(ROOT, "node_modules"))];
    server = await createServer({ ...config, configFile: false, root: ROOT, cacheDir, logLevel: "warn",
      plugins: (config.plugins ?? []).filter((plugin) => plugin?.name !== "hmplot-examples"),
      server: { ...config.server, host: "127.0.0.1", port, strictPort: true, fs: { ...config.server?.fs, allow } } });
    await server.listen();
    base = `http://127.0.0.1:${port}`;
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu"] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: RATIO, reducedMotion: "reduce", acceptDownloads: true });
  try {
    for (const [i, entry] of stale.entries()) {
      const start = Date.now();
      try {
        write(entry, await capture(context, base, entry));
        const record = manifest[entry.id];
        console.log(`Thumbnails: captured ${entry.id} (${i + 1}/${stale.length}, panel ${record.panel}, ${record.bytes.map((b) => `${Math.round(b / 1024)} KB`).join(" / ")}, ${((Date.now() - start) / 1000).toFixed(1)} s)`);
      } catch (error) {
        delete manifest[entry.id];
        rmSync(path.join(FOLDER, entry.id), { recursive: true, force: true });
        writeManifest();
        failures.push(`${entry.id}: ${error.message.split("\n")[0]}`);
        console.log(`Thumbnails: failed ${entry.id}`);
      }
    }
  } finally {
    await browser.close();
    await server?.close();
  }
}
writeManifest();
const current = gallery.filter((entry) => !stale.includes(entry) && manifest[entry.id]?.digest === digests.get(entry.id)).length;
console.log(`Thumbnails: ${stale.length - failures.length} captured, ${current} up to date${failures.length ? `, ${failures.length} failed:\n  ${failures.join("\n  ")}` : "."}`);
process.exit(failures.length ? 1 : 0);
