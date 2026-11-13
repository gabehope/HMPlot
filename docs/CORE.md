# The core and its features

The core is what a reader must understand to follow one plot from data to pixels. A feature (a
layout, connections, Dodge, an effect) may be as complex as it needs inside its own modules, but
it attaches to the core through a named extension point and adds no branches, state or special
cases there (TODO 126). This page lists the core files, the features, the extension points and
how a feature attaches. The feature import inventory below was traced against `321c8382`
on 2026-10-17. The transform extension descriptions also cover the subsequent Stage 138
implementation; its acceptance is recorded in TODO separately from the Stage 126 measurements.

`tests/unit/refactor-ratchet.test.js` checks its own `CORE_FILES`, feature patterns and
extension-point lists against the source. This document mirrors that inventory; the test does
not parse this Markdown. Imports outside each feature's extension points are counted, and
each count may only fall. Wrapped imports and the behavior of the boundary need manual review.

## The core files

Under `src/lib/plot/`: 32 ratcheted files at this snapshot, including the files in `binding/`
and `rendering/` below. This is a reading inventory, not the number of all runtime modules.

| Area | Files |
| --- | --- |
| Components | `plot.svelte`, `viewCore.svelte`, `frame.svelte`, `axis.svelte`, `transform.svelte`, `bound/namedMark.svelte`, `scenes/interactive.svelte` (the render loop) |
| GPU objects | `objects/base.js` |
| Data and transforms | `utils/data.js`, `utils/dataView.js`, `utils/categorical.js`, `utils/namedData.js`, `utils/interaction.js`, `utils/transforms/runner.js` |
| Expressions | `utils/expressions.js`, `utils/expressionPlans.js` |
| Marks | `utils/markKinds.js` (capabilities), `utils/markUpdatePlan.js`, `utils/markDomains.js`, `utils/proputils.js` |
| Frames and services | `utils/frameModel.ts`, `utils/viewServices.ts` |
| Binding and rendering | every file in `binding/` and `rendering/` |

Gridded data is part of the core data model (docs/DATA.md), not a feature.

`viewCore.svelte` preserves the public view preset for settings, then normalizes `3d`
(Z up) and `3d-y-up` to one internal `3d` mode. Marks, frames and presentation effects
share that mode; `utils/camera.js` supplies the preset up vector, with an explicit
`cameraUp` taking precedence. Presets do not remap data coordinates.

Statistical templates live in `src/lib/stats`. Normalize and Window declare a Calculate root
and a Slot for their caller's children. `templates/transform.js` adapts that declaration to the
existing runner contract: it expands parameters and output names and, when declared, prepares
numeric or categorical grouping keys for expressions. The ordinary Transform component still
owns input resolution, settings, status, cancellation, updates and settlement. There is no
second transform lifecycle in the mark-template host and no separate normalization/window
kernel in the core.

Slice and Interpolate are definitions on the shared transform runner. Their numerical bodies
return columns, masks and grid descriptors; the runner owns publication and disposal. Slice
endpoint descriptions travel with aggregate provenance and follow its logical-to-physical
row mapping. Neither transform has a special dispatch branch.

Slice keeps its topology certificate in its own prepared cache (`utils/slice.js`). A cached
host time interval, captured source version, row mapping and mask certify unchanged endpoint
provenance and active membership without another device read. Exact endpoints have separate
certificates. Spatial key columns use a narrower membership/order identity: changing interpolation
endpoints does not invalidate fixed-coordinate Interpolate geometry. Values are always recomputed.

Contour lives in `src/lib/plugins/contour`. Its numerical kernels use the supplied JAX
instance, masked grid fields and array uploads; output metadata and triangle geometry are
validated by the shared plug-in adapter. It imports no library internals, and the core
transform definition registry no longer names it.

## The features

A feature's modules, under `src/lib/plot/` (`utils/` unless a folder is named), and the
substage that moves its remaining core imports behind an extension point:

