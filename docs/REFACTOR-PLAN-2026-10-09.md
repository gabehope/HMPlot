# HMPlot combined refactor plan

**Codex-generated with maintainer design decisions; ratchet, performance-gate, leak-harness and
sequencing sections added by Claude (Claude Fable 5.1) on 2026-10-09**  
**Date:** October 9, 2026  
**Status:** P0–P7 (Stages 112–119) implemented 2026-10-09/10, except 115.2's second half;
P8 (Stage 120) deferred; P9 (Stage 121) done. See [Outcome](#outcome) at the end.  
**Reviewed baseline:** `380cdac76efb2024e8012bc0b1a08f63c5d3bbea`, plus the existing working-tree edits.

This plan combines [the Codex report](CODEX-MAINTAINABILITY-REVIEW-2026-10-09.md) and
the Claude report (CLAUDE_REVIEW.md, kept with the project record), including Claude's later cross-reference section.
It starts with verified correctness fixes, then establishes contracts that allow feature
workarounds to be retired in small changes. Public behavior changes are identified separately
from internal extraction.

The intended result is a library where column lifetime, update selection, frame ownership,
scene transactions, and component capabilities each have a clear owner. Existing specialized
GPU representations and rendering paths remain available under those contracts.

## Decisions made with the maintainer

| Decision | Chosen policy | Consequence for this plan |
|---|---|---|
| Compatibility | Documented breaking changes are allowed when they materially simplify the design. | Every break identifies affected callers, replacement behavior, and migration instructions. Permission to simplify is not a direction to delete every alias. |
| Sequence | Fix verified bugs first, then reach the larger architecture in small stages. | Separate correctness fixes, mechanical extraction, policy changes, and optimization into reviewable changes. |
| Frame promotion | Keep automatic promotion of one eligible top-level Frame. | Remove the legacy implementation while preserving coordinate, navigation, and brushing behavior. |
| HTML export scope | Both runtimes reject a target that omits a referenced component. | Python's automatic whole-scene fallback is deliberately removed. Errors direct callers to a containing Scene or other target containing the references. |
| Column ownership | Immediate reads borrow; longer work explicitly retains a releasable reference. | Replace ownership guessing with one borrowing/acquisition contract, migrated through a temporary adapter. |
| Rendering services | Migrate to typed view services and typed mark bindings in stages. | Keep one owner of state; temporary renderer/object fields delegate to it rather than becoming parallel stores. |
| Type checking | Expand strict checking incrementally around refactored contracts. | Check both sides of migrated boundaries; use TypeScript or checked JSDoc without requiring a repository-wide conversion. |
| Formatting | Format each migration area separately and enforce its formatting thereafter. | Keep mechanical formatting separate from behavior changes and exclude generated/vendor files. |
| Mark organization | Preserve useful layers and pilot colocation for Points and Rect after their boundaries are typed. | Use clearer, consistent names while keeping shared infrastructure and GPU implementations shared. |
| Gates | Every stage moves a measured number, and no rendering stage lands without CI. | Ratchet counts (below) are part of each stage's acceptance; CI must be running before P4 (as of 2026-10-09 GitHub Actions refuses jobs over account billing, so no commit since 2026-10-04 has been tested in CI). |

These choices resolve the material conflicts between the reports. Module names and method
signatures below describe intended responsibilities; implementation can refine them without
reopening these policies.

## Corrections and constraints on the combined backlog

- **Inspector metadata overrides are not all bugs.**
  [settings.test.js](../tests/unit/settings.test.js#L173) explicitly requires axis appearance
  to remain editable when `axes2d` is false and in 3D. Do not restore the old `axes2d` disabling
  rules or the obsolete help that tells users to enable 2D axes. Consolidate final intended
  descriptors and fix only independently established help or eligibility defects.
- **Graph layouts lack status subscriptions, not all settlement support.**
  [graphTransform.svelte](../src/lib/plot/graphTransform.svelte#L19) already exposes
  `whenSettled`, which the runtime awaits. Add coherent pending/error/mounted reporting
  without replacing that working settlement mechanism.
- **Renderer capabilities are partially typed already.** Extend and migrate the contracts in
  [internalTypes.ts](../src/lib/plot/utils/internalTypes.ts#L178); do not build an unrelated
  second services system or describe this as introducing types from scratch.
- **Root interaction masks already have a resource cache.** Their reads currently acquire
  references. Borrowing should reuse that cache instead of adding duplicate dense arrays to
  every data scope. Offsets, previous simulation state, and generated brush extents must also
  obey the new contract.
- **No in-repository caller does not prove a public method is dead.** `getAxes`, for example,
  is exported by [Plot](../src/lib/plot/plot.svelte#L51). Review package exports, component
  handles, generated declarations, dynamic consumers, and documented behavior before removal.
- **Equivalent-looking defaults need semantic checks.** `hasAxisOverride` stops at theme
  scopes, and coordinate radius defaults distinguish generated values from authored ones.
  Replacing them mechanically with `isExplicit` or a literal default can change behavior.
- **Static observations are not reproduced failures.** The resource rollback omissions,
  grid export traversal difference, and Dodge/Interaction wrapper concern need focused
  reproductions. If a concern is disproved, remove that proposed bug fix while retaining any
  independently justified contract cleanup.

## Target internal contracts

### Column reads and retained work

The final synchronous read operation, conceptually `scope.get(field)`, lends the current
representation. A borrower cannot dispose it or keep it beyond the synchronous evaluation in
which its producer revision and cache entry remain valid. It must acquire before an `await`,
queueing work, saving a callback input, or invoking an operation that may publish or evict.
JAX operations that consume inputs must receive the appropriate owned references, never
silently consume the scope's borrowed value.

A retained read, conceptually `acquireColumn(scope, field)`, returns `{ value, release }`.
Device arrays retain through `.ref`; dictionary columns retain their codes. Acquisition does
not copy GPU data, and each acquisition has one matching release on success, failure,
cancellation, or supersession. Holding a scope does not replace retaining its column: a live
scope can evict a virtual-column cache entry after an interaction revision.

This contract guarantees resource lifetime, not immutability of caller-owned host arrays.
Consumers needing fixed host contents explicitly capture them. Preserve current snapshot
behavior: ordinary columns and metadata are captured, while applicable interaction reads
remain live. Do not add automatic whole-column copies, eager category encoding, or compaction
just to determine ownership.

During migration, one acquired-read adapter understands the old ownership conventions.
Convert readers before changing producers. Delete `ownsResolved`, `virtualColumnsBorrowed`,
and `ownsVirtualColumn` only after all callers have migrated; the adapter must not become a
fourth permanent convention.

### Mark capabilities and update planning

Use the existing [markKinds.js](../src/lib/plot/utils/markKinds.js) for compact capabilities,
including directly writable channels, geometry writer family, and retained-payload needs.
A pure update planner computes dependency differences and request equivalence once, then
selects full preparation, static reuse, membership replacement, or field updates.

Specialized text, point, and rectangle writers remain in feature modules. The table selects
behavior rather than holding large callbacks or renderer state. Static reuse requires an
explicit capability plus complete invalidation checks; unchanged channel expressions alone
do not account for fonts, frames, inferred domains, refined geometry, or interactions.

The first planner preserves current eligibility and action ordering. Broader reuse is a
separate optimization. Animation descriptors, tweens, procedural time, and keyed transitions
remain distinct. Existing lifecycle machinery owns publication and cancellation; the planner
decides which payload needs work.

### View services and mark bindings

Create one typed services object per view, provided through a named Svelte context and passed
explicitly to noncomponent helpers. It groups existing owned capabilities such as navigation,
domain contributions, picking, clock access, diagnostics, and update coordination. A capability
is installed and removed with its owner. Offscreen/export helpers receive the relevant view
service explicitly; there is no process-global service registry.

Migrate one capability at a time. Legacy `renderer.plot*` access delegates to the same object
until its last consumer moves. Preserve mount timing, renderer replacement, owner-checked
cleanup, and existing settlement barriers. This stage does not introduce a new scheduler.

A typed mark binding identifies the accepted publication's interaction, row mapping, scale,
tooltip, endpoint, and export information. Provide explicit pickability instead of a fake
pointer handler. Picking/export that outlives publication retains the resources it needs;
changing the current binding does not dispose an in-flight consumer's data.

### Scene resources and prop bindings

`SceneResources` owns resource mutation, old/new references, version bookkeeping, rollback,
and retirement. The runtime owns tree mounting, settlement, and the success decision.
Distinguish preparation, provisional activation, acceptance, and rollback: today's `commit`
runs before settlement and must not be treated as irrevocable acceptance.

Scene prop binding remains isolated per property. Extract the current equality/cell/Proxy
machinery first. Then derive identity from serialized descriptors, resource revisions,
mounted-reference revisions, and input dependencies. Preserve callback freshness, missing
property reads, host values, and pending inputs. Descriptor identity alone is insufficient.

### Metadata authorities

Keep separate authoritative contracts connected by stable component and setting names.
Avoid a universal registry that owns types, UI, renderer behavior, and executable validation.

| Authority | Responsibility |
|---|---|
| `publicTypes.ts` and `index.ts` | Public types and exported components |
| `scene/options.json` | Public metadata, component roles, property input semantics, and positional-argument declarations |
| `markKinds.js` | Primitive renderer capabilities; compound public marks need not have their own renderer entry |
| Inspector descriptors | Final labels, groups, help, editor adapters, and edit eligibility |
| Coordinate and feature modules | Executable validation and context-dependent defaults |
| A normalized generator model | Join and validate maintained inputs before emitting registries, types, and reference metadata |
| Python feature modules | Property normalization, component validation, and scene-context validation |

Represent input-string interpretation separately from whether an expression stays deferred
or folds to a plain value. Current `stringReads` participates in both decisions. Internal
inspector settings never become accepted scene/Python props just because they have descriptors.

## Type checking, formatting, and organization across stages

The existing `npm run check` runs Svelte checking and a strict internal TypeScript project.
The repository-wide configuration still has `strict: false` and `checkJs: false`; selected
JavaScript modules opt in with `@ts-check`. Extend this foundation as each contract migrates.
Prioritize resource transactions in P3, borrowed/acquired columns in P4, view services and
component handles in P5, and planner inputs/results and feature controllers in P6.

Use TypeScript for new internal modules where appropriate and checked JSDoc for JavaScript
that benefits from remaining JavaScript. Add migrated modules to the strict checking scope,
and ensure their producers and consumers are actually checked. Svelte component boundaries
need Svelte-aware checking; adding only a supporting interface to `tsconfig.internal.json`
does not establish strict coverage of the component. Replace `$state<any>()` handles and
untyped callbacks in migrated components with concrete contracts. Use discriminated unions
where states or planner actions have different valid payloads, and narrow external unknown
values at their boundary. Do not achieve a clean check by adding broad casts, `any`, or blanket
suppressions. Document unavoidable third-party typing exceptions locally.

For each slice, record the newly checked modules and boundaries and keep that coverage in CI.
Types describe the ownership API but do not prove correct reference counting, cancellation,
or GPU disposal; retain the behavioral and lifecycle gates in the relevant stage. A global
strictness switch or wholesale language conversion is not a prerequisite for correctness fixes.

Prettier is already configured. A read-only sample check found formatting differences in all
five inspected files: `bound/rect.svelte`, `bound/namedMark.svelte`,
`marks/scatterPoints.svelte`, `objects/scatter.js`, and `utils/markPreparation.js` under
`src/lib/plot`. This is a sample, not a repository-wide formatting inventory. Before substantive
work on an area, land its formatting in a separate mechanical commit or pull request. Add a
nonmutating formatting-check command and CI coverage for the formatted areas, expanding the
scope as migration proceeds. Audit `.prettierignore` against all generated outputs, vendor
code, and build artifacts; do not hand-format generated files or rewrite the maintainer's
introduction/tutorial. Formatting, file moves, and behavior changes remain distinct slices.

The current public-wrapper, shared-binding, rendering-component, and GPU-object layers serve
different purposes. Keep those responsibilities explicit. Colocate files used only by one
mark or a related mark family when that improves navigation; keep shared binding, lifecycle,
and GPU infrastructure in shared modules. P6e pilots this organization rather than imposing
a separate directory and duplicate implementation for every public mark.

## Ratchet metrics

The plan introduces at least five temporary bridges (the acquired-read adapter, delegating
`renderer.plot*` fields, the legacy frame during P7, the extracted prop-binding machinery, and
the old status copies). It names the danger that one becomes permanent but, before this
section, had no mechanism against it other than P9's audit. The mechanism is a ratchet: a unit
test, `tests/unit/refactor-ratchet.test.js`, that counts each proxy for a band-aid and fails when
a count rises above the value recorded in the test. A stage that retires a mechanism lowers the
recorded value in the same change. P9 asserts the values that must reach zero.

| Metric (counted over `src/lib` by `tests/unit/refactor-ratchet.test.js`) | 2026-10-09 | Must fall in | Target |
|---|---:|---|---:|
| Lines naming `ownsResolved`, `virtualColumnsBorrowed`, `ownsVirtualColumn` | 32 | P4b | 0 |
| Distinct `renderer.plot*` properties, declared, defined, read or written, through any name (since Stage 121.1; before, `renderer.plot*` outside the view-services module) | 51 | P5a | 0 |
| Ad-hoc fields assigned on the mark object by `namedMark` (distinct `mark.<field> =`) | 17 | P5b | 0 |
| Kind checks (`kind ===`/`!==` a mark name, `.includes(kind)`, `.has(kind)`) in `namedMark`, `namedData`, `mapping.js`, `proceduralChannels.js`, `binding/preparationDependencies.js` (formerly `liveGeometry.js`; and, since Stage 118.1, `markUpdatePlan.js`) | 79 | P6a, P6d | small, named allowlist |
| `kind === "Text"` checks in `canWriteLive`/`canReuseStaticText` (in `markUpdatePlan.js` since Stage 118.1; `canReuseStatic` since 118.2) | 8 | P6a | 0 |
| Lines in `plot/bound/namedMark.svelte` | 2,157 | P6b–P6d | about 1,000 (about 1,770 once formatted) |
| Lines of `plot/axis.svelte` naming its `legacy`/`legacyProps` props | 15 | P7c | 0 |
| Files importing `pendingRootContent` | 10 | P7c | 2 (Plot, Frame) |
| Components writing their own status `subscribe` | 9 | P1b | 1 helper |
| Cache fields `disposeTransformCache` reads | 11 | P2c | 0 |
| Files importing `evaluateTransientExpression` under another name | 12 | P4c | 0 |
| Strictly checked modules (`tsconfig.internal.json` files plus `// @ts-check`, counted once) | 10 | every contract stage | rises only |

The first draft of this table (2026-10-09, Claude) recorded 50, 56, 11, 10 and 13 for five of these rows; Stage 112 replaced them with the test's precise definitions. The kind count now includes `!==` and `.has(kind)` checks; `pendingRootContent`'s defining module is not an importer; the three `@ts-check` files are already in `tsconfig.internal.json`. Formatting a file moves its line-based counts: the mechanical formatting commit for an area re-records them.

Stage 121.1 made the `renderer.plot*` count honest. It had matched `renderer.plot*` only, so a
field reached through another name (`active.plotMounting`, `view.plotTime`, a defined
property's string key) or only declared on `PlotRenderer` did not count, and the view-services
module was exempt for adapters it no longer has. It now counts every plot-prefixed property name
in `src/lib`, as a member access, a string key or a declared member, except the ones the test's
`NOT_RENDERER` table names with what carries them (a camera's `plotRect`, a drawn object's
`plotBasemap`, the controllers' `plotOptions`, ...); a companion test fails when such a name
appears on a renderer or no longer appears at all. The re-measured baseline was 20, not 19:
`plotTimeFrozen`, defined by `attachClockScope` with `Object.defineProperty`, was never counted.
The same stage then moved the 20 into the view's services, reaching the target of 0:
`lifecycle` (preparations, geometry queue, mount cause, render hold, drawable, device loss,
completed frames and their callbacks, geometry busy), `clock` (scope, time, holds, busy),
`drawing` (the drawn revision, surface textures, the Overview's frame capability) and `credits`
(with viewCore's change capability). `PlotRenderer` is now three's renderer with no fields added.

Stage 119.3 (P7c) left the `pendingRootContent` count at 10. Each importer (Provider,
ConstantData, Transform, VectorTile, Force, Tree, GraphTransform, GraphData, Nodes, Edges) is a
wrapper that mounts its children after asynchronous work, and its slot is what keeps the Plot
from promoting a sibling Frame before those children register: the barrier enforces logical
ownership, and the frame model cannot see children that have not mounted. Moving the call into a
shared helper would lower the count without moving the barrier. The count falls only when a
wrapper stops deferring its children (or the content registry learns of pending children some
other way); until then 10 is the justified value.

Stage 118.5 (P6d) left 46 kind checks, all named in the ratchet test's `KIND_ALLOWLIST` with
their reasons (22 entries). Eighteen became capabilities, each proven to give the same outcome
for every kind in the table: `gridTable`, `regions` and `strokeWidth` are new; the others read
`rows`, `points`, `symbols`, `curves` and `series`. What stays is one kind's own behavior: a
categorical Heatmap's image, an Image's RGB data, a Ribbon's x-only brush, Text's label
footprints and fonts, each uncertainty mark's validation. No check moved behind a wrapper; the
allowlist test fails on a new kind check until it becomes a capability or names its reason.

Counts are a proxy, not the goal: a stage that lowers a count by moving the same code behind a
wrapper has not earned the reduction, and review should say so. Stages that add a temporary
adapter also add its own count to the table, with the stage that retires it.

## Performance regression checks

The "Performance gates" paragraph below says what to compare but not how. This section fixes
the scenarios, metrics, tolerances and cadence, built on the harnesses the repository already
has. The lesson from the 2026-10-08 investigation applies throughout: dev-server profiles
overstate CPU by about a third (lowered private fields, Svelte dev stack capture), so gates
run against a production build (`npm run build` then `vite preview`), with the dev server used
only for attribution.

**Scenarios** (three runs each, after one warm-up; report the median and the spread):

| Scenario | Harness | Why it is in the gate |
|---|---|---|
| Sunburst zoom/reset pairs (`/examples/sunburst`) | `tests/perf/investigations/sunburst-profile.mjs` (`SUNBURST_CPU=1`, then `SUNBURST_PROFILE=1`) | live Text, Tree layout, tweens, automatic bounds: the P6 planner's main case |
| Lorenz steady animation (`/examples/lorenz-attractor`) | a steady-state driver checked in during P0 (the session script used on 2026-10-08 timed GPU passes with `timestamp-query` and sampled CPU; it is not in the repository) | Simulate republishing every step: full preparation per frame, keyed rows, three canvases |
| Brush gesture churn | `tests/perf/gesture-churn.spec.js`, `transform-churn.spec.js` (`PERF=1`, `playwright.perf.config.js`) | padded views, mask swaps, compiled filters: the P4 ownership change's main case |
| Force drag | `tests/perf/force-drag.spec.js` | layout publication and drag through the P5 services |
| Docs loading budget | `npm run check:docs-budget` | already a budget; keep it in the gate |

**Metrics per scenario:** active main-thread CPU per frame (sampled, idle excluded), frame
interval p50 and p95, completed frames per gesture, GPU queue submits and readbacks per frame,
GPU pass time per frame where the driver records it, shader and pipeline builds during the
warmed gesture (expected 0), peak and settled retained GPU bytes, and `plotMarkPreparations`
and `plotLiveFieldUpdates` per gesture. The last two are the direct measure of P6: a planner
that chooses full preparation where today's code writes live has regressed even if frame times
hold on this machine.

**Baseline (production build, Apple M2 Max, Chrome 154, headless, DPR 2, 2026-10-08):**
Sunburst zoom about 4.6 ms CPU per frame during motion, frame p95 about 18 ms, 13.8 submits and
1.2 readbacks per frame, about 0.4 ms GPU per frame; Lorenz about 6.6 ms CPU per frame after the
row-token fix (16.3 before it), about 2.75 ms GPU per frame, all three canvases drawn every
frame. Three runs of the Sunburst CPU measure spread by about 0.3 ms per frame, so a tolerance
tighter than 5% is noise. P0 re-measures these on the baseline commit with the checked-in
drivers and records the results under `tests/perf/investigations/results/refactor-baseline.json`
with the commit, browser version and machine; every later comparison cites that file.

**Tolerances:** a slice fails its gate when, against the baseline on the same machine and
browser, median CPU per frame or frame p95 worsens by more than 10% or twice the observed
spread (whichever is larger), completed frames per gesture fall, warmed shader builds become
nonzero, readbacks per frame rise, retained bytes rise after settlement, or full preparations
replace live writes in a scenario that previously wrote live. A slice that improves a number
updates the baseline file in the same change so the next slice is held to it.

**Cadence:** the full gate runs for every slice of P4, P5, P6 and P7 and for P2d; the Sunburst
and gesture-churn scenarios alone suffice for P2 and P3. Record results in the pull request,
including runs that show no change. Measurements are taken with no other suite, build or
browser profiling running, as TESTING.md requires.

## Leak and double-dispose harness

P4 changes who releases jax-js arrays. Its failures are silent: a borrowed array consumed by an
operation, or released twice, corrupts a later read rather than throwing, and the named unit
tests assert `refCount` in only a few places. Before migrating readers in P4a, add a test helper
that wraps `Array.prototype.ref` and `dispose` for the duration of a test, records every
acquisition and release with its stack, and fails the test when the balance is nonzero at the
end or when `dispose` runs on an array whose count is already zero. Apply it to `data.test.js`,
`padded-views.test.js`, `simulate.test.js`, `reductions.test.js`, `interaction.test.js` and
`connection-prepare.test.js` first, on the baseline, and record which of them already report an
imbalance (an existing leak is a P1 finding, not a P4 regression). The planner extraction in
P6a and the services migration in P5a use the same harness for the preparation and publication
paths.

## Stages and dependencies

Tracked in TODO as Stages 112–121 (112 = P0 … 121 = P9). Stages are work packages, not single large pull requests. Lettered slices below are intended
to land independently. The order prioritizes correctness while allowing independent work.

| Stage | Outcome | Required predecessors |
|---|---|---|
| P0 | Reproducible baseline, behavior inventory, and checking/formatting scope | None |
| P1 | Confirmed correctness fixes and consistent status reporting | P0 |
| P2 | Consolidated metadata, cache cleanup, and safe local cleanup | P1 |
| P3 | Resource transactions, prop bindings, export rules, Python handlers | P1; relevant metadata from P2 where used |
| P4 | Column ownership, transform dependencies, and expression boundaries | P1; cache helper from P2 where used |
| P5 | Typed view services and accepted mark bindings | P1 |
| P6 | One mark-update planner, feature controllers, and mark-organization pilot | Relevant P2, P4, and P5 contracts; pure admission extraction can start earlier |
| P7 | Ordinary root frame and unified coordinate ownership | P2 axis descriptors, P5 services, P6 domain publication boundary |
| P8 | Docs build coordinator | P1; independent of rendering work |
| P9 | Adapter retirement, migration documentation, and integration verification | All selected stages |

P3, P4, P5, and P8 can proceed in parallel when file ownership does not conflict. Do not run
browser suites while another change edits the shared working tree. Use separate checkouts
when concurrent implementation or verification requires it.

Three sequencing adjustments (Claude, 2026-10-09):

- **Start P6a right after P1.** The pure planner extraction (request equivalence plus the
  current admission rules, with node tests) depends on no other stage, and it is what makes
  `namedMark` testable; everything from P5b onward is safer with it in place. The table's P6
  predecessors apply to P6b–P6e, not to P6a.
- **Do the cheap band-aid reversals in P2.** Binding Simulate's `@dt` as a runtime parameter and
  then removing the int32 widening exception (listed under P4c), replacing `__kind` with an
  argument, and collapsing `_domains`/`_autoBounds` into one flag (listed under P6d) are each a
  few dozen lines with unit coverage, and they lower ratchet counts early. Keep the equivalence
  evidence P4c asks for; only the timing moves.
- **Defer P8.** The docs build coordinator is tooling with no library benefit and competes for
  the same attention as P4–P7. Schedule it after P7, or drop it if the dev server's current
  behavior is acceptable.

## P0 Establish the baseline

**Work.** Record the starting commit and existing local changes. Inventory exposed component
methods and generated API surfaces. Select representative cases covering live updates, Text,
Filter membership, Simulate, nested/embedded frames, connections, scene retry, and offline
exports. Record existing failing checks separately from new failures.

Inventory strict-check coverage, unchecked component handles, formatting drift in the first
migration areas, and generated-file exclusions. Establish the initial formatting-check scope
and how each later slice expands it. Record the current Points and Rect dependency paths for
the P6e organization pilot, including shared Prism and polar rendering implementations.

Restore CI before anything else: GitHub Actions has refused every job since 2026-10-04 over
account billing, so the baseline commit itself has not run in CI. Then add the ratchet test with
the counts above, check in the performance drivers the gate needs (a steady-state driver for
Lorenz with GPU timestamp queries, alongside `sunburst-profile.mjs`), record the performance
baseline file, and run the leak harness on the baseline to separate existing imbalances from
later regressions.

Reproduce the reported correctness issues with focused checks before assigning bug status.
The Python mark-list discrepancy has been confirmed statically; the review itself did not run
the construction/validation regression. Establish settings behavior from current tests,
rendered results, and intended coordinate semantics rather than the superseded descriptor
tables.

**Done when.** Each proposed correctness fix has an observable failing case or a precisely
defined missing contract, and the later stages have named parity cases. CI runs the unit,
Python, type and ratchet checks on the baseline commit; `refactor-baseline.json` exists with
three-run spreads; the leak harness's baseline report is recorded.
Running `npm test` invokes its documentation pretest hook; account for any generated changes
instead of mixing them into a refactor accidentally.

## P1 Correctness and component status

**P1a — Mark containment.** Replace Python's hand-maintained containment mark list with the
generated public mark inventory, retaining light/presentation rules and detached-template
behavior. Cover the 15 omitted kinds and representative valid compound marks. Evaluate
Flow/Routes classification separately; sharing a mark option set is not proof of mark roles.

**P1b — Status contract.** Extract a small status subscription helper and use it for DAG,
Sankey, Pack, and Treemap. Define immediate subscription delivery, pending/error/mounted
states, and teardown. Migrate the existing copies incrementally. Keep `whenSettled` and
cause-based preparation rules in their current owners. Do not begin with a generic async
component framework.

**P1c — Reproduce resource hazards.** Exercise failed scene application after themes,
offsets, selections, constraints, and their versions change, followed by retry. Reproduce
grid references during HTML export and the reported Dodge/Interaction wrapper composition.
Land bounded fixes for established failures before the corresponding large extraction.
For rollback, place the first snapshot/restore helper in the resource layer so P3 can extend
it instead of adding another runtime-side list.

**Acceptance.** Invalid containment fails with an actionable component error; valid scenes
still build. Layout statuses reflect work and teardown while settlement still resolves.
Reproduced resource failures leave the previous scene usable and allow retry. Any disproved
bug claim is removed from the implementation backlog.

**Checks.** `python/tests/test_core.py`, `test_graph_composition.py`,
`tests/browser/python-commands.spec.js`, `tests/unit/scene-scale-protocol.test.js`,
and the affected graph/interaction/export fixtures. Test fixes by behavior, not by searching
for particular source strings.

## P2 Consolidate maintained metadata and small ownership seams

**P2a — Inspector descriptors.** Start with axis settings. Replace old declarations plus
late overrides with one final descriptor per canonical setting. Keep coordinate terminology
as contextual presentation and coordinate editing as an adapter. Preserve editable hidden
axis appearance, 3D behavior, parent-coordinate ranges, mapped channels, reset, and default
provenance. An accidental duplicate setting ID should fail rather than overwrite silently.

**P2b — API semantic model.** Build a normalized model before Python annotation rendering.
Declare input-string and expression-folding semantics explicitly; first preserve current
generated behavior. Investigate missing `Shift.field` handling as a separate correction.
Generate narrow input/input-context/layout/positional-role projections, replacing one
duplicated list at a time. Reuse existing maintained enum definitions where applicable.
Generate shared error templates only where semantics truly match; do not create a general
cross-language validation language.

**P2c — Cache owners.** Introduce a small cache-entry disposal registration and migrate
FromEdges first. Preserve its cache keys and output retention. Migrate other entries only
after the pilot proves that outputs can outlive the cache. Generic cleanup stops traversing
private transform layouts as each entry migrates.

**P2d — Audited local cleanup.** Remove truly internal unused symbols; consolidate exact
duplicates such as texture-resolution normalization and equivalent request predicates.
Check consume/borrow semantics before merging array utilities. Update source-text-coupled
tests to assert exported behavior. Public aliases enter P9's migration inventory rather than
being deleted because grep found no application call sites.

**Acceptance.** Final inspector behavior is preserved with no duplicate definitions; Python
annotation formatting cannot change input interpretation; accepted prop sets do not acquire
internal names; retained transform outputs survive cleanup. No sweeping capability or default
rewrite is bundled into these changes.

**Checks.** `settings.test.js`, `settings.spec.js`, `python-signatures.test.js`, generation
checks, `graph-data.test.js`, and `transform-caches.test.js`. Inspect generated diffs.

## P3 Strengthen the scene and Python boundary

**P3a — Resource transaction lifecycle.** Extend the P1 resource helper into preparation,
activation, acceptance, rollback, and retirement. Include in-place resource mutations and
version maps, not only map references. Retain old pooled resources through settlement.
Deduplicate brush-constraint restoration with an owner resolver covering tables and standalone
identities. Preserve pending local interaction conflict rules and resource identities.

**P3b — Prop binding.** Extract current stabilization and per-prop reactive isolation unchanged.
Then introduce descriptor structural sharing at ingestion and dependency-based per-prop
resolution. Cover resource changes, late-mounted `$ref` targets, input contexts, removed
properties, callbacks, and host values. Remove bounded deep comparison only where the new
dependency contract supplies equivalent behavior; identify any retained fallback explicitly.

**P3c — Export graph and scope policy.** Establish common Python/JS fixtures for dependency
closure, including grid coordinates, identities, selections, scale normalizations, and node
references. Separate traversal from browser camera/provider/tile/interaction capture.
In a distinct behavior-change slice, make Python match the browser's strict subtree rule.
The error identifies the missing reference and directs callers to an export target containing
it. Add a migration example showing how to export the enclosing Scene. Do not implement
automatic dependency expansion.

**P3d — Python handlers.** Extract one cohesive feature, such as GraphData or Provider, from
`Node._set` and scene validation. Establish normalization, full-component validation, and
scene-context validation stages, preserving their order. Core keeps tree ownership,
transactions, and generic name conversion. Extract bridge message families separately if
doing so reduces the same feature coupling.

**Acceptance.** Failed activation/settlement restores state and permits retry without pooled
resource leaks. Unrelated inputs do not restart Force or reconfigure Frames, including large
arrays/deep descriptors. Equivalent export inputs retain equivalent resources; both languages
reject incomplete targets. Python/browser-originated edits normalize consistently.

**Checks.** `python-commands.spec.js`, `scene-scale-protocol.test.js`, paired controls in
`examples.spec.js`, `python/tests/test_core.py`, `test_connections.py`,
`test_api_consistency.py`, and provider/vector-tile export specs with current Python bundles.

## P4 Normalize data reads and expression dependencies

**P4a — Acquired-read adapter.** The leak harness (above) is in place and green on the
named unit files before any reader migrates. Add one adapter for existing mixed ownership,
honoring per-field overrides including Simulate `prev()`. Migrate eager evaluation and expression
planning first, then async preparations, cached outputs, and queued writes. This changes
ownership handling before changing the meaning of provider getters.

**P4b — Borrowed producers and views.** Convert root virtual accessors, Simulate overlays,
offset/interaction resources, and generated brush extents to the final borrowed contract.
Reuse existing resource caches. Migrate projected/connector reads, then remove the old flags
and compatibility adapter. Separately consolidate physical/prefixed/snapshot/connector
projection behavior. Define typed view metadata/options instead of ad-hoc property copying;
graph-specific decoration uses an internal extension hook rather than a core graph import.
Preserve provenance, row representation, and live interaction behavior.

**P4c — Expression boundary.** Separate compiler-semantic metadata from descriptive metadata,
keeping unclassified cases conservative until eager/compiled equivalence is established.
Split planner stages where it clarifies normalization, binding, and execution. Make evaluator
ownership and compilation policy explicit at call sites: stop importing transient compilation
under the eager evaluator's name. Preserve each caller's execution policy during this rename;
subsequent policy changes require measured or behavioral justification.

Bind Simulate `@dt` through the existing runtime-parameter mechanism. Remove the interaction
int32 widening exception only after value, dtype, and fallback cases demonstrate equivalence,
including other scalar/int32 combinations. Do not weaken type checks to force compilation.

**P4d — Transform dependency declarations.** Each definition declares expressions, direct
field reads, and direct resource reads from effective settings. One analyzer derives
interaction, time, and pointer subscriptions, deduplicating resources and releasing replaced
subscriptions. Pilot Calculate, Filter, and Bin/Hexbin. Keep numeric parameter validation,
tween ownership, and shared facet-bin policy separate. Do not overload the existing `reads`
field, which describes physical/visible/compacted row form.

Slice and Interpolate can use this dependency contract before migrating publication plumbing
to the runner. Layouts publishing node/edge pairs retain a distinct layout publication helper;
they are not forced into a one-table transform interface.

**Acceptance.** Borrowed values are never accidentally consumed or disposed; acquired values
survive revision eviction and release after supersession. Retaining a scope is not mistaken
for pinning every column. Metadata changes preserve values/types/results; harmless descriptive
changes do not select a different numerical path. Updating a transform's resource dependency
unsubscribes the old resource and subscribes the new one without waking on unrelated changes.

**Checks.** `data.test.js`, `simulate.test.js`, `reductions.test.js`, `interaction.test.js`,
`padded-views.test.js`, `connection-prepare.test.js`, `view-state.test.js`,
`transform-contract.test.js`, and affected live/filter browser specs. Check retained memory,
uploads, and frame progress in the representative live cases.

## P5 Migrate view services and mark bindings

**P5a — Service adapters.** Create the typed view-service owner from existing contracts.
Migrate errors/diagnostics first, then navigation/pointer access, domain contribution, and
picking/export coordination in separate slices. Keep renderer fields as delegating adapters
only during migration. Owner disposal must not clear a replacement owner's capability.

Route Force and mark domain contributions through the domain service; preserve intentional
explicit bounds behavior and root/facet ownership. Do not simply rename three competing
domain paths. The later frame stage supplies one final ownership model.

**P5b — Accepted mark binding.** Publish typed interaction/tooltip/endpoint/scale/export
metadata together with accepted mark data. Migrate readers one family at a time. Replace
`INTERNAL_POINTER_MOVE` with explicit pickability. Preserve event ordering, old-publication
resource retention, and exact/tolerant picking behavior.

**Acceptance.** Each migrated capability has one mutable owner, and adapter removal leaves
no duplicated state. Teardown, mode switches, export, nested/faceted rendering, and in-flight
picks work across replacement. Existing animation/update barriers retain their meanings.

**Checks.** `settle.test.js`, `animation.test.js`, disposal tests, interaction/connection
browser specs, export specs, and the affected frame/Force cases. These are lifecycle changes;
types alone are not sufficient evidence.

## P6 Consolidate mark decisions and feature controllers

**P6a — Planner and capabilities.** Extract request equivalence and current admission rules
into a pure planner. Compute dependency changes once. Add only capabilities that express
actual shared decisions, preserving eligibility and precedence. Route the Points hover path
through the planner after parity is established. Static reuse remains opt-in until all
invalidation inputs for another mark family are covered.

**P6b — Feature controllers.** Extract tooltip membership, feedback-opacity calculation,
endpoint registration, and domain publication behind small contracts using the accepted
binding. Consolidate repeated cancellation loops only where they share publication policy.
Replace `retainCurrentScope` disposal wrapping with the prepared entry's ownership mechanism
once its changing retained reference has an explicit owner.

**P6c — Dodge and layout context.** Put Dodge's camera-dependent placement, claim, and
retirement behavior in a controller reached through a named context. Remove `scope.dodge`
only after wrappers and descendants use that context. Preserve placement bounds, offsets,
connections, and camera updates. Reuse small layout publication/status helpers across graph
layouts without moving renderer policy onto ordinary data tables.

**P6d — Remove converged special cases.** Replace proven-equivalent kind lists with
capabilities, replace `__kind` transport with an explicit argument, and unify the internal
"does not contribute domains" policy. Standardize raw-mark access through the existing
component boundary. Consolidate field/flag assignment helpers where semantics match.

Extract view pointer geometry, description generation, presentation options, and shared
settings/export chrome when their service dependencies are clear. Treat these as independent
mechanical slices; do not move broad ambient state into opaque controllers.

**P6e — Mark-organization pilot.** After the relevant P5 bindings/handles and P6 controller
boundaries are typed, trace Points and Rect from their public exports through binding,
rendering, and GPU implementation. Colocate mark-specific pieces and replace ambiguous
`bound`/`marks` naming in the pilot with names that describe the layers. Use consistent public
mark terminology such as Points. Keep `namedMark`'s shared responsibilities and shared GPU
families outside per-mark folders: Cartesian Rect reuses Prism, while polar Rect selects a
different implementation. Do not duplicate those implementations to fit a directory pattern.

Make path moves and import updates a mechanical slice after extraction, preserving public
entry points and component behavior. Check the generator's source-path assumptions, package
exports, tests, and any documented imports. Document the resulting dependency direction and
where to change public props, binding policy, render effects, and GPU geometry/materials.
Expand to other families only if the pilot makes those responsibilities easier to locate
without new cycles, forwarding layers, or duplication. If colocation offers no practical
benefit, retain the useful separation and apply only the clearer naming and documentation.

**Acceptance.** Equivalent updates choose equivalent work; rejected or superseded writes do
not advance accepted state. No stale labels, bounds, pick maps, or exports appear. Text atlas
reuse, membership updates, retained buffers, and completed-frame progress remain intact.
Distinct animation mechanisms stay distinct. Migrated planner/controller/component boundaries
are checked without broad `any` escape hatches. The organization pilot preserves shared
implementations and public entry points, with a documented path from each pilot mark to its
implementation and no new dependency cycles.

**Checks.** `mark-kinds.test.js`, `view-state.test.js`, `tooltip.test.js`,
`connection-prepare.test.js`, `tween-pipeline.spec.js`, `label-options.spec.js`,
`padded-marks.spec.js`, `fonts.spec.js`, Dodge fixtures, and affected interaction/export specs.
For the organization pilot, also run type checks, Python-signature and API checks, and package
consumer checks; inspect regenerated diffs for unintended public changes.

## P7 Unify frame ownership and remove the legacy Axis

**P7a — Effective ownership.** Centralize root selection, parentage, and per-dimension
ownership in one internal frame model. Keep the current component tree initially. Preserve
pending child registration and explicit Plot domains inherited by a promoted Frame.

**P7b — Ordinary root frame.** Make Plot's default coordinate root use the same frame
implementation as explicit frames. Preserve automatic promotion, sibling roots, ranged and
placed frames, and embedded facets. Remove duplicate validation, category subscriptions,
domain routing, and guide/default application as their consumers migrate.

**P7c — Retire the bridge.** Remove `legacy`, `legacyProps`, and duplicate root state when
the ordinary model covers their behavior. Keep logical ownership independent of DOM/mount
order; do not delete pending-root barriers merely because the registry gets smaller.
Migrate frame settings and navigation to the same model. Preserve distinctions between
theme defaults, generated coordinate defaults, and authored values.

**Acceptance.** Direct marks, a single promoted Frame, sibling/twin axes, asynchronous
wrappers, nested nonlinear/anchored frames, and embedded facets preserve domains, guides,
navigation, brushing, picking, and export. Root replacement cancels stale gestures correctly.

**Checks.** `root-frame-selection.test.js`, `frames.test.js`, `frame-mapping.test.js`,
`nested-frames.spec.js`, `frame-cells.spec.js`, `frame-brush.spec.js`,
`frame-marks.spec.js`, settings tests, and 3D/projection/export coverage. Use the support matrix
in [FRAME-IMPLEMENTATION.md](FRAME-IMPLEMENTATION.md) as a behavior constraint.

## P8 Isolate docs build coordination

**P8a — Coordinator extraction.** Move per-server scheduling, request waiters, invalidation,
priorities, and capture ordering out of the Vite adapter. Keep the current process protocol
initially. Provide explicit shutdown behavior for timers, subprocesses, and pending requests.

**P8b — Process protocol.** Replace parsing human log text with structured progress events
shared by example builds and thumbnail capture. Isolate or replace the `.priority` channel
and global thumbnail hook through explicit adapters. A minimal hook may remain if Vite's
server-module boundary requires it, but it must not own scheduler state.

**Acceptance.** Existing assets serve immediately; missing assets wait for their own job;
new examples and invalidation during builds work; captures stay serialized; failures and
shutdown resolve or fail waiters deterministically. Production and CI behavior remain clear.

**Checks.** The coordinator simulation in `docs-reference.test.js`, with targeted subprocess
failure and teardown coverage, plus docs loading/preview checks. No rendering-library changes
are bundled into this stage.

## P9 Remove temporary bridges and finish migration

Every temporary adapter introduced above has a named retirement condition: all callers use
the new contract, behavior gates pass, and the old path has no remaining legitimate owner.
Remove adapters in the stage that meets that condition rather than keeping all cleanup until
the end. P9 verifies that none were accidentally left as permanent parallel mechanisms.

Inventory public changes separately from internal removals. The agreed HTML export policy
change needs a migration example. Fixing invalid containment also changes previously accepted
inputs and should be noted. Evaluate `getAxes` to `getFrames` canonicalization only if it
removes a meaningful compatibility layer; `getSurface` and other handles need an established
replacement or a justified removal statement. No public method is designated for deletion
solely by this plan.

For each public change, update maintained declarations and reference documentation, regenerate
Python artifacts and the API report, inspect the diff, and add a CHANGELOG entry. Keep
JavaScript camelCase and Python snake_case. Update architecture documents to describe the
final contracts. Do not rewrite the maintainer's introduction or tutorial.

Audit the cumulative strict-check and formatting scopes against the modules migrated in each
stage. Keep both gates in CI, document remaining unchecked areas and justified typing
exceptions, and verify that generated files remain excluded from hand-formatting. Record the
mark-organization pilot's outcome and apply its convention only to families where it fits.

**Done when.** All selected stages have their acceptance evidence, the ratchet test's
targets in the table above are reached or each shortfall is justified in this document,
temporary paths are gone or explicitly justified, release notes name behavior changes, and the required integration
checks pass against the final source. Report any pre-existing failures separately; do not
present them as successful validation.

## Verification and stop conditions

Follow [TESTING.md](../TESTING.md) and [CONTRIBUTING.md](../CONTRIBUTING.md). Run focused tests
during each slice, then the required broader suites before a rendering pull request. Start
a fresh dev server when counting builds/compiles, use DPR 2 for visual checks, wait for all
canvases to leave `aria-busy` before settlement, and assert completed frames for live work.
Use current Python bundles for tests that depend on them.

Run `npm run check` for each contract migration and the nonmutating formatting gate for its
covered files. Formatting-only slices need diff inspection and appropriate syntax/type
validation, not new behavioral tests. File moves additionally need import, generation, and
package verification; rendering behavior changes retain the full relevant rendering gates.

Compare observable output and meaningful resource/performance counters. Do not declare a
refactor successful merely because lines moved, a predicate was centralized, or no exception
was thrown. Stop broadening a slice when it changes unrelated semantics; split the next
behavior change into its own slice. If an optimization cannot establish complete invalidation
or ownership, retain the conservative path and record why.

Performance gates compare matched scenarios against P0 on the same environment; the
scenarios, metrics, baseline, tolerances and cadence are fixed in "Performance regression
checks" above. No arbitrary speedup target or line-removal target is part of this plan; the
ratchet counts measure retirement of mechanisms, not lines.

## Coverage of the two reports

| Source finding | Planned home |
|---|---|
| Codex R1 mark updates | P2d, P5b, P6 |
| Codex R2 frame ownership | P5a, P7 |
| Codex R3 prop binding | P3b |
| Codex R4 column ownership/views | P4a, P4b |
| Codex R5 transactions | P1c, P3a |
| Codex R6 compiler metadata | P4c |
| Codex R7 generator semantics | P2b |
| Codex R8 inspector | P2a |
| Codex R9 export graph | P1c, P3c |
| Codex R10 cache cleanup | P2c |
| Codex R11 Python handlers | P1a, P3d |
| Codex R12 docs coordinator | P8 |
| Claude B1 containment and B3 status | P1a, P1b |
| Claude B2 overrides | P2a, with the intentional editability correction above |
| Claude 2.2 renderer services and 2.3 object bindings | P5 |
| Claude 2.4 Text/live shortcuts and 3.1 mark extractions | P6 |
| Claude 2.5 Dodge and 3.2 layout helpers | P1b, P6c |
| Claude 2.6 transform reads | P4d |
| Claude 2.7 simulation scalar and expression entry points | P4c |
| Claude 2.8 ownership and 2.9 view metadata | P4a, P4b |
| Claude 2.10 smaller workarounds | P2d, P4, P6d, P7 as their contracts become available |
| Claude 3.3 view shell and 3.4 generated policies | P2, P3d, P6 |
| Claude 4 dead-code candidates | P0 audit, P2d internal cleanup, P9 public migration review |
| Maintainer follow-up: stronger type checking | Cross-stage checking requirements, P0 inventory, P3–P6 contracts, P9 coverage audit |
| Maintainer follow-up: consistent formatting | Cross-stage mechanical formatting and CI gate, P0 scope, P9 audit |
| Maintainer follow-up: mark organization | P0 dependency inventory, P5 typed boundaries, P6e pilot, P9 documentation |
| Claude review of this plan: adapter accumulation, no CI, silent P4 failures, late payoff, unmeasured performance | Gates decision, ratchet metrics, P0 CI and baseline, leak harness, sequencing adjustments, performance regression checks |

## Work deliberately excluded

Do not remove the documented Three.js/backend patches without version-specific evidence that
their original failure is resolved. Do not merge distinct animation mechanisms, replace the
render scheduler, introduce a scene-wide dependency engine, implement automatic export
dependency expansion, or change coordinate/mark support as a side effect of this refactor.
Do not remove input shorthand or public components merely to reduce registry size.

No implementation code, tests, generated artifacts, or existing reports were changed while
preparing this plan. The maintainer decisions above are resolved; remaining checks are
implementation evidence gates rather than unanswered product-policy questions.

## Outcome

**Recorded by Claude (Claude Opus 5.5) for Stage 121.2, 2026-10-10, at `176f4cc6`; completed for
Stage 121.3 at `e95c208d`.** TODO's
"STAGES 112–121" notes have the per-slice detail; [the P0 report](REFACTOR-P0-BASELINE-2026-10-09.md)
the baseline and its known failures. CHANGELOG.md's 0.1.0 entries list the public changes.

### What each stage achieved

| Stage | Achieved |
|---|---|
| P0 (112) | Baseline report, ratchet test, leak harness, performance baseline and drivers; all five claimed defects reproduced. CI was not restored (account billing); from Stage 116 the maintainer accepted local gates instead. |
| P1 (113) | Python containment reads the generated mark list; one `statusChannel` for every transform handle, DAG/Sankey/Pack/Treemap included; `SceneResources.snapshot()`/`restore()` roll back themes and offsets; grid tables export their coordinate columns; Dodge > Interaction draws; the harness's three library leaks fixed. |
| P2 (114) | One inspector descriptor per Axis setting; `options.json` declares input reads, input components, input contexts and positional roles; `Shift.field` reads inputs; cache entries register their own release; fourteen dead exports and two duplicates gone; `@dt` is a runtime input (no int32 widening), `kind` replaces `__kind`, `_domains` replaces `_autoBounds`; `format:check` covers every formatted area. |
| P3 (115) | `SceneResources.transaction()` (prepare, activate, accept, rollback, retire) and one `restoreConstraints` over `owners()`; `stable()` and `propCells()` extracted unchanged; one export traversal per runtime (`exportClosure.js`, `exporter._closure`) checked on shared fixtures; Python refuses a target that refers outside itself; GraphData's Python handling in its own module. |
| P4 (116) | `get()` lends and `acquireColumn` retains (`columnReads.js`); the three ownership flags and the adapter are gone; typed view metadata with a view-extension hook; expression metadata split into semantic and descriptive, the planner in explicit stages, the compiling evaluator called by its own name; transform dependency declarations with one analyzer. Fixed: transforms reading interaction state inside a Facet, an Interaction-over-view mask leak. |
| P5 (117) | Typed `ViewServices` per view with owner-checked capabilities (renderer fields 51 → 19, then 0 in 121.1); the accepted `MarkBinding` replaces every field namedMark put on the mark object, and `_pickable` replaces `INTERNAL_POINTER_MOVE`. |
| P6 (118) | `planMarkUpdate`/`planFeedbackUpdate` over `markKinds.js` capabilities; endpoint, feedback-opacity, tooltip and domain controllers on the binding; Dodge's layout controller under `DODGE_CONTEXT` (`scope.dodge` gone); shared graph-layout publication and frame helpers; raw marks reached only through `getMark()`; viewCore 1,703 → 1,473 lines. The Points/Rect pilot moved nothing ([MARK-ORGANIZATION.md](MARK-ORGANIZATION.md)). Fixed: a mask swap that drew changed columns at old values. |
| P7 (119) | One frame model (`frameModel.ts`); the Plot's root is an ordinary Frame; `legacy`/`legacyProps`, `implicitAxis`/`primaryAxisOptions`, viewCore's own domains and the view's bounds collector are gone. Fixed: `axisMask` off redraws; live VectorTile bounds beside other marks. |
| P8 (120) | Deferred (below). |
| P9 (121) | 121.1: the view's lifecycle, clock, drawn revision, surface textures, Overview frame and credits moved into its services (`renderer.plot*` 20 → 0 under a metric that counts every name); 121.2: the public change inventory, CHANGELOG entries and architecture docs; 121.3: eleven more modules strictly checked (24 → 35, among them `markUpdatePlan`, `feedbackOpacity`, `markTooltip` and `markDomainPublisher`), the formatting check, ratchet and leak harness documented in TESTING.md and CONTRIBUTING.md, full gates, and the final performance comparison (below). `getAxes` and `getSurface` were confirmed live (browser specs use `getAxes`; most marks implement `getSurface`) and are neither deprecated nor removed. |

### Ratchet values

Stage 122 frame-composition continuation (Codex-generated, 2026-10-11): the strict floor is
75, including the actual frame-owner/overlay Svelte gate and JAX/shader operation consumers.
The ratchet counts the focused configs explicitly. namedMark's ceiling is 2,765 after two
additional annotation lines identify the already integer-validated direct row count. The
13-module executable-JS equality proof carries the preceding preparation timing evidence
forward; no new performance measurement is claimed. See the frame-composition stage artifact.

Stage 122 strict preparation continuation (Codex-generated, 2026-10-11): the component
ceiling rises from 2,546 to 2,763 lines for checked inputs/exports, lifetime and callback
records, and explicit planner-proven invariants. These annotations add no mark-kind decisions.
The strict floor rises to 70, including the actual Svelte body under tsconfig.preparation.json.
The captured result alias only names the run's preparation for the checker: its compiled
output is the same as before. The one runtime change is that the feedback planner now rejects
an absent writable field (b4968cf9); the paired production gates cover both.

Stage 122 implementation note (Codex-generated, 2026-10-11): the namedMark
ceiling rises from 1,470 to 1,474 for explicit `MarkDataRequest` annotations,
separating its declaration from the opacity revision, and a direct upload-settlement
import after separating renderer lifetime from preparation settlement. No new mark
decision was added. The strict-check floor rises from 35 to 46, including the actual
coordinateOperations implementation and its live/resolved operation records. The other
eight core implementation targets remain outstanding; supporting types alone do not
complete their packages.

| Metric | 2026-10-09 | e95c208d | Target |
|---|---:|---:|---:|
| Lines naming the ownership flags | 32 | 0 | 0 |
| Distinct `renderer.plot*` properties (any access, any module; 20 under the corrected metric) | 51 | 0 | 0 |
| Distinct `mark.<field> =` in namedMark | 17 | 0 | 0 |
| Kind checks in the shared mark code | 79 | 46, all in `KIND_ALLOWLIST` | named allowlist |
| `kind === "Text"` in the cheap update paths | 8 | 0 | 0 |
| Lines in `bound/namedMark.svelte` (unformatted) | 2,157 | 1,470 | about 1,000 |
| Lines of `axis.svelte` naming `legacy` | 15 | 0 | 0 |
| Files importing `pendingRootContent` | 10 | 10 | 2 (justified above) |
| Components writing their own status `subscribe` | 9 | 0 | 1 helper |
| Cache fields `disposeTransformCache` reads | 11 | 0 | 0 |
| Files importing `evaluateTransientExpression` under another name | 12 | 0 | 0 |
| Strictly checked modules | 10 | 35 | rises only |
| Raw mark components without `getMark` (added in 118.5) | n/a | 0 | 0 |

The P6 gate's `plotMarkPreparations` and `plotLiveFieldUpdates` are now the view's
`diagnostics.counters.markPreparations` and `liveFieldUpdates`.

### Final performance comparison

[`refactor-final.json`](../tests/perf/investigations/results/refactor-final.json) compares
`e95c208d` with the baseline `9e0830f3`, on the baseline's machine, browser and DPR, with
production builds. Both are within the tolerances above:

| Scenario | Metric | 9e0830f3 | e95c208d |
|---|---|---:|---:|
| Sunburst | CPU per frame, median of 8 interleaved runs (paired difference -0.01 ms) | 3.91 ms | 3.89 ms |
| Sunburst | Frame p95 | 17.76 ms | 18.67 ms (+5%) |
| Sunburst | Frames per flight; readbacks per flight | 78.8; 97 | 78.8; 97 |
| Lorenz | Presented fps on each canvas; warmed builds | 60; 0 | 60; 0 |
| Lorenz | CPU; GPU per frame (median of 3) | 6.07; 3.94 ms | 5.64; 4.03 ms |

Sunburst's frame p95 is the one number that moved: completed frames are unchanged, so it is
jitter within a vsync interval. Builds have to be measured interleaved, each served from its
own directory with runs alternating between them: in three sequential sessions the build
measured first read about 0.6 ms per frame lower, and two bisections blamed that drift on
Stages 116.3 and 116.4, which measure the same as their predecessors when interleaved.

### Deliberate deferrals and shortfalls

- **115.2's second half** (per-prop resolution from descriptors, resource revisions and input
  dependencies): no measured problem, and `stable()` already hands unchanged values on.
- **Stage 120** (docs build coordinator): deferred as the sequencing note proposed; tooling with
  no library benefit.
- **`pendingRootContent` stays at 10**: each importer defers its children, and its slot is the
  barrier that keeps a sibling Frame from being promoted before they register (the ratchet note
  above). A shared helper would lower the count without moving the barrier.
- **namedMark is 1,470 lines, not about 1,000.** The kind lists, ad-hoc fields, controllers and
  planner left it; what remains is one preparation effect (about 560 lines) and the live and
  procedural writers. That effect assembles the request (rows, padded form, connection, frame
  state, animation), applies the planner's action, stages keyed lifecycles and publishes with
  cause tracking, all over the component's own reactive state and effect timing. Moving it out
  would pass that ambient state to an opaque controller, which P6d rules out, without making a
  decision clearer.

### Open findings

- CI still refuses jobs (billing); the local gates stand in.
- Flow and Routes containment is undecided (113.1).
- The options table's input flags preserve the old rules' inconsistencies (Flow, Routes, RuleX
  and RuleY channels; Swarm, Smooth, Ecdf, Polygon and DensityContour x/y; Pack/Treemap `value`
  against Tree's `height`; Prism `rotation`), and `Shift.interval`, `Bin.interval` and `Bin.tz`
  read inputs in the browser without a flag. `stringReads` still decides both input reads and
  which props fold to constants in `SceneNode`, so the two roles are not yet separate (114.2).
- `createDataView`'s post-construction properties (`fieldIdentity`, `pipeline`, `onDispose`,
  `step`, ...) are not typed options yet (116.2).
- DragSession and other owner-less callers build and drop a program per evaluation (116.3).
- Bin and Hexbin do not declare their binned fields, so an `@` column binned there updates only
  when the input republishes; shared facet bins from an expression reading `@` state stay cached
  across brushes (116.4).
- The brush pixel-readback capability has no reader (a removal candidate) (117.1).
- A legend's `readOpacityExtent` reads the opacity column without retaining it; a user's
  `_pickable` makes a mark pickable; `heatmap.svelte` keeps a no-op `onpointermove` (117.2).
- An all-mark rename (`bound/` to `public/`, one file name per public name) remains possible if a
  regenerated registry diff is accepted (118.6).
- `getMark().filteredCount`, documented in DATA.md, went with the mark-object fields in 117.2;
  the CHANGELOG records it, and whether to offer a public count of the rows a padded mark shows
  is a maintainer decision (found in 121.2).
- Browser failures that predate the slices that found them are listed in
  [the P0 report](REFACTOR-P0-BASELINE-2026-10-09.md).

### Integration allowance, 2026-10-17

The namedMark line ceiling moves from 2342 to 2355: twelve lines retain the distinction
between inferred preview scales and authored scale overrides (the shared-scale regression),
and one delegates the new theme fade defaults to the existing motion owner. These are
correctness integration costs, not new feature owners in namedMark. Theme fade policy stays
in markMotion; the targeted shared-scale and theme tests cover these paths.


### Scoped animation correspondence allowance, 2026-10-17

The approved animationGroup contract raises namedMark's line ceiling from 2350 to 2388
(37 lines from checkpoint 22ecfb17 and one from the scheme-reset correction). These lines
connect inherited context and snapshot readiness to the existing preparation planner, select
compact rows for grouped marks, carry correspondence into expression evaluation and accepted
frames, and preserve observation identity for connection endpoints. Correspondence validation
and token caching remain in animationGroup.js; tween alignment remains in tweenState.js and
lifecycle unions remain in keyedLifecycle.js. The reset flag is separate from drag arrive
policy and is captured with queued field writes, so unchanged pending targets land only for
the preparation that changes schemes. Targeted mark/Calculate midpoint, Tree input, live
completed-frame and Python export tests exercise these integration points. This allowance
retains the existing implementation rather than moving unrelated preparation code for a
line-count reduction. The strict-module floor also records the integrated count of 146.
