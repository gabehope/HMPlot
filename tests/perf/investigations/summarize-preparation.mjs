// Postprocess separate, completed captures. This script runs no browser or GPU work.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cpus, totalmem, platform, arch } from 'node:os';

const root = process.env.PREPARATION_RESULTS ?? '/private/tmp';
const output = process.env.PREPARATION_SUMMARY_OUT;
if (!output) throw Error('Pass PREPARATION_SUMMARY_OUT=output.json.');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const phaseNames = ['changing-bounds', 'retirement', 'settled-idle'];
const conditions = [];

function averageRecord(flights, field) {
  const keys = [...new Set(flights.flatMap(flight => Object.keys(flight[field] ?? {})))];
  return Object.fromEntries(keys.map(key => [key, mean(flights.map(flight => flight[field]?.[key] ?? 0))]));
}

for (const name of (await readdir(root)).sort()) {
  const match = /^hmplot-final-(baseline|109|110|111)-(dev|prod)-(plain|cpu|ops|gpu)-(\d+)$/.exec(name);
  if (!match) continue;
  const [, stage, mode, capture, repeat] = match;
  const directory = join(root, name);
  const bytes = await readFile(join(directory, 'full/summary.json'));
  const raw = JSON.parse(bytes);
  if (!raw.sourceVerification?.verified || raw.errors.length) throw Error('Invalid source or errors: ' + name);
  const compact = capture === 'cpu' ? JSON.parse(await readFile(join(directory, 'compact.json'))) : null;
  const flights = [];
  for (const flight of raw.samples) {
    if (flight.errors.length || flight.renderError) throw Error('Bad render: ' + name);
    let previous, lastChange = 0;
    const changes = [];
    for (const geometry of flight.frameGeometry) {
      const signature = JSON.stringify([geometry.xbounds, geometry.ybounds]);
      if (previous !== undefined && previous !== signature) {
        lastChange = geometry.wallMs;
        changes.push(geometry.wallMs);
      }
      previous = signature;
    }
    const idleStart = flight.idleStartWallMs ?? flight.wallMs;
    const gaps = changes.map((time, index) => time - (changes[index - 1] ?? 0)).sort((a, b) => a - b);
    const geometryUpdateGapP95 = gaps[Math.floor(gaps.length * .95)] ?? null;
    // Accepted domain changes are an observable proxy, not a GPU/layout timestamp.
    const phaseAt = time => time <= lastChange ? 'changing-bounds' : time < idleStart ? 'retirement' : 'settled-idle';
    const phases = Object.fromEntries(phaseNames.map(key => [key, { wallMs: 0, completedFrames: 0, activeCpuMs: capture === 'cpu' ? 0 : null }]));
    phases['changing-bounds'].wallMs = lastChange;
    phases.retirement.wallMs = idleStart - lastChange;
    phases['settled-idle'].wallMs = flight.wallMs - idleStart;
    for (const geometry of flight.frameGeometry) phases[phaseAt(geometry.wallMs)].completedFrames++;
    const cpu = compact?.flights.find(entry => entry.flight === flight.flight)?.cpu;
    if (cpu) {
      const profile = JSON.parse(await readFile(join(directory, 'full', `flight-${flight.flight}.cpuprofile`)));
      const nodes = new Map(profile.nodes.map(node => [node.id, node]));
      let cursor = flight.profileStartWallMs ?? 0;
      profile.samples.forEach((id, index) => {
        const milliseconds = (profile.timeDeltas[index] ?? 0) / 1000;
        cursor += milliseconds;
        if (!['(idle)', '(program)'].includes(nodes.get(id).callFrame.functionName))
          phases[phaseAt(cursor)].activeCpuMs += milliseconds;
      });
    }
    flights.push({
      flight: flight.flight, warmup: flight.flight <= 2, direction: flight.direction,
      wallMs: flight.wallMs, completedFrames: flight.completedFrames, frameP95: flight.frameP95,
      maxGap: flight.maxGap, geometryUpdateGapP95, textWork: flight.textWork, markWork: flight.markWork,
      operations: flight.operations && { total: flight.operations.total, primitives: flight.operations.primitives },
      gpu: flight.gpu, gpuLiveBytes: flight.gpuLiveBytes,
      cpu: cpu && { categories: cpu.categories, focusSamples: cpu.focusSamples }, phases,
    });
  }
  const warmed = flights.filter(flight => !flight.warmup);
  if (warmed.length !== 10) throw Error('Expected five measured pairs: ' + name);
  const average = Object.fromEntries(['wallMs', 'completedFrames', 'frameP95', 'maxGap', 'geometryUpdateGapP95']
    .map(key => [key, mean(warmed.map(flight => flight[key]))]));
  for (const field of ['textWork', 'markWork']) average[field] = averageRecord(warmed, field);
  if (capture === 'cpu') {
    average.cpu = averageRecord(warmed.map(flight => flight.cpu), 'categories');
    average.activeCpuMs = Object.entries(average.cpu).filter(([key]) => !['(idle)', '(program)'].includes(key))
      .reduce((sum, [, value]) => sum + value, 0);
    average.focusInclusive = averageRecord(warmed.map(flight => flight.cpu.focusSamples), 'inclusiveMs');
  }
  if (capture === 'ops') {
    const keys = ['total', ...new Set(warmed.flatMap(flight => Object.keys(flight.operations.primitives)))];
    average.operations = Object.fromEntries(keys.map(key => [key,
      mean(warmed.map(flight => key === 'total' ? flight.operations.total : flight.operations.primitives[key] ?? 0)),
    ]));
  }
  if (capture === 'gpu') {
    average.gpu = Object.fromEntries(['buffers', 'bufferKB', 'readbacks', 'submits', 'shaders', 'render', 'compute', 'fences']
      .map(key => [key, mean(warmed.map(flight => flight.gpu[key] ?? 0))]));
    average.readbackKinds = averageRecord(warmed.map(flight => flight.gpu), 'readbackKinds');
    average.gpuLiveBytes = mean(warmed.map(flight => flight.gpuLiveBytes?.after ?? 0));
  }
  average.phases = Object.fromEntries(phaseNames.map(phase => [phase,
    Object.fromEntries(['wallMs', 'completedFrames', 'activeCpuMs']
      .map(key => [key, key === 'activeCpuMs' && capture !== 'cpu' ? null : mean(warmed.map(flight => flight.phases[phase][key]))])),
  ]));
  conditions.push({ stage, mode, capture, repeat: Number(repeat), rawSummarySHA256: hash(bytes),
    sourceFingerprint: raw.sourceFingerprint, browser: raw.browser, sourceVerification: raw.sourceVerification,
    sourceMapFingerprints: compact?.sourceMapFingerprints, artifactRanges: compact?.artifactRanges, mean: average, flights });
}

