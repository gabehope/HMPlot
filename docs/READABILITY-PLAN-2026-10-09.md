# HMPlot readability plan

**Codex-generated**

**Date:** October 9, 2026

**Updated:** October 12, 2026 — progress condensed; known failures fixed.

**Status:** Stage 122 in progress: **7/18** packages closed (122.0, 122.1, 122.2, 122.3, 122.14,
122.15, 122.16). Stage 123 has 2/11 closed and Stage 124 0/7. The live checklist, with what
remains in each package, is **Stage 122 in the TODO**.

**Reconciled baseline:** local main `976a111f1090af5e962bd4c4955fdcd4305d8bb7` (Stage 121 complete).

**Original snapshot:** `1b625808230a5c90fc9f1f3ff09530bc550da6a2`; historical figures below are replaced where verified.

HMPlot should be understandable without reconstructing hidden ownership rules, positional
protocols, and state transitions across several files. This plan permits more lines when
explicit branches, names, types, intermediate results, and comments make those rules easier
to follow. Removing duplication and obsolete mechanisms remains valuable; reducing physical
LOC is not the acceptance criterion.

This is a companion to the [combined refactor plan](REFACTOR-PLAN-2026-10-09.md). It owns
behavior-preserving readability work in R0–R10, R12–R13, the core packages R16–R17 and module discovery in R18. The original reviews remain
background, not a list of unfinished work. Former R11 is now the
[library replacement trials](LIBRARY-REPLACEMENT-TRIALS-2026-10-10.md); former R14 is the
[mark consolidation design plan](MARK-CONSOLIDATION-PLAN-2026-10-10.md). Former R15 is reduced
to the feature-preservation policy at the end. Existing R numbers remain stable for references.

The execution checklist is **Stage 122 in the TODO**. Stage 123 owns the performance
changes, including Slice caching after the behavior-preserving result builder; Stage 124
owns WebGL/WASM feasibility and delivery. Their shared owner/dependency rules prevent competing
rewrites of Slice and field/storage code. Stage 124 remains pending its shared field boundary
and feasibility gates.

## Progress

The per-change checkpoint notes that used to follow here are in git history (`976a111f..`) and
in the evidence files `tests/perf/investigations/results/stages122-*.json`. In summary:

- **Strict checking.** All nine named core implementations are strictly checked, and so are
  `namedMark.svelte` (`npm run check:preparation`) and the frame publication path in
  `viewCore.svelte` (`npm run check:frames`). The checked-module count is recorded in
  [the ratchet](../tests/unit/refactor-ratchet.test.js); it is well above the target of 44.
