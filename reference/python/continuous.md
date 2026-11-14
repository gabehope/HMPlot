# continuous

A scale from numbers to colors or sizes that marks and plots can share.

## Example

```python
colors = hm.continuous(domain=[0, 100], colormap="Viridis")
hm.Points(fill="score", fill_scale=colors)
```

## Members

- `normalization` (`NormalizationResource`): A shared normalization resource: scales that take the same one share its domain, transform and midpoint (configure those on it, not here).
- `domain` (`[number, number] | "symmetric"`): Two numbers, or "symmetric": the data's extent centered on zero.
- `transform` (`ScaleTransformName`): How values map to the range: "linear" (default), "log", "sqrt" or "symlog".
- `constant` (`number`): symlog's constant c > 0 (default 1): the transform is linear within ±c.
- `midpoint` (`number`): A diverging scale's center (d3's scaleDiverging): the domain's halves map to the range's halves, [lo, midpoint] to [0, 0.5] and [midpoint, hi] to [0.5, 1], each linearly in transformed space, so a diverging colormap's middle color falls on the midpoint and both of its ends are used. An explicit domain must contain it; an automatic one grows to. Value scales only (color, size, width), not position axes.
- `domain_source` (`"data" | "source"`): Where an automatic domain comes from: "data" (default), the rows the mark draws, or "source", the table before Filters, so colors stay put while a filter changes.
- `range` (`[number, number]`): The output range of a size or width scale, in CSS pixels.
- `colormap` (`ColormapSpec`): The colors of a color scale: a colormap name ("Viridis") or a list of colors.
- `quantize` (`boolean`): Step the values into `levels` colors instead of a smooth gradient.
- `levels` (`number`): How many colors quantize steps through.
- `missing` (`string`): The color a missing value (NaN or null) of a colormapped fill or color draws in, on screen, in exports and in its legend (default: the theme's `missing`, a neutral gray). A color scale only: a scale with a numeric range has no colors.
- `label` (`string`): Title of the legend guide shared by the marks using this scale.

## Usage

Pass a shared normalization to coordinate domains across encodings. colormap selects a color map (a built-in name, a list of colors, or `{colors, space, positions}`; see colormap); range selects numeric output values such as pixel sizes. Share this resource explicitly when separate marks or plots must use the same mapping. Without an explicit colormap, marks use the inherited default: a theme colormap, else Viridis.

A missing value (`NaN`, or `null`/`None` in the data) of a colormapped fill or color draws in `missing`, on screen, in SVG, PDF and PNG exports, and as a "Missing" swatch under the colorbar of a mark that holds one; without it, the theme's `missing` color (a neutral gray, `#92989f`, by default), not the colormap's end. `update({ missing: null })` (Python: `update(missing=None)`) returns to the theme's. A value outside the transform's domain (a zero under log) is not drawn, as before.

## Related examples

- [Shared and independent scales](/HMPlot/examples/scale-resources.md)
- [Symlog axis and a diverging scale](/HMPlot/examples/symlog-diverging.md)
