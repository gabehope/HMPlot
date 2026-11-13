# HMPlot mark consolidation design plan

**Codex-generated**

**Date:** October 10, 2026

**Status:** Proposed design work; no source implementation authorized by this document.

**Source:** local main `e95c208d2ea20be9f7981c87fa808f9033c81367`.

This plan owns the former R14 from the [readability plan](READABILITY-PLAN-2026-10-09.md):
Flow composition, compound domain contributions and renderer-family responsibilities.
These changes need explicit design and rendering review even when public behavior is kept.
They are separate from formatting, helper extraction and naming work. Preserve useful public
features; any intentional compatibility change needs a concrete migration and explicit decision.

## Design scope

The initial assessment was made at `8729abe2404bc55041c48f380b8f5e942831d654`;
this plan is reconciled with local main `e95c208d2ea20be9f7981c87fa808f9033c81367`.
Stages 116.1–116.2 column borrowing/acquisition, 116.4 transform dependency declarations,
117 typed services/bindings, 118.3 mark controllers and 119 frame unification have landed.
Use those contracts directly; do not repeat their migrations.

The completed [Stage 118.6 organization pilot](MARK-ORGANIZATION.md) is accepted: preserve
the layer-first layout. No per-mark directory moves are planned. A future all-mark naming
stage requires a separately accepted generated-registry diff and a quiet integration window.
Current public wrapper paths remain stable while the implementation pilots proceed.

There is a useful compound conversion to pursue: **Flow as a geometry transform plus a band
renderer**. Several other public marks already share their underlying implementations. The
larger readability gain is making that sharing explicit, removing duplicated compound
policies, and separating unrelated geometry currently housed in the same base classes.
Keep convenient public names; the target is fewer independently maintained responsibilities.

### Distinguish three forms of reuse

- **Preset or semantic adapter:** one existing renderer with different inputs/defaults,
  such as Image over the raster renderer or Rect over the extent renderer.
- **Compound:** a transform and/or several marks that present one chart concept, such as
  Histogram, BoxPlot, or Smooth. Flow should follow this structure.
- **Renderer primitive:** a distinct geometry and paint contract, such as screen-facing
  symbols, a connected stroke, a filled band, a raster field, or a lit mesh.

These categories need not be separate public namespaces. A component can keep its public
name and Python API while becoming a preset or compound internally. Keep semantic policies
in their existing owners, including `markKinds.js`, rather than creating a competing registry
or teaching a universal renderer to branch on every public name.

### Assessment by family

| Marks | Current sharing | Recommended change |
|---|---|---|
| **Flow** | Public [flow.svelte](../src/lib/plot/flow.svelte) performs its own asynchronous curve/data-view preparation, then draws through the shared band object | **First compound pilot:** internal FlowGeometry transform plus a band-pieces renderer; remove the bespoke transform lifecycle |
| **Area / Ribbon** | Their small raw components both delegate to `uncertainty.svelte` | Keep public semantic adapters; expose a clearly named internal band renderer and named preparation policies |
| **ErrorBars** | Shares `Uncertainty`, which inherits Segments, but uses distinct capped-stroke geometry | Separate capped-segment behavior from filled-band behavior; do not replace it with three public Segments by default |
| **Line / Segments** | Both already render through [objects/segments.js](../src/lib/plot/objects/segments.js) | Share appropriate preparation/publication helpers; retain explicit connected-path versus independent-segment topology |
| **Rect / Prism / PolarRect** | Raw Rect delegates to Prism; PolarRectObject extends PrismObject | Preserve the shared extent/patch family and coordinate-specific strategies; document the family within the existing layers rather than expanding every rectangle into polygons |
| **Image / Heatmap** | Raw Image is a short Heatmap preset; image-file loading lives in its bound component | Classify as raster presets; separate image loading from raster binding where useful. There is no second Image GPU renderer to eliminate |
| **Arrows / Arrows3D** | One raw component prepares both; distinct object classes share Segments | Name the shared binding clearly, preserve screen-space and solid-geometry rendering strategies |
| **Points / Points3D** | Both inherit Scatter; Points3D's object is only 37 lines at this snapshot | Retain distinct geometry; narrow the shared base rather than replace solid points with Prism |
| **Text / Text3D** | Text uses the batched label atlas; Text3D uses a font/TeX geometry mesh | Keep both renderers and document their roles; audit the raw Text3D forwarding component separately without reopening the completed organization pilot |
| **Surface / Heatmap / Triangles** | Share lower-level infrastructure, but have different mesh, texture, and interpolation contracts | Keep separate renderers; do not convert Surface into current flat Triangles or Heatmap into one Rect per cell |
| **Triangles / GeoFaces** | Duplicate corner-field setup and the same barycentric triangle geometry | Share those small pieces; retain distinct flat-polygon versus geographic/extruded material behavior |
| **RuleX / RuleY** | Already tiny adapters over one Rule component | Keep this pattern; no new consolidation project needed |

