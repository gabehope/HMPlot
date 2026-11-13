# Performance investigation fixtures

These scripts are experiments, not benchmark results or production APIs. The matching source audit and recommendations are in [PERFORMANCE-INVESTIGATIONS.md](../../../docs/PERFORMANCE-INVESTIGATIONS.md).

Stage 123.9/123.10's isolated scan-compaction and segmented-history fixtures live in
[`primitives-123`](primitives-123/). Their [focused report](../../../docs/PERFORMANCE-123-PRIMITIVES.md)
contains commands, measurement design, validation and limitations. They are currently prepared
and CPU/WASM checked; exclusive-GPU measurements remain pending. Do not treat preparation as
evidence to replace sort or add a fork search primitive.

## Reproduce

Use the repository's installed dependencies and Chrome with WebGPU. Run GPU workloads serially, at DPR 2, on fresh servers. The preparation script uses a read-only git archive of `a3667d1d`, adds measurement and rendered-guard fixtures, disables automatic example builds, links installed dependencies, and copies existing example/browser build outputs. It never changes git state.

```sh
export INVESTIGATION_ROOT="$(mktemp -d /tmp/hmplot-investigations.XXXXXX)"
node tests/perf/investigations/prepare.mjs baseline
node tests/perf/investigations/prepare.mjs prototype105
```

Start the two servers in separate terminals using the commands printed by preparation. Baseline uses 5483 and prototype 5484. Keep each snapshot unchanged while a browser runs. `BENCH_REF` can select another baseline; the retained prototype patch is against `a3667d1d`.

```sh
export BENCH_OUT="$INVESTIGATION_ROOT/results"
BENCH_URL=http://127.0.0.1:5483 BENCH_LABEL=baseline-quiet \
  BENCH_CASE='scale-filter-small|scale-filter-50k|bounds-style|bounds-filter' \
  node tests/perf/investigations/measure.mjs
BENCH_URL=http://127.0.0.1:5484 BENCH_LABEL=prototype105-quiet \
  BENCH_CASE='scale-filter-small|scale-filter-50k|bounds-style|bounds-filter' \
  node tests/perf/investigations/measure.mjs
```

Repeat with `BENCH_INSTRUMENT=1` for readback/allocation/compile counters. Plain timing runs avoid instrumentation overhead. The default is three repetitions after warm-up. `BENCH_REPS` overrides that only for diagnosis. Without `BENCH_CASE`, the runner also covers a million rows, colormap/range changes, exact/nearest/tooltip/disabled hover, stationary/hovering sunburst, and an expandable tree.

```sh
BENCH_URL=http://127.0.0.1:5483 node tests/perf/investigations/pick-prototype.mjs
BENCH_URL=http://127.0.0.1:5483 node tests/perf/investigations/count-prototype.mjs
BENCH_URL=http://127.0.0.1:5483 node tests/perf/investigations/capacity-prototype.mjs
```

`pick-prototype` compares the existing CPU nearest-hit search with a compute query over existing pick textures. Its optional CPU notification is a separate compact, pooled readback. `count-prototype` compares immediate CPU count synchronization with GPU-only and background-count consumers using identical GPU masks and downstream means. `capacity-prototype` compares reusable source-sized payloads with exact compact payloads, reporting payload and total live bytes separately. All private feedback writes target Three-owned storage buffers, never immutable JAX arrays.

After the two scale runs, compare the unmodified screenshots:

```sh
node tests/perf/investigations/verify-screenshots.mjs
```

`BENCH_SHOTS` selects a separate screenshot directory; `BENCH_BASELINE_LABEL` and `BENCH_PROTOTYPE_LABEL` override filename labels. The comparison samples plot marks, guides and the colorbar at DPR 2. It does not replace interaction/export regression tests.

The focused rendered guards use the same served snapshot. On the Stage105-only snapshot, exclude the strict time-domain test, which needs Stage100's `afterWrites` publisher:

```sh
BENCH_URL=http://127.0.0.1:5484 \
  npx playwright test --config tests/perf/investigations/playwright.config.mjs \
  --grep 'same-identity|pointer geometry|Image grid|changing and clearing'
```

These check mutable direct coordinates, pointer domain abstention, automatic Image grid placement and point-unit changes using SVG geometry, live pixels, inferred domains and completed frames. Run all five tests without the filter on the final combined tree to include evolving time domains. The fixtures are copied only when present, so an intermediate Stage105 commit can still reproduce measurements before the combined integration fixture lands. Run guards after timing measurements so diagnostics cannot affect the timings. Rebuild example payloads against the selected snapshot before replaying gallery cases if copied outputs come from a different API revision; the standalone scale fixtures do not need those payloads.

## Refactor performance gate (Stages 112–121)

The gate in [REFACTOR-PLAN-2026-10-09.md](../../../docs/REFACTOR-PLAN-2026-10-09.md) ("Performance regression checks") measures a production build. `VITE_HMPLOT_PERF_HOOKS=1` keeps the gallery's `window.__examples` hook, which `sunburst-profile.mjs` needs; a normal build omits it.