| Feature | Modules | Extension point | Core imports outside it (2026-10-17) | Implementation / acceptance |
| --- | --- | --- | --- | --- |
| Connections | connection\*, endpoint\* | endpointController, connectionController | 0 (4 before 126.1) | 126.1 (done) |
| Dodge | dodge\*, markPlacement, `dodge.svelte` | markPlacement | 0 (1 before 126.3) | 126.3 implemented; acceptance open |
| Force and graph layouts | force\*, graph\*, hierarchyLayouts, layout\*, tree\*; `force*.svelte`, `graph*.svelte`, `tree*.svelte`, `dag`, `sankey`, `pack`, `flow` | forceContext (`FORCE_CONTEXT`) | 0 (1 before 126.2) | 126.2 implemented; acceptance open |
| Drag editing | dragSession, dragRouter, dragController, `dragInteraction.svelte`, `interaction/channelWriteback.js` | dragController | 0 (2 before 126.2) | 126.2 implemented; acceptance open |
| Facet and Partition | facet\*, embeddedFacets, partition, series, `facet*.svelte`, `partition*.svelte` | facetService (`FACET_CONTEXT`, `PARTITION_CONTEXT`) | 1 (namedMark: series; 2 before 126.5) | 126.5 (done) |
| Presentation effects | presentation\*, effects, `scenes/presentationObject.svelte`; the sky and the atmosphere are first-party plugins in `src/lib/plugins` (TODO 138.5) | presentation (`PRESENTATION_CONTEXT`), presentationObject | 1 (viewCore: presentationOptions; 2 before 138.5) | 138.1, 138.5 (done) |
| Minimap and overview | minimap\*, `minimap.svelte`, `scenes/overview.svelte` | none yet | 3 (viewCore) | as touched |
| Maps and vector tiles | coordinateFrame, coordinateArrays, mapFit, mapProjections, mapGuides, vectorTile\*, tilePublication, `vectorTile*.svelte` | coordinateFrame, coordinateArrays; rendererResources owns tile cleanup | 0 (3 before 126.6) | 126.6 implemented; acceptance open |
| Mark-side tween bookkeeping | tweenState, markAnimation, markMotion, displayedFrames, channelAnimation | markMotion, displayedFrames, channelAnimation | 3 (markAnimation from interactive, data, proputils; 7 before 126.7) | 126.7 implemented; acceptance open |

A `*` takes every module whose name starts so, in that folder, so a feature's new file joins it.
A module that re-exports one of a feature's modules counts as the feature's (a re-export is not a
boundary), unless it also re-exports core modules, as the barrels `index.ts` and `composition.js`
do. A module that imports a feature's module and wraps it is not caught: review that by hand.
The counts must equal their recorded values, so a change that lowers one records the new value.

Data `tween()` is part of the expression language and stays in `expressions.js`.

## Measured outcome and acceptance

The comparable import baseline is `1d8b24a2` (126.0, 2026-10-15), against `321c8382`.
Both ratchet snapshots enumerate 32 core files. An import edge is one core file's distinct
relative module specifier, including type imports, using that snapshot's feature patterns and
re-export closure. Counts include extension-point imports unless the column says otherwise.

| Feature | All core import edges, before → now | Outside boundary, before → now | Core script references, before → now |
| --- | ---: | ---: | ---: |
| Connections | 5 → 2 | 4 → 0 | 23 → 3 |
| Dodge | 1 → 1 | 1 → 0 | 1 → 1 |
| Force and graph layouts | 2 → 1 | 1 → 0 | 4 → 1 |
| Drag editing | 2 → 2 | 2 → 0 | 1 → 1 |
| Facet and Partition | 2 → 5 | 2 → 1 | 3 → 6 |
| Presentation effects | 4 → 4 | 2 → 1 | 2 → 2 |
| Minimap and overview | 3 → 3 | 3 → 3 | 0 → 0 |
| Maps and vector tiles | 3 → 2 | 3 → 0 | 3 → 3 |
| Mark-side tween bookkeeping | 7 → 6 | 7 → 3 | 14 → 12 |

Script references count uses of imported feature bindings in the core's JavaScript/TypeScript
AST (Svelte script blocks included), excluding import declarations, comments, strings and
Svelte markup. They include references through extension points, not every feature-related
branch or property name. For example, Minimap components are used in markup, so their zero
script references do not mean no coupling. These are audit measurements, not ratchet metrics;
the earlier 2026-10-11 keyword totals in TODO used a different snapshot and matcher.
More calls to a service can accompany fewer implementation imports, as Facet's row shows.

namedMark's distinct static module specifiers fell from 71 to 69 (72 to 70 import declarations,
including type-only declarations). Counting fewer modules alone does not establish a boundary:
the moved state and teardown are traced in the extension-point descriptions below.

The outside-boundary total is **25 → 8**. Every remainder has a concrete owner:

- `bound/namedMark.svelte` imports `utils/series.js` to split a mark's own paths and brush
  series. It asks no Facet or Partition service. The feature matcher still classifies it as
  Facet/Partition; deciding whether to reclassify it requires the integrating agent to update
  the matcher and ratchet together. This audit leaves the recorded value at one.
