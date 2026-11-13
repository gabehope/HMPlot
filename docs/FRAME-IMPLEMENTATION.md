# Frame implementation checkpoint

This document records the shipped frame-composition subset. The larger exploratory
design is intentionally split into later work rather than exposing unfinished APIs.

## Implemented

- Frame and generated Python constructor/update metadata, including placement.
- Nested Frame scopes inside Plot, including intervening Data scopes.
- Independent per-dimension scale ownership and explicit automatic domains.
- Parent-coordinate Cartesian ranges, composed through linear/log/sqrt ancestors.
- Shared scale chains for supported mark shaders, axis ticks, inverse coordinates, numerical path distances, and document export. Affine chains collapse; nonlinear chains have a 16-stage bound.
- GPU path detail uses the complete ordered coordinate chain and the existing bounded subdivision pipeline (utils/curvedPaths.js). Each path interpolates in its own Frame's source space, then its compute pass evaluates the packed operation table shared with connection gathers (utils/operationTable.js). A piece whose ends differ in visibility (an orthographic horizon, a negative polar radius, a nested Mercator limit) or in periodic seam tile is cut at the change by bisection. Joins connect only pieces that share an exact parameter, so a cut ends without a false join and an arrowhead appears only at a path's true end. A repeating root map keeps unwrapped longitude, as its wrapped copies need. Straight 2D Lines and Segments in nested, curved or log/sqrt chains export as vector paths from the same table. Bands (Area) are cut where either edge changes visibility and also refine across: every piece shares one row count, chosen by the same pass from the cross-section's chord error, so neighboring pieces split shared edges alike and never crack. Each band vertex maps from its source point, so an angular cross-section follows its arc. Refined vertices map tolerantly, because a cut point can round just past its horizon or zero radius in the vertex shader.
- Anchored Cartesian point/path frames: CSS-pixel size in 2D, world-space size in 3D, XYZ rotation and parent/billboard orientation. Camera-specific shader matrices prevent minimap/export passes from changing the live placement state.
- Spatial axes follow the frame's bounds. Anchored frames no longer draw a duplicate viewport-sized axis overlay.
- Reactive parent-domain propagation, inherited-domain contribution routing, range/anchor extent contributions and cleanup.
- Grid Dodge expands integer counts into GPU-indexed unit cells, preserving source-row order and provenance, with shared output for multiple marks.
- Facet nested inside Plot or Frame partitions the parent into band or grid child frames while sharing one renderer and camera. Shared, free, and field-domain collection reuse the existing facet engine.
- Embedded facet cells expose stable Frame handles, remain part of Plot settlement/export, and support categorical band headings without leaking parent category scales into local numerical dimensions.
- Brushing on child frame axis strips (utils/brushStrips.js). Shift-drag on a child frame's own tick strip (a ranged frame, a facet cell, or a twin axis) brushes the column that frame's marks, and the marks of child frames that inherit that axis, plot on it. The band is drawn only on the strip, never across the child's or the plot's interior. Root interior and root strip brushing are unchanged; when both the root and child frames have brushable marks, root gestures use the root's marks. See "Brushing" in [docs/DATA.md](DATA.md#brushing).
- Frame ranges use parent data coordinates.
- Inherited dimensions suppress duplicate decorations; getFrames aliases frame enumeration.
- Axis titles (TODO 21): marks register one vote per axis with their frame (`axisName(axis, vote, owner)` in the AXIS_CONTEXT, modelled on `domain()`): a column name, `null` for unnamed data, or nothing. A dimension the frame inherits forwards the vote to the frame that owns it, and ownership changes replay the registrations. A frame resolves each axis (utils/axisTitleRules.js): its label, else a categorical position scale's label, else the one name its votes hold. A Frame that owns a dimension reads only its own label, while a root frame, a facet cell and an inherited dimension read labels through option inheritance. Titles live in the frame entry (`entry.titles`) and `options.axisTitleState` (for the settings pane), never in options, and change only when a string changes (the view's `diagnostics.counters.axisTitleUpdates`).
- In a Plot, `axes2d` decides whether the implicit root frame draws its axes. Only frames that draw on the root rect's sides (the root, sibling root-side Frames, twin axes) stack axis margins or turn the root axes on; spatial frames (ranged or anchored frames, facet cells, and frames inside them) draw in their own boxes. An explicit `axes2d` prop always holds; without it, a twin axis turns the root axes on as before. Previously any Frame with a hidden axis, including an inherited one, re-derived `axes2d` from every frame, so a Frame inside embedded facet cells showed the root axes (the facet's layout extent, -0.5 to n-0.5) under `axes2d={false}`.
- A child frame's own dimension draws its axis (ticks, labels, title, and grid) only once the frame has a domain for it: an explicit domain, a categorical scale, an extent from the marks that plot on it (directly, through inheriting descendants, or shared across facet cells), or a settings edit. Before, it drew the ancestor's domain that its bounds read through option inheritance, which says nothing about the frame: a range-only facet cell whose marks all sit in a Frame that owns x drew a lone "0" tick and an "X" title. So a range-only or `domain: "auto"` child with no data yet has no axis until data arrives, and `visible: false` is not needed for a dimension nothing plots on. An inherited dimension follows the frame it inherits from. The root frame is unchanged: with no data it still draws its default domain, as an empty plot always has.
- Mark coverage in nonlinear and anchored frames (utils/frameMarks.js): points, labels, lines, segments, arrows, Rect, Prism, Area, and ErrorBars map every vertex through the frame chain. Frame mappings are separable per axis, so axis-aligned rectangles, error bars, and flat band edges stay exact under log/sqrt parents. A sloped band edge is a curve on screen: in a nonlinear frame Area split each interval into pieces with the same adaptive rule as Line (utils/curvedPaths.js, sized so both edges meet `subdivisionTolerance`), sample both edges in data space, and map every vertex, so a Line drawn along a band edge stays on it. Bands therefore share Line's nonlinear-frame limits: an interval that needs more than its budget of pieces (256 pieces, halving as a mark's intervals pass 256 and 512, and 64 from 513 on: they refine in batches of 1,024, TODO 136.11) reports the curved detail error instead of drawing; before this change such a band drew chords. Text3D uses marks/text.svelte and marks/label.svelte (including `tex`), and maps its geometry on the GPU through every chain, anchored and nested frames included. The compatibility check re-runs when the frame topology changes. Links with a `curve` (quadratic, cubic, link-horizontal, link-vertical, step) are built the same way as Line: the curve is evaluated in data space from the data-space control points, and each sample is mapped through the frame chain. The plan asked for control points mapped first and the curve evaluated after mapping; that was not done, on purpose: a straight link over a Line between the same two points coincides with it, and link curves bend with the frame like every other path instead of being smooth screen-space curves. A cubic link's midpoint is therefore the mapped data-space midpoint (checked by the frame-marks pixel test).
- Picks report `frame` (the view-local frame key) alongside frame-local `axisValue`; Python events report `event.frame`, the nearest enclosing Frame or Plot node. Facet cells have no Python node, so for a mark in a Facet cell (embedded or not) `event.frame` is the node around the Facet while JS picks report the cell's own frame key; `event.facet_cell` tells cells apart (python/README.md).
- Frame placement descriptors carry `version: 1`; a missing version is read as a legacy scene, and any other value (including `0`, `"1"`, or null) is rejected with "unsupported placement version <v>; expected 1" in both JS and Python. A unit test keeps the two version constants equal.
- Degenerate or transform-incompatible domains (for example log over [0, 10]) draw no ticks and map to NaN instead of throwing during rendering, hovering, or export.
- Anchor and connections across frames (Stage 15, [docs/CONNECTIONS.md](CONNECTIONS.md)): the invisible `Anchor` mark, `connect()` / `hm.connect`, `mark.endpoint(at)`, and `facet.endpoint(name)` / `partition.endpoint(name)`. A Line, Segments, Arrows3D, or Arrows with `connections` draws between endpoint marks in any child frames it contains: each endpoint is mapped through its own frame chain (nested Frames, embedded Facet cells, log/sqrt ancestors) and the connector draws the result without mapping it again. A per-Plot endpoint registry keyed by definition and cell resolves repeated definitions and forward references; matching is cached per data revision; positions follow animation, `@time` channels, and frame range sliders live on the GPU. Endpoints in 3D world-size placed frames are followed; 2D pixel-anchored and billboard frames are rejected.

