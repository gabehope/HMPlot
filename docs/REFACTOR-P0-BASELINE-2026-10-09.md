# Refactor Stage 112 (P0) baseline

**Claude-generated (Claude Opus 5.5), 2026-10-09.** Records the baseline that
[the refactor plan](REFACTOR-PLAN-2026-10-09.md) asks P0 for, tracked in TODO as Stage 112.
**Baseline commit:** `9e0830f3` (main, local; `origin/main` is `380cdac7`). Measured on an Apple
M2 Max (Mac14,5, 32 GB), macOS 15.6.1, Chrome 154.0.8037.98, Node 24.14.1, Python 3.13.5 (`.venv`).

## What Stage 112 added

| File | Purpose |
|---|---|
| [tests/unit/refactor-ratchet.test.js](../tests/unit/refactor-ratchet.test.js) | The ratchet: 12 counts that may only fall (one only rise) |
| [tests/unit/helpers/leakHarness.js](../tests/unit/helpers/leakHarness.js) | Opt-in leak and double-dispose harness |
| [tests/perf/investigations/lorenz-profile.mjs](../tests/perf/investigations/lorenz-profile.mjs), [gpu-timing.mjs](../tests/perf/investigations/gpu-timing.mjs) | Steady-state Lorenz driver; shared timestamp-query GPU timing |
| `tests/perf/investigations/results/refactor-baseline.json` | The performance baseline every later slice compares with |
| Five reproduction checks (below), with two fixture pages under `src/routes/test/` | Each claimed bug, marked to fail until Stage 113 fixes it |
| `VITE_HMPLOT_PERF_HOOKS` in [Example.svelte](../src/lib/docs/Example.svelte), a README section | Production builds the Sunburst driver can measure |

## CI and local gates

**CI is still refused.** Every GitHub Actions job since 2026-10-04 21:40Z has failed in 3 to 5
seconds with "The job was not started because recent account payments have failed or your
spending limit needs to be increased." The last run whose steps executed is CI 37236965876
(`e58be5a5`); the last fully green run is 37170647371 (`f2be281a`, 2026-10-04). **Restoring CI
needs the maintainer** (billing), and then a push: the baseline and its two parents are local.

Local gates on `9e0830f3`, before any Stage 112 change, all passed:

| Check | Result |
|---|---|
| `npm test` | 1,332 tests pass (77 s); the pretest docs hook changed no tracked file |
| `npm run check` | 0 errors, 0 warnings (2,841 files) |
| `npm run check:python-signatures` | 112 components current |
| `npm run check:api` | report current; no public API change |
| pytest | 813 passed, 1 skipped (needs `HMPLOT_TEST_DOWNLOAD=1`), 47 s |

There are no pre-existing failures in these gates. The browser failures already known this week
(reductions.spec "shared ordered expressions…", examples.spec solar-system at 1300 px, docs-site
constant-data and double-gyre Svelte/Python mismatches) were not re-run here. Found later, also failing on
`9e0830f3`: line-buffers.spec "a plain Line with per-row color, opacity and width draws every
series" and "Lines over the vertex buffer limit report an error…" (both `expected > 0, received 0`); flyover.spec "Manhattan flyover: a grabbed street follows the pointer…" (picks "Building 1028716" instead of 1028715).

Found during later stages, each also failing on the earlier commit named, so not caused by the
slice that found it (the baseline commit was not re-run for these):

| Spec and test | Already failing on | Found in |
|---|---|---|
| frame-marks.spec "each mark prepares once on mount when the frame check does not change" | `bc199704` | Stage 117.1 |
| facet-variants.spec "…: distinct render pipelines do not grow with cells" | `bc199704` | Stage 117.1 |
| flyover.spec "a flick glides on and stops, with height and direction kept…" (`@gpu`) | `8729abe2` | Stage 118.5 |
| stage14-nested-paths.spec "Segments, Arrows3D and curved Segments cut at a nested horizon, with heads only at true ends" | `1a1d6a32` | Stage 119 |

**Environment note:** the `python` on PATH (`/opt/miniconda3`, 3.12) has no pytest, so the command
in AGENTS.md fails as written; run pytest with `.venv/bin/python`.

