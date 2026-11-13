# GPU interaction, row counts, and scale summaries

This records the Stage 103–105 source audit and bounded experiments. It separates work removed from measured frame improvements. All experiments are local; no benchmark agent run or publication is involved.

## Method

The stable baseline is commit `a3667d1d`. A git archive was served separately on port 5483. A second snapshot on 5484 contains only the retained Stage 105 patch. Concurrent graph/tween changes in the working tree are excluded from that comparison.

Chrome 154.0.8037.98 runs on macOS 15.6.1 with WebGPU at device pixel ratio 2, a 1300 × 1100 viewport, fresh servers, deterministic data, warm-up, and three repetitions. Instrumented runs count map/readback calls, buffer allocations/live bytes, submits, shader modules, compute/render pipelines, mark builds, and actual completed plot frames. Plain scale runs measure timing separately. A frame interval is measured between completed plot frames, not merely requestAnimationFrame callbacks. Picking/count/capacity prototypes include their lightweight counters in both controls, so their numbers are bounded mechanism measurements rather than plain integrated-library timings.

For a filter change, the timing runner waits until every mark publishes the expected inferred normalization, then awaits plot settling. Earlier traces used the first completed frame, which can contain previously accepted data; their feedback timings are diagnostic and are not evidence of faster accepted results. The final matched traces use the stronger condition. Numeric domains, selected row counts, GPU error collection, and screenshots are checked alongside timing.

The final scale comparison uses the two **quiet** JSON traces: [baseline](../tests/perf/investigations/results/baseline-quiet-scale_filter_small_scale_filter_50k_bounds_style_bounds_filter.json) and [prototype](../tests/perf/investigations/results/prototype105-quiet-scale_filter_small_scale_filter_50k_bounds_style_bounds_filter.json). Earlier runs were affected by a lingering example-builder/Chrome process; they are diagnostics, not the final timing comparison. These processes were stopped and other agents' browser work was paused before the final pair. OS scheduling, thermal variation and shared Metal shader caching remain limitations. Pipelines are warmed; there is no cold-compile claim or overall plot-performance claim.

Portable fixtures, the isolated Stage 105 patch, raw JSON, and reproduction commands are under [tests/perf/investigations](../tests/perf/investigations/README.md). Only compact JSON and source are checked in. Original full-resolution screenshots remain in `/tmp/hmplot-stages100-105/retained-screenshots` on the investigation machine; the scripts regenerate them elsewhere.

## Stage 103 — CPU picking versus GPU feedback

### Where picking synchronizes

| Path | CPU readbacks | Why |
| --- | --- | --- |
| Exact row hit | Pick output pixel + world pixel | JS event payload and shared row interaction state |
| Tolerant nearest | Pick region + center world pixel; sometimes nearest world pixel | CPU distance/tie search and world payload |
| Tooltip only | Same nearest query | HTML tooltip content; usually no new beauty frame |
| Spherical source coordinate | Additional source-position buffer query when needed | Recover original longitude/latitude/row coordinates |
| Transformed source row | Interaction row mapping when needed | Publish state by source-row identity |
| Disabled interaction | None | No hit consumer |

[readPixel.js](../src/lib/picking/readPixel.js) creates a 16-byte staging buffer for a pixel. Region rows are rounded to the 256-byte copy pitch before mapping; [setupInteractivity.svelte.js](../src/lib/picking/setupInteractivity.svelte.js) coalesces pointer moves, rejects stale pick generations, and waits for a current pick pass. [tolerantPick.js](../src/lib/picking/tolerantPick.js) chooses exact rows first, then the nearest eligible mark within its own radius with deterministic scan-order ties. Area hits stay a fallback, rather than replacing nearby rows.

Ordinary selection resources in `utils/interaction.js` contain JS row sets and upload a mask. Publishing the pointer to a compute shader therefore does not eliminate the resource transition by itself. GPU-driven visual feedback requires a shared GPU interaction representation while preserving CPU callbacks, ownership, preview/commit, linked identities, and other producers. GPU brushing already has a different constraint-mask path; it is not proof that JS picking is unnecessary.

### Baseline counts

Forty moving-pointer updates over 50,000 points produced 80 exact-picking reads, 95 nearest/tooltip reads, and zero reads with interaction disabled. Nearest region downloads allocated about 3.33 MB over the replay; exact pixels allocated 1,280 bytes. Tooltip-only movement did not require new beauty frames. Stationary sunburst clicks produced only 16 picking reads across the click/reset replay, whereas layout/scale work produced many more JAX reads. An expandable tree driven by its depth input had zero picking reads during that replay.

### Bounded prototype and decision

The standalone prototype reads the existing float pick/world textures in a compute pass, applies the same exact-first/nearest-radius search, and writes a Three-owned interaction-opacity field. Ten sampled ID/row/pixel comparisons match the existing CPU search, including an exact miss with a nearest hit. An optional CPU notification uses a separate compact 32-byte result with two pooled staging buffers, after feedback submission. It uses the normal picking-material pass before querying; directly rendering the scene pass does not establish that material state. It does **not** integrate current interaction columns or linked selection resources into the ordinary data pipeline.

The final driver waits for an actual completed beauty frame and submitted GPU work before measuring completion or taking screenshots. Earlier screenshots taken without the latter wait included a blank artifact and are discarded as correctness evidence. The final CPU/GPU feedback comparison has **0 differing pixels among 2,301 samples**, including 939 nonwhite samples. [Final picking JSON](../tests/perf/investigations/results/picking-prototype.json) contains hit parity, visual parity and these three 40-update repetitions:

| Mode | p95 feedback, repetitions 1 / 2 / 3 (ms) | Reads per replay | New buffers per replay |
| --- | --- | --- | --- |
| CPU query and feedback | 19.0 / 18.8 / 18.1 | 97 | 97 |
| GPU query and feedback | 17.3 / 18.1 / 17.5 | 0 | 0 |
| GPU feedback, asynchronous CPU notification | 17.3 / 18.6 / 17.9 | 40 | 0 |

No repetition reaches both the required 10% and 1 ms p95 improvement. Warmed runs have zero new shader modules or pipelines, zero captured GPU errors, and stable live storage of 21,868,068 bytes. Removing reads is real, but this case remains close to display scheduling time. The decision is **do not ship a second GPU interaction path**. Only experiment scripts remain; production picking is unchanged.

A follow-up would first need pixel assertions for exact/nearest/miss behavior, then shared GPU selection-resource arbitration, transformed/linked identity mapping, tooltip/event parity, stale-result handling and disposal. Only after that should a representative hover workload be retimed. Optimizing picking cannot remove stationary tree layout/bounds reads.

## Stage 104 — logical counts, physical capacity, and lazy CPU consumers

### Current contract

`utils/dataView.js` distinguishes exact logical `.length` from padded physical capacity/valid/prefix arrays. Ordinary `.get()` can compact to an exact CPU-known shape. The constructor refuses a masked view without an integer count, and snapshots capture the exact length. `transforms/runner.js` selects padded rows, visible prefixes, or compacted input according to a transform's declared access pattern; it still passes `scope.length` eagerly.

A new filter predicate reduces its GPU mask and awaits a scalar count in `transforms/filter.js`. Sparse large filters can also build a bucket: the source threshold is 65,536, the minimum bucket is 16,384, shrink requires three low iterations, and growth is immediate. The extra sparse work is sorting/prefix/gathering and allocation policy, not just downloading four count bytes.

| Consumer | Can avoid immediate exact CPU count? | Constraint |
| --- | --- | --- |
| Padded marks, Calculate, masked reductions | Often | Keep capacity, valid mask and GPU count together |
| Sample | Possibly | Selected size still depends on count; output allocation policy matters |
| Ungrouped Window | Possibly | Visible end could consume a device scalar |
| Fold | Possibly | GPU logical count can multiply by the fold width |
| Delaunay, Voronoi, Hull, PolygonTriangulate | No for current CPU path | Compact coordinates and topology need exact host shape |
| Bootstrap summary / grid dodge | No for current compact path | Their kernels/layout assume compact input |
| Grouping / distinct output sizes | Separate issue | Group count and variable output shape are not just the input row count |
| Structural graph/tree membership | Often still exact | CPU topology planning differs from repeated fixed-topology numeric layout |
| Series/keys/connections requiring compact rows | Depends on path | Source identity/order and lifecycle planning can require host information |

`maxElements` is a mark's preparation/allocation capacity, not a scene-wide GPU memory budget. Device binding-size limits are per buffer, not an aggregate allowance. A memory-conscious policy must account for retained field buffers and full-capacity processing; pooling a tiny count buffer does not solve that cost.

### Bounded count prototype

The standalone experiment retains an internal physical facade with `capacity`, an owned GPU count, a revision, and a shared asynchronous `exactCount()`. It never changes public synchronous `.length`. A GPU mask updates actual point feedback and computes a downstream masked mean. Three lease-protected output/staging slots bound count storage; two exact CPU consumers share one promise/read per revision, and a revision tag prevents an older completion from replacing the latest CPU notification. Slot reservation happens before awaiting its previous lease, preventing overlapping revisions from claiming the same slot.

At 50,000 and 1,000,000 source rows, 24 updates × three repetitions compare CPU count before rendering, GPU-only count consumption, and count mapping after feedback submission. Counts, sums and means match CPU calculations for sparse, actually empty and all-visible masks. Six coalesced revisions finish with the newest exact result; old notifications cannot replace it. The driver waits for a completed frame and submitted GPU work. [Final count JSON](../tests/perf/investigations/results/count-prototype.json) records:

| Rows | Mode | p95 feedback, repetitions 1 / 2 / 3 (ms) | Median p50 (ms) | Reads per replay |
| --- | --- | --- | --- | --- |
| 50,000 | CPU before feedback | 17.2 / 17.2 / 18.1 | 16.7 | 24 |
| 50,000 | GPU only | 17.0 / 16.9 / 17.6 | 16.5 | 0 |
| 50,000 | Background CPU count | 18.2 / 18.6 / 17.1 | 16.6 | 24 |
| 1,000,000 | CPU before feedback | 38.4 / 36.0 / 35.8 | 31.3 | 24 |
| 1,000,000 | GPU only | 35.5 / 32.3 / 18.2 | 16.6 | 0 |
| 1,000,000 | Background CPU count | 18.9 / 34.5 / 35.3 | 17.2 | 24 |

Warmed runs allocate no new buffers or pipelines and capture no GPU errors. Live allocation remains 22,267,892 bytes for 50k and 184,267,892 bytes for one million rows. The small case shows no material gain. The million-row case demonstrates a possible reduction in missed display intervals, but its tail variance is substantial. It supports further investigation of a private physical facade; it does not establish node-complete or public API/default benefits.

### Capacity and memory control

The [capacity experiment](../tests/perf/investigations/results/capacity-prototype.json) compares a reusable source-sized four-channel payload with an exact-sized compact payload and a downstream sum. It checks exact count/sum after six sparse/dense/empty changes, repeated three times. Atomic scatter preserves explicit source-row IDs but does not preserve row order. The plot remains source-sized in both controls, so this measures payload allocation/work rather than a fully compact plotting pipeline.