## Frame model and the Plot's root

One internal frame model per view (`createFrameModel`, utils/frameModel.ts; Stage 119) is what
viewCore, `axis.svelte`, `frame.svelte` and the brush and tooltip controllers ask about
ownership. It holds three facts:

- The logical content tree (`ROOT_CONTENT_CONTEXT`): marks, Frames and the wrappers that mount
  their children after asynchronous work (`pendingRootContent`: Provider,
  Transform, VectorTile, Force, Tree, GraphTransform, GraphData, Nodes, Edges), keyed by
  component ownership, not DOM or registration order. `selectRootFrame`
  (utils/rootFrameSelection.js) picks the root from it. A wrapper's pending slot keeps a sibling
  Frame from being promoted before its children register.
- The published root: the promoted top-level Frame's key, or null for the Plot's implicit root.
  viewCore publishes a selection once the content settles (`activate`), and settlement waits for
  it (`whenPublished`).
- The registered frames (`FrameEntry`), their parents and each dimension's mode: "local" (the
  frame owns the scale), "inherited" (a child that configures none of domain, range, transform or
  scale reads its parent's, and its marks' domains count in the owner) or "adopted" (a promoted
  root Frame owns a dimension it leaves to the Plot: an explicit Plot domain holds, and its axis
  draws when the Plot's 2D axes do).

The Plot's implicit root is an ordinary Frame: viewCore renders the same `axis.svelte` that
`<Frame>` uses, with no legacy props or duplicate root state. A domain the Plot sets is its root
frame's (`implicitRoot()`, `explicitDomain(axis)`). Every content of a Plot has a frame, so a
mark's domains (and a live VectorTile's tile bounds) reach its frame, else its facet cell,
through `ViewServices.domains.route`; the view keeps no bounds collector of its own, and a
facet's `setDomain` writes its root frame only. Logical ownership stays independent of mount
order, and theme defaults, generated coordinate defaults and authored values stay distinct.