The raw Area, Ribbon, ErrorBars, and Flow adapters total just **49 physical lines** at this
snapshot. Removing those files is not a substantial simplification by itself. Similarly,
Rect, Image, and billboard Arrows already have tiny adapters. Keep a small wrapper when its
name and public contract explain the code better than another indirect configuration table.

### First pilot Flow as ordinary composition

The public Flow component currently resolves four endpoint channels, reads their values,
samples cubic boundaries into sixteen pieces per edge, constructs a `createDataView`, and
manages cancellation, errors, frame replacement, and array disposal itself. Its rendering
then passes through `bound/flow.svelte` and `marks/flow.svelte` into the shared band engine.

Proposed structure:

```text
existing public flow.svelte wrapper
  internal FlowGeometry transform
    shared BandPieces renderer
```

Use the existing transform lifecycle, Stage 116.4 dependency analyzer and column borrow/acquire contract. The diagram describes responsibility, not a required public-wrapper move. Keep the current
sixteen-piece algorithm in the first change so the composition refactor has a bounded
behavioral diff. Express the geometry preparation as a named operation with clear inputs,
output arrays, source-row indices, and cleanup responsibilities. Every generated piece must
continue to refer to its original edge for colors, selections, tooltips, and metadata.

`BandPieces` is a proposed internal responsibility, not a new public API requirement. It
accepts independent lower/upper boundary segments. Public Ribbon is not a substitute: its
input is an ordered series of x/lower/upper samples, while Flow has arbitrary two-dimensional
edge boundaries. Reuse the current band rendering machinery and retain the logical Flow
kind at binding/interaction boundaries.

Characterize per-piece color before extraction: the current Flow path calls
`segmentAttribute(fill, count)`, which can shorten an array whose length equals the piece
count. Independent Flow pieces should not accidentally inherit a vertex-to-segment rule.
Treat this as a focused regression candidate; separate any confirmed fix from the mechanical
lifecycle move.

**Completion evidence:** the component no longer owns a separate asynchronous data-view
lifecycle; changed inputs, cancellation, failure, and unmount use the maintained transform
path; all pieces retain their source edge identity. Merely moving `flow.svelte` into the
compound directory does not complete this task.

### Clarify the shared band and stroke families

The name `uncertainty` hides that its implementation draws Area and Flow as well as Ribbon
and ErrorBars. Split its responsibilities into band preparation/rendering and capped-stroke
preparation/rendering, retaining small shared numerical and lifecycle helpers. Use names
such as `BandRenderer` and `CappedSegments` only after their responsibilities match.

Preserve the distinctions verified in
[uncertainty.js](../src/lib/plot/utils/uncertainty.js),
[the current renderer](../src/lib/plot/objects/uncertainty.js), and
[markDomains.js](../src/lib/plot/utils/markDomains.js):

- **Area** allows the value to cross its baseline. The renderer splits a crossing to avoid
  overlapping bow-tie triangles. Ribbon rejects reversed lower/upper intervals. An Area
  scalar baseline outside a log domain also has its own actionable validation error.
- **Ribbon** can use a private transposed orientation for Violin, defaults to an x brush,
  and breaks at missing/hidden samples. Area defaults to an xy brush. Both have whole-series
  interaction semantics that cannot be inferred from their final GPU triangles.
- **ErrorBars** keeps a stem and both caps as one logical row. Caps are CSS-pixel lengths,
  follow the projected local tangent, and appear only at genuine ends after refinement.
  Three public Segments would need extra projected-offset, identity, settings, picking,
  animation, and legend machinery to recreate this behavior.
- **Line** needs adjacency, joins, continuous dash distance, valid-row limits, basis-expanded
  channels, and vertex-to-segment provenance. Ordinary Segments represents independent rows
  and has different endpoint/keyed-selection capabilities. Sharing the stroke engine is
  useful; substituting independent pairs is not equivalent.

Do not replace bands with Polygon/Triangles as a general simplification. The current triangle
renderer maps its corners and interpolates the interior linearly; the band engine refines
both boundaries and cross-sections through nonlinear frames. Band outlines must also avoid
drawing internal subdivision seams. A Cartesian-only experiment would not retire that
general band machinery.