For one million rows, retaining source capacity uses **16,000,000 payload bytes**. A 31,102-row sparse result uses **497,632 bytes** when compact, an empty result uses 16 bytes, and the all-visible result again uses 16 MB. Total live storage is 200,267,828 bytes with source-sized payloads versus 184,765,460 bytes for that sparse compact result. Compact mode adds one critical count read and one payload allocation per resize; source mode adds neither. Neither mode truncates newly visible rows. Three p95 results are **16.5 / 34.3 / 33.5 ms** for source and **36.2 / 32.1 / 32.7 ms** for compact: memory savings are clear, timing superiority is not. Both controls have exact sums/counts and no captured GPU errors. This does not measure a general hysteresis policy, all temporary peak lifetimes, device-limit recovery or CPU compact consumers.

### Recommendation

Retain current production defaults. A follow-up private physical facade is worthwhile for million-row GPU-only branches, with an async exact CPU consumer branch and legacy exact-shape compact consumers preserved. No production count/capacity changes are included here. Before proposing an Auto/Compact API or default, the follow-up must:

- Establish immutable revision/snapshot ownership, shared demand, stale-result suppression, cancellation and disposal with reads in flight.
- Remove unconditional exact-count demand through shared runner/view infrastructure; retain explicit exact-shape CPU branches.
- Add bounded optional sampling with skip-on-busy behavior, safe source-capacity growth fallback, delayed shrinking and device-limit recovery.
- Measure complete mixed pipelines and all retained/temporary/in-flight bytes; test order, source identities and interaction-resource ownership after compaction.
- Compare brushing/linked distributions, chained filters, animated predicates, compact CPU geometry and GPU marks; verify sampling/window/fold/grouping/date/category/export/callback semantics.
- Place any eventual policy on the shared data/pipeline scope with inheritance, rather than a low-level readback switch. API spelling and defaults remain undecided until those measurements.

Never substitute capacity or a stale count for synchronous logical `.length`.

## Stage 105 — autobounds and other inferred scales

### Repeated work and existing fast paths

The previous [scaleBindings.js](../src/lib/plot/utils/scaleBindings.js) computed numeric min/max using two scalar downloads. It cached completed unmasked extents, but not masked results or in-flight work. Four marks sharing a column and color/size normalization could therefore repeat the same filtered summary sixteen times per update. Facet field extents already shared an in-flight scope summary. Missing-value legend detection is a separate lazy consumer and is not changed by this prototype.

Positional [namedMark](../src/lib/plot/bound/namedMark.svelte) bounds already collected every axis into one `finiteExtents` read per mark. Text adds pixel-footprint metrics to that same reduction. The numeric summary and the resulting screen-space label reservation are different: alignment, display scale, box and leader geometry apply to retained metrics afterwards. Explicit or categorical positional domains skip numeric reductions. Frame/facet unions, padding and screen fitting operate on retained host summaries. Iterative layouts, connections, series and CPU-known grid placements keep their specialized domain paths.

Continuous color/fill, CSS size and stroke-width share the binding service. Rect/Prism widths are geometry, not stroke-width normalization; Heatmap/Surface raster fill can flatten values with row-mask broadcasting. `domainSource="source"` and shared facets resolve the original column without a visible-row mask; visible-data scales retain it. [scaleResources.js](../src/lib/plot/utils/scaleResources.js) still owns contribution unions, explicit domains, symmetric/midpoint adjustment and output encoding. Those semantics are not duplicated in the cache. Categorical domains are a separate path: [categorical.js](../src/lib/plot/utils/categorical.js) retains dictionary/category metadata, palette-keyed resources and codes keyed by the scale domain. This investigation does not replace categorical discovery or its ownership.

Palette and output-range edits already update encoding resources/uniforms without re-inferring normalization. Six output-range edits had zero reads, allocations, mark builds and shader/pipeline compilation in the baseline. Colormap changes had zero reads and mark builds, but six render pipelines/twelve shader modules as the color mapping node changed. These are existing behaviors, not improvements made by Stage 105.

### Bounded summary changes

`extentSummary.js` shares ready/in-flight work by immutable value identity, mask identity, transform and selected column. Mutable host inputs require an explicit source revision. Only the latest revision's host summary is retained for each key; device arrays are held only while the scheduled work is in flight. Rejected work is evicted. Ready requests sharing one publication owner and mask batch in a microtask, without waiting for another plot or future optional consumers.

Appearance normalization and positional reductions use the same finite-extent service. Positional reuse records geometry dependencies separately from paint and CSS-sized point styling. Data-unit glyph size, Prism footprint/rotation, line controls, current named column identities and text/font/size/offset metrics remain dependencies. View-state/other expressions and directly authored mutable objects/arrays conservatively disable reuse. Literal geometry options cannot be mistaken for identically named columns. Source generation/revision, current validity mask, axis transforms and frame domain revision still invalidate. CPU-known Image grid placements keep their existing post-publication bounds path. The early domain path uses the existing shared mark lookup, which reaches Points through their legend handle as the later domain path already did. A change to authored Points `sizeUnits`, including omission, defers the early domain read until the child publishes its effective options; the old displayed footprint cannot certify the next summary. Procedural live-write/after-write domain updates remain effective. This additional correctness guard does not change the earlier CSS-only timing scenarios, which never change units.

This keeps coherent publication: accepted data and its inferred domains settle together. It neither reduces every mark to a globally shared view version nor changes optional consumer timing. GPU-resident rendering domains remain **deferred**.

### Counters, timing and ship checklist

Instrumented six-update replays over four marks show:

| Replay | Baseline reads | Retained prototype reads | Buffer allocations, baseline → prototype |
| --- | --- | --- | --- |
| Filtered appearance, explicit positional domains | 102 | 12 | 104 → 14 |
| Filtered appearance and autobounds | 126 | 12 | 128 → 14 |
| CSS point-size edits, unchanged positional geometry | 24 | 0 | 24 → 0 |

The [earlier appearance counters](../tests/perf/investigations/results/prototype105-prelookup-instrumented.json) already show 12 reads; positional reuse is verified by the [final positional counters](../tests/perf/investigations/results/prototype105-final-instrumented-bounds_style_bounds_filter.json). The latter has zero mark builds/new compute pipelines. Style replays have zero new shader/render pipelines and steady live/peak storage of 83,469,340 bytes. Filter replays retain the existing two render-pipeline/four-shader variants and about 94.67 MB live/peak storage, with approximately 160 bytes added per replay in both baseline and prototype; this is not a long-duration leak/disposal proof.

Final **plain quiet** timings wait for every mark's expected normalization before settling. Each table entry lists three p95 accepted-update latencies, followed by median six-update wall time:

| Replay | Baseline p95 (ms) | Prototype p95 (ms) | Median wall, baseline → prototype (ms) |
| --- | --- | --- | --- |
| 5k filtered appearance | 83.6 / 59.3 / 69.2 | 69.1 / 55.2 / 53.8 | 182.6 → 148.3 |
| 50k filtered appearance | 514.5 / 508.9 / 521.6 | 516.2 / 506.6 / 520.9 | 814.6 → 797.5 |
| 50k CSS point-size edits | 47.5 / 35.6 / 30.8 | 22.7 / 18.1 / 18.2 | 170.3 → 128.1 |
| 50k filtered appearance + autobounds | 515.4 / 501.8 / 486.4 | 407.4 / 474.3 / 513.9 | 833.6 → 786.9 |

CSS-only edits improve in all three pairs: median p95 decreases **35.6 → 18.2 ms**, about 49%, and median wall time about 25%. Small filtering improves its median but one pair is below the 10% threshold. Large appearance filtering has **no tail improvement**; its median p95 slightly worsens **514.5 → 516.2 ms**. Filtered autobounds has smaller median gains and a regressing third repetition. Frame-tail measurements show the same limitation. There is **no overall frame-rate or filtering speed claim**, despite removing redundant work.

All final replays have zero captured errors, correct final domains/counts and at least six actual completed frames per six changes. All four final screenshots match at **143,178 sampled pixels each**, including nonwhite marks/guides/colorbars: [visual parity JSON](../tests/perf/investigations/results/scale105-visual-parity.json). The 31 focused unit checks pass, including five new tests for dependencies, immutable/masked/revision sharing, ready batching, mutable inputs/rejected retries, raster/scalar masking, transforms, cancellation and reference disposal.

Four additional DPR-2 rendered guards pass on the Stage105-only snapshot: same-identity direct array mutation followed by an authored prop update changes inferred domains and vector geometry; pointer geometry moves in real pixels while abstaining from domain ownership; Image grid coordinate replacement updates automatic cell-edge domains and draws the RGB cells; px/data/omitted point units keep vector radii and inferred footprint domains consistent. Under `aspect="auto"`, data-unit points expand x bounds while y retains the center domain. Omitting a pass-through option preserves its effective local setting rather than resetting it. [Guard record](../tests/perf/investigations/results/scale105-guards.json) preserves the separate runs' actual fixture/spec/patch hashes. The fifth strict guard, evolving `@time` autobounds, requires Stage100's procedural `afterWrites` publication. That updater is absent from the pre-100 source; it is intentionally tested on the final combined tree rather than hidden with a forced prop refresh. **All five guards pass on the frozen integrated source.** These guards do not by themselves establish the complete rendered/export acceptance matrix.

The decision is to **retain the narrow shared summary service and dependency-aware positional reuse**, based on reproducible CSS-only gains and strongly reduced duplicate work. The final production integration includes Stages 100–102 and must pass their rendering gates before landing. Broader scale/encoding preparation changes and animation-target-bound fitting are deferred. GPU domains remain deferred. The remaining landing checklist is:

- Verify actual accepted domains, legends and drawn pixels for masked/unmasked/empty, nonlinear transforms, Text footprints, curves and data-unit glyphs.
- Preserve the final quiet comparison, variance and control-case regressions; do not use the first old-data frame as the success point.
- Verify long-duration disposal and in-flight removal beyond the bounded counter runs; no hidden compilation growth or GPU readbacks on CSS-only updates.
- Keep invalidation explicit: immutable current column identity; revisions for mutable host data; validity/coordinate/transform changes; geometry and label-metric dependencies.
- Keep optional legend normalization lazy, separate encoding from normalization, and avoid cross-plot scheduling delays.
- Integrate only the narrow helper/mark lookup/binding changes; no public API or memory/count default change.
- Complete focused rendered/export/interaction checks and the repository's rendering-change gates before retaining the prototype.

## Sunburst profile diagnosis during integration

The [plain diagnostic](../tests/perf/investigations/results/sunburst-diagnostic-plain.json) records six click/reset flights on the uncommitted integration snapshot served on 5488, before the final Text queue-policy, row-transition deadline and graph-topology fixes. It is an investigation trace, **not the final matched baseline/current result**. No historical source fingerprint was captured; the compact records retain hashes of the actual JSON and CPU profiles instead of assigning newer source hashes to those timings.

