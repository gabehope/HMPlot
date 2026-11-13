# Surface textures and spherical coordinates

HMPlot supports a GPU-rendered child scene inside `Heatmap`. There is one
WebGPU renderer/device: child marks use a private scene and orthographic camera,
not another `Plot` or canvas. Existing workspaces remain Cartesian.

```svelte
<script>
	import { Plot, Heatmap, Line, Points } from 'hmplot';
	// Create density, paths and observations as JAX arrays after the existing
	// browser-only initializePlot() call. Retain/dispose them like other mark inputs.
</script>

<Plot
	coordinates="spherical"
	type="3d"
	angleUnit="degrees"
	baseRadius={1}
	radialScale={1}
	projection="equirectangular"
	overview
>
	<Heatmap
		fill={density}
		textureResolution={[2048, 1024]}
		fillScale={continuous({ domain: [0, 1] })}
	>
		<Line position={paths} />
		<Points
			position={observations}
			onclick={(event) => inspect(event.instanceId, event.dataPoint)}
		/>
	</Heatmap>
</Plot>
```

`/test/spherical` demonstrates child clicks and dragging, projection changes,
Cartesian/spherical switching, and the overview. Drag an off-white observation;
Escape restores its original position.

## Coordinates

Spherical positions are `[longitude, latitude, radialOffset]`. Omitted offset
means zero. Radius is `baseRadius + radialScale * radialOffset`. Longitude zero
faces +Z, east faces +X, and north is +Y. The default angle unit is degrees;
`angleUnit="radians"` changes the units of the supplied angles and bounds.

The default angular domain is −180…180 by −90…90 degrees. Heatmap `xbounds` and
`ybounds` specify its angular patch. Angular transforms must remain linear and
numeric. Coordinates, projection, radius, interpolation and subdivision tolerance
are available in Plot settings. Coordinate changes do not rewrite caller arrays.

`projection` accepts `equirectangular`, `mercator`, `equal-area`, `orthographic`,
`equal-earth`, `natural-earth`, `albers`, or `albers-usa`.
Two-dimensional equirectangular, Mercator and equal-area roots repeat across the
longitude seam; an embedded map shows one extent. Mercator stops at
±85.05112878°. Orthographic shows one disk, centered on longitude/latitude
`[0, 0]` by default. Set `projectionCenter` to choose another visible
hemisphere; dragging a 2D orthographic root rotates that center. The old
`pole` option has been removed. Graticules follow the center. Unless `axes2d` is
false, a 2D globe draws the sphere's outline and a graticule: a line every
15° (a 24th of the period) without labels, as d3's. An axis's `step` or
`tickCount` gives labeled lines of its own: meridians labeled along the
center's latitude (at their outer ends when the center is within 30° of a
pole), parallels left of the limb, and labels that would overlap hidden unless
the axis's `labelOverlap` is `"show"`. The graticule and reference rules are
GPU lines (TODO 141, `scenes/globeGuides.svelte`): built once in source angular
units, one segment per degree, and projected in the vertex shader through the
live center, as marks are, each segment cut at the horizon. Rotating changes
two uniforms; zooming rebuilds only when the zoom passes a power of two at
which a degree's chord would show (a sagitta over a quarter pixel), up to
1/16°. The graticule lies under the marks as a Cartesian grid does, reference
rules over them; a rule's dash is laid along the sphere's surface, so it never
slides as the globe turns and shortens toward the limb. The outline and the
labels (only an axis with a step, tickCount or a labeled rule has any) stay in
the SVG overlay, which samples just the labeled lines to place them. Vector
export samples each line at the export's resolution through the same
projection. Wheel zoom still turns the globe to keep the point under the
pointer fixed (a navigation rule, not a rendering one). There is no bundled
land layer: draw land from GeoJSON or a VectorTile source. Lines, bands,
Rects, GeoJSON polygons and boundaries, and Heatmaps and Images end at the
horizon instead of wrapping around the back of the disk, and a filled shape cut
by the horizon exports its outline along the limb.

