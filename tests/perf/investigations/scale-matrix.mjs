// Frozen-source, matched controls for Stage 105. No production option or git mutation.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { installGpuCounters, installGpuErrors } from "../../browser/gpu-counters.js";
import { pixelReader } from "../../browser/png.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const root = process.env.SCALE_MATRIX_ROOT ?? await mkdtemp(join(tmpdir(), "hmplot-scale-matrix-"));
const snapshot = join(root, "snapshot"), port = process.env.SCALE_MATRIX_PORT ?? "5536";
const repetitions = Number(process.env.SCALE_REPS ?? 3), instrument = process.env.SCALE_INSTRUMENT === "1";
const selected = process.env.SCALE_CASES && new RegExp(process.env.SCALE_CASES);
const modes = (process.env.SCALE_MODES ?? "none,reuse,batch,both").split(",");
assert(modes.every(mode => ["none", "reuse", "batch", "both"].includes(mode)));
assert(Number.isInteger(repetitions) && repetitions > 0);
await mkdir(root, { recursive: true });
try { await access(snapshot); throw Error(`Snapshot exists: ${snapshot}. Choose a new SCALE_MATRIX_ROOT.`); }
catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(snapshot);
await new Promise((yes, no) => {
  const archive = spawn("git", ["archive", "HEAD"], { cwd: repository, stdio: ["ignore", "pipe", "inherit"] });
  const tar = spawn("tar", ["-x", "-C", snapshot], { stdio: ["pipe", "inherit", "inherit"] });
  archive.stdout.pipe(tar.stdin); archive.on("error", no); tar.on("error", no);
  archive.on("exit", code => { if (code) no(Error(`git archive exited ${code}`)); });
  tar.on("exit", code => code ? no(Error(`tar exited ${code}`)) : yes());
});
await rm(join(snapshot, "src"), { recursive: true });
await cp(join(repository, "src"), join(snapshot, "src"), { recursive: true });
await symlink(join(repository, "node_modules"), join(snapshot, "node_modules"), "dir");
const route = join(snapshot, "src/routes/test/scale-matrix");
await mkdir(route, { recursive: true });
await cp(new URL("./scale-matrix-fixture.svelte", import.meta.url), join(route, "+page.svelte"));
for (const path of ["static/example-builds", "python/hmplot/static"]) {
  try { await cp(join(repository, path), join(snapshot, path), { recursive: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
let config = await readFile(join(repository, "vite.config.js"), "utf8");
config = config.replace(/\s*examples\(\),?/g, "").replace(/allow:\s*\[([^\]]*)\]/,
  (_, paths) => `allow: [${paths}, ${JSON.stringify(join(repository, "node_modules"))}, ${JSON.stringify(join(repository, "vendor"))}]`);
await writeFile(join(snapshot, "vite.config.js"), config);
// The snapshot alone exposes controls. All variants preserve summaries and publication semantics.
const replace = async (path, before, after) => {
  const file = join(snapshot, path), code = await readFile(file, "utf8");
  assert.equal(code.split(before).length, 2, `Control insertion must match once: ${path}`);
  await writeFile(file, code.replace(before, after));
};
const hashes = {};
for (const path of ["src/lib/plot/utils/extentSummary.js", "src/lib/plot/utils/scaleBindings.js",
  "src/lib/plot/bound/namedMark.svelte", "src/lib/plot/utils/animation.js", "src/routes/test/scale-matrix/+page.svelte"]) {
  hashes[path] = createHash("sha256").update(await readFile(join(snapshot, path))).digest("hex");
}
await replace("src/lib/plot/utils/extentSummary.js", "const eligible = input &&", "const eligible = globalThis.__scaleReuse !== false && input &&");
await replace("src/lib/plot/utils/extentSummary.js", "const maskKey = mutableMask && maskRevision === undefined ? {} : valid ?? NO_MASK;",
  "const maskKey = globalThis.__scaleBatch === false || mutableMask && maskRevision === undefined ? {} : valid ?? NO_MASK;");
await replace("src/lib/plot/bound/namedMark.svelte", "const reuse = inputs && previous?.domainInputs", "const reuse = globalThis.__scaleReuse !== false && inputs && previous?.domainInputs");
const metadata = { hashes, sourceFingerprint: createHash("sha256").update(JSON.stringify(hashes)).digest("hex"),
  instrument, repetitions, modes, pixelComponents: 3, dpr: 2, viewport: { width: 1300, height: 1100 }, snapshot };
await writeFile(join(root, "source.json"), JSON.stringify(metadata, null, 2));
const log = createWriteStream(join(root, "server.log"));
const server = spawn(process.execPath, [join(repository, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { cwd: snapshot, env: { ...process.env, VITE_CACHE_DIR: join(snapshot, ".vite-cache") }, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.pipe(log); server.stderr.pipe(log);
let browser;
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? null;
const scenarios = [
  { name: "filter-small", rows: 128, operation: "filter" },
  { name: "filter-50k", rows: 50000, operation: "filter" },
  { name: "filter-million", rows: 1000000, marks: 2, bounds: "explicit", operation: "filter" },
  { name: "style-50k", rows: 50000, operation: "style" },
  { name: "nested-style", rows: 128, layout: "nested", operation: "style" },
  { name: "facets-shared", rows: 128, layout: "facet-shared", operation: "style" },
  { name: "facets-independent", rows: 128, layout: "facet-independent", operation: "style" },
  { name: "source-domains", rows: 128, source: "1", operation: "filter" },
  { name: "palette-50k", rows: 50000, bounds: "explicit", operation: "palette" },
  { name: "range-50k", rows: 50000, bounds: "explicit", operation: "range" },
  { name: "legend-only", rows: 128, bounds: "explicit", operation: "legend" },
  { name: "animated-appearance", rows: 128, bounds: "explicit", operation: "animated" },
];
const results = [];
try {
  const deadline = Date.now() + 90000, base = `http://127.0.0.1:${port}`;
  while (true) {
    if (server.exitCode !== null) throw Error(`Server exited ${server.exitCode}; inspect ${root}/server.log.`);
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw Error("Private server did not start.");
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu"] });
  metadata.browser = browser.version();
  await writeFile(join(root, "source.json"), JSON.stringify(metadata, null, 2));
  for (const [index, scenario] of scenarios.entries()) {
    if (selected && !selected.test(scenario.name)) continue;
    const ordered = [...modes.slice(index % modes.length), ...modes.slice(0, index % modes.length)];
    let referencePixels, referenceState, referenceMode;
    for (const mode of ordered) {
      const page = await browser.newPage({ viewport: metadata.viewport, deviceScaleFactor: 2 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.addInitScript(({ reuse, batch }) => { window.__scaleReuse = reuse; window.__scaleBatch = batch; },
        { reuse: mode === "reuse" || mode === "both", batch: mode === "batch" || mode === "both" });
      await page.addInitScript(installGpuErrors);
      if (instrument) await page.addInitScript(installGpuCounters);
      const query = new URLSearchParams(Object.entries(scenario).filter(([key]) => key !== "name"));
      await page.goto(`${base}/test/scale-matrix?${query}`);
      await page.waitForFunction(() => window.scaleMatrix?.marks().length &&
        [...document.querySelectorAll(".canvas")].every(canvas => canvas.getAttribute("aria-busy") === "false"), null, { timeout: 120000 });
      await page.evaluate(async () => { await document.fonts.ready; await window.scaleMatrix.settle(); await window.scaleMatrix.finish(); });
      // Facet/legend registration can precede the first accepted data upload. A one-row
      // placeholder is not a ready baseline even when no preparation is currently pending.
      try {
        await page.waitForFunction(() => {
          const fixture = window.scaleMatrix;
          return fixture.read().reduce((sum, mark) => sum + (mark.count ?? 0), 0) /
            fixture.copies === fixture.expectedCount(997);
        }, null, { timeout: 30000 });
      } catch (error) {
        const failure = await page.evaluate(() => ({ state: window.scaleMatrix.read(),
          marks: window.scaleMatrix.marks().map(mark => ({ count: mark.count, filtered: mark.view.marks.of(mark)?.rows.count ?? mark.count })),
          gpuErrors: window.__gpuErrors, alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent) }));
        await writeFile(join(root, `${scenario.name}-${mode}-failure.json`), JSON.stringify({ errors, ...failure }, null, 2));
        await page.locator("body").screenshot({ path: join(root, `${scenario.name}-${mode}-failure.png`) });
        throw error;
      }
      const values = scenario.operation === "filter" ? [100, 40, 0, 997, 30, 997]
        : scenario.operation === "palette" ? ["Inferno", "Viridis", "Magma", "Viridis", "Plasma", "Viridis"]
        : scenario.operation === "range" ? [[2, 8], [2, 5], [1, 6], [2, 5], [3, 10], [2, 5]]
        : scenario.operation === "legend" ? [false, true, false, true, false, true]
        : scenario.operation === "animated" ? [10, 0, 20, 0, 30, 0] : [4, 3, 5, 3, 6, 3];
      const replay = async () => {
        const times = [];
        for (const value of values) {
          const observation = await page.evaluate(async ({ value, operation }) => {
            const fixture = window.scaleMatrix, expected = fixture.expectedCount(value),
              beforeFrame = fixture.frames(), start = performance.now();
            await fixture.set(value); await fixture.settle(); await fixture.finish();
            const prepared = performance.now();
            // Settlement can complete between animation frames. Do not apply the next update
            // before this one draws; otherwise cheap controls coalesce several authored steps.
            if (operation === "legend") await new Promise(requestAnimationFrame);
            else {
              while (fixture.frames() === beforeFrame) {
                if (performance.now() - prepared > 5000) throw Error("Accepted scale update did not draw.");
                await new Promise(requestAnimationFrame);
              }
            }
            const end = performance.now(), state = fixture.read();
            return { ms: end - start, preparationMs: prepared - start,
              count: state.reduce((sum, mark) => sum + (mark.count ?? 0), 0) / fixture.copies,
              expected, errors: state.flatMap(mark => mark.error).filter(Boolean) };
          }, { value, operation: scenario.operation });
          assert.equal(observation.count, observation.expected, `${scenario.name}/${mode}: accepted rows after ${JSON.stringify(value)}`);
          assert.deepEqual(observation.errors, []); times.push(observation);
        }
        return times;
      };
      await replay();
      const samples = [];
      for (let repetition = 0; repetition < repetitions; repetition++) {
        await page.evaluate(() => {
          const fixture = window.scaleMatrix;
          window.__scaleSample = { start: performance.now(), before: fixture.frames(), last: fixture.frames(), times: [], active: true };
          const watch = () => {
            const sample = window.__scaleSample, frame = fixture.frames();
            if (!sample.active) return;
            if (sample.last !== frame) { sample.last = frame; sample.times.push(performance.now()); }
            if (window.__gpuCounters) sample.peakBytes = Math.max(sample.peakBytes ?? 0, window.__gpuCounters.state.liveBytes);
            requestAnimationFrame(watch);
          }; requestAnimationFrame(watch);
        });
        const before = instrument && await page.evaluate(() => window.__gpuCounters.snapshot());
        const feedback = await replay(), feedbackTimes = feedback.map(step => step.ms);
        const data = await page.evaluate(() => {
          window.__scaleSample.active = false;
          return { ...window.__scaleSample, end: performance.now(), after: window.scaleMatrix.frames(), gpuErrors: window.__gpuErrors };
        });
        const gaps = data.times.slice(1).map((time, i) => time - data.times[i]);
        const sample = { repetition: repetition + 1, wallMs: data.end - data.start, completedFrames: data.after - data.before,
          frameP50: percentile(gaps, 0.5), frameP95: percentile(gaps, 0.95),
          feedbackP50: percentile(feedbackTimes, 0.5), feedbackP95: percentile(feedbackTimes, 0.95),
          feedbackSteps: values.map((value, i) => ({ value, ...feedback[i] })),
          errors: [...errors, ...data.gpuErrors] };
        if (instrument) {
          const after = await page.evaluate(() => window.__gpuCounters.snapshot());
          for (const key of ["compute", "render", "shaders", "buffers", "bufferBytes", "readbacks", "submits", "fences"])
            sample[key] = after[key] - before[key];
          sample.liveBytes = after.liveBytes; sample.peakBytes = data.peakBytes;
        }
        assert.deepEqual(sample.errors, []); samples.push(sample);
        console.log(JSON.stringify({ case: scenario.name, mode, instrument, ...sample }));
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await page.locator("body").screenshot({ path: join(root, `${scenario.name}-${mode}.png`) });
      const pixel = pixelReader(png), pixels = [];
      for (let y = 0; y < png.readUInt32BE(20); y += 4) for (let x = 0; x < png.readUInt32BE(16); x += 4) pixels.push(...pixel(x, y));
      const state = await page.evaluate(() => window.scaleMatrix.read().map(({ colorScale, ...rest }) => rest));
      if (referencePixels) {
        assert.deepEqual(state, referenceState, `${scenario.name}: accepted domain/count parity`);
        const differences = pixels.reduce((sum, value, i) => sum + Number(value !== referencePixels[i]), 0);
        if (differences) await writeFile(join(root, `${scenario.name}-${mode}-failure.json`), JSON.stringify({
          reason: "final screenshot parity", referenceMode, mode, differingChannels: differences,
          state, samples, errors, referenceScreenshot: `${scenario.name}-${referenceMode}.png`,
          screenshot: `${scenario.name}-${mode}.png`,
        }, null, 2));
        assert.equal(differences, 0, `${scenario.name}: final screenshot parity`);
      } else { referencePixels = pixels; referenceState = state; referenceMode = mode; }
      results.push({ scenario, mode, samples, state, pixelSamples: pixels.length / 3,
        pixelHash: createHash("sha256").update(Uint8Array.from(pixels)).digest("hex") });
      await writeFile(join(root, "results.json"), JSON.stringify({ ...metadata, results }, null, 2));
      await page.close();
    }
  }
  console.log(`Evidence: ${root}`);
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGTERM"); await stopped;
  }
  log.end();
}