Plain click-to-`whenAnimationsFinished()` times are **1,423–1,535 ms**, with **43–47 completed frames**, median intervals around 16.7–16.8 ms, p95 intervals **82–100 ms**, and maximum gaps **137–357 ms**. This establishes intermittent stalls; it does not establish a uniform low frame rate or a cold-compile duration. The separately [instrumented diagnostic](../tests/perf/investigations/results/sunburst-diagnostic-instrumented.json) is slower and must not substitute for plain timing.

Its asynchronous read stacks identify the following work per flight:

| Caller | Reads | Meaning |
| --- | --- | --- |
| Filter count reduction | 20–26 | Exact host row counts for changing visible rows |
| Shared extent summary | 29–38 | Numeric automatic bounds/normalization |
| Direct namedMark bounds | 2 | Specialized mark bounds path |
| namedData | 1–2 | Preparation validation/alpha checks |
| Tooltip | 0–1 | CPU content |
| JAX with caller lost across async boundary | 32–39 | Unresolved; no invented node attribution |
| Picking | 8 | Click/hover coordinate and hit payloads |

Mapped CPU samples additionally show **synchronous** `getImageData → JAX readSync/dataSync/.js → validateLayoutInput → treeHostLayout`. This is numeric width/layer-height target validation, which caches dependency keys and reads one invalid-value flag on target changes; it is separate from structural topology extraction. CPU samples establish the path, not its call count or per-frame repetition. Those reads are not counted by the `mapAsync` wrapper. Endpoint certification and dependency reuse must be verified separately on the final source. The private-field helper samples mostly map to JAX constant/ALU realization and hash construction. `get_stack`/`get_error` map to Svelte's development reactive-source and each-block bookkeeping. Across the six instrumented profiles, uniquely attributed CPU self samples include about **321–438 ms of JAX construction/dispatch**, **138–172 ms of Svelte runtime**, and **107–132 ms of HMPlot runtime**. These are call-chain classifications of CPU samples, not GPU execution measurements. Idle, unattributed program time and garbage collection remain separate; async waits overlap and their sums are not a critical-path total.

The example's 650 ms tween is one phase. Rows disappear from the visible Filter when their layout width/height reaches zero; the current example then retains departing marks for a separate 650 ms exit fade. `whenAnimationsFinished()` can include that later lifecycle. Also, repeated uploads can extend a conservative CPU row-transition deadline while unchanged GPU targets preserve their original starts. Source inspection supports both mechanisms; the historical profiles alone do not quantify their shares. The native profile driver now records passive track identities, CPU starts/deadlines, owner labels and clock time without GPU reads so final runs can separate upstream motion from the tail. A CPU deadline must not be presented as a measured GPU row start.

The committed baseline's native sunburst has no mark enter/exit fades or per-mark animated color/opacity channels. Comparing its total settlement time to the updated example therefore compares different behavior; it is not an overall speedup/regression ratio. Even the warmed distinct-bounds progress gate compares examples with different mark lifecycle work. That gate remains useful as a minimum responsiveness requirement, but its baseline/current difference alone cannot attribute a regression to the graph or tween implementation. Final matched source fingerprints and passive phase traces belong to the final integration measurement. Development-server overhead and shared shader caching remain explicit limitations.

## Final sunburst controls: filters, bounds, and remaining work

The [final causal diagnostic](../tests/perf/investigations/results/sunburst-ablation.json) compares four versions of the same frozen native integration example: original, fixed initial domains, static sector/label membership, and both controls. Each has one discarded zoom/reset warm-up and three measured zoom/reset repetitions at DPR 2. All final plain runs occurred after the other agents' CPU gates finished, with no competing browser, export or build. The served source fingerprint is `c2052a839edc9beebf40f374284dd01c2daf33bdd201b31eb3a9eb0f8fc1b535`; the JSON records original and instrumented file hashes. The later Point depth-write option is excluded.

The Tree hierarchy, GPU layout kernels, tweened width/layer-height inputs and mark lifecycle settings stay the same. Fixed domains use the actual initial extent, `x=[0,185]`, `y=[-0.16,4.16]`, so the selected branch occupies a smaller visible area. Static membership retains sectors with `depth>0` and labels inside the desired branch and below its focus level, removing the geometry/label-space predicates. It draws more labels. These are diagnostic controls with changed images; they are not replacements proposed for the example or a same-image speed comparison.

Passive clock samples identify the native Tree's procedural phase. Its last-present/first-absent samples bound completion; they do not identify exact GPU execution or row start times. Actual completed-frame timestamps show:

| Plain control | Completed frames during observed layout | Observed active rate (frames/s) | Active frame p95 (ms) | Click to all animations finished (ms) |
| --- | --- | --- | --- | --- |
| Original | 9–10 | 11.9–14.3 | 83–133 | 1,394–1,461 |
| Fixed initial domains | 9–11 | 12.5–15.1 | 79–119 | 1,418–1,483 |
| Static membership | 10–12 | 13.0–16.6 | 75–114 | 1,437–1,486 |
| Both | 10–13 | 14.1–17.8 | 63–106 | 1,421–1,465 |

The observed active interval is about 700–795 ms, including sampling/processing around the 650 ms target. The following retirement tail completes another 35–39 frames, with median intervals of 16.6–16.7 ms. Thus the roughly 1.4-second total and its 46–51 frames hide the much slower layout phase. Combining the controls improves that phase modestly; every control still has long gaps. Total settlement barely changes because the independent lifecycle tail remains.

Separate instrumentation establishes which work the controls remove:

| Control | Filter count reads per flight | Finite-summary reads | Total asynchronous JAX reads |
| --- | --- | --- | --- |
| Original | 24–28 | 35–41 | 98–114 |
| Fixed initial domains | 26–30 | 0 | 68–78 |
| Static membership | 14–16 | 38–44 | 96–108 |
| Both | 14–17 | 0 | 58–68 |

All controls also have eight picking reads. More active updates and labels mean read totals need not subtract directly between modes. About 40–51 asynchronous callers are lost across JAX boundaries in the factorial traces. A separate [direct `Array.data()` caller diagnostic](../tests/perf/investigations/results/sunburst-data-callers.json) resolves their main source without inventing a Tree attribution. Its one warmed zoom/reset pair has exactly 100/98 JAX requests/downloads, respectively:

| Direct demand | Zoom | Reset |
| --- | --- | --- |
| Animated mark source-index key tokens | 36 | 36 |
| Mark alpha/blending decision | 2 | 2 |
| Filter count | 24 | 24 |
| Finite extents | 35 | 35 |
| Event source-row mapping | 2 | 1 |
| Tooltip | 1 | 0 |

The 36 key downloads come from `namedMark`'s `indices.ref.data()` branch: each derived animated mark maps its current rows back to the table's source keys, preserving identity through entering, exiting and reordering. They occur across all three marks on each accepted Tree update, with row-array shapes matching sectors, labels and the center label. This generic decoder branch already existed in the baseline; the newly requested mark lifecycle and animated channels make the current example demand it. The two scalar alpha reads decide blending. This is direct caller evidence, independent of historical CPU-profile inference. It identifies another repeated CPU synchronization demand; removing key downloads requires a correct retained or GPU row-identity mapping, rather than disabling keyed animation.

Three mark preparations run for each Tree update. Original synchronous `prepareNamed` work totals 42–48 ms per flight. Observed Tree preparation spans cover 35–75 ms, Filter spans 218–245 ms, and bounds spans 138–165 ms of wall time per flight. **The awaited spans overlap and contain CPU construction and GPU waits**; their totals cannot be added as critical-path CPU time or called GPU kernel durations. The additional direct-caller pair is attribution evidence, not a new speed comparison.

Exact wrappers also resolve the earlier synchronous-validation uncertainty. Every flight has exactly **two** scalar `.js()` calls from `validateLayoutInput`, both near the start, totaling **4.0–6.8 ms** across all controls. Their four nested `getImageData` calls are the implementation of those two semantic reads. No validation `.js()` call repeats during the subsequent layout frames. This is numeric target validation; it does not explain the sustained active-frame stalls.

The evidence supports repeated Filter, bounds and animated row-key work as contributors, while removing the Filter/bounds demands alone leaves most of the slow active phase. It does not isolate pure GPU Tree kernel cost: expressions, upstream publication, mark updates, keyed-row reads, dispatch and development runtime work remain. The integration now includes the narrow unchanged-membership mapping reuse described below; a new causal trace must measure that source separately while preserving drawn labels and geometry. GPU timestamps are required if claiming kernel duration. Broad pipeline changes remain deferred; the ablation above measures the source before this mapping follow-up and does not establish its performance gain.

A follow-up audit narrows the implemented cache. The center label's `id == focus` mask
stays unchanged during a flight, but the profiled views recreated its compacted indices.
Sector and label predicates depend on moving geometry; identical row counts cannot certify
identical membership. Filter now retains a lazy row descriptor for its cached immutable mask,
sharing compaction and source mapping only while the parent's actual ordered index array holds.
Cache and output views own separate leases, so replacing or disposing the cache preserves
retained old views, including a first lazy read afterward. The generic decoder shares pending
and completed numeric downloads by immutable array identity. A successful download consumes its
read reference; a rejected read releases that reference and evicts the promise. Completed entries
retain CPU values without an extra GPU reference. Marks map these numeric rows to their own
current table tokens; data identities and token generations are not cached globally. Existing
row-changing barriers remain intact. This is a bounded implementation, not the broader GPU
identity or global transform-cache proposal; its final rendering/progress gates remain separate
from the historical ablation numbers.

The temporary ablation fixture, recorder wrappers and original screenshots remain under `/tmp/hmplot-stages100-105/sunburst-ablation`, `ablation-final` and `ablation-results`. They were not added to the public API or production source. The checked-in JSON retains exact per-repetition timings, completed-frame times, track episodes, query spans, synchronous call counts and source/raw-artifact hashes.

### Drawing and label alignment follow-up

An actual-clock DPR-2 read-only trace exposed a separate rendering failure: the focused
sector's GPU opacity reached intermediate values while its mesh stayed opaque. Polar Rect,
Prism and GeoJSON meshes now use continuous row alpha, and mesh blend selection includes row
opacity. Intermediate PNG assertions cover the material, alongside displayed-field/SVG checks.

The same trace distinguishes current labels from retired labels. Brand and Digital's drawn
coordinates exactly matched Tree's current columns. Experience matched until its label-space
Filter removed it; its exit retained x=66.21 while the angular extent subsequently shrank to
50. Operations was already removed and retained x=170. Those retained coordinates were
remapped by the changing polar scale, causing the flying labels. The example now keeps branch
labels in a fixed depth-selected table and animates a visibility expression, so fading labels
continue to receive current geometry. This uses ordinary table and mark behavior. Raw trace
and screenshots: `/tmp/sunburst-label-before-*`. These diagnostic GPU reads are not
quiet frame-rate measurements. Final rendered checks and progress are recorded in TESTING.md.

### Final current-column reuse measurement