After Stage 112's additions: `npm test` runs 1,344 tests (the ratchet adds 12), all passing, and
`npm run check` has 0 errors.

## Ratchet

[refactor-ratchet.test.js](../tests/unit/refactor-ratchet.test.js) counts each proxy with regular
expressions over `src/lib` (comments excluded, except for the two "names that must disappear"
metrics). The plan's table now carries its values; five differed from the first draft:

| Metric | Draft | Recorded | Why |
|---|---:|---:|---|
| `renderer.plot*` properties | 50 written | 51 read or written | Reads couple to the bus too (44 are written) |
| Kind checks in the five files | 56 | 79 | Counts `!==`, `.has(kind)` and either quote style |
| `pendingRootContent` importers | 11 | 10 | The 11th file defines it |
| `disposeTransformCache` cache fields | 10 | 11 | Distinct fields its body reads |
| Strictly checked modules | 13 | 10 | The three `@ts-check` files are already in `tsconfig.internal.json` |

Formatting moves line-based counts (namedMark 2,157 → 3,820 lines formatted; ownership-flag lines
32 → 33), so each area's mechanical formatting commit re-records them.

## Leak and double-dispose harness

```sh
LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test tests/unit/<file>.test.js
```

It wraps jax-js `Array` construction, `.ref` and `dispose()` per test (Node 24 applies a preload's
top-level hooks to every test), fails a test that ends holding references it acquired or that
disposes a freed array, and reports sites with trimmed stacks. Without `LEAK_CHECK` it changes
nothing. A deliberate leak and a deliberate double dispose are both reported at the right line.

