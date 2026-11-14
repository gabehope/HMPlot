# charts.Sparkline

A compact line with an optional reference band and final-value label.

## Example

```python
import hmplot as hm

data = {"day": [1, 2, 3, 4, 5, 6], "value": [3, 4, float("nan"), 2, 5, float("nan")], "label": ["3", "4", "", "2", "5", ""]}
with hm.Plot(data=data, height=120, axes2d=False, x={"domain": [0, 7]}) as plot:
    hm.charts.Sparkline(x="day", y="value", lower=2, upper=4, text="label",
                        last={"color": "#20252b", "dx": 8})
plot
```

## Options

Keywords are snake_case.

### Options

- `lower` (`channel`): Optional reference band's lower y bound; supply upper too.
- `upper` (`channel`): Optional reference band's upper y bound; supply lower too.
- `text` (`channel`): Optional column, dictionary text or literal for the final finite row; numbers are written as Text writes them.
- `band` (`object`): Props of the BandY reference part, such as fill and opacity.
- `last` (`object`): Props of the final-row Text part, such as color, dx, dy and size.
- `data` (`table`): A table for this chart alone.

### Position

- `x` (`channel`): The ordered x coordinates of the line.
- `y` (`channel`): The line's values along y.

### Appearance

- `color` (`channel`): The line or text color: a CSS color, or a column mapped to colors.
- `width` (`channel`): The line width: a number, or a column mapped to widths. In px.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacity_scale). Default: `1`.
- `outline_color` (`channel`): The outline's color: a CSS color, or a column of categories mapped through outline_color_scale.
- `outline_opacity` (`channel`): Border opacity from 0 to 1: a number, numeric column, array or expression. Fades the border over the fill; mark opacity still applies to both. Missing values hide the border. Default: `1`.
- `outline_width` (`channel`): The outline's width in CSS pixels, drawn inside the mark's edge (a point's at most its radius). Default: `0`.

### Scales

- `color_scale` (`scale`): A scale for color that marks can share.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `width_scale` (`scale`): A scale for width that marks can share, as size_scale.
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

- `transparent` (`boolean`, setting): Draw the mark in the transparent pass, blended in depth order with other transparent marks. Default: `False`.

<!-- Generated by scripts/generate-python-signatures.mjs from src/lib/charts/sparkline.js; do not edit. -->
## Usage

Supply `x` and `y` in drawing order; this template does not sort. Set the host Plot's height and axes (for example height=100, axes2d=False) for a compact display. Optional `lower` and `upper` draw a BandY reference interval; supply both. The band follows the view without expanding its domain. Optional `text` labels the final row with finite x and y, in current input order after any enclosing Filter or Sort: a column (numbers are written as Text writes them), dictionary-encoded text or a literal. `band={...}` styles BandY and `last={...}` styles Text, including pixel dx/dy and size. Main-part props and `getMark()` belong to Line. The label reads one row of the same data; no separate table, callback or kernel is introduced.

Sparkline is a chart: a template over public components, defined in one file, src/lib/charts/sparkline.js.