- `viewCore.svelte` imports `utils/presentationOptions.svelte.ts`, which owns the Plot's
  presentation options, plugin-effect synchronization and disposal. The matcher permits only
  `presentation` and `presentationObject`, so this adapter remains one counted edge.
- `viewCore.svelte` directly imports `minimap.svelte`, `scenes/overview.svelte` and
  `utils/minimapSource.js`. Their UI/source wiring has no named extension point yet; those
  three edges remain architectural work, rather than an import-count exception added here.
- `scenes/interactive.svelte`, `utils/data.js` and `utils/proputils.js` read the per-object
  record from `utils/markAnimation.js`: completed-frame readiness and accepted field-write
  policies. Mark-side cache, track and staging lifetimes belong to the separate owners below.

The boundary implementations are present, and the targeted ratchet passes all 27 cases.
126.1 and 126.5 are marked done in the plan; 126.4 is tracked by 138.1. This inventory does
not close 126.2, 126.3, 126.6, 126.7 or the accumulated-stage acceptance in 126.8. Remaining:

1. Record the accumulated rendering/leak/export coverage named by those substages: drag and
   Force drag, offset reset/Escape; grid/facet Dodge and Dodge → Interaction; nested/map/globe
   frames, frame brushing, vector tiles and orthographic exports; tween-pipeline,
   animation-engine and keyed updates. Existing narrow checks do not certify that whole set.
2. Complete and attach the full local gate on the integrated candidate under TESTING.md,
   including Python bundles and the browser suite. The milestone gate belongs to the primary
   agent; this audit runs no GPU workloads or full suite.