**Cache policy.** An array a test created through a named cache may keep exactly one reference
(the cache's): jit trace constants (created under jax-js `runWithCache`) and row-mapping gathers
(`gatherCache.js`). A second reference, a caller's leak, is still reported. The first version
named `makeJaxpr$1`, which never appears in a stack (it returns an anonymous closure), so every
jit constant was reported; that is fixed. Added before Stage 116: a jit called while another
traces (reduceValues' reducers inside Normalize's planProgram) passes its constants to the outer
trace, so each of the two traces keeps one reference (`acquires`); and adoptJax's copies of
foreign jax-js arrays (`foreignJax.js`), which its FinalizationRegistry disposes when the app's
array is collected, possibly during a later test (`releases`). The harness also waits for the
`.data()` reads a test started: a read disposes its array only after its kernels compile.

**Baseline results** (tests failing the check / tests): data 6/34, padded-views 23/40, simulate
1/10, reductions 2/35, interaction 9/29, connection-prepare 11/12. Most are test-side. Findings:

| Finding | Kind | Where |
|---|---|---|
| `refreshCount` disposes a count that `data()` already freed, and `.catch(() => {})` hides the throw (12 reports) | **library, double dispose** | [interaction.js:213-218](../src/lib/plot/utils/interaction.js#L213) |
| `binCountFromRule` passes `mask.ref` to `reduceValues`, which borrows its mask | **library, leak per call** | [statistics.js:228](../src/lib/plot/utils/transforms/statistics.js#L228) (also the "scott" branch) |
| `pivotKernel` passes an inline `np.ones` to `reduceByCode`, which borrows `values` | **library, leak per pivot** | [group.js:275-279](../src/lib/plot/utils/transforms/group.js#L275) |
| `x?.ref` used as an "is it an array" test acquires a reference never released | test helpers (most reports) | [padded-views.test.js:239,242](../tests/unit/padded-views.test.js#L239), [data.test.js:336](../tests/unit/data.test.js#L336), [interaction.test.js:469](../tests/unit/interaction.test.js#L469) |
| Scene columns created by tests and never disposed | test-side | data.test.js (`columnValue`) |
| `upload` (data.js:35): the device-column cache is owned by the Data scopes holding the column, not module-level | test-side (an undisposed scope or transform cache) | reductions, padded-views tests |
| `adoptJax` under Text payload leases (labelPayload.js:43-50) | cache (RETAINED "foreign jax copies") | [foreignJax.js](../src/lib/plot/utils/foreignJax.js) |
| `reduceValues` references to arrays from earlier tests (normalize.js:45) | cache (nested jit trace constants) | [reduce.js](../src/lib/plot/utils/reduce.js) `compiledReducer` |
| `interaction.mask` returned to a test helper; connection-prepare's `publish` and `mapOperations` arrays | test-side | interaction, connection-prepare tests |

The three library findings and the test-helper fixes are Stage 113 work; the harness can then gate
P4 on these six files. Since Stage 116's prerequisite (2026-10-09), all six pass under the harness.

## Reproductions (112.6)

Each check asserts the intended behavior and is marked to fail until Stage 113 fixes it
(pytest `xfail(strict=True)`, Playwright `test.fail()`). Each was run unmarked to confirm it
fails because of the claimed defect, and the rest of its file still passes.

| Claim | Outcome | Check | Observed |
|---|---|---|---|
| Python containment omits 15 mark kinds (B1) | **reproduced** | [test_core.py](../python/tests/test_core.py) `test_every_mark_outside_a_plot_is_refused_as_points_is` | The 15 kinds build, validate and export to HTML outside a Plot with no error; the browser then fails late in Threlte. The hand list at [core.py:2199](../python/hmplot/core.py#L2199) has 20 of the registry's 35 marks. Fix: `set(REGISTRY["marks"]) \| LIGHTS \| PRESENTATION` (checked on a scratch copy: Python suite and all examples stay green). Flow and Routes also build outside a Plot; classifying them is a separate decision |
| DAG, Sankey, Pack, Treemap report no status (B3) | **missing contract** | [graph-data.spec.js](../tests/browser/graph-data.spec.js) "DAG reports its layout as pending…" with fixture `/test/graph-layout-status` | Every other transform handle has `subscribe(TransformStatus)`; these four do not (`f.dag.subscribe is not a function`). The scene runtime is unaffected: `settle()` awaits `whenSettled`, which waits for the layout and throws its error |
| Failed scene applications do not roll back all resources (Codex R5) | **reproduced** (themes, offsets) | [python-commands.spec.js](../tests/browser/python-commands.spec.js) "a failed apply restores the previous theme and offsets…" | After a timed-out apply, the runtime reports the previous revision but draws the new theme (red background) and keeps the new offsets: `commit` replaces theme values and hydrates offsets in place on shared identities, and the rollback restores neither. Selections roll back correctly. Retry works for all three. Not tested: the brush-constraint owner difference between the incremental and full paths |
| Grid references in HTML export (Codex R9) | **reproduced** | [document-export.spec.js](../tests/browser/document-export.spec.js) "an exported page carries the coordinate columns…" | The browser's `exportHTML` collects `table.columns` but not a grid's `coords`, `edges` or `positions`, so the netCDF scene exports without all 5 of its grid columns and the page cannot rebuild its grids. **Python is affected too:** `hm.export_html(scene)` with its default snapshot uses the browser closure (5 of 5 missing); with `snapshot=False` Python's own closure includes them |
| Dodge > Interaction loses the table (CLAUDE_REVIEW 2.5) | **reproduced** | [grid-dodge.spec.js](../tests/browser/grid-dodge.spec.js) "a mark under Dodge > Interaction…" with fixture `/test/dodge-interaction` | `interactionScope` spreads Dodge's prototype wrapper, keeping only `dodge` and losing 23 members including `length`, `metadata` and `dispose`. Points under Dodge > Interaction draw nothing ("Points: Expected undefined numeric values for x."); Dodge > Points and Interaction > Dodge > Points draw the three dodged points |

No claim was dropped.

## Performance baseline

Recorded in
[refactor-baseline.json](../tests/perf/investigations/results/refactor-baseline.json); how to
re-run it is in the [investigations README](../tests/perf/investigations/README.md) ("Refactor
performance gate"). The machine was on battery (39%), so re-measure on the same power state.

| Scenario | Server | Median (three runs; spread) | 2026-10-08 |
|---|---|---|---|
| Sunburst zoom/reset | production | 3.65 ms CPU per frame (3.61–4.48); frame p95 17.9 ms; 79 frames per flight; 13.8 submits and 1.23 readbacks per frame | 4.6 ms; p95 about 18; 13.8; 1.2 |
| Lorenz steady animation | production | 6.38 ms CPU per frame (5.74–6.58); 4.0 ms GPU (3.97–4.07); 60 fps on all three canvases; frame p95 16.7 ms; 31 submits and 1.0 readback per frame; 0 warm builds | 6.6 ms CPU; 2.75 ms GPU (another method) |
| Gesture and transform churn (19 + 23 cases) | dev, one run | counts per case (builds, readbacks, submits, buffers) | — |
| Force drag (4 modes) | dev, one run | 148–150 of 150 frames; 12–13.7 submits and 3 fences per update; 302–354 preparations | — |
| Docs loading budget | production | passed (points: fcp 76 ms, live 644 ms; home: live 492 ms) | passed |

The churn and Force-drag specs import modules from `/src`, so they run only on a dev server; their
counts are what the gate compares. Sunburst's third run was slower than the first two (4.48 vs
about 3.6 ms), so its tolerance is the larger of 10% and twice that spread. Gaps for later
stages: Sunburst GPU pass time (wire `gpu-timing.mjs` into `sunburst-profile.mjs`), and
`plotMarkPreparations`/`plotLiveFieldUpdates` per gesture, which P6's gate needs.

To serve the gallery's `window.__examples` hook from a production build, Stage 112 added an
opt-in to [Example.svelte](../src/lib/docs/Example.svelte): `VITE_HMPLOT_PERF_HOOKS=1`. A
normal build is unchanged.

## Inventories (112.5)

**API surfaces.** `getAxes` (Plot) is used by browser specs (root-coordinates, frame-brush,
nearby, category-order, interaction-regressions) and `getSurface` is implemented by most mark
components: neither is dead. The generated surfaces and their generators are
listed in [AGENTS.md](../AGENTS.md) and [API-GENERATION.md](API-GENERATION.md).

**Strict checking.** `npm run check` runs svelte-check over the app and `tsc -p
tsconfig.internal.json`, which strictly checks 10 modules (`internalTypes.ts`,
`markPreparation.js`, `preparedRetirement.js`, `displayedFrames.ts`, `viewControllerTypes.ts`,
`brushController.svelte.ts`, `tooltipController.svelte.ts`, `effectiveFieldBinding.ts`,
`vectorExport/captureTypes.ts`, `vectorExport/capture.js`). 132 of 188 components in `src/lib`
use `lang="ts"`, but the repository config is not strict; 87 `$state<any>()` component handles in
75 files remain, mostly in thin wrappers (`dag.svelte` and its siblings, transform wrappers).

**Formatting.** Prettier 3.9.6, default width 80. All five sample files drift, and 65 of the 70
files in the first migration areas do (+20,983/−5,776 lines; namedMark alone 2,157 → 3,820 lines).
Across `src`, `tests` and `scripts`, 1,178 of 1,438 checkable files drift. Prettier reads
`.gitignore` too, so build output is skipped only through it; `.prettierignore` is missing
generated files (`scene/components.js`, `reference/types.json`, `api/hmplot.api.md`,
`THIRD_PARTY_NOTICES.md`, which CI diffs after `build:python`, the theme JSON and its Python
copy), data (`src/examples/*/*.json`, `tests/perf/investigations/results/`, unit fixtures), and the
maintainer's `introduction.md` and `tutorial.md`. Proposed: a `format:check` script over an
explicit allowlist (the five clean area files, `effectiveFieldBinding.ts`, `ci.yml`,
`.prettierrc.json` and every new refactor file), a CI step between `npm ci` and `npm test`, and
for each stage a mechanical formatting commit that adds its paths, re-records line-based ratchet
values and is listed in `.git-blame-ignore-revs`. Keep width 80: 100 would remove only about 20%
of the drift and re-churn clean files.

**Not inventoried in this pass:** the Points/Rect dependency paths for the 118.6 pilot and a
per-stage list of parity tests. Both are cheaper and more accurate taken when their stage starts
(118.6 after P5's typed boundaries; each stage's parity list from its Verify line), so they move
to the start of those stages.

## Open items for the maintainer

1. Restore GitHub Actions billing, then push `main` (three commits ahead of `origin/main`).
2. Decide Flow and Routes's containment (P1a) and whether `scene/options.json` gets formatted (P2b).
3. AGENTS.md's pytest command needs the project's `.venv`.
