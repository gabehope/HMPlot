# Stage 123.9 / 123.10 isolated primitive experiments

Status (2026-10-17): **prepared, GPU measurements pending**. This is not evidence to
close either measurement item. The requested exclusive GPU window has not been
confirmed, and the primary agent is not exposed in this session's agent tree.
No new browser/GPU timings have been collected. Existing
[scan crossover results](../tests/perf/investigations/results/scan-crossover.json)
support bounded cumulative-scan work, with mixed latency improvements; they do not
establish either proposed consumer optimization.

The work starts at `0041638d` on branch `codex/measure-123-primitives` in
`/tmp/hmplot-measure-123-work`. It changes only isolated investigation
fixtures, result records and this documentation. Production Slice, transform
runners, public API and fork sources/artifacts are untouched.

## Experiment design

The [fixtures](../tests/perf/investigations/primitives-123/) use a read-only archive
of `0041638d`, overlay their own sources, and create a standalone production Vite
build. An experiment-only Vite transform selects compaction/bracket candidates in
the compiled module graph; it never writes production source files. The frozen
source manifest hashes all `src`, fork bundles and fixtures. The driver verifies
those bytes and served build assets before collecting samples. Dependencies are
linked locally; generated client chunks and their fingerprints capture the actual
bundle under test.

123.9 compares the existing stable sort and an exclusive **int32** cumulative sum
followed by scatter-update. Every selected destination is unique. Every hidden
destination is `-1`, which the fork scatter skips. Bucket padding repeats the
first selected source row, or zero when none is selected, with a separate validity
mask. Both timing arms use the same one-scalar count read, shape/bucket choice and
numeric gather. Uploads are realized before timing. Exact compaction and bucket
paths are reported separately. Changing masks rotate a fixed population so output
shapes stay warm. 90,000 and 500,000 rows alternate within repetitions, as do arm
orders; all-false, all-true, approximately 10% and approximately 90% masks are
included. Separate correctness checks exercise exact counts at 16,384, 32,768 and
the quarter-capacity cutoff, plus adjacent counts, growth/shrink policy, chained
Filter provenance and retained results across cache replacement.

123.10 compares Slice's full-history running-max/suffix-min bracket kernel with
segment-restricted left/right binary bounds plus cached nearest-visible neighbors.
It is not a global search. Neighbor scans exclude NaN times and are rebuilt when
visibility changes. Both cache construction and changing-mask repetitions are
timed; stable-query measurements must not hide that amortization requirement.
The prototype retains two full-history float32 neighbor arrays (8 bytes per row).
The experimental full-Slice adapter uses an explicit **harness-owned** mask epoch;
a production integration would need the prepared topology/effective-mask witness
and disposal owner already maintained by Slice. That epoch is not a proposed
application protocol.

The full-Slice comparison also includes an `oracle` ablation: correct endpoints
are computed and uploaded **outside** timing, then substituted for bracket work.
This deliberately impossible free-bracket control bounds the benefit of removing
that work. It is diagnostic, not an implementation candidate. Isolated bracket
latencies cannot be divided by full-Slice latency to obtain a causal fraction:
their synchronization and lazy realization differ. Use the ablation together with
separate GPU timestamp captures and end-to-end frame progress.

The history matrix uses `(entities, samples per entity)` of `(1500,60)`,
`(250,360)`, `(5000,100)`, `(1500,333)`, `(150,3000)` and `(32,16384)`, under all
visible, whole-entity visibility, sparse holes and all-hidden masks. The 1,500 × 60
case matches the actual moving-particles example. Longer histories are constructed
stress cases, not sampled customer telemetry. The repository's other entity Slice
examples have only two or three samples per entity; gridded Slice uses a separate
host search and is excluded.

The actual `MovingParticles.svelte` component is compiled unchanged apart from
exposing its existing time/filter hooks in production and adding a playback toggle
for the harness. It compares the existing path (`sort`), compaction replacement
(`scan`) and bracket replacement (`search`) at DPR 2, on the same frozen build.
Fixed updates measure settlement **and a completed frame**; live windows report
completed plot frames, duration and raw rAF timestamps. Counter runs separately
count whether compact/bucket paths were even requested. This matters because the
example normally passes padded Filter rows into Slice. Synthetic canvas progress
in microbenchmarks is only a harness completion count, never plot FPS.

## Reproduce

