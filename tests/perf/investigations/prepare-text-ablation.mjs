// Private diagnostic snapshot only. No browser/server or production edits.
import { spawn } from 'node:child_process';
import { access, cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const source = process.env.TEXT_SOURCE_ROOT;
const output = process.env.TEXT_SNAPSHOT;
const reference = process.env.TEXT_BASE_REF ?? 'HEAD';
if (!source || !output) throw Error('Pass TEXT_SOURCE_ROOT=frozen source and TEXT_SNAPSHOT=new snapshot.');
try { await access(output); throw Error('Use a fresh TEXT_SNAPSHOT.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
await new Promise((resolve, reject) => {
  const archive = spawn('git', ['archive', reference], { cwd: source, stdio: ['ignore', 'pipe', 'inherit'] });
  const tar = spawn('tar', ['-x', '-C', output], { stdio: ['pipe', 'inherit', 'inherit'] });
  archive.stdout.pipe(tar.stdin);
  archive.on('error', reject); tar.on('error', reject);
  archive.on('exit', code => { if (code) reject(Error('Archive failed')); });
  tar.on('exit', code => code ? reject(Error('Extraction failed')) : resolve());
});
if (process.env.TEXT_USE_COMMITTED_SOURCE !== '1') {
  await rm(join(output, 'src'), { recursive: true, force: true });
  await cp(join(source, 'src'), join(output, 'src'), { recursive: true });
}
// Measure the data layer separately from dependent mark preparation on identical drivers.
if (process.env.TEXT_STAGE === '109') {
  for (const path of ['src/lib/plot/bound/namedMark.svelte', 'src/lib/plot/marks/labels.svelte',
    'src/lib/plot/utils/labelAtlas.js', 'src/lib/plot/utils/liveGeometry.js',
    'src/lib/plot/utils/proceduralChannels.js']) {
    const bytes = await new Promise((resolve, reject) => {
      const child = spawn('git', ['show', reference + ':' + path], { cwd: source });
      const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk));
      child.on('error', reject);
      child.on('exit', code => code ? reject(Error('Read committed source failed: ' + path)) : resolve(Buffer.concat(chunks)));
    });
    await writeFile(join(output, path), bytes);
  }
}
for (const path of ['package.json', 'svelte.config.js', 'tsconfig.json']) await cp(join(source, path), join(output, path));
for (const path of ['static/example-builds', 'python/hmplot/static']) {
  try { await cp(join(source, path), join(output, path), { recursive: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await symlink(join(source, 'node_modules'), join(output, 'node_modules'), 'dir');
let config = await readFile(join(source, 'vite.config.js'), 'utf8');
config = config.replace(/\s*examples\(\),?/g, '');
// Freeze the fork too: a later local rebuild cannot alter an already measured snapshot.
config = config.replace('resolve: {', `resolve: { alias: { "@hmplot/jax": ${JSON.stringify(join(output, 'vendor/jax-js/dist/index.js'))} },`);
config = config.replace('build: {', 'build: { sourcemap: true,');
config = config.replace(/allow:\s*\[([^\]]*)\]/, (_, paths) => `allow: [${paths}, ${JSON.stringify(join(source, 'node_modules'))}]`);
await writeFile(join(output, 'vite.config.js'), config);
const route = 'src/routes/test/sunburst-text-ablation';
await mkdir(join(output, route), { recursive: true });
const scalesRoute = 'src/routes/test/investigation-scales';
await mkdir(join(output, scalesRoute), { recursive: true });
await cp(join(source, 'tests/perf/investigations/scales-fixture.svelte'), join(output, scalesRoute, '+page.svelte'));
let fixture = await readFile(join(output, 'src/examples/sunburst/sunburst.svelte'), 'utf8');
const originalFixture = fixture;
function replace(before, after) {
  if (!fixture.includes(before)) throw Error('Fixture insertion mismatch: ' + before.slice(0, 70));
  fixture = fixture.replace(before, after);
}
replace('let { onready } = $props(),', 'let { onready, ablationMode = "full", fixedDomains } = $props(),');
replace('x={{ padding: 0 }}', 'x={fixedDomains ? { padding: 0, domain: fixedDomains.x } : { padding: 0 }}\n  y={fixedDomains ? { domain: fixedDomains.y } : undefined}');
replace('bind:this={sectors}\n            x0=', 'bind:this={sectors}\n            name="sectors"\n            x0=');
const labels = `        <Filter where={greater(col.depth, 0)}>
          <Text x="x" y="y" text="name" color="#ffffff" size={12}
            opacity={animate(where(labelShown, 1, 0), { duration: 650, enter: 0, exit: 0 })}
            enterEffect={fade} exitEffect={fade} />
        </Filter>`;
replace(labels, `        {#if ablationMode !== "no-text"}
          <Filter where={greater(col.depth, 0)}>
            <Text name="branch-labels" x="x" y="y" text="name" color="#ffffff" size={12}
              visible={ablationMode !== "no-draw"}
              opacity={ablationMode === "constant-opacity" ? 1 : animate(where(labelShown, 1, 0), { duration: 650, enter: 0, exit: 0 })}
              enterEffect={fade} exitEffect={fade} />
          </Filter>
        {/if}`);
replace('<Text x={0} y={0} text="name"', '<Text name="center-label" x={0} y={0} text="name"');
await writeFile(join(output, route, 'Sunburst.svelte'), fixture);
await writeFile(join(output, route, '+page.svelte'), `<script>
  import { tick } from "svelte";
  import { animationClock } from "$lib/plot/utils/animation.js";
  import { profiler } from "$lib/jax.js";
  import Sunburst from "./Sunburst.svelte";
  const mode = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("mode") ?? "full";
  if (!["full", "constant-opacity", "no-text", "fixed-domains", "no-draw"].includes(mode)) throw Error("Unknown Text ablation mode.");
  if (typeof window !== "undefined") { window.__textAblationCounters = {}; window.__sunburstRuntime = { animationClock, profiler }; }
  let fixedDomains = $state.raw(), preparing = false;
  async function ready(plot) {
    if (!plot || preparing) return; preparing = true;
    window.__textAblation = { mode, ready: false, initialDomains: null, fixedDomains: null };
    const settle = async () => { await tick(); await plot.whenSettled(); };
    window.__examples = { plot, settle };
    while (!plot.getFrames()?.length || !document.querySelector(".canvas") || [...document.querySelectorAll(".canvas")].some(canvas => canvas.getAttribute("aria-busy") !== "false")) await new Promise(requestAnimationFrame);
    await settle(); await plot.whenAnimationsFinished(); await settle();
    const options = plot.getFrames()[0].getFrameOptions();
    const initial = { x: [...options.get("xbounds")], y: [...options.get("ybounds")] };
    window.__textAblation.initialDomains = initial;
    if (mode === "fixed-domains") {
      fixedDomains = initial;
      await settle(); await plot.whenAnimationsFinished(); await settle();
      window.__textAblation.fixedDomains = initial;
    }
    window.__textAblation.ready = true;
  }
</script>
<main><h1>Text diagnostic: {mode}</h1><div class="example"><Sunburst onready={ready} ablationMode={mode} {fixedDomains} /></div></main>
<style>main { width: 820px; margin: 24px auto; } h1 { font: 18px system-ui; } .example { width: 100%; border: 1px solid #dce2e6; box-sizing: border-box; background: white; }</style>
`);
const hashes = [];
const target = join(output, 'src/lib/plot/bound/namedMark.svelte');
let mark = await readFile(target, 'utf8');
const originalMark = mark;
const counter = `  // Private integer counters: no timestamps, promises, retained arrays, or GPU reads.
  function textAblationCount(phase, count = 1) {
    const counts = globalThis.__textAblationCounters;
    if (!counts) return;
    const key = phase + ":" + kind + ":" + (values.name ?? "unnamed");
    counts[key] = (counts[key] ?? 0) + count;
  }
`;
mark = mark.replace('  const domainOwner = crypto.randomUUID();', counter + '  const domainOwner = crypto.randomUUID();');
mark = mark.replace('    counters.markPreparations++;', '    counters.markPreparations++;\n    textAblationCount("requests");');
mark = mark.replace('      next = prepareNamed(', '      textAblationCount("full-prepares");\n      next = prepareNamed(');
mark = mark.replace('      counters.liveFieldUpdates++;', '      counters.liveFieldUpdates++;\n      textAblationCount("live-writes");');
mark = mark.replace('        counters.staticMarkReuses++;', '        counters.staticMarkReuses++;\n        textAblationCount("static-reuses");');
mark = mark.replace('  async function readDomains(collected, valid, props = null, markOptions = null) {', '  async function readDomains(collected, valid, props = null, markOptions = null) {\n    textAblationCount(collected.length ? "domains" : "skipped-domains");\n    if (collected.length) textAblationCount("domain-fields", collected.reduce((sum, axis) => sum + axis.fields.length, 0));');
for (const phase of ['requests', 'full-prepares', 'live-writes', 'static-reuses', 'domain-fields']) if (!mark.includes(`textAblationCount("${phase}"`)) throw Error('Counter insertion mismatch: ' + phase);
await writeFile(target, mark);
const sha = value => createHash('sha256').update(value).digest('hex');
hashes.push({ path: 'src/lib/plot/bound/namedMark.svelte', originalSHA256: sha(originalMark), diagnosticSHA256: sha(mark) });
// Copy the latest maintained driver; application source verification never executes source.
let driver = await readFile(join(source, 'tests/perf/investigations/sunburst-profile.mjs'), 'utf8');
function patch(before, after) {
  if (!driver.includes(before)) throw Error('Driver insertion mismatch: ' + before.slice(0, 65));
  driver = driver.replace(before, after);
}
patch("  await visit('src/examples/sunburst');", `  await visit('src/examples/sunburst');\n  await visit('${route}');`);
patch("  await page.waitForFunction(() => window.__examples?.plot", "  await page.waitForFunction(() => window.__textAblation?.ready && window.__examples?.plot");
patch('  const points = await page.evaluate(async () => {', '  const calibrationFile = process.env.SUNBURST_CLICK_POINTS_FILE;\n  const calibration = calibrationFile ? JSON.parse(await readFile(calibrationFile, "utf8")) : null;\n  const points = calibration?.points ?? await page.evaluate(async () => {');
patch('  const cdp = cpuProfile ?', `  if (calibration && (Math.abs(bounds.width - calibration.canvasCSS.width) > .01 || Math.abs(bounds.height - calibration.canvasCSS.height) > .01)) throw Error("Ablation canvas size differs from calibrated control.");
  if (!calibration) await writeFile(output + "/click-points.json", JSON.stringify({ points, canvasCSS: { width: bounds.width, height: bounds.height } }, null, 2));
  const controls = await page.evaluate(() => window.__textAblation);
  const cdp = cpuProfile ?`);
patch('flight < 6;', 'flight < Number(process.env.SUNBURST_FLIGHTS ?? 8);');
patch('beforeMarkWork: markWork() };', 'beforeMarkWork: markWork(), beforeTextWork: { ...window.__textAblationCounters } };');
patch('        errors: window.__gpuErrors, renderError: plot.getRenderError() };', `        textWork: Object.fromEntries(Object.entries(window.__textAblationCounters ?? {}).map(([key, value]) => [key, value - (state.beforeTextWork[key] ?? 0)])),
        errors: window.__gpuErrors, renderError: plot.getRenderError() };`);
patch('sourceFingerprint, sourceVerification, browser: browser.version(),', 'sourceFingerprint, sourceVerification, controls, calibration: { points, canvasCSS: { width: bounds.width, height: bounds.height } }, browser: browser.version(),');
await mkdir(join(output, 'tests/perf/investigations'), { recursive: true });
await cp(join(source, 'tests/browser/gpu-counters.js'), join(output, 'tests/browser/gpu-counters.js'));
await writeFile(join(output, 'tests/perf/investigations/sunburst-profile.mjs'), driver);
const metadata = { source, route: '/test/sunburst-text-ablation', originalFixtureSHA256: sha(originalFixture), fixtureSHA256: sha(fixture), instrumentedFiles: hashes,
  variants: ['full', 'constant-opacity', 'no-text', 'fixed-domains', 'no-draw'],
  limitations: ['Diagnostic image coverage and alpha differ across modes.', 'Draw-only attribution requires matching full Text preparation/domain counts first.', 'Only integer counters are enabled in plain runs.', 'All variants share final numeric compiler, Tree inputs and topology, sector selection, center Text and legend.'] };
await writeFile(join(output, 'TEXT-ABLATION.json'), JSON.stringify(metadata, null, 2));
console.log(output);