A narrower **Cartesian Flow-to-Triangles experiment** is possible using triangle edge flags.
It would produce two triangles per existing piece, preserving the source edge for both, and
could remove Flow-specific band preparation branches. First compare translucent export seams
(Flow defaults to opacity 0.2), thick outlines on thin bands, and complete boundary coverage:
the current triangle outline only sees that triangle's flagged edges. Flow's `frame: null`
capability limits nested frames but is not a blanket rejection of root polar coordinates.
Keep BandPieces as the first pilot unless the triangle experiment demonstrates equivalent
supported behavior with less total machinery.

### Consolidate the existing compounds before adding more

There are concrete duplicated policies and one notable helper-mark workaround:

| Location | Change | Preserve |
|---|---|---|
| [Lollipop](../src/lib/compound/lollipop.svelte) and [Pie](../src/lib/compound/pie.svelte) | Share the repeated companion-property list and selection-response derivation | Main parts produce selections; companion parts respond without becoming duplicate producers |
| Lollipop, Pie, [BoxPlot](../src/lib/compound/boxPlot.svelte), [Smooth](../src/lib/compound/smooth.svelte) | Share subscription/cleanup for primary-part visibility | One public legend/handle owner and companion visibility after settings or legend changes |
| [Bar](../src/lib/compound/bar.svelte), BoxPlot, [Violin](../src/lib/compound/violin.svelte), [Swarm](../src/lib/compound/swarm.svelte), Lollipop | Share categorical-orientation inference with an explicit ambiguity policy | Lollipop permits two numeric axes; other marks require a categorical axis or explicit orientation; Swarm's displacement axis differs from the measurement axis |
| BoxPlot and Violin | Share category-scale/order subscription | Order changes after mount and cleanup on replacement/unmount |
| Violin | Replace zero-size, zero-opacity Points used to establish category/value channels with an explicit domain/category contribution | Category registration/order, complete density range, automatic axes, hidden-series behavior, facets, and axis titles |

Violin's invisible Points are an especially relevant band-aid: a full mark is mounted for
its side effects even though its geometry is unwanted. Establish the required contribution
through the existing data/scale/domain owners, then remove the helper mark. Do not delete
it before accounting for all its category and extent behavior, or add a second domain registry.

Use a few small typed helpers with the visible composition left in each component.
`ThemeDefaults` already handles theme layering and compound description identity; it does
not provide all of these lifecycle/interaction contracts. Avoid a universal compound factory
with many unrelated flags.

Existing good compositions provide useful models: Polygon is triangulation plus Triangles;
Smooth is Regression plus Ribbon/Line; Ecdf is ECDF plus a step Line; Callout is Text with
box/leader configuration. Keep Text's integrated box/leader renderer: those parts depend on
the same measured label geometry, pixel placement, and pick identity.

### Narrow inherited rendering responsibilities

The shared [Scatter base](../src/lib/plot/objects/scatter.js) is used by Points3D, Prism,
Triangles, Labels, and GeoFaces. It also owns symbol fields, point sizing, pixel offsets,
shape-registration subscriptions, and point-specific shader behavior. Some subclasses need
`buildsItself` to avoid a premature construction-time build. Reusing point machinery for all
instanced geometry is a larger maintainability concern than the small public adapters.

Extract common instance position/paint/opacity/lifecycle behavior, and make glyph-specific
fields and subscriptions explicit for the families that consume them. Keep distinct
geometry/material builders. Make initialization order visible before retiring `buildsItself`;
do not replace it with another implicit constructor convention or a deeper inheritance tree.

Share corner registration and barycentric geometry between
[Triangles](../src/lib/plot/objects/triangles.js) and
[GeoFaces](../src/lib/plot/objects/geoFaces.js), leaving projection, extrusion, horizon,
lighting, and boundary policy local. For a smaller cleanup, audit `ScatterSprite.setValues`:
it duplicates its parent except for a `mask` branch whose only in-repository assignment sets
it to null. Removing the obsolete branch/override could retire roughly 25 lines, subject to
the existing compatibility review for objects exposed by `getMark()`.

### Order and acceptance

1. Extract the small, exact compound-policy duplicates with existing behavior unchanged.
2. Implement the Flow transform/composition pilot and explicit band-pieces contract.
3. Separate band versus capped-stroke responsibilities; replace Violin's helper Points once
   the domain/category contribution is explicit.
4. Narrow the shared instance base and consolidate triangle setup, using the completed
   P5/P6 binding contracts. Do not bundle this larger renderer change with the Flow pilot.

Preserve root exports, Python names, theme keys, settings/legend identities, and documented
handles. Document any intentional handle/API change under the previously agreed breaking
change policy. Change generator inputs and regenerate affected files when moving public
component implementations; do not edit generated registries by hand.