## Brushing

Moved to the "Brushing" section of [docs/DATA.md](DATA.md#brushing).

`brushController.svelte.ts` owns gesture/strip state, previews, commit timers, pointer capture
and cancellation; `brushOverlay.svelte` only presents its state. `tooltipController.svelte.ts`
owns pointer placement and asynchronous read generations; marks own their tooltip membership.
Both controllers are created once and read changing renderer/frame/layout dependencies through
getters. `viewCore` retains camera/layout configuration, public handles and event ordering.
Root-frame changes, 2D/3D switches and teardown cancel pending work before releasing capabilities.
Capability cleanup checks the installed owner's identity. Frame registration and domain-change
notifications keep their existing semantics; this extraction does not introduce a second store
or change structural/value notification rules. Empty brush resets reuse existing empty arrays.

## Examples

- `/examples/nonlinear-frames`: child interval inside a logarithmic parent.
- `/examples/anchored-frames`: fixed-pixel frame with rotation.
- `/examples/waffle-grid`: unit cells expanded from category counts.
- `/examples/embedded-facets`: grouped bars created by Facet inside one Plot.
- `/examples/strip-brushing`: brushing an inset frame's own axis strip.
- `/examples/parallel-coordinates-connected`: one Line through the points repeated in every cell of an embedded Facet, each cell with its own y scale and a Frame that owns x (so the cell draws only its y axis, and that axis's strip brushes the Frame's points).
- `/examples/before-after-arrows`: arrows from points to an Anchor, matched by key.
- `python/examples/40_frame_brushing.py`: the same strip brushing from Python.
- `python/examples/38_nested_frames.ipynb`: matching standalone Python constructions.
- `python/examples/38_nested_frames.py`: script twin of the notebook, including rects and ribbons inside frames.
- `/test/nested-frames`, `/test/nonlinear-frames`, `/test/anchored-frames`, `/test/frame-marks`, `/test/frame-brush`, `/test/nearby`, `/test/embedded-facets`, `/test/grid-dodge`, `/test/connections`, `/test/frame-cells`: small deterministic browser fixtures.

## Limitations and remaining stages

GraphData, Force node tables, Tree partitions, DAG routing, Sankey layout, and the Flow mark are implemented in Stage 16. The graph composition API and examples are described in [COMPOSITION.md](COMPOSITION.md).

Guides of a bent chart (a Cartesian range warped through a polar or
orthographic parent) or a fitted curved child (a polar or globe child in
Cartesian ranges) are hidden by default; `visible: true` on an axis draws them
along the chain (utils/warpedGuides.js): grid lines at its major and minor
ticks, its axis edge (a polar child's outer ring for the angle) and tick labels
outside it, each line refined with the export sampler and cut at a horizon,
seam or invalid radius. Tick density follows the bent edge's length on screen.
The overlay exports them as vector paths.

### Support matrix

What renders in a nested, bent or placed Frame (a polar child in log parents, a
chart bent through a polar parent or onto a globe, a globe or map inset, a
placed polar inset), and what still reports an error instead of drawing:

| Family | Works | Still reports an error |
| --- | --- | --- |
| Points, Text, Anchor | every chain | none |
| Line, Segments, Arrows3D; Arrows and ErrorBars templates over Segments | every chain; cut at horizons, seams and invalid radii; heads only at true ends | none |
| Area | polar and Cartesian overrides, including charts bent by a polar parent or warped onto a globe; their own 2D spherical frame as longitude/latitude pieces | a 3D globe |
| Rect, Histogram, Bar | as bands; each Rect refines as a patch, polar sectors in their own angle and radius, and a flat Rect in its own 2D spherical frame is a longitude/latitude box | a 3D globe; 3D or non-rectangle Prisms in nested overrides |
| GeoJSON | spherical children (ranged or placed globe and map insets) under any ancestors, including bending ones (log/sqrt or polar parents); root globes cut at the horizon | Cartesian (non-geographic) GeoJSON in a nested, nonlinear or placed frame |
| Heatmap, Image | polar roots and children, nested log/sqrt parents, placed frames, charts in polar parents, on globes (cut at the horizon), on a root flat map (one piece across its antimeridian, repeated with it) or on a placed map inset (wrapped at its antimeridian), their own globe or map frame under affine ancestors | their own spherical frame, or a chart on a map, under a bending ancestor |
| Surface | Cartesian frames with linear parents | nonlinear, placed or nested curved frames |
| Text3D | every chain (it is a label mark) | none |
| Guides | root, nested and facet frames draw only the axes they own; bent charts and fitted curved children draw theirs along the bend (`visible: false` hides one) | none |
| Connections | endpoints through mixed polar, log/sqrt and spherical chains; connectors on a 2D globe or map route great circles in its longitude and latitude, cut at the horizon | connectors on a 3D globe; endpoints in pixel-anchored frames |

Vector export follows the same families (docs/DOCUMENT-EXPORT.md): textures,
GeoJSON fills and 3D content use the raster layer.

The notes below describe how each family maps. Stage 14 supports points,
labels, anchors, paths (Line, Segments, Arrows3D), bands (Area),
error bars and flat Rects and polar sectors in these combinations: Cartesian ranges
warped through a 2D polar or centered orthographic spherical parent, a polar disk fitted uniformly into
Cartesian ranges, a flat centered orthographic disk fitted into Cartesian
ranges, placed flat maps and polar insets, and rigid tangent Cartesian insets
on 2D orthographic or 3D spherical parents. These cases retain
source-coordinate picking. An error bar refines its interval like a Line, so
an angular bar arcs; it caps only its true ends, across the local tangent, and
a bar cut at a horizon has no cap at the cut. A flat Rect whose chain bends it
(a polar or spherical ancestor, or a turn under a nested log/sqrt parent)
refines as a patch between its four corners with the band rule, and a polar
sector under a bending ancestor refines the same way in its own angle and
radius; a Line between two corners matches the patch edge vertex for vertex.
Axis-aligned Rects under separable log/sqrt parents, and sectors in their own
polar frame or under affine fits and placements, keep their exact whole
meshes. 3D polar fitting and surface interior subdivision remain open.
Rotated frames cannot produce column brushes. The `tests/browser/stage14-*.spec.js` specs test each
combination and its limits.

Connections have their own limits ([docs/CONNECTIONS.md](CONNECTIONS.md#limitations)): endpoints in pixel-anchored or 3D billboard frames are rejected. A connector in its own 2D globe or map frame draws spherical paths, while one on a 3D globe is rejected. Curved connectors use their last rest-state controls during motion and catch up at rest. Connections stay within one Plot.

Frame clipping was dropped by decision: marks in a ranged or anchored child may draw outside the child's box when their data exceeds its domain, and child axis labels are not clipped. If a use case needs it, the cheapest route is a per-frame scissor rectangle for axis-aligned Cartesian children.

Surface renders in texture or mesh space outside the per-vertex frame mapping, so it requires a Cartesian frame with linear parents and reports an error otherwise. A 2D Heatmap or Image whose chain bends it (a polar operation anywhere, including a polar root, or a nested log/sqrt parent) or places it maps every grid vertex's source point through the whole chain, and its texture and heatmap children follow by UV (`warped()` in objects/heatmap.js). Its grid resolution comes from the screen curvature of the mapped bounds, probed on a 9 x 9 lattice whenever the camera or chain changes (`warpDetail` in utils/surfaceGeometry.js: a chord's sagitta k h² / 8 and the triangle twist within `subdivisionTolerance`, 8 to 256 cells per side). A Cartesian root and linear ranged frames keep the direct quad. On an orthographic ancestor followed only by affine operations (a chart on a globe), that operation maps unclipped, `framePoint`'s `horizon` collector returns the facing of its input, and the material's `maskNode` discards fragments whose interpolated facing is negative: exact within the grid's chords, since orthographic projection is linear in 3D. The mark's own spherical frame, a flat map's seam and a 3D globe stay rejected (`sphericalAncestor` in utils/frameMarks.js). GeoJSON (and GeoJSON with null fill) follow the same rule for a different reason: their faces and boundaries do map every vertex through the frame chain (geoFaces.js and geoSegments.js use mapPosition), but the geometry worker triangulates and subdivides features once in data space, so under a nonlinear chain a sloped polygon edge or fill is a chord between mapped vertices and would not meet a Line drawn along it. Both components run frameCompatibility, re-check it when the frame topology changes, and hide their geometry (and drop its instances) while it fails. A spherical map child (a ranged globe or map child, a placed inset) is supported under any ancestors: faces and boundaries map through the whole chain, unwrapped, since the worker keeps every triangle and segment inside one longitude extent split at the map's own antimeridian (`seamLongitude`). On an orthographic map a vertex behind the horizon keeps its projection; faces discard fragments whose interpolated facing is negative, and boundaries trim at the facing's zero along their chord. Orthographic projection is linear in 3D and the ancestors are affine, so both cuts land within the worker's subdivision sagitta of the true horizon. The same cut fixes a root orthographic map, whose back vertices were the 1e20 sentinel and smeared a crossing polygon toward the corner. Under a bending ancestor (log/sqrt or polar parents) each vertex still maps exactly, and the worker's geographic subdivision (edges of at most `angularStep`, 5 degrees) keeps each chord's sagitta far below a pixel for fitted disks: a globe disk spanning 60 degrees of a polar dial bends each 5 degree chord by about 0.02 px. The facing mask and seam cuts are unchanged, so they are exact to within the same chords. Cartesian GeoJSON is not subdivided, so in a nested, nonlinear or placed frame it stays rejected. Anchored frames are rejected by the same rule even though an affine placement maps the triangulation exactly (a 60 x 60 px square draws correctly); allowing them needs picking and export checks first. A rotated Rect inside a nonlinear frame refines its edges as a patch, like a Line between its corners; at a log root, as a Line there, its edges stay straight on screen.

A child frame that sets its own `domain` (an interval or `"auto"`) gets a linear transform unless it names one, so `x={{domain: [0, 100]}}` inside a log parent is a linear 0..100 scale; with a `range` it is placed in parent coordinates, composed through the parent's log. An explicit `transform` still wins. A child without a domain (decoration-only, or `range` alone with an inferred domain) inherits the parent's transform. Before this rule, the child inherited the parent's transform and a log parent applied log to 0..100, drawing nothing.

Nested anchored orientation, 3D picking inside anchored frames, and minimap lifecycle behavior remain outside this release boundary.

## Focused verification

- Numerical frame mapping, nonlinear runtime chains, pixel-metric rotation and inverse mapping, plus existing frame/histogram unit tests.
- Chrome: inherited scale updates, inset axis extents, camera zoom, nonlinear mapping, position-buffer reuse, PNG/SVG glyph alignment, fixed-pixel placement and rotation, unchanged canvas counts, and removal.
- Grid Dodge numerical count/identity/preflight checks and a live GPU multi-consumer/update check.
- Python nested scope/placement construction and generated signature checks.
- Svelte type checking.

Real VS Code notebooks, spherical nested frames, and the full renderer suite were outside this focused pass. Cross-frame connections have their own unit and browser tests (tests/unit/connections, connection-prepare, connection-gather, connect-protocol; tests/browser/connections.spec.js and python-connections.spec.js).
