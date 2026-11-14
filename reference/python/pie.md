# charts.Pie

A pie or donut chart: a sector per row, its angle its value's share of the total.

## Example

```python
import hmplot as hm

data = {"region": ["North", "East", "South", "West"], "sales": [42, 18, 27, 13]}
with hm.Plot(data=data, height=300) as plot:
    hm.charts.Pie(value="sales", category="region")
plot
```

## Options

Keywords are snake_case.

### Options

- `value` (`channel`): Each sector's size: a numeric column or expression. A negative value is an error; a zero or missing one draws nothing.
- `category` (`column`): The sectors' categories: they fill the sectors unless fill is given, so the legend lists them.
- `by` (`column | column[]`): One pie per group, drawn as concentric rings that each sum to their own total, each ring's sectors aligned to the inner ones they sum (in row order; sort sorts each ring on its own and breaks that); for pies side by side, use a Facet.
- `sort` (`"none" | "asc" | "desc" | category[]`): The sectors' order clockwise from start_angle: row order, by value, or a list of categories (the others after them). Default: `"none"`.
- `start_angle` (`number`): Where the pie starts, clockwise from 12 o'clock. Default: `0` degrees.
- `end_angle` (`number`): Where the pie ends, clockwise from 12 o'clock; below start_angle the sectors run counter-clockwise. Default: `360` degrees.
- `pad_angle` (`number`): A gap between sectors, taken from their shares as d3.pie's pad_angle is; with by, from each sector's own share (at most half its width, so a very small sector gets a narrower gap), so the rings stay aligned. Default: `0` degrees.
- `inner_radius` (`number`): The hole's radius as a fraction of the disk's: above 0 makes a donut. Default: `0`.
- `outer_radius` (`number`): The pie's radius as a fraction of the disk's. Default: `1`.
- `sector_label` (`"category" | "value" | "percent" | column | expression`): Text at each sector's centroid: its category, its value, its percent of its pie, a column, or an expression; a label that would overlap a larger sector's is hidden.
- `sector_label_format` (`string`): A d3-format string for numeric sector labels. Default: ".0%" for "percent", ",.7~r" otherwise.
- `text_color` (`color`): The sector labels' color. Default: `"#ffffff"`.
- `font_size` (`number`): The sector labels' font size. Default: `12` px.
- `placement` (`{anchor, size}`): Where the pie goes in a Cartesian plot: anchor in data coordinates, size in pixels. In a polar plot the pie fills the disk. Default: centered in the frame, across 90% of its shorter side.
- `data` (`table`): A table for this mark alone: a mark with data displays on its own, in a Plot of its own.

### Appearance

- `fill` (`channel`): The fill color: a CSS color, or a column of numbers or categories mapped to colors. Default: the category column.
- `color` (`channel`): The line or text color: a CSS color, or a column mapped to colors.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacity_scale). Default: `1`.
- `outline_color` (`channel`): The outline's color: a CSS color, or a column of categories mapped through outline_color_scale.
- `outline_opacity` (`channel`): Border opacity from 0 to 1: a number, numeric column, array or expression. Fades the border over the fill; mark opacity still applies to both. Missing values hide the border. Default: `1`.
- `outline_width` (`channel`): The outline's width in CSS pixels, drawn inside the mark's edge (a point's at most its radius). Default: `0`.

### Scales

- `fill_scale` (`scale`): The fill's scale, which marks can share: continuous({domain, colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for categories.
- `color_scale` (`scale`): A scale for color that marks can share.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `outline_color_scale` (`scale`): A categorical() scale from the outline_color column's categories to colors.
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

- `lit` (`boolean`, setting): Shade the mark with the plot's lights. Default: `False`.
- `transparent` (`boolean`, setting): Draw the mark in the transparent pass, blended in depth order with other transparent marks. Default: `False`.

### Advanced renderer options

- `max_instances` (`number | null`): The most rows drawn; past it the rows are sampled (null draws them all), though SVG and PDF exports draw every row. Default: `None`.

## Usage

A sector per row, its angle its `value`'s share of the total, clockwise from 12 o'clock (d3.pie's convention, with angles in degrees). `category` fills the sectors, so `<Legend for={pie} channel="fill">` (Python `hm.Legend(target=pie, channel="fill")`) lists the categories. `innerRadius` above 0 makes a donut; `startAngle` and `endAngle` make a partial pie; `padAngle` separates the sectors; `sort` orders them by value or by a list of categories. `sectorLabel` writes each sector's `"category"`, `"value"`, `"percent"`, a column, or an expression at its centroid; a label that would overlap a larger sector's is hidden.

In a polar Plot or Frame the pie fills the disk. In a Cartesian one (the default Plot) the Pie places a polar Frame of its own: centered in the frame's domain and across 90% of its shorter side, or where `placement` puts it (`anchor` in data coordinates, `size` in pixels), so a pie can sit beside other marks as an inset.

A negative value is a data error naming its row; a zero, missing or hidden value draws nothing. Put a `key` on the data and turn on `animation` to tween the sectors when the values change. `by` draws one pie per group as concentric rings; in row order, a ring's sectors start and end where the inner sectors whose values they sum do (a sunburst), each sector's `padAngle` coming out of its own share (at most half its width, so a very small sector gets a narrower gap). A `sort` sorts each ring on its own, which breaks that alignment. For pies side by side, put the Pie in a Facet:

See the [complete example](/HMPlot/examples/pie-facet.md).

Pie is a built-in template (TODO 130.3): the PieGeometry transform, a Rect for the sectors and a Text for their labels, importable from `hmplot/charts`. See "Writing a pattern" in docs/USAGE.md.

> **SVG and PDF export**
>
> **Vector, except** in a 3D view, where SVG and PDF exports draw the pie (a polar frame) with all of that view's marks as one image and `mode="vector"` refuses it. A `fill` column of numbers or categories stays vector. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Pie chart](/HMPlot/examples/pie.md)
- [Donut chart](/HMPlot/examples/donut.md)
- [Pies in a Facet](/HMPlot/examples/pie-facet.md)