// Backend acceptance uses active-gesture CPU, excluding the settled-idle interval.
const backendComparisons = [];
for (const mode of ['dev', 'prod']) for (const repeat of [2, 3]) {
  const find = stage => conditions.find(condition => condition.stage === stage &&
    condition.mode === mode && condition.capture === 'cpu' && condition.repeat === repeat);
  const baseline = find('110'), candidate = find('111');
  if (!baseline || !candidate) throw Error(`Missing backend comparison: ${mode} ${repeat}`);
  const active = condition => condition.mean.phases['changing-bounds'].activeCpuMs + condition.mean.phases.retirement.activeCpuMs;
  const before = active(baseline), after = active(candidate), saved = before - after;
  const percent = 100 * saved / before;
  backendComparisons.push({ mode, repeat, beforeCpuMs: before, afterCpuMs: after,
    savedCpuMs: saved, savedPercent: percent, qualifies: saved >= 1 && percent >= 10 });
}
if (conditions.length !== 34) throw Error(`Expected 34 separate captures, found ${conditions.length}.`);
const idleControls = [];
if (process.env.PREPARATION_IDLE_RESULTS) for (const stage of ['baseline', '110']) {
  const bytes = await readFile(join(process.env.PREPARATION_IDLE_RESULTS, `stage109-111-${stage}-idle.json`));
  const capture = JSON.parse(bytes);
  if (!capture.sourceVerification?.verified || capture.errors.length || capture.pageErrors.length || capture.renderError ||
      capture.delta.submits || capture.delta.readbacks || capture.delta.buffers || capture.delta.frame)
    throw Error('Invalid settled-idle control: ' + stage);
  idleControls.push({ stage, rawSHA256: hash(bytes), ...capture });
}
const result = {
  date: '2026-10-08', machine: { cpu: cpus()[0]?.model ?? 'unknown', memoryBytes: totalmem(),
    platform: platform(), arch: arch(), dpr: 2, adapters: idleControls[0]?.adapters },
  baselineCommit: 'b8ded729', warmupPairs: 1, measuredPairs: 5, conditions,
  idleControls,
  backendDecision: { minimumPercent: 10, minimumMilliseconds: 1, metric: 'active gesture sampled CPU excluding settled idle',
    comparisons: backendComparisons, retain: backendComparisons.every(pair => pair.qualifies) },
  limitations: [
    'Inspector disabled, DPR 2. Plain timings, CDP CPU sampling, frontend primitive hooks, and GPU counters are separate serial runs with no concurrent builds or suites.',
    'Completed frames and intervals cover setup, changing geometry, retirement and 200 ms of settled idle; they are not animation-only FPS or GPU pass timings.',
    'Changing-bounds phase ends at the last accepted domain change, a host-observed proxy for layout geometry. Retirement includes final publication and fades; CPU phase boundaries have CDP/page alignment uncertainty.',
    'CPU package categories come from mapped synchronous samples. Inclusive focus groups overlap and async resumes can lose callers. Active CPU excludes (idle) and (program), includes GC.',
    'Frontend primitive binds do not equal GPU dispatches. The per-mapping 16 MiB cache cap excludes descriptors and shared sources; live GPU bytes are distinct and exclude textures.',
    'GPU compute/render counters count created pipelines, not dispatched passes. Allocated buffer KB are rounded per flight by the existing counter helper.',
    'Frozen benchmark configurations and bundles were not modified. Copies used for native measurements have diagnostic counters and isolated caches.',
  ],
};
await writeFile(output, JSON.stringify(result, (_, value) => typeof value === 'number' ? Math.round(value * 1000) / 1000 : value, 2) + '\n');
for (const condition of conditions) console.log(condition.stage, condition.mode, condition.capture, condition.repeat, JSON.stringify({
  cpuMs: condition.mean.activeCpuMs, frameP95: condition.mean.frameP95,
  fullText: condition.mean.textWork['full-prepares:Text:branch-labels'],
  liveText: condition.mean.textWork['live-writes:Text:branch-labels'],
  ops: condition.mean.operations?.total, gpu: condition.mean.gpu,
}));
console.log('Backend decision:', JSON.stringify(result.backendDecision));