The [previous correctness-baseline plain replay](../tests/perf/investigations/results/sunburst-correctness-baseline-geometry.json)
and [instrumented replay](../tests/perf/investigations/results/sunburst-correctness-baseline-instrumented.json)
served source fingerprint `af3dce9a958ad64a7d7919b6514ff3ffd089fc06856f1e09669e48756c5158cc`.
The [current plain replay](../tests/perf/investigations/results/sunburst-live-geometry-plain.json)
and [instrumented replay](../tests/perf/investigations/results/sunburst-live-geometry-instrumented.json)
served `546ff34e6088287717a641e1ff0b7680b4255a06b69d8b61b5f8b6c2a52dd95d`.
Each records three native zoom/reset pairs in Chrome 154 at DPR 2; the first pair warms the
workload, and the following two pairs supply these steady-state ranges. Plain timing and
instrumented work counts are separate measurements.

| Per warmed flight | Previous correctness baseline | Current source |
| --- | ---: | ---: |
| Changed bounds drawn, excluding the initial geometry | 10–11 | 12–13 |
| Completed frames through full settlement | 47–48 | 50–51 |
| Plain frame-gap p95 | 66.8–83.1 ms | 51.8–54.8 ms |
| Plain full-settlement wall time | 1,401–1,505 ms | 1,413–1,449 ms |
| Instrumented JAX readbacks | 69–74 | 37–39 |
| Picking readbacks | 8 | 8 |
| GPU submissions | 1,243–1,359 | 637–641 |
| Buffer allocations | 898–965 | 550–576 |

These runs include both generic runtime reuse and an intentional example change: sectors
remain in a fixed depth-selected table, and changing visibility is expressed by opacity.
Their gains must not all be attributed to the runtime. Exact row identity and immutable
dependency checks now allow the sector's numeric geometry to update without rebuilding its
static fields; the unchanged center Text retains its current preparation. Passive counters
record **13–14 geometry writes and 13–14 static Text reuses** per warmed plain flight. The
preparation-request counter still increments before either shortcut, so its 45–48 requests
are not 45–48 full preparations. These improvements produce more intermediate geometry;
they do not establish 60 fps during layout motion or a substantial full-settlement speedup.
Later label paint transitions and conservative CPU completion deadlines still extend the
settlement tail beyond the 650 ms layout tween. CPU deadline resets do not measure GPU
transition starts.

The current instrumented flights resolve the remaining reads: **34 extent summaries, one
Filter count, one source-row mapping, one or two translucency checks, zero or one tooltip
read, and eight picking reads**. CPU samples attribute 238–256 ms to JAX construction/dispatch,
66–83 ms to Svelte development runtime, 91–104 ms to HMPlot, and 10–26 ms to Three. Idle and
unattributed program time remain separate; these values are neither GPU execution times
nor a critical-path breakdown.

The summarizer also retains selected synchronous call-chain samples. In the warmed flights,
named-channel preparation accounts for 80–91 ms and Text atlas/footprint preparation for
31–47 ms of sampled CPU time. Domain preparation has 12–14 ms, Tree host orchestration
37–52 ms, and procedural current-field writes 19–23 ms of inclusive samples. These groups
overlap, omit callers lost on asynchronous resumes, and use the summarizer's 32-frame
call-chain window; they must not be added into a wall-time total. Source inspection explains a concrete
remaining demand: moving branch labels still use full named-channel preparation because
their color/opacity targets and geometry change together. `marks/labels.svelte` also rebuilds
code validity and per-label width arrays whenever its combined geometry/text effect runs,
while `labelMetricFields` remeasures stable strings and rebuilds footprint inputs. The atlas
texture itself is already cached; the finding does not imply a new texture is allocated for
every frame.

A bounded follow-up identified at that snapshot was to separate stable Text payload preparation—dictionary,
codes, font widths, and atlas lease—from moving positions and animated paint. Reuse must be
certified by immutable source columns, captured primitive dictionary contents, exact row
mapping, font and relevant style revisions; changed text, row order/membership, host edits,
and failed or disposed preparations must invalidate it. Dynamic paint and label bounds must
still update, and uploads must preserve coherent row/field publication. The subsequent
implementation and matched controls are recorded below. Extent reads also remain the largest
read count; reducing them requires matched investigation of domain publication rather than
freezing moving bounds. Pure GPU Tree kernel time is still unmeasured.

### Bounded Text payload implementation and matched control

[labelPayload.js](../src/lib/plot/utils/labelPayload.js) now keeps one current text payload per
Text component. An unchanged host text array is compared by copied semantic strings, so an
in-place edit is observed. Dictionary codes require exact immutable local/foreign JAX identity
or a copied host-code snapshot, together with copied category strings. Unknown representations
cannot certify a hit. Positions, size, offsets and animated paint still update independently.
Current, pending-upload and displayed payload leases retain arrays and the atlas separately;
replacing or disposing a component cannot free an older upload's inputs. Cache misses compile
code validation and width gathering through the existing `planProgram` helper. The atlas
texture already had a semantic cache; this adds no claim of eliminated per-frame textures.

Host font measurements share an exact font/string cache between the atlas and label bounds:
at most 64 entries and approximately 256 KiB of metric payload per document, with no GPU
references. Returned widths are copies. Font loading events and observed FontFaceSet/face
identity, status and descriptor changes invalidate it; fallback measurements while fonts
are loading are uncached. Text payloads also capture the font revision. This does not redesign
the existing atlas's handling of font changes after creation: custom late font loads remain
an atlas limitation, while normal plots initialize the default font before mounting.

The [control plain replay](../tests/perf/investigations/results/sunburst-text-control-plain.json)
and [control instrumented replay](../tests/perf/investigations/results/sunburst-text-control-instrumented.json)
use source `0b5711d54eb4b92bb3d676ea089eeb7735f8602bd146834dd46ace246f36750e`.
The [payload plain replay](../tests/perf/investigations/results/sunburst-text-payload-plain.json)
and [payload instrumented replay](../tests/perf/investigations/results/sunburst-text-payload-instrumented.json)
use `5b21c78025b60bd975bb5d485fb48f4fd274badc6e79cb6608e24f06ba3e18c7`.
The control copies the same final integration and restores only the earlier `labels.svelte`
and `labelAtlas.js`, omitting the unused new payload helper. Tree, the authored example,
current-column reuse, raw Rect updates, interaction-scope refresh and preparation acceptance
are identical. Each native replay uses Chrome 154 at DPR 2, three zoom/reset pairs, with the
first pair discarded as warm-up. Timing and work-counter runs remain separate.

| Per warmed flight | Text control | Text payload |
| --- | ---: | ---: |
| Changed bounds drawn, excluding initial geometry | 13–14 | 13–15 |
| Changed bounds per second during sampled geometry motion | 19.3–20.5 | 19.6–22.3 |
| Plain frame-gap p95 | 51.4–63.6 ms | 51.1–79.4 ms |
| Plain full-settlement wall time | 1,404–1,470 ms | 1,405–1,470 ms |
| Instrumented JAX reads | 37–45 | 37–43 |
| Instrumented geometry writes / static Text reuses | 14–17 each | 14–16 each |
| Buffer allocations | 479–512 | 458–496 |
| GPU submissions | 634–722 | 615–677 |
| Warm compute/render pipelines or mark builds | 0 | 0 |

The geometry rate divides the number of changed drawn bounds by the wall interval from the
first sampled geometry to the last changed geometry; it is not the canvas's later fade-frame
rate or the declared 650 ms divided into a count. The results overlap and a payload flight has
a worse p95 gap. **No reliable animation-rate or settlement improvement is established by
this Text-only comparison.** Counts also depend on how many geometry updates land; normalized
allocation counts overlap. The sunburst still advances geometry at roughly 20 updates/s.
Its branch labels receive newly gathered dictionary codes each publication, so they normally
miss the exact-identity payload cache; cache adoption is established by focused behavior
tests, not by these sunburst timings.

The dedicated [rendered Text guard](../tests/browser/label-options.spec.js) passes at DPR 2
(21.6 s). Moving labels preserves the exact glyph-code and glyph-width field inputs while
changing PNG pixels; changing their text changes both pixels and searchable SVG content.
Each settled label update creates zero render pipelines before export. Fresh hybrid-export
targets compile independently and are outside that update-counter interval. The focused
payload/metric ownership and invalidation unit checks also pass.

Current warm CPU samples attribute 191–239 ms per full flight to JAX construction/dispatch,
83–102 ms to HMPlot, 65–83 ms to Svelte development runtime and 11–27 ms to Three. Inclusive
named-channel preparation is 71–93 ms and Text atlas/footprint work is 18–46 ms; synchronous
expression evaluation accounts for 69–84 ms. These overlapping call-chain groups cannot be
added or presented as GPU execution. Direct canvas-measurement samples are at most 1.5 ms
per flight, so font measurement was a small part of the remaining cost. Extent summaries
still contribute 34–38 reads per warmed flight. At this Text-control snapshot, the next
bounded comparison was to compile pure numeric mark-channel targets and investigate domain publication; preserving integer
comparisons, masked reductions, metadata, current masks and tween ownership requires explicit
parity checks. Simulate's current compiler excludes reductions and tweens and is not a safe
drop-in replacement. This Text comparison includes neither a broader compiler nor GPU-domain changes;
the later isolated compiler investigation is recorded below.

An initial control accidentally reached an earlier server on occupied port 5495. Its local
fingerprint did not describe the served source; those timings are
[discarded](../tests/perf/investigations/results/sunburst-text-invalid-run.json) and excluded
from this comparison. The driver now verifies representative served `?raw` hashes against
local `namedMark.svelte`, `labels.svelte` and `sunburst.svelte` before profiling. The retained
control instrumented and payload plain runs pass this check. The other two runs precede the
check, used confirmed correct listeners, and retain that limitation in their JSON. This
verification samples representative files and does not hash every executed compiled chunk.

### Isolated numeric target compilation

The next private snapshot traces **the existing numeric expression evaluator** through JAX,
rather than replacing its operators. The bounded wrapper admits exact-length one-dimensional
numeric columns and masks, passes changing numeric literals as typed runtime inputs, and
retains evaluator metadata, dtype, cardinality and dependencies. Calendar, categorical,
grouped, grid, time, random, tween and unsupported expressions use the ordinary evaluator.
The 64-plan owner cache includes actual dtype/shape signatures; eviction and teardown
release traced programs without invalidating already returned outputs. These were prototype
contracts at capture, not a new public expression API.

The [corrected CPU check](../tests/perf/investigations/results/numeric-expression-cpu.json)
materializes results with `dataSync()` and asserts a typed array of the exact shape size. It
checks numerical and integer comparison oracles, changing masks/literals, mixed constant
roots, output aliases, borrowed/owned virtual columns, real trace failure, mutated authored
ASTs and unread outputs after cache eviction/teardown. All source reference counts return to
one. Its two 1,000-iteration CPU trials are 1,171/1,091 ms for eager evaluation and 212/247 ms
for compiled evaluation. An earlier driver converted an asynchronous `data()` Promise with
`Array.from()`, producing empty arrays; **that earlier parity and timing evidence is invalid
and excluded**. The corrected CPU microbenchmark does not predict GPU responsiveness.

