// Local diagnosis: first interaction versus warmed interactions, with plain and profiled runs.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { installGpuCounters, installGpuErrors, gpuCounters, countersDelta } from '../../browser/gpu-counters.js';

const base = process.env.SUNBURST_URL ?? 'http://127.0.0.1:5488';
const route = process.env.SUNBURST_ROUTE ?? '/examples/sunburst';
const output = process.env.SUNBURST_OUT ?? '/tmp/hmplot-sunburst-profile';
const instrument = process.env.SUNBURST_PROFILE === '1';
const production = process.env.SUNBURST_PRODUCTION === '1';
const cpuProfile = process.env.SUNBURST_CPU === '1' || instrument && process.env.SUNBURST_CPU !== '0';
const operationMode = process.env.SUNBURST_OPS ?? '';
if (!['', 'counts', 'callers'].includes(operationMode)) throw Error('SUNBURST_OPS must be counts or callers.');
const stackEvery = Number(process.env.SUNBURST_OP_STACK_EVERY ?? 16);
if (!Number.isInteger(stackEvery) || stackEvery < 1) throw Error('SUNBURST_OP_STACK_EVERY must be a positive integer.');
// Import the application's module only on the native gallery route. A separately bundled
// Python scene can have a different module/WeakMap and would not expose this same clock.
const trackClock = process.env.SUNBURST_TRACKS === '1' ||
  process.env.SUNBURST_TRACKS !== '0' && route.startsWith('/test/gallery-example');
