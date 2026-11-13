// Read-only: combine separate plain, CPU-sampled and primitive-hook diagnoses.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const inputs = {
  plain: process.env.SUNBURST_PLAIN_RESULTS,
  cpu: process.env.SUNBURST_CPU_RESULTS,
  operations: process.env.SUNBURST_OPERATION_RESULTS,
};
const output = process.env.SUNBURST_SUMMARY_OUT;
assert(output && Object.values(inputs).every(Boolean),
  "Pass SUNBURST_PLAIN_RESULTS, SUNBURST_CPU_RESULTS, SUNBURST_OPERATION_RESULTS and SUNBURST_SUMMARY_OUT.");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const conditions = [];
for (const [kind, root] of Object.entries(inputs)) {
  for (const mode of ["full", "no-text"]) {
    const bytes = await readFile(join(root, mode, "summary.json")), raw = JSON.parse(bytes);
    assert(raw.sourceVerification?.verified && !raw.errors.length);
    const cpu = kind === "cpu" ? JSON.parse(await readFile(join(root, mode, "compact.json"))) : null;
    conditions.push({ kind, mode, rawSummarySHA256: hash(bytes), sourceFingerprint: raw.sourceFingerprint,
      sourceVerification: raw.sourceVerification, browser: raw.browser, controls: raw.controls,
      sourceMapFingerprints: cpu?.sourceMapFingerprints,
      flights: raw.samples.map(flight => {
        assert(!flight.errors.length && !flight.renderError);
        const jitCallers = {};
        for (const [caller, count] of Object.entries(flight.operations?.callers ?? {})) {
          if (!caller.startsWith("jit\n")) continue;
          const site = caller.split("\n")[1];
          jitCallers[site] = (jitCallers[site] ?? 0) + count;
        }
        const compact = cpu?.flights.find(sample => sample.flight === flight.flight)?.cpu;
        return { flight: flight.flight, direction: flight.direction, warmup: flight.flight <= 2,
          wallMs: flight.wallMs, completedFrames: flight.completedFrames, frameP50: flight.frameP50,
          frameP95: flight.frameP95, markWork: flight.markWork, textWork: flight.textWork,
          expressionPlans: flight.expressionPlans,
          operations: flight.operations && { total: flight.operations.total,
            primitives: flight.operations.primitives, exactJitCallers: jitCallers,
            otherStackSampleEvery: raw.stackEvery },
          cpu: compact && { profileSHA256: compact.profileSHA256, sampledMs: compact.sampledMs,
            categories: compact.categories, focusSamples: compact.focusSamples },
          errors: flight.errors, renderError: flight.renderError };
      }) });
  }
}
assert.equal(new Set(conditions.map(condition => condition.sourceFingerprint.sha256)).size, 1);
await writeFile(output, JSON.stringify({ label: "current-native-sunburst-runtime-work", conditions,
  limitations: [
    "Plain timing, CPU sampling and operation-hook runs are separate serial runs at DPR 2; discard each first zoom/reset pair.",
    "Full retains the branch-label fades; no-text removes branch Text. This changes coverage and retirement time and is not an image-equivalent production optimization.",
    "Counts cover entire gestures, including setup and retirement. Dividing by live geometry writes is a workload normalization, not an exact isolated per-frame cost.",
    "Primitive hooks count frontend binds. One jit bind invokes a compiled program and hides its internal arithmetic; binds do not equal GPU kernels, allocations or submissions.",
    "JIT caller counts are exact. Other caller stacks are sampled and are retained only in the raw trace; operation-run timings include stack-capture overhead.",
    "CPU categories assign each sampled synchronous call chain once. Nearest focus groups are exclusive; inclusive groups overlap and async resumes can lose their application caller.",
    "Headless development Chrome results do not establish the frame rate of the user's interactive tab, production builds, other devices or D3.",
  ] }, null, 2) + "\n");
console.log(output);