The GPU replay keeps the same example, hierarchy, masks, layout kernels, paint targets,
lifecycle fades and current-column reuse. Chrome 154, DPR 2 and a warmed shared Metal cache
are the same in both conditions. Separate plain and instrumented runs use three zoom/reset
pairs; the first pair is warm-up. The control was repeated after the compiled run to check
ordinary timing drift. All records verify representative served sources against local bytes;
the compiled condition additionally verifies its private helper. Control source is
`fa29298ebbd745f28eee986e7bf94faa5174b5babe2fe09d311abec46cfaefcf` and compiled source is
`7f36d41fe515e027188aef18bb15d8fb64ffc04feaaa2cb35661978e1b5895d1`.

| Per warmed flight | Eager control | Repeated eager control | Compiled targets |
| --- | ---: | ---: | ---: |
| Changed drawn bounds, excluding initial geometry | 13–16 | 13 | 18–19 |
| Changed bounds per second during sampled motion | 19.4–24.3 | 19.8–20.4 | 27.3–29.6 |
| Plain frame-gap p95 | 50.3–65.9 ms | 51.3–54.2 ms | 38.7–57.8 ms |
| Plain full-settlement wall time | 1,399–1,444 ms | 1,408–1,470 ms | 1,376–1,406 ms |
| Instrumented buffer allocations | 476–491 | — | 157–174 |
| Instrumented JAX readbacks | 37–43 | — | 43–51 |
| Instrumented extent readbacks | 34–38 | — | 40–46 |
| Named-channel CPU samples, inclusive | 77–94 ms | — | 42–45 ms |
| JAX construction/dispatch CPU samples | 204–226 ms | — | 162–191 ms |
| Warm compute/render pipelines, shader modules or mark builds | 0 | — | 0 |

The [plain control](../tests/perf/investigations/results/sunburst-numeric-control-plain.json),
[repeated control](../tests/perf/investigations/results/sunburst-numeric-control-repeat-plain.json)
and [compiled replay](../tests/perf/investigations/results/sunburst-numeric-compiled-plain.json)
establish more geometry updates in the same sampled motion phase. The
[instrumented control](../tests/perf/investigations/results/sunburst-numeric-control-instrumented.json)
and [compiled counters](../tests/perf/investigations/results/sunburst-numeric-compiled-instrumented.json)
attribute a large allocation reduction and lower numeric-target preparation CPU work despite
more updates. Buffer allocations per geometry write fall from about 31–35 to 9. JAX reads
per geometry write remain about 2.3–2.8; total reads and submissions increase with the number
of completed updates. This optimization addresses expression construction, **not the remaining
CPU synchronization**. The animation is still roughly 28 geometry updates/s, and later paint
transitions keep settlement near 1.4 seconds. It does not establish 60 FPS or pure GPU kernel
time. These numbers describe the private `experimentalNumeric.js` capture and its exact hashes.

At this investigation's snapshot, the retained production helper was `numericExpressions.js`
(the current entry is [expressionPlans.js](../src/lib/plot/utils/expressionPlans.js)), owned by each named mark
through `createNumericExpressionEvaluator()` and disposed with that component. It also performs
cheap authored-form rejection and bounds remembered trace failures; unsupported operations keep
the original evaluator. This rename and conservative cleanup do not turn the earlier prototype
hash into a measurement of the final tree. The 103 focused reduction/kernel/literal tests and
Svelte/type check pass. The private unchanged native fade/PNG/SVG guard passes; final integrated
bundle/rendering verification belongs to Stage106 and TESTING.md. Broader eligibility remains
excluded rather than inferred from this sunburst result.

### Compiled Text preparation and animated opacity controls

A later five-way diagnostic keeps the integrated numeric compiler, Tree inputs and topology,
Rect selection, center label and legend unchanged. Its frozen source is
`c7a3af8d43a56e13418c20e97f761304c2174db7010800f232e69395e50a85c2`.
It predates only later conservative admission guards for unsupported host arrays and effective
metadata; these controls use device masks and do not exercise those guards. All conditions
verify the same served sources. Each replays a zoom/reset warm-up and three later pairs at
DPR 2, using the full condition's exported Design/Studio click coordinates. Plain runs contain
only integer work counters; CPU/read instrumentation runs separately. Original screenshots
and profiles stay under `/tmp/hmplot-sunburst-text-ablation-final-{plain,instrumented}`.
The [retained per-flight evidence](../tests/perf/investigations/results/sunburst-compiled-text-ablation.json)
includes exact preparation counts, source verification, CPU/read attribution and raw hashes.

Progress here counts changes in the accepted Rect live-write counter observed on completed
frames, excluding its initial value. This continues to measure publication progress when
explicit domains do not change. It is a proxy for geometry responsiveness, not GPU execution
time. For automatic-domain conditions it agrees closely with sampled changed drawn bounds.

| Plain warmed flight | Sampled publications/s | Branch Text full preparations / domain contributions | Frame-gap p95 | Full settlement |
| --- | ---: | ---: | ---: | ---: |
| Full animated visibility | 24.9–28.0 | 19–21 / 19–21 | 49.4–67.2 ms | 1,384–1,428 ms |
| Branch glyph drawing hidden | 26.6–28.9 | 21–22 / 21–22 | 48.2–52.3 ms | 1,376–1,409 ms |
| Branch opacity fixed to one | 49.7–55.9 | 34–38 / 34–38 | 33.3–63.3 ms | 725–727 ms |
| Branch Text removed | 51.7–60.3 | 0 / 0 | 18.8–36.8 ms | 714–727 ms |
| Initial full domains fixed | 28.5–30.2 | 22–23 / 0 | 34.6–40.1 ms | 1,380–1,398 ms |

Hiding branch drawing leaves one full preparation and a two-field domain contribution per
branch publication, exactly as in the full condition; the higher total follows its slightly
higher update count. Center Text remains visible and its root screenshot crop matches the
full condition byte for byte. This control bounds glyph drawing as a small contributor in
this scene. Constant opacity retains the branch Text and **more** preparations/domain updates,
yet allows roughly twice as many geometry publications. It removes both the `labelShown`
target expression and its explicit animated opacity publisher/transition. Those mechanisms
are not independently isolated. Removing the branch Text provides similar geometry progress.
Fixed domains remove all extent-summary reads, leaving 3–5 other JAX reads, but improve active
progress only modestly; extent synchronization alone does not explain the remaining limit.

| Instrumented warmed full flight | Full animated visibility | Constant branch opacity |
| --- | ---: | ---: |
| Branch Text preparations | 20–22 | 35–38 |
| JAX reads (extent reads) | 45–51 (42–46) | 78–84 (73–79) |
| Buffer allocations | 159–176 | 156–165 |
| Queue submissions, **whole flight** | 727–785 | 728–785 |
| Target-expression synchronous CPU samples, nearest assignment | 31–34 ms | 7–13 ms |
| Named-channel CPU samples, inclusive | 40–48 ms | 28–33 ms |
| Array-field publication synchronous CPU samples, nearest assignment | 18–25 ms | 30–40 ms |
| Transition-clock synchronous CPU samples, nearest assignment | 1–10 ms | 4–10 ms |
| Warm shader modules / compute pipelines / render pipelines / mark builds | 0 | 0 |

Counts describe the entire flight. Full opacity includes a later roughly 650 ms fade-only
tail, whereas the constant-opacity control settles after the layout phase. Tail rendering
and row-blend dispatches therefore confound submission totals divided by geometry updates;
that ratio must not be called extra active-alpha work. The faster condition also publishes
more geometry, which explains its greater extent count. Synchronous target-expression
samples differ by only about a millisecond per publication, insufficient to explain the
entire active-rate difference. Array publication and transition-clock samples likewise do
not expose all asynchronous or GPU transition work. Inclusive CPU groups overlap; idle/program
samples are not GPU duration, and awaited reads are not independent critical-path sums.

