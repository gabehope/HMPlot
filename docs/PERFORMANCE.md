# Performance guide

For a source audit of scene node kinds, expression operators, specialized
paths, cache invalidation and cross-node metadata, read the
[node execution reference](NODE-EXECUTION.md). It distinguishes recomputation, JIT tracing,
material builds, shader compilation, uploads, readbacks and completion waits.

This guide collects performance measurements and selected implementation details for data
scopes, transforms, marks, scales, interaction and animation:

- **what it reads and passes down:** which rows it works on and what its output tells the nodes
  under it;
- **when it reads back from the GPU**, and what it waits for when it does;
- **when it compiles a new GPU program;**
- other costs to keep in mind.

It closes with advice for app authors and a list of known hot spots for contributors.
[RENDERING.md, "What recompiles"](RENDERING.md#what-recompiles) and
[DATA.md, "Filters and padded views"](DATA.md#filters-and-padded-views) give the background; this
guide provides additional measurements and optimization history.

Numbers quoted here are historical measurements in Chrome on an Apple M-series laptop
with the example pages and perf harness (`tests/perf/`). They are not measurements of
every current release or promises for other devices. Report fresh-page startup,
input-to-corresponding-draw latency and warmed completed-frame rate separately.

The [performance investigation](PERFORMANCE-INVESTIGATIONS.md) records the
Stages 103–106 audit, controlled prototypes, raw measurements and implementation decisions.
Removing a readback does not necessarily improve the time until the correct result is drawn.

The [2026-10-21 Svelte reference measurements](benchmarks/web-authoring-2026-10-21/README.md)
include 75 fresh-page startups and three warmed samples for each of six interactions,
with raw samples and machine/toolchain records. Fresh-page startup does not imply a cold
OS shader cache.

## The four costs

**Readback.** Copying values from the GPU to JavaScript (`.data()`, `scalar()`, `finiteExtents()`,
`selectedIndices()`). A completion wait such as `blockUntilReady()` need not copy values back,
but can also wait for queued work. The copy is tiny, usually a few bytes. The cost is the
wait: a readback returns only after the GPU has finished everything queued before it, and the
code that awaits it cannot queue the next step meanwhile. A readback costs about 1 ms on an idle
GPU and 5-15 ms behind a busy queue. Readbacks in sequence (each needing the last one's number)
make the CPU and GPU take turns; that is what made BoxPlot take ~100 ms per brush move before
Stage 26. A transform's or a Data's `read()` (TODO 145.1) is a readback the application asks
for: one wait per call, all its columns in parallel, bounded by `limit.readback`. Read when the
output changes (`subscribe`, then `read`), for values shown outside a plot; never on every
pointer move to redraw what a mark could draw from the same output.

Measured 2026-10-22 (TODO 145.6, the eval references, M2 Max, main-thread time per brush move):
a parallel-coordinates page of 406 cars took 33.9 ms when it rebuilt its tables per move, 40.7 ms
when it passed the intervals to three Filters as expression constants (each re-ran, with its
marks), and 9.9 ms when the intervals set one table's selection that every mark responds to. A
200,000-flight dashboard whose Filter > Group > Join re-runs per hour crossed took 24.4 ms against
16.7 ms for a JavaScript route x hour cube. Responding to interaction state is the cheap path; a
transform re-run is per change of its result, with its readbacks.

**Compile.** A new GPU program: a jax-js compute kernel, or a three.js render pipeline (a mark's
material). Each can take milliseconds to tens of milliseconds. Cache policies differ; the
bundled WebGPU backend's shader cache is a bounded 4,096-entry LRU. The
bundled jax-js reads lengths and most constants from uniforms, so a compute kernel compiles once
for its *structure*. What still compiles is listed in [What recompiles](#what-recompiles).

A program's size matters more than how many there are. Compilers inline every function call, so a
helper called from ten places is compiled ten times. The path-refinement pipelines
(`utils/curvedPathShader.js`) refine Lines, Segments, bands and Rects bent through polar, map or
globe frames. They reached the operation table's evaluator, `operationPoint`, from about 74 call
sites. They took 7.6 s and 2.2 s to create on an Apple GPU, and never finished on SwiftShader.
Now each helper evaluates from one place, looping over its inputs. They take 0.7 s and 0.35 s
(4.7 s and 2.2 s on SwiftShader), with identical output (Stage 57). The operating system caches
compiled programs across browser profiles, so this cost is paid once per program per machine, on
a first visit. A shader that calls a large function should call it from one loop.
`stage14-nested-paths.spec.js` measures these pipelines against a budget, with the cache
bypassed.

**Dispatch.** Every eager jax-js operation (an `add`, a `take`, a `where`) is built, hashed and
submitted on the main thread: about 50-80 µs each. Hundreds per interaction step add up. A brush
move over the brushed-distributions example issues about 700 operations: ~60 ms of main-thread
time against ~9 ms of GPU time. Jitted functions (`jit(...)`) run as one cached program; the
transforms on brushing paths compile theirs (see [What runs as one program](#what-runs-as-one-program)).

**Upload.** Copying host arrays to the GPU. Columns of a Data table are uploaded once and shared
(see [Data](#data-the-data-scope)). Copies between GPU buffers (a transform's output into a mark's
buffer) are cheap; the cost around them is the mark's preparation on the CPU.

### What recompiles

Many buffer-backed value changes reuse an existing kernel: thresholds, extents, times, brush
bounds, domains and colormaps. Outer row counts can often reuse shader source even after a new
trace or allocation. Structural branches and shape-sensitive algorithms still specialize;
these cases can compile for a new value or size:

- **An integer divisor:** a new number of bins, groups, categories, grid cells or a new resolution
  (shapes like `[groups, P]` and index arithmetic divide by it).
- **A short loop:** a reduction shorter than 64 rows, or into more than 256 outputs (one thread
  per output; the length stays in the kernel). `np.isin` with a new number of values is such a
  reduction.
- **Small sorts and scans:** sorts of 512 rows or fewer, and cumulative sums, compile once per
  power of two.
- **A tuning class:** jax-js picks upcast, unroll and grouping by divisibility and size
  thresholds.
- **A literal that folds:** a value written into an expression as a JS number, where the
  compiler can reason about it (a zero, a length that equals the row count). The library passes
  values that follow the data through buffers (`deviceScalar`, `deviceParams`, `deviceArray`);
  new code must too (Stage 26 found `np.full([n], keptCount)` compiling new programs for empty and
  full selections).
- **Mark structure:** see [Marks](#marks).

### What runs as one program

A jitted program is one operation to dispatch however many it traces. The transforms and mark
steps that run on every brush move compile their device work into programs (TODO 33.3). Each is
cached per *plan*: the structure of its config (reducer ops, which inputs are columns, how many
axes), with shapes read from its arguments. The numbers that follow the data or a control
(edges, a whisker, a window's size, a width) arrive in one buffer, so a new value neither
retraces nor runs stale.

| Transform or step | Programs per run |
|---|---|
| BoxStats, BoxOutliers | one |
| Window count, sum, mean | two (the scan's inputs, then the scans and windows) |
| Bin, Group, Pivot, Normalize, Stack, Summary, Sort's order, Hexbin (fixed extent) | one (a Summary bootstrap then resamples eagerly) |
| Filter's bucket (its kept rows first) | one |
| Density, one chunk | two (padding, estimate) |
| Density, several chunks | padding, grid, one per chunk, finish |
| Density's statistics before its readback | one |
| Rect, Prism, Area, ErrorBars geometry | one |
| A mark's axis extents (all its fields and columns, one readback) | one |
| A transform's codes on a categorical axis, or through a categorical channel's table | one each |

A categorical channel over the same codes (the same array), categories and palette as the last
preparation reuses its values, so its field writes nothing (a Force step re-prepares its marks
with the same columns).

Tracing changes what the kernel compiler sees, so three things stay out of a traced program:

- **Padding before a scan or a chunked product.** Traced, a pad fuses into the consumer's
  unrolled loop, and its bound (the row count) folds into the shader: one program per row count.
  Window pads its scan's inputs, and Density its rows, in a program of their own.
- **A running sum over a varying number of chunks.** The sum fuses into the last chunk's product,
  whose shader then reads every chunk: one program per chunk count. Density keeps one program
  per chunk.
- **An inner dimension of the row count** (a `[2, n]` stack): it becomes an integer divisor in the
  shader. Keep such arrays 1D.

`tests/unit/kernel-lengths.test.js` catches all three: a new row count must compile nothing.

## The view protocol: what flows down

Every transform returns a *view* (`src/lib/plot/utils/dataView.js`). The fields below are what a
node passes to the nodes under it.

| Field | Meaning | Set by |
|---|---|---|
| `length` | The logical row count, a host number (the kept count for a padded view). | every view |
| `padded()` | The physical rows: `{capacity, valid, count, get(), prefix, sourceIndices()}`. `valid` is an int32 0/1 mask. `get()` returns the parent's own column (no copy). | Filter and every row-preserving output over it |
| `prefixed()` | The physical rows with the valid ones first, same capacity (one argsort per view, then a gather per column). | padded views |
| `prefix` | The valid rows already come first (`prefixed()` is free). | Sort, Sample, Window, buckets, and row-preserving outputs over them |
| `followsMask` | The output's rows or values depend on which input rows are valid: a mark cannot just swap its mask. Sticky downstream. | aggregates over padded input, Calculate with a reduction, Sort/Sample/Window/Normalize/Stack over padded input, buckets |
| `bucketed()` | The Filter's kept rows compacted into a power-of-two bucket, built on first call (one argsort). | a Filter keeping under a quarter of 65,536+ rows |
| `aggregate` | Rows are groups/bins/cells, not input rows. | Bin, Group, Pivot, Summary, BoxStats, Hexbin, Density, Slice, Interpolate, Force/graph nodes |
| `provenance` | How an aggregate row maps to input rows: `{kind, codes, rows, fields, contributors, ids}`. Needed for linked brushing of aggregates and for hover details. Without `codes`, `@brushed` on the aggregate is all zeros. | aggregates (BoxStats, Pivot and Density have no `codes`) |
| `topology` | Changes when the rows are a different set. Marks snap instead of animating across a change. | selecting and aggregate views (new each run), Slice (per selection change), Force (stable per graph) |
| `columnIdentity(key)` | A stable identity for a column across reruns (a forwarded column keeps its source's). Used by caches. | every view |
| `identityRows` | Rows are the source's rows in order (lost after any selection). | Data, non-selecting views |
| `sourceIndices()` | Each row's source row (a GPU array; -1 for hidden physical rows). | non-aggregate views |
| `pipeline` | The transforms applied so far. Facets replay it per cell. | runTransform |
| `constants` | Per-group constant columns (a Partition group's key). | Partition |
| `liveColumns` | Generic names of producer-controlled current columns. No interpolation targets/state are published. | Calculate and live layouts |
| `columnFact(field, fact)` | Optional conservative producer certificate, inherited by ordinary aliases and dropped by rewritten expressions. | supporting producers and shared views |
| `graph`, `graphRelation` | Linked node/edge structure under an ordinary selected table; layout state stays private. | GraphData and shared views |
| `live` | The values move with the view clock (a transform reads `@time` outside `interval()`, or a tween it reads is moving). Sticky downstream. Marks over it skip their implicit transition. | Filter, Calculate and parameters reading `@time`; tween consumers |
| `liveUntil` | Generic active deadline propagated with current values. Only the owning producer uses it to schedule its clock; dependents follow publications. | active producers and layouts |
| `grid` | A regular grid's shape and bounds (Heatmap reads it). | Interpolate, 2D Density with one group |
| `slice` | The bracketing source rows of each interpolated row. | Slice |
| `fold` | The folded fields, for Facet. | Fold |

**Compaction.** A consumer that has not opted into padded rows reads a padded view through its
*adapter*: `get()`, `sourceIndices()`, `indices` and `aggregateInfo()` compact the kept rows on
first use (one argsort over the capacity, then one gather per column read, cached per view). A
Filter makes a new view on every run. When its expression membership cache reuses the same
immutable mask, a retained row descriptor also shares lazy compacted indices and the gathered
source mapping while the parent's ordered index array is unchanged. Changed membership or
parent order still requires new work; equal counts alone never certify equal rows. Cache and
view leases keep old published mappings valid after replacement or cache teardown.
`keys()`, `has()`, `length`, `padded()`, `prefixed()` and `categoryField()` do not compact.

## Data: the Data scope

- **Update.** Passing the same object again does nothing. An object of columns re-prepares only
  the columns whose array object changed: a column passed again keeps its type inference, its GPU
  copy and its category encodings. An **array of row objects** is pivoted into new column arrays
  on every update, so every column is inferred, uploaded and encoded again, and a Partition can
  reuse no group.
- **Uploads.** Each numeric column is uploaded once, on first use, and every mark, transform and
  expression that reads it shares that copy (`data.js` `retainColumn`). It is released when an
  update replaces or drops the column. String and boolean columns stay on the host; their category
  codes are computed per scale and cached (views forward the encoding of the scope's own columns
  to it).
- **Generation.** Any real update increments the data generation: every mark over the scope
  re-prepares (the mask-swap shortcut needs the same generation), and transforms rerun.
- **`key=`.** Every update builds a string token per row and checks uniqueness on the host.
- **Arrays from another jax-js copy** (an app's own `@jax-js/jax`) are copied through the CPU
  with a blocking read, once per array object. Add the `hmplotJax()` Vite plugin to share one
  copy instead (docs/USAGE.md).
- **Python.** Columns are content-addressed: only new column ids are sent, and tables of the same
  version are reused. `pointermove` events to Python are throttled to 30 Hz.

## Transforms

Every transform reruns when its input view, its config or (for `@` fields) the interaction state it
reads changes; one that reads `@time` also when a view-state value it reads changes (decided on the
host, at most once per frame), and one that reads a moving `tween()` column on every frame until it
lands. Before each run, transform.svelte resolves expression-valued parameters and
describes the transform's controls; both can read back (see
[Parameters and controls](#parameters-and-controls)). Each bullet list below says what the transform
reads, what it passes down, its readbacks per run, what compiles, and other notes.

*Reads* is one of: **physical** (a padded input's rows and mask, no compaction), **bucket** (a
Filter's bucket when it has one, else physical), or **compacted** (the adapter above). Each
transform declares it (its `reads` in utils/transforms/, TODO 31.2): a bucket is a smaller
capacity of the visible-first form, so a transform that reads rows reads the bucket unless it
says otherwise (a Calculate with a tween).

### Filter

- **Reads:** physical rows of its input.
- **Passes down:** a padded view: the input's rows with `valid` marking the kept ones and `count`
  on the host. `followsMask` is inherited, not set. Offers `bucketed()` when it keeps under a
  quarter of 65,536+ rows (hysteresis: grows at once, shrinks after three low runs).
- **Readbacks:** the kept count for changed membership (skipped when no condition is active).
  A single expression without a tween can reuse its mask/count while its predicate columns,
  input mask/order, view-state key and versioned resources hold; unrelated columns can change.
- **Compiles:** nothing for thresholds, category values or brush bounds. An `in` condition
  compiles once per number of values.
- **Notes:** plain string fields are encoded on the host per run (a Set and a map over the rows,
  and an upload); a column with a schema-declared or dictionary-encoded category type is not.
  A Filter on `@` fields reruns (and everything under it) on every membership change. A Filter on
  `@time` reruns on every frame whose time changes a value it reads (with its readback each time;
  `interval()` or `floor()` make that once per step), and so does everything under it.

### Calculate

- **Reads:** physical rows when a column has a tween; state follows source rows and keys.
- **Passes down:** the same rows and current-value columns; reduction-dependent outputs set
  `followsMask`. Generic `liveColumns` identifies live dependencies without target metadata.
- **Readbacks:** no obligatory interpolation readback. A consumer can lazily request a
  finite/nonnegative interval certificate; the producer reads one flag per changed endpoint
  revision and shares the result across frames. Unsupported proofs use ordinary validation.
- **Reuse:** root and nested tweens both publish current values. Private resolved inputs are
  cached while only time moves, and easing programs/cache results are shared at a frame time.
  Source updates retarget from current values; unchanged targets are not uploaded every tick.
  Whole-channel categories step at eased halfway; dates retain a stable numerical origin.
  Each evaluation retains its final numerical array or dictionary codes for the output view
  and immediately releases intermediate references. Random constants and tween state are
  separate producer-owned caches, released on teardown; retained old outputs stay coherent.
- **Downstream costs:** Calculate owns the active clock subscription. Ordinary Filter/Bin/Group
  consumers rerun on its published revisions, with their normal costs. Eligible marks update
  stable numerical fields directly and summarize completed geometry for automatic domains.
  Other marks prepare normally, including inferred paint domains, unsupported refined geometry
  and categorical/temporal conversions.
  These contracts describe reuse, not a new measured frame-rate guarantee.

**Stage 100 warmed follow-up (2026-10-06).** Fresh Chrome/WebGPU at DPR 2, three serial
one-second flights after warm-up; plain timing and GPU counters were recorded separately.
The fixed-domain numeric workload has 10,000 rows, one tween and two point consumers. Against
`a3667d1d`, the baseline completed 60–61 frames per flight and current code completed 61–62;
both took about 1.03 seconds. Current median completed-frame intervals were 16.6 ms and p95
was 18.8–22.4 ms. Warmed numerical traces added no shader, pipeline or readback work, while
124 retained field writes used 374 submits versus the baseline's 313–315. This shows preserved
display-rate drawing for this workload, with an extra submit cost; it is not a speedup claim.

A current tween feeding a 127-node partition Tree completed 60–61 frames per flight, with
16.7 ms median intervals and 17.9–19.2 ms p95. Warmed traces likewise had no new shaders or
readbacks; ordinary layout/mark publication still used 440 submits and 194 completion fences.
The old API's comparable tree uses a layout-owned tween rather than the new upstream graph
column, so its similar timings are not a matched-composition comparison. See the
[fixture, reproduction notes and raw results](../tests/perf/investigations/tween.md).

### Sort, Sample

- **Reads:** bucket.
- **Passes down:** a prefix view (kept rows first, in order), `followsMask`. Marks after them
  cannot swap masks.
- **Readbacks:** none (an expression-valued `size`/`proportion` reads back once per run).
- **Compiles:** sorts of 512 rows or fewer, per power of two.
- **Notes:** Sort argsorts every key over the full capacity on every run, although only the last
  step depends on the mask. Sample (shuffling or not) keeps its random keys while the seed and
  row count are the same.

### Window

- **Reads:** without `by`, the kept rows first (`prefixed()`); with `by`, physical rows.
- **Passes down:** the input's physical rows with the window column, `followsMask`, `prefix` from
  the input.
- **Readbacks:** none per run. With `by`, the group count once (see [Grouping](#grouping)).
- **Compiles:** the kept count comes from a buffer (an empty or full selection compiles nothing).
  `min`/`max` compile per power of two of `size` (the number of sparse-table levels);
  `variance`/`std` per table depth; `by` per group count; cumulative sums per power of two of the
  row count; `shift` 0 (leading) and non-zero are different programs.
- **Notes:** every window at once (windows.js): prefix sums for count/sum/mean, a stable
  (count, mean, M2) sparse table for variance/std, a sparse table for min/max, nearest finite rows
  for first/last. 50,000 rows take 10-45 ms on WebGPU for any reducer, grouped or not.

### Normalize, Stack

- **Reads:** bucket.
- **Passes down:** the input's physical rows with the new columns, `followsMask`.
- **Readbacks:** the group count once (`by`/`x`). Stack's `center` and `wiggle` read the value
  column's minimum once per column (none per brush move unless the column has a negative value;
  then one per run with hidden rows, for the shown rows); a numeric `series` under `wiggle` or a
  computed `order` reads its count once.
- **Compiles:** per group count (a stack of per-group results); Stack's `wiggle` and computed
  orders per series count too (a (group, series) table; `insideOut` is a step per series).
- **Notes:** with `by` (Normalize) or `x` (Stack) both still loop over groups on the host, with a
  GPU wait and a timer yield every 16 groups. Fine for tens of groups; slow for thousands.

### Fold

- **Reads:** bucket.
- **Passes down:** k × n rows (the input's mask repeated), `fold` metadata for Facet.
- **Readbacks:** none. **Compiles:** per field count.
- **Notes:** memory is about 16 bytes per folded row, plus a gather per column read.

### BarGeometry (Bar)

- **Reads:** physical, never a bucket (per row: no compaction after a Filter, and the Bar mark
  keeps the Filter's rows; before TODO 31.3, an argsort and gathers on every brush move).
- **Readbacks:** none. **Compiles:** nothing per value.

### Grouping

Grouped transforms (Group, Pivot, Summary, BoxStats, BoxOutliers,
Normalize/Stack with groups, Window `by`, Density `by`) find their groups with `groupRows`: a sort
per key column and **one readback of the group count**. `cachedGroupRows` keeps the result in the
transform's cache while the key columns are the same objects, so a brush over a Filter regroups
nothing. It regroups when:

- the key columns are new arrays: data replaced, or a key computed upstream on every run (a
  Calculate after a Filter);
- a key is an `@` interaction field;
- upstream grouping keys or structural group membership change. For row-preserving
  filters, `inputGroups` can retain parent group structure and gather its codes into
  the filtered view; bucketing does not universally imply regrouping. The chosen
  transform path and key dependencies determine reuse.

### Bin

- **Reads:** bucket.
- **Passes down:** `aggregate` mode: an aggregate with `provenance.codes` (linked brushing works);
  padded only with `empty: false`. `assign` mode: the input's physical rows with a bin column.
- **Readbacks per run:** automatic edges read each axis's extent (one readback per axis, in
  sequence); explicit edges read nothing. Rule bins (`"sturges"`, `"scott"`, `"fd"`) read back 1-3
  more per axis, and `"fd"` sorts the column. `empty: false` adds the count.
- **Compiles:** a new bin count (a divisor). A bin rule or expression whose result moves with a
  Filter compiles per value and changes the output length. More than 256 bins in total (a 2D bin
  of 20 × 20) compiles per row count.
- **Notes:** reduction strategy depends on operation and group size. Shared reducers
  use fused one-hot work for small groups and bounded striped scatter work for larger
  groups; do not assume every reduction scans all rows once per bin. A `weight="@brushed"` Bin reruns on every brush move,
  including its extent readbacks: give it explicit edges.

### Group, Pivot

- **Reads:** bucket.
- **Passes down:** Group: an aggregate with `provenance.codes`, padded over a padded input (shown
  groups valid). Pivot: an aggregate without `codes`. (A group's statistic on every row is a
  reduction with `by` in Calculate, which replaced JoinAggregate in TODO 137.3.)
- **Readbacks:** grouping, plus the output count over a padded input.
- **Compiles:** per group count; a reduction shorter than 64 rows per length.
- **Notes:** common reductions use shared grouped numerical kernels, including scatter
  paths for larger group counts. Cost varies by reducer and grouping dependencies;
  sorting-based statistics and output materialization have different costs from sums.

### Summary

- **Reads:** bucket; compacted for bootstrap intervals.
- **Passes down:** an aggregate with `provenance.codes`.
- **Readbacks:** **one per group per run** (its count), and a second per group for bootstrap
  intervals; plus grouping.
- **Compiles:** analytic intervals: nothing per value. Bootstrap: each group's size is a shape, so
  new group sizes compile.
- **Notes:** `estimate: "median"` sorts all rows once per group. The slowest grouped transform
  under a brush; prefer BoxPlot or the `quantile` reducer for interactive use.

### BoxStats, BoxOutliers

- **Reads:** bucket.
- **Passes down:** BoxStats: one row per group, an aggregate without `codes`, padded over a padded
  input. BoxOutliers: the input's
  physical rows with outliers valid, `followsMask`.
- **Readbacks:** grouping, plus the output count.
- **Compiles:** per group count.
- **Notes:** every group at once on the GPU: one stable sort by group and value, per-group counts,
  quantiles gathered at computed positions, fences per group. Two sorts of the input per run.

### Hexbin

- **With `extent`** (count, sum, mean): reads bucket; passes an aggregate over a fixed grid
  (every cell, occupied ones valid, `provenance.codes`); one readback per run; compiles nothing
  for a new selection. Use this under brushes and sliders.
- **Without `extent`, or other reducers:** cells follow the data, so a new selection can change
  their number (and compile). About four readbacks per run (extent, count, grouping, output
  count) and a per-cell Group; its grouping is not cached.

### Density (and Violin)

- **Reads:** bucket.
- **Passes down:** an aggregate (`groups × resolution` rows; a violin's groups separated by a
  missing row), padded with `by` over a padded input, `grid` for 2D with one group.
- **Readbacks:** one for the bandwidth statistics and grid range together (none when both
  `bandwidth` and `bounds` are explicit), the output count with `by` over a padded input, a
  weight check with a weight column, and a GPU wait per 64 MB of queued row chunks.
- **Compiles:** a new `resolution` or group count; the chunk size. Bandwidth and bounds are
  uniforms.
- **Notes:** O(queries × rows) work in row chunks, each one jitted program. 2D densities over large
  inputs run hundreds of chunks.

### Slice

- **Reads:** physical rows (never a bucket: one row per entity whatever the selection keeps).
- **Passes down:** an aggregate, one row per entity; over a padded input, padded with the active
  entities valid, `followsMask`, `slice` metadata. `topology` changes every run over a padded input,
  so marks after it snap to each new time instead of animating between runs.
- **Readbacks:** building the topology (when the key or time column changes): the group count
  and a host copy of the key and time columns. Per run: none while `at` is inside the span where
  every entity is active (read once per Filter update); otherwise the count. One more per run when
  the data has duplicate key/time rows.
- **Compiles:** nothing for a new `at` (from a buffer). Per row count for the scans.
- **Notes:** the time control reads its range once per column; `extent={[min, max]}` reads none.
  A non-coded categorical value column is re-encoded on the host every run.

### Grid

- **Reads:** compacted.
- **Passes down:** an aggregate with `grid` (shape and bounds); pushes its bounds to the plot.
- **Readbacks:** bounds (four readbacks unless `bounds` is set or cached), regular-grid detection,
  and a missing-value check per value field every run.
- **Compiles:** a new `resolution`.
- **Notes:** neighbor indices and weights are cached by coordinates, method, resolution and bounds.
  Duplicate coordinates bypass the cache and loop over groups every run.

### Dodge and Swarm

- **Collision layout:** not a transform; the offsets are computed for the mark. One readback of
  the glyphs' x, radius, group and seeded order (4 values per glyph), then placement on the host
  in a worker, each glyph checked only against the earlier glyphs it can touch: 3,000 points in
  about 0.1 s, 30,000 in under 1 s (it was a GPU pass per glyph and a wait per 128 earlier
  glyphs: 3,000 points took 40 s). A zoom or canvas resize lays out again once the pixel scale
  has been still for 150 ms (TODO 30.9); meanwhile the glyphs keep their offsets, and
  `whenSettled()` waits for that layout.
- **Grid mode:** a transform; no readback without `count`, one with it (validation and the
  total together); the units' rows and cells are compiled programs, the column count from a
  buffer (TODO 30.12).

### Force

- **Passes down:** nodes and edges aggregates; `topology` stable per graph.
- **Readbacks:** validation when the graph changes (one, plus the grouping of GPU identifiers);
  none per step; fitting reads the extents. A drag's press reads the node's position and pin
  (two); its moves and release read nothing.
- **Notes:** each step is one compiled GPU program with one wait (a zero-byte readback, so the
  next tick does not queue behind it): link forces over the edges sorted by endpoint once per
  graph (O(edges)); many-body and collision forces exact up to 4,096 nodes, on a spatial grid
  above (a tick of the large-graph page: 11 ms at 8,192 nodes, 13 at 32,768, 27 at 131,072).
  Parameters from columns resolve when the graph or the forces change, with one readback. Each
  step publishes new views: every mark over the nodes re-prepares (their position fields write;
  TODO 30.4), once per display frame, and `Nodes data=` joins its table once per graph.
- **Dragging a node** (TODO 65): the pointer's latest position is applied at most once per
  display frame, and older ones are dropped. While the layout runs, that frame's move is its
  batch: the constraint, the frame's ticks and one publication (a frame with a move has no step
  of its own). A constraint waits for nothing; the publication holds the plot's rendering while
  the marks prepare and the renderer settles (one `onSubmittedWorkDone`, which covers the
  constraint, the ticks and the uploads), so the nodes and edges show the same step and the
  previous views retire after the GPU has read them. The marks' own retirement adds two more
  completion callbacks a publication, not waited on. With several plots over one Force, each
  renderer settles separately (one wait each, on the same queue).

  Dragging node 3 of the transform-force example 65 CSS pixels in 2.5 s with native moves at 120
  a second (`tests/perf/force-drag.spec.js`, DPR 2, a fresh server for each series, before and
  after alternating; medians and ranges of 9 runs before and 6 after in the dev server, 3 each
  in a production build; 2026-10-01):

  | | Before | After |
  |---|---|---|
  | Paused: plot frames drawn of 150, longest gap (dev) | 96 (13-148), 84 ms (33-1,068) | 149, 34 ms (27-42) |
  | Paused: the same, production build | 64 (14-139), 150 ms (34-417) | 149, 27 ms |
  | Running: frames, longest gap (dev) | 97 (6-150), 67 ms (18-1,050) | 150, 18 ms |
  | Running: the same, production build | 125 (121-138), 50 ms (49-66) | 149, 33 ms (18-33) |
  | Running: layout ticks during the gesture | 0-8 | 150 |
  | Publications per display frame | 1.9-2.0 | 1.0 |
  | GPU maps per publication, paused / running | 3 / 2.95 | 0 / 1.0 |
  | Queue submits per publication, paused / running | 13-15 / 13-15 | 12 / 13.8 |
  | A move until it is drawn (median per run) | 18-137 ms | 17 ms |

  The large-graph page (512 nodes) behaved the same: paused 31 (3-93) frames and gaps up to
  1.5 s before, 148 and 42 ms after; running 19 (8-150) before, 150 after. Moves at the display
  rate (60 a second) were already drawn every frame: the drag starved the renderer only when
  moves came faster than frames, each publishing while the last still held the render stage.
  The GPU waits' removal (65.3) changed no timing here, where frames were already at the display
  rate; it is in the counters (`pipeline-churn.spec.js`).

### Graph data and hierarchy (GraphData, Tree, Pack, Treemap, DAG, Sankey, Flow)

- **Passes down:** a graph capability with ordinary selected node/edge tables. GraphData accepts
  explicit tables and identity mapping, infers nodes from edges, and replaces requested node
  attributes using explicit typed reducers. Most transforms and marks remain table consumers.
- **Readbacks:** device endpoint/key columns when host structural mappings need rebuilding,
  plus numeric inputs for CPU layouts. Value-only changes reuse structural mapping plans.
- **Notes:** DAG, Sankey, Pack and Treemap run their layout algorithms on the main thread (d3).
  Tree is the exception: rooted topology and traversal buffers are cached. Partition and
  `tidy-approx` keep moving geometry on the GPU, without per-level readbacks. Structural edits
  rebuild the topology; exact CPU `tidy` and `cluster` read their numeric inputs back.
  Numeric output gathers share a compiled program, and unchanged depth/ID metadata is reused.
  Flow tessellates curves on the host. Nodes/Edges switch scoped relations; node filtering
  produces induced edges, while edge filtering preserves nodes. Positioned graphs use ordinary
  node coordinate columns with lazy endpoint gathers; the old Graph layout is removed.
  Live source publications update dependent layouts without a second upstream-tween clock.

**Historical Tree animation follow-up (2026-10-05, before Stages 100–102).** Fresh Chrome/WebGPU at DPR 2, warmed focus/reset
gestures in the Svelte sunburst and expandable-tree examples. The same CPU/readback profiler
was used before and after; buffer/readback counts below are normalized by completed draws.

| Example | Profiled fps before → after | GPU buffers/draw before → after | Readbacks/draw before → after |
|---|---:|---:|---:|
| Sunburst | 23.7 → 38.8 | 67.6 → 12.6 | 7.7 → 5.8 |
| Expandable tree | 29.6 → 52.7 | 63.7 → 3.9 | 11.7 → 3.5 |

A separate run without CPU profiling or readback stack capture measures 39.6/53.2 fps.
Sunburst's 650 ms clock transitions finish at about 652 ms, with 708–732 ms measured from
before the pointer event through final settling. Expandable-tree's 600 ms transitions finish
at about 602 ms, with 648–649 ms including pointer handling/settling. The earlier clock
discarded preparation time, stretching both animations in wall time; the new clock catches
up instead. All warmed runs create zero new compute/render pipelines, shader modules or
Three.js node builds. These are local small-example measurements, not a universal 60-fps claim.

Remaining synchronization comes from automatic bounds, label-dependent Filter counts and
picking; layout geometry is not downloaded each tick. Caching predicates independent of
moving coordinates removes their count readbacks, but label-space predicates still change
with the geometry. Explicit vector exports read displayed transitioning positions/bounds
through the existing live-buffer capture path; those export reads are not per-frame work.

### Partition

- **Passes down:** one view per group, with the group's key in `constants`.
- **Readbacks:** planning copies the key columns to the host and reads the group bounds.
- **Notes:** a data update that leaves a group's rows alone keeps that group's view, so nothing
  under it reruns, but only under a Data scope updated in place: under a transform or Filter every
  plan is new. At most 256 groups; each mounts its own marks.

### Facet

- **Passes down:** one view per cell, `pipeline` replayed per cell, shared scales and bins.
- **Readbacks:** partition bounds; for each mark definition, every cell's extents (two readbacks
  per axis per cell); shared bins' extents.
- **Notes:** cells of one mark share shaders. A change upstream of the Facet re-partitions and
  rebuilds every cell's caches; redefining a mark (a Slice's `at` changing every frame) replays
  every cell, mounted or not. Offscreen cells beyond 64 unmount.

### Line, Area `series`

- **Readbacks:** the series count, once per preparation.
- **Notes:** one stable sort puts each series' rows in first-seen order with a break after each;
  the output has a row per input row and per series. A mark with `series` reads compacted rows.

### Connections (`connect`, Anchor)

- **Notes:** matching endpoints runs on the host and repeats on every endpoint publish; a GPU key
  column is read back in full each time. Endpoint positions follow frames on the GPU (no
  readback). Demanded endpoints read compacted rows.

### Parameters and controls

- **Expression-valued parameters** (`bins`, `resolution`, `bandwidth`, `radius`, `steps`, `size`,
  ...) are evaluated before every run: one readback each, in sequence. An integer result (`bins`,
  `resolution`, `steps`) is a shape: a value that moves with a Filter compiles per value.
- **Inputs** whose range or options read the data (`min=hm.min("x")`, `categories("species")`)
  read them once per data version, never when the input moves. Transforms no longer read a range
  back for a controls panel (TransformControls was removed; see docs/INPUTS.md).

## Marks

**Which rows a mark draws.** Under a padded view a mark picks a mode (`namedMark.svelte`
`paddedMode`):

- **scattered** (points, labels, rects, prisms, segments, arrows): draws every physical row;
  hidden rows get opacity 0.
- **masked** (ErrorBars, Area): hidden rows are missing.
- **prefix** (a straight Line): draws the kept rows and stops.
- **compacted** (everything else, and any mark with `series`, Dodge, animation, keyed updates or a
  demanded connection endpoint, or a capacity over `maxElements`): reads the compacted rows.

A mark takes a Filter's bucket only when the Filter's rows exceed its `maxElements`.

**Mask swap vs. re-preparation.** When only a padded view's mask changed, a scattered mark swaps
its row opacity (one small copy). This needs: the same rows and channels, no `followsMask`, no
reduction in a channel, **fixed axis domains** and **explicit continuous-scale domains**. A mark on
an automatic axis or with an automatic fill/size scale re-prepares on every brush move: a full
`prepareNamed`, an upload of every field, and the extent readbacks.

**Readbacks per preparation.**

- **Axis extents:** automatic numeric axes use shared finite summaries, started while the data
  is prepared; accepted data and its fitted domain appear together. Compatible immutable
  current-column/revision, mask and transform requests share in-flight work and batch when ready.
  Mark-specific text/glyph metrics can still require their own summaries. Explicit or categorical
  axes skip positional extent reads.
- **Continuous scales:** compatible inferred channels share the same immutable/current-revision
  summaries, including in-flight requests and ready batches. A changed mask or source revision
  invalidates them; an explicit domain skips normalization reads.
- **Per-row opacity:** one readback to decide blending.
- **RGB channels from GPU arrays:** a range check.
- **Animation or keyed updates:** derived source rows need one numeric download per immutable
  index array, shared across matching preparations and in-flight consumers. Each consumer maps
  those rows to its current table's tokens; tokens are not cached globally across identities or
  generations. The completed decoder retains CPU values only, with no extra GPU reference.
- **Monotone and step curves:** 1-3 readbacks.

**What rebuilds a mark** (compiles a render pipeline; its picking pipeline too): `blend`,
`shape`, `lit`, `transparent` (and `opacity` crossing 1), `sizeAttenuation`, `sizeUnits`,
`detail`, `dashed`, `curve`, axis transforms, the first interaction feedback, a channel switching
between a constant and per-row values, a shape registration that names a mark's literal shape (a
shape column reads the distance field, which gains a layer instead; only its growth to 32, 64, 128
or 256 layers rebuilds those marks), and for Heatmaps their
surface, contour and grid options. Several options changed together rebuild once. Bounds, ranges,
colormaps, `quantize`, a fill scale's transform, opacity below 1, colors and rotation are uniforms.

**Per kind.**

- **Point depth writes:** Points and Points3D expose `depthWrite` (`depth_write` in Python).
  Normal blending defaults to true; false changes overlap without disabling depth tests or
  nearest-point picking. Changing it can select a different material pipeline, but does not
  add a numerical readback. Additive and other non-normal blend modes already disable depth
  writes, including the stars example; this option has no demonstrated speedup for that plot.

- **Line:** each preparation builds segment and neighbor arrays and uploads five fields or more. A
  change of axis bounds reruns nothing: a dashed Line measures its path on screen in one GPU
  dispatch when the camera, the canvas, the chain or its rows change (TODO 73.2, one workgroup;
  nothing is read back).
- **Curved paths:** refinement keeps complete parameter intervals usable while source
  positions move. Rendering evaluates the current coordinates; changed row counts/layouts
  need a new refinement before drawing. Count/fill use reusable GPU copies of their source
  fields, avoiding inconsistent seam counts when another upload occurs during the existing
  16-byte allocation readback. There is no coordinate readback or additional fence. These
  copies cost up to four source-sized buffers per refined view and grow by powers of two.
  During motion, screen-space detail and dash distances can trail the current coordinates
  until the next refinement completes; settled exports wait for the final subdivision.
- **Labels:** each mark retains one current text payload independently of positions/paint.
  Equal host strings or the same immutable dictionary codes and category contents reuse
  sanitized codes, row widths and their atlas lease. Changed dictionary codes use one compiled
  sanitizing/width-gather program. A new set of unique labels draws a new atlas texture.
  Host width measurements are shared with autobounds in a bounded document cache, invalidated
  by text/font changes and font loading. Coordinates, opacity and numeric bounds still update.
- **Heatmap, Image, Surface:** a write normalizes on the GPU and resamples to the texture
  resolution (default 512²); a larger array grows the buffer (a compile).
- **GeoJSON:** tessellation runs in a worker, cached by options and geometry; spherical views
  re-tessellate 250 ms after a zoom. Longitude edits keep one active job and one latest
  replacement, retain the worker/source, and yield through completed draws between mesh
  publications. Intermediate joint-map faces and boundaries clip to the current longitude
  extent; new seam geometry catches up asynchronously. Errors retain the previous mesh and
  request a draw, so a subsequent valid replacement can recover.
- **Points3D and Arrows3D:** every row draws the mark's whole mesh, one mesh per mark (a few tens
  of kilobytes), so the cost is rows x triangles. A sphere is an icosahedron divided `detail`
  times, 20 x (detail + 1)² triangles: 80 at 1, 180 at 2, 320 at 3 (the default), 500 at 4; a
  cube 12. An Arrows3D is 160 (a 24-sided shaft and a 32-sided head; 80 with the 12 and 16 sides
  before TODO 69.17, which cost 3.4 ms a frame at 100,000 arrows against 3.5 ms now). GPU time of
  one frame (an 818 x 300 plot at a device pixel ratio of 2, 4x MSAA, unlit unless noted; medians
  of 3 interleaved runs, 2026-10-01):

  | Spheres | detail 1 | 2 | 3 (default) | 4 |
  |---|---|---|---|---|
  | up to 1,000 | under 0.3 ms | | | |
  | 10,000 | 0.4 ms | 0.6 ms | 1.1 ms | 1.7 ms |
  | 100,000 | 2.6 ms | 6.0 ms | 10.1 ms | 16.0 ms |
  | 100,000, lit | 4.0 ms | | 13.9 ms | 20.8 ms (53 fps) |
  | 250,000 | 6.7 ms | 14.7 ms | 26.4 ms (44 fps) | 41.4 ms (29 fps) |

  At 3 a sphere's outline is within about 1% of its radius (4% at 1, where spheres looked
  polygonal); past about 100,000 spheres, a `detail` of 1 or 2 keeps 60 frames a second.

**`maxElements`.** Every field buffer is first allocated at `maxElements` rows (default 250,000),
whatever the row count; changing it reallocates every field. Data longer than that grows the
mark's buffers to the next power of two, reallocating each field once, up to what the device's
storage buffers hold; rows past that limit are not drawn, and the plot says so (TODO 29.2). Set it
to the data size you expect to skip the growth.

Filter planning distinguishes that initial setting from the current allocation and the device
ceiling. Once normal rendering has grown a mark enough to hold its physical source rows, an
eligible filter can keep those rows in place and change only membership and logical counts.
The first change from compacted to physical rows prepares the mark once to establish the correct
row order. Filtering never grows buffers solely to enable this path: a narrow initial selection
retains compaction/bucketing. Allocation and planning share the field-width calculation (a vec3
has a four-float storage stride) and device limits. Explicit capacity changes and changes in
field requirements cause the eligibility decision to be reconsidered.

**Scalar channels.** Mark-channel evaluation preserves cardinality separately from dependency
information. Host-only scalar appearance expressions use uniforms; reductions remain on the
device in one-value storage read at index zero. Positions and other geometry consumers still
materialize rows where required. Numeric color expressions retain their scale mapping even when
scalar. Scalar opacity is the mark-wide factor, multiplied by row alpha from RGBA, filtering,
feedback and lifecycle fades. Changing the scalar does not rebuild the membership mask.

The expression evaluator's default remains array broadcasting. Mark consumers opt out where
their render fields support scalars, keep the result's metadata and ownership, and use the same
capability check for subsequent updates. Pointer/view changes coalesce while an update is in
flight, participate in settling, and commit their change keys only after successful writes.
Changes to inferred scale domains or geometry retain preparation. Mask-only updates still require
stable rows, source generation and channels, fixed scale/domain structure, and no membership-
dependent reduction or unsupported row animation. A scalar reduction is not row-independent.

**Compiled numerical mark targets.** Ordinary one-dimensional numeric/boolean channel
expressions can fuse through the existing evaluator. Current columns, row interaction and
validity masks, and typed literals are runtime inputs. Each mark owns at most 64 plans keyed
by operator structure, logical metadata, row count, input dtype/shape and scalar/mask layout;
changed values reuse those plans. Categories, dates, grids, grouped reductions, tweens,
random and view/time/offset expressions retain ordinary evaluation. Plans release their JIT
constants on eviction or teardown, and do not retain input tables.
Device boolean interaction masks are eligible; host boolean/string arrays preserve ordinary
dictionary-aware evaluation. Custom metadata that cannot be snapshotted losslessly as small
plain JSON also retains ordinary evaluation.

In source-verified, quiet DPR 2 sunburst click/reset replays on 2026-10-06, warmed changing
geometry improved from roughly 20 to 28 updates/second. New GPU buffers fell by about 65%,
and warmed compute/render compilation stayed zero. More completed updates also meant more
readbacks; this did not remove automatic-bound synchronization or reach 60 updates/second.
Whole transition settlement remained about 1.4 seconds. These measurements use the isolated
compiled path with identical authored examples; they establish the integration decision,
not a frame-rate guarantee for other plots. See the [source fingerprints, repeated control
and counters](PERFORMANCE-INVESTIGATIONS.md#isolated-numeric-target-compilation) for the retained
comparison.

**Stage 74 measurements (2026-10-03).** Chrome WebGPU on Apple Metal, DPR 2, a fresh dev
server, unchanged gallery examples. Measurements start after every canvas finishes loading and
the plots settle. The stars gesture varies zoom from 1 to 4 and back over four seconds; the
filter gesture sends 20 age changes 80 ms apart. The globe gestures each send 24 wheel events
120 ms apart, zooming in and back out. These are single-run measurements, not FPS guarantees.

| Phase | Wall time | Completed plot frames | New GPU buffers / allocated bytes | Compute dispatches | Readbacks | RAF median / p95 |
|---|---:|---:|---:|---:|---:|---:|
| Stars: zoom | 4.32 s | 117 | 0 / 0 | 0 | 0 | 33.3 / 50.0 ms |
| Stars: age filter | 1.64 s | 15 | 36 / under 1 KiB | 288 | 36 | 33.3 / 33.4 ms |
| Stars: settled | 5.01 s | 0 | 0 / 0 | 0 | 0 | — |
| Globe: first zoom pass | 4.08 s | 39 | 155 / 220.4 MiB | 9 | 0 | 16.7 / 33.4 ms |
| Globe: warm zoom pass | 3.77 s | 36 | 52 / 48.9 MiB | 0 | 0 | 16.7 / 16.8 ms |
| Globe: settled | 5.02 s | 0 | 0 / 0 | 0 | 0 | — |

RAF cadence is browser callback timing; completed plot frames count actual plot renders. Neither
is a GPU-duration measurement. GPU counters span the page's plots; frame counts refer to the main
plot. Both settled phases submitted zero GPU work. The browser still
runs RAF callbacks: sampled scene scheduler work was about 6 ms over five seconds for stars and
17 ms for the globe. Removing that idle CPU scheduling remains separate work.

Stars zoom built no materials or pipelines, uploaded 2,382 bytes of uniform changes, and retained
position/color buffer identities. Filtering also retained those buffers and built no materials
or pipelines; its count readbacks had a 12.1 ms median and 163.6 ms p95. The same earlier audit
allocated 24.84 GB during zoom and 5.96 GB during filtering. This change removes those repeated
allocations; it does not remove the independent cost of drawing ten million points. In nine
additional zoom/filter cycles, tracked live GPU-buffer bytes stayed at 4,328,678,188 after
warm-up, with stable position/color storage and zero final idle submissions. That counter includes
renderer and compute-pool storage; it is not a measurement of process memory or total GPU memory.

The globe still streams and replaces tile geometry. Its first pass built 38 materials, compiled
6 render and 7 compute pipelines, and uploaded 117.7 MiB; the warm pass built 14 materials,
compiled no pipelines, and uploaded 124.4 MiB. The largest RAF gap fell from 266.7 to 66.7 ms.
Tile processing/uploads and material construction remain candidates for the separate globe
performance work; scalar channel and filter changes do not eliminate those costs.

**Sampling.** `maxInstances` and `sampling="uniform-x"` rebuild sampled indices when the camera
window changes.

## Sky, fog and glow

The presentation effects (TODO 37; docs/RENDERING.md "Sky, fog and glow") cost nothing when they
are off: the scene pass and its output are as before. Their settings (fog distances and color,
bloom's strength and radius, a mark's glow, the sky's colors and rotation, a plugin effect's
number and color parameters) are uniforms: changing
one compiles nothing. Turning an effect on or off rebuilds the pipeline once:

- **Glow** (the first visible glowing mark): every drawn material builds once more for the
  scene pass with the glow attachment (one-time pipelines and shader modules: 16 pipelines and
  22 modules for the solar system, one 670 ms frame), then the bloom's 8 small pipelines. Glow
  off and on again rebuilds only the bloom (8 pipelines, under 12 ms); its scene-pass pipelines
  stay cached. The attachment and the bloom's 11 targets exist only while a visible mark glows.
- **Fog** and **the sky**: one output pipeline each time they turn on or off (the sky's image is
  one texture, uploaded once).
- **Exports** build their own scene pass and bloom at the export's size: a PNG of a glowing plot
  compiles 7 small pipelines more than one without (about 50 ms instead of 33 ms for the solar
  system at a device pixel ratio of 2).

**GPU memory**, at a 1636 x 1120 canvas (818 x 560 CSS pixels at a device pixel ratio of 2):
the glow attachment is a half-float color target beside the scene's (4x MSAA plus its resolve,
about 73 MB) and the bloom's targets about 13 MB, both scaling with the canvas's pixels. Fog
reads the depth the scene pass already has. A sky image is its texture (8 MB for the 2048 x 1024
star map, no mipmaps). An atmosphere is one 64 x 32 sphere.

An instance matrix larger than a uniform buffer (a mark's 250,000-row default capacity) is one
GPU vertex buffer per mark, shared by every material the mark builds
(threeExtensions/instanceMatrix.js). Three's InstanceNode copied it for every material build (a
mark's picking material is another build): before, the first glowing mark added 16 MB per mark,
448 MB for the solar system.

**Frame delivery**, measured 2026-10-01 (Apple M-series, Chrome, device pixel ratio 2; frames per
second and the 95th-percentile and largest gaps between completed frames over 4 s):

| Scene | Canvas | Effects | fps | p95 gap | max gap |
|---|---|---|---|---|---|
| Solar system, playing | 1636 x 1120 | none | 60.3 | 17.5 ms | 22.8 ms |
| | | Stars (sky image) | 60.3 | 17.2 ms | 18.8 ms |
| | | Sun glow | 60.3 | 17.3 ms | 18.2 ms |
| | | both | 60.3 | 17.4 ms | 19.3 ms |
| Solar system, playing | 5344 x 1120 | none | 60.3 | 17.3 ms | 18.4 ms |
| | | Stars | 60.3 | 17.6 ms | 18.2 ms |
| | | Sun glow | 60.3 | 17.3 ms | 18.8 ms |
| | | both | 60.3 | 17.3 ms | 20.3 ms |
| Manhattan flyover, 10,000 buildings, camera turning | 1440 x 1040 | sky | 60.3 | 19.8 ms | 21.0 ms |
| | | sky and fog | 60.3 | 19.6 ms | 20.7 ms |
| Manhattan flyover, camera turning | 5148 x 1040 | sky | 60.3 | 19.8 ms | 20.8 ms |
| | | sky and fog | 60.3 | 19.7 ms | 20.3 ms |

The frames stay at the display's 60 Hz with every effect on a 6-megapixel canvas: fog is one
depth read and a blend per pixel, the sky a direction and a texture read, the bloom a high pass
and ten blur passes at half resolution and below. tests/browser/solar-system.spec.js checks, at a
device pixel ratio of 2, that frames complete with the effects on, that a bloom setting compiles
nothing, and that glow off frees its targets and on-off-on allocates nothing new.

## Live vector tiles

A live VectorTile (docs/VECTOR-TILES.md) prepares tiles in workers and draws each in a tile slot,
marks made once and reused. What a session costs, measured 2026-10-01 (TODO 63) with
tests/perf/vector-tile-live.spec.js: bundled dense tiles replayed locally (every zoom-14 tile the
Amsterdam tile, 36,000 triangles), a 1200 x 800 plot at a device pixel ratio of 2, Chrome on an
Apple M-series GPU shared with another session's tests; medians of 4 interleaved runs before
(the code of 2026-10-01 before TODO 63) and after, each on a fresh server. "Zoom" goes four
levels out and back over 4 s; "pan" six tiles east and back over 4 s; "missing" is the time the
view's tiles were not all shown.

| Phase | Build | Frames in 4 s | p95 / max gap (ms) | Long tasks | Missing (ms) | Mark builds | Node builder (ms) |
|---|---|---|---|---|---|---|---|
| First zoom | dev, before | 174 | 67 / 117 | 21 | 1,766 | 362 | 1,178 |
| | dev, after | 220 | 33 / 50 | 0 | 1,016 | 77 | 584 |
| | production, before | 228 | 33 / 33 | 0 | 1,084 | | 359 |
| | production, after | 241 | 16.8 / 16.8 | 0 | 758 | | 170 |
| Zoom again | dev, before | 225 | 16.8 / 67 | 5.5 | 392 | 56 | 188 |
| | dev, after | 238 | 16.8 / 33 | 0 | 226 | 7.5 | 166 |
| Pan | dev, before | 237 | 16.8 / 58 | 1 | 334 | 32 | 76 |
| | dev, after | 239 | 16.8 / 33 | 0 | 17 | 8 | 44 |

- **Picking** was most of the first-use cost: each tile slot built its picking materials and the
  picking pass drew every frame, for marks that only take clicks. It is drawn on demand now
  (Interaction, below). Before, the same session without `onclick` was where the session with it
  is now (220 frames, p95 33 ms), so the default case is fixed, not worked around.
- **Node graphs.** three.js builds a material's node graph the first time a mark draws, about
  8 ms for a slot's areas and 22 ms for its lines in the dev server (a third of that in a
  production build). A slot is made at its first tile's size and grows (a new graph) for a
  larger tile; slots take turns, one a frame. A pool of slots prepared while the view is still
  was evaluated and not built: in a production build the first zoom already holds 60 frames a
  second, and each spare slot would hold 10 MB of GPU memory it may never use. A cheaper face
  material saved about 1 ms a graph and was not kept.
- **Uploads:** a slot writes the workers' arrays with one `queue.writeBuffer` a field (no jax
  arrays, no kernels, no GPU copy kept), with constant fields as uniforms: the session submits
  to the GPU half as often (956 submits in a 4 s pan, from 1,910).
- **Restyling** colors, widths or sizes repaints the tiles shown on the main thread: no worker
  job (7 before, every tile on screen), 8 ms.
- **GPU memory** (all buffers on the device, the plot's included): 254 MB after the session
  and 3 s still before; 105 MB after, within the budgets (VECTOR-TILES.md, "Caches"), and
  stable across repeated zooms (vector-tiles.spec.js checks a third pass adds under 8 MB). Most
  of what is left is slot capacity: a mark keeps the size of its largest tile, and every mark's
  instance matrix is an identity matrix of 64 bytes a row at its capacity, which the slots
  could share (not done).
- **Selection** counts tile ranges before listing them: a 20-degree view at zoom 14 took
  540-630 ms (three runs in Node) and now 0.02-0.3 ms; the whole world at zoom 14 threw.
- **The globe** (orthographic, dev, 2 runs each): first zoom 180 to 211 frames, p95 83 to 33 ms,
  max 125 to 67 ms; memory after the session 256 to 130 MB.
- **Place names:** placement takes under 1 ms a placement in this session; collisions go
  through a grid now (2,000 candidates: 12 ms to under 2 ms).
- What remains in the dev server is Svelte's dev-mode bookkeeping for each new slot's options
  (about 20 ms a slot in the settings pane's effects) and the node graphs above.

### Live vector tiles in a 3D flyover

Under a flyover camera (TODO 66, docs/VECTOR-TILES.md "Live tiles under a 3D flyover") the same
slots draw a flat basemap and each tile's buildings stand in a fourth mark. Measured 2026-10-01
with `FLYOVER=1` in tests/perf/vector-tile-live.spec.js: the same local replay (every zoom-14 tile
the Amsterdam tile, its 6,995 buildings standing: about 127,000 building triangles a tile), a
1200 x 800 plot at a device pixel ratio of 2, the dev server, a fresh server each run, medians of
3 runs. "Flight": 400 m up, looking 30 degrees down, 6 km north over 4 s (new tiles all the way);
"climb": up to 4 km and back over 4 s (zoom 14 to 11 and back); "flight again" the same flight;
"fresh flight" the same 6 km east of it. "Frames" are completed plot frames of the animation
frames; "missing" the time the view's tiles were not all shown; "covered" the time after the
camera stops until they are.

| Phase | Frames | p95 / max gap (ms) | Long tasks | Missing (ms) | Covered (ms) | Requests | Worker jobs | Mark builds | GPU allocated / live (MB) |
|---|---|---|---|---|---|---|---|---|---|
| Flight | 234 of 235 | 16.8 / 50 | 1 | 67 | 0 | 19 | 19 | 12 | 88 / 304 |
| Climb | 181 of 182 | 50 / 100 | 3 | 2,083 | 132 | 100 | 167 | 117 | 170 / 472 |
| Flight again | 238 of 239 | 16.8 / 33 | 0 | 0 | 0 | 0 | 25 | 0 | 0 / 472 |
| Fresh flight | 240 of 241 | 16.8 / 17 | 0 | 483 | 0 | 32 | 40 | 0 | 0 / 472 |
| Idle 3 s | | | | | | 0 | 1 | 0 | 0 / 321 |

- **Frames.** Every animation frame of a flight draws a plot frame; slots and their materials
  are reused by the second flight (no mark builds, no new pipeline in any phase). The climb's
  long frames (up to 100 ms, 3 long tasks) are new slots building their materials as the levels
  change, as in 2D's first zoom.
- **Requests and work stay bounded.** At most 48 tiles selected (a finer level must fit in 36),
  48 slots at the most in these runs, at most 16 requests in flight, of which at most 8 for tiles loaded ahead of
  the view. A repeated flight requests nothing (the raw bytes are cached) but prepares its tiles
  again (19-27 jobs): a dense tile's arrays with buildings are 6.7 MB, so the 48 MB prepared
  cache keeps about 7 of them.
- **Latency.** With every tile reply delayed 200 ms (`DELAY=200`), a flight still showed its tiles
  in time (missing 67 ms: the tiles ahead of the moving camera load first), a climb missed
  tiles for 2,467 ms and a fresh flight 550 ms, and the view was covered within 50 ms of the
  camera stopping. The 2D session with the same delay: first zoom missing 1,917 ms (1,000
  without), fresh zoom 1,766 (450); both covered once the motion stopped.
- **Buildings.** Switching `extrudeBuildings` off or on prepares the shown tiles again from
  their bytes (21-29 jobs, no request) and builds at most one mark. A dense tile's buildings add
  25 ms of worker time (75 ms in all) and 5 MB of arrays.
- **GPU memory** is the largest cost: a slot holding a dense tile's buildings holds about 15 MB
  for them (their capacity, 131,072 rows, times the corners' 48 bytes and the identity instance
  matrix's 64), and its flat faces about 8 MB more, so this session held 300-480 MB, and 321 MB
  three seconds after it (the free slots' 64 MB budget trims the rest). Real tiles are lighter on
  average than the densest bundled one everywhere. Sharing one identity instance matrix between
  the slots (Stage 63's open item) would save about half.

## Scales and axes

- **Categorical scales:** encodings of host columns are cached (per column and domain). A new
  category notifies every mark on the scale, which re-prepares. A numeric GPU column used as
  categories needs an explicit domain and costs one pass per category.
- **Continuous scales:** inferred numeric domains share immutable/current-revision summaries
  across compatible column, mask and transform requests; in-flight work is reused and ready
  requests batch. Explicit domains skip normalization reads. Output-range and palette edits do
  not re-infer domains; colormap changes can rebuild a mapping pipeline as recorded above.
- **Axes:** explicit domains (`x={{ domain: [0, 1] }}`) skip every extent readback and let marks
  swap masks under brushes.

## Interaction

- **Picking:** while an interactive mark needs it under a moving pointer (hover, brush,
  select, nearby, tooltips, pointer-move or wheel handlers), a picking pass is drawn with every
  rendered frame. A pointer move reads back two pixels, at most twice per frame. Marks that only
  take clicks (`onclick`, `onpointerdown`; a live VectorTile's tiles) draw it on demand (TODO
  63.2): a click asks for one frame that draws the pick of the current view and data, and waits
  for it. Panning and zooming over them cost no picking pass and no picking materials (a first
  zoom over dense tiles built 70 node graphs, half of them picking, in 1.2 s of the dev server's
  main thread).
- **Pointer handlers:** a mark whose scope maps rows to source rows reads back one value per
  pointer event, including the picks of a brushable mark (picked through `_pickable`, without a
  handler of its own). Hover and click on a Filter's rows read back twice.
- **Brush:** previews are jitted masks with bounds from buffers (nothing compiles); a commit reads
  back the count once. Downstream, Filters rerun, responding marks update their opacity (one
  upload in flight), and marks that cannot swap masks re-prepare.
- **Hover and selection masks** are built on the host and uploaded per change.
- **Nearby:** one evaluation per frame; world columns cached per frame topology.
- **A selection's membership on views** (TODO 139.4): every reader of a resource (respond,
  Filter, an Interaction's columns, expression operands) reads one virtual column per view,
  cached for the resource's own revision, so a second consumer of a view is a cache hit and a
  hover does not recompute `@selected`. An aggregate reduces its contributors' membership with
  one one-hot product up to 4,000,000 rows x groups, and past it with a scatter-add and a
  gather (jax-js's scatter bakes its size into its shader, so rows are padded to a power of
  two). On the CPU backend (`tests/perf/investigations/selection-membership.mjs`, 100,000 rows,
  50 selected per update): the table 0.7 ms, a Group into 1,000 groups 10 to 12 ms (896 ms with
  the one-hot product alone), a Group of that Group 8 to 11 ms, a second consumer 0.1 ms.
  Contributors of a nested aggregate are composed on the host per selected group (a pick's
  rows; one readback per group of the level above), which a click or hover pays once.

## Globe guides (TODO 141)

A 2D orthographic globe's graticule and reference rules are GPU line segments in lon/lat,
projected in the vertex shader through the live center (docs/SPHERICAL.md). Rotation changes
two uniforms; zoom changes the camera, and only crossing a power of two in segments per period
(a chord's sagitta within a quarter pixel) swaps the geometry, cached per level, with the same
materials and pipelines. The overlay keeps the outline and samples only labeled lines.

Diagnosis before the change (DPR-2 Chrome on a real GPU, `/test/stage14-orthographic-default`,
40-frame wheel sequences): guides on 32.5 / 31.6 ms per frame, off 16.7 ms, with 144k to 367k
option reads and 4.7k to 12.6k SVG segments per update. After it, `tests/perf/globe-guides.spec.js`
(`/test/globe-guide-perf`, 400 px, DPR 2, warm identical 40-event wheel sequences on fresh pages)
on Chrome's software WebGPU (SwiftShader, 4 cores; every vertex is CPU work there, so these are
not a real GPU's times):

| | guides on | guides off |
| --- | ---: | ---: |
| SVG guides (before), mean / p95 frame interval | 135.4 / 333 ms, 135.4 / 350 ms | 119.5 / 300 ms, 116.6 / 283 ms |
| GPU guides (after), mean / p95 frame interval | 130.2 / 433 ms, 126.5 / 400 ms | 116.5 / 317 ms, 123.1 / 317 ms |
| GPU guides: pipelines / shader modules / buffer KB in the sequence | 0 / 0 / 1 | 0 / 0 / 0 |
| Frames drawn in a second of idle afterwards | 0 | 0 |

On SwiftShader the vertex work the guides add is comparable to the SVG work they replace; the
CPU cost the diagnosis found (option reads and path building per update) is gone, which is
what a real GPU's frames were waiting on. A real-GPU on/off rerun is still to be recorded.

## Animation and settling

- A scope's clock moves once per displayed frame, however many Plots and things read it.
- An animated step does not wait for the GPU (it did until TODO 32.11: a 1M-point transition
  drew the same frames without the wait). Pending writes and atomic layout publication defer
  applying the next frame together, preserving elapsed time. They do not extend transition
  durations. Explicit `holdAnimations()` and exports pause time. Slow preparation therefore
  reduces the number of drawn frames; a final frame can still be late if preparation itself
  extends past the deadline. Playback/Simulate automatic ticker steps retain their 250 ms cap.
- Numeric tween interpolation and label-footprint construction reuse compiled programs.
  Filters reuse membership masks/counts when predicate inputs and source order are unchanged.
  Moving opacity uses conservative blending; its range is read only for a mounted legend.
  Automatic bounds and picking can still read small summaries back while a tree animates.
- Marks with channel animation (`animate()`, `tween()`, `@time`) or `enterEffect`/`exitEffect` read
  compacted rows: behind a brushed Filter they re-compact and re-prepare on every move. A mark
  animated by the `animation` switch alone keeps the Filter's rows (TODO 32.12).
- **`@time` in a transform** reruns it (and everything under it) on every frame its value moves:
  per frame, the transform's own cost (a Filter's readback, a Bin's extent readbacks) plus its
  marks' (a mask swap with explicit domains, a full preparation without). No compile per time.
  `interval()` or `floor()` limit it to once per step.
- **A moving `tween()`**: the producer publishes current numerical values once per frame.
  Root and nested expressions share the contract; targets/state stay private. Eligible marks
  write retained fields, while Filter/Bin/Group and geometry-dependent consumers recompute on
  current revisions. Their normal costs still apply. Explicit Bin edges avoid repeated extent
  inference. Numerical tweening suppresses implicit duplicate rendering transitions; an
  explicit `animate()` remains a separate mark transition.
  Stable Point/Rect geometry can reuse buffers with automatic bounds: completed serialized
  writes contribute current numeric summaries, while unchanged paint and its animation stay
  intact. Only consumed static columns participate in that reuse check. Unchanged noninteractive
  Text can keep its glyph atlas and fade through upstream numerical changes; changes to its
  text, footprint, rows or response resources prepare normally. Inferred paint scales and
  unsupported conversions/refinement remain conservative fallbacks.
  Reused writes advance the completed publication order and refresh the current tooltip scope;
  explicit dragging stays on ordinary preparation. Rect updates retain raw unchanged corners,
  so partially changed geometry can recover from an earlier invalid interval.
- Rendering fields capture their animation policy when a write is queued. Unchanged targets
  keep their original schedule, including scalar and color uniforms; unrelated geometry
  updates do not restart them. Keyed entry/exit fades remain explicit over live columns, with
  row opacity gathered in the same keyed union as geometry. Repeated writes of one staging
  frame preserve the gathered transition instead of uploading its target again. Vector capture reads displayed
  color and alpha, so intermediate SVG frames agree with the rendered transition.
  Rect, Prism and GeoJSON meshes preserve fractional row alpha and use the shared blending
  policy. When a layout collapses a row before a Filter removes it, animate its authored
  opacity to zero alongside the layout to make the fade visible; an exit effect starts at
  removal and cannot make zero-area geometry visible again. Sunburst demonstrates this.
- `whenSettled()` (plot and transform handles) waits for the preparations caused before the call,
  the uploads and the GPU queue. It does not wait for animations: use
  `whenAnimationsFinished()`.

## Recommendations for app authors

1. **Give axes explicit domains** when you know them. It removes the extent readback and lets marks
   under a Filter swap masks instead of re-preparing.
2. **Give continuous color and size scales explicit domains** (a `fillScale` or `sizeScale`
   with a domain) under brushes, for the same reason.
3. **Keep column arrays stable.** Update Data with an object of columns and pass unchanged columns
   as the same array objects. Avoid arrays of row objects for data that updates.
4. **Derive control-driven columns in a Calculate**, not by replacing the table: only the
   Calculate and what is under it rerun, and constants do not compile.
5. **Prefer explicit parameters under interaction:** explicit Bin edges, Hexbin `extent`, Density
   `bandwidth` and `bounds`, Slice `extent`. Avoid expression-valued integer parameters (`bins`,
   `resolution`, `steps`) that follow a Filter.
6. **Size `maxElements`** to your data: it is the initial allocation, and data past it grows the
   buffers (a reallocation of every field).
7. **Prefer BoxPlot, Violin and the `quantile` reducer over Summary**, and keep Group/Pivot to
   modest group counts, under brushes.
8. **Keep Dodge/Swarm to thousands of points** when the view zooms: each zoom step lays out again.
9. **Keep per-frame work out of transforms** when marks can do it: read `@time` on a channel, or
   in a transform through `interval()` when once per step is enough; read a tweened column directly
   on a channel (the fast path) unless a transform needs the moving values.
10. **Measure production builds.** The dev server adds Svelte's dev-mode tracking (about 10 ms per
   brush move over the distributions example) and serves unminified modules.
11. **Lower Points3D's `detail` to 1 or 2 for hundreds of thousands of spheres** (see
   [Marks](#marks)), or draw them as Points, flat symbols of a few triangles each.

## Known hot spots (for contributors)

Ranked by how often they hurt interactive use. Each is a candidate for a future stage.

1. **Eager dispatch in marks.** The transforms on brushing paths run as compiled programs, and
   so do a mark's axis extents and categorical codes (see
   [What runs as one program](#what-runs-as-one-program)); a field write's layout (padding a
   position to four components, casting) is still a few eager operations per field, and a
   preparation reruns in full on any change, though a field whose input is the same as last
   time writes nothing (TODO 30.4). The brushed distributions went from 1,491 to ~1,125
   operations per drag with these (TODO 33.4); what is left there is dispatches inside the
   programs and submits, not eager work.
2. **Series marks' pointer events** read one row each (a series row to its input row); other
   marks read none on the root table and one per event over a view (TODO 29.1).
3. **Grouped work depends on the reducer and shape:** shared sum/count/extreme kernels
   select one-hot or striped scatter strategies; grouped expression reductions can
   use sorted runs. Summary and sorting-based statistics have additional work and
   readbacks. Measure the specific transform and interaction instead of assigning
   every grouped operation O(rows × groups).
4. **Facet definitions** replay unmounted cells (a redefinition now reruns only the changed
   pipeline steps, TODO 29.11); Partition reuses groups across Filter views only when their rows
   are unchanged (29.12), and over a view of host columns reads only the view's source rows
   (one readback, not one per key).
5. **Force** re-prepares its marks each step, though a step writes only their position fields
   (TODO 30.4: 9 field writes to 3, about 17 operations and 2 ms a step) and runs once per
   displayed frame; Dodge lays out once a zoom settles (TODO 30.9). **Graph layouts** are
   uncached and on the main thread.
Fixed 2026-09-26 (TODO 29): grouping under a bucketing Filter (29.10), pointer-handler readbacks
(29.1), per-group loops and Summary's per-group readbacks (29.7-29.9), mask-independent work redone
per brush (29.5-29.6), silent `maxElements` truncation (29.2), extent readbacks (29.3-29.4).
6. **Per-operation dispatch cost:** ~70 us per jax-js GPU operation. A brush move over the
   brushed distributions issues ~940 operations; marks and transforms issue about half each
   (TODO 33.1's table). The bundled jax-js now encodes a task's dispatches into one command
   encoder and one submit, with uniform bind groups cached per pipeline (patch 0012): that
   brush move went from ~715 submits to ~70 and 666 to 598 ms per drag. Marks then stopped
   repeating work (TODO 33.2: a box plot's extents, transforms' category codes, a solid line's
   dash distances): 8,443 to 6,163 operations per drag there, 3,563 to 2,176 over the running
   totals. Transforms and the box and band geometry then became compiled programs (TODO 33.3,
   2026-09-26; builds alternated, per drag): brushed distributions ~3,270 to ~1,680
   operations and 457 to 408 ms, the 500k filter chain ~2,350 to ~1,125 and 296 to 286 ms,
   running totals 2,123 to 947 (its time within noise). What remains is mostly whole-mark
   preparation (30.4) and one program per Density chunk.
7. **Prefix sums' memory:** jax-js's `cumsum` has an O(rows × chunk) stage, so a Window (or
   anything built on prefix sums) over a large, unbucketed input peaks at ~3.5 KB per row: a
   windowed mean over a Filter keeping 30-50% of 2M rows takes ~400 ms and 7 GB. Filters keeping
   under a quarter bucket and avoid it (TODO 31.1 measurements).
8. **Animated marks under a Filter** with channel animation or `enterEffect`/`exitEffect` read the compacted
   rows, so every new selection re-prepares them, reads back each row's source row and builds
   a key per row. A mark animated by the `animation` switch alone keeps the Filter's rows and
   swaps their opacity, as a non-animated one does (TODO 32.12; RENDERING.md, "Mark
   capabilities").

## The docs site: loading (TODO 68)

How the docs site loads, and what it took to make it fast. `node tests/perf/docs-loading.mjs`
measures it: it serves production builds as a static host would (gzip; the rules below) and loads
docs routes in Chrome with WebGPU at a device pixel ratio of 2 (1500 x 1100), in a fresh context
each time, several runs per build, alternating builds run by run. `npm run check:docs-budget`
checks a build's budgets: a text page under 300 KB of compressed JavaScript and none of the
plotting runtime, the first preview requested before the runtime, completed live frames without
page errors, every web preview under 500 KB
on the wire; a typical gallery thumbnail under 75 KB, the home page's under 300 KB in all, and on
the examples page every card's thumbnail loaded and no card loading the runtime or a scene.

**How a page loads.** Docs pages are prerendered: the first HTML has the prose, navigation,
options, the example's source and its preview as an `<img>` with its size, so the page paints
before any script runs and the browser fetches the preview at once (the page's first example
eagerly, at high priority; others lazily). The pages' data (API entries, the options table, the
gallery catalog) is computed on the server; a page carries only its own. Each guide or reference
page loads only its own Markdown. The plotting runtime (`src/lib/docs/live.js`: the scene runtime,
three.js, jax-js, about 1 MB compressed) loads when an example comes near the viewport in a
browser with a WebGPU adapter, two examples at a time, with the payload requested first and the
font beside it; an example below the fold downloads the runtime once the page is idle. Without
WebGPU nothing of it loads and the preview stays. Leaving a page cancels what its examples were
loading. Active queue slots now release immediately on navigation, not after abandoned work
finishes; fetches abort and disposed scene settlement wakes. Late imports cannot mount a plot.

**Scene components and older examples (Stage 97, 2026-10-05).** The generated scene registry
provides dynamic imports; a scene preloads only the component kinds it contains before mounting.
Imports are cached across scenes, with failed downloads retried on the next load. Portable
templates use this same loader. The docs target ES2022 with native top-level await. The previous
promise-wrapper plugin moved exported D3 functions after their prototype initializers when the
scene was split, breaking the production build; removing it preserves native module ordering
and avoids the wrapper's code expansion. Exported notebook/headless bundles still inline every
dependency for offline use.

Every public gallery route uses the shared Example shell. Older Svelte programs now share its
viewport gate, queue, persisted source-language choice and static preview; `/gallery` redirects
to `/examples`. `build-thumbnails.mjs` encodes full-column previews from the same DPR-2 PNG
used for thumbnails, up to 820 x 1200 CSS pixels without upscaling. A composition initially shows
its selected/largest plot, then its full program after all canvases draw. Python equivalents
for these older programs remain source-only. Paired examples retain Python editing and trees.
The largest of the 115 new gallery previews is 184 KiB; the budget checks every image variant.

Cold production loads before (main at **36c6678c**) and after Stage 97, Chrome at DPR 2,
HTTP/1.1 with gzip, one fresh context per route:

| Route | JavaScript, compressed before → after | JavaScript, decoded before → after | Script requests before → after |
| --- | --- | --- | --- |
| Points (`/reference/svelte/points`) | 1,717 → 1,208 KiB (29.7% less) | 6.40 → 3.78 MiB (41.0% less) | 150 → 81 |
| Older program (`/examples/pie`) | 1,440 → 1,291 KiB (10.4% less) | 5.53 → 3.93 MiB (28.9% less) | 46 → 98 |

The mandatory shared runtime is still about **729 KiB compressed**: WebGPU rendering, JAX,
frame/scaling, interaction and shared mark infrastructure. Code splitting increases request
counts on some older Svelte programs; browser caching shares the resulting modules on later
pages. In the after samples, Points' preview/live plot appeared at 63/560 ms locally and
546/2,763 ms on the constrained profile; Pie at 33/379 ms locally and 557/2,523 ms constrained.
Points has zero layout shift; Pie shifts 0.024 as its complete program replaces the preview.
These single samples establish byte savings and working production plots; shader caches and
machine load were not controlled, so they are not a comparative timing benchmark.

The audit commands (before used the localhost profile only) were:

```sh
node tests/perf/docs-loading.mjs --profiles localhost,constrained --routes points,legacy --runs 1 --json /tmp/stage97-after-metrics.json
npm run check:docs-budget
```

The final budget passes: the text page loads 83 KiB of JavaScript without a plotting runtime;
all 151 gallery cards load their thumbnails without a live scene. All 165 paired examples and
115 legacy previews/thumbnails were rebuilt. Production Points/Pie vector geometry and the
script-free preview were inspected separately; interrupted navigation is covered at DPR 2.

**Previews.** `scripts/build_examples.py` writes each example's web preview beside its
full-quality `snapshot.svg`: the SVG export when it is under 40 KB gzipped, else WebP at 1x and 2x
the column's width (818 and 1636 px), quality 0.85, for a `srcset`; the plots' generated
descriptions are the alternative text. 18 of the 129 examples are WebP (3D scenes, lights, maps,
heatmaps and images, Lorenz, earthquakes, the time series): Lorenz's 6.7 MB SVG (6.65 MB of it a
base64 PNG) is 37 KB and 135 KB; the earthquakes' 3.0 MB, 58 and 170 KB; the vector tiles' 1.9 MB,
19 and 49 KB. A PNG at 2x was 4 to 70 times the WebP's size (Lorenz: 856 KB). Crops at DPR 2 of
qualities 0.8, 0.88 and 0.92 against the PNG kept text and lines clean from 0.8; 0.85 leaves a
margin. Raster previews draw their text in the
bundled font (the PNG export embeds it); an SVG in an `<img>` cannot reach the page's fonts, so its
text uses the system sans-serif, as the inline snapshots did until the runtime loaded the font. The
largest preview a page sends is the earthquakes' 2x WebP, 170 KB; the largest SVG, the contours',
is 699 KB raw and 67 KB gzipped.

**Gallery thumbnails (TODO 69.19).** The home page's gallery (eight cards) and the examples
page (every example, 142) show cards with a thumbnail of the chart, made when the site is built and
never a live plot: `scripts/build_examples.py` writes a program pair's (`PREVIEWS["thumbnail"]`:
the plot, or one panel of a dense composition, fitted within 320 x 200 CSS pixels, WebP at 1x and
2x, quality 0.8), and `scripts/build-thumbnails.mjs` (`npm run build:thumbnails`) a gallery
program's without a Python pair: it draws the program on a dev server in Chrome with WebGPU and
exports its largest plot through the plot's export panel, the same fit and encoding, into
`static/example-builds/gallery.json`. Both skip an unchanged example (the program, its data, the
library and the script); capturing all 134 gallery programs takes about 3 minutes. Simple charts
were measured as SVG too: 1 to 6 KB smaller than the 2x WebP, but an image keeps the bundled font
and a fixed decoding cost, so thumbnails are always images. Sizes (264 thumbnails, the 2x image):
median 3.7 KB, largest 34 KB (RGB points); the home page's eight, 124 KB. Cards load lazily but
the examples page's first row; at 1500 x 1100 and a device pixel ratio of 2 the home page loads
all eight (Chrome loads lazy images within about 1,250 px of the viewport), 121 KB, and the
examples page 33, 307 KB; its HTML is 35 KB compressed (14 KB before). The home page's first plot
is the Palmer penguins (342 points; a 50 KB SVG preview, 6 KB compressed, and a 5 KB payload);
before and after, constrained: first paint 300 and 312 ms, preview 491 and 486, live 3,226 and
3,296; JavaScript 1,649 and 1,650 KB; layout shift 0.

**Serving.** Files the pages load are named by their contents: `/_app/immutable/` (Vite) and
the examples' `payload`, `tree`, `preview`, `tree-preview` and `thumbnail` files
(`<name>.<10 hex digits>.<ext>` under `/example-builds/`, the gallery programs' thumbnails under
`/example-builds/gallery/`). A host should send those with `Cache-Control: public,
max-age=31536000, immutable`, and revalidate everything else (`no-cache` with an ETag: the HTML,
`__data.json`, `/example-builds/manifest.json`, `gallery.json` and `assets.json`), so a deploy never mixes old
scenes with a new runtime. Compress text (HTML, JavaScript, CSS, JSON, SVG, and the TTF fonts).
`404.html` is the client-side app's fallback for paths that are not prerendered; static hosts
serve it for a missing file. The docs site is not deployed yet, so these were checked only with the
audit's server.

**Fonts.** The default font stays a TTF for the screen and for PDF embedding. WOFF2 was measured
(Regular: 139 KB, against 201 KB for the TTF gzipped and 154 KB brotli-compressed; Bold alike),
but the font is on no critical path now: prose and previews do not use it, and an example fetches
it beside the runtime, so it arrives at 1.2 s on the 10 Mbps profile while the runtime arrives
later. Only the regular face loads up front; the others load when text uses them.

**Results** (2026-10-02; Chrome, an Apple M-series GPU, a local static server over HTTP/1.1 with
gzip as `vite preview` serves; medians of 5 runs per build, alternated; the machine was shared with
other builds and browsers, load average 6 to 12). "Constrained" is 10 Mbps down, 5 up, 80 ms
latency; "4x CPU" is Chrome's CPU throttling; "warm" is the constrained network after another
docs page primed the HTTP cache; "navigation" is a client-side link from `/docs/start`, timed
from the click. Before: commit de3ca850; after: this stage.

| | before | after |
| --- | --- | --- |
| Text page (`/docs/introduction`): JavaScript, compressed | 1,729 KB in 144 requests, 1,066 KB of it the runtime | 82 KB in 28 requests, no runtime |
| Text page, first paint: localhost / constrained / 4x CPU | 156 / 2,752 / 440 ms | 44 / 312 / 80 ms |
| Points (`/reference/svelte/points`), first paint, constrained | 2,760 ms | 308 ms |
| Points, first preview, constrained | 3,013 ms | 467 ms |
| Points, live plot: localhost / constrained / 4x CPU | 496 / 3,576 / 1,355 ms | 474 / 3,305 / 1,328 ms |
| Points, warm: first paint / preview / live | 276 / 533 / 764 ms | 132 / 183 / 631 ms |
| Points, navigation: preview / live | 491 / 679 ms | 325 / 560 ms |
| Points, layout shift | 0.085 | 0 |
| Lorenz (`/examples/lorenz-attractor`), bytes | 7,844 KB (preview 4,556 KB) | 3,326 KB (preview 132 KB) |
| Lorenz, first paint / preview / live, constrained | 2,636 ms / never (the scene won the race) / 5,795 ms | 296 / 601 / 4,113 ms |
| Lorenz, preview / live, localhost | 291 / 905 ms | 36 / 709 ms |
| Lorenz, live, 4x CPU / warm / navigation | 2,920 / 2,927 / 2,776 ms | 2,204 / 1,726 / 1,745 ms |
| Lorenz, longest task: localhost / 4x CPU; layout shift | 265 / 1,138 ms; 0.189 | 217 / 931 ms; 0 |
| Home, first paint / preview / live, constrained | 2,636 / 2,897 / 3,476 ms | 292 / 480 / 3,191 ms |
| Export guide (`/docs/export`, its example below the fold), first paint / preview, constrained | 2,764 / 3,031 ms | 332 / 551 ms |
| Export guide, live | 3,612 ms, scrolled to or not | 0.6 s after it is scrolled to (the audit scrolls at 3.3 s) |
| Gallery program (`/examples/pie`), first paint / live, constrained | 2,656 / 3,236 ms | 292 / 2,208 ms |

Over HTTP/2 (`--h2`, 3 runs, constrained), as most hosts serve: the text page paints at 248 ms
(1,876 before), Points at 264 ms with its preview at 236 and live at 2,459 (1,920, 2,168 and 2,744
before), Lorenz live at 3,496 (5,042 before). Over HTTP/1.1 the runtime's 130 modules queue for
six connections; it is about 1 MB either way.

**Where the time went.** Lorenz's longest task, traced (`--trace`; a build with source maps
names the modules): 441 ms before, 418 of it script: decoding 1.2 MB of base64 columns with
`Uint8Array.from(atob(text), callback)` took 48-53 ms alone (now a loop: 3 ms), `JSON.parse` of
the 1.6 MB payload about 1 ms, parsing the inline 6.7 MB SVG 21 ms and decoding its PNG 67-76 ms
the first time; the rest is building the scene (three.js geometry and attributes, the runtime).
After: 263 ms, 231 of it the scene. The payload's base64 costs little once compressed (1.6 MB,
1.14 MB gzipped, for 1.2 MB of binary columns), so the scene protocol stays JSON.

**The dev server.** It answers at once (1-2.6 s from start; the examples' check runs in the
background). The first load of the Points page, compiling its route: first paint 444-512 ms and
live 784-874 before; 88-100 ms, preview 150-176 and live 793-832 after. An example whose build is
missing while every example is stale (the server's start rebuilds all 129): its page waited for
the whole build before, 55.5 s; it is built first now and showed at 2.3 s. Preparing the guide's
Markdown takes 20 ms (62 the first time), so saving a page needs nothing incremental.
Nothing waits for a restart (TODO 73.8): an example folder added during a build of every example
(all 154 stale after a builder change) was asked for by its page and shown 1.8 s later, built
third. A card without a thumbnail is made in the background after the queued builds, the gallery
programs' captured on the running server by one Chrome at a CPU priority of nice 10: six in 10.9 s
(1.5-2.1 s each), during which 1,629 server-rendered page loads (the examples page, a guide page,
a reference page) took a median of 7 ms, at most 23 ms (8 ms with nothing running).

The Stage 74 stars measurements above predate Stage 76’s 3D galaxy and H–R diagram.
That redesign drew ten million points in each of two views; the old histogram
workload and frame timings do not describe that workload.

Stage 76’s full-size Chrome/WebGPU regression at DPR 2 completed about 3.7 plot frames per
second during continuous age filtering. After filtering and brushing settled, a 500 ms
sample recorded zero GPU submissions and zero buffer allocations. The test checks rendered
pixels in both views, linked brush/clear behavior, orbit frame completion and phone layout.
This is a local sample, not a portable frame-rate guarantee or a new allocation audit.

The synthetic galaxy uses a [Kroupa-style broken mass distribution](https://arxiv.org/abs/astro-ph/0011328),
approximate mass-dependent lifetimes, a short red-giant phase and a white-dwarf cooling branch.
Its H–R layout follows the temperature/luminosity convention illustrated by
[ESA’s Gaia diagram](https://www.esa.int/ESA_Multimedia/Images/2018/04/Gaia_s_Hertzsprung-Russell_diagram).
It omits binaries, metallicity, extinction and detailed evolutionary tracks. Temperature
sets approximate blackbody colors; a clipped power of luminosity sets display intensity.
These are illustrative stars and display intensities, not observations or calibrated fluxes.

**Closed settings panes (Stage 77).** The pane keeps its shell and navigation state while
closed, but unmounts its controls and releases its settings-tree subscription. Plot changes
therefore do not update hidden settings controls. Reopening reads current settings and restores
the target, search, expanded sections and scroll position; if the target was removed, the
existing ancestor fallback applies. This is a visibility-lifecycle change, with no settings
cache or public API change.

### Core refactor baseline (Stage 78, 2026-10-03)

Measured before moving lifecycle code, on a fresh dev server at DPR 2 in Chrome/WebGPU.
Each plot finished loading and settled before measurement. Navigation sends 16 wheel events
100 ms apart; filtering sends 16 age-slider changes 120 ms apart. These are paced interaction
measurements, not maximum frame-rate tests. CPU is CDP task time; GPU counters count allocations,
dispatches and readbacks, not GPU execution time or bytes uploaded. CPU profiles add overhead,
so idle CPU was measured separately with profiling disabled.

| Scenario | Interval ms | CPU ms | Script ms | Completed plot frames | GPU allocations / bytes | Compute dispatches | Readbacks |
|---|---:|---:|---:|---:|---:|---:|---:|
| Small plot, warm navigation | 2,156 | 81.1 | 15.6 | 16 | 0 / 0 | 0 | 0 |
| Galaxy, warm navigation | 2,136 | 80.3 | 14.5 | 16 | 0 / 0 | 0 | 0 |
| Galaxy, age filter | 2,114 | 154.4 | 24.7 | 6 | 7 / 28 | 77 | 7 |
| Live globe, warm navigation | 2,373 | 736.6 | 522.8 | 27 | 78 / 71,734,600 | 0 | 0 |

All three plots submitted **zero GPU work** and allocated no buffers during each settled idle
interval. Unprofiled four-second idle task times were 22.1 ms (small plot), 29.2 ms (galaxy)
and 46.3 ms (globe). Galaxy navigation/filtering kept its settled live GPU allocation at
6,513,056,652 bytes. Globe navigation loads and replaces tiles; it ended at 438,401,460 bytes.
Its warm navigation still includes about 220 ms of sampled Three.js node building and two new
render pipelines. This pre-existing tile/material churn is distinct from request bookkeeping.

Existing validation limitation: the export-menu browser spec assumes DPR 1 for PNG dimensions.
Run that dimension assertion at its declared DPR; rendering/interaction regressions and this
performance audit use DPR 2. No rendering or example source changed for the baseline.

### Core refactor integration (Stage 85, 2026-10-03)

Repeated the same fresh-server DPR 2 measurements after the lifecycle/controller changes,
with no other browser suite or build running. Export capture and settings replay corrections
do not run on these navigation paths. The table reports one paced sample per scenario;
differences this small do not establish a speedup or slowdown.

| Scenario | Interval ms | CPU ms | Script ms | Completed plot frames | GPU allocations / bytes | Compute dispatches | Readbacks |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Small plot, warm navigation | 2,140 | 87.8 | 18.2 | 16 | 0 / 0 | 0 | 0 |
| Galaxy, warm navigation | 2,149 | 91.1 | 16.3 | 16 | 0 / 0 | 0 | 0 |
| Galaxy, age filter | 2,216 | 167.0 | 25.8 | 6 | 7 / 28 | 77 | 7 |
| Live globe, warm navigation | 2,363 | 747.4 | 510.8 | 28 | 78 / 71,734,600 | 0 | 0 |

These intervals include input pacing and settlement: the corresponding completed-frame rates
are 7.5, 7.4, 2.7 and 11.8 per second, not maximum drawing throughput. Queue submissions are
32, 32, 72 and 56 respectively. Navigation adds no readbacks. Galaxy filtering still allocates
only four-byte count-readback buffers, with no row-sized position/color allocation or pipeline
compilation. Three repeated zoom/filter cycles kept its buffer-accounting total at
6,513,056,652 bytes. The small plot stayed at 21,289,740 bytes.

Every settled idle sample had zero submissions, allocations, dispatches, readbacks and completed
frames. Unprofiled four-second idle CPU task times were 29.4 ms (small plot), 48.3 ms (galaxy)
and 80.8 ms (globe); profiling itself adds substantial CPU overhead. The globe still rebuilds
tile/material resources while navigating: two new render pipelines in the warm sample, then
none in the three repeat cycles. This program separates ownership and removes duplicate
interpretations; it does not address the existing tile/material build cost.

The GPU counter's `liveBytes` means bytes created minus bytes explicitly destroyed, not
measured resident GPU memory. It cannot observe garbage collection of Three.js allocations.
For live tiles, `whenSettled()` also precedes the spare-slot trim timer: after one second still,
the pool removes a large free slot every 250 ms until spare capacity is at most 64 MiB. Active
slots retain their capacity. Longer globe sweeps therefore require separate accounting for
slot capacity, delayed retirement and destruction; an increasing aggregate alone is not proof
of a library-owned memory leak.

A separate twelve-cycle globe comparison confirms that this accounting pattern predates the
refactor. On untouched `4b68a972`, cycle endpoints were 539.4–665.4 MB and the final settled
sample was 581.0 MB; integration measured 543.7–694.6 MB and 614.6 MB respectively. Both had
zero idle work and zero navigation compute dispatches/readbacks. The baseline completed 334
frames during those twelve cycles. Baseline route teardown reduced the counter to 205.3 MB,
including allocations made by the destination page. These samples do not establish a resident
memory plateau. A separate tile/Three.js allocation audit should distinguish slot high-water
capacity, cached uniforms and instance-matrix wrappers before changing their lifetime rules.

Four additional integration mount/navigate/unmount cycles returned the counter to
20.756, 20.768, 20.780 and 20.792 MB on the destination docs page, from 400–438 MB with the
globe mounted. Thus large tile allocations were released on each destruction; small accounting
increments still cannot distinguish unreleased buffers from objects reclaimed without explicit
`destroy()`. No resident-memory or leak-free claim is based on this counter alone.

### Globe navigation and tile updates (Stage 86, 2026-10-03)

The cursor lag was a coordinate error: a 60 × 30 CSS-pixel drag moved a rendered surface
point only 30 × 15 pixels, because navigation grabbed the fitted outer radius (2) instead
of the globe surface (1). Drag, wheel and pinch now use `baseRadius`; the DPR 2 regression
measures the rendered point against its pointer/midpoint within 1–1.5 CSS pixels. The
north-up solver also considers both visible longitude solutions near a pole and preserves
unconstrained coordinates at exact poles and limbs.

A controlled DPR 2 comparison routed identical ocean tiles locally and applied 16 paced
zoom changes. The old slot publication rebuilt every item object; the revised path retains
unchanged entries. Both runs made 23 list publications containing 282 entries. Changed
entry identities fell from 282 to 66. Final rendered pixel hashes were identical.

| Slot publication | Interval ms | CPU ms | Script ms | Completed frames | GPU allocations / bytes | Readbacks | Submissions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Recreate all entries | 1,726 | 387.9 | 262.7 | 25 | 62 / 42,994,064 | 0 | 50 |
| Retain unchanged entries | 1,675 | 279.2 | 208.0 | 25 | 62 / 42,994,064 | 0 | 50 |

This is one timing pair, not a throughput guarantee. The measured reduction is in reactive
item updates; geometry, allocation and rendering work are unchanged. Camera bounds now
reuse their two arrays as well. Instrumentation found 32 camera applications for 16 wheel
events because accepted viewport state returns through the prop, but Svelte already
coalesces those into 16 tile-selection notifications. No new scheduler or echo cache was added.

The external live-globe check still varies with arriving tiles: the first 16-wheel sweep
took 2,118 ms, 303.9 ms CPU and 267.4 ms script, completing 19 frames with 33 allocations
(21,506,768 bytes), 38 submissions and zero compute dispatches/readbacks. A warm sweep
completed 28 frames with 78 allocations (71,734,600 bytes), two new render pipelines and
626.4 ms CPU. Its subsequent three-second settled interval had zero submissions,
allocations, dispatches and readbacks. These changes remove avoidable state churn; tile
uploads and Three.js material construction remain separate causes of stutter.

### Galaxy core and H–R sampling (Stage 87, 2026-10-03)

The galaxy still draws all ten million stars. Its older bulge now contains 14% of the
population in a more compact ellipsoid; a smooth radial increase in angular scatter blends
the inner arms into that core. The existing approximate temperature/luminosity model is
unchanged. The H–R diagram uses the existing `Sample` node with 100,000 rows and seed 42,
before its age `Filter`. Sample identities therefore remain fixed as the sliders move.
Both views share source identity: a coordinate brush highlights matching stars throughout
the galaxy, including stars outside the sample. The gallery's copyable source and thumbnail
were updated alongside the running example.

These before/after measurements use fresh dev servers, Chrome/WebGPU at DPR 2, a 1300 × 1000
viewport and no concurrent builds or browser tests. Each interval includes paced inputs and
settlement: 16 wheel changes, a 16-step brush, or 16 age-slider values. CPU is CDP task time;
script time is its JavaScript subset. No sampling profiler was active.

| Scenario | Interval ms | CPU ms | Script ms | Completed frames (galaxy / H–R) | GPU allocations / bytes | Compute dispatches | Readbacks | Submissions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Full H–R, warm navigation | 5,333 | 52.3 | 15.4 | 0 / 32 | 32 / 512 | 0 | 32 | 128 |
| Sampled H–R, warm navigation | 2,126 | 70.5 | 25.2 | 0 / 32 | 32 / 512 | 0 | 32 | 128 |
| Full H–R, brush | 4,402 | 85.3 | 40.9 | 16 / 16 | 5 / 68 | 402 | 5 | 150 |
| Sampled H–R, brush | 1,673 | 81.1 | 43.5 | 16 / 16 | 12 / 2,800,068 | 418 | 5 | 150 |
| Full H–R, age filter | 2,034 | 57.7 | 18.6 | 7 / 7 | 9 / 36 | 99 | 9 | 89 |
| Sampled H–R, age filter | 2,134 | 91.7 | 34.5 | 12 / 12 | 28 / 112 | 266 | 28 | 172 |

Navigation completed about 6.0 versus 15.1 H–R frames per second across those paced intervals;
brushing completed 3.6 versus 9.6 frames per second in each plot. This single comparison shows
lower interaction latency, not a general CPU speedup or maximum frame rate. H–R navigation
still performs 32 small picking readbacks; their count is unchanged. No render pipelines were
built in these intervals. The first brush built 9 compute pipelines before sampling and 11
after; navigation and age filtering built none.

Sampling adds a separate age filter for the smaller view so the sample remains stable. The
new run completed more filter frames, with more count readbacks and dispatches; every filter
allocation was four bytes. The first sampled brush allocated another 2.8 MB. Three subsequent
age-filter cycles each allocated only 112 bytes for count readbacks and kept both position
buffers unchanged, at ten million and 100,000 rows respectively. Their intervals were
2.09–2.30 seconds, with 11–13 completed frames in each plot.

Settled buffer accounting fell from 6,513,056,652 to 4,871,063,088 bytes after brushing, about
25%, and stayed at that value through the repeated filter cycles. This is created bytes minus
explicit destruction, not a measurement of resident GPU memory. Every idle sample had zero
submissions, allocations, dispatches, readbacks and completed frames. The final three-second
idle CPU/script times were 34.4/3.1 ms before and 62.1/25.3 ms after; zero GPU work does not mean
zero browser CPU activity. The full-size rendering regression also passed linked brush/clear,
age round trips, orbiting, phone layout and rendered pixels in both plots.

### Streamed globe graph reuse (Stage 92, 2026-10-04)

Live tile marks retain private runtime-sized storage nodes across buffer growth. Narrow tile
materials omit the unused identity instance transform in both render and picking passes.
Setting a flag on stock Three.js materials was insufficient: their position builder still
bound an instance matrix, causing invalid GPU draws after tile growth. The retained runs
assert zero GPU validation errors and inspect repaint pixels; earlier measurements without
those checks were discarded. Completed-frame counters alone cannot establish valid rendering.
Ordinary marks retain their existing material path. Each tile slot owns its buffers, uniforms
and picking IDs. Cross-slot NodeBuilderState sharing was rejected because that state contains
mutable bindings, observers and update nodes; there is no speculative pool of prebuilt slots.

One renderer queue allows one tile publication through its **completed draw**, then yields a
RAF. Visible tiles take priority; stale jobs and renderer disposal release pending work. This
conservative budget cannot interrupt one synchronous graph build. `compileAsync` was not added:
pipeline creation was zero in the dominant first-zoom interval, while CPU graph work was
substantial. Coarse coverage, slot fitting, request/worker/cache limits and trimming remain.

The controlled orthographic replay uses local Amsterdam tiles, labels and click picking,
a 1200 × 800 plot at DPR 2 and Chrome/WebGPU, with no concurrent builds or browser tests.
Three interleaved before/after dev repetitions each started a fresh server; baseline `7a62be92`
ran in an isolated archive with the same harness. Full metrics are in
[stage92-measurements.json](stage92-measurements.json); CPU profiles, screenshots and logs
remain locally in `/tmp/hmplot-stage92-corrected`. Repeated geography is a workload,
not a faithful map. CPU sampling measures approximate inclusive node-builder time;
instrumentation starts after load, so `first-observed` does not prove first use versus growth.

| Navigation interval (4 seconds) | Before median | After median |
| --- | ---: | ---: |
| First zoom, node-builder CPU | 725 ms | 292 ms |
| First zoom, mark build calls | 26 | 13 |
| First zoom, RAF p95 gap | 50 ms | 16.8 ms |
| Fresh-area zoom after warming, node-builder CPU | 346 ms | 2 ms |
| Fresh-area zoom, mark builds / new render pipelines | 24 / 0 | 0 / 0 |

Warmed third zooms have zero **tile** node builds. A changed label group still builds one graph
(about 7–8 ms and one pipeline in the dev sample). First and second zooms instantiate new slot
materials; first-use cost remains. Dev maximum RAF gaps were 66.7 ms; no measured build stall
exceeded 100 ms in this controlled fixture.

Three production repetitions delivered about 240 completed frames per 241 paced RAFs in each
four-second interval. P95 and maximum gaps were 16.7–16.8 ms, with no long tasks: the controlled
production workload meets the 33 ms / 80% frame targets on this machine. Minification prevents
reliable attribution to every CPU category; dev profiles supply that attribution. These
observations are not a portable frame-rate guarantee.

Restyles caused zero worker jobs, mark/node builds or pipelines. Settled idle had zero GPU
submissions, jobs, allocations or pipelines. Post-trim counted GPU buffers were 96 MB after
versus 110 MB before (medians), with the same 64 MB free-slot budget. Accounting includes
created buffers minus explicit destroys, not resident GPU memory. Dense navigation checks
bounded memory, reversals, completed frames, picking, restyled pixels and uncaptured GPU errors.

The actual gallery scene, including 6,397 earthquakes, also passed controlled tile replay,
zoom, seam and pole navigation and PNG/SVG/PDF export. Warm zoom/pole maximum gaps were
16.8 ms, but first zoom and seam changes reached 283 and 433 ms respectively. Those spikes
remain; this gallery workload does not meet the 100 ms worst-gap target. It retained over 80%
of paced frames and had no GPU/page errors or navigation readbacks. A separate real-network
reproduction performed three eight-level zoom-in/out cycles against VersaTiles with zero
console or GPU errors. Network arrivals are not pinned in that reproduction and are not used
for before/after timing claims.

### Continuous subdivision (Stage 98, 2026-10-05)

The actual Force 2D and World map projections examples were observed for two seconds at DPR 2
on fresh Chrome/WebGPU servers. Input changes continued during the measurement; settlement
after input stopped did not count as live progress. The force case adds link-horizontal curves
while running, then warms its kernels/allocation before counting. The map receives longitude
input events every 8 ms and crosses multiple seams. Live screenshots retain visible curves and
countries; warmed interactions create zero shader modules and zero uncaptured GPU errors.

| Observation | Before | After (final full-suite sample) |
| --- | ---: | ---: |
| Force completed frames / display frames | 0 / 121 | 116 / 121 |
| Force iterations during observation | 115 | 116 |
| Force maximum draw gap | 2,007 ms | 33.5 ms |
| Map worker instances created | 109 | 1 |
| Map completed frames / display frames | 108 / 112 | 90 / 121 |
| Map maximum draw gap | 36.8 ms | 36.1 ms |
| Map new mesh preparations during input | not recorded | 31 |

Before, the map drew an old mesh while canceling/restarting its seam worker. Finishing useful
work now publishes new meshes during the gesture, with one replaceable waiting request and a
completed draw between publications. Intermediate faces/boundaries clip to the current joint
map extent while the next seam cut completes. Source styles/coordinates remain interactive.
The curve fix preserves valid logical row indices and uses current coordinates, with GPU copies
keeping count/fill consistent across the allocation readback. Details and dash lengths catch
up asynchronously; changed row layouts and settled exports require fresh refinement.

These are single warmed observations, not controlled cold-compilation timings or a portable
frame-rate guarantee. First-use compilation and source-sized snapshot buffers remain costs.
Full-suite failures and their serial/baseline comparisons are recorded in TESTING.md; the
local report is `/tmp/stage98-full-browser-report/index.html`.

### Live simulation investigation (2026-10-05)

Lorenz and double gyre update 60,000 and 45,000 rows respectively. Their eager Simulate
evaluator repeatedly built/disposed row-expression intermediates. A CPU profile attributes
substantial work to JAX reference disposal, expression construction and garbage collection.
This is allocation/execution overhead; warmed observations create no new shaders.

The fixed-step catch-up loop amplifies that cost. On the October 3 baseline, Lorenz took
184 steps in 23 completed frames over four seconds: eight steps per frame. Temporarily
limiting the existing `maxSteps` setting to one brought it from about 6 to 31 fps. Double
gyre went from about 28 to 56 fps in the same experiment. Slow frames can require more
steps, which make the following frame slower. The fix retains the existing timestep and
catch-up policy, compiling the numeric update through the existing expression evaluator
and reusing it with current state, inputs, interaction flags and time parameters.

Compilation is selected from the expressions in `Simulate.update`, not from an example's name
or a measured frame rate. Every expression must use supported numeric row operations
(arithmetic, comparisons, conditions and the other operators listed in `utils/simulate.js`).
The actual source arrays must be float32; ordinary integer columns retain eager evaluation
to preserve exact comparisons. Interaction membership can be int32 or bool because widening
0/1 values is exact. Calendar/categorical operations, reductions and tweens retain their
existing evaluator. (Since then, Stage 107's shared planner compiles int32 and bool columns,
keeping a host scalar column beside an int32 array eager, and Stage 114.5 binds `@dt` as a
runtime input, so int32 membership is no longer widened to float32.) If one part is unsupported, the whole update uses that evaluator.
Initial-state evaluation is unchanged.

A program is cached by normalized expression structure, source fields and row count. State,
slider constants and clock values are arguments; time-only subexpressions retain their
existing host scalar math. A value change reuses the program, while a structure/row-count
change may compile another. Each Simulate owns a bounded cache and disposes it on teardown.
This optimization applies to eligible Simulate updates generally; it does not change the
particle count, integration algorithm, timestep or catch-up policy.

| Four-second Lorenz observation, Chrome/WebGPU at DPR 2 | Eager | Compiled |
| --- | ---: | ---: |
| Completed frames | 23 | 193 |
| Temporary GPU buffer bytes allocated (cumulative) | 5,719 MB | 31 MB |
| New shader modules / pipelines | 0 / 0 | 0 / 0 |

The final compiled sample is about 48 fps; double gyre draws about 60 fps and allocates no
new GPU buffers during its warmed four-second observation. Its rendered brushing/reset/mixing
test also records about 60 fps. Histograms still perform their existing extent readbacks; compilation
adds no readbacks. These are warmed development observations on this machine, not resident
memory measurements, cold shader timings or portable frame-rate guarantees.

**The reported day-to-day trigger is not established.** Fresh isolated checkpoints
`811c7f85` (October 3), `31173606` (October 4 afternoon), `d17e7ea4` (October 4 evening) and
unmodified `97bf67a0` all reproduce roughly 5–6 fps for this live Lorenz workload. The older
static-orbit gallery fixture draws around 60 fps, but that comparison does not date the
reported regression. Double gyre varies substantially between runs, including on the same
checkpoint. Historical comparisons use identical simulation/data payloads and each
checkpoint's vendored JAX; the pre-Stage-89 checkpoint uses its own Dark preset because
later theme fields are unsupported there. The removed top-level-await build plugin is
omitted from historical dev configs; automatic example rebuilding is disabled throughout.
No particular recent commit, server state or hardware condition is identified as the new
trigger. The optimization addresses the measured shared bottleneck without claiming that
the initial static-to-live conversion happened yesterday.

### Double gyre with an active brush (2026-10-05)

The initial simulation verification counted double gyre's frames before brushing. Dye pixels,
reset and mixing were checked afterward, but sustained gesture and committed-brush frame
rates were not measured. That missed a concrete defect in `4925a905`: inactive/manual
membership is int32, while the intersection of the rectangle's x/y constraints is bool.
The compiled evaluator only widened int32 membership, so the bool mask caused the entire
update to fall back to eager evaluation. Clearing the brush restored the compiled path.
Both mask forms then widened exactly to float32 and reused the program. (Stage 114.5 removed
the widening: `@dt` became a runtime input, and the planner reads int32 and bool masks as they
are.)

The actual page was measured on fresh Chrome/WebGPU servers at DPR 2, with the same timed
mouse gesture. These four-second observations include the first constrained-mask compile:

| Observation | Before boolean-mask fix | After |
| --- | ---: | ---: |
| Idle completed frames per second | 60 | 60 |
| Dragging completed frames per second | 16 | 59 |
| Committed-brush completed frames per second | 5 | 60 |
| Dragging P95 draw gap | 179 ms | 19 ms |
| New GPU buffer bytes during dragging (cumulative) | 4,661 MB | 64 bytes |

The follow-up browser regression warms the constrained path, then requires completed draws
during sustained moves and after commit, visible dye, zero new warmed shaders/pipelines,
less than 1 MB of new buffer allocations and zero preview readbacks. Committed states retain
the existing compact count readback. The rebuilt Python runtime also exports the actual scene
with a committed brush at clock times 128 and 256 ms; both contain gold dye that moves.

This identifies the current brush-specific failure, not the original day-to-day trigger.
An isolated `d17e7ea4` comparison also reaches the expensive eager path and becomes choppy
with the same workload; it does not reproduce the maintainer's smooth prior session. That
session's loaded artifacts/browser conditions remain unverified. The bounded fast path fixes
the reproduced cost without treating this comparison as proof that the prior observation
was mistaken. These observations remain machine-specific warmed development measurements.
