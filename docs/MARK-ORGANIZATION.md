# Mark organization: the Points/Rect pilot (Stage 118.6)

How a mark is laid out across files, traced for Points and Rect, and the outcome of the
colocation pilot (REFACTOR-PLAN-2026-10-09.md, P6e). Paths are under `src/lib/plot/` unless
they start with `src/`. Taken at c4371acf; the shared binding's parts below are as of 176f4cc6.

## The four layers

| Layer | Where | Owns | Change it for |
|---|---|---|---|
| Public wrapper | `bound/<name>.svelte`, exported from `src/lib/index.ts` and `composition.js` | The public component: its props type (`publicTypes.ts`), its handle (`getMark`, `endpoint`, `getLegendSource`), and which rendering component it binds | A public prop's type and JSDoc (`publicTypes.ts`), the handle, choosing between implementations (Rect's polar branch) |
| Shared binding | `bound/namedMark.svelte`, `utils/namedData.js`, `utils/markKinds.js` and the controllers it starts | Resolving channels against the data scope, preparation and publication, the update planner, live writes, interaction/tooltip/endpoint/feedback controllers, domains | Binding policy: what a channel accepts, a kind's capabilities (`markKinds.js`), what an update reuses or rewrites |
| Rendering component | `marks/<name>.svelte`, built on `utils/markComponent.svelte.js` | The mark's options node, its GPU object's lifetime, and the effect that writes prepared props into the object's fields | Render effects: which prepared props become which fields, option defaults, per-mark validation |
| GPU object | `objects/<file>.js`, classes extending `BasePlotObject` (`objects/base.js`), mostly through `Scatter` | Geometry, TSL materials, field buffers, picking material, `exportKind` for vector export | GPU geometry and materials |

Dependencies run one way: wrapper → namedMark → rendering component → GPU object, with
`utils/` modules below all of them. The wrapper passes its rendering component to namedMark as
`component`; namedMark never imports a rendering component. No cycle crosses the layers.