This proves a useful causal region: the **combined animated array-opacity path**, rather than
glyph drawing or bounds alone, limits this example's geometry progress. It does not identify
a single defective operator or establish pure GPU layout/transition time. The controls change
alpha, labels or visible coverage and are not production substitutes for the requested fade.
No animation runtime change follows from this ablation. A next investigation would measure
target materialization, retarget dispatch and draw-only tail separately within the same active
layout interval, then require unchanged current glyph positions, concurrent fading, picking
and exports before retaining any optimization. Portable preparation, replay and summary
commands are in the [experiment README](../tests/perf/investigations/README.md#compiled-text-ablation).

### Ready extent batching diagnosis

A separate source-verified observer records request arrival, owner/mask identity, flush groups
and read-start/end timestamps without adding GPU reads or retaining input arrays. It uses the
ordinary eager-control implementation, not the numeric compiler. Its instrumented source
fingerprint is `423d27256dee583da0d8b30aac72798711006872e23176d2e458937abdd3a98e`;
the [summary](../tests/perf/investigations/results/sunburst-extent-flush.json) and
[raw host events](../tests/perf/investigations/results/sunburst-extent-flush-events.json)
retain source verification and hashes. Two earlier setup attempts failed before measurement
and contribute no accepted data. This observer adds timestamp/event allocations, so its wall
spans are diagnostic and are not substituted for quiet plain timings.

Across the four warmed flights, one frame owner issues 34–36 extent reads from 32–34 flushes.
Each flight has **only two flushes with multiple masks**, both in the first 33 ms after its
first extent read. Each combines one unmasked four-request group with one masked six-request
group, whose waits already overlap. All subsequent flushes have one mask. Existing reads
already combine six requests at both the median and p95. Arrival-to-read median is 0–0.1 ms,
p95 is at most 0.6 ms; occasional maxima are 5.3–10.3 ms. Read-await p50 is 3.4–4.0 ms and
p95 28.3–35.4 ms. Overlapping awaited spans cover 127–142 ms per flight; neither this interval
union nor their sum is pure GPU execution or an exclusive critical-path measurement.

Merging heterogeneous masks that are **already ready** could remove at most two reads per
flight, about 5.6–5.9% of the observed extent reads. It would not remove one read per layout
update. This does not justify adding a heterogeneous-mask implementation as the next
sunburst optimization. Most Rect and Text requests arrive in separate asynchronous
publication steps. Joining those would require holding current domains while waiting for
future work and proving ordering, failure and disposal behavior; that broader coordinator
change is deferred. The narrow Stage105 service retains its immediate-ready contract.

## Acceptance evidence and remaining scope

“Conditional N/A” below means a production-path requirement does not apply after the recorded do-not-ship decision. “Untested” remains a limitation; it is not implied by an isolated shader or a source audit.

| TODO item | Evidence and scope |
| --- | --- |
| 103.1 | Source inventory plus exact/nearest/tooltip/disabled baseline counters; CPU payload and resource consumers identified. Picking-pass and downstream JAX costs distinguished. |
| 103.2 | Three baseline repetitions of dense hover and stationary/hover sunburst; disabled/tooltip controls and expandable-tree input replay retained. Selection-to-downstream-filter and callback-demand timing were not separately measured. |
| 103.3 | Bounded existing-texture GPU query, nearest radii/ties, shared result, pooled notification and real visual feedback. **Not integrated** with production interaction columns, transformed/linked row mapping or shared resource arbitration. |
| 103.4 | Final CPU/GPU parity and three timing repetitions fail the 10% + 1 ms target; do not ship. |
| 103.5 | Conditional N/A: no production GPU path. Callback/Python/event ordering/resource semantics are untested prototype extensions. |
| 103.6 | Bounded exact/nearest hit and pixel parity, warmed counters, completed feedback, zero GPU-only query reads. Occlusion/masks across multiple marks, linked/transformed views, touch/modifiers, animated moving targets, export/disposal-in-flight are untested. |
| 103.7 | No post-integration repeat exists because nothing ships. Stable pre-migration experiment source and final evidence retained; current production pipeline is unchanged. |
| 104.1–104.2 | Count/capacity/group/geometry distinction and producer/consumer source classification recorded. No public length change. |
| 104.3 | Three small/million-row GPU-mask replays, dense/sparse/empty/all-visible and mixed background CPU demands; accepted frame checks and memory recorded. Brushing/linked/chained/animated-predicate and compact CPU-node pipelines are untested. |
| 104.4–104.5 | Private physical facade, shared async exact count, bounded leases, coalesced revisions and stale notification guard. Runner/snapshot ownership and optional skip-on-busy production policy are proposals, not integrated changes. |
| 104.6–104.7 | Source/compact payload controls quantify memory versus critical reads/allocations and exact sparse-to-dense results. General hysteresis, device-limit handling, peak temporary overlap and inherited Auto/Compact policy remain follow-up. |
| 104.8 | Exact count/sum/mean, true empty/full masks, coalesced revisions and frame progress verified in the isolated prototype. Node-complete sort/sample/window/fold/group/date/category/topology/selection/export/callback parity is untested. |
| 104.9 | Bounded feedback + downstream GPU mean/payload pipelines measured; current defaults retained, private-facade follow-up recommended. Full production pipeline comparison remains required before API/default decisions. |
| 105.1 | Numeric/positional/categorical/facet/legend/encoding source audit; measured actual duplicates and existing zero-read encoding paths. |
| 105.2 | Three baseline/control/final scale repetitions, final four-control native sunburst replays, and earlier tree/hover/million-row diagnostics. Nested/shared-independent facets, animated appearance scales, source/data policy and legend-only changes have source/unit evidence, not complete new matched timings. |
| 105.3–105.5 | Retained immutable/revision/mask/transform cache, inflight deduplication, ready microtask batching and conservative geometry dependencies. Animation-target bounds are not frozen or changed. |
| 105.6 | 31 focused units, final domain/count/frame and pixel parity checks, four Stage105-only rendered guards, and all five integrated rendered guards for mutable arrays, evolving-time bounds, pointer abstention, Image placement and point-unit footprint changes. The full nonlinear/date/inverted axes, label/glyph geometry, facet/removal/interaction and PNG/SVG/PDF gates belong to final combined-tree verification; bounded measurements alone do not mark them passed. |
| 105.7 | Reuse/batching and combined counters versus matched plain timings; narrow retain decision with explicit regressions/variance and the landing checklist above. GPU domains, broader preparation changes and public API/default changes deferred. |

## Current scale controls (2026-10-07)

The [current matched controls](../tests/perf/investigations/results/scale-current-controls.json)
extend the old Stage105-only snapshot to the current integrated implementation. One frozen
source, `2097937ec98c306ae6b4d832ffeed989efcc26e49a48566b7a7f58b681e6c6b2`, retains seven
complete cases under `none`, `reuse`, `batch`, and `both`, with three warmed repetitions each.
Every authored mark update draws before the next one is applied. Plain timings are separate
from intrusive GPU-counter runs; row/count/domain checks and sampled final RGB screenshots
match within each case. Temporary raw records remain under
`/tmp/hmplot-scale-matrix-oct7-{final-plain,remaining-plain,final-instrumented}`.

| Case, six authored updates | Plain median wall, none → both | Counter median reads, none → both |
| --- | ---: | ---: |
| 128-row filtering, four marks | 99.1 → 99.2 ms | 102 → 12 |
| 50k CSS-size updates, four marks | 166.7 → 136.6 ms | 72 → 0 |
| Nested Frame CSS-size updates | 99.3 → 99.2 ms | 72 → 0 |
| Shared facets CSS-size updates | 99.8 → 99.5 ms | 144 → 0 |
| Source-domain filtering | 99.0 → 99.4 ms | 102 → 12 |
| Legend-only DOM changes | 249.3 → 249.4 ms | 0 → 0 |
| Animated appearance values, 180 ms each | 1198.6 → 1199.8 ms | 30 → 12 |

50k size updates improve all three repetitions (median p95 frame interval 33.8 → 26.3 ms).
Small/nested/source/legend/animation wall times remain broadly similar. Saved reductions
and waits do not establish a universal frame-rate gain. Mark-only warmed controls create
no shaders; legend remounts create 15 per six-step repetition in every variant. Most peak
memory differences are negligible; 50k style peak live memory is 84.07 versus 83.47 MB.

Independent facets fail exact final colorbar-label parity in 29 sampled RGB pixels, despite
matching accepted mark domains/counts, so that case is excluded pending guide-scope/order
diagnosis. Earlier fixture attempts used incomplete facet handles or an intermediate
`filteredCount` for unfiltered data. The final fixture reads the committed storage count
for unfiltered marks; its failed readiness attempts are excluded. The matrix's larger
filtering and palette/range cases remain unmeasured here, and broad Stage105 coverage remains
open. The two production fixes are correctness changes for mutable-mask revision batching
and mutable/in-flight missing-value checks, not new Sunburst preparation optimizations.

## Current Sunburst CPU work (2026-10-07)

[Retained runtime-work evidence](../tests/perf/investigations/results/sunburst-current-runtime-work.json)
uses the current Stage 107/108 implementation in one frozen native snapshot,
`4437542a8d870c6b1293327fecd3e32ff7b936cfa6a05d700ed3d0a38d940594`. Each condition verifies
representative served sources and uses Chrome at DPR 2. Plain replays retain three warmed
zoom/reset pairs; CPU sampling and JAX primitive-hook runs retain two warmed pairs separately.
These runs retain the authored layout and fades. Removing branch Text is a diagnostic control
that changes both visible content and the later fade retirement period.

The terminology describes several different kinds of work:

| Term | Work performed |
| --- | --- |
| Gather | Select values by row index, such as `[a, b, c, d]` with indices `[0, 2]` becoming `[a, c]`. Filtered columns are gathered lazily when a consumer reads them. A cached row mapping can survive a layout update while the new view still gathers its columns again. |
| View construction | Create the table wrapper that records rows, columns, identity, metadata and ownership. This is CPU bookkeeping. Creating a view does not itself copy every column, but it creates a new cache for later reads. |
| Channel preparation | Resolve authored inputs such as `x="x"` and an opacity expression into typed fields, check their row shapes, encode categories, and prepare position/color/size arrays and scale settings. |
| Glyph data | Map label rows to entries and widths in a cached text atlas, then prepare positions, size and paint for rendering. Unchanged words can still get new gathered code arrays. This does not imply recreating the font atlas each frame. |
| Bounds reduction | Collapse coordinate arrays to min/max summaries. Text also contributes font/size/offset footprints. GPU reductions produce the summaries; the host receives them for fitting frames and guides. |
| Reshape | Describe the same values with a different arrangement, for example `[x1, y1, x2, y2]` as `[[x1, y1], [x2, y2]]`. A reshape can be metadata-only; array descriptions and shape checks still have CPU costs. |
| Padding | Add values required by a storage format: the current Three storage path pads `(x, y, z)` to `(x, y, z, 0)` for a four-float stride. Materializing that field can require GPU work. It does not mean uploading every mark's maximum capacity. |
| Allocation | Create JavaScript descriptions, arrays or GPU resources and later release them. These are distinct counters; a frontend array operation does not imply a new GPU buffer. |
| Submission | Encode GPU commands, establish their bindings and submit a command buffer. A submission can contain multiple calculations or copies. Frontend primitive calls are not submission counts. |

The primitive hook counts frontend operation **binds**. In particular, one `jit` bind invokes
one compiled program and hides its internal arithmetic. Repeated `jit` calls are not evidence
of repeated compilation. Across the four warmed operation-hook gestures:

| Normalized work | Full branch Text | No branch Text |
| --- | ---: | ---: |
| Live Rect geometry writes | 152 | 159 |
| Frontend primitive binds | 10,158 | 3,663 |
| Binds divided by live writes | 66.83 | 23.04 |
| Gather binds divided by live writes | 21.92 | 6.43 |
| Label-payload compiled calls | 168 | 16 |
| Text-footprint compiled calls | 168 | 8 |

These counts include initial/final preparations and retirement work. Dividing by live writes
normalizes the workload; it does not isolate an exact frame. Every branch-label layout
publication takes the full preparation path. Rect uses current live fields, while the static
center label usually reuses its prepared payload.

Separate sampled CPU call chains support this preparation diagnosis. Mean named-channel
preparation samples are 56.26 ms per warmed full gesture versus 3.13 ms without branch Text;
Text atlas/footprint preparation is 29.80 versus 0.31 ms. Current compiled target-expression
evaluation samples are 0.94 versus 0.31 ms. JAX construction/dispatch samples total 204.97
versus 116.98 ms. These are synchronous sampled CPU categories, not GPU durations or a
critical-path decomposition; async resumes can lose callers. Full gestures also last longer
because they retain branch-label fades. The data does not assign all the remaining CPU time
to expression arithmetic or the Tree layout algorithm.

The source explains a concrete repeated-work mechanism: `createDataView` creates a fresh
column cache; a filtered read gathers dictionary codes into a new array even when the
underlying names and row mapping are unchanged. `createLabelPayload` compares immutable
device code identity, so the new array misses that cache and repeats its compiled code/width
preparation. The atlas itself remains cached. This is a candidate for a general immutable
column/mapping reuse improvement. It has not yet been implemented or measured as a speedup.
Such a change must retain bounded ownership, refresh changed geometry and virtual fields,
and preserve simultaneous opacity/layout updates and exports.

Small row counts make repeated setup and CPU/GPU coordination more visible. A small SVG
implementation could update existing paths with much less preparation; that is an architectural
expectation, not a measured comparison with D3. These headless development replays do not
establish the performance of the user's interactive tab or a production build.

## Data and mark preparation (Stages 109–111, 2026-10-08)

The repeated-work mechanism described in the October 7 section is now addressed in shared
data and mark infrastructure. [Retained results](../tests/perf/investigations/results/preparation-109-111.json)
contain 34 separate captures of the **native Svelte diagnostic fixture**, each with one
discarded warm-up pair and **five measured zoom/reset pairs**. Baseline is `b8ded729`;
Stage 109 adds data reuse; Stage 110 adds dependent
mark updates; Stage 111 is a private backend experiment. All use frozen sources/fork artifacts,
fresh isolated servers/caches, DPR 2, Chrome 154.0.8037.98 and an Apple M2 Max with 32 GiB RAM.
The inspector is disabled. Production captures verify loaded JS bytes against the frozen
build; development captures verify representative served sources. Source/fork fingerprints,
source-map hashes, raw-summary hashes and individual flights are retained.

Plain timing, CDP CPU sampling, frontend primitive hooks and GPU counters ran **serially as
separate conditions**, with no competing builds or suites. This keeps counter/sampling
overhead out of the plain frame comparison. Whole gestures retain the existing geometry,
automatic bounds and fades, followed by 200 ms of observed idle. A final boundary draw can
fall in that idle window. Bounds motion, fade retirement and idle are reported separately;
the last accepted domain change approximates the end of layout motion, rather than providing
a GPU/layout timestamp.

### What changed

**Data-owned category encoding:** ordinary string columns retain ordinary host access.
Their first encoded use acquires a shared dictionary/code column from the data scope.
Dictionary-encoded inputs pass through. Snapshot readers capture original contents and retain
code leases, including when the source updates or is disposed. Text/views reuse these codes;
font and scale mappings remain with their consumers. In-place supported host updates use
the existing accepted-source validation, rather than being assumed immutable.

**Mapping-owned gathers:** retained immutable row mappings own an LRU of gathered device
columns, including numerical columns. Keys qualify the actual source values, revisions,
logical metadata and column identity. New geometry gets new values; unchanged names/codes
keep their identity across views. Virtual state, uncertified mutable inputs and unsupported
geometry retain their previous path. Each mapping holds at most **64 entries / 16 MiB** of
array payload; oversized results bypass it. Eviction/disposal release the cache lease while
active views/callers keep their own references. Snapshots and aggregates remain boundaries.

**Dependent mark updates:** the existing preparation owner now records consumed channel and
row-key dependencies using the shared expression discovery and compiled plans. Eligible Text
updates positions, size/offset footprints, opacity and applicable bounds independently of
unchanged labels, atlas and paint. Animated opacity retargets through its existing descriptor;
unrelated fades retain their schedules. Eligible Rect/Points use the same dependency/ownership
rules. Row/key membership, representation, inferred paint scales, unsupported coordinates,
feedback composition and other uncertified changes still prepare fully. Other mark families
retain their existing full-preparation paths.

Accepted fields and bounds publish under the existing fences. Superseded work releases its
leases. Text's reactive payload/export-string work depends on content/count/font, including
font-load revisions, rather than position identity. Validation errors report within the
plot and recover on valid content. There is no new expression evaluator, scheduler,
Tree-specific metadata, public prop or scene-protocol change.

### Preparation, CPU and progress

Numbers below are means **per warmed gesture**. CPU is sampled active work before settled
idle, including GC and excluding `(idle)`/`(program)`. Bind counts do not expose arithmetic
inside compiled programs and do not count GPU dispatches.

| Mode / condition | Full branch-Text prepares | Frontend binds | Active CPU, ms | Completed frames in plain gesture | Plain frame p95, ms | Accepted bounds-change gap p95, ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dev baseline | 40.0 | 2,521.8 | 466.5 | 78.0 | 28.2 | 32.7 |
| Dev Stage 109 | 40.0 | 2,305.8 | 458.2 | 78.0 | 31.8 | 36.6 |
| Dev Stages 109–110 | 2.0 | 2,130.9 | 438.5 | 78.4 | 25.2 | 28.9 |
| Production baseline | 41.7 | 2,641.8 | 260.2 | 79.7 | 19.3 | 22.0 |
| Production Stage 109 | 41.9 | 2,405.2 | 256.3 | 79.9 | 18.9 | 20.1 |
| Production Stages 109–110 | 2.0 | 2,208.9 | 246.4 | 79.9 | 19.1 | 20.1 |

The combined implementation replaces about **95% of full branch-Text preparations** with
retained-field updates (38.4 development / 39.9 production writes per gesture). Frontend binds
fall about **15–16%**, and sampled active-gesture CPU falls about **5–6%** in this comparison.
Completed-frame progress is similar; this does **not** demonstrate a substantial FPS gain.
Stable names/code identity and changing coordinate freshness are checked directly in data
tests. There is no separate data-layer encoding counter in these captures; fewer casts and
compiled payload calls alone are not presented as an exact encoding count.

The work is partly moved to the current-field writer, which still evaluates changing opacity,
updates fields and contributes current footprints/bounds. Inclusive development CPU samples
for named-channel preparation fall 59.3 → 6.9 ms and Text atlas/footprints 33.5 → 7.6 ms,
while procedural-current-field samples rise 14.2 → 66.4 ms. These groups overlap with JAX
and expression calls. They must not be subtracted or summed as a critical path. The whole-plot
CPU comparison measures the net effect.

Plain production motion spans approximately 703/706/708 ms for baseline/data/combined, with
39.7/39.9/39.9 observed frames; retirement remains approximately 651/652/652 ms with 39 frames.
Development motion spans 726/738/732 ms with 38/38/38.4 frames; retirement is about 652 ms.
The 200 ms idle windows usually contain one final boundary draw. Current animation and
intermediate-domain behavior were retained rather than shortened to improve these totals.

### GPU work and retained memory

These are separate instrumented runs, also means per warmed gesture. Buffer allocation KB
are rounded by the existing counter helper. Live bytes count buffers, **excluding textures**.

| Mode / condition | Readbacks | Queue submits | Buffers created | Allocated buffer KiB | Completion waits | Warmed shaders / pipelines |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dev baseline | 93.6 | 1,164.2 | 171.3 | 92.6 | 175.8 | 0 / 0 |
| Dev Stage 109 | 93.0 | 1,041.5 | 162.3 | 91.1 | 175.6 | 0 / 0 |
| Dev Stages 109–110 | 94.8 | 1,059.4 | 175.6 | 93.0 | 100.3 | 0 / 0 |
| Production baseline | 97.4 | 1,213.8 | 174.7 | 93.0 | 184.2 | 0 / 0 |
| Production Stage 109 | 97.6 | 1,088.2 | 162.1 | 91.0 | 183.9 | 0 / 0 |
| Production Stages 109–110 | 97.6 | 1,092.0 | 178.6 | 93.0 | 103.2 | 0 / 0 |

No new readback mechanism is introduced. Existing bounds/count/identity/validation reads
remain, and total reads vary with the observed update count. The development wrapper attributes
eight reads per gesture to picking; production minification prevents that stack-based split,
so its reads remain `other` instead of being assigned guessed callers. Submits/waits decrease,
but buffer creation is not uniformly lower. Live buffers remain near **72.8 MiB** in all
Sunburst conditions; combined retains about **13 KiB more** than baseline in this replay.
That is an observed GPU-buffer total, not a measurement of JavaScript heap size or every
mapping's cache payload. Ownership, eviction and disposal are checked separately.

The additional development idle replay rechecks served sources, warms a pair, adds a 100 ms
settlement margin, then observes 500 ms. Baseline and combined each record **zero draws,
submits, readbacks, buffer allocations and shader/pipeline creation**, unchanged live bytes,
and one completion-wait call. Adapter info is `apple / metal-3`, `isFallbackAdapter=false`.
This is separate from the gesture's boundary-inclusive 200 ms idle phase.

### General filtering controls

[Retained filtering controls](../tests/perf/investigations/results/preparation-filter-controls.json)
use the same frozen baseline/combined dev servers, with their source and fixture bytes
rechecked after capture. Each plain/counter condition warms one six-update sequence and
retains three repetitions. All accepted row counts, numerical/color/size domains and four
mark states match; final 5k/50k PNG files have **identical SHA-256 hashes**, and 143,178 sampled
pixels per case have no differences.

| Six-step plain sequence | Baseline median, ms | Combined median, ms |
| --- | ---: | ---: |
| 5,000 rows, four Points | 149.2 | 149.5 |
| 50,000 rows, four Points | 735.4 | 791.4 |
| Additional 50k pair | 760.5 | 779.1 |

The extra pair checks the initial large-filter timing difference. Its individual durations
overlap (baseline 749.7–779.2 ms, combined 734.0–806.5 ms); these controls do not establish a
general filtering speedup or isolate the small positive median difference. All sequences
complete six frames. Separate counter runs match at **12 reads, 138 submits, 14 buffers /
232 allocated bytes**, with matching retained-memory levels. Both versions create four
shaders / two render pipelines per six-step filtering sequence; that baseline behavior
remains, while warmed Sunburst creates none. This control does not close Stage 105's broader
independent-facet/guide investigation.

### JAX realization experiment and decision

The [source experiment](../tests/perf/investigations/stage111-realization.patch) checks array
validity, then returns immediately for a realized contiguous source before describing unused
index arithmetic. Constant filling and actual materialization retain their respective paths.
It was built with the pinned fork workflow in private Stage 111 snapshots. The byte check and
3,753 upstream core tests pass, with real WebGPU cases executed; the shipped fork is unchanged.

The reprofile separates expression-plan execution/dispatch, array construction, indexing
descriptions, hashing, realization and submission CPU using synchronous sampled call chains.
The fork's source maps stop at its built JS. The postprocessor records exact artifact hashes
and function ranges from matching `sourcesContent`, including private methods and production
minification; it does not claim TypeScript attribution where no map exists. On combined
development gestures the overlapping groups sample approximately 30.6 / 11.0 / 28.6 / 35.4 /
45.9 / 22.6 ms respectively. Production samples approximately 11.1 / 1.6 / 0.6 / 6.3 / 4.9 /
23.8 ms. These are inclusive CPU groups, not disjoint costs or GPU pass times.

Two additional paired captures per mode each retain five warmed pairs. Acceptance uses
whole-plot active-gesture CPU, excluding settled idle:

| Pair | Combined CPU, ms | Candidate CPU, ms | Saved, ms | Saved, % | Meets 10% and 1 ms? |
| --- | ---: | ---: | ---: | ---: | --- |
| Dev 2 | 439.3 | 418.8 | 20.5 | 4.7 | No |
| Dev 3 | 441.7 | 424.6 | 17.2 | 3.9 | No |
| Production 2 | 249.7 | 243.7 | 5.9 | 2.4 | No |
| Production 3 | 246.2 | 246.6 | −0.4 | −0.2 | No |

**Defer the runtime patch.** It misses the required repeatable 10% gain, including one
production pair with no improvement. Its source/tests, reproduction instructions and results
remain available as an experiment outside the maintained patch series. No generated vendor
artifact changed in this checkout. Remaining work includes field evaluation/publication,
layout orchestration, guides/options, JAX binding/hashing and GPU coordination. These profiles
do not rank a single next GPU bottleneck. Additional backend patches are deferred until a
specific redundant operation has a bounded fix and a whole-plot measurement.

### Correctness and limits

Data tests cover shared codes, ordered/missing categories, accepted mutable inputs, snapshots,
changed coordinates/dictionaries, virtual fields, cache limits and independent caller leases.
Rendered tests cover native/Python Sunburst intermediate geometry/fades and rapid retargets,
moving filtered Text, content/font/size/offset changes, loaded-font pixels/footprints, live
bounds, expandable Tree, picking and PNG/SVG/PDF exports. General Rect/Points, Force and
Lorenz/Double Gyre frame-progress controls pass. The final source passes 1,324 unit tests,
813 Python tests with one skip, types, signatures/API and the packed consumer.

Two broad browser gates completed; the second is **933 passed / 13 failed**. Existing failure
names and serial baseline controls are preserved in [TESTING.md](../TESTING.md). A new
dashboard validation-boundary regression was fixed and has a recovery test. The final font
invalidation correction passed a fresh nine-case serial replay after that full gate, which
was not repeated. No assertions/timeouts were weakened. Results are from one machine and
these retained scenarios; CPU samples have asynchronous-caller and phase-alignment limits.
Frozen benchmark configs/bundles remain intact. Full raw summaries, profiles and screenshots
remain under `/tmp/hmplot-final-*`; [the investigation README](../tests/perf/investigations/README.md#preparation-reuse-stages-109111)
describes reproduction and all retained formats.

## Python gallery expression fallback (Stage 110 follow-up, 2026-10-08)

The subsequent Chrome trace from the actual `/examples/sunburst` page shows repeated
arithmetic under `proceduralChannels → evaluateExpression → evaluateExpressionEager`.
Direct column/literal lookups also use the eager evaluator, so that function's name alone
does not establish a compiler failure. The gallery's expression diagnostics do: branch
Text accumulates 464 arithmetic fallbacks across the CPU replay's 12 flights. The earlier
preparation comparison above used a native Svelte fixture, which avoids scene decoding;
its compilation behavior did not establish the Python gallery's behavior.

**Cause:** Python scene decoding constructed optional own metadata properties with
`undefined` values, including `unit`, `timezone` and `domain`. The shared expression
planner requires a lossless JSON metadata snapshot; JSON drops these properties. It
therefore rejects the column representation and runs the surrounding numeric expression
eagerly. Some subexpressions still compile, accounting for the smaller `compiled` branch
in the user's screenshot. This is a representation mismatch, rather than a missing
numeric expression compiler or intrinsically costly Sunburst arithmetic.

**Correction:** `scene/resources.js` omits unset optional metadata. Supplied units, names,
category ordering and other metadata remain intact. The planner's guard remains in place,
including its fallback for genuinely unsupported representations. There is no new compiler,
Tree-specific behavior, protocol change, backend patch or animation-duration change.

[Retained Python gallery results](../tests/perf/investigations/results/sunburst-python-metadata.json)
compare frozen `b5b84320` with this decoder correction on fresh private development servers
and caches, at DPR 2, with the inspector disabled. Both use identical Python scene-payload
bytes and the same vendored fork. Served source bytes, including the decoder, are checked
against each snapshot. Four serial captures separate plain timing from 500 μs CPU sampling;
each discards one warm-up pair and retains five zoom/reset pairs. This is one comparison
per condition on the same M2 Max; no production or GPU-counter comparison was made.

| Per warmed gesture | Before decoder correction | After correction |
| --- | ---: | ---: |
| Sampled active CPU, ms | 548.4 | 444.6 |
| Plain observed frame p50, ms | 16.7 | 16.7 |
| Plain observed frame p95, ms | 28.4 | 20.7 |
| Completed frames through settlement | 75.6 | 78.1 |
| Accepted bounds updates / second of observed motion | 52.4 | 54.9 |

Active CPU falls **19% (104 ms per gesture)**. Frame p95 is the mean of per-gesture p95s,
including gesture boundaries; it is not a pooled quantile or GPU pass time. Bounds-change
sampling is a motion proxy. These results show less CPU work and shorter stalls, with a
modest frame-progress improvement, rather than a substantial FPS gain. Full settlement
remains about 1.4 s because the existing layout and fade retirement are preserved.

After correction, Text and Rect arithmetic fallback counts are zero in both captures,
as is the center Filter's. Tree retains only its expected host-managed tween/value paths.
The baseline's Text count of 464 falls to zero in the CPU replay; compiled counts cannot
be compared as operation counts because baseline subplans ran inside eager evaluation.
Final PNG SHA-256 hashes match in all four captures. The strengthened native/Python browser
test checks current intermediate geometry, drawn fades and zero mark-arithmetic fallbacks.
The fresh seven-case rendering replay passes; midpoint/final screenshots were inspected.

Remaining CPU work includes gathered changing coordinates, field-buffer publication,
layout orchestration, bounds/guides and options/reactive updates. This follow-up does not
rank their GPU costs or claim lower readbacks, submissions or retained memory. A private
compiled-gather timing run overlapped another diagnostic and was excluded; no gather change
was retained. The prior backend experiment remains deferred. Raw captures remain under
`/tmp/hmplot-scene-metadata-*`; reproduction is in the investigation README.

## Grouped reduction crossover (Stage 123, 2026-10-17)

The retained [paired samples](../tests/perf/investigations/results/scatter-crossover.json)
compare the previous one-hot implementation with scatter on Chrome 155.0.8059.82,
Apple Metal 3, real WebGPU. Each workload discards two warm-ups and alternates six measured
runs per method. Timings include result readback; they are not plot-frame measurements.
The [reproduction fixture](../tests/perf/investigations/scatter-crossover.test.ts) runs in the
patched upstream fork's Vitest browser harness.

Direct floating scatter-add is unsuitable under skew: 65,536 rows with 90% in one group
reached roughly 140 ms, and the larger trial lost its GPU device. Bounded stripes avoid
that contention. At 65,536 rows and 1,024 groups, median sums improved from 1.80 to 0.49 ms
(uniform) and 1.40 to 0.67 ms (skewed); minima improved from 4.16 to 0.27 ms and 4.01 to
0.42 ms. Small-group sums favor one-hot, so `reduce.js` keeps that path below 512 groups
or 16,384 rows. No data-dependent skew measurement or frame-time readback chooses the path.

The numerical owner bounds scatter batches and stripe scratch, skips invalid group codes,
and preserves borrowed input ownership. Integer counts accumulate before conversion to the
existing float32 public result; weighted sums remain floating point and use tolerance-based
checks. Targeted reduction/cache tests pass, including dispatch/batch boundaries, nonfinite
values, empty groups and skew. A DPR-2 browser fixture checks 512 groups against a host
reference, their exported SVG points and completed-frame progress after an update.
The paired Mona Lisa/application comparison and full rendering acceptance remain open.

## Bounded cumulative scans (Stage 123.8, 2026-10-17)

Fork patch 16 retains the existing short scan and 256-element local blocks, but recursively
scans their totals once there are more than 512 blocks. This removes the unbounded quadratic
block-total stage without adding a primitive, backend implementation or public API.

The [paired samples](../tests/perf/investigations/results/scan-crossover.json) distinguish the
initial prototype from the final implementation, which restores the original small path.
The [reproduction fixture](../tests/perf/investigations/scan-crossover.test.ts) alternates
12 measured runs after two warm-ups on real Apple Metal 3 WebGPU, Chrome 155.0.8059.82.
Times include readback. Final baseline/candidate medians are 1.14/0.91 ms at 500,001 values,
2.06/2.18 ms at 1,048,576, and 3.35/3.02 ms at 2,097,152. These mixed results support bounded
work, not a uniform speedup; short-path timing differences are noise because that code is
unchanged. Integer results are checked exactly. The fork's boundary, nonzero-axis float and
cumprod cases pass, as does its full 3,796-test core suite. Application consumer pairing and
allocation/dispatch measurements remain open, and mask compaction still uses its existing sort.

## Artifact inventory

| Files | Purpose |
| --- | --- |
| `prepare.mjs`, `scales-fixture.svelte`, `stage105.patch` | Stable read-only baseline and guarded Stage105-only snapshot reproduction |
| `measure.mjs`, `verify-screenshots.mjs` | Matched plain/instrumented scenarios and unchanged screenshot sampling |
| `pick-prototype.mjs` / `picking-prototype.json` | Bounded GPU picking, final hit/pixel parity and query-feedback counters/timing |
| `count-prototype.mjs` / `count-prototype.json` | GPU count, shared/background CPU demand, empty/full/coalesced correctness |
| `capacity-prototype.mjs` / `capacity-prototype.json` | Source versus compact payload work, exact sums/counts and live bytes |
| `*-quiet-scale_filter_small_scale_filter_50k_bounds_style_bounds_filter.json` | Final three-repetition accepted-result Stage105 timing comparison |
| `baseline-instrumented.json`, `prototype105-prelookup-instrumented.json`, `prototype105-final-instrumented-bounds_style_bounds_filter.json` | Baseline/appearance/final positional work counts; early timings diagnostic only |
| `scale105-visual-parity.json` | Final four-fixture pixel comparison |
| `scale105-guards.json`, `scale-summary.spec.js`, `src/routes/test/scale-summary` | Four standalone rendered guards and strict combined-pipeline time-domain assertion |
| `sunburst-profile.mjs`, `summarize-sunburst.mjs`, `sunburst-diagnostic-*.json` | Source-fingerprinted native replay driver, passive CPU deadlines and read-only mapped CPU/read attribution; historical profiles remain diagnostics |
| `results/sunburst-python-metadata.json` | Actual Python gallery decoder comparison: separate CPU/plain flights, source/payload/profile hashes, fallback diagnostics and limits |
| `sunburst-ablation.json` | Final quiet four-control native replay, phase frames, overlapping query spans and exact numeric-validation sync calls; temporary fixtures remain outside the repository |
| `sunburst-data-callers.json` | One warmed native pair with direct Array.data caller stacks, resolving animated source-index key-token downloads separately from GPU layout |
| `observe-extent-flush.mjs`, `summarize-extent-flush.mjs`, `sunburst-extent-flush*.json` | Source-only diagnostic snapshot, exact host flush events and ready-mask batching upper bound; no production batching change |
| `numeric-expression-cpu.json`, `sunburst-numeric-*.json` | Corrected materialized numeric parity/ownership and source-verified eager/repeated/compiled native replays |
| `summarize-runtime-work.mjs`, `sunburst-current-runtime-work.json` | Current serial plain, CPU-only and primitive-hook Sunburst controls, exact compiled-call sites and preparation counters |
| `scale-matrix.mjs`, `scale-matrix-fixture.svelte` | Frozen current-source reuse/batching controls with accepted-frame, row/domain and screenshot checks; private instrumentation is separate from plain timing |
| `summarize-scale-matrix.mjs`, `scale-current-controls.json` | Seven complete current four-control cases, separated plain/counter runs and explicit incomplete-facet exclusion |
| Earlier `baseline`, `*-final`, and `tween-*` traces | Diagnostic timings and separate Stage100 evidence; not substituted for quiet Stage105 results |