```sh
npm run build                                  # once, for the examples and thumbnails
VITE_HMPLOT_PERF_HOOKS=1 npx vite build
npx vite preview --host 127.0.0.1 --port 5601 --strictPort
SUNBURST_URL=http://127.0.0.1:5601 SUNBURST_PRODUCTION=1 SUNBURST_CPU=1 SUNBURST_OUT=out/cpu node tests/perf/investigations/sunburst-profile.mjs
SUNBURST_URL=http://127.0.0.1:5601 SUNBURST_PRODUCTION=1 SUNBURST_CPU=0 SUNBURST_PROFILE=1 SUNBURST_OUT=out/gpu node tests/perf/investigations/sunburst-profile.mjs
LORENZ_URL=http://127.0.0.1:5601 LORENZ_OUT=out/lorenz node tests/perf/investigations/lorenz-profile.mjs
```

`lorenz-profile.mjs` samples the steady Lorenz animation (`LORENZ_RUNS`, default 3; `LORENZ_WARMUP_S`, 4; `LORENZ_SAMPLE_S`, 6). Each run opens the page twice: once for frame intervals, presented frames per canvas and a CPU profile (active time counts everything but `(idle)`, as on 2026-10-08), once for GPU counters and then GPU pass time from `timestamp-query` ([gpu-timing.mjs](gpu-timing.mjs), timed separately because its queries are extra work). It writes `run-N.json` and `summary.json` (median and spread). The perf specs (`gesture-churn`, `transform-churn`, `force-drag`) run against the same preview with a config that sets `use.baseURL` and no `webServer`. Record results in `results/refactor-baseline.json`.

Compare two builds interleaved, not one after the other. Copy each build's `build/` directory aside, serve the copies side by side (any static server that resolves `/examples/sunburst` to `sunburst.html`), discard one warm-up run per build, and alternate the measured runs between them. Sequential sessions drift: in Stage 121's comparison the build measured first read about 0.6 ms per frame lower on Sunburst three times, and two bisections attributed that drift to commits that measure the same as their predecessors when interleaved. Readbacks are integers per flight, so compare them per flight; a per-frame rate also moves with completed frames. The final comparison is in `results/refactor-final.json`.

## Preparation reuse (Stages 109–111)

`prepare-text-ablation.mjs` also freezes the baseline, data-only and combined implementation.
`TEXT_BASE_REF` selects the committed baseline (the retained comparison uses `b8ded729`).
`TEXT_USE_COMMITTED_SOURCE=1` keeps its archived source; `TEXT_STAGE=109` overlays current data
infrastructure but restores the five mark-preparation files from that baseline. With neither
flag, it overlays the current complete source. All copies have their own vendored JAX artifacts,
source hashes, diagnostic route and integer preparation counters. Use fresh snapshot paths.

```sh
TEXT_SOURCE_ROOT="$PWD" TEXT_BASE_REF=b8ded729 TEXT_USE_COMMITTED_SOURCE=1 \
  TEXT_SNAPSHOT="$INVESTIGATION_ROOT/baseline" \
  node tests/perf/investigations/prepare-text-ablation.mjs
TEXT_SOURCE_ROOT="$PWD" TEXT_BASE_REF=b8ded729 TEXT_STAGE=109 \
  TEXT_SNAPSHOT="$INVESTIGATION_ROOT/data" \
  node tests/perf/investigations/prepare-text-ablation.mjs
TEXT_SOURCE_ROOT="$PWD" TEXT_BASE_REF=b8ded729 \
  TEXT_SNAPSHOT="$INVESTIGATION_ROOT/combined" \
  node tests/perf/investigations/prepare-text-ablation.mjs
```

Start each snapshot with its own port and `VITE_CACHE_DIR`, using `--force`. For production,
build the snapshot with `node node_modules/vite/bin/vite.js build`, then use `vite preview`
on a separate port. Restart previews after rebuilding their manifests. Stop builds and test
suites before measuring. Run each condition serially with one warm-up pair and five measured
pairs; keep the inspector disabled. For example:

```sh
TEXT_SNAPSHOT="$INVESTIGATION_ROOT/combined" SUNBURST_URL=http://127.0.0.1:5552 \
  TEXT_RESULTS="$INVESTIGATION_ROOT/results/hmplot-final-110-dev-plain-1" TEXT_MODES=full \
  SUNBURST_FLIGHTS=12 SUNBURST_IDLE_MS=200 SUNBURST_CPU=0 SUNBURST_PROFILE=0 \
  node tests/perf/investigations/measure-text-ablation.mjs
```