- **Contracts.** The data-view protocol table (R16) and the five task walkthroughs (R18) are in
  [NODE-EXECUTION](NODE-EXECUTION.md). Frame composition (R17) and the typed mark-preparation
  records (R6's first step) are checked at their producers and consumers.
- **Pilots.** Density inputs, the Slice result builder, the shared WGSL path-sampling helpers,
  Python's detached-node initializer, typed channel inputs, the shared scan helpers, the
  dependency-neutral `lowerBound`, one `encoding/base64` and the R18 module moves are done.
- **Size.** `namedMark.svelte` grew from 1,470 to about 2,760 lines: about 1,070 from
  formatting and about 240 from strict annotations, with no new mark decisions. That is
  allowed growth, not a target; prefer narrowed locals to stacked casts when touching it.
- **Performance.** Each hot-path change took the paired production gate below. None showed a
  repeatable slowdown and none claims a speedup; one candidate that did slow Sunburst was
  backed out.
- **Fixed on October 12.** Failures that earlier checkpoints carried forward as "baseline":
  a grouped (`series`) Line drew its last series with no opacity, and the leak harness failed
  124 unit cases. Those were mostly fixtures, plus real library leaks in Force, keyed
  lifecycles, Pie, Bin, series and nearby; the whole unit suite now passes under the harness.
- **Picking.** One `drawPickPass` owns hiding, material swaps, the draw and restoration for both
  the per-frame pick and `pickAt` (R6/R13).

The core contracts get early priority: **R16 data views, R17 frame composition and R6 typed
mark preparation**, tracked as TODO 122.14–122.16. Existing substage numbers remain stable;
their numerical order does not put these additions after the peripheral packages. The five
bounded pilots below are useful starting slices, but do not complete these core packages.

The October 11 module audit adds **R18 / TODO 122.17** as an in-progress package, not completed
implementation. It addresses the difficulty of discovering what small files do and following
their relationships. It covers the six maintainer examples, adjacent ownership and scheduling
helpers, demonstrated dependency cycles, and related modules outside `plot/utils`. It extends
R12's naming work without reopening the accepted mark-organization decision.

## Current foundations and scope

Stage 121 is complete and its final performance comparison is accepted. The working checkout
is back on main at the baseline above; source links and counts refer to that revision. The
resolved Sunburst investigation no longer blocks R4 or R6. Every new change to a per-frame
path still requires the interleaved comparison specified below.

| Area | Completed foundation | Remaining scope here |
|---|---|---|
| Column ownership, 116.1–116.2 | `get()` borrows; [acquireColumn](../src/lib/plot/utils/columnReads.js) retains with explicit release | Apply the existing contract to new helpers; no prerequisite ownership migration |
| Expression planning, 116.3 | `normalizeRoots`, `lowerRoots`, `bindColumns`, `programPlan` already exist in [expressionPlans.js](../src/lib/plot/utils/expressionPlans.js) | Clarify residual evaluator logic with the per-slice performance gate; do not repeat the planner split |
| Transform dependencies, 116.4 | One declaration-based [analyzer](../src/lib/plot/utils/transforms/dependencies.js) | Reuse it; treat its repeated calls as performance-sensitive |
| Mark services and controllers, 117–118.3 | Accepted bindings, typed services, endpoint/feedback/tooltip/domain controllers | Remaining preparation/publication and live-write orchestration in R6 |
| Mark organization, 118.6 | [Completed pilot](MARK-ORGANIZATION.md): no moves; keep the layer-first layout | Accept that result; any all-mark rename is a separately gated future stage |
| Frames, 119 | One frame model and ordinary root Frame; legacy Axis route removed | R17 types the operation chain and promotion/publication barrier; preserve automatic Frame promotion |
| Strict checking | 35 modules by the existing ratchet: 32 tsconfig roots plus 3 `@ts-check` modules | Preserve that floor and expand on touched contracts |

`namedMark.svelte` is 1,470 lines at this baseline. Its remaining preparation effect is about
560 lines, followed by live/procedural write responsibilities. `plot/utils` has **244 direct
files plus 2 subdirectories: 246 entries**, not 246 files. Counts are baselines with explicit
definitions, not reasons to move code merely to lower them.

The completed export-closure, status, cache, metadata, services and frame work remain the
owners to build on. The combined plan's Outcome records that **local gates replace CI for
this refactor from Stage 116**, by maintainer decision. Restoring CI is not a prerequisite
here; retain the actual unit/type/API/Python/rendering and performance checks locally.
The [P0 baseline](REFACTOR-P0-BASELINE-2026-10-09.md) is historical evidence, not a substitute
for matched before/after captures of a new hot-path slice.

## What readable code means here

### Source layout and names

Use the existing formatter and width. Format the affected area in a separate mechanical
commit, extend the existing allowlist, and record formatting commits in the established blame
ignore file. Respect generated/vendor/data exclusions and the maintainer's introduction and
tutorial. Do not reformat the whole repository as a prerequisite for useful changes.

Expand statements when several operations or effects are compressed together. In particular:

- Put disposal, publication, mutation, and cancellation in visible statements rather than
  comma expressions or nested conditional expressions.
- Name values by role and units: source rows, visible rows, milliseconds, device offsets,
  pixel widths, accepted generation. Short names remain appropriate for local vector math.
- Use named records for multi-part results and configuration-dependent argument lists.
  Keep positional vectors and matrices where their order is the actual mathematical contract.
- Name repeated predicates and non-obvious constants. Avoid helpers that merely rename a
  trivial expression while forcing readers to jump between files.
- Keep an explanation of a workaround's required behavior near the relevant operation.
  Replace unexplained historical TODO references with the invariant they represent.

Embedded WGSL, HTML, JavaScript, and CSS need their own readable source layout. Formatting a
JavaScript template literal's surrounding file does not format the program inside it.

### Function and module boundaries

Split by a coherent outcome: normalize inputs, prepare a plan, bind resources, execute,
publish, release. A helper should have a clear input/output contract and a natural owner.
Moving a long closure into another file with the same ambient mutable dependencies does not
complete the task. Neither does creating a chain of tiny forwarding functions.

Keep shared infrastructure shared. Public mark wrappers, binding policy, Svelte rendering,
and GPU objects have different jobs. The completed
[Points/Rect pilot](MARK-ORGANIZATION.md) supports keeping those layers; no new per-mark
colocation pilot is needed. Do not duplicate shared implementations to impose one folder
per public mark.

### Types and ownership

Expand the existing strict checking scope with each contract migration. Use TypeScript or
checked JSDoc as appropriate, and check producers and consumers, including Svelte boundaries.
Replace `any` handles where the contract is known. Use discriminated records for states with
different valid payloads; use explicit narrowing at external boundaries.

A new helper must say whether it borrows, consumes, retains, or returns owned data. Show
release paths for success, error, cancellation, and supersession. Keep the current ownership
semantics during a mechanical extraction, using the completed borrow/acquire contract. Do not
introduce whole-column copies just to simplify an interface.

### Strict checking of the core implementations

At `976a111f`, the following nine implementations are neither roots of
[tsconfig.internal.json](../tsconfig.internal.json) nor marked `@ts-check`. Existing checked
consumers and inferred `ReturnType` aliases do not establish checking of their implementations.
Cover each through strict checked JSDoc or TypeScript, including its actual producers and
consumers; placing a filename in the ratchet without enabling checking is insufficient.

| Implementation | Contract to make explicit | Owning package |
|---|---|---|
| `dataView.js` | Logical/physical rows, projections, mapping/provenance, snapshots and cache leases | R16 |
| `expressions.js` | Operands, result cardinality/representation, metadata and ownership | R4 |
| `expressionPlans.js` | Normalized/lowered/bound plan records, fallback and evaluator leases | R4 |
| `interaction.js` | Resource owners, constraints and preview/committed state | R6 |
| `proputils.js` | Scalar/uniform/device-scalar/row-buffer states and retained writes | R5, coordinated with fallback |
| `namedData.js` | Preparation inputs, channel results and prepared resource ownership | R3/R6 |
| `coordinateOperations.js` | Live operation definitions versus resolved numeric records | R17 |
| `curvedPaths.js` | Geometry requests, refinement results and resource lifetime | R5/R17 |
| `slice.js` | Padded/compact result assembly, endpoints and topology meaning | R3/R16 |

Target **9/9 named implementations checked** from the 35-module baseline, raising the overall
floor to **at least 44**, plus newly checked supporting modules. **Met on October 11:** 9/9, with
the floor recorded in the ratchet. The
named coverage target prevents meeting the total by checking unrelated small files. Count
owned replacements if a module is split, and prove that no unchecked implementation was left
behind. R17 also checks the root-selection/promotion boundary beyond the already checked
`frameModel.ts`; the clock and scene packages identify their own producer/consumer coverage.

Start with interface discovery and checking, then change structure when the contracts make
the boundary clear. Reuse existing `PreparationJob`, `MarkDataRequest`, `PreparedMark`, frame and planner
types; strengthen inferred or `unknown` payloads where their structure is known. Avoid blanket
`any`, `@ts-nocheck` or casts that erase the distinction being clarified. External unknown
values still require validation/narrowing. Type checking can expose real inconsistencies:
record them and fix behavior in separate, tested logic commits rather than silently changing
semantics in an annotation patch. Types complement ownership and runtime tests; they cannot
prove an array stays alive across an await.

## Readability and existing metrics

The existing [refactor ratchet](../tests/unit/refactor-ratchet.test.js) includes a physical
line ceiling for `namedMark.svelte` (1,470 at the reconciled baseline). The combined plan also
has older line targets. Those numbers cannot be treated as a demand to keep dense code: formatting,
types, and explicit control flow may legitimately increase them.

For an affected implementation slice:

1. Record the before/after formatting baseline separately from structural changes.
2. Explain any justified readability growth and update or replace the physical-line proxy
   in the same reviewed change. Do not silently raise it merely to pass a test.
3. Keep semantic retirement gates: ownership conventions, competing state writers, duplicate
   protocol implementations, temporary adapters, and unchecked contract boundaries.
4. Follow moved code when measuring it. The existing kind-check metric already includes
   `markUpdatePlan.js`; moving predicates out of `namedMark` must not hide them from the gate.

Do not add arbitrary maximum-function-length rules or formatting-sensitive source tests.
For each package, name a concrete complexity reduction: one result builder, one constructor
initializer, one binding path, one lifecycle owner, or one authoritative semantic description.
Supplement that evidence with a review walkthrough of normal execution and failure cleanup.

### Numerical acceptance targets

Use counters whose definition survives formatting and file moves. Record them alongside
behavioral results, updating the existing ratchet where appropriate; these targets are not
instructions to add source tests for every helper.

| Slice | Baseline and counting rule | Target |
|---|---|---|
| R1 publicTypes formatting | Generated content changes against the current pre-format baseline | 0 across all generated artifacts, including the API report |
| R2 consuming scan helpers | 2 implementations each of `runningMax`/`suffixMin` in windows/slice | 1 each; keep reduce.js's borrowing variant distinct unless ownership is separately reconciled |
| R3 Density arguments | 1 hand-maintained positional encoder/decoder protocol with an arity formula | 0 ad-hoc protocols; one named input contract, with any JIT positional adapter derived from it |
| R3 Slice results | 2 independent common non-grid result assemblers | 1; padded/compact row mapping remains explicit |
| R5 shared WGSL | 2 source definitions each of identical valid/random/reservoir/seam/boundary helpers in path sampling | 1 each, with the distinct discovery kernels retained |
| R13 numeric search dependency | 3 non-Force consumers import `lowerBound` from forceKernel: breaks, calendar, casts | 0 imports from the feature module; one shared primitive |
| R13 scan recording | 1 temporary `this.dispatch` override window in pathMetadata | 0; explicit pass records preserve allocation/replay behavior |
| Strict checking | 35 distinct modules by tsconfig roots union `@ts-check` files | At least 35, plus each newly migrated contract; do not lower coverage by moving files. **Met** (see the ratchet) |
| Core implementation checking | 0 of the nine named implementations above in the strict scope | 9/9 checked, with their contract consumers; total at least 44 plus supporting additions. **Met** |
| R6 preparation boundaries | Lifecycle request and partial prepared/planner types exist; effect inputs/results remain implicit | Explicit checked data request, update-action and prepared-result boundaries, 3/3, at producers and consumers. **Met** |
| R16 row spaces | Semantics spread through dataView, runner, mappings and consumers | One maintained protocol table; logical, physical, aggregate and source indices named at every touched boundary |
| R17 operation records | One existing operation builder, with untyped live/resolved shapes | Both shapes and all existing operation variants checked; one authoritative topology builder retained |
| R18 internal evaluator facade | Completed: two unit-test consumers and the current ablation fingerprint use `expressionPlans.js`; the compatibility file is removed | 0 facade files; historical artifacts and profile recognition preserved |
| R18 dependency direction | Audit baseline: three runtime multi-module import cycles. Both helper cycles (Facet/pairs and expression/title/sort) are now removed; only composition/Polygon remains | 0 helper cycles; composition cycle explicitly deferred under its tested authoring boundary |
| R18 navigation | Completed: five task walkthroughs in NODE-EXECUTION explain entry, call path, owner and cleanup | Maintain 5/5 through later moves; no file-hop or LOC quota |

The separate [mark plan](MARK-CONSOLIDATION-PLAN-2026-10-10.md) owns `buildsItself` **5 → 0**
(four declarations plus one guard), and Violin helper Points **2 source tags / 1 mounted
helper → 0**. Keep those design targets out of readability-only commits. Other packages must
name their slice-specific responsibility and before/after count at R0 rather than invent an
arbitrary LOC ceiling.

## Sequence and first implementation slices

These are independently reviewable work packages, not one repository-wide rewrite. Confirmed
correctness fixes retain priority. Work on the same module should follow its active P-stage
owner; independent Python/tooling work can proceed without waiting for all rendering changes.

| Wave | Packages | Intended outcome |
|---|---|---|
| 0 | R0 | Reconcile current work, baseline readability, and identify affected gates |
| 1 | R16, R17, R6 preparation records; contract annotations in R4/R5; selected R1/R2 | The hardest interfaces become explicit and checked early |
| 2 | R3 pilots, selected R5 work, R9 scene/protocol and R3 time-state contracts | Explicit data/kernel, revision and time contracts; shared result assembly |
| 3 | R4, R5, R6 | Expression, buffer, publication, and interaction lifetimes become inspectable |
| 4 | R7, R8, R9 | Geometry, UI, and Python responsibilities have clear owners |
| 5 | R10 | Tooling becomes ordinary maintainable source |

R12's naming pilots accompany the relevant wave after responsibilities are clear. R13 adds
further targets discovered during the naming audit; it does not require an additional global
migration before the earlier pilots can land.

R18's task map and small proven cleanups accompany waves 0–1. Its preparation and settlement
changes share R6's owner; its view/layout boundaries use R16/R17 rather than delaying those
contracts for a bulk directory move. Fold mechanical renames into each domain's quiet window.

Give these core packages priority over expanding vector-tile, guide, tooling and rename
backlogs. Independent work may proceed when it does not compete for the same owner or files.
R16 clarifies existing row mappings; Stage 123's composed-mapping proposal remains deferred.

Design trials have their own plans and sequencing. They are not prerequisites for the
first readability slices. No public-wrapper move or behavior change is bundled with them.

Start with these concrete slices after R0, splitting mechanical formatting from logic:

1. **Density kernel arguments:** replace the manually paired argument encoder/decoder with a
   named input contract, retaining the same compiled operations and output.
2. **Slice result construction:** introduce one result builder, preserving the distinct
   padded and compact row mappings. Give this extraction and the proposed Slice caching
   follow-up one owner: builder first, caching in a separate logic commit. Both take the
   interleaved Sunburst/Lorenz gate plus the moving-particles case below.
3. **Shader sampling helpers:** share identical WGSL algorithms and make their source
   readable without merging flat and spherical discovery paths.
4. **Template node initialization:** share the detached-node initializer while retaining
   two-pass reference resolution.
5. **Named-data pilot:** extract RGB input normalization and datetime-axis binding before
   attempting to decompose the whole `prepareNamed` function.

Start core contract checking alongside Density and Slice. R6's first effect change is typed
request/result boundaries, and R17 begins with the existing composition and promotion rules.
The other three pilots follow independently when their owners are available. R2 grid-cache retirement requires its ownership proof;
material-mode retirement is in the separate mark plan compatibility audit.

## R0 Reconcile and prepare each area

For each chosen slice, record the starting commit, local changes, entry points, state writers,
resource owners, relevant tests, and active refactor stage. Search identifiers instead of
relying on old line numbers. Record a short before/after responsibility map and any public
or handle-accessible behavior that might change.

Use the existing format, strict-check, leak, and performance infrastructure. Do not recreate
it. Select a representative success case and the meaningful failure/cancellation case before
extracting a lifecycle. Record pre-existing failures independently.

**Done when:** the slice has a bounded outcome, a known owner, an appropriate verification
path, and a clear distinction between preserving behavior and deliberately changing policy.

## R1 Make dense source readable

Prioritize [publicTypes.ts](../src/lib/plot/publicTypes.ts),
[facetCore.svelte](../src/lib/plot/facetCore.svelte),
[brushOverlay.svelte](../src/lib/plot/scenes/brushOverlay.svelte), and the source surrounding
the R3–R6 pilots. Expand interfaces and long property unions without changing accepted props.
Expand callbacks that combine many assignments into a readable sequence of named operations.

For [pathSampling.js](../src/lib/plot/utils/pathSampling.js) and
[curvedPathShader.js](../src/lib/plot/utils/curvedPathShader.js), lay out buffer declarations,
index arithmetic, branch conditions, and loops as ordinary readable WGSL. Document units,
buffer layout, and the difference between source, selected, and emitted indices.

Keep WGSL call structure stable during formatting. `curvedPathShader` documents compiler
latency caused by extra inlined operation call sites; a visually attractive extraction must
not inadvertently duplicate those calls. Shader-source edits may invalidate caches, so
distinguish cold compilation from warmed rendering measurements.

**Done when:** the relevant logic can be read in normal source layout; formatting is enforced
for the area; no algorithm or ownership change is hidden in the formatting diff.
For `publicTypes.ts`, first record that the generated baseline is current, then run
`node scripts/generate-python-signatures.mjs` and `npm run api:report` after formatting.
Require **zero content diff in every generated output** against the pre-format baseline:
both registries, scene components, Python signatures/stubs, reference type metadata and
`api/hmplot.api.md`. Passing checks alone is insufficient. Parser-induced output changes
must be fixed or handled in a separate logic change, never accepted as incidental formatting.

## R2 Remove obsolete paths and exact duplication

Recheck these candidates before removal. Earlier unused exports and duplicate texture helpers
have already been cleaned up; they are not new tasks here.

| Candidate | Bounded change | Required evidence |
|---|---|---|
| [grid.js](../src/lib/plot/utils/grid.js) | Remove the per-piece cache-reuse branch if the concatenated-cache invariant still makes it unreachable; stop retaining pieces once concatenation safely owns the required references | All cache producers accounted for; missing/categorical values and cached updates unchanged; lazy JAX lifetime and disposal verified |
| [options.js](../src/lib/options/options.js) | Audit and retire superseded visibility/traversal/store helpers with no consumers outside their own chain | Inspector and handle reachability audited; retain used `onChildren`/`onDependents` primitives |
| [windows.js](../src/lib/plot/utils/windows.js), [slice.js](../src/lib/plot/utils/slice.js) | Share genuinely identical scan helpers where still duplicated | Consume/borrow behavior matched; the different reducer variant is not merged mechanically |
| [providers.js](../src/lib/plot/utils/providers.js), scene and export helpers | Share byte/base64 primitives used in several serializers | Chunking, byte offsets, large payloads, and browser environments preserved; wire envelopes remain separate |

The estimated 41-line grid branch is a static audit observation, not a guaranteed deletion
total. Material compatibility proposals live in the separate mark design plan. No public component method is declared dead by
this plan. Removing the Python SVG validator is also not routine dead-code cleanup: it would
change immediate Python validation and belongs in a distinct policy proposal.

**Done when:** a complete duplicate path or obsolete responsibility is gone, the remaining
owner is evident, and the removal is not replaced by another compatibility layer indefinitely.

## R3 Clarify data preparation and numerical transforms

R16 owns the shared view/index/provenance contract used by these transforms; it is substantive
work beyond a Slice builder or a filename change. Check `namedData.js` and `slice.js` as their
records are made explicit, with R6 checking the preparation producer/consumer boundary.

### Named mark inputs

In [namedData.js](../src/lib/plot/utils/namedData.js), establish explicit stages for resolving
channels, normalizing values, binding axis semantics, preparing grid placement, and assembling
the result. Keep one visible owner for acquired arrays and cached outputs.

Start with shared RGB input normalization/validation for row colors, image data, and grid
fills. Consumers still decide linearization, raster color space, supported alpha, and whether
unchanged floating-point image data can retain identity. Separately unify datetime-axis
type/origin/timezone setup; array shifts and grid-extent shifts remain different operations.
Move grid placement alongside existing `gridMarks` helpers and event-row enrichment behind
a small contract. Do not make a universal color/grid/event framework.

### Slice and Interpolate

In [slice.js](../src/lib/plot/utils/slice.js), share result construction for padded and compact
outputs. The contract names the row selection, endpoint arrays, column identities, topology,
pipeline description, and release obligations. Padded rows translate through provenance;
compact rows already have compact endpoints. Keep grid-slab interpolation a separate engine.

**Coordinate with TODO 122.2, 123.2 and 123.7.** One owner handles this builder and
the subsequent caching of first-shown entity order, duplicate-key validation, and topology
identity. Land the behavior-preserving builder first, with current cache/invalidation behavior
unchanged; follow with separate order/validation caching and topology-publication diffs.
The latter follows Stage 123's grouped-reduction work and has dedicated membership tests.
Keep cache state and release rules
inside Slice's prepared state, without adding required fields to every transform node. Test
unchanged masks as time moves, changed masks, and active-time boundaries; a stable physical
entity order must not falsely certify unchanged compacted membership. Both changes require
the production gate, including moving-particles. The performance optimization is not a
condition for completing the readability extraction.

In [grid.js](../src/lib/plot/utils/grid.js), separate coordinate deduplication, grid/geometry
planning, value evaluation, and publication. Preserve cache reuse, bounded query batches,
missing-value rules, category ties, and cancellation. R2's obsolete branch can be removed
independently; this extraction is not permission to move interpolation onto the CPU.

### Density and Bin

In [density.js](../src/lib/plot/utils/density.js), replace the arity formula, indexed argument
decoder, and matching positional call with named kernel inputs and results. Distinguish static
specialization parameters from per-call data. Move Violin centers, separator rows, and output
fields into an output adapter while retaining chunking and fused execution.

In [bin.js](../src/lib/plot/utils/transforms/bin.js), introduce a normalized edge plan and
separate assignment from aggregate output paths. Share bin-code calculation. Give Histogram
normalization/presentation a named adapter. Expand weighted reducer tuples into named records
and move disposal out of conditional expressions. Preserve origins, boundary inclusion,
weights, grouping, and compiled-program reuse.

### Time state and publication

Give [clockScope.js](../src/lib/plot/utils/clockScope.js),
[tweenState.js](../src/lib/plot/utils/tweenState.js),
[simulate.js](../src/lib/plot/utils/simulate.js) and their Svelte owners an explicit contract
walkthrough before extracting orchestration: clock time and elapsed milliseconds, completed
presentation, explicit/export holds versus preparation waits, producer-owned tween slots,
keyed state remapping, and fixed numerical steps versus presentation cadence.

Type the request/current-state/next-state/publication records and the narrow owner callbacks.
Separate choosing steps due, evaluating against the previous state and publishing the new
state; every column in a simulation step reads the same prior state. Preserve current catch-up
limits, seeks/backward time, reduced motion, retargeting, held/frozen clocks and release paths.
Use existing clock/view services and producer scheduling; this package adds clarity rather
than another scheduler. Any correction to those policies is a separately reviewed logic change.

**Foundation already landed:** use the Stage 116.1–116.2 borrow/acquire contract at every
touched boundary. See the test map for exact Density/Slice parity and leak checks.

**Done when:** ordinary, padded, categorical, datetime, weighted, and missing-value cases use
explicit contracts; shared normalization exists once; output ownership and cache reuse are
unchanged. Use existing Slice/Grid/Density/Bin unit cases and affected live browser cases.

## R4 Separate expression structure from execution resources

The first slice checks `expressions.js` and `expressionPlans.js` around explicit operand,
channel-result and plan-stage records. Check the current implementations before proposing
further splitting; reuse completed normalize/lower/bind/program stages and the shared R16
scope contract. Preserve conservative fallback and ownership through typed producer/consumer
boundaries. The resolved performance investigation is not a prerequisite or hold.

| Area | Change | Invariants |
|---|---|---|
| [expressions.js](../src/lib/plot/utils/expressions.js) | Separate operand normalization, operation-family evaluation, reductions, and result materialization around one evaluation context | Central recursion/memoization; dtype, datetime-origin, category, and ownership semantics |
| [expressionPlans.js](../src/lib/plot/utils/expressionPlans.js) | Existing stages are complete. Document their ownership and inspect repeated normalization/binding in the profile before any further extraction | Keep conservative fallback, category identity, `-0`, metadata and reference transfer; no extra per-evaluation traversal/allocation |
| [inputs.js](../src/lib/plot/utils/inputs.js) | Share descriptor traversal for read detection, substitution, and folding; replace list-length/depth heuristics only after defining descriptor versus data positions | Do not recurse through arbitrary user data or make literal strings into reads; preserve unchanged object identity |
| [categorical.js](../src/lib/plot/utils/categorical.js) | Move general data-scope construction out of categorical-scale logic; separate input adapters, prepared updates, and commit | Arrow/GeoJSON/host inputs preserve exact metadata, row identities, grids, revision semantics, and disposal |
| [modelCalendars.js](../src/lib/plot/utils/modelCalendars.js), [datetime.js](../src/lib/plot/utils/datetime.js) | Share boundary stepping locally; expand GPU date arithmetic into named stages with units | Distinguish inside-range ticks from enclosing edges; keep Gregorian/timezone and climate-calendar arithmetic separate |

The input traversal limits are existing behavior, not merely formatting. First extract their
current policy and conformance cases; changing accepted nesting or list handling is a separate
slice. Likewise, keep evaluator execution-policy changes separate from renaming and extraction.

**Foundation already landed:** P4 and the maintained input/scene metadata. The final
interleaved evidence withdraws the 116.3/116.4 regression attribution, so evaluator work may
proceed without that hold. Every change reaching the paths listed below requires a new
interleaved production comparison. Do not create a second expression language or compiler.

**Done when:** a reviewer can follow one eager evaluation, one compiled evaluation, and one
rejected plan through acquisition and release. Numerical equivalence, dependency invalidation,
fallback, and leak checks pass without widening types or introducing avoidable copies.

## R5 Make GPU field states and shader contracts explicit

**Shared work with the WebGL fallback:** [change 2 of the fallback report](WEBGL-FALLBACK-REPORT-2026-10-10.md#2-complete-the-existing-host-upload-path-and-make-field-reads-correct)
touches the same `proputils.js`, `objects/base.js`, and `array/arraytexture.js` storage/upload
boundary. Give this seam one owner and one implementation sequence: clarify states and
ownership in behavior-preserving commits, then add fallback behavior in separate logic
commits. Pause independent R5 restructuring there while the fallback work proceeds; do not
rewrite the field layer twice. Independent shader formatting/common-helper cleanup can
continue. Use the existing column read contract and view services, and apply this plan's
production performance gate to shared per-frame changes. Adding fallback behavior remains
scoped and validated by the fallback report, rather than becoming a readability acceptance
requirement.

In [proputils.js](../src/lib/plot/utils/proputils.js), describe scalar-channel, literal-uniform,
device-scalar, and row-buffer representations explicitly. Name their transitions rather than
letting overlapping booleans encode allowed states. Share `bindBuffer`/`rebind` node wrapping,
but preserve their different notification and retired-buffer release rules. Replace repeated
positional write argument lists with a clear request record.

In [objects/base.js](../src/lib/plot/objects/base.js), replace overloaded internal `option()`
argument meanings with explicit value, uniform, or callback bindings. Share the small
read/convert/subscribe/invalidate mechanism behind semantically named helpers. Keep buffer
budget planning separate from applying rebindings and owning diagnostics.

Share the identical WGSL sampling helpers in `pathSampling.js`, leaving flat prefix/path
metadata and spherical seam discovery distinct. In
[curvedPaths.js](../src/lib/plot/utils/curvedPaths.js), separate request/publication policy from
GPU refinement execution. Evaluate reuse of immutable pipelines per device using the existing
`dashDistances` pattern; retain source snapshots across asynchronous count/fill operations.

**Foundation already landed:** P4 ownership and P5/P6 services/bindings. Pure helper
extractions must not change those contracts or expand per-frame work.

**Done when:** each representation has visible transition/release behavior; there is one
buffer-node wrapping path and one copy of common sampling algorithms. Verify scalar/buffer
switches, resize during feedback, tile bindings, sampled lines, refinement, cold compile
behavior where affected, and warmed frame progress.

## R6 Clarify mark publication, interaction, and domains

Stage 118.3 already extracted [markTooltip](../src/lib/plot/utils/markTooltip.js),
[endpointController](../src/lib/plot/utils/endpointController.js),
[feedbackOpacity](../src/lib/plot/utils/feedbackOpacity.js) and
[markDomainPublisher](../src/lib/plot/utils/markDomainPublisher.js). Keep those owners and
accepted bindings. Do not re-extract them or create another mark update planner.

### First effect slice: typed requests, actions and prepared results

TODO 122.16 makes these three boundaries explicit before the remaining effect decomposition:

Completed October 11: `npm run check:preparation` checks the actual `namedMark.svelte` body
under `tsconfig.preparation.json`; request/planner/result producers and consumers share the
checked records. The broader owner/phase map, picking and lifecycle restructuring below remain
open in TODO 122.7.

| Boundary | Fields and responsibility to check |
|---|---|
| Data/preparation request | Scope and row space, data generation versus request revision, channel mappings/dependencies, animation/mode, and applicable frame/layout/connection inputs |
| Update action | Existing `reuse-static`, `write-live`, `swap-mask` and `prepare` results, with only the payload each action needs; check planner output and effect handling |
| Prepared result | Existing `PreparedMark`, including owned channel results, scale work, retained scope/membership, staged publication and release obligations; check `prepareNamed` and accepted-binding consumers |

Distinguish the lifecycle job (`internalTypes.PreparationJob`: order/cause/policy/signal)
from the data request (`markPlanTypes.MarkDataRequest`). Their naming collision is resolved in
the first implementation slice; keep their identities and acceptance policies separate while
checking producers and consumers. Strengthen the existing `PreparedMark`/`ChannelResult` types instead of relying
on unchecked inferred return shapes or creating competing contracts.

Check the actual Svelte preparation callsites as well as JavaScript helpers. Record which
strict Svelte configuration checks this boundary: the default `tsconfig.json` has `strict:
false`, so its existing check alone does not prove strict effect coverage. Add a focused
checking gate if needed, rather than making repository-wide strict conversion a prerequisite.
Preserve tracked
versus `untrack` reads, early returns, mutable request assembly timing and existing publication
precedence. A type module does not count as completion while the effect passes unchecked
payloads into it. Reuse existing records; avoid new per-frame clones or universal context bags.
Target all three boundaries checked at producer and consumer. Then extract the first cohesive
stage with explicit inputs and success/error/cancel cleanup, rather than moving the whole
effect. Use a before/after walkthrough of static reuse, a mask swap, a live write and a failed
or superseded full preparation to establish that the staging is understandable.

In [namedMark.svelte](../src/lib/plot/bound/namedMark.svelte), the remaining scope is the
preparation effect and live/procedural writers: make request assembly, planner-action handling,
keyed staging, accepted publication and retirement readable within their existing reactive
lifetime. Extract only a demonstrably cohesive operation with explicit inputs and ownership.
Moving the entire effect and its ambient mutable state into an opaque controller is not
completion. Any control-flow/helper change here takes the hot-path gate below; choose the
bounded target from the remaining responsibilities and current profiles rather than promising
a line-count cut. The former 116.3/116.4 investigation is resolved and does not block R6.

In [interactive.svelte](../src/lib/plot/scenes/interactive.svelte), provide one scoped picking
operation for hiding/filtering objects, swapping materials, drawing, and restoring state.
Give material-cache lifetime and readback generations clear owners. Preserve depth-only
objects, stale-result rejection, exact/tolerant picking, and distinct beauty/export policies.

In [interaction.js](../src/lib/plot/utils/interaction.js), the actual resource implementation
and its owner/constraint/membership/cache records now pass strict checking, including brush,
feedback and tooltip consumers. See the checked records in `viewControllerTypes.ts` and the
[operation/ownership table](NODE-EXECUTION.md#interaction). This completes the seventh core
implementation target, not the broader state organization. Next group selection state by owner
and committed/preview phase, with one release operation. Migrate coordinated maps incrementally;
do not change public selection semantics while reducing the number of writers. Preserve the
current borrowed cache reads and acquired references rather than guessing ownership.

In [facetEngine.js](../src/lib/plot/utils/facetEngine.js), reuse `markDomains` input/geometry
contracts instead of maintaining a second mark-property inventory and bounds algorithm.
Keep shared facet bins, pooled scales, and per-cell publication policy explicit. Separate
pipeline-prefix cache ownership from domain computation as those contracts become clear.

Use the existing P5/P6 services and P7 frame model for `viewCore`, navigation, and root domains.
Preserve automatic Frame promotion. Coordinate/frame work should not create another parallel
registry merely to shorten a component; R17 owns that core composition package.

**Done when:** the normal update, superseded update, pick, and selection-preview cancellation
each have a traceable owner and release path. Bounds/picking/export refer to the same accepted
publication. The completed organization pilot is accepted; this work requires no moves.

## R7 Consolidate geometry and tile orchestration

In [vectorTileMesh.js](../src/lib/plot/utils/vectorTileMesh.js), share ring opening/flattening,
hole-offset preparation, triangle-box clipping, and segment clipping where equivalent to
`geoGeometry`/`vectorTiles`. Retain separate flat and extruded emitters, the flat fast path,
and triangulation-before-clipping so holes remain correct.

In [vectorExport/geometry.js](../src/lib/plot/utils/vectorExport/geometry.js) and
[threeDimensional.js](../src/lib/plot/utils/vectorExport/threeDimensional.js), share adaptive
subdivision mechanics: probes, error measurement, stack traversal, depth/budget handling.
Coordinate interpolation, seams, polar angular limits, horizon cuts, and depth-aware error
remain explicit caller policies. Separating SVG symbol/text helpers is useful organization,
but should not be counted as algorithm removal.

In [vectorTileLive.svelte](../src/lib/plot/vectorTileLive.svelte), give tile record transitions,
request generations, retained fallback layers, and settlement one controller owner. Separate
slot allocation/trimming and desired-tile selection. Leave Svelte presentation, ground meshes,
and label display in the component. Apply the same ownership analysis before extracting
preparation from [geojson.svelte](../src/lib/plot/geojson.svelte).

**Done when:** geometry helpers have explicit degeneracy policies; tile state has one owner;
replacement, cancellation, failed loads, fallback layers, export snapshots, and settlement
retain their behavior. These are primarily maintainability changes, not a mapping-library rewrite.

## R8 Simplify settings and guide presentation

| Area | Change | Required preservation |
|---|---|---|
| [optionsElement.svelte](../src/lib/options/optionsElement.svelte) | Move proposed-setting coordinate/axis validation into its domain modules; keep UI editing and error display local | Validate the proposed value against its effective context; reset, inherited defaults, and error quality |
| [optionsPane.svelte](../src/lib/options/optionsPane.svelte) | Separate target-tree state from placement/open/close behavior; keep positioning-library trials in their separate plan | Docked versus floating behavior, zoom/scroll tracking, one-open-pane policy, focus, and closed-pane subscription cleanup |
| [guideView.svelte](../src/lib/plot/guides/guideView.svelte) | Normalize typed series/category/ramp/colorbar/group models; share glyph rendering and own asynchronous extents | Throttling, scalar-only readbacks, missing-value swatches, scale grouping, and differing glyph styles |
| [axisOverlayContent.svelte](../src/lib/plot/scenes/axisOverlayContent.svelte) | Separate layout records from small coordinate-specific SVG renderers | Measured label positions, datetime context rows, projection-specific guides, and brush hit regions derived from what is drawn |

Do not undo the consolidated inspector descriptors or intentionally editable hidden-axis
appearance. Avoid a universal guide component with a growing set of unrelated flags.

**Done when:** UI components do not independently encode core coordinate rules, guide
variants have explicit inputs, and displayed geometry and interaction regions stay aligned.
Use drawn-output settings/guide/axis tests, including keyboard/focus and DPR-2 cases.

## R9 Clarify Python resources and export lifecycles

### Scene/protocol ownership beyond export adapters

Trace [core.py](../python/hmplot/core.py)'s `Node` edits and `Scene._snapshot`/`_publish`/
`_command`/`_receive` through [runtime.svelte.js](../src/lib/scene/runtime.svelte.js)'s
validation, `applyState`, command dispatch and observer setup. Give snapshot assembly, command
correlation, event decoding and subscription retirement explicit inputs/results and owners.
Keep wire validation separate from resource materialization and mounted-handle routing.

Use the existing protocol definitions, prop cells and `SceneResources.transaction()` phases;
name prepared, active and accepted revisions and failure cleanup without a second transaction
or protocol registry. Check the browser-side records and validate Python boundary shapes with
shared conformance cases. Preserve command errors/timeouts, update ordering, stale event
rejection, rollback to the previous root, resources held by in-flight commands, widget revision
acknowledgements and disposal. Do not extract all of `core.py` into one replacement coordinator.
This protocol work gets priority over descriptor/file organization within R9.

In [templates.py](../python/hmplot/templates.py), share a detached-node initializer with
`core.py`; retain two-pass construction, forward references, and template restrictions.
Keep descriptor validation, reference decoding, and attachment separate.

In [data.py](../python/hmplot/data.py), separate shapes, themes, scales/colormaps, and animation
descriptors from table storage. Preserve public imports, generated typing, and resource
identity; avoid introducing circular imports through the extracted modules. Keep preset
properties explicit unless an alias table can preserve documentation and introspection cleanly.

Extract current theme validation unchanged. Any confirmed schema correction or delegation
belongs in a separate logic/library trial. Share maintained facts between Python and JavaScript while retaining finite-value,
geometry, inheritance, and colormap semantics in feature validators. Isolate the mirrored SVG
parser and use shared conformance fixtures; retain immediate Python validation by default.

In [netcdf.py](../python/hmplot/netcdf.py), separate xarray slice/coordinate conversion from
streaming, prefetch, latest-request selection, and shutdown. Inject execution/error callbacks
instead of reaching into private Scene fields. Name dataset ownership and in-flight close
behavior explicitly.

Coordinate [core.py](../python/hmplot/core.py) and
[exporter.py](../python/hmplot/exporter.py) MP4 request/frame planning and cleanup policy.
Keep simple sync/async adapters; cover simultaneous frame and restoration failures without
masking the original error. Browser command routing can similarly share target selection and
format adapters while preserving differing result shapes. Reuse current export-closure work.

**Done when:** initialization and export policies each have one owner, resource modules
preserve import/API compatibility, and notebook/headless success and failure paths are
consistent. Use existing Python template, core, theme, provider, and animation tests.

## R10 Replace tooling heuristics with explicit data and readable source

| Area | Change | Acceptance |
|---|---|---|
| [introspection.py](../python/hmplot/introspection.py) | Consume structured string-read and column-preservation metadata instead of parsing annotation text/display groups | Type annotation formatting cannot change dependency analysis; unknown browser-derived columns remain explicitly uncertain |
| [generate-python-signatures.mjs](../scripts/generate-python-signatures.mjs) | Normalize types once, establish an intermediate API model, and separate output renderers; record named-type dependencies directly | Existing accepted properties and public signatures remain equivalent unless separately changed; generated diffs inspected |
| [htmlPage.js](../src/lib/scene/htmlPage.js) | Maintain bootstrap JavaScript and CSS as readable sources built into inline assets | Escaping, loading/readiness, reduced motion, re-export markers, and browser-free Python HTML assembly remain supported |
| [docs/Example.svelte](../src/lib/docs/Example.svelte) | Normalize source modes and separate preview mounting from Python worker/editor execution | Lazy imports, cancellation, diagnostics, perf hooks, and still-used gallery modes preserved |
| [build-thumbnails.mjs](../scripts/build-thumbnails.mjs), [build_examples.py](../scripts/build_examples.py) | Share browser image encoding; export gallery paths as data instead of regex-parsing loader source | Crop/size/encoding, cache fingerprints, and artifact publication preserved |
| [providers.js](../src/lib/plot/utils/providers.js) | Separate format adapters, request sharing/scheduling, and snapshot encoding | Latest-wins settlement, conditional refresh, source keys, cancellation, and offline round trips preserved |

Generator/introspection work belongs with P2's semantic model; it should not create a parallel
registry. Keep the larger P8 docs coordinator deferred as the combined plan specifies. Small
readability changes can proceed independently if they do not reopen scheduling architecture.

## R12 Clarify naming and file structure

The reconciled baseline has 244 files and 2 directories directly under `src/lib/plot/utils`. The problem is not
just directory size: unrelated domains share generic names, while some closely related
operations are difficult to discover together. The table below is a backlog of naming candidates, not a 30-file migration batch.
Use actual dependencies to choose a domain; no moves are selected until a quiet window.

### Vocabulary and dependency direction

- Use public component names for public component implementations: Points, Rect, Text,
  Text3D. Name private mark components by their role, such as `pointsInstance.svelte`.
  An instance may be invisible (Anchor), so `Renderer` is not a universal role name.
- Use Frame for coordinate ownership and axis for one dimension's scale, ticks, or guide.
  Do not mechanically rename every `axis` identifier: many refer to real axis behavior.
- Distinguish four roles: public wrapper, shared binding, mark instance component, and
  runtime object. The current `bound`, `marks`, and `objects` directories encode useful
  layers but explain them poorly; `bound/namedMark.svelte` is shared binding, not a wrapper.
- Distinguish data scope, derived data view, serialized table, and encoded column. Python's
  public `hm.Column` layout component must not be confused with its internal column payload.
- Use names that state a policy when policies differ: latest-load cancellation, coalesced
  preparation, priority request slots, accepted publication. Do not merge all of them into
  an ambiguously named scheduler.
- Prefer domain names over `utils`, `common`, `base`, `core`, or reversed-word filenames
  where a specific responsibility is already known. Keep a small helper in its domain;
  being short does not make it globally shared.

Public wrappers should depend on binding/rendering contracts; shared numerical and data
primitives should not import a particular layout or mark. Export document models should not
import live scene/rendering orchestration. Protocol adapters should feed runtime contracts
without becoming another owner of mounted component state. These are dependency constraints,
not a demand to route everything through new barrel files.

### Concrete naming candidates

The destinations below are proposed internal paths, not new public APIs. Preserve extensions
unless a separate type migration requires changing them. Marked extractions happen before
the corresponding move so that the new name describes the actual content.

| Current file or responsibility | Proposed name or location | Prerequisite and reason |
|---|---|---|
| `plot/utils/documentExport.js` | `plot/export/plotDocument.js` | Naming pilot: assembles/exports a plot document |
| `plot/utils/exportDocument.js` | `plot/export/documentModel.js`, with serialization helpers separate if useful | Naming pilot: defines the logical document and serializes it; reversed-word filenames currently hide this distinction |
| `guideExport.js`, `guideDocumentExport.js`, `sceneDocumentExport.js` | `export/rasterGuides.js`, `export/vectorGuides.js`, `export/sceneDocument.js` | Preserve PNG composition, vector guide handling, and scene routing as distinct policies |
| `plot/utils/grid.js` | `plot/data/grid/interpolateGrid.js` | Direct name improvement; this is an interpolation engine, not the grid data model |
| `gridModel.js`, `gridTable.js`, `gridCalculate.js` | `data/grid/gridModel.js`, `gridTable.js`, `rewriteGridCoordinates.js` | Keep model/encoding/coordinate rewriting discoverable together; `gridMarks` belongs with mark preparation |
| General scope inside `categorical.js` | `plot/data/dataScope.js` | Extract first; discrete scale constructors move separately to the scales domain |
| `dataView.js` | `plot/data/derivedDataView.js`, with snapshots/row mappings/readbacks split where justified | Extract first; the name should distinguish a projection from its producer |
| `data.js` conversions, field updates, coordinate mapping, line arrays | `data/deviceColumns.js`, `rendering/updateMarkFields.js`, `coordinates/mapDevicePositions.js`, `paths/lineArrays.js` | Extract first; avoid generic conversion importing mark animation and projection policy |
| `names.js` | `plot/expressions/references.js` | Describes column/input/state/literal references, not generic naming |
| `mapping.js` | `plot/binding/channelMappings.js` | Clarifies authored channel mapping versus geometric coordinate mapping; use R18's binding domain |
| `programs.js` | `plot/numeric/kernelPrograms.js` | Describes cached JAX programs specialized by a plan |
| `describe.js` | `plot/accessibility/plotDescription.js` | Names its accessibility-facing output |
| `proputils.js` | `plot/rendering/fields/BufferManager.js`, `BufferedField.js`, `TextureField.js` plus shared binding helpers | R5 extraction first; these are field/storage owners, not prop utilities |
| `objects/types.js` | `plot/rendering/fields/fieldTypes.js` internally | These are runtime field descriptors, not merely TS declarations; preserve the published `hmplot/types` entry point |
| `plot/utils/context.js` | `settings/optionContext.js` | Names the specific options context |
| `axisFrame.js` contexts and grouped-axis parsing | `frames/frameContext.js` and `frames/axisSettings.js` | Split only remaining mixed responsibilities; Stage 119 frame unification is complete |
| `options/options.js`, `options/optionsElement.svelte`, `options/optionsPane.svelte` | `settings/optionTree.js`, `SettingRow.svelte`, `SettingsPane.svelte` | Distinguish hierarchical state from editing UI; preserve public exports and store semantics |
| `scene/options.js` | `scene/componentMetadata.js` | Public component/prop metadata; distinct from settings state |
| `scene/settings.js` | `scene/settingsPatch.js` | Converts internal settings to public prop patches; it is not the settings store |
| `scene/stableProps.js` / `stable()` | `scene/props/reuseUnchangedProps.js` / `reuseUnchangedProps()` | Names bounded identity reuse without implying general deep equality |
| `scene/propCells.svelte.js` / `propCells()` | `scene/props/reactiveProps.svelte.js` / `createReactiveProps()` | Names per-property invalidation, separately from identity stabilization |
| `scene/resources.js` decoding versus resource ownership | `scene/protocol/columnCodec.js` and `scene/resources/SceneResources.js` | Extract first; protocol representations and transactional allocation/pooling have different responsibilities |
| `scenes/interactive.svelte` | `rendering/RenderPipeline.svelte` after extraction | R6 first; currently owns beauty/picking passes and postprocessing as well as interaction |
| `scenes/scene2d.svelte`, `scene3d.svelte`, `overview.svelte` | `navigation/Viewport2D.svelte`, `Camera3D.svelte`, `MinimapRenderer.svelte` | Clarifies camera/navigation and minimap responsibilities; these are not serialized scene nodes |
| `scenes/axes3d.svelte`, `Axes3DOverlay.svelte` | `guides/Axes3DLayout.svelte`, `Axes3DSvg.svelte` | Distinguishes projected layout records from their SVG rendering |
| `threeExtensions/tsl/tsl.js` | `gpu/sampling/interpolationNodes.js` | Names the actual bilinear/bicubic interpolation operations |
| `threeExtensions/storageBindings.js` | `gpu/threeCompat/storageBindings.js` | Makes upstream compatibility code discoverable; keep version rationale and evidence required for retirement |
| `providers.js` latest-request scheduler | `loading/latestLoad.js` | Extract from loaders/codecs; its defining policy is cancel-and-follow superseded requests |
| `requestScheduler.js` | `tiles/tileRequestQueue.js` | Names priority/concurrency/speculation policy; do not merge with latest-load handling |
| `latestPreparation.js` | `rendering/coalescedPreparationQueue.js` | Names the policy of finishing useful active work while replacing queued work |
| Python wire `data.Column` | Internal `EncodedColumn` or `ColumnPayload` in a codec/resource module | Separate from public layout `hm.Column`; audit import compatibility and serialization before renaming |
| `docs/exampleLoading.js` queue | `docs/examples/liveStartQueue.js` / `createLiveStartQueue()` | Names the special rule that abort releases a scheduling slot before underlying work necessarily finishes |

For scene column decoding, name internal result roles such as `gpuValues`, `hostValues`, and
`exactIntegerValues` instead of relying on a context-dependent `source` property. This is an
internal contract change; preserve wire descriptors and avoid narrowing host grid coordinates
to float32. For Python module splits, preserve published imports and CLI adapters such as
`hmplot.chrome:main` unless a documented package change intentionally replaces them.
`SceneRuntime` and `SceneResources` are public through `hmplot/scene`; keep those exports
stable through the entry module. Generated component-loader filenames can become more explicit
only by changing the generator and all consumers, not by renaming its output manually.

### Accepted mark organization result

Accept [MARK-ORGANIZATION.md](MARK-ORGANIZATION.md), Stage 118.6: **keep the layer-first
layout and make no per-mark colocation moves**. Public wrapper paths appear in generated
registries; the pilot's no-generated-diff constraint pinned them. Points has only one
movable Points-only rendering component. A Rect directory would spread its implementation
across four directories, while the shared Prism family should remain shared.

A future naming stage may consistently rename all public mark files/layers only after the
maintainer accepts a regenerated registry diff. That decision remains deferred; permission
for useful breaking changes does not select this particular rename. The public names need
not change, but internal module-path changes still require generator/package validation.
Do not rename only Points/Rect and leave inconsistent conventions for the other marks.

Use the report's [expanded current-source map](MARK-ORGANIZATION.md#current-mark-navigation-map-october-11-2026)
now: it covers all 19 wrappers, all 22 mark components, shared implementations and the
specialized geographic paths. Stage 119 already removed the legacy
Axis path; the remaining `axis.svelte` serves current axis functionality and is not another
legacy implementation waiting for a rename.

### Distinguish identical filenames by role

**Codex-generated audit, October 11, 2026:** among `.js`, `.ts`, `.mjs` and `.svelte` files
under `src/lib`, 30 repeated basenames account for 65 files. This is an inventory, not a
target to eliminate every duplicate. Keep conventional `index.ts` entry points. Use explicit
role names when searching a filename or reading an editor tab cannot distinguish different
contracts; a directory name alone is insufficient for the confusing pairs below.

For the optional coordinated mark rename, recommend the repository's existing lower-camel
filename style with these layer names and suffixes:

| Role | Proposed convention | Example and ownership |
|---|---|---|
| Public component | `plot/public/<publicName>.svelte` | `anchor.svelte`, `points.svelte`, `text3D.svelte`: authored props, public handle, implementation selection |
| Shared binding | `plot/binding/namedMark.svelte` and cohesive preparation/controller modules | Resolve expressions/scales, choose updates, publish the accepted binding; do not create one binding file per mark |
| Mark instance component | `plot/markComponents/<role>Instance.svelte` | `anchorInstance.svelte`, `pointsInstance.svelte`, `prismInstance.svelte`: options, prepared-field writes, instance lifetime; preserve thin variant adapters |
| Runtime object/family | `plot/objects/<role>Object.js` or `<family>Objects.js` | `anchorObject.js`, `prismObject.js`, `scatterObjects.js`: buffers, geometry/materials where present, picking/export capabilities |

Use family names for shared implementations, rather than forcing one object file per public
mark. `scatterObjects.js` would continue to contain both Scatter and ScatterSprite, serving
Points and geographic points; Rect continues to use Prism. Text3D constructs a plain Three
mesh in its component and needs no invented `text3DObject.js`. Shared helpers such as field
types, outline nodes and defaults get responsibility names, not an `Object` suffix. These
are filename proposals: do not rename public components, object classes, `kind`/`exportKind`
strings, settings labels or resource records as a side effect.

The complete [current-to-proposed component map](MARK-ORGANIZATION.md#proposed-mark-filenames)
also resolves misleading mismatches: `bound/label.svelte` is Text, `bound/text.svelte` is
Text3D and `bound/arrows.svelte` is Arrows3D. Arrows now lives in `compound/arrows.svelte`,
a chart template over Segments with an arrow cap.
Flow's public preprocessing component, private bound adapter and prepared instance have
three distinct names. Triangles remains private to the compound composition surface.

Outside the mark wrappers, apply these candidates through their existing owning packages:

| Repeated basename | Actual distinction | Proposed names / owner |
|---|---|---|
| `ecdf.svelte` | ECDF table transform versus Ecdf compound plot | `ecdfTransform.svelte` / `ecdf.svelte`; preserve both public spellings and the composition boundary. R12 |
| `geometry.js` (three files) | Mixed host readback/curve/mesh helpers; host geometry transforms; vector-export projection and path generation | Extract the mixed helper by responsibility under R7/R18; `geometryTransforms.js` for the transform family; split export projection/path helpers under R7. Do not disguise mixed files with a single new generic name |
| `hexbin.js` | Hex-grid numerical primitives versus transform orchestration | `hexGrid.js` / `hexbinTransform.js`. R3/R12; preserve the current reducer/runner boundary |
| `labels.js` | Text runtime object versus font/TeX mesh geometry | `textObject.js` / `textGeometry.js`. R7/R12; keep Text's atlas path distinct from Text3D's geometry |
| `lifecycle.js` | View settlement/render disposal versus GPU attribute release | R18's `viewSettlement.js` + `rendererLifetime.js` extraction / `attributeRelease.js`. R6/R18; one settlement registry remains |
| `normalize.js` | Texture value normalization versus a table transform | `normalizeTexture.js` / `normalizeTransform.js`. R5/R3; distinct shapes, masks and ownership rules |
| `options.js` | Hierarchical settings state versus component metadata | Existing `optionTree.js` / `componentMetadata.js` candidates above. R8/R12 |
| `outlines.js` | GPU outline channels/coverage versus vector document strokes | `outlineNodes.js` / `outlineElements.js`. R5/R7; preserve shader/export agreement |
| `surface.js` | Surface runtime object versus attaching a mark to a surface | `surfaceObject.js` / `attachSurface.js`, or absorb the sole-consumer attachment under R18 after verifying cleanup. R5/R18 |
| `uncertainty.js` | Shared runtime object versus band-channel normalization and array preparation | `uncertaintyObject.js`; extract/name `bandMarkValues.js` and `uncertaintyArrays.js` only when the responsibilities separate. R3/R12 |

First deliver navigation without moves: the linked current-source map explains entry,
preparation and resource ownership today. Then perform extractions under their existing
owners. Finally, integrate any selected mechanical rename in the quiet window below. This
does not add another architecture stage, another mark registry or permanent forwarding files.

**Naming acceptance:** every one of the 19 wrappers and 22 mark components has an explicit
role and traceable destination in the map; all 30 duplicate-basename groups have a stated
disposition (19 mark-related groups, the ten other groups above, and conventional entry
points). If the mark rename is selected, zero wrapper/instance pairs retain identical
basenames, zero Text/Points/Arrows wrappers use a different public concept's name, and zero
new required object files are fabricated for shared families or plain meshes. These are
structural checks during migration, not new arrangement-only unit tests.

### Migration procedure

1. Schedule a quiet integration window with no overlapping edits in the chosen domain.
   Pilot the export filename pair or the dependency-neutral numeric extraction in R13.
   Commit one domain at a time; treat a future all-mark naming convention as one coordinated
   mark-domain stage, not several conflicting per-mark pilots.
2. Extract mixed responsibilities with behavior unchanged. Then move/rename the cohesive
   modules in a separate mechanical change and update direct consumers together.
3. Update package entry points, generator input paths, JSDoc/type imports, the strict-check
   file list, format allowlist, tests importing internals, and documentation references. Give
   `package.json`, strict-check lists and generated-path updates one integration owner; rebase
   and inspect their combined diff instead of letting parallel renames race.
   `generate-python-signatures.mjs` currently imports `utils/mapping.js` by an explicit path.
4. Audit every `new URL(..., import.meta.url)` worker/asset reference and the notebook/
   standalone bundle rewriting maps. Moving worker launchers without this step can pass
   ordinary source checks while breaking packaged Python output.
5. Regenerate through the maintained generators, inspect diffs, and verify package consumers
   and relevant browser/Python bundles. Preserve the explicit `hmplot/types` export.
   For mechanical mark moves, public exports/props/signatures/API reports and metadata must
   be unchanged; generated module paths may change only to the reviewed destinations. Update
   `gpu-counters.js` and its source-file enumeration so counters still observe both layers.
   Preserve compound imports through `composition.js`, including private Triangles; do not
   add a barrel solely to make the folder diagram symmetric.
6. Handle case-only moves explicitly on case-insensitive filesystems. Avoid permanent
   forwarding modules for private paths; any temporary compatibility facade has a named
   consumer and removal condition.

**Done when:** a new contributor can locate a public mark, its binding, and its shared GPU
implementation from their names; export model versus orchestration is evident; general
primitives do not depend on feature modules; package/worker/generator consumers still resolve.

## R13 Additional targets found during the naming audit

These tasks add substantive simplification to the naming work. They are candidates for the
corresponding package, not justification for a new subsystem or broad rewrite.

TODO 122.12 owns the dependency-neutral device `lowerBound` extraction. The conditional fork
`searchsorted` trial in 123.10 may later replace its implementation after dtype, ordering,
ownership and compile parity are proven; it does not block this extraction. The separate
Float64 host grid searches retain their precision and axis-specific policies.

| Target | Concrete improvement | Place and verification |
|---|---|---|
| [forceKernel.js](../src/lib/plot/utils/forceKernel.js) | Implemented the dependency-neutral `lowerBound` in `numeric/search.js`; calendar, casts, and breaks no longer import the force-layout implementation | Early dependency cleanup; preserve borrowed-input semantics, ordering/ties, and numerical results |
| [pathMetadata.js](../src/lib/plot/utils/pathMetadata.js) | Replace temporary reassignment of `this.dispatch` during scan recording with explicit planned pass records and an execution step | R5; preserve recursive scan, buffer allocation reuse, and replay behavior |
| [sampledBuffers.js](../src/lib/plot/utils/sampledBuffers.js), [timeSeriesSampling.js](../src/lib/plot/utils/timeSeriesSampling.js) | Separate eligibility/range/index planning from allocation/dispatch and temporary mark overrides; name packed parameter fields and dispatch bindings | R5; preserve connected paths, peak/endpoints, GPU execution, limits, and restoration |
| [setupInteractivity.svelte.js](../src/lib/picking/setupInteractivity.svelte.js) | Audit the uncalled local raycast helper/imports; replace `null` versus arrays carrying `.nearest` with an explicit stale/empty/hits result; separate readback and event dispatch | R6; retain exact/tolerant picking, surface drag, pointer capture, ordering, and cancellation; complete the context capability types |
| [arraytexture.js](../src/lib/threeExtensions/array/arraytexture.js) | Separate low-level GPU upload/storage from plot animation, normalization, and grid-remapping policy | R5; the directory currently suggests a generic Three extension despite plot dependencies; preserve storage lifetime and transition behavior |
| [flyoverControls.js](../src/lib/plot/scenes/flyoverControls.js) | Represent pointer, pinch, keyboard, and momentum gestures explicitly instead of overlapping dragging/looking/touch flags | R6; retain the existing camera math, world-up/globe behavior, pointer capture, reduced motion, and cancellation settlement |
| [axisRules.svelte](../src/lib/plot/scenes/axisRules.svelte) | Share explicit rule/band geometry plans between rendering and export; keep capacity/resource updates separate | R8; preserve band-before-rule ordering, coincident references, polar mapping, and pixel widths |
| [widget.py](../python/hmplot/widget.py) | Isolate notebook transport compatibility, revision acknowledgements/column lifetime, and snapshot presentation | R9; name ipykernel-version adapters and preserve their working behavior instead of deleting compatibility code by age |
| [scene/resources.js](../src/lib/scene/resources.js) | Extract column decoding into a protocol codec with explicit host/GPU/exact-integer representations before allocation | R9/R12; keep temporal origins, float64 host coordinates, pooling, and transaction ownership intact |
| [python __init__.py](../python/hmplot/__init__.py) | Extract the generated-component class factory and make specialized Calculate/Provider overrides explicit | R9; preserve top-level names, runtime signatures, `__module__`, and generated stub agreement |
| [checking.py](../python/hmplot/checking.py), [chrome.py](../python/hmplot/chrome.py) CLI | Put argument parsing and user-file execution in a named CLI module; leave rendering checks and browser control as library operations | R9; preserve the current console entry point through a shim or explicit packaging change |
| [presentation.py](../python/hmplot/presentation.py) | Separate image payload normalization/file/Pillow handling from Sky, fog, and atmosphere validation | R9; preserve MIME detection, column descriptors, image-mark callers, and optional dependencies |
| [vite.notebook.config.js](../vite.notebook.config.js), [vite.standalone.config.js](../vite.standalone.config.js) | Share single-file bundle setup, worker manifest/rewriting, font-license plugin, and common resolution options; retain entry/output differences | R10/R12 prerequisite for affected moves; validate both bundles, workers, licenses, and notebook output retention |
| [example.worker.js](../src/lib/docs/example.worker.js) | Maintain the embedded Python runner as ordinary owned Python source, bundled as an asset; give snapshot encoding a shared contract | R10; enable Python syntax checking and useful tracebacks while retaining browser execution, distinct root-selection rules, and lazy GPU runtime loading |
| [exampleLoading.js](../src/lib/docs/exampleLoading.js) | Separate live-start scheduling from assets/viewport helpers; distinguish a released queue slot from settled underlying work | R10; retain existing abort behavior and lazy runtime loading rather than substituting a generic concurrency limiter |
| [docs-pages.mjs](../scripts/docs-pages.mjs) | Separate page parsing/validation, Markdown transformation, and generated-file writes instead of compressing them into one script | R10; preserve author line numbers, example IDs, heading fragments, and stale-output cleanup; do not edit maintained introduction/tutorial prose |

## R16 Make the data-view and column-lifetime protocol explicit

**Completed October 11, 2026 (Codex-generated).** The seven-area protocol table and
row-space walkthroughs are in NODE-EXECUTION. Actual view construction, snapshots,
projections and cache access, plus runner, namedData and expression binding are checked.
Numerical/ownership and padded/live-update rendered checks pass. The strict Svelte
preparation boundary in R6 / TODO 122.16 is now checked; broader R6 lifecycle work remains open.

This closes the core gap beyond R12 naming and R3's Slice builder. TODO 122.14 owns
[dataView.js](../src/lib/plot/utils/dataView.js)'s checked implementation and its consumers in
[runner.js](../src/lib/plot/utils/transforms/runner.js), mark preparation and expression binding.
Use the current [columnReads](../src/lib/plot/utils/columnReads.js),
[viewMetadata](../src/lib/plot/utils/viewMetadata.js) and
[gatherCache](../src/lib/plot/utils/gatherCache.js) owners.

Extend the scope/view contracts in [NODE-EXECUTION.md](NODE-EXECUTION.md) and refer to the
existing [DATA.md](DATA.md) semantics. Keep one authoritative protocol table there, rather
than creating another competing protocol document:

| Boundary | Contract to document and type |
|---|---|
| Logical compact read | `length`, visible-row order, lazy compaction, category/geometry column forms and borrowed `get()` results |
| Physical/padded read | Capacity, real hidden-row values, valid mask/count, prefix ordering and when grid metadata survives |
| Prefixed/bucketed projection | Valid-first order, bounded backing capacity, lazy construction and owned projected caches |
| Row mapping and provenance | Local logical/physical indices versus aggregate group IDs and source indices; aggregates may have no direct source-index map |
| Identity and revision | View version versus source generation and interaction revision; transparent row-identity proofs and selection/aggregate barriers |
| Snapshot and lifetime | Frozen columns/version versus shared live identity, explicit retain/release, lazy columns and async read ownership |
| Gather cache | Mapping/column/dictionary/metadata keys, mutable dictionary invalidation, reference returned to caller, eviction and cache retirement |

These are projections/capabilities of the existing view, not mutually exclusive kinds that
require new runtime tags on every node. Type their distinct return shapes and index domains;
keep documented absence/null cases explicit. Do not force a universal parent interface to
pretend aggregates, geometry, virtual columns and plain columns offer identical operations.

Check view construction and snapshot construction first, then mapping/compaction helpers,
gather/cache access and the runner/namedData/expression consumer boundaries. A closure may
remain local where it naturally owns the cache; separate an operation only after its inputs,
row space and disposer are explicit. Name which accessors borrow, consume or return an owned
reference: `get()` and `sourceIndices()` do not have the same transfer contract. Audit the
actual implementation of each accessor instead of deriving ownership from its name.

Preserve immutable mapping certificates, aggregate membership, source row identities, grid
dropping/forwarding, lazy evaluation and the Stage 116 borrow/acquire rules. This is not
composed row-map optimization or new mandatory revision propagation. Stage 123's cache changes
use these clarified contracts in separate logic commits and share the same files' owner.

**Done when:** `dataView.js` and the named constructor/read/snapshot consumer boundaries are
checked, the protocol table covers all seven areas, and a reviewer can trace Filter → Calculate
→ mark and Group → Filter → contributors through row spaces, cache hits and teardown. Existing
padded/compact parity, mutable-category invalidation, eviction/lease, snapshot and leak tests
cover the implementation; add only missing behavior cases. No new count readbacks, eager
compaction, copies or parent-retention chains are introduced as a typing convenience.

## R17 Clarify frame composition and the root-promotion barrier

**Completed bounded contract package, October 11:** strict frame-owner, JAX and shader
composition checks are in the continuation above and TODO 122.15. The targets below describe
the completed scope; broader Frame component reorganization remains with R12.

TODO 122.15 builds on the checked [frameModel.ts](../src/lib/plot/utils/frameModel.ts),
[coordinateOperations.js](../src/lib/plot/utils/coordinateOperations.js),
[rootFrameSelection.js](../src/lib/plot/utils/rootFrameSelection.js) and the root activation/
settlement code in [viewCore.svelte](../src/lib/plot/viewCore.svelte).

Type the existing live operation definitions separately from resolved numeric records:
scale, canonical fit, placement matrix, polar and spherical globe/map operations. Keep
`buildCoordinateOperations` authoritative for topology. Live definitions refer to options;
resolved records freeze parameters for JAX/WGSL. Document order, units, angular/radial policy,
placement/fit distinction, transparent inherited frames and dimension ownership. Check CPU
forward/inverse consumers and the shader/JAX binding adapters against the same records,
including `curvedPaths` request construction; do not build a second coordinate representation.

Give promotion its own invariant and typed handoff:

- Logical root selection follows component ownership, independent of registration/DOM order.
  Pending wrapper content produces an unresolved selection; the currently published root
  remains active until a settled selection can be published.
- One eligible unplaced/unranged top-level Frame is promoted. Plotted sibling content,
  multiple Frames, or spatial Facet/Partition ownership prevent that promotion.
- A queued activation is canceled if its effect is superseded. Root change cancels an active
  brush before activation, advances the root revision, then refreshes brush geometry.
- `whenPublished()` completes when selection is resolved and equals the active root;
  settlement/export paths that use that barrier cannot claim readiness before it.
  Name wrapper release and failure/disposal obligations that prevent permanent pending slots.

Keep the Svelte reactive activation where it belongs; type its callbacks/records rather than
moving the effect plus ambient state into a generic coordinator. Preserve automatic promotion,
singular inverse behavior, wrap/seam/horizon policy, nested ranges/placements and caches. Any
discovered barrier bug is a separate correctness slice, with a focused race/failure test.

**Done when:** live/resolved operation variants and the root-selection/publication handoff
are checked at producers and consumers; one builder remains; ordinary root promotion,
pending/failing wrappers, dynamic root changes and nested coordinate round-trips have named
test anchors. Per-frame CPU composition/refinement changes take the interleaved gate plus
affected nested/polar fixtures; annotations must not add repeated operation-chain rebuilding.

## R18 Make small modules discoverable and remove unnecessary fragmentation

**Codex-generated investigation and proposal — October 11, 2026.** Source: main
`976a111f` plus the uncommitted Stage 122/123 implementation checkpoint above. This package
is in progress; the checkpoint below distinguishes implemented slices from proposed work. TODO 122.17 coordinates it with the existing owning packages.

### Audit scope and what the counts mean

The inventory covers all **550 `.js`, `.ts`, `.mjs` and `.svelte` files under `src/lib`** in
this working tree, including component wrappers, generated scene loaders and type modules.
**324 have at most 120 physical lines.** Directly inside `plot/utils` are **245 files**, of
which **112 have at most 120 lines**. The previous 244-file figure is the reconciled main
baseline; the working tree adds `markPlanTypes.ts`. Blank lines and comments count toward
the threshold, which is an audit filter, not a maintainability limit.

The investigation combined that inventory with local import/export analysis and source/caller
inspection of the maintainer's examples and adjacent preparation, disposal, data, layout,
settings, guides, picking, scene, docs and Three compatibility clusters. It did not manually
review every statement in all 550 files. Runtime dependency analysis excluded JSDoc and
type-only imports, included static dynamic imports and worker URLs, and inspected Svelte
script blocks. Call counts below are distinct direct importers within `src/lib`, not frequency, public
usage or a complete model of dynamic registration. Package entries, generated loaders,
side-effect imports, tests and current performance-driver references need separate checks
before any deletion. Low caller counts alone do not justify consolidation.

The main problem is the flat mixture of domains, ambiguous terminology and unmarked ownership
boundaries. A small cache or adapter with a real contract is often good structure. Several
tiny files prevent duplicated disposal, readbacks or reactive subscriptions; merging them
indiscriminately would undo useful work from Stages 114–121.

### Disposition of the six examples

| Current module | Verified job and callers | Proposed change and owner |
|---|---|---|
| [viewSettlement.js](../src/lib/plot/rendering/viewSettlement.js), formerly `lifecycle.js` | 37 direct source importers. Contains preparation cause tracking, cross-view settlement, draw barriers, upload-manager registration/settlement, renderer disposal and diagnostics assembly | Implemented: viewSettlement coordinates cause/draw barriers; uploadSettlement owns the one manager registry; rendererLifetime owns device/resize/teardown; viewDiagnostics assembles snapshots. No forwarding barrel or generic lifecycle coordinator |
| [channelWriteback.js](../src/lib/plot/interaction/channelWriteback.js), formerly `lineage.js` | Drag writeback: resolve a channel through invertible expressions and transform declarations to the source column. Offset-read detection is also used by namedMark and Calculate; three direct importers overall | Implemented: interaction/channelWriteback resolves/inverts edits; interaction/offsetDependencies inspects authored configuration. Inspection stays outside the offset resource to avoid importing the expression engine into it; transform declarations and drag behavior remain unchanged |
| [arrowInputs.js](../src/lib/plot/binding/arrowInputs.js), formerly `linkArrays.js` | Arrows owns row/width input preparation. The retired fixed-subdivision Links path, CPU Bezier helpers and `transformedPositions` alias had no production or package-entry consumers | Implemented: retain Arrows preparation in binding; retire the audited private path and obsolete test cases. Current adaptive curves retain separate numeric and rendered coverage; no performance saving is inferred from deleting unused code |
| [preparationDependencies.js](../src/lib/plot/binding/preparationDependencies.js), formerly `liveGeometry.js` | Captures borrowed dependency keys and computes changed channels for namedMark/markUpdatePlan | Implemented: strictly checked in binding; `queueLiveGeometry` lives with its existing writer in proceduralChannels. No forwarding module, new scheduler or state registry |
| [partitionSettingsSync.js](../src/lib/options/partitionSettingsSync.js), formerly `scopeLink.js` | Partition's repeated settings subtrees synchronize edits, except local options such as per-group visibility. Partition is its only production importer | Implemented: `options/partitionSettingsSync.js` / `createPartitionSettingsSync`; formatted and documented with attachment, propagation and unsubscribe state together, and the component owning disposal |
| [preparedMarkDisposal.js](../src/lib/plot/binding/preparedMarkDisposal.js), formerly `preparedRetirement.js` | namedMark and displayedFrames defer disposal until Svelte consumers and uploads finish. `replaceableRelease` keeps one changing retained reference | Implemented: binding/preparedMarkDisposal keeps deferred disposal and the typed replaceable-reference operation as separate explicit contracts; retirement timing is unchanged |

The former `lifecycle.js` now has four owners, migrated with all direct consumers. The
strictly checked settlement owners preserve the single cross-view cause tracker, single
upload registry, scoped loads and pause/abort draw barriers. viewDiagnostics is separate
from the existing device instrumentation module because animation already imports that
instrumentation's diagnostic helpers; moving snapshots there would add an import cycle.

The former array `lifecycle.js`, now [attributeRelease.js](../src/lib/threeExtensions/array/attributeRelease.js),
is unrelated: it exports `releaseAttribute`, which destroys the GPU allocation and clears
Three's tracking entry together. This rename is implemented in the existing compatibility
domain with all five production callers updated. Its small implementation protects against
double destruction; its small size is a reason to keep the
operation easy to inspect, not a reason to scatter it across its callers.

### Additional clusters and concrete changes

Proposed directory names identify domains; they are not a request to create all directories
at once. Keep public wrappers and generated scene files pinned. Use a shallow data, binding,
interaction, rendering, layouts and guides structure as each owner migrates, plus the existing
options, scene, docs and Three compatibility domains. A single feature helper may live beside
its owner without receiving a directory of its own. Preserve direct imports; add no general
barrel layer to conceal the underlying dependencies.

| Cluster | Proposed disposition | Reason / existing package |
|---|---|---|
| `markPreparation`, `displayedFrames`, `keyedLifecycle` | Keep distinct, co-locate in binding/animation; name them around preparation jobs, displayed mark frames and keyed row transitions | They own different request, publication and animation lifetimes. R6 types their handoffs; combining them into one mutable context would obscure cancellation and retained frames |
| `markAnimation`, `channelAnimation`, `proceduralChannels` | Use `markAnimationState`, `channelAnimationPlan`, `liveChannelWrites` where the implementation supports those names | State storage, authored timing policy and current-value execution differ. Clarify entry points and who steps/writes them; R3/R6, not a new scheduler |
| `markEvents` / `markComponent.svelte` | First consolidation pilot: make the 12-line event-prop selector a named local helper in its only production consumer | Shared behavior remains shared through markComponent. Preserve wheel/nearest events and `_pickable`; no standalone forwarding file is needed. R6 |
| `dataErrors` | Keep the shared error-reporting operation; name it `reportDataError` within view diagnostics/services | Nineteen direct source callers share a typed optional-view boundary. Inlining it everywhere adds repetition and could lose out-of-Plot behavior. R6 |
| `disposers`, `cacheEntries` | Name around resource ownership and transform-cache disposal; keep their contracts distinct | Before/after owner releases differ from producer-registered cache-entry release. Preserve once-only cleanup and late registration; R6/R16 |
| `columnReads`, `gatherCache`, `columnEncoding`, `viewMetadata` | Keep separate data-domain modules, using `acquireColumn`, `mappedColumnCache`, `dictionaryEncoding`, `dataViewMetadata` as discoverable names | Each has a real ownership/cache/projection contract, even with one caller. These are R16's existing owners, not four new universal node capabilities |
| `hostSources`, `foreignJax`, `sourceRows` | Name as `hostColumnSources`, `adoptExternalJaxArrays`, `sourceRowReadbackCache`; place by the data boundary they serve | Uploaded host data, foreign-runtime conversion and retained async index reads are different. Preserve exact integer values, immutable-array caching and failed-read retries; R16/R9 |
| `names`, `programs`, `expressionMetadata` | Reuse R12's expression-reference/kernel-program naming; keep semantic metadata policy explicit | They already provide useful low-level contracts. Do not fold AST descriptors, bounded JIT caching and result metadata into one engine file. R4 |
| `forceContext`, `layoutFrame`, `layoutLive`, `layoutPublication` | `layoutContext`, `layoutDataContext`, `layoutLiveness`, `publishLayoutData` in the layouts domain | The context serves static layouts as well as Force. A layout's `{nodes, edges}` data publication is not a coordinate Frame or completed canvas frame. Preserve graph identity and the one view-registration owner. R16/R17 |
| `treeTopology`, `treeOutput`, `treeHost`, `treeLifecycle` | Discover together in the Tree layout domain; name topology plan, output columns, execution and node transitions by role | Keep graph/topology planning separate from numerical execution and retained output frames. This is a navigation improvement before any additional extraction. R3/R16 |
| `surface` | First consolidation candidate: local `attachSurface` helper in its sole consumer, Line, or a clearly named surface-binding module if the owner gains real sharing | Only 17 lines, but teardown removes a listener and detaches the mark; preserve the effect cleanup. R5 |
| `surfaceFrameGate` | Keep the pure priming policy beside surface rendering, with a name such as `surfacePipelinePriming` | New pipelines/targets prime once; ordinary data/camera changes do not. Its independent test boundary is useful despite one production importer. R5 |
| `physicalDomains`, `extentSummary`, `guideBounds` | `prepareTextPhysicalBounds`, `extentReadbackCache`, `readDisplayedGuideExtent` by domain | These mean Text's masked footprint, batched/cacheable data extents and the displayed animated field. Do not merge their masks, revision rules or readback timing. R6/R8 |
| `axisTitleRules`, `axisTitles`, `axisColumns` | Keep pure title rules separate; distinguish title votes from axis channel identities/domain grouping | Their current dependencies create the cycle detailed below. Move Facet grouping policy to the Facet owner where justified; do not duplicate title declarations. R4/R8 |
| `axisStyle`, `axisColors`, `axisOptions`, `snapshotAxisOptions` | Group as appearance, theme colors, settings registration and displayed-frame settings snapshot | Appearance calculations differ from reactive settings and export snapshots. Existing pure helpers remain useful; R8 |
| `pointerTracker`, `framePointer.svelte`, `viewPointer` | Keep the tracker, reactive frame subscription and conversion contracts distinct in interaction/coordinates | The tracker batches only for subscribed frames; the Svelte adapter owns one enabled subscription. R6/R17 |
| `layerOrder`, `layerSlot.svelte` | Keep pure/order registry work separate from Threlte registration; group in rendering | Slots bridge authored DOM order and object ownership, not an interchangeable generic context. R5/R6 |
| `geoWorker`, `geoStyles`, `requestScheduler`, `tilePublication` | Locate by GeoJSON geometry, style preparation, tile request scheduling and tile draw publication | A worker cancellation boundary, a network slot and a completed-draw turn are different. Preserve the worker URL and both Python bundles. R7/R10 |
| `shaderBuilds`, `diagnostics`, `componentStatus.svelte` | Put shader attribution beside diagnostics; retain reactive status separately | Graph-build timing and resource diagnostics differ from a component's subscribe/unmount contract. Do not inline version-sensitive backend instrumentation into lifecycle logic. R6/R10 |
| `documentExport`, `exportDocument`, `guideExport`, `guideDocumentExport`, `exportPixels`, `sceneDocumentExport` | Apply R12's existing export-domain names; distinguish model, raster capture, vector guides and composition | Similar filenames hide different formats and owners. Reuse the prior proposal instead of adding a parallel export architecture. R7/R9/R12 |
| picking `readPixel`, `sourcePosition`, `tolerantPick`, `copyPickingMaterial` | Keep bounded GPU readback, source-field reading, pure hit selection and compatibility copying distinct; make backend-specific assumptions explicit | Sharing staging primitives can follow the field/fallback boundary, but full array reads and a generic picking manager are not readability changes. R5/R6/124 |
| scene `stableProps`, `propCells.svelte`, `componentLoading`, `exportClosure` | Use R12's identity-reuse/reactive-props names; prefer `componentLoader` and `htmlExportClosure` | Identity stabilization, per-prop invalidation, retryable imports and export-resource closure have separate contracts. Keep generated `components.js` generator-owned. R9/R10 |
| `instanceMatrix`, `screenDPR`, `storageBindings`, picking material copying | Collect version-sensitive adapters under a recognizable Three compatibility boundary | Keep side-effect patch installation explicit and ordered. Record upstream issue/behavior, applicable version and retirement evidence; do not remove a workaround because it is short. R5/124 |
| docs `exampleLoading` and `live` | Keep asset/viewport discovery separate from `liveStartQueue` and runtime presentation | Loading intentionally avoids importing plotting runtime; abort releases a docs start slot before underlying work settles. Use the existing R10 proposal; do not touch maintained tutorial prose |

### Three dependency cycles at the audit baseline

These are runtime local-import cycles, not type references or a claim of an observed runtime
failure. They make dependency direction harder to reason about. The audit found these three
strongly connected groups; public facades and package metadata need to remain stable while
avoidable internal back-edges are removed.

1. **Expression/sort/title helpers:** `expressions` imports `columnOperations` and Sort;
   `columnOperations` imports `transforms/order`; order imports `transforms/common`; common
   imports `columnTitle` from `axisTitles`; axisTitles imports `axisColumns` and the expression
   engine; axisColumns also imports the engine. Six modules form one group. Use the existing
   low-level `names.js` descriptor predicates in title/channel inspection rather than importing
   the evaluator to ask `isExpression`. Move the pure `columnTitle` rule into the existing
   low-dependency title-rules owner if needed, so sorting does not depend on mark title
   orchestration. Keep one declaration of each rule; do not create another AST facade or
   implement reduced predicates that disagree with the existing ones. R4/R8 own this slice.
2. **Facet/pairs — removed:** the pairs operation now lives locally in `facets.js`, alongside
   its `facetMetadata` and `aliasScale` policies; the forwarding import and `pairs.js` are gone.
   The operation is formatted with input borrowing, snapshot retention and returned-view
   disposal explicit. If distinct partition engines later justify a split,
   put shared metadata/scale alias policy in a dependency-neutral existing Facet owner.
   Rename the entry around `partitionFacetCells`; preserve snapshots, aliases and cleanup.
3. **Composition/Polygon:** `composition.js` re-exports Polygon, while Polygon imports its
   dependencies from composition. This is an intentional controlled authoring boundary:
   [compound-move.test.js](../tests/unit/compound-move.test.js) requires compounds to import
   plotting capabilities only through that surface. **Keep and document this cycle for now.**
   Direct leaf imports would violate the existing rule; a new primitives facade would add a
   file and another import surface just to satisfy a graph metric. Revisit only if actual
   initialization trouble or a broader composition-boundary redesign justifies it. Preserve
   the author-facing surface, its reference table and the existing test; no permission for
   changing that boundary is implied by this audit.

Re-run the source import graph on a frozen candidate as a review aid. The target is removal
of the two helper groups, with the composition group an evidenced deferral; do not introduce
replacement cycles or add tests that merely assert filenames or module arrangement.
R4's cycle change takes the normal per-frame performance
gate. Moving code alone does not count as removing a dependency.

### Two bounded retirement investigations

- **`numericExpressions.js`:** a two-line internal compatibility re-export. Its two unit-test
  consumers are `kernel-literals.test.js` and `reductions.test.js`, with no production importers.
  Update those imports to the existing `createExpressionEvaluator`, then retire the facade
  after checking published/package surfaces. The active `measure-text-ablation.mjs` still
  fingerprints its path: migrate current snapshot fingerprints too. Keep old result files,
  historical README explanations and the summarizer's recognition of old profiles intact.
- **Old link subdivision:** retain `arrowArrays`, which production Arrows uses. The separate
  `linkArrays` routine is used only by `gpu-marks.test.js`; its CPU comparison uses
  `geometry.curveSegments`/`cubicBezier`, also currently test-only outside that implementation.
  `data.transformedPositions` is used only by this old routine. Audit these together against
  current curve-controls/refinement, dashed-line rendering, package exports and both bundles.
  If no supported path needs them, remove the obsolete production routines and alias, keeping
  only independently useful test references in test support. Preserve arrow shape/ownership
  tests and add/retain current-path rendered curve coverage. Do not claim a performance win
  from code absent from the production call graph, or remove all of `geometry.js`.

These are removal of internal obsolete paths, not permission to remove curves, arrows,
dragging or other useful public capabilities. Absence from this static graph is evidence for
investigation, not proof of external non-use.

### Five task walkthroughs and vocabulary

Put one concise task/owner map in the existing [NODE-EXECUTION](NODE-EXECUTION.md) guide,
linked from this plan; do not introduce a second contract registry. The map should let a
contributor start from a user action, rather than a list of helper filenames:

| Task | Current path / distinction to make explicit |
|---|---|
| Prepare and display a mark | namedMark assembles data inputs and asks markUpdatePlan for an action; prepareNamed builds owned results; markPreparation accepts/rejects jobs; displayedFrames handles visible keyed transitions; field owners upload/draw. Distinguish accepted preparation from what is currently displayed |
| Update live channels and release replaced data | Dependency capture certifies reuse; queued live writes/proceduralChannels evaluate current values; accepted binding advances; replaceable retained scope is released on replacement, while previous displayed results retire after their readers finish |
| Wait for a plot or dispose it | Cause-based tracked preparation -> Svelte publication/follow-ups -> queued field/geometry writes -> submitted GPU work; completed-draw barriers have pause/cancel behavior. Renderer teardown stops draws before awaiting owned work |
| Drag a transformed value | Picking/dragRouter -> dragSession -> channel writeback resolution/inversion -> offsets or aggregate-member updates -> affected transforms. Keep source column resolution distinct from row provenance |
| Change one Partition group's settings | Partition owns linked settings roots; the synchronizer matches authored subtree positions, propagates nonlocal edits, initializes new groups and removes subscriptions as groups leave |

Define overloaded words where they occur: **coordinate Frame**, **layout data publication**,
**displayed mark frame**, **completed canvas draw**; **data scope** versus **settings scope**;
**preparation job order/cause** versus **source generation**, **interaction revision** and
**accepted binding revision**; **source-row provenance** versus **channel writeback lineage**.
Preserve public/schema terminology; use precise internal locals, type names and module names.

For touched modules, add a short purpose/ownership header only where the existing header is
insufficient: what operation it serves, who owns state/resources, what callers receive and
how cleanup happens. Most valuable headers fit a few sentences; do not mechanically attach
identical boilerplate or extensive lifecycle prose to every pure mathematical helper.

### Proposed slices and completion

**Implementation checkpoint, October 11, 2026 (Codex-generated):** the five walkthroughs are
in [NODE-EXECUTION](NODE-EXECUTION.md#follow-a-task-through-its-owners). Event selection is
local to markComponent; pairs partitioning is local to Facet and its back-edge is removed.
The internal evaluator facade is removed after migrating both unit callers and the active
ablation fingerprint; historical profile recognition/results remain untouched. Partition
settings synchronization and GPU attribute release now have responsibility names in their
existing domains. Six affected modules join the formatting allowlist. Preparation dependency
capture is strictly checked under `binding/preparationDependencies.js`; live-write serialization
is with proceduralChannels, whose callbacks own their holds/cleanup. Pure column naming lives
in axisTitleRules; title helpers use names.js predicates directly, removing the expression/title
cycle without reopening the planner. Purpose/ownership
headers clarify all six maintainer examples, without pretending their remaining extractions
are complete. No mark-wrapper paths, public API or ownership protocol changed.

Remaining: strict
core checking and preparation-boundary extractions, retirement of old link subdivision
after its compatibility audit, and other owning-package domain migrations. The composition
cycle remains an explicit deferral. Inventory figures above record the pre-cleanup audit.

Validation of this bounded slice: 1,377 unit tests pass; strict/Svelte checking reports zero
errors/warnings; formatting, generated signatures (112 components) and API checks pass;
both Python browser bundles build. Seven focused rendered cases pass at DPR 2 on a fresh
server: embedded/external pairs, Partition mounting/legend modes/insets, and warm hover
picking without mark rebuilds or compiles. All 29 Facet/Partition cases pass under the leak
harness after fixing five pre-existing fixtures that did not release their own device-array
references; those five failures were first reproduced with the pre-cleanup implementation
in an isolated snapshot. There is no change to production borrow/acquire behavior.
Static runtime imports now have one multi-module cycle (the intentional composition/Polygon
boundary), down from three. Recursive Svelte component imports are not helper dependency cycles. The 547-module inventory is a consequence,
not the acceptance target. Hot-path algorithms, workers/assets and mark registry paths were
unchanged; no new performance claim or broad rendering-PR gate is implied by this slice.

**Continuation validation, October 11:** dependency/write separation and title-cycle removal
pass all 1,377 unit tests (68 focused cases), six focused dependency/write ownership checks
under the leak harness, zero strict/Svelte errors or warnings, formatting, API/signature
checks and both Python bundles. Ten fresh-server rendered cases pass at DPR 2: live producer
writes keep drawing, automatic bounds agree with exported geometry, static paint/title fades
keep their schedule, Text payloads reuse and invalidate correctly, titles follow aliases and
renames, SVG titles match, and warm hover picks without rebuilding.

Two frozen production builds were served together for one discarded warm-up followed by six
alternating measured pairs on native Sunburst and Lorenz. CPU/frame paired medians were
+0.073 ms on Sunburst and +0.100 ms on Lorenz; each workload had three positive and three
negative differences. No repeatable slowdown outside paired variation was observed. Lorenz
had zero warmed builds, no device errors and no systematic increase in fixed-window readbacks
or sampled live bytes. Those bytes are sampled during animation, not after settlement;
Sunburst readbacks were not measured in these plain captures. The existing rendered tween
case separately verifies zero shader/readback churn. This comparison isolates this continuation;
it does not close the accumulated stage gate or the nine core implementation targets.
[Retained rounds, frame/work counts and source fingerprints](../tests/perf/investigations/results/stages122-module-boundaries.json)
record the values and limitations. That continuation raised strict coverage to **40 modules**; the next packages below raise it to **46**.

**Further implementation, October 11 (Codex-generated):** settlement, upload registry,
renderer teardown and snapshots now have explicit owners; channel writeback is separate
from configuration-only offset dependency inspection; prepared result disposal is named
for its job. No private forwarding files remain. Actual coordinateOperations is strictly
checked with live/reference and resolved numerical records, including the checked endpoint
consumer's option contract. This closes **1/9** implementation targets, not all core contracts.
The remaining eight still require implementation and callsite checking.

All first pilots are implemented: the five shared path-sampling WGSL helpers have one source
definition each and both emitted shader strings are byte-identical; Python construction,
implicit plots and portable template skeletons share initialization; typed channel input
helpers share owned RGB matrix normalization and datetime-axis origin binding while keeping
alpha, color-space, scalar/column/grid shifting policy with the consumer. PublicTypes,
facetCore and brushOverlay are formatted and allowlisted. Regeneration produced zero content
changes in all eight generated artifacts. The projection parity test now tolerates normal
whitespace without accepting nonliteral type members.

The unreachable per-piece interpolation reuse branch is removed: all published caches
have concatenated geometry, and complete/missing-value guards previously bypassed the
branch in every case. Cache batches are released after concatenation, which retains its
lazy dependencies. The new missing-values parity case compares cached and fresh searches
for linear, nearest and IDW with numeric/categorical inputs. The overwritten Map-based
snapshot/restore methods in the offset layer are also removed; the existing structured
snapshot remains the only contract, including pending hydration and drag cancellation.

Validation in progress: 58 settlement/disposal/drag cases, 81 coordinate/grid/ratchet cases,
97 input/time/offset cases and eight focused interpolation leak checks pass; Python core
and templates pass 204 cases with local browser access. Full unit, refreshed Svelte/type,
format, bundles and drawn-output/performance gates are being completed for this batch.

1. **Task map and terminology:** clarify the five walkthroughs and the six examples before
   directory moves. No runtime change; core checking continues in 122.14–122.16.
2. **Small consolidation/cycle pilot:** localize markEvents and pairs; remove the Facet/pairs
   back-edge. Consider attachSurface only after its subscription owner is clear. Keep the
   controlled composition facade and mark layers stable; document the intentional Polygon cycle.
3. **Obsolete adapter/path cleanup:** evaluator facade first, then the old link branch after
   its coverage/replacement audit. Move reusable references to test support only when useful.
4. **Preparation naming and ownership:** migrate dependency/writeback/prepared-disposal names
   with R6's typed boundaries; clarify state versus plan versus execution. Keep four lifetimes
   (jobs, prepared data, displayed transitions and uploaded field versions) distinct.
5. **Settlement/diagnostics boundary:** clarify and split lifecycle's actual responsibilities
   with one state owner per registry, then migrate its 37 direct consumers together. Coordinate
   the GPU/backend boundary with R5/124; no dependency on completing the whole fallback.
6. **Domain navigation:** move cohesive data, layouts, interaction, guides, compatibility and
   scene helpers in bounded domain commits alongside their existing packages. Address the
   expression/title cycle with R4/R8, without reopening completed planners or ownership rules.

Mechanical moves follow R12's generator/package/worker/JSDoc/checking/format-allowlist audit,
quiet-window rule and generated-diff inspection. Preserve checked coverage and count renamed
implementations under the original nine-module targets. A new file or better filename does
not complete a contract package; no permanent private-path forwarding adapters are added.

**Done when:** the five tasks have explicit entry/owner/cleanup maps; the six examples have
implemented dispositions or specific evidenced deferrals; the three demonstrated cycles are
removed or individually justified; current callers no longer rely on retired internal facades;
and contributor navigation improves without new state stores, schedules or universal node
flags. Record each consolidation's change in files/indirection as evidence, without imposing
a minimum file-count reduction. Keep the existing strict checking, local behavioral/leak,
rendered-output, generated-output and per-frame performance gates.

## Feature preservation policy

Preserve useful capabilities by default. A feature-removal proposal must demonstrate
(1) limited value to the intended users or a redundant supported alternative, (2) a named
responsibility that can actually be retired, (3) a concrete migration or explicitly accepted
capability loss, and (4) a benefit exceeding replacement and migration costs. Sparse examples
and large files alone establish none of these. Dependency replacements belong in the
[library trials](LIBRARY-REPLACEMENT-TRIALS-2026-10-10.md); mark composition and compatibility
changes belong in the [mark design plan](MARK-CONSOLIDATION-PLAN-2026-10-10.md).

## Per-frame paths and production performance gate

These paths execute during animation or repeated source publications; their frequency can
be once per mark/transform per frame, not simply once per frame. A cached compiled program
does not make its surrounding JavaScript preparation free.

| Path | Current call chain to inspect | Existing correctness guard |
|---|---|---|
| Expression evaluation | [expressions.js](../src/lib/plot/utils/expressions.js) evaluation → [expressionPlans.js](../src/lib/plot/utils/expressionPlans.js) evaluator `evaluate` / `compiled` / `prepare` → `normalizeRoots`, `lowerRoots`, `bindColumns`, `programPlan`; used by Calculate, simulation and procedural marks | [reductions.test.js](../tests/unit/reductions.test.js), [view-state-kernels.test.js](../tests/unit/view-state-kernels.test.js), expression release in [leaks.test.js](../tests/unit/leaks.test.js) |
| Dependency analysis | [transform.svelte](../src/lib/plot/transform.svelte) `dependenciesOf` → `transformDependencies` → [analyzeDependencies](../src/lib/plot/utils/transforms/dependencies.js); subscriptions and run effects revisit it on source/time changes | [transform-contract.test.js](../tests/unit/transform-contract.test.js), clock/change keys in [view-state.test.js](../tests/unit/view-state.test.js) |
| Time-driven transform runs, including Slice | [slice.svelte](../src/lib/plot/slice.svelte) → [interpolateSlice](../src/lib/plot/utils/slice.js) → bracketing, entity order, padded/compact result construction → downstream interpolation/mark preparation. Playback or a time slider can run this path every frame; moving-particles currently uses Filter → Slice → Points | [slice.test.js](../tests/unit/slice.test.js), [grid.test.js](../tests/unit/grid.test.js), moving-particles cases in [pipeline-churn.spec.js](../tests/browser/pipeline-churn.spec.js); production moving-particles gate below |
| Clock, tween and simulation publication | [clockScope.js](../src/lib/plot/utils/clockScope.js) tick/holds → producer slots in [tweenState.js](../src/lib/plot/utils/tweenState.js) and previous/next state in [simulate.js](../src/lib/plot/utils/simulate.js) → accepted data/mark writes | [animation.test.js](../tests/unit/animation.test.js), [tween-state.test.js](../tests/unit/tween-state.test.js), [simulate.test.js](../tests/unit/simulate.test.js); completed frames and numerical-step progress |
| Frame composition and curve requests | [coordinateOperations.js](../src/lib/plot/utils/coordinateOperations.js) live/resolved chains → forward/inverse adapters and [curvedPaths.js](../src/lib/plot/utils/curvedPaths.js) refinement inputs; root activation is a topology change rather than a per-frame task | [coordinate-operations.test.js](../tests/unit/coordinate-operations.test.js), [frame-model.test.js](../tests/unit/frame-model.test.js); nested/polar drawn-output guards |
| Mark update planning | [namedMark](../src/lib/plot/bound/namedMark.svelte) preparation effect → preparation dependencies → [planMarkUpdate](../src/lib/plot/utils/markUpdatePlan.js) → static reuse/live write/mask swap/full preparation | [mark-update-plan.test.js](../tests/unit/mark-update-plan.test.js): unchanged Text, live writes, mask swaps, membership feedback |
| Live field writes | namedMark `writeLive` → `queueLiveGeometry` → [proceduralChannels](../src/lib/plot/utils/proceduralChannels.js) step → evaluation/field writes → domain update and accepted binding/release | [view-state.test.js](../tests/unit/view-state.test.js): failure/retry, retention, supersession, serialized writes and accepted-domain publication |

Inspect allocations, array/object traversal, dependency rescans and wrapper calls in these
chains before extracting helpers. A representation that is clearer at the call site can
still add repeated normalization or extra garbage collection. Preserve hot-path ownership
and execution frequency as explicit contracts.

**Resolved performance evidence:** the
[final comparison](../tests/perf/investigations/results/refactor-final.json) compares
`9e0830f3` with `e95c208d`. Eight interleaved Sunburst rounds give CPU/frame medians of
**3.910 ms baseline and 3.885 ms head**, with a **−0.009 ms median paired difference**.
Both builds moved from about 3.65 to 4.2 ms partway through the session. The earlier sequential
measurements therefore do not establish a 116.3/116.4 regression; their +0.6 ms attribution
is withdrawn, and the associated R4/R6 hold is lifted.

Keep the result's qualifications: paired frame-p95 increased by 0.93 ms within the recorded
tolerance; Sunburst GPU pass time is still unreported. The retained counter captures report
97 readbacks per flight on both builds, and were measured separately. Lorenz's captures were
sequential, so their CPU difference does not establish a speedup. Future comparisons must
use the interleaved method for both examples, rather than repeat that limitation.

### Required comparison for a hot-path slice

Any logic/helper/representation change touching these chains, or their shared callees, requires
**interleaved production comparisons on both Sunburst and Lorenz**, regardless of whether
it is described as readability work. Slice/result-builder or shared Slice/Interpolate changes
also require **moving-particles**. A strictly mechanical whitespace-only commit can use its
normal checks; code reorganization is not presumed performance-neutral.

1. Freeze before/after source and assets in separate snapshots. Record commits, dirty diffs,
   lockfile/vendor hashes, Chrome version, hardware and build options. Build matching
   Python/example payloads for each snapshot when that route is measured; reuse outputs only
   with verified identical producing inputs.
2. Follow the [production harness setup](../tests/perf/investigations/README.md): generate
   examples with `npm run build`, then `VITE_HMPLOT_PERF_HOOKS=1 npx vite build`. Copy each
   snapshot's `build/` into its own directory and **serve both immutable copies concurrently**
   at distinct URLs with a static server that resolves extensionless routes to their HTML
   files and serves `404.html` as the client-route fallback, including
   `/test/gallery-example?id=sunburst`. A preview of one build is not the two-build comparison setup. Normal production
   builds omit the Sunburst hook. Use identical browser/headless flags, **1500 × 1100 viewport
   and DPR 2**. The servers coexist; measured browser/GPU workloads run one at a time, with
   no competing builds, test suites, or captures.
3. Discard one complete warm-up run per build, then measure **eight paired A/B rounds
   (six minimum)**, alternating the measured build after each run: A1, B1, A2, B2, and so on.
   Decide on the per-round B-minus-A differences and their spread, not just the difference
   between two session medians. Use
   [sunburst-profile.mjs](../tests/perf/investigations/sunburst-profile.mjs), whose current
   driver records six flights. Fix the retained flight window before collecting data and use
   it for both builds; the final retained comparison uses flights 2–6 after the discarded
   whole-run warm-ups. For native Svelte use `SUNBURST_ROUTE=/test/gallery-example?id=sunburst` and
   `SUNBURST_TRACKS=0` in production. Also measure `/examples/sunburst` when shared code or
   Python/scene bundles are affected. Use identical routes between conditions.
4. Set `SUNBURST_PRODUCTION=1` and `SUNBURST_SOURCE_ROOT` to the measured snapshot so served
   asset hashes are checked. Separate plain (`SUNBURST_CPU=0 SUNBURST_PROFILE=0`), CPU-profiled
   (`1/0`) and GPU-counter (`0/1`) captures and output directories. Plain captures establish
   frame/gesture behavior; matched CPU-profiled captures establish CPU/frame, and sourcemaps
   attribute the difference. Never combine profiled and plain samples into one statistic.
5. Run [lorenz-profile.mjs](../tests/perf/investigations/lorenz-profile.mjs) with matching
   `LORENZ_URL`/`LORENZ_OUT`, **`LORENZ_RUNS=1` per invocation**, and the same interleaved
   rounds. Keep at least four seconds of warm-up and six-second sample windows per run.
   Its frame/CPU, GPU-counter and timestamp-query windows remain separate. Confirm matching
   served assets here too. Record presented frames for all three canvases rather than
   relying only on requestAnimationFrame callbacks. Three consecutive captures per build
   are not a substitute for alternating individual runs.
6. For Slice/Interpolate work, measure `/examples/moving-particles` in the same interleaved
   production setup: its 1,500 particles × 60 samples (90,000 rows), at fixed minimum-speed
   settings, during steady playback and a repeatable time/selection change sequence. Record
   the warm-up, exact controls, and sample windows before the runs. There is no dedicated
   production driver yet: use visible Play/Pause and Minimum speed controls; if exact-time
   stepping needs a private harness, apply identical harness code to both snapshots and
   record it. `window.__movingParticles` is development-only and is not enabled by the
   Sunburst production hook. Count actual completed/presented plot frames, check rendered
   positions or SVG/pixel parity at fixed states, and record total readbacks per fixed
   playback window or control sequence. Add an explicit Slice → Interpolate case when that
   downstream cache boundary changes; the stock example's final node is Points.
7. Check the existing Sunburst zoom/reset and Lorenz 60,000-point/linked-interaction cases in
   [examples.spec.js](../tests/browser/examples.spec.js) on the final source, after timings.
   Use the moving-particles controls and focused cases in
   [pipeline-churn.spec.js](../tests/browser/pipeline-churn.spec.js) for time changes, speed
   thresholds, zero warmed builds, and within-span playback readbacks. Those existing
   development checks do not replace production timing; their RAF count alone does not
   establish completed plot frames. Cold shader compilation is a separate measurement if
   shader generation changed; warmed results do not establish it.

Report active CPU/frame median and spread, each round's paired difference, absolute
milliseconds and percentage delta, frame-interval p50/p95, completed/presented frames, GPU
submits per frame, warmed shader/pipeline builds, preparation versus live-write counts, and
settled retained bytes. **Compare Sunburst readbacks per flight**, alongside frames per
flight; a changed per-frame ratio alone is not evidence of added readbacks. For continuous
Lorenz/moving-particles playback, compare total readbacks over identical fixed-duration
windows or control sequences alongside completed frames; do not invent a flight unit.
Use separate diagnostic runs for counters not exposed by the timing harness. Record missing
metrics explicitly; no counter is assumed zero because it was unavailable in production.

The existing hard gate rejects CPU/frame or p95 regressions above **max(10%, twice observed
spread)**. Judge the change using paired-round differences; use their spread, expressed
relative to the corresponding baseline statistic, rather than widening tolerance with
whole-session drift. It also rejects reproducibly fewer completed frames, new warmed builds,
increased readbacks per matched flight/window, increased retained bytes after settlement,
or full preparation replacing live writes. For readability-only work, **any reproducible
slowdown outside paired-run noise requires investigation and an explicit tradeoff decision**,
even below that threshold. Inconclusive noise requires more paired evidence, not a pass.
Compare both the individual slice and accumulated changes against the last accepted baseline
so small regressions cannot compound. Retain raw captures and any accepted baseline history.

## Behavior and test map

Use these existing cases as the evidence for the invariants in each package, rather than
adding parallel tests that repeat them. Links name current coverage, not results run during
this documentation update. Select the named behaviors within large files. If a changed
boundary is untested, add one focused behavior test in the existing appropriate file.

| Package | Behavior and existing test anchors | Additional gate or known gap |
|---|---|---|
| R0/R1 | [refactor-ratchet.test.js](../tests/unit/refactor-ratchet.test.js); generated accepted props/signatures/API currency in [python-signatures.test.js](../tests/unit/python-signatures.test.js); options-table parity in [docs-reference.test.js](../tests/unit/docs-reference.test.js); [test_api_consistency.py](../python/tests/test_api_consistency.py) | PublicTypes formatting requires the zero generated diff described in R1, beyond checks passing |
| R2 scans/grid | [windows.test.js](../tests/unit/windows.test.js): brute-force reducer/alignment/size/group/filter parity; [slice.test.js](../tests/unit/slice.test.js); [grid.test.js](../tests/unit/grid.test.js): duplicate samples, category ties, cache reuse, bounded interpolation and invalid coordinates | Leak harness on the changed numerical paths; prove obsolete branches unreachable before removal |
| R3 Density | [density.test.js](../tests/unit/density.test.js): grouped/masked KDE, compiled versus chunked, 2D centers; Density cases in [padded-views.test.js](../tests/unit/padded-views.test.js): weights, groups, violins and 2D | [kernel-literals.test.js](../tests/unit/kernel-literals.test.js): bandwidth/bounds changes compile nothing; [transform-work.test.js](../tests/unit/transform-work.test.js): group-count allocation budget; leak harness |
| R3 Slice | [slice.test.js](../tests/unit/slice.test.js): entity order, missing brackets, exact endpoints, category midpoint, duplicate rejection, cancellation, batching, masks and zero within-span readbacks; Slice and bucketed cases in [padded-views.test.js](../tests/unit/padded-views.test.js) | [kernel-literals.test.js](../tests/unit/kernel-literals.test.js): time/mask compile reuse; [transform-work.test.js](../tests/unit/transform-work.test.js): linear allocation; leak harness; interleaved Sunburst/Lorenz plus production moving-particles; focused [pipeline-churn.spec.js](../tests/browser/pipeline-churn.spec.js) guards and fixed-state rendered parity |
| R3 named inputs/Bin | [color.test.js](../tests/unit/color.test.js) and [rgb-marks.spec.js](../tests/browser/rgb-marks.spec.js): RGB/alpha/dtype/errors and pixels; [data.test.js](../tests/unit/data.test.js): temporal origins/metadata; [time.test.js](../tests/unit/time.test.js): calendars/zones/edges; Bin cases in [compiled-transforms.test.js](../tests/unit/compiled-transforms.test.js), padded-views and [reductions.test.js](../tests/unit/reductions.test.js) | Preserve compiled reuse and owned-column release; performance gate if shared evaluation/preparation paths change |
| R4 | [reductions.test.js](../tests/unit/reductions.test.js): plans, retracing, fallback, unread outputs, aliases, mutable literals and exact metadata; [transform-contract.test.js](../tests/unit/transform-contract.test.js): declared dependencies and subscription replacement; [transform-caches.test.js](../tests/unit/transform-caches.test.js): cached membership/release; [arrow.test.js](../tests/unit/arrow.test.js): adapters | Mandatory hot-path comparison; numerical correctness does not cover CPU overhead |
| R5 | [data.test.js](../tests/unit/data.test.js): scalar/buffer transitions, retained/superseded writes, failure/retry and capacity; [vertex-buffers.test.js](../tests/unit/vertex-buffers.test.js): node identity and tile growth; [line-buffers.spec.js](../tests/browser/line-buffers.spec.js), [sampled-line.spec.js](../tests/browser/sampled-line.spec.js), [rebuilds.spec.js](../tests/browser/rebuilds.spec.js): drawn lines and warmed builds | Cold-compile measurements remain separate; retained resources and completed frames must stay stable |
| R6 | [settle.test.js](../tests/unit/settle.test.js), [disposers.test.js](../tests/unit/disposers.test.js): publication/cancellation/retirement; [mark-update-plan.test.js](../tests/unit/mark-update-plan.test.js); [interaction.test.js](../tests/unit/interaction.test.js): preview/cancel/commit; [connections.spec.js](../tests/browser/connections.spec.js): live endpoints/replacement; [pipeline-churn.spec.js](../tests/browser/pipeline-churn.spec.js) | For picking/controller changes also use [plot.spec.js](../tests/browser/plot.spec.js) and [interaction-regressions.spec.js](../tests/browser/interaction-regressions.spec.js); identify any missing stale-readback case before extraction; hot-path gate |
| R6 typed preparation | [mark-update-plan.test.js](../tests/unit/mark-update-plan.test.js): action precedence; [view-state.test.js](../tests/unit/view-state.test.js): accepted writes, retention and supersession; [settle.test.js](../tests/unit/settle.test.js) and [pipeline-churn.spec.js](../tests/browser/pipeline-churn.spec.js): cancellation/publication and live progress | Strict-check data-request/action/result producers AND Svelte callsites, keeping lifecycle-job identity distinct; use existing failure cases rather than tests mirroring type declarations |
| R16 views | [padded-views.test.js](../tests/unit/padded-views.test.js): compact/padded/bucketed parity, dictionaries, cached leases and lazy construction; [transform-contract.test.js](../tests/unit/transform-contract.test.js): row/metadata rules; [transform-caches.test.js](../tests/unit/transform-caches.test.js): identity/release; [padded-marks.spec.js](../tests/browser/padded-marks.spec.js): drawn output | Check each accessor's actual ownership; leak harness, snapshot source-advance cases and no extra compaction/readbacks; typing does not reopen composed mappings |
| R17 frames | [frame-model.test.js](../tests/unit/frame-model.test.js): ownership and pending-root publication; [root-frame-selection.test.js](../tests/unit/root-frame-selection.test.js): eligibility; [coordinate-operations.test.js](../tests/unit/coordinate-operations.test.js) and [frame-mapping.test.js](../tests/unit/frame-mapping.test.js): forward/inverse/nested operations | [stage14-root-pending.spec.js](../tests/browser/stage14-root-pending.spec.js), [root-coordinates.spec.js](../tests/browser/root-coordinates.spec.js), [nested-frames.spec.js](../tests/browser/nested-frames.spec.js), [frame-brush.spec.js](../tests/browser/frame-brush.spec.js): mounted output, promotion/brush; [stage14-root.spec.js](../tests/browser/stage14-root.spec.js): superseded activation and unmount cancellation |
| R3 time state | [animation.test.js](../tests/unit/animation.test.js): holds, elapsed time and scope ticks; [tween-state.test.js](../tests/unit/tween-state.test.js): producer slots, retarget/remap and retained revisions; [simulate.test.js](../tests/unit/simulate.test.js): prior-state/fixed-step semantics | [tween-pipeline.spec.js](../tests/browser/tween-pipeline.spec.js), [animation-engine.spec.js](../tests/browser/animation-engine.spec.js); count numerical steps AND completed frames, including seeks and teardown; Sunburst/Lorenz comparison |
| R7 | [vector-tiles.test.js](../tests/unit/vector-tiles.test.js): clipping/holes, queues/cancellation/cache/publication; [vector-tiles.spec.js](../tests/browser/vector-tiles.spec.js): prior tiles, stale results, frame progress, settlement and reuse; [document-export.test.js](../tests/unit/document-export.test.js), [orthographic-vector.test.js](../tests/unit/orthographic-vector.test.js) | Export snapshots via [vector-tile-export.spec.js](../tests/browser/vector-tile-export.spec.js); inspect output parity, not only settlement |
| R8 | [settings.spec.js](../tests/browser/settings.spec.js): focus, external anchors, inherited edits, target recovery and closed subscriptions; [legends.spec.js](../tests/browser/legends.spec.js): grouped scales, missing swatches, domain changes, export; [axes.spec.js](../tests/browser/axes.spec.js): navigation/settings/reset | DPR 2 for guides and hit regions; add only a missing coordinate-specific rule/band case |
| R9 | [test_templates.py](../python/tests/test_templates.py): slots, rollback, independent instances/restrictions; [test_core.py](../python/tests/test_core.py): table/metadata/xarray/kernel/image adapters; [test_themes.py](../python/tests/test_themes.py); [test_animation.py](../python/tests/test_animation.py): clock restoration on success/frame failure and export | Simultaneous frame and restoration failure is a coverage gap if that cleanup changes; ordinary success tests do not prove it |
| R9 scene/protocol | [test_core.py](../python/tests/test_core.py): context rollback, resource snapshots, command completion/timeout, stale interaction sequences/generations and disposed-view events; [connect-protocol.test.js](../tests/unit/connect-protocol.test.js): mounted/forward references and decoding; [scene-scale-protocol.test.js](../tests/unit/scene-scale-protocol.test.js): scale-state boundary | Audit browser `applyState` rollback, late observer setup and disposal coverage before extraction; existing Python command tests alone do not cover browser transaction failure |
| R10 | [python-signatures.test.js](../tests/unit/python-signatures.test.js), [docs-reference.test.js](../tests/unit/docs-reference.test.js): generated/loader/docs-build rules; [providers.test.js](../tests/unit/providers.test.js): sharing, abort, 304, snapshots; [providers.spec.js](../tests/browser/providers.spec.js): drawn old result, failure, export, polling | Keep docs loading budget and both Python bundles; no rewrite of maintainer introduction/tutorial |
| R12/R13 | [time.test.js](../tests/unit/time.test.js), [force-kernel.test.js](../tests/unit/force-kernel.test.js): shared lowerBound consumers; [flyover.spec.js](../tests/browser/flyover.spec.js): momentum/settlement; [test_core.py](../python/tests/test_core.py): notebook/image adapters; [test_package.py](../python/tests/test_package.py): wheel contents | `npm run test:package`, signature/API checks, both notebook/standalone builds for moved worker/assets; use owning R5/R6/R8 gates for scan/picking/rule work |
| R18 settlement / preparation / disposal | [settle.test.js](../tests/unit/settle.test.js): inherited causes, continuous/superseded requests, rejected jobs, paused draws and late completion; [disposers.test.js](../tests/unit/disposers.test.js): ordered once-only release, retirement through writes/geometry and replaceable retained scope; [view-state.test.js](../tests/unit/view-state.test.js): dependency capture and serialized live writes | Reuse R6's typed producer/consumer and rendered churn gates. Shared upload registry/cause tracking must retain one owner; hot-path changes take paired comparisons |
| R18 drag / Partition settings | [lineage.test.js](../tests/unit/lineage.test.js), [drag-session.test.js](../tests/unit/drag-session.test.js): inversion, transform barriers and source resolution; [partition.test.js](../tests/unit/partition.test.js): local visibility and linked settings | [drag.spec.js](../tests/browser/drag.spec.js) and [partition.spec.js](../tests/browser/partition.spec.js): drawn edits; preserve new-group inheritance and removed-group subscriptions |
| R18 cycle / consolidation pilots | [axis-titles.test.js](../tests/unit/axis-titles.test.js), [reductions.test.js](../tests/unit/reductions.test.js): titles and ordered/grouped evaluation; [facet-fields.test.js](../tests/unit/facet-fields.test.js) and [facet-field-scales.test.js](../tests/unit/facet-field-scales.test.js): pair views/aliases; [compound-move.test.js](../tests/unit/compound-move.test.js): intentionally controlled composition surface | Import-graph evidence and package checks, plus [facet-variants.spec.js](../tests/browser/facet-variants.spec.js) for rendered pairs. Keep events/nearest/_pickable behavior through existing picking tests; do not add arrangement-only tests or bypass the compound boundary |
| R18 obsolete adapters / old link routine | [kernel-literals.test.js](../tests/unit/kernel-literals.test.js), [reductions.test.js](../tests/unit/reductions.test.js): use the current evaluator directly; [gpu-marks.test.js](../tests/unit/gpu-marks.test.js) and [geometry.test.js](../tests/unit/geometry.test.js): classify old reference coverage versus supported arrow/curve behavior | Audit package entries and current performance fingerprints; preserve historical result/source attribution. Use current rendered curves and leak checks before retiring numerical routines |
| R18 small boundaries worth keeping | [attribute-lifecycle.test.js](../tests/unit/attribute-lifecycle.test.js): idempotent GPU attribute release; [picking-material.test.js](../tests/unit/picking-material.test.js): point sizing/depth copies; [surfaceFrame.test.js](../tests/unit/surfaceFrame.test.js): prime new pipelines, not ordinary data changes; [extent-summary.test.js](../tests/unit/extent-summary.test.js): masked/cached extents and retained inputs | Relevant DPR-2 rendering cases for compatibility changes; share R5/124's backend boundary. File moves alone require import/package/checking parity |
| R18 scene / docs naming | [stable-props.test.js](../tests/unit/stable-props.test.js): bounded identity reuse; [export-closure.test.js](../tests/unit/export-closure.test.js): containing export targets; [docs-reference.test.js](../tests/unit/docs-reference.test.js): loaders/generated metadata | Use R9/R10's scene/provider/docs cases; both Python bundles for worker/asset moves. Keep per-prop reactivity and lazy plotting-runtime loading intact |

Density/Slice first-slice numerical and leak checks can run together with the existing
harness; the unrelated tests in the shared files need no new duplicate coverage:

```sh
LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test \
  tests/unit/density.test.js tests/unit/slice.test.js \
  tests/unit/padded-views.test.js tests/unit/kernel-literals.test.js \
  tests/unit/transform-work.test.js
```

Use the harness's existing retention rules; do not suppress a new imbalance as part of a
readability extraction. Record unrelated existing failures separately. Run only relevant
browser cases during a slice, and the repository's required broader local gates before
landing rendering work. This documentation pass runs no performance or behavioral suites.

## Verification and completion

Follow [TESTING.md](../TESTING.md), [CONTRIBUTING.md](../CONTRIBUTING.md), the test map and
performance gate above. The maintainer's local-gates waiver applies; no CI restoration is
required. Performance, leak and behavioral checks remain required locally.

- For prose/formatting changes, inspect the diff and use appropriate syntax/type checks;
  do not add tests that merely assert formatting or source arrangement.
- For contract changes, run `npm run check`, the area's existing format gate and behavioral
  tests, and the relevant leak checks. Extend coverage to newly checked modules and consumers.
- For public declarations, generation, or file moves, run signature/API/package checks as
  applicable and inspect generated diffs. Generated files remain generator-owned.
- For rendering/lifecycle changes, verify drawn output and completed frames with a fresh
  server where counters require it, DPR 2, and proper canvas-ready/settlement ordering.
- Any slice touching a listed per-frame path runs the explicit interleaved production
  Sunburst and Lorenz gate above; Slice/Interpolate changes also run moving-particles.
  Record plain timings separately from diagnostic captures and preserve historical accepted
  baselines so small regressions cannot accumulate unnoticed.
- Add focused failure cases for changed lifecycles: cancellation, supersession, failed
  preparation, failed publication/restoration, and teardown as relevant. Avoid duplicate tests
  of unchanged behavior or tests that only check that nothing throws.

Each slice's review should answer: What responsibility became simpler? Which duplicate or
implicit rule disappeared? Where is the state/resource owner? What changed for callers?
Can a reviewer follow the success and failure paths? Which checks demonstrate parity?

A package is complete when those answers are concrete, its temporary adapters are removed
or have a named remaining consumer/retirement condition, and the applicable gates pass.
Neither smaller files nor lower LOC alone establish completion. Larger readable code is
acceptable when the ownership, data flow, and valid states are clearer.