`equal-earth` (Šavrič et al. 2018) and `natural-earth` (Natural Earth I) are
world maps; `albers` is a conic equal-area map with standard `parallels`
(default `[29.5, 45.5]`, d3.geoAlbers's) and its origin at `projectionCenter`;
`albers-usa` is d3.geoAlbersUsa's composite: the lower 48 in albers, Alaska
(scaled 0.35) and Hawaii as insets, each point in the first inset whose
rectangle holds it, so a point outside all three is not drawn. These map
longitude and latitude jointly (utils/mapProjections.js holds each one's CPU
forward and inverse, TSL, WGSL and jax forms, compared with d3-geo in
tests/unit/map-projections.test.js), so their outlines are curved and they do
not repeat: the map is one extent around the center longitude
(`projectionCenter[0]`), and Lines, GeoJSON and Heatmaps and Images are cut at
its seam, the center + 180° (an albers-usa path is cut between insets too). Edge
axes do not fit a curved outline: the Plot draws a graticule every 15° and the
sphere's outline, without labels (albers-usa draws neither, as d3's examples
don't). A click reports the longitude and latitude under the pointer through
the projection's inverse (Newton's method for equal-earth and natural-earth, as
d3-geo's). Lambert conformal conic is not implemented yet.

In a 2D spherical frame a `Rect` is a longitude/latitude box: `x0`/`x1` are
longitudes, `y0`/`y1` latitudes, and its edges follow meridians and parallels.
Area and ErrorBars likewise interpolate along parallels and meridians,
whatever the frame's Line `interpolation`. On a globe these fills run on
behind the horizon and are cut exactly at the limb; on a root flat map they
repeat with the map, one piece across the antimeridian. The z bounds of a
spherical Rect must be equal. The former orthographic "sector" that put a
radius in z now reports an error pointing to `coordinates="polar"`.

Use `coordinates="polar"` for an angle/radius chart. X is angle, Y is radius
offset and Z is height; `baseRadius` defaults to zero and `radialScale` to one.
The angular period is explicit and does not change when the X data domain
changes. For example, six custom units are a quarter turn when the period is
24:

```svelte
<Plot coordinates="polar" angleUnit="custom" anglePeriod={24}
  y={{ domain: [0, 3] }}>
  <Line x="angle" y="radius" />
  <Points x="angle" y="radius" />
  <!-- An annular Rect uses x0/x1 for angles and y0/y1 for radii. -->
</Plot>
```

`python/examples/15_polar_radius.ipynb` uses this X/Y convention. The sunburst
gallery renders polar annular sectors with `Rect`. Root polar guides use X for
angular spokes and Y for radius rings; `x.step` and
`y.step` set explicit spacing. A Heatmap or Image in polar
coordinates is a disk: angle along X, radius along Y.

Frames nest polar and spherical coordinates in each other and in Cartesian
charts: a polar child in log parents, a chart bent through a polar parent or
onto a globe, a globe or map inset. Points, labels, paths (with arrowheads only
at true ends), bands, error bars, Rects and polar sectors, Bars, GeoJSON in
globe and map children, and Heatmaps and Images follow the whole chain, are cut
at a nested horizon or seam, pick their source coordinates, and export as
vector paths where the backend supports them. A bent chart draws the guides it
owns along the bend. `docs/FRAME-IMPLEMENTATION.md` lists the
combinations that still report an error (for example Surface and 3D Prisms
in nested Frames).

Use `surfaceMode={true}` and `zScale` for scalar relief, in Cartesian or spherical
coordinates. Fixed scalar bounds map heights to `[0, zScale]`; on a globe,
`radius = baseRadius + radialScale * height`. `zScale` defaults to zero and is a
GPU uniform: adjusting it does not rebuild geometry, shaders, or painted textures.
`lit` enables lighting after child texture composition. The old `surfaceHeight`
component prop is accepted as an alias only when `zScale` is absent.

Surface `detail` supports up to 2048 subdivisions per axis. Defaults are unchanged;
2048 square detail is about 4.2 million vertices and 8.4 million triangles. Mesh
buffers are sized and checked before replacing the current geometry. Texture
resolution and mesh detail remain independent.

## Child marks and interaction

Child point, line, segment, arrow, text, image and plain heatmap marks use the
parent's data domain. A spherical child scene always uses a longitude/latitude
chart, independently of the outer map projection. Children have no axes, camera
controls, or overview. Their settings appear beneath their parent heatmap.

Child glyphs are painted onto the surface: their footprints foreshorten and distort.
Use ordinary marks outside the heatmap for independent geometry and screen-facing
symbols. Cartesian child texture resolution defaults to 1024×1024; spherical to
2048×1024. Child screen-space sizes are measured in texture pixels, so a child
drawn for a larger texture sets a larger size and width. The overview and PNG export reuse the completed texture.

Picking first identifies the visible surface and UV, then reads one pixel from an
unfiltered child ID texture. Child events retain `instanceId`, `uv`, and the ordinary
pointer handlers, and additionally contain:

- `dataPoint`: the parent chart's data coordinates.
- `surfaceUV`: the hit on the outer heatmap.
- `point`: the actual outer world-space position.

Marks with both `onpointerdown` and `onpointermove` participate in captured child
dragging. Implement data changes in those handlers. Camera gestures are suppressed
during the drag; `onpointerup` commits and `onpointercancel` handles Escape or native
cancellation. Leaving the surface retains the last valid hit. Coordinate calculation
uses canvas-relative client positions, including captured/retargeted pointer events.

## Paths, resources and implementation

Spherical `Line`, `Segments`, and `Arrows3D` default to shortest great-circle paths.
`interpolation="angular"` uses supplied, unwrapped angles for winding paths;
`"cartesian"` follows the Cartesian chord. Exactly antipodal endpoints use a
repeatable perpendicular plane. Add intermediate observations to specify another
route. Radial offsets interpolate linearly for great-circle/angular paths.

A WebGPU compute pass generates source-index/subdivision metadata with a default
projected tolerance of 0.5 pixels. Original attributes remain shared GPU buffers.
There is one 16-byte allocation-summary read per geometry rebuild; no point,
activation, parameter, or image arrays are read back for drawing. Reusable buffers
grow geometrically. Camera movement can reuse valid geometry while refreshed detail
is prepared. Data replacements wait for compatible geometry before publishing.

Main and overview paths have separate generated metadata caches. Overview sampling
preserves source identities and treats seam-crossing segments as sampling boundaries.
Point copies and repeated map tiles share source buffers. Texture color/ID targets
are double-buffered and published together; camera-only motion does not repaint a
child scene. Diagnostics report texture targets, versions, draw counts and geometry
errors. Retired resources are released after pending work settles.

Allocation errors preserve the previous completed frame and appear in the plot.
Recursive textured heatmaps and independent child cameras are intentionally rejected.
The generic CPU-converted `Surface` mark is not a spherical fallback; use GPU-native
`Heatmap` or `Image` instead.

## Validation

The snapshot contains `tests/unit/spherical.test.js` alongside the existing axis,
viewport and minimap fixtures. Application browser coverage is in
`tests/browser/spherical.spec.js`; Cartesian interaction regressions use the existing
surface/minimap suites. Package checksum, source patch and reconstruction information
are recorded in `vendor/spherical.json`.
