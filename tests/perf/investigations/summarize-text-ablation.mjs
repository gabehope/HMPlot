// Read-only: summarize existing compact traces; never launches Chrome or GPU work.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const plain = process.env.TEXT_PLAIN_RESULTS;
const instrumented = process.env.TEXT_INSTRUMENTED_RESULTS;
const output = process.env.TEXT_SUMMARY_OUT;
if (!plain || !instrumented || !output)
  throw Error('Pass TEXT_PLAIN_RESULTS, TEXT_INSTRUMENTED_RESULTS and TEXT_SUMMARY_OUT.');
const sha = value => createHash('sha256').update(value).digest('hex');
const modes = ['full', 'no-draw', 'constant-opacity', 'no-text', 'fixed-domains'];
const conditions = [];
for (const kind of ['plain', 'instrumented']) {
  for (const mode of modes) {
    if (kind === 'instrumented' && mode === 'no-draw') continue;
    const root = kind === 'plain' ? plain : instrumented;
    const bytes = await readFile(join(root, mode, 'compact.json'));
    const data = JSON.parse(bytes);
    if (data.errors?.length || !data.sourceVerification?.verified)
      throw Error(`Invalid source verification or GPU errors: ${kind}/${mode}`);
    conditions.push({ kind, mode, compactSHA256: sha(bytes), rawSummarySHA256: data.summarySHA256,
      sourceFingerprint: data.sourceFingerprint, sourceVerification: data.sourceVerification,
      sourceMapFingerprints: data.sourceMapFingerprints, browser: data.browser,
      flights: data.flights.map(flight => {
        const { frameGeometry, cpu, ...metrics } = flight;
        return { ...metrics, warmup: flight.flight <= 2,
          cpu: cpu && { profileSHA256: cpu.profileSHA256, sampledMs: cpu.sampledMs,
            categories: cpu.categories, focusSamples: cpu.focusSamples } };
      }) });
  }
}
const sources = new Set(conditions.map(condition => condition.sourceFingerprint?.sha256));
if (sources.size !== 1) throw Error('Conditions do not share one frozen source.');
const result = { label: 'native-sunburst-compiled-Text-ablation',
  conditions,
  limitations: [
    'Warm-up is the first zoom/reset pair; three later pairs are reported separately.',
    'Modes retain identical Tree inputs/topology, current compiler, Rect selection, center Text and legend.',
    'Constant opacity removes both the label visibility target expression and its animated target/transition; these mechanisms are not independently isolated.',
    'No-draw keeps full Text preparation and domain work, but hides branch glyph rendering. Its per-publication work parity must be checked before a draw-cost claim.',
    'Fixed domains and label controls change visible coverage/alpha. They are diagnostic controls, not image-equivalent production recommendations.',
    'Publication progress samples accepted Rect writes on completed frames; it is not GPU execution time.',
    'Synchronous CPU call-chain samples do not include every async resume; inclusive groups overlap. Read waits also overlap.',
    'Full raw traces, cpuprofiles and native screenshots remain local and can be regenerated with the retained scripts.',
    'The frozen source predates only later unsupported host-array/metadata admission guards unused by these device-mask expressions.',
  ] };
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(output);