Repeat separately with `SUNBURST_CPU=1`, `SUNBURST_OPS=counts`, or
`SUNBURST_CPU=0 SUNBURST_PROFILE=1`. Set `SUNBURST_PRODUCTION=1` when serving a production
build: the driver verifies loaded JS bytes against that snapshot's client build. For CPU
summaries, use `SUNBURST_INPUT`, `SUNBURST_SUMMARY_OUT` and either `SUNBURST_DEPS` (the matching
dev cache's `deps`) or `SUNBURST_BUILD_MAPS` (the production `.svelte-kit/output/client`), then
run `summarize-sunburst.mjs`. A shared `SUNBURST_CLICK_POINTS_FILE` can fix calibrated targets.
Never mix stage source, served assets or source maps from different snapshots.

### Actual Python gallery decoder comparison

The preparation comparison above measures the native Svelte diagnostic fixture. The
subsequent decoder fix is measured separately on `/examples/sunburst`, using its frozen
Python scene payload. [Retained results](results/sunburst-python-metadata.json) contain four
serial development captures with five warmed zoom/reset pairs each, plus source, payload,
profile and final-PNG hashes. Baseline is `b5b84320`; only the candidate's optional metadata
decoding changes. The candidate fingerprint also includes two inert local files (`.DS_Store`
and a Python bytecode cache), listed explicitly rather than treating fingerprints as
runtime-difference lists. No production or GPU-counter result is inferred from this replay.

Freeze baseline/candidate snapshots with the commands above, using `TEXT_BASE_REF=b5b84320`
and omitting `TEXT_STAGE`. Preserve identical `static/example-builds` bytes. To use the gallery
instead of the private Text fixture, replace each snapshot's fixture-specific driver with
the maintained gallery driver and increase its loop from six to twelve flights:

```sh
python3 - "$PWD" "$INVESTIGATION_ROOT/baseline" "$INVESTIGATION_ROOT/combined" <<'PY'
from pathlib import Path
import sys
relative = 'tests/perf/investigations/sunburst-profile.mjs'
driver = (Path(sys.argv[1]) / relative).read_text()
assert 'flight < 6;' in driver
for snapshot in sys.argv[2:]:
    (Path(snapshot) / relative).write_text(driver.replace('flight < 6;', 'flight < 12;'))
PY
```

Start each snapshot on its own fresh strict port/cache as above. With no competing builds,
suites or captures, run the same command separately for baseline/candidate and CPU/plain:

```sh
SUNBURST_URL=http://127.0.0.1:5570 SUNBURST_ROUTE=/examples/sunburst \
  SUNBURST_SOURCE_ROOT="$INVESTIGATION_ROOT/baseline" \
  SUNBURST_EXTRA_SOURCE_PATHS=src/lib/scene/resources.js \
  SUNBURST_OUT="$INVESTIGATION_ROOT/python-baseline-cpu" \
  SUNBURST_CPU=1 SUNBURST_PROFILE=0 \
  node "$INVESTIGATION_ROOT/baseline/tests/perf/investigations/sunburst-profile.mjs"
```

Use `SUNBURST_CPU=0` for plain timing; discard flights 1–2 and retain 3–12. Process CPU
profiles with `summarize-sunburst.mjs` as above. Active CPU excludes idle/program samples;
frame p95 is averaged across gestures; bounds motion is a sampled domain-change proxy.
Expression-plan counts are cumulative through all twelve flights. Baseline subplans can
compile inside eager surrounding arithmetic, so those compiled-call totals are not comparable
operation counts. The fixed gallery has zero Text/Rect arithmetic fallback; Tree's host-managed
tween path remains intentional. Raw profiles/screenshots stay local. The retained comparison
does not include the private compiled-gather experiment, whose timing overlapped another run.

Frame intervals, synchronous CPU samples, primitive binds and GPU counters are different
measurements. Bounds-change samples approximate geometry motion; subsequent retirement and
settled idle are reported separately. Inclusive CPU caller groups overlap. GPU buffer-byte
counters exclude textures and host descriptors. The per-mapping cache cap covers retained
array payload, with ownership/eviction checked separately in unit tests.

Retain captures as `hmplot-final-<stage>-<dev|prod>-<plain|cpu|ops|gpu>-<repeat>` under one
results directory. Stages `baseline`, `109` and `110` each have all four captures in both
modes, with repeat `1`. The separate backend comparison uses stage `111` versus `110` CPU
captures at repeats `2` and `3` in both modes, plus stage `111` plain repeat `1`. This is 34
captures, each with ten measured gestures after the warm-up pair. CPU captures also need
their matching postprocessed `compact.json` beside `full/summary.json`.

```sh
PREPARATION_RESULTS="$INVESTIGATION_ROOT/results" \
  PREPARATION_SUMMARY_OUT="$INVESTIGATION_ROOT/preparation.json" \
  node tests/perf/investigations/summarize-preparation.mjs
```

The postprocessor verifies capture completeness and served-source validation, retains each
flight, separates bounds motion/retirement/idle, and computes the backend threshold using
sampled CPU **before settled idle**. It does not reinterpret a frontend bind or pipeline
creation as a GPU dispatch. [Final retained results](results/preparation-109-111.json) and
[the report](../../../docs/PERFORMANCE-INVESTIGATIONS.md#data-and-mark-preparation-stages-109111-2026-10-08)
record the acceptance decision and limitations.

`measure-preparation-idle.mjs` uses a verified **development** plain capture for calibrated
targets, rechecks its served sources, warms one pair, then observes 500 ms after a further
100 ms settlement margin. It records real adapter info and idle draws, submits, reads,
allocations and waits without a CPU profiler:

```sh
PREPARATION_CAPTURE="$INVESTIGATION_ROOT/results/hmplot-final-110-dev-plain-1/full/summary.json" \
  PREPARATION_IDLE_OUT="$INVESTIGATION_ROOT/results/stage109-111-110-idle.json" \
  node tests/perf/investigations/measure-preparation-idle.mjs
```

Repeat on baseline, retaining `stage109-111-baseline-idle.json`. Pass
`PREPARATION_IDLE_RESULTS="$INVESTIGATION_ROOT/results"` to `summarize-preparation.mjs` to
include both controls and adapter information. No new draws/submits/reads/buffers occur in
the retained controls; each observes one completion-wait call.

Snapshots also include `scales-fixture.svelte` at `/test/investigation-scales`. Use `measure.mjs`
with labels `baseline-109-controls` / `combined-110-controls`,
`BENCH_CASE='scale-filter-small|scale-filter-50k'`, three repetitions and separate
`BENCH_INSTRUMENT=1` runs. The additional plain 50k comparison uses labels
`baseline-109-repeat` / `combined-110-repeat` and `BENCH_CASE='scale-filter-50k'`.
Postprocess with `PREPARATION_CONTROLS` and `PREPARATION_CONTROLS_OUT` using
`summarize-preparation-controls.mjs`. Optional `PREPARATION_CONTROL_SOURCE_VERIFICATION`
merges recorded served/local hash evidence. The retained run rechecked the frozen servers'
representative sources and fixture bytes after controls; see
[`preparation-filter-controls.json`](results/preparation-filter-controls.json). Accepted counts,
domains and original PNG hashes match; large-filter timing varies and does not establish a
general filtering speedup. These fixtures retain their baseline's four shaders per six-step
sequence, separate from Sunburst's zero warmed shader/pipeline creation.

### Experimental realization shortcut

[`stage111-realization.patch`](stage111-realization.patch) is a source experiment against the
pinned `bd581f70b0b72453174c5d8c5c2fa3eeb22735df` fork plus its thirteen maintained patches.
It is outside `vendor/jax-js/patches`, so it does not change the shipped backend. Reproduce it
in a **fresh private snapshot** made by `prepare-text-ablation.mjs`, then build and byte-check
using the [pinned fork workflow](../../../vendor/jax-js/PATCHES.md#reproducing-the-checked-in-artifacts):

```sh
TEXT_SOURCE_ROOT="$PWD" TEXT_BASE_REF=b8ded729 \
  TEXT_SNAPSHOT="$INVESTIGATION_ROOT/candidate" \
  node tests/perf/investigations/prepare-text-ablation.mjs
cp tests/perf/investigations/stage111-realization.patch \
  "$INVESTIGATION_ROOT/candidate/vendor/jax-js/patches/0014-realization-experiment.patch"
cd "$INVESTIGATION_ROOT/candidate"
npm exec --yes --package=node@22.22.0 --package=pnpm@11.24.0 -- \
  sh scripts/build-jax-fork.sh
npm exec --yes --package=node@22.22.0 --package=pnpm@11.24.0 -- \
  sh scripts/build-jax-fork.sh --check
```

For upstream correctness, apply the same source patches to a disposable pinned checkout,
install core dependencies with its frozen lockfile, and run
`BROWSER=chromium pnpm exec vitest run test src --exclude 'packages/**'`. Use a Chrome launch
with a real adapter (`channel: "chrome"`, `--headless=new`, `--enable-unsafe-webgpu`), and
confirm WebGPU cases executed rather than skipped. The private launch configuration is a test
environment adjustment, separate from the source patch. The candidate's regression covers
already-realized, pending compiled and transformed arrays on each available device. See
[TESTING.md](../../../TESTING.md#data-and-mark-preparation--stages-109111-2026-10-08) for the
actual gates, failed initial attempts and chronology.

Retaining a runtime patch requires **at least 10% and 1 ms** saved whole-plot CPU or latency
per active gesture, repeatably, plus correctness and byte reproducibility. An indexing
microbenchmark or a reduced inclusive sample category alone does not meet that condition.

## Native sunburst diagnosis

### Current operation and CPU attribution

`SUNBURST_CPU=1` enables CDP CPU sampling without the GPU/readback wrappers used by
`SUNBURST_PROFILE=1`. `SUNBURST_OPS=counts` counts frontend JAX primitive binds;
`SUNBURST_OPS=callers` also retains every compiled-call site and samples other caller stacks
at `SUNBURST_OP_STACK_EVERY` (default 16). Those timings include instrumentation overhead.
Run plain timing, CPU sampling and operation hooks serially as separate conditions.
A `jit` bind invokes one compiled program; it does not count the arithmetic inside it,
compiled shaders, GPU kernels, allocations or queue submissions.

The text-ablation snapshot/driver supports all three modes. Keep `TEXT_MODES=full,no-text`,
use the same frozen snapshot and calibrated click points, and set `SUNBURST_FLIGHTS=8` for
three warmed pairs in the plain run. Generate each CPU condition's `compact.json` with
`summarize-sunburst.mjs` and its matching dependency source maps, then combine:

```sh
SUNBURST_PLAIN_RESULTS="$INVESTIGATION_ROOT/current-plain" \
SUNBURST_CPU_RESULTS="$INVESTIGATION_ROOT/current-cpu" \
SUNBURST_OPERATION_RESULTS="$INVESTIGATION_ROOT/current-operations" \
SUNBURST_SUMMARY_OUT="$INVESTIGATION_ROOT/current-runtime-work.json" \
  node tests/perf/investigations/summarize-runtime-work.mjs
```

[Current retained evidence](results/sunburst-current-runtime-work.json) includes source hashes,
CPU categories and exact compiled-call sites. The first zoom/reset pair is warm-up. Counts
cover entire gestures; normalizing by live geometry writes is not an isolated frame cost.
Branch Text removal changes fade retirement and image coverage. See the human-readable
terminology and interpretation in `docs/PERFORMANCE-INVESTIGATIONS.md`.

### Current scale controls

`scale-matrix.mjs` copies the complete current `src` into a private snapshot, disables
automatic example builds and uses its own Vite dependency cache. Only that copy gets reuse
and ready-batch controls; the user's dev server and production options are unchanged.

```sh
SCALE_MATRIX_ROOT="$INVESTIGATION_ROOT/current-scales-plain" SCALE_MATRIX_PORT=5537 \
SCALE_CASES='filter-small|style-50k|nested-style|facets-shared|facets-independent|source-domains|legend-only|animated-appearance' \
  node tests/perf/investigations/scale-matrix.mjs
```

Repeat serially at a different root with `SCALE_INSTRUMENT=1` for GPU counters. Defaults are
three repetitions after one six-step warm-up, at DPR 2, with `none,reuse,batch,both` controls.
`SCALE_MODES`, `SCALE_REPS`, and `SCALE_CASES` select diagnosis only. Without `SCALE_CASES`,
the runner also includes 50k/million-row filtering and 50k colormap/range updates. Each
authored update waits for a completed frame before the next update, so cheap changes cannot
coalesce into misleadingly fast timing. Legend-only DOM changes wait for an animation frame.
Accepted row/domain state and sampled final screenshots must match between modes. Unfiltered
row counts use committed storage count; an intermediate `filteredCount` is not a draw oracle.
Failure snapshots retain counts, render alerts and pixels, and are excluded from timings.

Combine existing records without launching browser/GPU work:

```sh
node tests/perf/investigations/summarize-scale-matrix.mjs \
  "$INVESTIGATION_ROOT/scale-controls.json" \
  "$INVESTIGATION_ROOT/current-scales-plain/results.json" \
  "$INVESTIGATION_ROOT/current-scales-instrumented/results.json"
```

The summarizer excludes partial cases and checks source, state and pixel-hash parity for
complete cases. [Current retained controls](results/scale-current-controls.json) include seven
complete scenarios; independent facets' final colorbar labels failed parity and remain open.
The old fixture's RGB sample-count metadata is corrected explicitly by the summarizer; pixel
hashes and verdicts are unchanged. A fixture setup/count failure does not establish a rendering
failure. See the report for actual gains, neutral controls and unmeasured broader coverage.

### Native replay

The profile driver runs six click/reset flights serially at DPR 2. Use the native gallery route to share the application's actual animation module and avoid copied Python payload differences. Set `SUNBURST_SOURCE_ROOT` to the unchanged served snapshot: the driver fingerprints its `src/lib` and sunburst sources before launching. Native runs passively sample CPU track starts/deadlines without GPU reads; `SUNBURST_TRACKS=0` disables that diagnosis. CPU deadlines are conservative pending horizons, not GPU row-start times.

```sh
SUNBURST_URL=http://127.0.0.1:5483 \
  SUNBURST_ROUTE='/test/gallery-example?id=sunburst' \
  SUNBURST_SOURCE_ROOT="$INVESTIGATION_ROOT/baseline" \
  SUNBURST_OUT="$INVESTIGATION_ROOT/sunburst-baseline-plain" \
  node tests/perf/investigations/sunburst-profile.mjs
```

Repeat on the unchanged final integration snapshot with its own source root/output directory. Repeat separately with `SUNBURST_PROFILE=1` for map/readback traces and Chrome CPU profiles. Profiled timings include overhead and must not replace plain timings. The baseline example lacks the updated mark lifecycle fades and per-mark animated color/opacity channels; distinguish layout motion from later retirement and do not treat total settlement as identical behavior. The warmed distinct-bounds gate is a responsiveness requirement, but its baseline/current comparison is also behavior-confounded and does not isolate the graph/tween implementation.

Summarization is read-only and launches no browser:

```sh
SUNBURST_INPUT="$INVESTIGATION_ROOT/sunburst-baseline-profile/summary.json" \
  SUNBURST_LABEL=baseline-profile \
  SUNBURST_SUMMARY_OUT="$INVESTIGATION_ROOT/results/sunburst-baseline-profile.json" \
  node tests/perf/investigations/summarize-sunburst.mjs
```

`SUNBURST_DEPS` optionally selects the recorded Vite dependency directory containing matching source maps. Keep original `.cpuprofile` files and screenshots locally. Compact summaries retain CPU/read attribution, raw-artifact and source-map fingerprints, and phase episodes. Idle/program time is not GPU time; read waits overlap. Profiles without a captured source fingerprint remain explicitly historical diagnostics.

The final current-column qualification is retained in
[`sunburst-live-geometry-plain.json`](results/sunburst-live-geometry-plain.json) and
[`sunburst-live-geometry-instrumented.json`](results/sunburst-live-geometry-instrumented.json),
with source fingerprint `546ff34e6088287717a641e1ff0b7680b4255a06b69d8b61b5f8b6c2a52dd95d`.
The previous correctness baseline uses
[`sunburst-correctness-baseline-geometry.json`](results/sunburst-correctness-baseline-geometry.json)
and [`sunburst-correctness-baseline-instrumented.json`](results/sunburst-correctness-baseline-instrumented.json),
fingerprint `af3dce9a958ad64a7d7919b6514ff3ffd089fc06856f1e09669e48756c5158cc`.
Each runs three zoom/reset pairs, with the first pair warming and the last two pairs reported
as steady state. Passive `markWork` records geometry writes, static Text reuses and total
preparation requests; requests include successful shortcuts. The current example also keeps
sector membership fixed while animating opacity, so observed gains cannot all be attributed
to runtime reuse. Current warmed flights draw 12–13 changed bounds instead of 10–11, with
37–39 JAX reads instead of 69–74; full settlement remains about 1.4 seconds, and active layout
motion is not 60 fps. `cpu.focusSamples` records overlapping inclusive and separately assigned
nearest synchronous call-chain samples, using a 32-frame call-chain window. It does not
measure GPU execution or capture all work resumed across async boundaries. The report
documents the remaining dynamic Text preparation and its subsequent bounded payload control.

The later Text-only control is retained separately in
[`sunburst-text-control-plain.json`](results/sunburst-text-control-plain.json),
[`sunburst-text-control-instrumented.json`](results/sunburst-text-control-instrumented.json),
[`sunburst-text-payload-plain.json`](results/sunburst-text-payload-plain.json), and
[`sunburst-text-payload-instrumented.json`](results/sunburst-text-payload-instrumented.json).
Control source `0b5711d54eb4b92bb3d676ea089eeb7735f8602bd146834dd46ace246f36750e`
and payload source `5b21c78025b60bd975bb5d485fb48f4fd274badc6e79cb6608e24f06ba3e18c7`
differ only in `labels.svelte`, `labelAtlas.js`, and the new unused-in-control payload helper.
Both retain the same example, current-column reuse, raw Rect optimization, scope refresh and
preparation acceptance. To reconstruct the control from that final snapshot, restore only
the two Text files from `a3667d1d` and omit `labelPayload.js`; do not revert the whole library.
Run the existing driver on separate unused strict ports with a separate cache/output root
per snapshot, three zoom/reset pairs, and discard the first pair for steady-state reporting.

Changed drawn bounds advance at 19.3–20.5/s in the control and 19.6–22.3/s with the payload,
using the actual sampled geometry-motion interval. Full settlement remains about 1.4 s and
one payload p95 gap is worse. These repetitions do not establish a reliable animation-rate
gain. Branch Text receives fresh gathered dictionary codes, so exact payload-cache hits are
not demonstrated by the sunburst. The bounded cache's invalidation/disposal and compiled
miss-path parity have focused unit checks. Its DPR-2 rendered guard in
`tests/browser/label-options.spec.js` passes (21.6 s): moving labels retain exact glyph-field
inputs while pixels change; changed text changes pixels and searchable SVG content. Each
settled label update creates zero render pipelines before export; fresh hybrid-export
targets are outside that counter interval. JAX expression construction and extent
reads remain the larger measured demands. No pure GPU execution time is inferred.

A later **private numeric-target compiler** is recorded separately in
[`numeric-expression-cpu.json`](results/numeric-expression-cpu.json) and the five
[`sunburst-numeric-*.json`](results/sunburst-numeric-control-plain.json) summaries. It traces
existing evaluator operators; one-dimensional numeric columns/masks and typed runtime
literals are admitted, and unsupported modes keep the original evaluator. The corrected
CPU driver materializes typed arrays with `dataSync()` and tests integer oracles, masks,
metadata, aliases, trace failure and teardown. Earlier Promise-to-`Array.from()` results
were invalid and are excluded.

At DPR 2, same-source control and compiled snapshots replay the same three zoom/reset pairs,
with the first pair discarded. Plain geometry changes advance at 19.4–24.3/s in the eager
control, 19.8–20.4/s in a repeated control, and 27.3–29.6/s in the private compiled snapshot.
Buffers fall from 476–491 to 157–174 per instrumented warmed flight despite more updates.
JAX reads remain roughly 2.3–2.8 per geometry write, so this addresses construction rather
than CPU synchronization. Fade settlement remains near 1.4 s; it is not a 60 FPS result.
These results have representative served-source verification, including the compiled helper.
The prototype is outside the repository at `/tmp/hmplot-expression-jit-prototype`
and `/tmp/hmplot-sunburst-numeric-jit-browser` on the investigation machine. Its captured
module was `experimentalNumeric.js`; the retained production module is now
`src/lib/plot/utils/numericExpressions.js` (`createNumericExpressionEvaluator`), with conservative
authored-form rejection and bounded failed-trace memory. Production integration is Stage106;
103 focused reduction/kernel tests and Svelte/type checks pass, while final integrated rendering
gates are recorded in TESTING.md. The measured prototype hashes are preserved and must not be
reassigned to that cleaned production tree. Broader eligibility is excluded.

To replay equivalent snapshots, run `sunburst-profile.mjs` on unused strict ports with
`SUNBURST_SOURCE_ROOT`, separate `SUNBURST_OUT` roots, and
`SUNBURST_EXTRA_SOURCE_PATHS=src/lib/plot/utils/experimentalNumeric.js` for the private compiled
condition. Run plain and `SUNBURST_PROFILE=1` separately, then use
`summarize-sunburst.mjs` with matching `SUNBURST_DEPS` source maps. Each compact record now
includes `geometryProgress`: changed sampled bounds excluding the initial geometry divided
by the observed first-to-last motion interval. Full original screenshots and `.cpuprofile`
files remain in the temporary output folders, not git.

#### Compiled Text ablation

`prepare-text-ablation.mjs` creates a fresh private snapshot of the complete current source,
including deletions, disables automatic example builds, and installs one diagnostic route.
It preserves the integrated numeric compiler and adds only integer per-kind/name work counters.
No production source is edited and it starts no server or browser. Use an empty destination:

```sh
TEXT_SOURCE_ROOT="$PWD" TEXT_SNAPSHOT="$INVESTIGATION_ROOT/text-ablation" \
  node tests/perf/investigations/prepare-text-ablation.mjs
cd "$INVESTIGATION_ROOT/text-ablation"
VITE_CACHE_DIR="$PWD/.vite-cache" \
  node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5510 --strictPort
```

Keep that source frozen. From the main repository, run plain variants serially while other
GPU/heavy CPU work is paused. Full calibrates exported Design/Studio CSS click points; later
variants reuse them and assert the same canvas size and selected node/reset behavior.

```sh
TEXT_SNAPSHOT="$INVESTIGATION_ROOT/text-ablation" \
SUNBURST_URL=http://127.0.0.1:5510 \
TEXT_RESULTS="$INVESTIGATION_ROOT/text-ablation-plain" \
  node tests/perf/investigations/measure-text-ablation.mjs

TEXT_SNAPSHOT="$INVESTIGATION_ROOT/text-ablation" \
SUNBURST_URL=http://127.0.0.1:5510 \
TEXT_RESULTS="$INVESTIGATION_ROOT/text-ablation-instrumented" \
TEXT_MODES=full,constant-opacity,no-text,fixed-domains \
SUNBURST_CLICK_POINTS_FILE="$INVESTIGATION_ROOT/text-ablation-plain/full/click-points.json" \
SUNBURST_PROFILE=1 \
  node tests/perf/investigations/measure-text-ablation.mjs
```

The default eight flights discard the first zoom/reset warm-up and retain three later pairs.
`full` keeps animated branch visibility; `no-draw` hides only branch glyph drawing while
preparation/domains remain; `constant-opacity` removes both its visibility-target expression
and explicit opacity transition; `no-text` removes only branch Text; `fixed-domains` pins the
actual initial full x/y domains. Rect selection, center Text, legend and Tree work are retained.
These controls change alpha/coverage and are diagnostic, not image-equivalent optimizations.

Run `summarize-sunburst.mjs` separately for each mode/condition using `SUNBURST_INPUT`,
`SUNBURST_SUMMARY_OUT`, and matching
`SUNBURST_DEPS="$INVESTIGATION_ROOT/text-ablation/.vite-cache/deps"` source maps. Then combine:

```sh
TEXT_PLAIN_RESULTS="$INVESTIGATION_ROOT/text-ablation-plain" \
TEXT_INSTRUMENTED_RESULTS="$INVESTIGATION_ROOT/text-ablation-instrumented" \
TEXT_SUMMARY_OUT="$INVESTIGATION_ROOT/text-ablation.json" \
  node tests/perf/investigations/summarize-text-ablation.mjs
```

[Retained evidence](results/sunburst-compiled-text-ablation.json) uses one verified frozen
source, `c7a3af8d43a56e13418c20e97f761304c2174db7010800f232e69395e50a85c2`, captured before
only later unsupported host-array/effective-metadata admission guards unused by these device
expressions. Full publishes at 24.9–28.0/s; no-draw at 26.6–28.9/s; constant opacity at
49.7–55.9/s; no branch Text at 51.7–60.3/s; fixed domains at 28.5–30.2/s. Progress samples
accepted Rect writes on completed frames, so fixed-domain progress remains observable. The
per-publication Text preparation/domain counts match for full/no-draw. Glyph drawing is a
small contributor here; the combined animated opacity target/publisher is the stronger
causal region. Expression CPU samples alone do not explain the rate difference.

Whole-flight submissions include a later fade-only tail in the full condition, absent with
constant opacity. Do not divide those totals by geometry updates to claim extra active-alpha
cost. CPU call-chain groups overlap and do not isolate async/GPU time. These controls yield
no production animation change. Full traces, `.cpuprofile` files and original screenshots
remain locally under `/tmp/hmplot-sunburst-text-ablation-final-{plain,instrumented}`.

#### Observe extent readiness

The source-only observer copies the **entire current `src` tree, including deletions**, to a
new private snapshot and disables automatic example builds. It preserves generated registries
and only adds host request/flush timestamps; it starts no server or browser itself.

```sh
FLUSH_SNAPSHOT="$INVESTIGATION_ROOT/extent-flush" FLUSH_PORT=5509 \
  node tests/perf/investigations/observe-extent-flush.mjs
```

Start the strict-port server and native profile commands from the printed snapshot's
`EXTENT-FLUSH-SNAPSHOT.json`, serially with no competing GPU workload. Its driver verifies
`extentSummary.js` in addition to the ordinary representative sources. Summarize with:

```sh
node tests/perf/investigations/summarize-extent-flush.mjs \
  "$INVESTIGATION_ROOT/extent-flush/results/summary.json" \
  "$INVESTIGATION_ROOT/extent-flush/results/flush-summary.json"
```

Retained [`sunburst-extent-flush.json`](results/sunburst-extent-flush.json) and
[host events](results/sunburst-extent-flush-events.json) show 34–36 reads from 32–34 warmed
owner flushes, with just two initial two-mask groups per flight. The existing single-mask
batches already hold six requests. An already-ready heterogeneous-mask merge could save at
most two reads, not one per layout update; it is not recommended as the next optimization.
Joining later asynchronous arrivals would change publication timing and is deferred. Event
allocation adds observer overhead; waits overlap and do not measure GPU kernel time.

When `SUNBURST_SOURCE_ROOT` is supplied, the driver now compares representative served raw
sources against local bytes before profiling, saving `source-verification.json` and retaining
`sourceVerification` in the raw and compact summaries. A mismatch throws before accepting
timings. This checks `namedMark.svelte`, `labels.svelte`, `expressions.js`, `namedData.js`,
`sunburst.svelte` and optional extra paths, not every executed compiled chunk. App-relative
responses are downloaded and raw-module string wrappers are decoded without executing the
source. Files served directly as downloadable examples are compared as plain text. The control instrumented and payload plain records are verified;
the two older retained records note their confirmed-listener but pre-validation status.
An initial occupied-port control reached an old ablation server and is explicitly
[`discarded`](results/sunburst-text-invalid-run.json); none of its timings enter these tables.
The original screenshots/profiles remain locally under
`/tmp/hmplot-sunburst-text-control-{plain,instrumented}`,
`/tmp/hmplot-sunburst-text-payload-plain`, and
`/tmp/hmplot-sunburst-after-labels-instrumented`.

The final [sunburst-ablation.json](results/sunburst-ablation.json) adds four diagnostic controls on the same frozen native source: original, fixed initial full domains, static sector/label membership, and both. Each records a discarded zoom/reset warm-up and three measured pairs. All final plain controls ran after the other agents' CPU gates finished. Temporary fixtures and diagnostic wrappers remain outside the repository at `/tmp/hmplot-stages100-105/sunburst-ablation` on the investigation machine; `prepare.mjs`, `run.mjs` and `summarize.mjs` there generate and measure the isolated snapshot. Their input/output variables are `ABLATION_SOURCE_ROOT`, `ABLATION_ROOT`, `SUNBURST_URL`, `SUNBURST_ROUTE`, `SUNBURST_SOURCE_ROOT`, `SUNBURST_OUT`, and `ABLATION_SUMMARY`.

To recreate the controls manually on a private snapshot, keep the current Tree topology and width/layer-height tweens unchanged. Fix x/y to the **actual initial** inferred full domains for fixed-bounds modes. For static membership, keep sectors with `depth>0`, and keep labels in the focused branch and below the focused level, omitting layout width/height and label-space tests. Preserve the center focus filter and all mark lifecycle options. The recorded initial domains are x `[0,185]` and y `[-0.16,4.16]`; both controls change rendered coverage/labels, so do not assert image parity or propose them as production changes. The existing native profile driver can replay the resulting private page; additional temporary wrappers recorded query spans and exact `.js()` validation calls. Those spans overlap and are not GPU durations. The JSON records source and raw-summary hashes, actual completed-frame times, passive track episodes, and each repetition rather than just averages.

The separate [sunburst-data-callers.json](results/sunburst-data-callers.json) uses one warmed native zoom/reset pair with `SUNBURST_DATA_TRACE=1` in the temporary driver. A passive wrapper captures the caller before `Array.data()` crosses an async boundary; no extra arrays are read. It resolves animated source-index key-token downloads, scalar alpha checks, Filter counts, extents, event mapping and tooltip demands. This additional recorder is diagnostic attribution rather than matched plain timing.

## Files and limitations

- `stage105.patch` reproduces only the bounded summary changes on the stable baseline, excluding concurrent graph/tween changes.
- `results` retains compact JSON traces only. Scripts write full-resolution screenshots and fresh JSON to `BENCH_OUT`, defaulting to the system temporary directory's `hmplot-stages100-105/results`. The original screenshots from this investigation are preserved locally in `/tmp/hmplot-stages100-105/retained-screenshots`; regenerate them with the commands above on another machine. No screenshots are resized or copied into git. Visual correctness must be checked before interpreting timing.
- GPU counts include pooled staging allocations only at warm-up; no per-update allocation is hidden from counters.
- The capacity experiment specializes four numerical payload channels and a sum consumer; atomic packing preserves row IDs but not stable row order. Plot feedback remains source-sized in both controls. It is not a complete replacement for Filter, sorting, grouping, CPU topology, selection resources, or snapshot ownership.
- Pointer prototype notification payloads contain IDs/rows/pixels. Full application callbacks, Python publication, linked-table identity mapping, spherical source-position decoding, and resource arbitration are outside this bounded prototype.

## Retained evidence

The two `*-quiet-scale_filter_small_scale_filter_50k_bounds_style_bounds_filter.json` files contain the final accepted-result timing comparison. `scale105-visual-parity.json` records sampled pixel parity. `prototype105-final-instrumented-bounds_style_bounds_filter.json` contains the final positional reuse counters. `prototype105-prelookup-instrumented.json` contains the appearance counters and the earlier positional counts before the common mark lookup was fixed; its timing is diagnostic. `baseline-instrumented.json` supplies baseline counters; its early feedback timings must not be compared with the stronger final accepted-result timings.

`picking-prototype.json`, `count-prototype.json` and `capacity-prototype.json` are the final bounded mechanism experiments. `scale105-guards.json` includes four standalone guards and all five integrated guards, with actual fixture/log fingerprints; the full rendering gate remains separate. `sunburst-ablation.json` is the final quiet four-control native diagnosis. Earlier `baseline`, `*-final` and tween traces are retained as diagnostics and separate Stage 100 evidence. The report distinguishes their validity and scope. The final quiet pair excluded a lingering browser/example-builder workload discovered during earlier timings; OS scheduling and thermal variance still apply.