Use a fresh destination for every preparation. From the isolated worktree:

```sh
node --test tests/perf/investigations/primitives-123/guards.test.mjs
LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test tests/perf/investigations/primitives-123/correctness.test.mjs
PRIMITIVE_DEVICE=wasm LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test tests/perf/investigations/primitives-123/correctness.test.mjs
LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test tests/unit/slice.test.js

PRIMITIVE_SNAPSHOT=/tmp/hmplot-123-frozen-new node tests/perf/investigations/primitives-123/prepare.mjs
cd /tmp/hmplot-123-frozen-new
node node_modules/vite/bin/vite.js build --config tests/perf/investigations/primitives-123/vite.config.mjs
node node_modules/vite/bin/vite.js preview --config tests/perf/investigations/primitives-123/vite.config.mjs --host 127.0.0.1 --port 5193 --strictPort
```

After coordinating exclusive GPU use with the primary agent, run these serially
from the investigation worktree. Keep source/builds frozen; stop other browser,
GPU, example-building and heavy CPU work. Each condition uses two discarded warmup
repetitions. Plain timing retains six repetitions; diagnostics retain two.

```sh
PRIMITIVE_SNAPSHOT=/tmp/hmplot-123-frozen-new PRIMITIVE_OUT=/tmp/hmplot-123-plain.json node tests/perf/investigations/primitives-123/measure.mjs
PRIMITIVE_SNAPSHOT=/tmp/hmplot-123-frozen-new PRIMITIVE_MODE=counters PRIMITIVE_OUT=/tmp/hmplot-123-counters.json node tests/perf/investigations/primitives-123/measure.mjs
PRIMITIVE_SNAPSHOT=/tmp/hmplot-123-frozen-new PRIMITIVE_MODE=gpu PRIMITIVE_OUT=/tmp/hmplot-123-gpu.json node tests/perf/investigations/primitives-123/measure.mjs
node tests/perf/investigations/primitives-123/summarize.mjs /tmp/hmplot-123-plain.json /tmp/hmplot-123-counters.json /tmp/hmplot-123-gpu.json
python3 tests/perf/investigations/primitives-123/compare-pixels.py /tmp/hmplot-123-plain.json
```

`PRIMITIVE_PART=compact|history|moving` isolates a section; use separate output
files. `PRIMITIVE_URL` changes the preview URL, `PRIMITIVE_REPS` changes measured
repetitions, and `PRIMITIVE_LIVE_MS` changes live window duration (default 3 s).
The raw JSON retains every repetition, dimensions, visible count/capacity, latency,
frame progress, source/build fingerprints, browser/adapter, validation status and
separate instrumentation. Screenshots remain next to their raw capture; pixel
comparison uses Python Pillow. Failed/partial captures are rejected by the
summarizer. Fixed updates fail if settlement and a completed frame take longer than
30 seconds, and live windows with no completed frames invalidate the capture. Build
patches require exactly one match at every substitution, preventing silent baseline
drift. Kernel time, instrumented wall time and plain wall time are distinct.

## Current validation and recommendations

[Raw preparation checks](../tests/perf/investigations/results/primitives-123-preparation.json)
retain exact commands, stdout, exit codes and build metadata. The two candidate
behaviors pass with the leak harness on CPU and WASM; all nine existing Slice tests
pass with the leak harness on CPU. Checks cover stable IDs, hidden destination
safety, changing masks, source mapping, retained references, bucket padding/policy,
segment isolation, holes, duplicate times with one visible row, empty segments,
exact/outside endpoints and NaN/infinite history values. The standalone production
build succeeds with existing Svelte warnings. **Real-WebGPU candidate correctness,
rendered pixel parity and the browser harness itself remain unverified.** No full
gate, merge or push has been run.

- **123.9:** retain current sort. The candidate is reproducible, but no new matched
  GPU latency/readback/frame evidence yet supports integration. This is a pending
  experiment, not a measured negative result.
- **123.10:** defer a fork search primitive. Full-history bracket dominance and an
  application benefit are still unmeasured. A segmented, visibility-aware prototype
  and a causal ablation are ready. Even a prototype win would first justify a
  prepared-cache integration experiment; it would not prove that a general fork
  `searchsorted` API is necessary or sufficient.

Proposed TODO updates are recorded separately in
[TODO-UPDATES.md](../tests/perf/investigations/primitives-123/TODO-UPDATES.md).
