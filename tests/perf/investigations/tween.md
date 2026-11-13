# Stage 100 current-column measurements

These are warmed local rendering checks, separate from agent benchmarks. The current fixture is
[tween-current](../../../src/routes/test/tween-current/+page.svelte); the archived baseline uses
[tween-legacy.svelte](tween-legacy.svelte), copied to that same test route. Use a fresh server and
run each command serially. Each script uses Chrome/WebGPU at DPR 2 and records three one-second
flights after frozen-time warm-up. Timing and instrumented passes are separate.

```sh
TWEEN_URL=http://127.0.0.1:5491 TWEEN_LABEL=current-timing \
  node tests/perf/investigations/tween-measure.mjs
TWEEN_URL=http://127.0.0.1:5491 TWEEN_LABEL=current TWEEN_INSTRUMENT=1 \
  node tests/perf/investigations/tween-measure.mjs
TWEEN_URL=http://127.0.0.1:5483 TWEEN_LABEL=baseline-timing \
  node tests/perf/investigations/tween-measure.mjs
TWEEN_URL=http://127.0.0.1:5483 TWEEN_LABEL=baseline TWEEN_INSTRUMENT=1 \
  node tests/perf/investigations/tween-measure.mjs
```

`TWEEN_OUT` selects the artifact directory; its default is this directory's `results` folder
when run from the repository root. The baseline is `a3667d1d`, served from an unchanged git
archive. Copy the legacy fixture into `src/routes/test/tween-current/+page.svelte` in that archive
before starting its server. Installed dependencies can be linked as in the main investigation
[setup](README.md); the archive's existing Vite filesystem allowlist must include its own root
and the linked dependencies. The current snapshot includes Stages 100–102 and the retained
Stage 105 summary changes; this comparison is not an isolated attribution of every change.

The numeric workload has 10,000 rows, one root tween, and two fixed-domain point consumers:
one reads the column and the other multiplies it by two. It matches the baseline expressions
and data. The tree workload has 127 nodes and the same partition geometry/one-second weight
motion. Current code supplies an upstream current-value Calculate column through GraphData;
the old API uses a layout-owned tween on the explicit node table. This is a comparable visible
workload, **not a matched composition** or proof of a faster tree execution path.

Completed-frame timing, shader/pipeline/readback counters, buffer allocation and submit/fence
counts are recorded separately. The numerical fast path records retained field writes. The
tree intentionally continues through ordinary preparation. Screenshots were inspected, and
the focused browser regression checks frozen numerical values, stable buffers, completed
frames and post-landing inactivity. These small fixed-domain workloads do not establish
performance for changing topology, implicit scales, categorical channels, filtering or large
refined geometry. Report limits and the extra numerical submit cost, not a frame-rate speedup.
