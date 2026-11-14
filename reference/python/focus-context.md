# charts.FocusContext

A line chart over a strip of the whole series: dragging across the strip zooms the chart to that x interval.

## Example

```python
import math
import hmplot as hm

days = list(range(365))
data = {"day": days, "visits": [200 + 80 * math.sin(d / 9) + d / 2 for d in days]}
# Drag across the strip below to zoom the chart to those days; clear the brush to see them all.
chart = hm.charts.FocusContext(data=data, x="day", y="visits", height=360)
chart
```

## Options

Keywords are snake_case.

### Options

- `data` (`table`): A table or live pipeline output for both views; the same as wrapping the FocusContext in Data.
- `schema` (`object`): Column types for data, such as {"day": "datetime"}, as on Data.
- `key` (`column | column[]`): The column, or columns, that identify each row of data across updates, as on Data.
- `height` (`number`): The height of the whole figure, at least 160: the strip takes a fifth of it (at least 48 px), the chart the rest. Default: `360` px.
- `viewport` (`{x, y, zoom, zoomX, zoomY, center}`): The chart's 2D view, as a Plot's viewport.

### Position

- `x` (`column`): The column the lines plot along x: a drag across the strip below zooms the chart to an interval of it (its brush's bounds), and clearing the brush shows it all. Required.
- `y` (`column`): The column the lines plot along y. Required.

### Appearance

- `fill` (`channel`): The fill color: a CSS color, or a column of numbers or categories mapped to colors.
- `color` (`channel`): The line or text color: a CSS color, or a column mapped to colors.
- `size` (`channel`): The size of each point or label: a number, or a column mapped to sizes. In px.
- `width` (`channel`): The line width: a number, or a column mapped to widths. In px.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacity_scale). Default: `1`.
- `outline_color` (`channel`): The outline's color: a CSS color, or a column of categories mapped through outline_color_scale.
- `outline_opacity` (`channel`): Border opacity from 0 to 1: a number, numeric column, array or expression. Fades the border over the fill; mark opacity still applies to both. Missing values hide the border. Default: `1`.
- `outline_width` (`channel`): The outline's width in CSS pixels, drawn inside the mark's edge (a point's at most its radius). Default: `0`.

### Scales

- `fill_scale` (`scale`): The fill's scale, which marks can share: continuous({domain, colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for categories.
- `color_scale` (`scale`): A scale for color that marks can share.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `size_scale` (`scale`): The size's scale, which marks can share: continuous({domain, range, transform}) for numbers (without a range, the automatic one), or categories with a numeric range.
- `width_scale` (`scale`): A scale for width that marks can share, as size_scale.
- `outline_color_scale` (`scale`): A categorical() scale from the outline_color column's categories to colors.
- `opacity_scale` (`scale`): A categorical() scale from the opacity column's categories to opacities, 0 to 1.

### Display

- `label` (`string`): The mark's name in the legend and the settings pane.
- `legend` (`boolean`): Whether the mark has a legend entry. Default: `True`.
- `visible` (`boolean`): Whether the mark is drawn. Default: `True`.
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
- `nearby` (`boolean | selection | object`): Mark the rows near the pointer (point marks): true, a selection(), or {selection, radius, units, axis}.
- `nearest` (`boolean | selection | object`): Mark the row a tooltip shows as @nearest, with or without the tooltip: under the pointer, else the nearest drawn row within radius pixels (a whole series for Line, Area): true, a selection(), or {selection, radius}. Default: the Plot's.
- `respond` (`boolean | "selected" | "brushed" | "hovered" | "nearby" | "nearest" | selection | array`): Which interaction states fade this mark's other rows to selection_opacity; "hovered" fades them while hovering, "nearest" while a row is nearest. Default: the states it sets, except hover and nearest.
- `selection_opacity` (`number`): The opacity of the rows outside the selection while one is active. Default: `0.25`.
- `drag` (`boolean | "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz"`): Drag rows to move them (point marks): true along every numeric axis, or the axes to move along. Default: `False`.
- `enter_effect` (`boolean | "fade" | object`): How rows that arrive in a keyed update appear: "fade", or {effect, duration, easing}. animate()'s enter option is the value a channel starts from.
- `exit_effect` (`boolean | "fade" | object`): How rows that leave in a keyed update disappear, as enter_effect. animate()'s exit option is the value a channel ends at.

### Animation

- `animation` (`boolean`): Animate changes to the mark's values. Default: `False`.
- `animation_duration` (`number`): How long an animated change takes. Default: `300` ms.
- `animation_easing` (`"linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out"`): The animation's easing. Default: `"cubic-in-out"`.

### Series

- `series` (`column | column[] | array`): Split the rows into separate paths, one per value of this column (Line, Area). Without it, a Line colored or an Area filled by a category column splits by that column.

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

## Usage

FocusContext draws a line chart over a strip of the whole series, as overview-and-detail charts do: a drag across the strip brushes an interval of `x`, and the chart above shows that interval; clearing the brush (Escape, or its clear control) shows the whole series again. The two Plots' plot areas line up; the strip takes a fifth of `height` (at least 48 px) and has no y axis. The strip does not pan or zoom, so a plain drag brushes it.

Its other props go to the chart's Line: `series="ticker"` and `color="ticker"` draw a line per ticker in both views, `width`, `opacity` and `tooltip` work as on Line. Its children are drawn in the chart, over the lines (rules, labels, an [EndLabels](end-labels)). Give the rows with `data`, or put the FocusContext in a Data. It sits where a Plot does: in a Scene, Row, Column or Grid, not inside a Plot. Its PNG, SVG and PDF exports compose both views; bound in Svelte, `view("main")` and `view("context")` give each view's Plot handle.

FocusContext is a chart template, built from Plots and Lines: import it from `hmplot/charts` in JavaScript or use `hm.charts.FocusContext` in Python. The chart's x domain is the brush's bounds read from the data (`@brush_min:x` and `@brush_max:x` as a domain, see [Plot](plot)): the same composition works by hand for other marks.