Use the test map and numerical retirement targets below; add only missing behavioral coverage. Verify drawn and exported
geometry, Area baseline crossings, Ribbon gaps, continuous Line joins/dashes, caps after
zoom/nonlinear mapping, source-row events, category order, selection/visibility propagation,
and failure/cancellation settlement. Compare resource owners, draw calls, preparations,
compiles, and frame progress so a compound does not unexpectedly multiply the work.

**Done when:** a bespoke lifecycle or duplicated policy has actually disappeared, renderer
families have understandable inputs, and the public mark's semantics remain explicit.
Fewer public names, fewer files, or more components labeled “compound” are not success
criteria. These shared families can also reduce duplicated work in the proposed
[WebGL fallback](WEBGL-FALLBACK-REPORT-2026-10-10.md), but that does not require flattening
their distinct rendering contracts.

## Numerical retirement targets

| Slice | Inspected baseline | Completion target |
|---|---|---|
| Shared instanced-object initialization | `buildsItself` has 5 code references: four static declarations and the Scatter guard | 0 references, with explicit construction order and no replacement flag serving the same workaround |
| Violin domains | 2 invisible Points tags in mutually exclusive orientation branches; 1 helper mounted at runtime | 0 helper tags and 0 mounted helper marks; domains/categories contributed through the existing owner |
| Flow preparation | 1 bespoke asynchronous data-view lifecycle in the public component | 0 bespoke lifecycles; the existing transform owns cancellation, replacement and release |
| Compound policy | Multiple selection/visibility/orientation implementations listed above | One owner for each equivalent policy; record exact consumers before extraction and preserve differing orientation rules |

Count references across moved files. These are semantic retirement targets, not line ceilings.
Do not expand a change solely to reach another slice's metric.

## Existing test anchors and required gaps

| Invariant | Existing evidence | Gap to close in the relevant slice |
|---|---|---|
| Band masks, orientation and validation | [uncertainty.test.js](../tests/unit/uncertainty.test.js): gaps, orientation and log-baseline validation; [guides.test.js](../tests/unit/guides.test.js): input shape validation; [document-export.spec.js](../tests/browser/document-export.spec.js): exported geometry | Baseline-crossing pixels and reversed-interval rejection need explicit cases unless an existing fixture is confirmed to cover them; compare translucent outlines too |
| Violin orientation, groups and category/value domains | [density.test.js](../tests/unit/density.test.js), Density cases in [padded-views.test.js](../tests/unit/padded-views.test.js); [category-order.spec.js](../tests/browser/category-order.spec.js): Violin pixels when axis order differs from data | Assert domains and visible geometry in both orientations after removing the helper; numerical output alone is insufficient |
| Compound selection/visibility policies | [document-export.spec.js](../tests/browser/document-export.spec.js): hiding BoxPlot/Smooth through props, legend and mark options hides every part; [lollipop.spec.js](../tests/browser/lollipop.spec.js): hiding heads hides stems through props and legend | Identify a selection assertion for the exact migrated companion policy or add one; packaging tests do not establish selection/visibility parity |
| Flow source-edge identity and color | [graph-composition.test.js](../tests/unit/graph-composition.test.js) (Sankey interval/row inputs), graph examples in [examples.spec.js](../tests/browser/examples.spec.js) | Add a focused per-edge color/provenance case and cancellation/replacement coverage for the transform pilot; the suspected shortened-fill path is not a reproduced bug |
| Connected strokes, caps and refinements | [line-buffers.spec.js](../tests/browser/line-buffers.spec.js), [stage14-nested-paths.spec.js](../tests/browser/stage14-nested-paths.spec.js), [document-export.spec.js](../tests/browser/document-export.spec.js) | Preserve output after camera/nonlinear changes and source-row picking where implementation changes |
| GPU object lifecycle | [attribute-lifecycle.test.js](../tests/unit/attribute-lifecycle.test.js), [rebuilds.spec.js](../tests/browser/rebuilds.spec.js) | Verify initialization/disposal and compiled output for every class losing `buildsItself` |

These links identify existing anchors, not a claim that every proposed behavior is already
covered. Run the affected cases with the local rendering gates, fresh servers and DPR 2.
For any change reaching expression evaluation, dependency analysis, mark planning or live
writes, perform the readability plan's paired production Sunburst/Lorenz comparison.

## Separate compatibility audit

Inherited world-unit and vertex-color branches in
[lines.js](../src/lib/threeExtensions/materials/lines.js), and ScatterSprite's mask override,
may be obsolete within normal rendering. Objects exposed by `getMark()` can still make them
observable. Audit construction, copying and caller mutation before proposing removal;
preserve ordinary Line/Segments styling and picking. A removal affecting exposed objects
requires its own migration decision and cannot be labeled formatting or dead-code cleanup.
