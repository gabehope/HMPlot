// Read-only: retain complete four-control cases; partial/failed cases stay excluded.
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const [output, ...inputs] = process.argv.slice(2);
assert(output && inputs.length, "Pass an output path and one or more scale-matrix results.json files.");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sources = new Set(), conditions = [], excluded = [], records = [];
for (const input of inputs) {
  const bytes = await readFile(input), data = JSON.parse(bytes);
  sources.add(data.sourceFingerprint);
  records.push({ name: basename(dirname(input)), sha256: hash(bytes), instrument: data.instrument,
    browser: data.browser, hashes: data.hashes, dpr: data.dpr, viewport: data.viewport });
  const cases = new Map();
  for (const result of data.results) {
    const name = result.scenario.name;
    if (!cases.has(name)) cases.set(name, []);
    cases.get(name).push(result);
  }
  for (const [name, variants] of cases) {
    const modes = new Set(variants.map(variant => variant.mode));
    if (!["none", "reuse", "batch", "both"].every(mode => modes.has(mode))) {
      excluded.push({ name, record: basename(dirname(input)), modes: [...modes],
        reason: "Incomplete matched case; failed or unmeasured controls are not treated as passing." });
      continue;
    }
    assert.equal(variants.length, 4);
    for (const result of variants) {
      assert.equal(result.samples.length, data.repetitions);
      assert(result.samples.every(sample => !sample.errors.length));
      assert.equal(result.pixelHash, variants[0].pixelHash);
      assert.deepEqual(result.state, variants[0].state);
      assert(!conditions.some(condition => condition.instrument === data.instrument &&
        condition.scenario.name === name && condition.mode === result.mode), "Duplicate condition.");
      // Early records divided RGB component count by four. The hash/verdict is unchanged;
      // normalize that metadata to the actual number of sampled RGB pixels.
      const pixelSamples = data.pixelComponents === 3 ? result.pixelSamples : result.pixelSamples * 4 / 3;
      conditions.push({ ...result, pixelSamples, instrument: data.instrument });
    }
  }
}
assert.equal(sources.size, 1, "Conditions must use one frozen source.");
await writeFile(output, JSON.stringify({ label: "current-scale-controls-partial",
  sourceFingerprint: [...sources][0], records, conditions, excluded,
  limitations: [
    "Three warmed repetitions per control; source fingerprints cover the representative library files and private fixture listed in each record.",
    "Plain feedback waits for an accepted completed frame before applying another update. Legend-only DOM changes wait for an animation frame; animated steps include their authored duration.",
    "Instrumented runs are separate serial runs. Their timings include GPU-counter overhead and are not substituted for plain timings.",
    "Each complete case checks update row counts/errors and final accepted domains/counts and sampled screenshot parity. This does not establish all intermediate/export/interaction semantics.",
    "Independent facets failed exact final colorbar pixel parity and are excluded; their accepted mark domains/counts matched. The differing guide labels require separate diagnosis.",
    "Large filtering and palette/range cases are supported by the driver but unmeasured in this continuation. Broad Stage 105 acceptance remains open.",
  ] }, null, 2) + "\n");
console.log(output);
