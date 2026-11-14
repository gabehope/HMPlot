# Mark options

The options the marks share: position, appearance, scales, interaction and animation.

## Example

```python
hm.Points(x="x", y="y", fill="group", size="weight", size_scale=hm.continuous(range=[4, 16]), select=True, hover=True)
```

## Options

### Position

- `x` (`channel`): The x position: a column, per-row values, or one value.
- `y` (`channel`): The y position: a column, per-row values, or one value.
- `z` (`channel`): The z position, in a 3D plot: a column, per-row values, or one value.
- `position` (`channel`): Positions as one column or an N x 2 (or N x 3) array, instead of x, y and z.

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
- `brush` (`boolean | selection | object`): Brush rows with Shift-drag (point marks; Line, Area brush whole series): true uses its data's brush, a selection() shares one, {selection, axis} picks the axes.
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

These are the options the marks share; each mark's own page lists the ones it takes, with their defaults, and its own. Python spells them in snake_case (`fill_scale`, `enter_effect`). Options only some marks read, such as `series`, `shape`, `rotation`, `size_units` and `max_instances`, are on those marks' pages.

**Channels** (`x`, `y`, `fill`, `size`, ...) take a column name, per-row values, an [expression](expressions) or one constant. A plain string is the column when the data has one, else the constant: `fill="species"` colors by species, `fill="steelblue"` is steelblue, and `literal("red")` (or `col.red`) says which is meant. A mapped channel goes through a scale, one object per channel: `fillScale`, `colorScale`, `sizeScale` and `widthScale` take a [continuous](continuous) scale (domain, colormap or range, transform) or a [categorical](categorical) one (categories in order and their colors or sizes), and one scale given to several marks keeps them in step. `colormap` sets a numeric fill's or color's colors without a scale object. A channel's scale does nothing without the channel.

**Display** options name the mark in the legend (`label`, `legend`) and the settings pane (`name`), show or hide it (`visible`), and set how it mixes with what is under it (`blend`, `glow`) and how a plugin recolors it (`shade`).

**Interaction** options make the rows respond: `select`, `hover`, `brush`, `nearby`, `nearest` and `tooltip` turn a gesture on (`true` uses the data's own selection; a [selection](selection) shares one; `select={root.set("id")}` and `hover={focus.set("series")}`, with `root = input("root", { default })`, write one value to an [input](input-context) instead, a drill-down's root or a focused series), `respond` fades the other rows while a selection is active, `drag` moves rows by [offsets](offsets-drag), and `enterEffect` and `exitEffect` fade the rows a keyed update adds and removes. **Animation** options time the transitions a change of data starts.

The **settings** (tagged setting below) are what the settings pane edits: legend text, `quantize` and `levels`, `maxElements`, and a mark's own axes (`xTransform`, `xbounds`, `xrange`, ...) for a mark mapped apart from its frame, such as an image placed over an extent. A prop the mark is given wins over a theme's or a Mapping's value. [Point symbols](/HMPlot/examples/symbols.md) uses the channels, scales and picking together.

**Outlines.** Outlined boundaries accept `outlineOpacity` (`outline_opacity` in Python), a number, numeric column, array or expression from 0 to 1. It fades the border over the fill; mark opacity still applies to both. Width is in CSS pixels. See the [outline support and migration audit](https://github.com/gabehope/HeatmapTest/blob/main/docs/OUTLINES.md).

## Glow

`glow` (0, the default, does not glow) makes a mark bloom: its own color times `glow` spreads around it, drawn after the scene, so it never changes picking or the axes. The Plot's bloom [effect](effects) sets how strong and how wide; marks drawn onto a Surface do not glow.

## Shade

`shade` names a [plugin's](plugins) shade with its parameters, `shade={{ kind: "hatch", spacing: 6 }}` (Python `shade=hm.shade("hatch", spacing=6)`): it recolors each fragment the mark draws. It cannot move or hide geometry, so picking, tooltips, domains and legends are unchanged. A kind no plugin registers, a parameter its schema refuses, or an input the mark lacks (normals on Points) is the mark's error, and it draws unshaded.

> **SVG and PDF export**
>
> **Vector, except** with `blend="additive"` or `"subtractive"`: then SVG and PDF exports draw the mark as an image, and `mode="vector"` refuses it; screen and multiply stay vector (as `mix-blend-mode`). A `shade` draws the mark as an image too. A `glow` above 0 makes the whole plot one image: SVG and PDF exports draw all of the plot's marks, with the glow, as one image (its axes, titles and legends stay vector), and `mode="vector"` refuses it. A mark sampled by `maxInstances` exports every row, up to the export's primitive budget. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Point symbols](/HMPlot/examples/symbols.md)