let sourceFingerprint, sourceVerification;
if (process.env.SUNBURST_SOURCE_ROOT) {
  const hash = createHash('sha256');
  let files = 0;
  const visit = async path => {
    const entries = await readdir(join(process.env.SUNBURST_SOURCE_ROOT, path), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = join(path, entry.name);
      if (entry.isDirectory()) await visit(relative);
      else if (entry.isFile()) { hash.update(relative); hash.update(await readFile(join(process.env.SUNBURST_SOURCE_ROOT, relative))); files++; }
    }
  };
  await visit('src/lib');
  await visit('src/examples/sunburst');
  await visit('vendor/jax-js/dist');
  sourceFingerprint = { sha256: hash.digest('hex'), files };
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  const errors = [];
  const assets = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  if (production && process.env.SUNBURST_SOURCE_ROOT) page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== new URL(base).origin || !url.pathname.endsWith('.js')) return;
    assets.push((async () => {
      const served = await response.body(), path = '.svelte-kit/output/client' + url.pathname;
      const local = await readFile(join(process.env.SUNBURST_SOURCE_ROOT, path));
      return { path, localSHA256: createHash('sha256').update(local).digest('hex'),
        servedSHA256: createHash('sha256').update(served).digest('hex') };
    })());
  });
  await page.addInitScript(installGpuErrors);
  if (instrument) {
    await page.addInitScript(installGpuCounters);
    await page.addInitScript(() => {
      const map = GPUBuffer.prototype.mapAsync;
      window.sunburstReadTraces = [];
      GPUBuffer.prototype.mapAsync = function (mode, ...args) {
        const start = performance.now(), stack = new Error().stack ?? '';
        const promise = map.call(this, mode, ...args);
        if (mode & GPUMapMode.READ) {
          const paths = [...stack.matchAll(/\/src\/lib\/[^\s)]+/g)].map(match => match[0]);
          const source = paths[0] ?? (/mapAsyncRead/.test(stack) ? 'jax asynchronous read' : 'other');
          promise.then(() => window.sunburstReadTraces.push({ start, ms: performance.now() - start, source, paths }), () => {});
        }
        return promise;
      };
    });
  }
  await page.goto(base + route);
  if (process.env.SUNBURST_SOURCE_ROOT && !production) {
    const paths = ['src/lib/plot/bound/namedMark.svelte', 'src/lib/plot/marks/labels.svelte',
      'src/lib/plot/utils/expressions.js', 'src/lib/plot/utils/namedData.js',
      'src/examples/sunburst/sunburst.svelte',
      ...(process.env.SUNBURST_EXTRA_SOURCE_PATHS?.split(',').filter(Boolean) ?? [])];
    const local = await Promise.all(paths.map(async path => ({ path,
      localSHA256: createHash('sha256').update(await readFile(join(process.env.SUNBURST_SOURCE_ROOT, path))).digest('hex') })));
    const served = await page.evaluate(async paths => Promise.all(paths.map(async path => {
      const url = '/' + path + '?raw', response = await fetch(url);
      if (!response.ok) throw Error('Cannot verify served source for ' + path);
      // Downloadable examples can be served as source text rather than JS modules.
      // Keep this URL relative to the app so another checkout's listener cannot
      // satisfy the guard by reading SUNBURST_SOURCE_ROOT through /@fs.
      const body = await response.text();
      const wrapper = /^export default ("(?:[^"\\]|\\.)*")/.exec(body);
      const source = wrapper ? JSON.parse(wrapper[1]) : body;
      if (typeof source !== 'string') throw Error('Expected raw source for ' + path);
      const bytes = new TextEncoder().encode(source), digest = await crypto.subtle.digest('SHA-256', bytes);
      return { path, servedSHA256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') };
    })), paths);
    const files = local.map(entry => ({ ...entry, ...served.find(file => file.path === entry.path) }));
    sourceVerification = { method: 'App-relative Vite raw modules/source downloads compared with local bytes',
      scope: 'Representative source files; this does not fingerprint every executed compiled chunk.',
      verified: files.every(file => file.localSHA256 === file.servedSHA256), files };
    await writeFile(`${output}/source-verification.json`, JSON.stringify(sourceVerification, null, 2));
    if (!sourceVerification.verified) {
      const mismatched = files.filter(file => file.localSHA256 !== file.servedSHA256).map(file => file.path);
      throw Error('Sunburst server does not match SUNBURST_SOURCE_ROOT: ' + mismatched.join(', ') +
        '. Start the intended checkout on an unused strict port before profiling.');
    }
  }
  await page.waitForFunction(() => window.__examples?.plot && document.querySelector('.canvas') &&
    [...document.querySelectorAll('.canvas')].every(canvas => canvas.getAttribute('aria-busy') === 'false'), null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__examples.settle(); await window.__examples.plot.whenAnimationsFinished(); });
  if (production && process.env.SUNBURST_SOURCE_ROOT) {
    const files = await Promise.all(assets);
    sourceVerification = { method: 'Executed production JavaScript responses compared with this snapshot build',
      scope: 'Loaded JavaScript assets; sourceFingerprint records source and fork artifacts separately.',
      verified: files.length > 0 && files.every(file => file.localSHA256 === file.servedSHA256), files };
    await writeFile(`${output}/source-verification.json`, JSON.stringify(sourceVerification, null, 2));
    if (!sourceVerification.verified) throw Error('Production assets do not match the frozen build.');
  }
  if (trackClock) await page.evaluate(async () => {
    const { animationClock } = window.__sunburstRuntime ?? await import('/src/lib/plot/utils/animation.js');
    const marks = window.__examples.plot.getLegendSource().entries().map(handle => handle.guideMark()).filter(Boolean);
    const mark = marks.find(mark => mark.options.presentation?.label === 'Studio workload') ?? marks[0];
    if (!mark?.renderer) throw Error('Native sunburst clock renderer is unavailable.');
    window.sunburstClock = animationClock(mark.renderer);
  });
  if (operationMode) await page.evaluate(async ({ mode, stackEvery }) => {
    const { profiler } = window.__sunburstRuntime ?? await import('/src/lib/jax.js');
    Error.stackTraceLimit = 80;
    const fresh = () => ({ total: 0, primitives: {}, callers: {}, sampledStacks: 0 });
    window.sunburstOperations = { fresh, current: fresh(), seed: 0x719ab42 };
    profiler.setOpHook(primitive => {
      const state = window.sunburstOperations, counts = state.current;
      counts.total++;
      counts.primitives[primitive] = (counts.primitives[primitive] ?? 0) + 1;
      if (mode !== 'callers') return;
      // JIT calls are counted exactly by caller; other primitives use deterministic random
      // sampling to avoid aligning with a repeating operation sequence. These profiled
      // timings are never substituted for plain timings. A JIT bind is one compiled call,
      // not a count of its internal arithmetic, array objects, or dispatched GPU kernels.
      let seed = state.seed;
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      state.seed = seed >>> 0;
      if (primitive !== 'jit' && state.seed % stackEvery !== 0) return;
      const stack = new Error().stack ?? '';
      const application = stack.split('\n').filter(line => line.includes('/src/lib/'))
        .map(line => line.trim().replace(location.origin, '').replace(/\?[^:\s)]+/g, ''));
      const key = primitive + '\n' + (application.slice(0, 8).join('\n') || 'unresolved application caller');
      counts.callers[key] = (counts.callers[key] ?? 0) + 1;
      counts.sampledStacks++;
    });
  }, { mode: operationMode, stackEvery });
  const points = await page.evaluate(async () => {
    const { blob } = await window.__examples.plot.exportSVG({ mode: 'vector' });
    const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
    return Object.fromEntries(['Design', 'Studio'].map(name => {
      const label = [...svg.querySelectorAll('text')].find(text => text.textContent === name);
      if (!label) throw Error('Missing sunburst label ' + name);
      return [name, [Number(label.getAttribute('x')), Number(label.getAttribute('y'))]];
    }));
  });
  const canvas = page.locator('.example canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  const cdp = cpuProfile ? await page.context().newCDPSession(page) : null;
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); }
  const samples = [];
  for (let flight = 0; flight < 6; flight++) {
    const zoom = flight % 2 === 0;
    const before = instrument ? await gpuCounters(page) : null;
    const traceFrom = instrument ? await page.evaluate(() => window.sunburstReadTraces.length) : 0;
    await page.evaluate(() => {
      if (window.sunburstOperations) window.sunburstOperations.current = window.sunburstOperations.fresh();
      const plot = window.__examples.plot;
      // The view's counters; a build before Stage 117.1 keeps them on the renderer as plot* fields.
      const counters = plot.getLegendSource().entries().map(handle => {
        const mark = handle.guideMark(), renderer = mark?.renderer;
        return mark?.view?.diagnostics.counters ?? (renderer && {
          get liveFieldUpdates() { return renderer.plotLiveFieldUpdates; }, get staticMarkReuses() { return renderer.plotStaticMarkReuses; },
          get markPreparations() { return renderer.plotMarkPreparations; }, get numericExpressionCompiled() { return renderer.plotNumericExpressionCompiled; },
          get numericExpressionFallback() { return renderer.plotNumericExpressionFallback; } });
      }).find(Boolean);
      const markWork = () => [counters?.liveFieldUpdates ?? 0, counters?.staticMarkReuses ?? 0,
        counters?.markPreparations ?? 0, counters?.numericExpressionCompiled ?? 0,
        counters?.numericExpressionFallback ?? 0];
      const state = { start: performance.now(), first: plot.getDiagnostics().completedFrame, frames: [], geometry: [],
        tracks: [], clockStart: window.sunburstClock?.time, alive: true, markWork, beforeMarkWork: markWork() };
      window.sunburstFlight = state;
      let last = state.first, lastSignature, lastSample = -Infinity, nextTrackId = 0;
      const identities = new WeakMap();
      const sampleClock = () => {
        const clock = window.sunburstClock;
        if (!clock) return;
        const tracks = [...clock.tracks].map(track => {
          if (!identities.has(track)) identities.set(track, ++nextTrackId);
          const timing = clock.states.get(track) ?? {}, owner = track.owner;
          return { id: identities.get(track), type: track.constructor.name,
            owner: owner?.componentName ?? owner?.constructor?.name ?? null,
            label: owner?.options?.presentation?.label ?? null,
            field: track.output?.name ?? null, procedural: Boolean(track.procedural), explicit: Boolean(track.explicit),
            start: timing.start, duration: timing.duration, deadline: timing.start + timing.duration,
            applied: timing.applied, suspended: timing.suspended };
        });
        const now = performance.now(), signature = JSON.stringify(tracks);
        if (signature !== lastSignature || now - lastSample >= 100) {
          state.tracks.push({ wallMs: now - state.start, time: clock.time, busy: Boolean(clock.busy),
            pending: clock.pending(), tracks });
          lastSignature = signature; lastSample = now;
        }
      };
      state.sampleClock = sampleClock;
      const watch = () => {
        if (!state.alive) return;
        sampleClock();
        const frame = plot.getDiagnostics().completedFrame;
        if (frame !== last) {
          const now = performance.now(), options = plot.getFrames()[0]?.getFrameOptions();
          state.frames.push(now);
          state.geometry.push({ wallMs: now - state.start, frame,
            operations: window.sunburstOperations?.current.total,
            acceptedLiveWrites: counters?.liveFieldUpdates ?? 0,
            xbounds: options?.get('xbounds'), ybounds: options?.get('ybounds') });
          last = frame;
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    if (cdp) {
      await cdp.send('Profiler.start');
      await page.evaluate(() => { window.sunburstFlight.profileStartWallMs = performance.now() - window.sunburstFlight.start; });
    }
    const [x, y] = points[zoom ? 'Design' : 'Studio'];
    await page.mouse.click(bounds.x + x, bounds.y + y);
    await page.waitForFunction(zoom => {
      const mark = window.__examples.plot.getLegendSource().entries()
        .find(handle => handle.entry()?.label === 'Studio workload')?.guideMark();
      // The accepted binding; before Stage 117.2 the interaction sat on the mark object.
      const binding = ((m) => m?.view?.marks?.of(m) ?? m)(mark)?.interaction;
      const rows = binding?.owner ? [...binding.selection.rows(binding.owner)] : null;
      return rows && (zoom ? rows.length === 1 && rows[0] === 1 : rows.length === 0);
    }, zoom);
    await page.evaluate(async () => {
      await window.__examples.settle();
      await window.__examples.plot.whenAnimationsFinished();
      await window.__examples.plot.whenSettled();
      window.sunburstFlight.idleStartWallMs = performance.now() - window.sunburstFlight.start;
    });
    if (process.env.SUNBURST_IDLE_MS) await page.waitForTimeout(Number(process.env.SUNBURST_IDLE_MS));
    const measured = await page.evaluate(() => {
      const state = window.sunburstFlight, plot = window.__examples.plot;
      state.sampleClock();
      state.alive = false;
      const intervals = [state.start, ...state.frames, performance.now()];
      const gaps = intervals.slice(1).map((time, i) => time - intervals[i]).sort((a, b) => a - b);
      return { wallMs: performance.now() - state.start, completedFrames: plot.getDiagnostics().completedFrame - state.first,
        frameP50: gaps[Math.floor(gaps.length * .5)] ?? null, frameP95: gaps[Math.floor(gaps.length * .95)] ?? null,
        maxGap: gaps.at(-1) ?? null, clockStart: state.clockStart, clockStates: state.tracks,
        profileStartWallMs: state.profileStartWallMs, idleStartWallMs: state.idleStartWallMs,
        frameGeometry: state.geometry,
        markWork: Object.fromEntries(["liveGeometryWrites", "staticMarkReuses", "preparationRequests",
          "numericExpressionsCompiled", "numericExpressionsFallback"]
          .map((name, i) => [name, state.markWork()[i] - state.beforeMarkWork[i]])),
        operations: window.sunburstOperations?.current,
        expressionPlans: plot.getDiagnostics().expressionPlans,
        errors: window.__gpuErrors, renderError: plot.getRenderError() };
    });
    const after = instrument ? await gpuCounters(page) : null;
    const gpu = instrument ? await countersDelta(page, before, after) : null;
    let cpu;
    if (cdp) {
      const { profile } = await cdp.send('Profiler.stop');
      await writeFile(`${output}/flight-${flight + 1}.cpuprofile`, JSON.stringify(profile));
      const self = new Map();
      profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
      const nodes = profile.nodes.filter(node => self.has(node.id));
      cpu = nodes.map(node => ({ function: node.callFrame.functionName, url: node.callFrame.url,
        line: node.callFrame.lineNumber + 1, selfMs: (self.get(node.id) ?? 0) / 1000 }))
        .sort((a, b) => b.selfMs - a.selfMs).slice(0, 30);
    }
    const reads = instrument ? await page.evaluate(from => window.sunburstReadTraces.slice(from), traceFrom) : null;
    samples.push({ flight: flight + 1, direction: zoom ? 'zoom' : 'reset', ...measured, gpu, gpuLiveBytes: instrument ? { before: before.liveBytes, after: after.liveBytes } : null, cpu, reads });
    console.log(JSON.stringify(samples.at(-1)));
    if (measured.errors.length || measured.renderError) throw Error('Sunburst rendering error');
  }
  await canvas.screenshot({ path: `${output}/final.png` });
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(`${output}/summary.json`, JSON.stringify({ base, route, instrument, cpuProfile, operationMode, stackEvery, trackClock, sourceFingerprint, sourceVerification, browser: browser.version(),
    note: 'First interaction after a fresh page; shared Metal shader cache is not cleared. Instrumented timings include profiling overhead. Passive native clock samples are CPU pending deadlines, not GPU row start times or GPU execution durations.', samples, errors }, null, 2));
} finally { await browser.close(); }