Since Stage 118.5 every rendering component exports `getMark()`, the object `markComponent`
made, and namedMark reaches the GPU object only through it (`currentMark()`, or a captured
child's `getMark()`), not through its legend handle. As the object's publisher it still writes
the object's fields, options and upload chain; everything else reads the accepted
`MarkBinding` (`utils/markBinding.js`).

Inside the shared binding, each decision has one owner (paths under `utils/`):

| Part | Owns |
|---|---|
| `markKinds.js` | Each kind's capabilities, including the update paths it allows (`liveChannels`, `liveWriter`, `retains`, `feedbackChannels`) |
| `markUpdatePlan.js` | `planMarkUpdate` (reuse-static, write-live, swap-mask or prepare) and `planFeedbackUpdate`: pure functions; namedMark applies their choice and publishes |
| `markBinding.js` | The accepted `MarkBinding` per mark object in `ViewServices.marks`; readers acquire it for work that outlives a publication |
| `endpointController.js`, `feedbackOpacity.js`, `markTooltip.js`, `markDomainPublisher.js` | Endpoint registration, interaction opacity, tooltips and `@tooltip` rows, domain publication, each from the accepted binding |
| `dodgeLayout.js` | Dodge's collision placement, reached through `DODGE_CONTEXT` |
| `preparedRetirement.js` | Retiring a prepared entry after its consumers finish, and the replaceable release that holds a live write's newest scope |

The file names do not line up across the layers for these two marks, which is most of what
makes them hard to find:

| Public name | Wrapper | Rendering component | GPU object |
|---|---|---|---|
| Points | `bound/scatterPoints.svelte` | `marks/scatterPoints.svelte` (options label "Sprites") | `ScatterSprite` in `objects/scatter.js` |
| Rect, Cartesian | `bound/rect.svelte` | `marks/rect.svelte` → `marks/prism.svelte` with `kind="rect"` | `PrismObject` in `objects/prism.js` (`rect = true`) |
| Rect, 2D polar | `bound/rect.svelte` | `marks/polarRect.svelte` (label "Polar Rect") | `PolarRectObject` in `objects/polarRect.js` (extends `PrismObject`) |
| Prism | `bound/prism.svelte` | `marks/prism.svelte` | `PrismObject` in `objects/prism.js` |

## Points

```
src/lib/index.ts, composition.js            Points
└─ bound/scatterPoints.svelte               wrapper: PointsProps, handle, endpoint (kind "Points")
   └─ bound/namedMark.svelte                shared binding (kind "Points")
      ├─ utils/namedData.js                 channel resolution; Points branches: transparent fill,
      │                                     field validation
      ├─ utils/markKinds.js                 capabilities: point, position writer, dodge, symbols,
      │                                     outlines, frame "nested", feedbackChannels ["size"]
      ├─ utils/markUpdatePlan.js            planMarkUpdate; planFeedbackUpdate (hover/size path)
      ├─ utils/proceduralChannels.js        live writer "position"
      ├─ utils/feedbackOpacity.js           interaction opacity controller
      ├─ utils/markDomainPublisher.js       Points branch: data-unit glyph footprints
      ├─ utils/dodgeLayout.js, dodge.js     Dodge placement (Points only)
      └─ marks/scatterPoints.svelte         rendering component (markComponent "Sprites")
         ├─ objects/defaultOptions.js       ensureScatterSpriteOptions
         ├─ objects/outlines.js             setOutlineColors
         └─ objects/scatter.js              ScatterSprite extends Scatter extends BasePlotObject
            ├─ objects/outlines.js          outline TSL
            ├─ utils/symbols.js, shapeFields.js, shapes.js   symbol distance TSL, shape registry
            ├─ utils/coordinateOperations.js, frameMapping.js, framePlacement.js, aspect3d.js
            └─ objects/base.js              fields, picking, blending, export hooks
```

Picking: the GPU pick buffer is generic (`src/lib/picking/`); Points differ only in
`copyPickingMaterial.js` (PointsNodeMaterial's `sizeNode`) and `scenes/interactive.svelte`
(points keep depth testing in the pick pass). Export: `utils/vectorExport/capture.js` reads
symbol codes for `exportKind` "points"; `twoDimensional.js` and `geometry.js` (`pointSymbol`,
`symbolPath`) draw them. Compound users: BoxPlot, Violin, Swarm, Lollipop.

## Rect (and Prism)

```
src/lib/index.ts, composition.js            Rect                          Prism
└─ bound/rect.svelte                         wrapper; 2D polar → PolarRaw   bound/prism.svelte
   └─ bound/namedMark.svelte                 shared binding (kind "Rect" / "Prism"; flatPrism)
      ├─ utils/namedData.js                  Prism shape validation
      ├─ utils/markKinds.js                  Rect: outlines, geometricWidth, frame "patches",
      │                                      live writer "corners" (x0..z1)
      ├─ utils/proceduralChannels.js         corner writer (rectangleArrays)
      ├─ utils/markDomains.js, frameMarks.js, facetEngine.js, connectionPrepare.js
      │                                      Rect/Prism branches over rectangles.js
      ├─ marks/rect.svelte                   9-line forwarder: <Prism kind="rect">
      │  └─ marks/prism.svelte               rendering component for Rect and Prism
      │     └─ objects/prism.js              PrismObject extends Scatter (rect flag)
      │        ├─ utils/rectangles.js        rectangleArrays, prismFootprint
      │        ├─ utils/analyticEdges.js, antialias.js   analytic edge coverage
      │        ├─ utils/curves.js, coordinateOperations.js, frameMapping.js
      │        └─ objects/outlines.js, objects/scatter.js (Scatter base), objects/base.js
      └─ marks/polarRect.svelte              2D polar rendering component
         └─ objects/polarRect.js             PolarRectObject extends PrismObject (sectors)
```

Export: `exportKind` "prism" and "polar-rect" branches in `utils/vectorExport/twoDimensional.js`;
`threeDimensional.js` treats a flat Rect (and Bar/BoxPlot/Histogram boxes) as a footprint via
`prismFootprint`. Compound users: Rect ← Histogram, BoxPlot, Pie (and the Sunburst gallery
example in polar); Prism ← Bar.

## Shared or specific

| File | Specific to | Also used by |
|---|---|---|
| `bound/scatterPoints.svelte` | Points | (generated registries and `scene/components.js` name its path) |
| `marks/scatterPoints.svelte` | Points | test routes `feature-gallery`, `playground` |
| `objects/scatter.js` | shared | `Scatter` is the base of Points3D, Prism, Triangles, Labels, GeoFaces; `ScatterSprite` also draws GeoJSON and vector-tile points |
| `utils/symbols.js`, `shapeFields.js`, `shapes.js` | shared | the `Scatter` base, vector export, themes, legends |
| `utils/dodgeLayout.js` | Points (capability `dodge`) | Dodge, interaction |
| `bound/rect.svelte` | Rect | (generated registries) |
| `marks/rect.svelte` | Rect | none; forwards to `marks/prism.svelte` |
| `marks/polarRect.svelte`, `objects/polarRect.js` | Rect (2D polar) | Pie and Sunburst through Rect |
| `marks/prism.svelte`, `objects/prism.js` | Rect + Prism family | Bar, BoxPlot, Histogram, Pie; `PolarRectObject` extends it |
| `utils/rectangles.js` | Rect + Prism family | markDomains, facetEngine, connectionPrepare, proceduralChannels, vector export |
| `objects/outlines.js` | shared | Points, Rect, Prism, Triangles, Uncertainty, GeoJSON |
| `bound/namedMark.svelte`, `utils/namedData.js`, `markKinds.js`, `markUpdatePlan.js`, `proceduralChannels.js`, `feedbackOpacity.js`, `markDomainPublisher.js` | shared | every named mark; Points/Rect differences are capability lookups or kind branches inside them |
| `objects/base.js`, `objects/defaultOptions.js`, `utils/markComponent.svelte.js`, `src/lib/picking/*`, `utils/vectorExport/*` | shared | every GPU mark |

Tooling that names these paths: `tests/browser/gpu-counters.js` (lists `marks/<name>.svelte` and
`objects/<file>.js` to count builds), `tests/unit/python-signatures.test.js` (Points' module
path), `tests/unit/picking-material.test.js` (`objects/scatter.js`), and source links in
`docs/NODE-EXECUTION.md`.

## Pilot outcome: no moves

Nothing moved. The files that are truly Points- or Rect-specific are too few, and moving them
would scatter each mark further rather than gather it:

- **The wrappers are pinned.** `bound/scatterPoints.svelte` and `bound/rect.svelte` are the
  `module` paths in `scene/registry.json`, `python/hmplot/registry.json` and
  `scene/components.js`. Moving or renaming them changes generated files, which this slice
  must not do.
- **Points has one movable file.** Only `marks/scatterPoints.svelte` is Points-only.
  `ScatterSprite` shares `objects/scatter.js` with the `Scatter` base that five other object
  classes extend, and GeoJSON and vector tiles construct it too. Separating it would be an
  extraction, not a move.
- **Rect's own files are the polar ones.** Cartesian Rect is a nine-line forwarder to Prism's
  component and object, which the plan keeps shared. A `rect/` folder would hold
  `marks/rect.svelte`, `marks/polarRect.svelte` and `objects/polarRect.js`, leaving the wrapper
  in `bound/` and the implementation in `marks/prism.svelte` and `objects/prism.js`. Rect would
  then span four directories instead of three. A Rect+Prism family folder would move the shared
  Prism GPU family, which serves Bar, BoxPlot, Histogram and Pie, into a per-mark place.
- **The hard part is not in mark-specific files.** What differs between Points and Rect lives as
  capabilities and kind branches inside shared modules: `markKinds.js`, `namedData.js`,
  `markDomains.js`, `markDomainPublisher.js`, `frameMarks.js`, `facetEngine.js`,
  `connectionPrepare.js`, `proceduralChannels.js` and the vector exporters, which dispatch on
  `exportKind`. File moves cannot colocate these.
- **The layer-first layout is consistent.** About twenty marks use `bound/`, `marks/` and
  `objects/` with one file per layer, and the build counter enumerates by layer directory.
  Two half-colocated marks would add an exception without removing one.

The plan's fallback is to keep the useful separation and apply only clearer naming and
documentation. The renames that would help most are blocked by the same pin:
`bound/scatterPoints.svelte` → `points.svelte`, and `bound/`/`marks/` → names that describe the
layers. Renaming only the rendering component or object (for example
`marks/scatterPoints.svelte` → `marks/points.svelte`) would make Points' file names differ
between layers in a new way. The options labels ("Sprites", "Polar Rect") are visible in the
settings pane, so changing them is a behavior change, not cleanup. This document's layer table
and name map are the navigation aid instead.

**What got easier:** finding Points' and Rect's implementation from the public name (the name
map above), seeing that Rect is Prism with a flag in Cartesian frames and its own object in 2D
polar, and knowing which layer owns props, binding policy, render effects and GPU code.

**What did not:** the kind branches in shared modules remain the main thing to search for when
changing one mark's behavior. Stage 118.5 (removing proven-equivalent kind lists) and further
`markKinds.js` capabilities reduce them more than any directory layout could.

**Expand to other marks?** No. Keep the layer-first layout. If the maintainer later accepts a
regenerated registry diff (the module paths are internal, so the public API and API report do
not change), do one rename stage for every mark at once: `bound/` → `public/` (keeping
`namedMark` in a separate binding directory), consistent file names per public name (`points`,
`points3d`, `text`, `arrows`), and updates to `gpu-counters.js`, the Python-signature test and
`docs/NODE-EXECUTION.md`'s links. Do not colocate per mark.

<a id="current-mark-navigation-map-october-11-2026"></a>

## Current mark navigation map (October 17, 2026)

**Codex-generated addendum, updated October 17, 2026.** Audited against `321c8382`,
including the Arrows and ErrorBars template migrations and Ribbon's consolidation into Area.
The Stage 118.6 outcome above remains accepted. This addendum
provides navigation now and concrete naming candidates for
[R12 / TODO 122.12](READABILITY-PLAN-2026-10-09.md#distinguish-identical-filenames-by-role);
it does not move implementation files or select the optional registry-changing migration.

Read the layers by their input and owner, rather than by their repeated basename:

| Start here for | Input / owner | Current location |
|---|---|---|
| Authored channels and a component handle | Props such as a column name/expression; stable public handle and implementation selection | A public wrapper below; `publicTypes.ts` owns primitive prop definitions, and template signatures generate their props |
| Resolving and preparing those channels | Data scope, expressions, scales and update causes; accepted binding and preparation lifetime | `bound/namedMark.svelte`, `utils/namedData.js`, planner/controllers |
| Applying prepared values | Prepared arrays/positions and options; component instance, field writes and cleanup | A `marks/` component below, usually using `utils/markComponent.svelte.js` |
| Geometry, field storage, materials or picking | Runtime fields/options; object resources and export capabilities | An `objects/` class below, or Text3D's directly constructed mesh |

For **Anchor**, `bound/anchor.svelte` accepts authored props and exposes the endpoint handle;
it passes `marks/anchor.svelte` to shared namedMark. That component receives prepared
`position` values and calls `updateFields` on the object it creates. `objects/anchor.js`
stores the position field, with no geometry/material/picking/legend and no scene-graph draw.
Calling all three files renderers would hide the actual distinction.

The table covers all **16 wrapper files** in `bound/` (excluding shared `namedMark`) and
all **19 components** in `marks/`, plus the Arrows and ErrorBars chart templates. Paths are
relative to `src/lib/plot`. Public names come from `src/lib/index.ts` and its compound exports.

| Public or internal name | Authored-prop entry / wrapper | Prepared instance component(s) | Runtime implementation |
|---|---|---|---|
| Anchor | `bound/anchor.svelte` | `marks/anchor.svelte` | `objects/anchor.js`: Anchor, invisible position field |
| Points | `bound/scatterPoints.svelte` | `marks/scatterPoints.svelte` | `objects/scatter.js`: ScatterSprite and shared Scatter |
| Points3D | `bound/scatter3d.svelte` | `marks/scatter3d.svelte` | `objects/scatter3d.js`: Points3D, extends Scatter |
| Rect, Cartesian | `bound/rect.svelte` | `marks/rect.svelte` → `marks/prism.svelte` | `objects/prism.js`: PrismObject, Rect variant |
| Rect, 2D polar | Same Rect wrapper chooses this branch | `marks/polarRect.svelte` | `objects/polarRect.js`: PolarRectObject, extends PrismObject |
| Prism | `bound/prism.svelte` | `marks/prism.svelte` | `objects/prism.js`: PrismObject |
| Segments | `bound/segments.svelte` | `marks/segments.svelte` | `objects/segments.js`: Segments |
| Line | `bound/line.svelte` | `marks/line.svelte` | `objects/segments.js`: Segments with line/path preparation |
| Arrows | `../compound/arrows.svelte`, chart template | `marks/segments.svelte`, through the Segments wrapper | `objects/segments.js`, cap="arrow"; `../threeExtensions/materials/arrowCap.js` |
| Arrows3D | `bound/arrows.svelte` | `marks/arrows.svelte`, solid arrows | `objects/arrows.js`: Arrows3D, extends Segments |
| Text | `bound/label.svelte` | `marks/labels.svelte` | `objects/labels.js`: Labels, atlas/sprite text |
| Text3D | `bound/text.svelte` | `marks/text.svelte` → `marks/label.svelte` | Plain Three Mesh constructed in `marks/label.svelte`; geometry from `utils/labels.js` |
| Heatmap | `bound/heatmap.svelte` | `marks/heatmap.svelte` | `objects/heatmap.js`: Heatmap |
| Image | `bound/image.svelte`, also owns image loading | `marks/image.svelte` → `marks/heatmap.svelte`, image variant | `objects/heatmap.js`: Heatmap with image texture policy |
| Surface | `bound/surface.svelte` | `marks/surface.svelte` | `objects/surface.js`: Surface |
| Area | `bound/area.svelte` | `marks/area.svelte` → `marks/uncertainty.svelte`, area variant | `objects/uncertainty.js`: Uncertainty, extends Segments |
| ErrorBars | `../compound/errorBars.svelte`, template definition in `../compound/errorBars.js` | `marks/segments.svelte`, through the Segments wrapper | `objects/segments.js`, cap="bar"; the template composes its lower/upper endpoints |
| Flow | Public `flow.svelte` preprocesses edge rows → private `bound/flow.svelte` | `marks/flow.svelte` → `marks/uncertainty.svelte`, flow variant | Same Uncertainty family; public preprocessing is a separate owner |
| Polygon | `bound/polygon.svelte` (vertex rows through Triangulate, or triangle rows) | `marks/polygon.svelte` | `objects/triangles.js`: Triangles; Polygon/geometry-transform output |

The geometric families also serve specialized entries outside the ordinary namedMark path:

| Entry | Current path and composition | Ownership distinction |
|---|---|---|
| GeoJSON | `geojson.svelte` directly constructs GeoFaces (`objects/geoFaces.js`), GeoSegments (`objects/geoSegments.js`) and ScatterSprite (`objects/scatter.js`) | Owns feature geometry, row/feature identity and specialized publication; no invented wrapper/instance pair |
| VectorTile | `vectorTile.svelte` composes GeoJSON/Text; live loading uses `vectorTileLive.svelte` | Tile loading/style/slot lifetimes are additional responsibilities, not a new GPU object family |
| Compound marks | `src/lib/compound/*.svelte` import the tested `composition.js` surface | Compose public primitives and transforms; preserve that boundary rather than importing leaves to imitate the file layout |

## Proposed mark filenames

These destinations follow the lower-camel style already used in the repository. Keep public
component names, props, class names, kind/export strings and visible settings labels unchanged.
`Instance` means the component owns or adapts a runtime instance; it need not draw. `Object`
means the runtime implementation, with `Objects` for a module containing a shared family.
Do not split shared families merely to make filenames match public names.

All destinations below are relative to `src/lib/plot`; all remain proposals.

| Current authored wrapper | Proposed destination |
|---|---|
| `bound/anchor.svelte` | `public/anchor.svelte` |
| `bound/scatterPoints.svelte` | `public/points.svelte` |
| `bound/scatter3d.svelte` | `public/points3D.svelte` |
| `bound/rect.svelte`, `bound/prism.svelte` | `public/rect.svelte`, `public/prism.svelte` |
| `bound/segments.svelte`, `bound/line.svelte` | `public/segments.svelte`, `public/line.svelte` |
| `bound/arrows.svelte` | `public/arrows3D.svelte` (Arrows stays a chart template) |
| `bound/label.svelte`, `bound/text.svelte` | `public/text.svelte`, `public/text3D.svelte` |
| `bound/heatmap.svelte`, `bound/image.svelte`, `bound/surface.svelte` | `public/heatmap.svelte`, `public/image.svelte`, `public/surface.svelte` |
| `bound/area.svelte` | `public/area.svelte` (both baseline fills and bands use Area) |
| `bound/flow.svelte` | `binding/flowMark.svelte`, private authored-channel adapter; public `flow.svelte` → `public/flow.svelte` |
| `bound/polygon.svelte` | `public/polygon.svelte` |
| `bound/namedMark.svelte` (not a wrapper) | `binding/namedMark.svelte`, shared binding |

| Current prepared component(s) under `marks/` | Proposed destination(s) under `markComponents/` |
|---|---|
| `anchor.svelte` | `anchorInstance.svelte` |
| `scatterPoints.svelte`, `scatter3d.svelte` | `pointsInstance.svelte`, `points3DInstance.svelte` |
| `rect.svelte`, `prism.svelte`, `polarRect.svelte` | `rectInstance.svelte`, `prismInstance.svelte`, `polarRectInstance.svelte` |
| `segments.svelte`, `line.svelte` | `segmentsInstance.svelte`, `lineInstance.svelte` |
| `arrows.svelte` | `arrows3DInstance.svelte` |
| `labels.svelte`, `text.svelte`, `label.svelte` | `textInstance.svelte`, `text3DInstance.svelte`, `textMeshInstance.svelte` |
| `heatmap.svelte`, `image.svelte`, `surface.svelte` | `heatmapInstance.svelte`, `imageInstance.svelte`, `surfaceInstance.svelte` |
| `area.svelte`, `flow.svelte` | `areaInstance.svelte`, `flowInstance.svelte` |
| `uncertainty.svelte` | `uncertaintyInstance.svelte` |

| Current runtime file under `objects/` | Proposed filename in the same layer |
|---|---|
| `anchor.js`, `scatter.js`, `scatter3d.js` | `anchorObject.js`, `scatterObjects.js`, `points3DObject.js` |
| `prism.js`, `polarRect.js`, `segments.js` | `prismObject.js`, `polarRectObject.js`, `segmentsObject.js` |
| `arrows.js`, `labels.js` | `arrows3DObject.js`, `textObject.js` (screen-sized arrows use Segments) |
| `heatmap.js`, `surface.js`, `uncertainty.js`, `triangles.js` | `heatmapObject.js`, `surfaceObject.js`, `uncertaintyObject.js`, `trianglesObject.js` |
| `geoFaces.js`, `geoSegments.js` | `geoFacesObject.js`, `geoSegmentsObject.js`; public geographic component paths need a separate R7 scope decision |

Arrows and ErrorBars stay in the template layer; there are no separate Ribbon wrappers or
instances to rename. There is no separate Line, Image, Rect or Flow object file to introduce,
and Text3D keeps its mesh implementation. Object helpers (`base`, `types`, `defaultOptions`, `outlines`,
`geoAppearance`) follow R5/R7/R12's responsibility names after any required extraction;
they are not individual mark implementations.

Deliver the navigation map immediately. If the coordinated rename is selected, follow R12's
quiet-window procedure: one owner for entry points/generator paths/checking allowlists,
mechanical changes separate from logic changes, maintained regeneration and inspected
module-path diffs, unchanged public API/signatures, updated GPU counters, package consumers
and both Python bundles. The optional path migration does not block the rest of readability.
