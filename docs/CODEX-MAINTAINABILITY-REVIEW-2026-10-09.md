# HMPlot maintainability and refactoring report

**Codex-generated**  
**Date:** October 9, 2026  
**Prepared for:** HMPlot maintainers  
**Source baseline:** `380cdac76efb2024e8012bc0b1a08f63c5d3bbea`, with the existing working-tree changes present during review.

HMPlot has several substantial opportunities to simplify shared infrastructure. The strongest
candidates concern ownership and dependency boundaries: deciding which mark fields need an
update, which frame owns coordinate settings, who releases a column read, and which module
commits or rolls back scene resources. Several features currently compensate for limitations
in these boundaries by adding special cases to general-purpose code.

The recommendations preserve existing public behavior and performance optimizations. Their
purpose is to give those behaviors clear internal owners, reducing the number of unrelated
modules that must change when a feature is added.

## Scope and interpretation

This report covers the plotting and data utilities, shared mark preparation, scene runtime,
Python scene construction and export, inspector, API generation, and docs build tooling.
It draws on implementation code, selected history, existing tests, and repository guidance.
It is an architectural source review rather than an exhaustive line-by-line audit or a
performance benchmark. No tests or builds were run for the review, and no implementation
files were changed. This report is the only artifact added for the write-up.

Source observations and proposed refactors are distinguished below. A missing field in a
rollback snapshot or a difference between export traversals is evidence of a maintenance
hazard; it is not presented as a reproduced user-visible failure. No speedup, memory saving,
or delivery estimate is claimed without measurement.

Existing local edits included changes to `namedMark.svelte` and `viewCore.svelte`. The mark
findings concern update paths outside the local row-token caching edits, and the frame
findings concern ownership logic outside the local settings-notification batching edit.
The other local example, catalog, and Vite edits were left intact.

Links are relative to this report so it remains useful in the repository. Line anchors refer
to the reviewed source snapshot; the named functions should be used to locate code after
subsequent edits. Generated registries, signatures, and bundles are outputs, not suggested
places to implement these changes.

## Priority overview

The identifiers follow the review's finding order. Benefit, scope, and risk are qualitative
judgments, not bug severity ratings or measured costs. A small cleanup can be a better first
change than a larger opportunity with greater eventual benefit.

| ID | Opportunity | Expected maintenance benefit | Scope and main risk |
|---|---|---|---|
| R1 | One incremental mark update planner | High | Large; rendering, interaction, animation, and performance |
| R2 | One internal frame ownership model | High | Large; coordinate inheritance, navigation, guides, and picking |
| R3 | Stable scene prop bindings | High | Medium; reactivity, callbacks, and pending inputs |
| R4 | Explicit column ownership and projection contracts | High | Large; GPU lifetimes, retained views, and provenance |
| R5 | Resource-owned scene transactions | High | Medium; rollback, resource identity, and local interactions |
| R6 | Semantic metadata for expression compilation | High | Medium; evaluator equivalence and cache identity |
| R7 | Input semantics independent of Python type formatting | Moderate | Small to medium; generated API and input interpretation |
| R8 | One inspector descriptor per setting | Moderate | Small to medium; help, inheritance, and edit behavior |
| R9 | Shared export dependency rules | Moderate to high | Medium; resource closure and export policy |
| R10 | Cache entries that own their cleanup | Moderate | Small initial change; retained output lifetimes |
| R11 | Python component validation handlers | Moderate | Medium; normalization order and atomic edits |
| R12 | Explicit docs build coordinator | Moderate | Medium; request completion and subprocess lifecycle |

## R1 Incremental mark update planning

