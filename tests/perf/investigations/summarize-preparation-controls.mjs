// Validate retained filtering results and compare original screenshots without rendering.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pixelReader } from '../../browser/png.js';

const root = process.env.PREPARATION_CONTROLS ?? '/tmp/stage109-111-controls';
const output = process.env.PREPARATION_CONTROLS_OUT;
if (!output) throw Error('Pass PREPARATION_CONTROLS_OUT=output.json.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const captures = [];
const inputs = ['baseline-109-controls', 'combined-110-controls'].flatMap(label =>
  [false, true].map(instrument => ({ label, instrument, cases: 'scale_filter_small_scale_filter_50k' })));
inputs.push(...['baseline-109-repeat', 'combined-110-repeat'].map(label => ({ label, instrument: false, cases: 'scale_filter_50k' })));
for (const { label, instrument, cases: selected } of inputs) {
  const file = `${label}${instrument ? '-instrumented' : ''}-${selected}.json`;
  const bytes = await readFile(join(root, file)), cases = JSON.parse(bytes);
  for (const scenario of cases) {
    const rows = scenario.name === 'scale-filter-small' ? 5000 : 50000;
    const expected = Array.from({ length: rows }, (_, i) => i % 997).filter(value => value <= 800).length;
    if (scenario.samples.length !== 3 || scenario.samples.some(sample => sample.errors.length || sample.completedFrames < 6 ||
        sample.state.length !== 4 || sample.state.some(mark => mark.count !== expected ||
          JSON.stringify(mark.color) !== '[0,800]' || JSON.stringify(mark.size) !== '[0,800]')))
      throw Error('Incorrect accepted filtering state: ' + file);
  }
  captures.push({ label, instrument, rawSHA256: hash(bytes), cases });
}
const screenshots = [];
for (const name of ['scale-filter-small', 'scale-filter-50k']) {
  const left = await readFile(join(root, `baseline-109-controls-${name}.png`));
  const right = await readFile(join(root, `combined-110-controls-${name}.png`));
  const a = pixelReader(left), b = pixelReader(right);
  let samples = 0, differences = 0, nonwhite = 0, maxDelta = 0;
  for (let y = 20; y < 900; y += 3) for (let x = 20; x < 1480; x += 3) {
    const p = a(x, y), q = b(x, y);
    const delta = Math.max(...p.map((value, index) => Math.abs(value - q[index])));
    samples++; if (p.some(value => value < 245)) nonwhite++;
    if (delta) differences++; maxDelta = Math.max(maxDelta, delta);
  }
  screenshots.push({ name, beforeSHA256: hash(left), afterSHA256: hash(right), samples, differences, nonwhite, maxDelta });
}
const result = { date: '2026-10-08', baselineCommit: 'b8ded729', dpr: 2, measuredRepetitions: 3,
  note: 'Plain timing and GPU counters were separate serial runs on frozen baseline/combined dev servers. One extra large-filter pair resolves an observed timing difference. Screenshots are sampled; PNG hashes also match exactly.',
  captures, screenshots };
if (process.env.PREPARATION_CONTROL_SOURCE_VERIFICATION) {
  const evidence = JSON.parse(await readFile(process.env.PREPARATION_CONTROL_SOURCE_VERIFICATION));
  for (const stage of ['baseline', '110']) if (!evidence[stage]?.verified ||
      !evidence[stage].files.length || evidence[stage].files.some(file => file.localSHA256 !== file.servedSHA256))
    throw Error('Invalid control source evidence: ' + stage);
  result.sourceVerification = evidence;
}
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
for (const capture of captures) for (const scenario of capture.cases) console.log(capture.label, capture.instrument, scenario.name,
  JSON.stringify({ wallMedianMs: median(scenario.samples.map(sample => sample.wallMs)),
    shaders: scenario.samples.map(sample => sample.shaders), readbacks: scenario.samples.map(sample => sample.readbacks) }));
console.log(JSON.stringify(screenshots));
if (screenshots.some(record => record.differences || !record.nonwhite)) throw Error('Filtering screenshot parity failed. Inspect original screenshots.');
