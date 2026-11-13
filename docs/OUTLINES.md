# Outline support (Stage 95)

An outline is a border of a filled mark. Its width defaults to zero; enabling a border
does not change the mark's data domain, footprint or hit target.

| Mark | Outline behavior |
|---|---|
| Points; Swarm; Lollipop heads | Inside the symbol, in CSS pixels (at most the radius). |
| Flat Rect; Bar; Histogram; BoxPlot boxes | Inside the rectangular boundary, in CSS pixels. Extruded Rect boxes have no border stroke, as with Prism. |
| Polar Rect; Pie | Inside the sector's arcs and radial caps, in CSS pixels. A complete ring has no angular seam; a disk has no inner border. |
| Area; Flow; Violin | Upper and lower boundaries in CSS pixels. Interval joins and end cross-sections are not outlined. |
| Polygon; DensityBands | Polygon-owned edges or contour level boundaries in CSS pixels; triangulation diagonals and internal cell edges remain hidden. |
| GeoJSON | Region-boundary strokes and point borders, in CSS pixels, per feature. Line features retain their own color and width. |
| VectorTile area parts | Existing region-boundary strokes use each part's outline color/width. Tile line parts use color/width; place labels have no glyph outline. |
| Text; Callout | No glyph outline. Their separately styled `box` retains its outline color/width. |
| Line; Segments; Arrows; ErrorBars; Ecdf; Smooth; Routes; GeoJSON with null fill | Use color and width for the stroke. There is no second outline stroke. |
| Points3D; Prism; Surface; Heatmap; Image; Text3D | No outline channel. |

## Color, width and opacity

Outlined marks accept `outlineColor`, `outlineWidth` and `outlineOpacity` (Python:
`outline_color`, `outline_width`, `outline_opacity`). Color accepts a CSS color, a category
column with `outlineColorScale`, or RGB rows. Width and opacity accept a number, numeric
column, one-dimensional array or expression. Width is nonnegative; opacity is 0–1 and
defaults to 1. Missing width/opacity values hide that row's border. Numeric row opacities
are clamped to 0–1. Supply opaque colors and a separate opacity channel rather than RGBA
outline colors.

The border overlays the fill. Reducing outline opacity reveals the fill beneath it;
it does not change fill opacity. Mark opacity and interaction dimming apply to the whole
result. Hollow Points (`fill="transparent"`) retain only their border, including its alpha.
Polygon triangles take the polygon's first vertex row, as their fill does. Bands use the
first vertex of each interval. Aggregate compounds resolve columns in their output scope;
use an output column or a literal, rather than an unavailable original observation column.

Mappings and themes supply these defaults only to marks that consume them. Explicit mark
values win. Inspector outline controls appear only on marks with working borders. Label-box
borders remain part of `box`, with its existing box opacity; they are not glyph channels.

## Exports and migration

Flat Cartesian filled borders stay vector in SVG/PDF, using an inside clip and applying
the whole mark's opacity after the border overlays its fill. Polar sectors retain their
vector boundary. Points keep symbol-aware inside strokes and border alpha. PNG/HTML use
the same rendering fields as the live plot. No outline channel requires a live GPU readback.
Filled border colors are resolved in linear RGB before writing SVG/PDF strokes, matching
the live shader rather than the darker result of SVG's default sRGB alpha composition.
Small individual triangle edges retain the SVG viewer's antialiasing differences.

Outlined adaptively refined fills and filled outlines in a 3D view retain the rendered
image layer in SVG/PDF. This preserves seam cuts, nonlinear boundary thickness and depth
ordering; strict vector mode reports the limitation. Unoutlined fills keep their existing
vector support. GeoJSON fills already retain a raster layer; boundary strokes remain vector
in supported 2D views.

Removed ineffective top-level outline props from Text, Callout, ErrorBars, Ecdf and Smooth.
Use `box={...}` for a label's box, and color/width for line marks. For a confidence-band
boundary with Smooth, compose Regression, Area and Line and style the Area. BoxPlot's
border width/opacity affect its boxes; outlier Points keep their own symbol defaults.
