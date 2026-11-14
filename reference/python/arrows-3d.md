# Arrows3D

Solid arrows, a tube and a cone, from start to end points, one per row.

## Example

```python
import hmplot as hm

start = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
end = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
with hm.Plot(type="3d", height=300, axes3d=True) as plot:
    hm.Arrows3D(start=start, end=end, width=1)
plot
```

## Options

Keywords are snake_case.

### Options

- `connections` (`connect(...)`): Draw between endpoint marks instead of from start and end: connections={connect(before, after, {key: "id"})} draws one arrow per matched pair, from the earlier endpoint to the later one.
- `curve` (`"linear" | "step" | "step-before" | "step-after" | "link-horizontal" | "link-vertical" | "quadratic" | "cubic"`): How each arrow runs from start to end: straight, in steps, as a link curve, or as a Bézier through control1 (and control2). Default: `"linear"`.
- `control1` (`channel`): Each arrow's Bézier control point, an N x 2 or N x 3 array or a column: the one of a "quadratic" curve, the first of a "cubic" one.
- `control2` (`channel`): Each arrow's second control point, for a "cubic" curve.
- `data` (`table`): A table for this mark alone: a mark with data displays on its own, in a Plot of its own.

### Appearance

- `color` (`channel`): The line or text color: a CSS color, or a column mapped to colors. Default: the theme's Arrows color (#3478c7 in the default theme).
- `width` (`channel`): The shaft's thickness: a number, or a column mapped to widths. A Cartesian plot's box is 100 world units across; a map's or globe's world is its projection's (a flat map is 2π across). Default: `0.05` world units.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacity_scale). Default: `1`.

### Scales

- `color_scale` (`scale`): A scale for color that marks can share.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `width_scale` (`scale`): A scale for width that marks can share, as size_scale.
- `opacity_scale` (`scale`): A categorical() scale from the opacity column's categories to opacities, 0 to 1.

### Display

- `label` (`string`): The mark's name in the legend and the settings pane.
- `legend` (`boolean`): Whether the mark has a legend entry. Default: `True`.
- `visible` (`boolean`): Whether the mark is drawn. Default: `True`.
- `domains` (`boolean`): Whether the mark's data counts toward its axes' automatic domains; false leaves them to the other marks (a reference line, a decorative part). Default: `True`.
- `rows` (`"auto"`): "auto" draws one item when no channel reads a column (a line at a value, a label at a point), instead of one per row of the data; "@" view-state fields are not columns.
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

### Segment ends

- `start` (`channel`): Where each segment starts (Segments, Arrows): a column of positions or an N x 2 (N x 3) array.
- `end` (`channel`): Where each segment ends, as start.

### Map paths

- `interpolation` (`"great-circle" | "angular" | "cartesian"`): How a path between two points runs on a map or a globe: along a great circle, straight in longitude and latitude, or straight in space. Default: `"great-circle"`.

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
- `lit` (`boolean`, setting): Shade the mark with the plot's lights. Default: `False`.

### Arrowheads

- `head_length` (`number`, setting): The arrowhead's length. Default: `3` world units.
- `head_width` (`number`, setting): The arrowhead's width. Default: `2` world units.

### Advanced renderer options

- `max_instances` (`number | null`): The most rows drawn; past it the rows are sampled (null draws them all), though SVG and PDF exports draw every row. Default: `None`.

## Usage

Use Arrows for screen-sized camera-facing shafts and heads. Solid arrows support the shared endpoint and curve inputs. Without a `color`, they take the theme's Arrows color.

`width`, `headLength` and `headWidth` are world units: the arrows are geometry, as a Points3D is, and grow as you zoom in, straight or curved, in 2D and 3D plots. A Cartesian plot's box is 100 world units across (stretched to the plot in 2D, so a 2D arrow's shaft is as thick as the axes scale it); a map's or globe's world is its projection's (a flat map is 2π across, a globe's radius 1). SVG and PDF exports draw each arrow's outline in world units too.

> **SVG and PDF export**
>
> **Vector, except** in a 3D view: then SVG and PDF exports draw the arrows, a 3D mark, as an image with all of that view's marks, and `mode="vector"` refuses it. A `color` column and a `curve` stay vector. See [what is not exported as vector](/HMPlot/docs/export.md).

### Connections

With `connections={connect(before, after, {key})}` Arrows draw one arrow per matched key from the earlier endpoint to the later one. See [connect()](connect).

## Related examples

- [Lines & vector fields](/HMPlot/examples/paths.md)
