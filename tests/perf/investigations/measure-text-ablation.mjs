// Serial local driver wrapper; arguments/environment select an already frozen served snapshot.
import { spawn } from 'node:child_process';
import { open, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const snapshot = process.env.TEXT_SNAPSHOT;
const base = process.env.SUNBURST_URL;
const output = process.env.TEXT_RESULTS;
if (!snapshot || !base || !output) throw Error('Pass TEXT_SNAPSHOT, SUNBURST_URL and TEXT_RESULTS.');
await mkdir(output, { recursive: true });
const modes = (process.env.TEXT_MODES ?? 'full,no-draw,constant-opacity,no-text,fixed-domains').split(',');
let calibration = process.env.SUNBURST_CLICK_POINTS_FILE;
for (const mode of modes) {
  const folder = join(output, mode);
  const log = await open(join(output, mode + '.log'), 'w');
  const env = { ...process.env, SUNBURST_ROUTE: '/test/sunburst-text-ablation?mode=' + mode,
    SUNBURST_SOURCE_ROOT: snapshot,
    SUNBURST_EXTRA_SOURCE_PATHS: 'src/lib/plot/utils/expressionPlans.js,src/routes/test/sunburst-text-ablation/Sunburst.svelte,src/routes/test/sunburst-text-ablation/+page.svelte',
    SUNBURST_OUT: folder, SUNBURST_TRACKS: '1' };
  if (calibration) env.SUNBURST_CLICK_POINTS_FILE = calibration;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/perf/investigations/sunburst-profile.mjs'],
      { cwd: snapshot, env, stdio: ['ignore', log.fd, log.fd] });
    child.on('error', reject);
    child.on('exit', code => code ? reject(Error(mode + ' exited ' + code + ': inspect ' + join(output, mode + '.log'))) : resolve());
  });
  await log.close();
  if (!calibration) calibration = join(folder, 'click-points.json');
  console.log(mode + ' complete');
}
