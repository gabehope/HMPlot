# Text

Text labels at data positions, one per row.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3], "y": [2, 3, 1], "word": ["one", "two", "three"]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Text(x="x", y="y", text="word")
plot
```

## Options

Keywords are snake_case.

### Options

- `x_offset` (`channel`): Moves each row along x in data units: on a categorical axis a band is one unit, so 0.25 is a quarter of the category's band (grouped bars, dodged points). A number or a column. dx moves by CSS pixels. Default: `0` data.
- `y_offset` (`channel`): Moves each row along y in data units: on a categorical axis a band is one unit (side-by-side horizontal bars). A number or a column. dy moves by CSS pixels. Default: `0` data.
- `text` (`column | string | (string | number)[]`): The text of each label: a column, one string for every label, or one value per row.
- `align` (`"left" | "center" | "right" | "auto"`): Which part of each label is at its point: its left end, its center, or its right end; "auto" picks each row's from its dx: left of a label offset right of its point by more than 4 pixels, right of one offset left, else centered. Default: `"center"`.
- `format` (`"axis" | string`): How numbers in the text are written: a d3-format string (",.0f", ".1%", "$,.2f"; default the theme's numbers.format, else as tooltips write them: four significant digits, whole numbers exact, thousands grouped from 10,000), or a %-pattern for a datetime column ("%b %d"). A number computed on the GPU (a Group's count, a Calculate's mean) is written the same way, with no as_category. "axis": the text is an axis's view-state field ("@pointer_x", "@view_y_min", ...), shown as the axis's readout writes it, finer than its ticks, as Crosshair's readouts are; "@pointer" shows both of the pointer's, "x, y". On a band axis the pointer reads as its category; the view's edges are band positions.
- `dx` (`channel`): Moves each label right of its point, or left when negative. Default: `0` px.
- `dy` (`channel`): Moves each label down from its point, or up when negative. Default: `0` px.
- `font` (`string`): The font, a CSS font-family. Default: the plot's font.
- `box` (`boolean | {fill, outlineColor, outlineWidth, padding, radius, opacity}`): A box behind each label: true for a white box with a gray outline, or its settings.
- `leader` (`boolean | {color, width}`): With an offset, a line from near each point to its label: true for a 1.5 px line in the text's color, or its color and width.
- `data` (`table`): A table for this mark alone: a mark with data displays on its own, in a Plot of its own.

### Position

- `x` (`channel`): The x position: a column, per-row values, or one value.
- `y` (`channel`): The y position: a column, per-row values, or one value.
- `z` (`channel`): The z position, in a 3D plot: a column, per-row values, or one value.
- `position` (`channel`): Positions as one column or an N x 2 (or N x 3) array, instead of x, y and z.

### Appearance

- `color` (`channel`): The line or text color: a CSS color, or a column mapped to colors. Default: the theme's text color.
- `size` (`channel`): The font size: a number, or a column mapped to sizes. Default: the theme's font size (14 in the default theme). In px.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacity_scale). Default: `1`.

### Scales

- `color_scale` (`scale`): A scale for color that marks can share.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `size_scale` (`scale`): The size's scale, which marks can share: continuous({domain, range, transform}) for numbers (without a range, the automatic one), or categories with a numeric range.
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

### Advanced renderer options

- `max_instances` (`number | null`): The most rows drawn; past it the rows are sampled (null draws them all), though SVG and PDF exports draw every row. Default: `None`.

## Usage

Glyph outlines are not supported. Style the border of a label box with `box={...}`.

Defaults to 12px, centered alignment, and zero offsets. `align="auto"` puts each label on the side of its point it is offset to: it starts at the point when dx is more than 4px right, ends there when more than 4px left, and is centered otherwise. `format="axis"` with `text="@pointer_x"` (or `@pointer_y`, `@view_x_min`, `@view_y_max`, ...) shows that value as the axis's readout writes it, finer than the ticks, following the pointer and the view, as Crosshair's readouts do. Positive offsets move right/down; size stays independent of zoom. Text of numbers is written as tooltips write them: four significant digits, whole numbers exact, thousands grouped from 10,000; `format` takes a d3-format string instead (`",.0f"`, `".1%"`, `"$,.2f"`), or a %-pattern for a datetime column (`"%b %d"`). That holds for a number computed on the GPU too, a Group's count or a Calculate's value: it is read back when it changes, with no `as_category`. A live total is a Group without `by` (one row, a count of 0 when nothing is selected):

```python
with hm.Filter(where="@brushed", inactive="all"):
    with hm.Group(columns={"fare": hm.mean("fare")}):
        hm.Text(x=0.5, y=0.5, text="count", format=",")
```

Missing values draw no label.

Automatic bounds in rectangular 2D Cartesian frames reserve room for text, pixel offsets,
alignment, label boxes and leaders. In the plot's own frame that room is pixel padding inside the
plot area, so the domain and its ticks stay the data's; nested or ranged Frames widen their domain
instead. The reservation uses conservative per-mark maxima and
updates on resize; filtered, empty or missing labels contribute no bounds. Explicit domains,
categorical axes and view-following labels keep their authored bounds. Zooming can still clip
labels with the other data. Labels wider than the drawable frame cannot fit, and sqrt axes
cannot pad below zero. Polar, spherical and 3D views retain position-based fitting; Text3D/TeX
geometry is separate from Text's pixel-sized labels. Set `axisMask={false}` to allow overflow.

> **SVG and PDF export**
>
> **Vector, except** in a 3D view that holds a mark with no vector form there (Points3D, Surface or another 3D mark, a Heatmap or Image, a lit or additive mark, a globe or polar frame): then SVG and PDF exports draw all of that view's marks as one image, and `mode="vector"` refuses it. In other 3D views the labels are drawn back to front by depth with the view's other marks. Otherwise each label is searchable text, in its row's color for a `color` column, its box and leader vector shapes. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Point labels](/HMPlot/examples/point-labels.md)
