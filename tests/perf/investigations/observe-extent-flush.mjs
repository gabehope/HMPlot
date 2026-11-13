// Temporary source-only extent batching diagnosis. No server or browser is started here.
import { spawn } from 'node:child_process';
import { access, cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = process.env.SOURCE_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = process.env.FLUSH_SNAPSHOT;
if (!output) throw Error('Pass FLUSH_SNAPSHOT=/new/private/snapshot/path.');
const port = process.env.FLUSH_PORT ?? '5509';
try { await access(output); throw Error(`Snapshot already exists: ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
await new Promise((resolve, reject) => {
  const archive = spawn('git', ['archive', 'HEAD'], { cwd: repository, stdio: ['ignore', 'pipe', 'inherit'] });
  const tar = spawn('tar', ['-x', '-C', output], { stdio: ['pipe', 'inherit', 'inherit'] });
  archive.stdout.pipe(tar.stdin);
  archive.on('error', reject); tar.on('error', reject);
  archive.on('exit', code => { if (code) reject(Error(`git archive exited ${code}`)); });
  tar.on('exit', code => code ? reject(Error(`tar exited ${code}`)) : resolve());
});
await symlink(join(repository, 'node_modules'), join(output, 'node_modules'), 'dir');
for (const path of ['src']) {
  await rm(join(output, path), { recursive: true, force: true });
  await cp(join(repository, path), join(output, path), { recursive: true });
}
for (const path of ['static/example-builds', 'python/hmplot/static']) {
  try { await cp(join(repository, path), join(output, path), { recursive: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const path of ['package.json', 'svelte.config.js', 'tsconfig.json'])
  await cp(join(repository, path), join(output, path));
let config = await readFile(join(repository, 'vite.config.js'), 'utf8');
config = config.replace(/\s*examples\(\),?/g, '');
config = config.replace(/allow:\s*\[([^\]]*)\]/,
  (_, paths) => `allow: [${paths}, ${JSON.stringify(join(repository, 'node_modules'))}]`);
await writeFile(join(output, 'vite.config.js'), config);

const traceHeader = `
// Temporary observer: host timestamps/identities only, no GPU queries or retained arrays.
const flushTrace = typeof window === "undefined" ? null : (window.__hmExtentFlushTrace = {
  events: [], next: 0, ids: new WeakMap(),
});
const traceIdentity = value => {
  if (!flushTrace || !value || typeof value !== "object") return null;
  if (!flushTrace.ids.has(value)) flushTrace.ids.set(value, ++flushTrace.next);
  return flushTrace.ids.get(value);
};
const traceEvent = event => {
  if (!flushTrace) return;
  flushTrace.events.push({ at: performance.now(), ...event });
  if (flushTrace.events.length > 10000) flushTrace.events.splice(0, 1000);
};
let traceFlush = 0;
`;
const path = join(output, 'src/lib/plot/utils/extentSummary.js');
const original = await readFile(path, 'utf8');
let source = original.replace('const NO_MASK = {}, UNSCOPED = {};', traceHeader + '\nconst NO_MASK = {}, UNSCOPED = {};');
source = source.replace('    await Promise.all([...ready.values()].flatMap((masks) => [...masks.values()]).map(async (requests) => {', `    const flush = ++traceFlush;
    for (const [owner, masks] of ready) traceEvent({ type: "flush", flush,
      owner: traceIdentity(owner), groups: masks.size,
      requests: [...masks.values()].reduce((n, requests) => n + requests.length, 0) });
    await Promise.all([...ready.values()].flatMap((masks) => [...masks.values()]).map(async (requests) => {
      const group = ++traceFlush;
      traceEvent({ type: "read-start", flush, group, owner: requests[0].traceOwner,
        mask: requests[0].traceMask, requests: requests.length,
        columns: requests.map(request => ({ array: traceIdentity(request.array), shape: request.array.shape,
          column: request.column, transform: request.transform, arrived: request.traceArrived })) });`);
source = source.replace('        requests.forEach((request, i) => request.resolve(extents[i]));', `        traceEvent({ type: "read-end", flush, group, status: "fulfilled" });
        requests.forEach((request, i) => request.resolve(extents[i]));`);
source = source.replace('        requests.forEach((request) => request.reject(error));', `        traceEvent({ type: "read-end", flush, group, status: "rejected", message: String(error) });
        requests.forEach((request) => request.reject(error));`);
source = source.replace('        if (previous && same(previous.revision, revision)) return previous.work;', `        if (previous && same(previous.revision, revision)) {
          traceEvent({ type: "cache-hit", owner: traceIdentity(batch), mask: traceIdentity(valid),
            array: traceIdentity(input), column, transform });
          return previous.work;
        }`);
source = source.replace('      requests.push({ array, valid: heldMask, column, transform, resolve, reject });', `      const traceArrived = performance.now(), traceOwner = traceIdentity(batch), traceMask = traceIdentity(valid);
      requests.push({ array, valid: heldMask, column, transform, resolve, reject,
        traceArrived, traceOwner, traceMask });
      traceEvent({ type: "arrival", owner: traceOwner, mask: traceMask,
        array: traceIdentity(input), column, transform });`);
if (source === original || !source.includes('type: "read-start"') || !source.includes('traceArrived, traceOwner, traceMask'))
  throw Error('Extent observer patch did not match the frozen source.');
await writeFile(path, source);

const driverPath = 'tests/perf/investigations/sunburst-profile.mjs';
await mkdir(join(output, 'tests/perf/investigations'), { recursive: true });
await mkdir(join(output, 'tests/browser'), { recursive: true });
await cp(join(repository, 'tests/browser/gpu-counters.js'), join(output, 'tests/browser/gpu-counters.js'));
let driver = await readFile(join(repository, driverPath), 'utf8');
driver = driver.replace('beforeMarkWork: markWork() };', 'beforeMarkWork: markWork(), extentFrom: window.__hmExtentFlushTrace?.events.length ?? 0 };');
driver = driver.replace('errors: window.__gpuErrors, renderError: plot.getRenderError() };',
  'extentFlush: window.__hmExtentFlushTrace?.events.slice(state.extentFrom) ?? [],\n        errors: window.__gpuErrors, renderError: plot.getRenderError() };');
if (!driver.includes('extentFlush: window.__hmExtentFlushTrace')) throw Error('Profile observer patch did not match.');
await writeFile(join(output, driverPath), driver);
await writeFile(join(output, 'EXTENT-FLUSH-SNAPSHOT.json'), JSON.stringify({ repository,
  source: 'git archive HEAD plus exact current src (including removed consumers)',
  extentSourceSHA256: createHash('sha256').update(original).digest('hex'),
  observerSHA256: createHash('sha256').update(source).digest('hex'),
  limitation: 'Diagnostic observer timings include record allocation; do not use for a matched speed claim.',
  startServer: `VITE_CACHE_DIR=${output}/.vite-cache node ${repository}/node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
  profile: `SUNBURST_URL=http://127.0.0.1:${port} SUNBURST_ROUTE='/test/gallery-example?id=sunburst' SUNBURST_SOURCE_ROOT=${output} SUNBURST_EXTRA_SOURCE_PATHS=src/lib/plot/utils/extentSummary.js SUNBURST_OUT=${output}/results SUNBURST_PROFILE=0 node ${output}/${driverPath}`,
}, null, 2));
console.log(output);
