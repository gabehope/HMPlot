# charts.Smooth

A fitted curve through a scatter, with its confidence band.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6, 7, 8], "y": [2.1, 2.9, 3.2, 4.8, 4.9, 6.1, 6.8, 8.2]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Points(x="x", y="y")
    hm.charts.Smooth(x="x", y="y")
plot
```

## Options

Keywords are snake_case.

### Options

- `method` (`"linear" | "poly" | "log" | "exp" | "pow"`): The model: a line, a polynomial of degree order, y on ln x ("log"), ln y on x ("exp"), or ln y on ln x ("pow"). Default: `"linear"`.
- `order` (`number`): The polynomial's degree for method "poly", 1 to 6. Default: `2`.
- `samples` (`number`): How many points the curve is drawn through, evenly spaced across extent. Default: `100`.
- `extent` (`[number, number]`): The x range the curve spans. Default: the fitted rows' x range. In data units.
- `band` (`number | false`): The confidence level of the band around the fit, or false for no band. Default: `0.95`.
- `data` (`table`): A table for this mark alone: a mark with data displays on its own, in a Plot of its own.

### Position

- `x` (`column`): The column along x: the fit is of y on x.
- `y` (`column`): The column fitted, along y.
- `z` (`channel`): The z position, in a 3D plot: a column, per-row values, or one value.
- `position` (`channel`): Positions as one column or an N x 2 (or N x 3) array, instead of x, y and z.

### Appearance

- `fill` (`channel`): The confidence band's color. Default: `"#547ba2"`.
- `color` (`channel`): The fitted line's color. Default: `"#30343b"`.
- `size` (`channel`): The size of each point or label: a number, or a column mapped to sizes. In px.
- `width` (`channel`): The fitted line's width. Default: `2` px.
- `opacity` (`channel`): The confidence band's opacity, 0 to 1; the line stays opaque. Default: `0.25`.

### Scales

- `fill_scale` (`scale`): The fill's scale, which marks can share: continuous({domain, colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for categories.
- `color_scale` (`scale`): A scale for color that marks can share.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `size_scale` (`scale`): The size's scale, which marks can share: continuous({domain, range, transform}) for numbers (without a range, the automatic one), or categories with a numeric range.
- `width_scale` (`scale`): A scale for width that marks can share, as size_scale.
- `opacity_scale` (`scale`): A categorical() scale from the opacity column's categories to opacities, 0 to 1.

### Display

- `label` (`string`): The mark's name in the legend and the settings pane.
- `legend` (`boolean`): Whether the mark has a legend entry. Default: `True`.
- `visible` (`boolean`): Whether the mark is drawn. Default: `True`.
- `domains` (`boolean`): Whether the mark's data counts toward its axes' automatic domains; false leaves them to the other marks (a reference line, a decorative part). Default: `True`.
- `blend` (`"normal" | "additive" | "multiply" | "screen" | "subtractive"`): How the mark mixes with what is drawn under it; any mode but normal draws it transparent, and SVG and PDF exports draw additive and subtractive as an image. Default: `"normal"`.
- `glow` (`number`): How much the mark glows: its own color times glow blooms around it in the plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's strength and radius. SVG and PDF exports draw the whole plot as an image. Default: `0`.
- `shade` (`ShadeSpec`): A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind: "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each fragment the mark draws; picking, tooltips, domains and legends are unchanged. SVG and PDF exports draw a shaded mark as an image.
- `options` (`string[]`): The settings the settings pane shows for this mark, by name.
- `name` (`string`): The mark's name in the settings pane, and the name facet.endpoint() and partition.endpoint() find it by.

### Interaction

- `identity` (`identity`): Whose rows these are for selections: an identity() shared by tables that show the same things. Default: its data's.
- `select` (`boolean | selection | object`): Click to replace the selection; an exact repeat clears it. Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true uses its data's selection, or give a selection(). input("root").set("id") writes an input instead: a click sets it to the clicked row's id (a drill-down's root), .set(literal(v)) to a constant, .reset() to its default, and a click on nothing restores its default (input("root", {default}), else a Select of that name's, else null); several marks may write one input.
- `hover` (`boolean | selection | object`): Mark the row under the pointer as @hovered (a whole series for Line, Area), without fading the others: true uses its data's hover, or give a selection(). input("focus").set("series") writes an input instead: while the pointer is on a row the input shows its series (or .set(literal(v)), a constant), then its committed value again (a hover that would change this mark's own rows is an error).
- `tooltip` (`boolean | field[] | object`): Show the nearest row's values in a box by the pointer: true, a list of fields, or {fields, radius, content}. Default: the Plot's.
- `nearest` (`boolean | selection | object`): Mark the row a tooltip shows as @nearest, with or without the tooltip: under the pointer, else the nearest drawn row within radius pixels (a whole series for Line, Area): true, a selection(), or {selection, radius}. Default: the Plot's.
- `respond` (`boolean | "selected" | "brushed" | "hovered" | "nearby" | "nearest" | selection | array`): Which interaction states fade this mark's other rows to selection_opacity; "hovered" fades them while hovering, "nearest" while a row is nearest. Default: the states it sets, except hover and nearest.
- `selection_opacity` (`number`): The opacity of the rows outside the selection while one is active. Default: `0.25`.
- `enter_effect` (`boolean | "fade" | object`): How rows that arrive in a keyed update appear: "fade", or {effect, duration, easing}. animate()'s enter option is the value a channel starts from.
- `exit_effect` (`boolean | "fade" | object`): How rows that leave in a keyed update disappear, as enter_effect. animate()'s exit option is the value a channel ends at.

### Animation

- `animation` (`boolean`): Animate changes to the mark's values. Default: `False`.
- `animation_duration` (`number`): How long an animated change takes. Default: `300` ms.
- `animation_easing` (`"linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out"`): The animation's easing. Default: `"cubic-in-out"`.

### Legend settings

- `legend_font_size` (`number`, setting): The size of the mark's legend text. Default: the theme's (14 in the default theme). In px.
- `legend_font_family` (`string`, setting): The font of the mark's legend text, a CSS font-family. Default: the plot's font.
- `legend_text_color` (`color`, setting): The color of the mark's legend text. Default: `"#40505d"`.
- `legend_tick_format` (`string`, setting): How a colorbar labels numbers: a d3-format string, or a %-pattern for dates. Default: `".3~g"`.

### Color settings

- `quantize` (`boolean`, setting): Step a numeric fill or color into `levels` colors instead of a smooth gradient. Default: `False`.
- `levels` (`number`, setting): How many colors quantize steps through. Default: `10`.

### Limits

- `max_elements` (`number`, setting): The most rows the mark prepares on the GPU. Default: `250000`.

### The mark's own axes

- `x_transform` (`"linear" | "log" | "sqrt" | "symlog"`, setting): This mark's own x transform, instead of its frame's. Default: its frame's.
- `x_invert` (`boolean`, setting): Reverse this mark's x direction. Default: `False`.
- `xbounds` (`[number, number]`, setting): The x extent this mark maps, instead of its frame's domain (an image's or a grid's extent). Default: its frame's.
- `xrange` (`[number, number]`, setting): Where this mark's x extent lands, in its frame's world units. Default: its frame's.
- `y_transform` (`"linear" | "log" | "sqrt" | "symlog"`, setting): This mark's own y transform, instead of its frame's. Default: its frame's.
- `y_invert` (`boolean`, setting): Reverse this mark's y direction. Default: `False`.
- `ybounds` (`[number, number]`, setting): The y extent this mark maps, instead of its frame's domain (an image's or a grid's extent). Default: its frame's.
- `yrange` (`[number, number]`, setting): Where this mark's y extent lands, in its frame's world units. Default: its frame's.
- `z_transform` (`"linear" | "log" | "sqrt" | "symlog"`, setting): This mark's own z transform, instead of its frame's. Default: its frame's.
- `z_invert` (`boolean`, setting): Reverse this mark's z direction. Default: `False`.
- `zbounds` (`[number, number]`, setting): The z extent this mark maps, instead of its frame's domain (an image's or a grid's extent). Default: its frame's.
- `zrange` (`[number, number]`, setting): Where this mark's z extent lands, in its frame's world units. Default: its frame's.

### Shading

- `transparent` (`boolean`, setting): Draw the mark in the transparent pass, blended in depth order with other transparent marks. Default: `False`.

### Advanced renderer options

- `sampling` (`"random" | "uniform-x"`): Which rows a Line keeps when it has more than max_instances: a random sample, or the extremes across even steps of x. Default: `"random"`.
- `max_instances` (`number | null`): The most rows drawn; past it the rows are sampled (null draws them all), though SVG and PDF exports draw every row. Default: `None`.

## Usage

This mark has no separate outline channel. Use `color` and `width` for its line stroke.

Regression, then an Area for the band and a Line for the fit, as a Violin is a Density and an Area. `color` and `width` style the line, `fill` and `opacity` the band. Under `<Filter where="@brushed" inactive="all">` it fits the brushed rows, and all of them with no brush.

Place under Plot or a Frame with the scatter it summarizes. Fix the axes' domains when the fit may be refitted to few rows: its band widens, and automatic domains would follow it.

Smooth is a built-in template, built from transforms and simpler marks: import it from `hmplot/charts`.

## Related examples

- [A fitted curve that refits under a brush](/HMPlot/examples/smooth.md)
