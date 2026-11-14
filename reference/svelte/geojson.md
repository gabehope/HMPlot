# GeoJSON

Maps of GeoJSON regions, lines and points, colored by their properties (choropleths) and optionally extruded.

## Example

```svelte
<script>
  import { Plot, GeoJSON } from "hmplot";
  const polygon = (value, ring) => ({
    type: "Feature",
    properties: { value },
    geometry: { type: "Polygon", coordinates: [ring] },
  });
  const regions = {
    type: "FeatureCollection",
    features: [
      polygon(1, [[-120, 20], [-70, 20], [-70, 55], [-120, 55], [-120, 20]]),
      polygon(2, [[-10, 35], [40, 35], [40, 65], [-10, 65], [-10, 35]]),
      polygon(3, [[110, -40], [155, -40], [130, -10], [110, -40]]),
    ],
  };
</script>

<Plot coordinates="spherical" projection="mercator" height={300}>
  <GeoJSON data={regions} fill="value" />
</Plot>
```

## Options

### Options

- `data` (`object`): The shapes: a GeoJSON Geometry, Feature or FeatureCollection, in longitude and latitude on a map. Feature properties are columns for the channels.
- `geometry` (`column`): A geometry column of the enclosing data, instead of data: a FeatureCollection given as a Plot's or Data's table has one named "geometry".
- `featureKey` (`string`): The feature property that joins each feature to a row of the enclosing table, matched against dataKey; "$id" uses feature.id.
- `dataKey` (`column`): The column of the enclosing table matched against featureKey; each key may appear once.
- `height` (`channel`): Each feature's extrusion: a number, or a property or column mapped through heightScale. Only polygons extrude, in 3D views. Default: `0`.
- `heightScale` (`scale`): A continuous() scale from heights to extrusions: its domain (by default [0, 1]) maps onto its range (by default [0, 1], nonnegative and increasing); heights outside the domain clamp. The map is linear: a transform, a midpoint or a "symmetric" domain is an error.
- `plane` (`"xy" | "xz"`): In a Cartesian 3D plot, "xz" lays the features on the horizontal ground plane and extrudes them upward. Default: `"xy"`.
- `fit` (`boolean`): On a 2D map, zoom to the features (a city's districts fill the plot, not a speck in a world map); a Plot's own viewport wins. False keeps the whole map. Default: `true`.

### Appearance

- `fill` (`channel`): The fill of regions and points: a CSS color, or a property or column mapped to colors. null (Python None) draws only lines and polygon boundaries, using color and width. Default: `"#718b9b"`.
- `color` (`channel`): The color of LineString features and, with fill=null, polygon boundaries: a CSS color, or a property or column mapped to colors. Default: the fill.
- `size` (`channel`): The size of Point features: a number, or a property or column mapped to sizes. Default: `8` px.
- `width` (`channel`): The width of LineString features and, with fill=null, polygon boundaries: a number, or a property or column mapped to widths. Default: `1` px.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacityScale). Default: `1`.
- `outlineColor` (`channel`): The color of region and point outlines. Default: `"#f4f2ed"`.
- `outlineOpacity` (`channel`): Border opacity from 0 to 1: a number, numeric column, array or expression. Fades the border over the fill; mark opacity still applies to both. Missing values hide the border. Default: `1`.
- `outlineWidth` (`channel`): The width of region and point outlines; 0 draws none. Default: `0.7` px.

### Scales

- `fillScale` (`scale`): The fill's scale, which marks can share: continuous({domain, colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for categories.
- `colorScale` (`scale`): A scale for color that marks can share.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `sizeScale` (`scale`): The size's scale, which marks can share: continuous({domain, range, transform}) for numbers (without a range, the automatic one), or categories with a numeric range.
- `widthScale` (`scale`): A scale for width that marks can share, as sizeScale.
- `outlineColorScale` (`scale`): A categorical() scale from the outlineColor column's categories to colors.
- `opacityScale` (`scale`): A categorical() scale from the opacity column's categories to opacities, 0 to 1.

### Display

- `label` (`string`): The mark's name in the legend and the settings pane.
- `legend` (`boolean`): Whether the mark has a legend entry. Default: `true`.
- `visible` (`boolean`): Whether the mark is drawn. Default: `true`.
- `blend` (`"normal" | "additive" | "multiply" | "screen" | "subtractive"`): How the mark mixes with what is drawn under it; any mode but normal draws it transparent, and SVG and PDF exports draw additive and subtractive as an image. Default: `"normal"`.
- `glow` (`number`): How much the mark glows: its own color times glow blooms around it in the plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's strength and radius. SVG and PDF exports draw the whole plot as an image. Default: `0`.
- `shade` (`ShadeSpec`): A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind: "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each fragment the mark draws; picking, tooltips, domains and legends are unchanged. SVG and PDF exports draw a shaded mark as an image.
- `options` (`string[]`): The settings the settings pane shows for this mark, by name.
- `name` (`string`): The mark's name in the settings pane, and the name facet.endpoint() and partition.endpoint() find it by.

### Interaction

- `hover` (`boolean | selection | object`): Mark the row under the pointer as @hovered (a whole series for Line, Area), without fading the others: true uses its data's hover, or give a selection(). input("focus").set("series") writes an input instead: while the pointer is on a row the input shows its series (or .set(literal(v)), a constant), then its committed value again (a hover that would change this mark's own rows is an error).
- `tooltip` (`boolean | field[] | object`): Show the nearest row's values in a box by the pointer: true, a list of fields, or {fields, radius, content}. Default: the Plot's.
- `respond` (`boolean | "selected" | "brushed" | "hovered" | "nearby" | "nearest" | selection | array`): Which interaction states fade this mark's other rows to selectionOpacity; "hovered" fades them while hovering, "nearest" while a row is nearest. Default: the states it sets, except hover and nearest.
- `selectionOpacity` (`number`): The opacity of the rows outside the selection while one is active. Default: `0.25`.
- `onclick` (`(event) => void`): Called with the clicked feature: event.feature, event.featureIndex and, with a join, event.tableRowIndex. Python: on_click(callback).