3. Compare the accumulated implementation with the last accepted production baseline using
   interleaved Sunburst zoom/reset and steady Lorenz runs. Freeze both builds, discard a
   warm-up per build, alternate repetitions on the same machine/browser/DPR, and record CPU,
   frame p95, completed frames, readbacks/submits and separately instrumented GPU measurements.
   Apply the tolerances in the refactor plan. The retained Stage 121 comparison
   (`results/refactor-final.json`, `e95c208d` versus `9e0830f3`) predates these boundaries and
   cannot serve as their acceptance evidence. See
   [the production comparison procedure](../tests/perf/investigations/README.md#refactor-performance-gate-stages-112121).

## The extension points

Each has a feature owner, inputs, publication contract and release rule. TypeScript owners
and checked JSDoc coexist with inferred JavaScript APIs: `forceContext.js`,
`channelAnimation.js` and `presentation.js` are not themselves in the strict checking lists.
Do not infer complete type coverage from the existence of a context or controller. These
internal boundaries remain specific to their features; the separate public plugin registry
for effects, shading and numerical transforms does not replace them. Moving a closure
and its ambient mutable state into another file alone does not establish a boundary.

- **coordinateFrame** (`utils/coordinateFrame.ts`). Owner: coordinates. Plot and Frame borrow
  their options through this policy: automatic domain collection and padding, radial-domain
  publication, and fitting an authored map domain. A Plot owns one instance, retaining its
  Cartesian domains and ranges across coordinate changes; returning to Cartesian restores
  them unless newly authored values override them. It owns no subscriptions or arrays.
  Its pure helpers produce disk-label descriptors for layout measurement and validate angular
  axes for both Plot and Frame. Layout scheduling and margins remain with the view. Device-array
  mapping lives in `coordinateArrays`: connections pass resolved coordinate operations to it,
  while the generic data helpers know no projection. Tile publication queues register their
  cleanup with `view.lifecycle.rendererResources` (the existing `disposeOnce` owner); renderer
  teardown disposes these resources without naming tiles.
- **endpointController** (`utils/endpointController.js`, Stage 118.3). Owner: connections.
  namedMark creates one per mount (`createEndpointController(mount)`) and hands it each accepted
  binding with the displayed preparation it describes. It reads the mark's options, the frame on
  screen and the frame-chain revision, and publishes one entry in its view's endpoint registry.
  Released when the mark unmounts. It also re-exports `ENDPOINT_COMPOUND_CONTEXT`, which a
  compound mark (Bar, Histogram, BoxPlot, Pie) sets for the primitive it mounts.
- **connectionController** (`utils/connectionController.js`, TODO 126.1). Owner: connections.
  namedMark creates one per mount (`createConnectionController(mount)`) for a connection
  consumer (Line, Segments or Arrows3D; the Arrows chart mounts Segments). It reads the mark's
  `connections` descriptor (`update`), its options and the frame on screen; it resolves, matches
  and gathers the endpoints through the view's endpoint registry and reports each state to the
  mount. A preparation asks it to check the props (`check`), for the rows to draw (`resolve`:
  none, pending or the result) and to attach them to the prepared frame (`attach`); each
  publish goes to its live gather (`publish`), and the render loop's task calls `frame` for a
  3D placement that moves without an option event. Released when the mark unmounts.
- **forceContext** (`FORCE_CONTEXT`, `utils/forceContext.js`). Owner: Force and the static graph
  layouts. A layout sets it; Nodes and Edges select data without it. A mark reads its relation
  (`layoutRelation`), whether layout and drag are enabled, and registers the view that draws it
  for settling, bounds policy and Force dragging. Released with the registering view.
- **markMotion**, **displayedFrames** and **channelAnimation** (in `utils/`). Owners:
  animation (`markMotion.ts`, `displayedFrames.ts`, `channelAnimation.js`). The mark
  coordinator asks `channelAnimation` to derive and apply field policies;
  `displayedFrames` owns keyed staging and the temporary snap-row arrays, releasing them after
  uploads. `markMotion` owns the mark's tween cache, clock tracks, completion hold and pointer
  subscription. It borrows accepted animation metadata and invokes the existing channel writer;
  its release removes tracks and subscriptions and disposes cached tween values. These owners
  publish no data scopes. Three core readers still use `markAnimation`'s per-object record:
  the renderer marks a frame ready, and the field writers apply the accepted transition policy.
  Those are consumers of the animation contract, not mark-side lifecycle bookkeeping.
- **markPlacement** (`utils/markPlacement.ts`). Owner: Dodge. A mark creates a placement
  controller, which reads `DODGE_CONTEXT`, owns its zoom/resize watch and drawn-option
  subscription, and releases both on unmount. `prepare` validates the mark and its offsets,
  captures settings and claims the rows; its returned handle owns that preparation's claim.
  `place` returns an owned offset array and the channel to write; the prepared mark retains
  and releases the array after uploads. The planner reads only whether placement requires a
  full preparation. Marks outside this context install no per-frame placement task.
- **dragController** (`utils/dragController.svelte.ts` and `dragController.svelte`). Owner:
  drag editing. A mark creates one controller with its layout context and options. `policy`
  selects explicit channel editing or inherited layout dragging; `rows` admits layout dragging
  only for the simulation's unchanged row space. `prepare` resolves channels and validates
  their inverse paths; `publish` supplies the accepted configuration to the pointer handlers.
  The companion component mounts those handlers and releases their listeners on unmount.
  The controller borrows scopes and owns no arrays. The planner sees `interactivePositions`,
  not a Force-specific flag. Inverse operator rules live in `interaction/channelWriteback.js`;
  expression evaluation no longer imports or defines them.
- **facetService** (`FACET_CONTEXT` and `PARTITION_CONTEXT`, `utils/facetService.ts`, TODO
  126.5). Owner: Facet and Partition. A facet cell sets one `FacetService` per cell
  (`createFacetService` over its Facet's controller) and a Partition group sets its
  `PartitionGroup`; core code reads them with `facetService()` and `partitionGroup()` and
  imports no other Facet or Partition module. The questions it answers, each typed and
  documented there: the cell's identity, whether it is drawn, its Facet's chrome and outer axes;
  content and frame slots; the cell Plot's registration, memory and linked viewport; per-cell
  domains and plotted columns (scales="field"); shared scales (`sharedSource`, `scaleExtent`,
  `autoScale`, `autoCategory`); transform settings and runs (`run` takes a binning transform's
  shared bins and the interaction revision a run reads, so the core names neither); a mark's
  shared definition; settling (`track`); and an iterative layout's kept result. A frame passes
  its cell's service to its marks as `frame.facet`. Released with the cell; every registration
  returns its release and a mark withdraws its domains and columns as it unmounts. What stays
  in the core: a reused Partition group's data scope is revalidated for a new generation
  (categorical.js) as any reused scope is, and an embedded cell's Frame takes the private
  `_facetCell` prop (frameModel never promotes it to the root frame). The remaining import is
  namedMark's `series` (a mark's own `series` prop splits its rows into paths, TODO 62.1): it
  asks no Facet or Partition anything, and 126.8 decides whether it leaves the feature's list.
- **presentation** (`PRESENTATION_CONTEXT`, `utils/presentation.js`, TODO 37 and 138.1). Owner:
  the presentation effects. viewCore sets one Presentation per Plot
  (`utils/presentationOptions.svelte.ts`) from its `effects` list (the bloom settings,
  `setPluginEffects` for plugins' effects, TODO 138.3), a Frame's object effect adds its object
  (`scenes/presentationObject.svelte`, `addObject`; the atmosphere), and each disposes on
  unmount. Each effect is a hook at one stage: attachment (the glow's MRT output and its bloom),
  linear (fog, the glow's composite), display (the sky) or object (an atmosphere), with its
  order, cameras and export rule. The sky and the atmosphere are first-party plugins
  (`src/lib/plugins`, TODO 138.5): they use only the plugin contract, the core imports neither
  (the ratchet checks both directions), and the package entry and the scene renderer register
  them at startup. The render loop asks which attachments the scene wants (`attachmentsFor`),
  which hooks a render shows (`activeFor`), and which effects an export rasterizes
  (`rasterEffects`), and names no effect. The ratchet counts effect names in
  `scenes/interactive.svelte` and `viewCore.svelte`: 69 on 2026-10-15 before the hooks, 3 now.
  All three current matches are viewCore's rejection of the removed Plot `fog` keyword,
  including its replacement example; they no longer configure a rendering effect. A mark's `glow`
  (`objects/base.js`) and Frame's `atmosphere` keyword are props and stay.

Delaunay, Voronoi and Hull are bundled numerical plug-ins in `src/lib/plugins/geometry.js`.
Their existing component wrappers enter the generic transform runner; the core registry no
longer names these algorithms. The plug-in reads aligned host columns through `hostColumn`
(which preserves authored Float64 precision), publishes source-row provenance, and marks
validated polygon triangle columns with `geometry: "triangles"`. Polygon's own vertex
triangulation remains internal. The dependency ratchet checks all bundled plug-in paths in
both directions, including newly added modules.

### Numerical plugin boundary

`plot/plugins/transform.js` adapts registered computations to `utils/transforms/runner.js`.
The runner owns input alignment, cancellation, publication and disposal; plugins receive
borrowed columns and return owned arrays. Dedicated adapter helpers validate grid shape,
output masks, source provenance, graph identity, triangle geometry and inspection resources.
These contracts keep algorithm-specific branches out of the publication owner.

`plot/plugins/parameters.js` supplies defaults, recursive schema validation and dependency
discovery to both numerical transforms and graph layouts. The same schemas drive Python
parameter validation and the settings pane. `graphTransform.svelte` remains the one-shot
layout host, publishing through `publishLayout`; plugins do not start another layout lifecycle.

`plugins/*.manifest.js` describes named first-party components, their props and special
bindings. `scripts/plugin-components.mjs` generates their thin Svelte wrappers, public prop
types and scene options. The ordinary API generator then produces Python signatures and
reference metadata. Algorithm definitions supply the executable parameter schemas, so the
wrappers do not duplicate input validation. Third-party computations use the generic
`Transform` component and need no generated wrapper.

For authoring and ownership examples, read the [plugin reference](../src/routes/content/reference/plugins.svx).
For compositions of existing nodes, read the [template authoring guide](PORTABLE-TEMPLATES.md).

Density is bundled in `src/lib/plugins/density`, including its Gaussian kernels and
Violin layout. It uses the supplied JAX namespace, ordered group positions, allocation
preflight and shared grid/mask publication. The core neither imports nor registers the
algorithm. Numerical wrappers and their props come from the first-party component manifests.

## How a feature attaches

The pattern Stage 118.3 proved: the feature owns a controller (or a context service) with a typed
interface; the core starts it, passes it what it may read, and releases it. The planner reads
capabilities (`markKinds.js`), not feature names. To add one:

1. Write the controller in the feature's own module, with its interface typed (`// @ts-check`
   or TypeScript) and a comment naming its owner, what it reads, what it publishes and its
   release rule.
2. Start it from the core file, and route the core's other imports of the feature through it.
3. Add it to the feature's `extensionPoints` in the ratchet and lower the feature's recorded
   count; list it above.

namedMark and the render loop run per frame: a logic change there takes the interleaved
Sunburst/Lorenz production comparison (tests/perf/investigations/README.md).

Animation correspondence is separate from observation identity. Data, Plot and Frame
provide one inherited animation-group getter; `utils/animationGroup.js` resolves and
validates snapshot tokens. Mark lifecycle staging and expression TweenState consume those
tokens while connection endpoints, picking and selection retain Data identity. Grouped
row tweens read compact visible snapshots rather than padded source-table rows.
