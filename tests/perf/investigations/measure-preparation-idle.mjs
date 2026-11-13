// Complement the phased gesture captures with a genuinely settled idle interval.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { installGpuCounters, installGpuErrors } from '../../browser/gpu-counters.js';

const input = process.env.PREPARATION_CAPTURE;
const output = process.env.PREPARATION_IDLE_OUT;
if (!input || !output) throw Error('Pass PREPARATION_CAPTURE=plain summary.json and PREPARATION_IDLE_OUT=output.json.');
const capture = JSON.parse(await readFile(input));
if (!capture.sourceVerification?.verified) throw Error('Use a source-verified plain capture.');
if (!capture.sourceVerification.method.startsWith('App-relative Vite')) throw Error('Use a development capture for this idle control.');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installGpuErrors);
  await page.addInitScript(installGpuCounters);
  await page.addInitScript(() => {
    window.__preparationAdapters = [];
    const request = GPU.prototype.requestAdapter;
    GPU.prototype.requestAdapter = async function (...args) {
      const adapter = await request.apply(this, args);
      if (adapter) {
        const info = adapter.info;
        window.__preparationAdapters.push({ vendor: info.vendor, architecture: info.architecture,
          device: info.device, description: info.description, isFallbackAdapter: info.isFallbackAdapter });
      }
      return adapter;
    };
  });
  await page.goto(capture.base + capture.route);
  const files = await page.evaluate(async expected => Promise.all(expected.map(async file => {
    const response = await fetch('/' + file.path + '?raw');
    if (!response.ok) throw Error('Cannot verify idle source: ' + file.path);
    const body = await response.text(), wrapper = /^export default ("(?:[^"\\]|\\.)*")/.exec(body);
    const source = wrapper ? JSON.parse(wrapper[1]) : body;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    return { ...file, servedSHA256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
  })), capture.sourceVerification.files);
  const sourceVerification = { ...capture.sourceVerification, files,
    verified: files.every(file => file.localSHA256 === file.servedSHA256) };
  if (!sourceVerification.verified) throw Error('Idle server differs from the reference capture.');
  await page.waitForFunction(() => window.__textAblation?.ready &&
    [...document.querySelectorAll('.canvas')].every(canvas => canvas.getAttribute('aria-busy') === 'false'), null, { timeout: 90000 });
  const bounds = await page.locator('.example canvas').first().boundingBox();
  if (Math.abs(bounds.width - capture.calibration.canvasCSS.width) > .01 ||
      Math.abs(bounds.height - capture.calibration.canvasCSS.height) > .01) throw Error('Calibration size changed.');
  for (const [name, zoom] of [['Design', true], ['Studio', false]]) {
    const [x, y] = capture.calibration.points[name];
    await page.mouse.click(bounds.x + x, bounds.y + y);
    await page.waitForFunction(zoom => {
      const mark = window.__examples.plot.getLegendSource().entries()
        .find(handle => handle.entry()?.label === 'Studio workload')?.guideMark();
      const binding = ((m) => m?.view.marks.of(m))(mark)?.interaction;
      const rows = binding?.owner ? [...binding.selection.rows(binding.owner)] : null;
      return rows && (zoom ? rows.length === 1 && rows[0] === 1 : rows.length === 0);
    }, zoom);
    await page.evaluate(async () => {
      await window.__examples.settle();
      await window.__examples.plot.whenAnimationsFinished();
      await window.__examples.plot.whenSettled();
    });
  }
  // The gesture's settlement boundary can include one final draw; exclude that here.
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => ({ ...window.__gpuCounters.snapshot(),
    frame: window.__examples.plot.getDiagnostics().completedFrame }));
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ ...window.__gpuCounters.snapshot(),
    frame: window.__examples.plot.getDiagnostics().completedFrame }));
  const state = await page.evaluate(() => ({ adapters: window.__preparationAdapters,
    errors: window.__gpuErrors, renderError: window.__examples.plot.getRenderError() }));
  const delta = Object.fromEntries(['buffers', 'bufferBytes', 'liveBytes', 'readbacks', 'submits', 'fences', 'shaders', 'render', 'compute', 'frame']
    .map(key => [key, after[key] - before[key]]));
  const result = { browser: browser.version(), sourceFingerprint: capture.sourceFingerprint,
    sourceVerification, milliseconds: after.time - before.time,
    beforeLiveBytes: before.liveBytes, afterLiveBytes: after.liveBytes, delta, ...state, pageErrors: errors };
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ adapters: state.adapters, delta }));
  if (errors.length || state.errors.length || state.renderError) throw Error('Idle replay had render errors.');
  if (delta.submits || delta.readbacks || delta.buffers || delta.frame) throw Error('Unexpected settled-idle work.');
  if (state.adapters.some(adapter => adapter.isFallbackAdapter)) throw Error('Fallback GPU adapter.');
} finally { await browser.close(); }
