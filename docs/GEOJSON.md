# GeoJSON maps

`GeoJSON` is a core GPU mark, with the same settings, legends, updates, picking,
minimaps, and PNG export as other marks. URL loading belongs to the application.
For a basemap from vector map tiles, `VectorTile` loads and styles them with GeoJSON
parts (docs/VECTOR-TILES.md).

```svelte
<script>
  import { Plot, GeoJSON, Legend } from 'hmplot';
  let regions = $state();
  let { countries } = $props();
</script>

<Plot coordinates="spherical" type="3d" sphericalView="projected"
      projection="mercator" lights={[{ kind: "ambient", intensity: 0.5 },
        { kind: "directional", position: [3, 4, 5], intensity: 2 }]}>
  <GeoJSON bind:this={regions} data={countries}
      fill="populationDensity" height="populationDensity"
      heightScale={continuous({ domain: [0, 1000], range: [0, 0.08] })}
      outlineColor="#ffffff" outlineWidth={0.7} lit
      onclick={event => console.log(event.feature)} />
  <Legend for={regions} channel="fill" label="Population density" />
</Plot>
```

## Data and joins

Accept Geometry, Feature, or FeatureCollection. All seven standard geometry
families are supported, including holes and mixed collections. Properties are
named fields; matching names take precedence over literals. `literal('white')`
forces a literal. Attribute arrays, including JAX arrays, have one row per
feature, not per vertex. Null geometries retain their feature index.

`Data` also accepts a FeatureCollection. It exposes properties and a reserved
`geometry` column. A property named `geometry` is an error. The geometry column
is structured host metadata, not a numerical tensor; Filter, Sort, and Facet
carry GPU indices into it.

```svelte
<Data value={countries}>
  <Filter where={{ field: 'continent', op: 'eq', value: 'Europe' }}>
    <Plot coordinates="spherical">
      <GeoJSON geometry="geometry" fill="populationDensity" />
    </Plot>
  </Filter>
</Data>

<Data value={measurements}>
  <Plot coordinates="spherical">
    <GeoJSON data={countries} featureKey="ISO_A3" dataKey="country"
             fill="rate" />
  </Plot>
</Data>
```

`data` and `geometry` are alternatives. Join keys match exactly, without coercion;
`featureKey="$id"` uses feature IDs. Duplicate measurement keys are errors, even
if the duplicate is absent from the geometry. Joined columns take precedence.
Unmatched regions retain a neutral fill and zero height. The features are matched
to measurement rows on the host, through a Map over the measurements' keys (as
`Join` does): a table's key column is read there without a readback, and a key
computed on the GPU is read back once per change; the measurements' other columns
stay on the GPU. Dictionary-encoded identifiers use `{ codes, categories }`.
Geometry and join indices are cached separately from measurements.

## Coordinates and height

Geographic source geometry always uses longitude/latitude **degrees**, even in
a plot whose other marks use radians. Cartesian plots interpret coordinates as
ordinary XY values. Only the first two coordinates are used; height is explicit.
No CRS reprojection or terrain interpretation is performed.

`height` defaults to zero. It maps through `heightScale`, a `continuous()` scale whose domain
and range default to `[0, 1]`,
which gives a clamped identity mapping. The output range must be nonnegative and
increasing, and the map is linear: a transform, a midpoint or a `"symmetric"` domain is an error. Missing heights are zero. Polygon holes remain open; multipart
regions retain one feature identity. Lighting is off by default. As with other lit marks, supply scene lights when
using `lit`; the example above includes ambient and directional lights.

- Spherical 3D `sphericalView="globe"` is the default. Radius is
  `baseRadius + radialScale * height`.
- `sphericalView="projected"` applies to **all marks**. The selected projection
  lies in X–Z with north toward −Z and elevation along +Y. `baseRadius` scales
  the footprint; `radialScale` scales elevation.
- Spherical 2D keeps horizontal wrapping and ignores height for position.
  Equirectangular, Mercator, and cylindrical equal-area projections are available;
  on a 2D Plot also equal-earth, natural-earth, albers and albers-usa (docs/SPHERICAL.md),
  where the worker splits features at the seam opposite `projectionCenter` and a triangle
  or boundary with a vertex off the map (albers-usa outside its insets) is not drawn.
- Flat GeoJSON can be painted inside Heatmap children. Extruded texture children
  are rejected.

Boundaries interpolate linearly in longitude/latitude, following
[RFC 7946](https://www.rfc-editor.org/rfc/rfc7946.html), rather than ordinary
Line's default shortest great-circle path. Geographic polygons are triangulated
and subdivided, including their interiors. Antimeridian chart cuts and Mercator
clipping retain feature identities. Paired cuts of the same feature do not gain
false boundary strokes or walls. Supply RFC-compliant cut geometry when a region
crosses the antimeridian; an uncut edge from 170° to −170° describes the long
linear longitude interval, not an inferred short crossing.

## Appearance and interaction

Defaults are a muted blue-gray fill, thin pale outlines, eight-pixel points,
and one-pixel lines. `fill` colors regions and points; `color` colors lines and
falls back to fill. `size` affects points, `width` lines, and `outlineColor` /
`outlineWidth` affect polygon and point boundaries. `missingColor` controls the
neutral missing-value color. Continuous and categorical fill legends use the
existing Legend component. Category toggles hide all parts of a feature.

Feature events include `featureIndex`, `featureId`, `feature`, `geometryPart`,
`dataCoordinates`, `geographicCoordinates`, `worldPoint`, and (for joins)
`tableRowIndex`. All faces of an extrusion select its original feature; holes
are not selectable. Editing boundaries is not included.

Compatible color/height updates use normal mark animation. Topology changes
replace geometry without vertex morphing. `mark.whenSettled()` waits for its
pending preparation and uploads; `plot.whenSettled()` also waits for geometry
preparation. Use `whenAnimationsFinished()` for final animated targets.

Geometry preparation runs in a cancellable worker, with allocation checks.
Measurements and rendering stay on the shared GPU. Completed frames remain
visible during preparation; errors identify the affected feature. Bounded globe
detail uses a 0.5° safety floor under extreme zoom; no unbounded subdivision is
performed. Polygon vertices are never randomly sampled in minimaps.

See the separate map, categorical, joined, filtered/faceted, projected, globe,
and mixed-geometry pages in the gallery. Country examples bundle the modest
Natural Earth 1:110m data locally with attribution and source checksum.

Globe geometry refines after zoom settles and retains finer prepared detail when zooming back out. This avoids repeated tessellation and uploads at detail thresholds; the existing allocation budget and 0.5° safety floor still apply.