### Animation

- `animation` (`boolean`): Animate changes to the mark's values. Default: `false`.
- `animationDuration` (`number`): How long an animated change takes. Default: `300` ms.
- `animationEasing` (`"linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out"`): The animation's easing. Default: `"cubic-in-out"`.

### Legend settings

- `legendFontSize` (`number`, setting): The size of the mark's legend text. Default: the theme's (14 in the default theme). In px.
- `legendFontFamily` (`string`, setting): The font of the mark's legend text, a CSS font-family. Default: the plot's font.
- `legendTextColor` (`color`, setting): The color of the mark's legend text. Default: `"#40505d"`.
- `legendTickFormat` (`string`, setting): How a colorbar labels numbers: a d3-format string, or a %-pattern for dates. Default: `".3~g"`.

### Color settings

- `quantize` (`boolean`, setting): Step a numeric fill or color into `levels` colors instead of a smooth gradient. Default: `false`.
- `levels` (`number`, setting): How many colors quantize steps through. Default: `10`.

### Limits

- `maxElements` (`number`, setting): The most rows the mark prepares on the GPU. Default: `250000`.

### The mark's own axes

- `xTransform` (`"linear" | "log" | "sqrt" | "symlog"`, setting): This mark's own x transform, instead of its frame's. Default: its frame's.
- `xInvert` (`boolean`, setting): Reverse this mark's x direction. Default: `false`.
- `xbounds` (`[number, number]`, setting): The x extent this mark maps, instead of its frame's domain (an image's or a grid's extent). Default: its frame's.
- `xrange` (`[number, number]`, setting): Where this mark's x extent lands, in its frame's world units. Default: its frame's.
- `yTransform` (`"linear" | "log" | "sqrt" | "symlog"`, setting): This mark's own y transform, instead of its frame's. Default: its frame's.
- `yInvert` (`boolean`, setting): Reverse this mark's y direction. Default: `false`.
- `ybounds` (`[number, number]`, setting): The y extent this mark maps, instead of its frame's domain (an image's or a grid's extent). Default: its frame's.
- `yrange` (`[number, number]`, setting): Where this mark's y extent lands, in its frame's world units. Default: its frame's.
- `zTransform` (`"linear" | "log" | "sqrt" | "symlog"`, setting): This mark's own z transform, instead of its frame's. Default: its frame's.
- `zInvert` (`boolean`, setting): Reverse this mark's z direction. Default: `false`.
- `zbounds` (`[number, number]`, setting): The z extent this mark maps, instead of its frame's domain (an image's or a grid's extent). Default: its frame's.
- `zrange` (`[number, number]`, setting): Where this mark's z extent lands, in its frame's world units. Default: its frame's.

### Shading

- `lit` (`boolean`, setting): Shade the mark with the plot's lights. Default: `false`.
- `transparent` (`boolean`, setting): Draw the mark in the transparent pass, blended in depth order with other transparent marks. Default: `false`.

### Map settings

- `missingColor` (`color`, setting): The color of the features the data has no value for: no joined row, or a missing (NaN) value. Default: the fill scale's missing, else the theme's (#92989f in the default theme).

## Usage

Accept data as Geometry/Feature/FeatureCollection, or geometry from a Data scope. Feature properties are fields; featureKey/dataKey joins measurements. A numeric `fill` maps through `fillScale` (by default over the values' extent, as on other marks) or the `colormap`; a numeric line `color` through `colorScale`. Height is per feature, mapped through `heightScale`, a `continuous()` scale from its domain (by default [0, 1]) onto its range (by default [0, 1]), clamped at its ends; polygons alone extrude. Longitude/latitude are degrees even when the plot uses other angular units.

Set `fill={null}` (Python `fill=None`) to draw only LineStrings and polygon boundaries,
without filling or triangulating polygons. This replaces GeoJSONLine. `color` and `width`
style all those strokes, including property columns and `colorScale`; the default stroke is
`#425669`, one pixel wide. Feature joins and picking work as for filled regions. Changing
`fill` switches between filled regions and boundaries on the same component.

Set `tooltip` to true or a list of feature-property/joined-column names, as on other marks;
the Plot's tooltip is the default. `hover` marks the whole feature, including every polygon
part, boundary and point. Add `respond="hovered"` to fade other features, with
`selectionOpacity` (Python `selection_opacity`) setting their opacity. Joins and geometry
columns share their enclosing table's row identity, so hover coordinates with other marks;
unmatched features do not mark a table row. Raw GeoJSON owns feature rows of its own.
Brush and drag are not GeoJSON producers.

A `GeoJSONHandle` has `getLegendSource()`, `whenSettled()` (once its geometry is prepared and drawn) and `getDiagnostics()` (features, instances and geometry bytes).

> **SVG and PDF export**
>
> **Partly an image.** SVG and PDF exports draw the filled polygons as an image at the export's raster DPI, and `mode="vector"` refuses them. The boundaries are vector paths in a 2D view, colored by a column too; on a 3D globe they are part of the image. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Globe extrusions](/HMPlot/examples/geojson-globe.md)
- [Earthquakes beneath the globe](/HMPlot/examples/earthquakes.md)
