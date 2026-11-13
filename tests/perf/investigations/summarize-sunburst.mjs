// Read-only CPU/async-read attribution. No browser or GPU work is launched.
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const input = process.env.SUNBURST_INPUT;
if (!input) throw Error('Pass SUNBURST_INPUT=/path/to/summary.json.');
const bytes = await readFile(input), summary = JSON.parse(bytes);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const round = value => typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor(values.length * p)] ?? null;
const maps = new Map(), sourceMaps = new Map();
const artifactRanges = new Map();
function portable(source) {
  if (!source) return '';
  for (const marker of ['/src/lib/', '/vendor/', '/node_modules/']) {
    const at = source.indexOf(marker);
    if (at >= 0) return source.slice(at + 1).split('?')[0];
  }
  return source.startsWith('http') ? basename(new URL(source).pathname) : source;
}
// Vite/production maps stop at the pinned fork's built JS. Recover function ranges
// from that exact sourcesContent, so private methods and minified names are attributed
// without pretending the fork supplies a TypeScript source map.
function rememberArtifactRanges(source, contents) {
  const file = portable(source);
  if (!file.startsWith('vendor/jax-js/dist/') || !contents || artifactRanges.has(file)) return;
  const ranges = [];
  const add = (group, marker, closing) => {
    let offset = 0;
    while ((offset = contents.indexOf(marker, offset)) >= 0) {
      const end = contents.indexOf(closing, offset + marker.length);
      if (end < 0) break;
      ranges.push({ group, from: contents.slice(0, offset).split('\n').length + 1,
        to: contents.slice(0, end + closing.length).split('\n').length });
      offset = end + closing.length;
    }
  };
  if (file.endsWith('/index.js')) {
    add('JAX array construction', '\n\tconstructor(args) {', '\n\t}');
    add('JAX array construction', '\n\t#newArrayFrom(args) {', '\n\t}');
    add('JAX realization', '\n\t#realize() {', '\n\t}');
    add('JAX hashing', '\nfunction hashArg(', '\n}');
    add('JAX submission CPU', '\n\tsubmit() {', '\n\t}');
  }
  add('JAX indexing descriptions', '\nfunction unravelAlu(', '\n}');
  add('JAX hashing', '\n\tgetHash() {', '\n\t}');
  add('JAX hashing', '\n\thash(state) {', '\n\t}');
  add('JAX submission CPU', '\nfunction pipelineEncode(', '\n}');
  if (/webgpu-[^/]+\.js$/.test(file)) add('JAX submission CPU', '\n\tdispatch(', '\n\t}');
  artifactRanges.set(file, { sha256: sha256(contents), ranges });
}
function artifactGroup(frame) {
  const match = /^(.*):(\d+)$/.exec(frame.source);
  return match && artifactRanges.get(match[1])?.ranges.find(range =>
    Number(match[2]) >= range.from && Number(match[2]) <= range.to)?.group;
}
async function location(frame) {
  if (frame.url.includes('/@fs/') || (process.env.SUNBURST_DEPS && frame.url.includes('/deps/')) ||
    (process.env.SUNBURST_BUILD_MAPS && frame.url.includes('/_app/'))) {
    const file = frame.url.includes('/@fs/') ? frame.url.split('/@fs')[1].split('?')[0]
      : new URL(frame.url).pathname;
    const path = process.env.SUNBURST_BUILD_MAPS && frame.url.includes('/_app/')
      ? join(process.env.SUNBURST_BUILD_MAPS, new URL(frame.url).pathname) + '.map'
      : process.env.SUNBURST_DEPS ? join(process.env.SUNBURST_DEPS, basename(file) + '.map') : file + '.map';
    if (!maps.has(path)) {
      maps.set(path, (async () => {
        try {
          const bytes = await readFile(path), raw = JSON.parse(bytes);
          sourceMaps.set(basename(path), sha256(bytes));
          raw.sources.forEach((source, index) => rememberArtifactRanges(source, raw.sourcesContent?.[index]));
          return new TraceMap(raw);
        }
        catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
      })());
    }
    const map = await maps.get(path);
    if (map && frame.lineNumber >= 0 && frame.columnNumber >= 0) {
      const original = originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber });
      if (original.source) return `${portable(original.source)}:${original.line}`;
    }
  }
  return `${portable(frame.url)}:${frame.lineNumber + 1}`;
}
const flights = [];
for (const flight of summary.samples) {
  const readGroups = new Map();
  for (const read of flight.reads ?? []) {
    const source = read.source.split(':')[0];
    const caller = read.paths.find(path => !path.includes('/dataView.js:') && !path.includes('/picking/'));
    const key = portable(caller ?? source);
    if (!readGroups.has(key)) readGroups.set(key, []);
    readGroups.get(key).push(read.ms);
  }
  const cpuFile = join(dirname(input), `flight-${flight.flight}.cpuprofile`);
  let cpu;
  try {
    const bytes = await readFile(cpuFile), profile = JSON.parse(bytes);
    const nodes = new Map(profile.nodes.map(node => [node.id, node])), parents = new Map(), times = new Map();
    for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
    profile.samples.forEach((id, index) => times.set(id, (times.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0)));
    const locations = new Map();
    await Promise.all(profile.nodes.map(async node => locations.set(node.id, await location(node.callFrame))));
    const path = id => {
      const frames = [];
      for (let i = 0; id && i < 32; i++, id = parents.get(id)) {
        const node = nodes.get(id);
        frames.push({ function: node.callFrame.functionName, source: locations.get(id) });
      }
      return frames;
    };
    const self = [...times].sort((a, b) => b[1] - a[1]).map(([id, micros]) => ({
      selfMs: round(micros / 1000), ...path(id)[0], callers: path(id).slice(1, 6),
    }));
    // Each sample is assigned once. A transpiler helper inherits its closest mapped package
    // caller; the attribution describes the CPU call chain, not a GPU duration.
    const categories = {};
    const focusInclusive = {}, focusNearest = {};
    const inSourceRange = (frame, file, from, to) => {
      const match = new RegExp(file.replaceAll('.', '\\.') + ':(\\d+)$').exec(frame.source);
      return match && Number(match[1]) >= from && Number(match[1]) <= to;
    };
    // Mapped source ranges survive production minification. Groups remain inclusive,
    // describe synchronous CPU callers, and must not be summed as a GPU critical path.
    const focus = frame => artifactGroup(frame) ?? (/(numericExpressions|expressionPlans)\.js/.test(frame.source) || frame.function === 'evaluateExpression'
      ? 'target expression evaluation'
      : /vendor\/jax-js\//.test(frame.source) && (frame.function === 'unravelAlu' || inSourceRange(frame, 'shape.ts', 642, 675)) ? 'JAX indexing descriptions'
      : /vendor\/jax-js\//.test(frame.source) && inSourceRange(frame, 'frontend/array.ts', 682, 740) ? 'JAX realization'
      : /vendor\/jax-js\//.test(frame.source) && inSourceRange(frame, 'frontend/array.ts', 186, 212) ? 'JAX array construction'
      : /vendor\/jax-js\//.test(frame.source) && (['getHash', 'hashArg'].includes(frame.function) || inSourceRange(frame, 'alu.ts', 356, 381)) ? 'JAX hashing'
      : frame.source.includes('threeExtensions/array/arraytexture.js') ? 'array field target publication'
      : frame.source.includes('utils/proputils.js') ? 'buffered field preparation'
      : frame.source.includes('utils/animation.js') ? 'transition clock and dispatch'
      : frame.function === 'prepareNamed' || frame.source.includes('utils/namedData.js') ? 'named channel preparation'
      : ['readEntryDomains', 'readDomains', 'preparePhysicalDomains', 'domainFields'].includes(frame.function) ? 'domain preparation'
      : /marks\/labels\.svelte|labelAtlas\.js|labelBounds\.js/.test(frame.source) ? 'Text atlas and footprint preparation'
      : ['keyedLifecycle', 'keyedFrame', 'rowUnion', 'transitionRows'].includes(frame.function) ? 'keyed lifecycle'
      : /treeHost\.js|treeLifecycle\.js|utils\/tree\.js/.test(frame.source) ? 'Tree host orchestration'
      : frame.source.includes('tweenState.js') ? 'Tween evaluation'
      : frame.source.includes('proceduralChannels.js') ? 'procedural current fields'
      : /channelAnimation\.js|markAnimation\.js|field\.js|keyedField\.js/.test(frame.source) ? 'mark field animation'
      : frame.source.includes('transforms/filter.js') ? 'Filter' : null);
    for (const [id, micros] of times) {
      const frames = path(id), leaf = frames[0];
      const packageFrame = frames.find(frame => /^(vendor\/jax-js|node_modules\/svelte|node_modules\/three|src\/lib)\//.test(frame.source));
      const category = /^\(idle\)|^\(program\)|^\(garbage collector\)/.test(leaf.function) ? leaf.function
        : packageFrame?.source.startsWith('vendor/jax-js/') ? 'jax-js CPU construction/dispatch'
        : packageFrame?.source.startsWith('node_modules/svelte/') ? 'Svelte CPU/dev runtime'
        : packageFrame?.source.startsWith('node_modules/three/') ? 'Three CPU runtime'
        : packageFrame?.source.startsWith('src/lib/') ? 'HMPlot CPU runtime' : 'other/unresolved';
      categories[category] = (categories[category] ?? 0) + micros / 1000;
      // Inclusive synchronous call chains can overlap. Nearest selected frames assign each
      // matched sample once; neither measure includes async work whose caller stack is lost.
      const selected = frames.map(focus).filter(Boolean);
      for (const name of new Set(selected)) focusInclusive[name] = (focusInclusive[name] ?? 0) + micros / 1000;
      if (selected.length) focusNearest[selected[0]] = (focusNearest[selected[0]] ?? 0) + micros / 1000;
    }
    cpu = { profileSHA256: sha256(bytes), sampledMs: round([...times.values()].reduce((a, b) => a + b, 0) / 1000),
      categories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, round(value)])),
      focusSamples: {
        inclusiveMs: Object.fromEntries(Object.entries(focusInclusive).map(([key, value]) => [key, round(value)])),
        nearestMs: Object.fromEntries(Object.entries(focusNearest).map(([key, value]) => [key, round(value)])),
        limitation: 'Synchronous sampled call chains only, at most 32 frames; inclusive groups overlap and async resumes may lose their application callers.',
      },
      topSelf: self.slice(0, 12), synchronousReadCallers: [...times.keys()].filter(id => nodes.get(id).callFrame.functionName === 'getImageData').map(path) };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const episodes = new Map();
  for (const state of flight.clockStates ?? []) for (const track of state.tracks) {
    const prior = episodes.get(track.id);
    if (!prior) episodes.set(track.id, { ...track, firstWallMs: round(state.wallMs), lastWallMs: round(state.wallMs),
      firstClockTime: round(state.time), lastClockTime: round(state.time), deadlineResets: 0, initialDeadline: round(track.deadline) });
    else {
      if (track.start !== prior.start) prior.deadlineResets++;
      Object.assign(prior, track, { lastWallMs: round(state.wallMs), lastClockTime: round(state.time) });
    }
  }
  const distinctGeometry = [];
  for (const sample of flight.frameGeometry ?? []) {
    const previous = distinctGeometry.at(-1);
    if (!previous || JSON.stringify([sample.xbounds, sample.ybounds]) !==
      JSON.stringify([previous.xbounds, previous.ybounds])) distinctGeometry.push(sample);
  }
  const changedBounds = Math.max(0, distinctGeometry.length - 1);
  const geometryInterval = changedBounds ? distinctGeometry.at(-1).wallMs - distinctGeometry[0].wallMs : null;
  const geometryProgress = { changedBounds, sampledMotionMs: round(geometryInterval),
    updatesPerSecond: geometryInterval > 0 ? round(changedBounds * 1000 / geometryInterval) : null,
    firstGeometryMs: round(distinctGeometry[0]?.wallMs ?? null),
    lastChangedGeometryMs: round(distinctGeometry.at(-1)?.wallMs ?? null),
    limitation: 'Changes of sampled drawn x/y bounds, excluding initial geometry; not total fade frames or GPU execution time.' };
  const acceptedWrites = [];
  for (const sample of flight.frameGeometry ?? []) {
    if (typeof sample.acceptedLiveWrites !== 'number') continue;
    if (sample.acceptedLiveWrites !== acceptedWrites.at(-1)?.acceptedLiveWrites) acceptedWrites.push(sample);
  }
  const sampledWriteChanges = Math.max(0, acceptedWrites.length - 1);
  const writeInterval = sampledWriteChanges ? acceptedWrites.at(-1).wallMs - acceptedWrites[0].wallMs : null;
  const publicationProgress = acceptedWrites.length ? {
    sampledChanges: sampledWriteChanges, sampledMotionMs: round(writeInterval),
    updatesPerSecond: writeInterval > 0 ? round(sampledWriteChanges * 1000 / writeInterval) : null,
    limitation: 'Changes of accepted Rect live-write counter observed on completed frames, excluding its initial value; works for fixed domains but is a publication proxy rather than a GPU duration.',
  } : null;
  flights.push({ flight: flight.flight, direction: flight.direction, wallMs: round(flight.wallMs), completedFrames: flight.completedFrames,
    frameP50: round(flight.frameP50), frameP95: round(flight.frameP95), maxGap: round(flight.maxGap), gpu: flight.gpu,
    asyncReads: Object.fromEntries([...readGroups].map(([key, values]) => [key, { count: values.length,
      p50Ms: round(quantile(values, .5)), p95Ms: round(quantile(values, .95)), maxMs: round(Math.max(...values)),
      overlappingWaitSumMs: round(values.reduce((a, b) => a + b, 0)) }])),
    cpu, clockStart: flight.clockStart, trackEpisodes: [...episodes.values()],
    frameGeometry: flight.frameGeometry ?? null, geometryProgress, publicationProgress,
    markWork: flight.markWork ?? null, textWork: flight.textWork ?? null,
    operations: flight.operations ?? null, expressionPlans: flight.expressionPlans ?? null,
    errors: flight.errors, renderError: flight.renderError });
}
const result = { label: process.env.SUNBURST_LABEL ?? 'sunburst-diagnostic', route: summary.route, instrument: summary.instrument,
  cpuProfile: summary.cpuProfile ?? summary.instrument, operationMode: summary.operationMode ?? '',
  stackEvery: summary.stackEvery ?? null,
  browser: summary.browser, summarySHA256: sha256(bytes), sourceFingerprint: summary.sourceFingerprint ?? null,
  sourceVerification: summary.sourceVerification ?? null,
  sourceMapFingerprints: Object.fromEntries(sourceMaps),
  artifactRanges: Object.fromEntries(artifactRanges),
  limitations: ['CPU samples and CPU conservative pending deadlines do not measure GPU execution or GPU row start times.',
    'Operation hooks count frontend primitive binds; one jit bind is one compiled call, not its internal arithmetic or dispatched kernels. JIT caller stacks are exact; other caller stacks are sampled at stackEvery and must not be treated as exact totals.',
    'Async read waits overlap; their sums are not a critical-path total. Callers lost across async boundaries stay unresolved.',
    'Historical diagnostic runs without sourceFingerprint must not be assigned later snapshot hashes.',
    'The historical a3667d1d baseline lacks mark lifecycle fades; comparisons with it are behavior-confounded. A later correctness baseline must retain the same fade targets and durations.'],
  flights, errors: summary.errors };
const output = process.env.SUNBURST_SUMMARY_OUT;
if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
else process.stdout.write(JSON.stringify(result, null, 2) + '\n');