**Observation.** The shared mark component contains several independently maintained ways to
avoid full preparation: `swapValid`, `canWriteLive`, and `canReuseStaticText` in
[namedMark.svelte](../src/lib/plot/bound/namedMark.svelte#L1085), plus a separate
[Points size-feedback shortcut](../src/lib/plot/bound/namedMark.svelte#L1328).
Additional channel policy lived in `liveGeometry.js` (now
[preparationDependencies.js](../src/lib/plot/binding/preparationDependencies.js))
and [proceduralChannels.js](../src/lib/plot/utils/proceduralChannels.js).

These paths repeatedly check row identity, data generation, request identity, scales,
animation, interaction state, topology, and channel metadata. They also differ in how they
retain scopes and accept completed asynchronous work. The component must understand text
atlases, padded filters, live numerical geometry, and point feedback to choose an update.

**Maintenance cost.** A new fast path needs its own exclusion list and must remain compatible
with all existing paths. A change to what invalidates a prepared mark may require coordinated
edits to several predicates. Splitting the file without consolidating these decisions would
leave that cost largely unchanged.

**Proposed boundary.** Introduce a single internal update planner that classifies changed
dependencies and chooses which prepared fields can be retained, rewritten, or rebuilt.
Keep mark-specific capabilities in small adapters. The plan should explicitly identify the
work it invalidates, such as geometry, membership, text layout, or inferred domains, and
the ownership obligations of accepting its result.

**First increment.** Extract the existing admission rules unchanged into one planner with
explicit outcomes. Route the existing optimized implementations through it before attempting
to merge their execution paths. Preserve the distinction between current-request and
newest-completed publication policies.

**Success criteria and checks.** Equivalent updates select equivalent work, retained fields
remain valid, and rendering continues to complete frames during continuous changes. Use
[padded-marks.spec.js](../tests/browser/padded-marks.spec.js),
[animation-engine.spec.js](../tests/browser/animation-engine.spec.js),
[interaction-regressions.spec.js](../tests/browser/interaction-regressions.spec.js),
[view-state.test.js](../tests/unit/view-state.test.js),
[tween-pipeline.spec.js](../tests/browser/tween-pipeline.spec.js), and
[label-options.spec.js](../tests/browser/label-options.spec.js). Compare preparation, upload,
and completed-frame behavior where the affected tests expose counters. Removing a fast path
is not itself a successful cleanup.

## R2 Plot and Frame ownership

**Observation.** Plot renders an
[internal legacy Axis](../src/lib/plot/viewCore.svelte#L1688). Axis then handles normal,
inherited, and [promoted-root dimensions](../src/lib/plot/axis.svelte#L149). The view separately
maintains logical content registration, active-root publication, implicit-root visibility,
and redirects to the primary frame. The selection rule itself already has a small home in
[rootFrameSelection.js](../src/lib/plot/utils/rootFrameSelection.js).

The source explicitly describes logical ownership as independent of the implicit Axis while
the render path is being migrated. `legacyProps`, promotion checks, and primary-frame
redirection allow the newer composition model to coexist with the older implementation.
These distinctions reach domains, settings, navigation, brushing, and guide visibility.

**Maintenance cost.** Coordinate ownership has several representations that must agree.
Changing which frame acts as the root affects more than selecting a key: inherited domains,
options, visibility, and downstream consumers all need consistent interpretation.

**Proposed boundary.** Normalize Plot and Frame configuration into one internal frame model
with explicit parentage, per-dimension ownership, and root status. Consumers should ask this
model for effective ownership rather than reconstruct it from legacy flags and option
fallbacks. Public root promotion and inherited-axis behavior remain supported.

**First increment.** Centralize the calculation of effective root and dimension ownership
while keeping the current component structure. Migrate consumers one at a time, then assess
which legacy branches and duplicate option paths can be removed. Avoid changing public Axis,
Axes, or Frame range semantics as part of this internal cleanup.

**Success criteria and checks.** Root changes preserve navigation, brush targets, explicit
Plot domains, sibling frames, and asynchronous child registration. Use
[root-frame-selection.test.js](../tests/unit/root-frame-selection.test.js),
[nested-frames.spec.js](../tests/browser/nested-frames.spec.js),
[frame-cells.spec.js](../tests/browser/frame-cells.spec.js), and
[frame-brush.spec.js](../tests/browser/frame-brush.spec.js). The supported behavior in
[FRAME-IMPLEMENTATION.md](FRAME-IMPLEMENTATION.md) is a constraint on the refactor.

## R3 Stable scene prop bindings

**Observation.** [SceneResources.resolve](../src/lib/scene/resources.js#L430) reconstructs
objects and descriptors. [SceneNode.stable](../src/lib/scene/SceneNode.svelte#L49) then compares
resolved values recursively to recover previous identities, with a depth-six cutoff and a
256-element array limit. A second layer uses
[per-property reactive cells and a Proxy](../src/lib/scene/SceneNode.svelte#L115) to isolate
each property's invalidation.

This is a directly documented feature workaround. The comments name Playback repeatedly
reconfiguring Frames and a Run checkbox restarting Force. Commit `5c6d9325` introduced the
identity/isolation repair, and follow-up `f1df3815` addressed fresh event-handler behavior.

**Maintenance cost.** SceneNode compensates for upstream allocation and framework propagation
behavior using its own bounded equality and property-store machinery. Correctness depends on
preserving expression markers, host values, callback closures, and missing-property reads.
The equality cutoffs also make reuse depend on value shape.

**Proposed boundary.** Give scene prop binding a dedicated adapter. Over time, decode and
resolve individual properties from their descriptor, resource, and input dependencies so
unchanged dependencies naturally retain identity. Prop isolation remains an explicit
responsibility even if the deep comparison becomes unnecessary.

**First increment.** Extract the adapter without changing semantics. Establish focused
behavioral coverage for unchanged props, changed inputs, removed props, pending inputs, and
callback replacement. Replace broad equality only after the dependency model can account for
each of those cases.

**Success criteria and checks.** Updating one input does not restart unrelated work; callbacks
see current values; pending inputs still defer correctly. Existing paired Python/Svelte
controls in [examples.spec.js](../tests/browser/examples.spec.js#L1687) exercise Force
Run/Step/Reset, dimensions, and Solar Playback. These are useful guards against regressing the
behavior that motivated the workaround.

## R4 Column ownership and row projection

**Observation.** A root scope returns borrowed ordinary columns but caller-owned virtual
columns. Derived views cache and lend virtual columns. The rule is encoded in
[ownsResolved](../src/lib/plot/utils/interaction.js#L79), while
[Simulate.stepScope](../src/lib/plot/utils/simulate.js#L68) adds `ownsVirtualColumn` rules for
previous-state and interaction reads. Consumers in
[expressions.js](../src/lib/plot/utils/expressions.js#L503) and the compiled evaluator inspect
these flags when deciding what to dispose.

[dataView.js](../src/lib/plot/utils/dataView.js) also implements physical/snapshot adapters
and virtual-cache invalidation. [connectionPrepare.js](../src/lib/plot/utils/connectionPrepare.js#L347)
independently implements related gathering, virtual-column caching, and ownership behavior.

**Maintenance cost.** A column's release obligation depends on the scope implementation and
field kind rather than the read result. New virtual fields or scope adapters require changes
across readers. Manually forwarded interfaces grow as scopes gain capabilities.

**Proposed boundary.** Use an internal column-read result that carries the value and its
release obligation. Reuse projection adapters for compacted, physical, prefixed, and
connector rows, separating metadata forwarding from row mapping. Specialized GPU row
representations remain useful and should be retained.

**First increment.** Introduce the read contract at one evaluator boundary, backed by the
current scope implementations. Migrate callers incrementally before consolidating projection
adapters. Keep ownership migration separate from changes to snapshots or physical row layouts.
Determining ownership should not require new gathers, compaction, or readbacks; avoid
introducing additional allocations in every hot read without measurement.

**Success criteria and checks.** Retained views remain readable after parent/cache changes,
temporary virtual arrays are released once, and aggregate provenance and interaction
revisions remain correct. Existing coverage includes
[padded-views.test.js](../tests/unit/padded-views.test.js),
[interaction.test.js](../tests/unit/interaction.test.js),
[connection-prepare.test.js](../tests/unit/connection-prepare.test.js),
[simulate.test.js](../tests/unit/simulate.test.js), and
[transform-contract.test.js](../tests/unit/transform-contract.test.js). This is a contract
cleanup proposal, not a claim of a reproduced ownership bug.

## R5 Scene resource transactions

**Observation.** [SceneRuntime.applyState](../src/lib/scene/runtime.svelte.js#L727) snapshots
resource internals, calls [SceneResources.commit](../src/lib/scene/resources.js#L385), and
manually restores selected state after failure. Commit independently defines the mutation
set. It updates themes, offsets, and selection/offset version maps that are absent from the
runtime's rollback snapshot. The overall apply operation also reconstructs brush constraints
after mounting.

Constraint reconstruction appears in both the
[incremental interaction path](../src/lib/scene/runtime.svelte.js#L660) and the
[full apply path](../src/lib/scene/runtime.svelte.js#L768). Their owner enumeration differs:
the incremental path includes standalone identities, while the full path constructs its
owner map from tables.

**Maintenance cost.** Adding a resource or mutable field requires knowledge of transaction
code in another module. The difference between the mutation and snapshot lists is concrete
evidence of a fragile boundary. Whether a particular omission produces a visible failure
depends on the failed update; no such failure was reproduced in this review.

**Proposed boundary.** Resource-owned transactions should provide commit, rollback, and
disposal operations. Runtime remains responsible for mounting, settling, and deciding whether
an application succeeded. Constraint restoration should have one implementation with an
explicit owner-resolution input.

**First increment.** Move snapshot/restore behavior into the resource layer and define the
state each resource must restore. Exercise a failed update followed by retry across themes,
scales, offsets, selections, and version tracking before changing commit structure.

**Success criteria and checks.** Failed applications preserve prior resource state and valid
retry behavior without discarding pending local interactions or breaking pooled identity.
[python-commands.spec.js](../tests/browser/python-commands.spec.js#L180) covers rendered
rollback/retry, and [scene-scale-protocol.test.js](../tests/unit/scene-scale-protocol.test.js#L128)
covers retained resource identities. The existing rollback case changes mark color; it does
not establish complete rollback coverage for every mutable resource.

## R6 Expression compiler metadata

**Observation.** [losslessMetadata](../src/lib/plot/utils/expressionPlans.js#L65) checks
prototypes, property descriptors, `toJSON`, negative zero, depth, and size limits to determine
whether complete metadata objects can safely be JSON-snapshotted. Input metadata consequently
affects compilation eligibility and plan specialization.

[columnMetadata](../src/lib/scene/resources.js#L112) filters undefined properties specifically
because otherwise ordinary Python numeric expressions use the eager evaluator. Commit
`08f4f1e7` and the decoded-column regression in
[data.test.js](../tests/unit/data.test.js#L170) document this dependency.

**Maintenance cost.** Descriptive metadata and representation choices in the scene decoder
can influence numerical execution strategy. A producer must know the compiler's metadata
serialization restrictions, and arbitrary metadata changes can produce distinct plans.

**Proposed boundary.** Separate metadata that changes numeric semantics, such as logical
type, units, time origin, and category dictionaries, from descriptive or opaque metadata.
Use a defined semantic descriptor for plan eligibility and cache identity, while preserving
other metadata in results according to evaluator behavior.

**First increment.** Inventory which metadata operations actually consume, define the
semantic descriptor, and compare compiled/eager results including their metadata. Start with
clearly descriptive fields such as names and labels; keep unclassified metadata on the
existing conservative path until equivalence is established. Merely relaxing
`losslessMetadata` would not address preservation requirements.

**Success criteria and checks.** Nonsemantic metadata does not change numerical compilation
decisions, semantic metadata still invalidates plans, and outputs preserve expected metadata.
Use [data.test.js](../tests/unit/data.test.js) and
[reductions.test.js](../tests/unit/reductions.test.js), including datetime behavior, aliasing,
metadata preservation, eviction, and fallback cases. Performance benefits would need separate
measurement.

## R7 Runtime input semantics and API generation

**Observation.** [generate-python-signatures.mjs](../scripts/generate-python-signatures.mjs#L381)
uses a component-name allowlist and tests Python annotation strings, including
`type === 'Channel'` and `/\bstr\b|TypingLiteral/`, to derive `stringReads`. That metadata
controls where `"$name"` means an input reference. It is consumed by
[Python input validation](../python/hmplot/core.py#L2043) and
[SceneNode input handling](../src/lib/scene/SceneNode.svelte#L72).

**Maintenance cost.** A language-output formatting or type-alias change can affect runtime
semantics. New transform kinds must also be added to a separate list or receive different
string behavior. The generator is simultaneously rendering annotations and defining part of
the scene language.

**Proposed boundary.** Build semantic prop information before rendering language-specific
types. Roles such as channel, literal string, expression, input-capable value, and data
resource should determine input behavior. Python annotations then remain an output of that
model.

**First increment.** Replace the annotation-string heuristic with explicit maintained
semantic metadata while preserving current generated `stringReads` values. This can be
bounded to input interpretation rather than redesigning the entire generator.

**Success criteria and checks.** A harmless annotation-format change cannot alter input
interpretation. Run generation checks and
[python-signatures.test.js](../tests/unit/python-signatures.test.js), inspect every generated
diff, and exercise Python/browser input behavior. Follow
[API-GENERATION.md](API-GENERATION.md); implementation identifiers must not become public API.

## R8 Inspector setting descriptions

**Observation.** [inspector.js](../src/lib/options/inspector.js#L349) defines older Plot/axis
groups, then [later assignments](../src/lib/options/inspector.js#L801) explicitly overwrite
them for the unified Axis editor. A separate
[path-based presentation layer](../src/lib/options/inspector.js#L144) relabels and regroups
rows. Scope allowlists and axis-specific behavior in
[optionsElement.svelte](../src/lib/options/optionsElement.svelte#L83) add further policy.

**Maintenance cost.** One setting can be described and classified in multiple places. Later
group assignments can replace earlier help or dependency metadata, and regex/name conventions
must stay aligned with new option names.

**Proposed boundary.** Maintain one inspector descriptor per setting with scope, group,
label, help, editor, and validation adapter. Generate repeated dimension rows from these
descriptors. Keep polar/spherical terminology in a small contextual presentation function,
and put coordinate-specific editing rules in an axis adapter.

**First increment.** Replace the legacy declarations and late override block with final
descriptors for axis settings only. Preserve serialized paths and the distinction between
authored, inherited, and default values. Expand to other settings only if it reduces actual
duplication.

**Success criteria and checks.** The pane retains correct help, enabled states, labels,
resets, and inheritance behavior without multiple definitions of the same setting. Existing
guards are [settings.test.js](../tests/unit/settings.test.js) and
[settings.spec.js](../tests/browser/settings.spec.js), plus affected frame/axis rendering tests.

## R9 HTML export dependency traversal

**Observation.** [Python HTML export](../python/hmplot/exporter.py#L98) and
[browser HTML export](../src/lib/scene/runtime.svelte.js#L344) independently prune the target
tree, remove callbacks, scan references, calculate required resources, and filter state.

The traversals already differ. Python recursively scans table descriptors, including grid
references, while the browser enumerates columns and selected interaction fields. Python
falls back to the complete scene for references outside the retained subtree; the browser
rejects that target. The fallback policies may be intentional, and a rendered failure from
the resource-traversal difference was not reproduced.

**Maintenance cost.** Every new resource reference or descriptor shape requires changes in
both implementations. Browser-only snapshot features are interleaved with generic graph
operations, making it harder to compare the shared policy.

**Proposed boundary.** Define resource dependencies in a shared protocol description and use
a small traversal in each language. Separate generic pruning from browser capture of camera
state, provider results, vector tiles, and live interactions. Make target fallback policy an
explicit decision rather than an incidental difference between traversals.

**First increment.** Create a common fixture corpus describing expected retained nodes and
resource IDs. Cover grids, identities, selections, scales, normalizations, and external node
references. Bring the traversal implementations under those expectations before changing
export assembly.

**Success criteria and checks.** Both runtimes retain equivalent dependencies for equivalent
state, with any policy differences documented and tested. Relevant checks live in
[test_core.py](../python/tests/test_core.py),
[test_connections.py](../python/tests/test_connections.py#L424),
[provider-export.spec.js](../tests/browser/provider-export.spec.js), and
[vector-tile-export.spec.js](../tests/browser/vector-tile-export.spec.js). Browser tests that
use Python exports need current Python browser bundles after implementation changes.

## R10 Transform cache cleanup ownership

**Observation.** [disposeTransformCache](../src/lib/plot/utils/transforms/common.js#L132)
knows the private resource layouts of expression evaluation, tweening, Filter, Slice, Grid,
grouping, Stack, and FromEdges. The same module already provides a simpler generic retained
array cache through `cachedArray`.

**Maintenance cost.** A transform can add a cache entry locally but must also teach shared
cleanup how to traverse its internal structure. Resource creation and release are separated
by module ownership, encouraging omissions as features accumulate.

**Proposed boundary.** Cache entries should register their own disposal behavior. Shared
cleanup should release entries, while each transform defines replacement and teardown of
its private resources. Existing cache-key and reuse policies can remain unchanged.

**First increment.** Pilot the pattern with FromEdges, whose cached table is relatively
isolated, then migrate other entries. Avoid building a new general caching framework or
changing Filter's retained-reference behavior at the same time.

**Success criteria and checks.** An output retained by a consumer remains valid after cache
replacement or disposal, and the cache releases only its own references. Use
[graph-data.test.js](../tests/unit/graph-data.test.js#L334) for the FromEdges lifetime case
and [transform-caches.test.js](../tests/unit/transform-caches.test.js) for reuse, retention,
and error cleanup.

## R11 Python feature normalization and validation

**Observation.** [Node._set](../python/hmplot/core.py#L890) directly handles VectorTile zoom
bias, outline channels, Tree endpoints, placement versions, camera vectors, mark-local data,
GraphData conversion, Provider conversion, and input/list semantics. A second growing feature
dispatch appears in [Scene._validate](../python/hmplot/core.py#L2176). Bridge message handling
elsewhere in the same module adds interaction, drag, simulation, and callback responsibilities.

**Maintenance cost.** Generic tree/resource plumbing must change for unrelated component
features. Normalizing a property, validating a complete component, and validating its scene
context happen in different places without a consistent feature-local home. This is more
specific than the fact that `core.py` is large.

**Proposed boundary.** Extract component normalization and validation handlers, keeping
tree ownership, transaction handling, and generic property-name conversion in core. Existing
[axes.py](../python/hmplot/axes.py), [presentation.py](../python/hmplot/presentation.py), and
[connections.py](../python/hmplot/connections.py) demonstrate a suitable extraction style.
No plugin framework is needed.

**First increment.** Choose one cohesive feature, such as GraphData or Provider, and give it
explicit property-normalization, component-validation, and scene-validation entry points.
Retain the existing call order and error messages. Message dispatch can be a separate later
extraction rather than part of the first change.

**Success criteria and checks.** Equivalent Python and browser-originated edits normalize
consistently; snake/camel conversion, deferred template validation, and atomic edits retain
their behavior. Use [test_api_consistency.py](../python/tests/test_api_consistency.py),
[test_graph_composition.py](../python/tests/test_graph_composition.py), and the affected
feature cases in [test_core.py](../python/tests/test_core.py).

## R12 Docs build scheduling

**Observation.** [vite-examples.js](../scripts/vite-examples.js#L33) coordinates queues,
request waiters, debounce timers, stale-build tracking, and a tri-state running-build scope.
It prioritizes work through a `.priority` file, parses human-readable stdout as progress
messages, and uses a global symbol hook for missing thumbnails. Thumbnail capture has a
second scheduling loop that must respect example-build ordering.

The introductory comments describe successive additions for incremental builds, examples
added while the server runs, demand-driven rebuilding, and missing gallery thumbnails.
Each useful feature has added state and communication paths to the Vite adapter.

**Maintenance cost.** Understanding whether a request will complete requires reasoning
across middleware, subprocess output, a side-channel file, timers, and route loading. Another
artifact type or invalidation condition is likely to touch several of these paths.

**Proposed boundary.** Extract a per-server build coordinator with explicit operations to
invalidate, ensure, prioritize, subscribe, and dispose. Keep watcher events, middleware, and
route-load integration as adapters. Isolate subprocess protocol handling and use structured
progress messages rather than making human log wording part of the contract.

**First increment.** Move scheduling state into a coordinator without changing its external
protocol. Cover request completion and teardown before migrating progress messages. Example
builds and captures can then share scheduling primitives while retaining their ordering rules.

**Success criteria and checks.** Existing assets remain nonblocking; missing requested assets
are prioritized; examples added during a build are handled; captures remain serialized; and
failures or shutdown do not leave unresolved request waiters. The coordinator simulation in
[docs-reference.test.js](../tests/unit/docs-reference.test.js#L332) is an existing starting
point. Subprocess failure and server teardown deserve explicit coverage during extraction.

## Suggested implementation sequence

1. **Start with bounded cleanup.** R10 can pilot cleanup ownership on one cache entry. R8 can
   remove duplicate inspector declarations for axis settings. R7 can separate input semantics
   from annotation formatting while keeping generated output equivalent. These are useful
   independent changes with limited architectural reach.
2. **Clarify the scene boundary.** R3 isolates prop binding, R5 makes resource transactions
   explicit, and R9 defines export dependency expectations. Keep them separate changes even
   though they share the scene layer; their failure modes and checks differ.
3. **Strengthen data contracts.** Stage R4's column-read ownership work, then apply that
   contract where it simplifies R6's evaluator inputs. R6's semantic metadata model can be
   designed independently, but should avoid creating another competing read-ownership rule.
4. **Consolidate mark and frame decisions.** R1 can first centralize current update choices;
   broader simplification benefits from explicit ownership and dependency contracts. R2 is a
   separate frame-model effort and should preserve the existing composition behavior at each
   increment.
5. **Schedule Python and tooling extractions around active work.** R11 and R12 are independent
   opportunities. A feature already being changed is a useful pilot, provided the extraction
   remains bounded and does not expand the requested feature's behavior.

The starting sequence is about reviewability, not importance. Resource rollback uncertainty
could justify prioritizing R5 if update failures are an active concern. Frequent mark-update
changes could similarly justify beginning R1 with a behavior-preserving planner extraction.

## Validation approach

The tests named in each finding are starting points, not claims of complete coverage or
successful execution in this review. Add focused behavior checks only for invariants the
extraction makes important and the existing tests do not cover.

For rendering changes, follow [TESTING.md](../TESTING.md): use a fresh dev server for counters,
reproduce at device pixel ratio 2, assert drawn output and completed frames, and do not edit
files while browser tests run. Wait for every plot canvas to leave its busy state before
relying on settlement. Broader pre-PR rendering checks remain required by repository policy.

Preserve the current API during internal extraction. If a public change is intentionally
introduced later, it needs the corresponding declarations, metadata, generated files,
reference documentation, tests, and changelog entry. None of the proposed cleanup requires
editing generated outputs by hand.

## Boundaries that should remain explicit

Some complexity represents real requirements. Padded views preserve efficient GPU shapes;
live updates need publication and lifetime rules; nested frames need coordinate ownership;
exports need stable snapshots. Those requirements should remain visible in the design.

Documented backend patches, including
[storage binding refresh](../src/lib/threeExtensions/storageBindings.js),
[instance matrix sharing](../src/lib/threeExtensions/instanceMatrix.js), and
[screen DPR correction](../src/lib/threeExtensions/screenDPR.js), address specific rendering
constraints. They warrant version-aware maintenance, but this review does not establish that
they can be removed. Likewise, frame promotion and the eager expression fallback are supported
behaviors, not obsolete branches merely because they complicate the implementation.

The useful measure of these refactors is whether a future feature can state its own
dependencies, ownership, and policy in fewer places while retaining the existing behavior.
