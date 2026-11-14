# Rect

Rectangles given by their edges, one per row: bars, bins, tiles.

## Example

```svelte
<script>
  import { Plot, Rect } from "hmplot";
  const data = { x0: [0, 2, 4], x1: [1, 3, 5], y0: [0, 1, 0], y1: [2, 3, 1] };
</script>

<Plot {data} height={300} axes2d>
  <Rect x0="x0" x1="x1" y0="y0" y1="y1" />
</Plot>
```

## Options

### Options

- `x0` (`channel`): Each rectangle's left edge: a column, per-row values, or one number.
- `x1` (`channel`): Each rectangle's right edge; a rectangle whose x1 is less than its x0 is not drawn.
- `y0` (`channel`): Each rectangle's bottom edge.
- `y1` (`channel`): Each rectangle's top edge; a rectangle whose y1 is less than its y0 is not drawn.
- `z0` (`channel`): Each box's bottom in a 3D plot: with z1, the rectangles become solid boxes.
- `z1` (`channel`): Each box's top in a 3D plot; give both z0 and z1, or neither.

### Appearance

- `fill` (`channel`): The fill color: a CSS color, or a column of numbers or categories mapped to colors. Default: the theme's first palette color (#3478c7 in the default theme).
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacityScale). Default: `1`.
- `outlineColor` (`channel`): The outline's color: a CSS color, or a column of categories mapped through outlineColorScale.
- `outlineOpacity` (`channel`): Border opacity from 0 to 1: a number, numeric column, array or expression. Fades the border over the fill; mark opacity still applies to both. Missing values hide the border. Default: `1`.
- `outlineWidth` (`channel`): The outline's width in CSS pixels, drawn inside the mark's edge (a point's at most its radius). Default: `0`.

### Scales

- `fillScale` (`scale`): The fill's scale, which marks can share: continuous({domain, colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for categories.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
- `outlineColorScale` (`scale`): A categorical() scale from the outlineColor column's categories to colors.
- `opacityScale` (`scale`): A categorical() scale from the opacity column's categories to opacities, 0 to 1.

### Display

- `label` (`string`): The mark's name in the legend and the settings pane.
- `legend` (`boolean`): Whether the mark has a legend entry. Default: `true`.
- `visible` (`boolean`): Whether the mark is drawn. Default: `true`.
- `domains` (`boolean`): Whether the mark's data counts toward its axes' automatic domains; false leaves them to the other marks (a reference line, a decorative part). Default: `true`.
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
- `respond` (`boolean | "selected" | "brushed" | "hovered" | "nearby" | "nearest" | selection | array`): Which interaction states fade this mark's other rows to selectionOpacity; "hovered" fades them while hovering, "nearest" while a row is nearest. Default: the states it sets, except hover and nearest.
- `selectionOpacity` (`number`): The opacity of the rows outside the selection while one is active. Default: `0.25`.
- `onclick` (`(event) => void`): Called for click on this mark; row provenance is optional after transforms.
- `ondblclick` (`(event) => void`): Called for dblclick on this mark; row provenance is optional after transforms.
- `oncontextmenu` (`(event) => void`): Called for contextmenu on this mark; row provenance is optional after transforms.
- `onpointerenter` (`(event) => void`): Called for pointerenter on this mark; row provenance is optional after transforms.
- `onpointerleave` (`(event) => void`): Called for pointerleave on this mark; row provenance is optional after transforms.
- `onpointermove` (`(event) => void`): Called for pointermove on this mark; row provenance is optional after transforms.
- `onpointerdown` (`(event) => void`): Called for pointerdown on this mark; row provenance is optional after transforms.
- `onpointerup` (`(event) => void`): Called for pointerup on this mark; row provenance is optional after transforms.
- `onpointercancel` (`(event) => void`): Called for pointercancel on this mark; row provenance is optional after transforms.
- `onpointerover` (`(event) => void`): Called for pointerover on this mark; row provenance is optional after transforms.
- `onpointerout` (`(event) => void`): Called for pointerout on this mark; row provenance is optional after transforms.
- `onpointermissed` (`(event) => void`): Called for pointermissed on this mark; row provenance is optional after transforms.
- `enterEffect` (`boolean | "fade" | object`): How rows that arrive in a keyed update appear: "fade", or {effect, duration, easing}. animate()'s enter option is the value a channel starts from.
- `exitEffect` (`boolean | "fade" | object`): How rows that leave in a keyed update disappear, as enterEffect. animate()'s exit option is the value a channel ends at.

### Animation

- `animation` (`boolean`): Animate changes to the mark's values. Default: `false`.
- `animationDuration` (`number`): How long an animated change takes. Default: `300` ms.
- `animationEasing` (`"linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out"`): The animation's easing. Default: `"cubic-in-out"`.

### Symbol rotation

- `rotation` (`number`): Turns each rectangle about its center. Default: `0` degrees.

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

### Advanced renderer options

- `maxInstances` (`number | null`): The most rows drawn; past it the rows are sampled (null draws them all), though SVG and PDF exports draw every row. Default: `null`.

## Usage

Without z bounds, renders XY rectangles with optional inside borders. Borders apply to flat rectangles; extruded boxes have no border stroke. Paired z0/z1 produces solid boxes in 3D. Reversed or nonfinite intervals are skipped. Orthographic polar rectangles require zero latitude and valid angular/radial intervals.

On a Plot with `antialias="off"` or `"smaa"`, a 2D Rect computes its edges' coverage in its shader, so its edges stay smooth without MSAA, Rects side by side leave no seam, and a Rect thinner than a pixel still shows. A turned Rect on a log, sqrt or symlog axis, and a Rect in a polar or spherical frame, keep plain edges there.

> **SVG and PDF export**
>
> **Vector, except** on a map whose seam crosses a rectangle more than once or whose latitude limit (Mercator) cuts it, extruded in a 3D view (`z0` and `z1` differ), or in a 3D view that holds a mark with no vector form there (Points3D, Surface or another 3D mark, a Heatmap or Image, a lit or additive mark, a globe or polar frame): then SVG and PDF exports draw the rectangles (in a 3D view all of that view's marks) as an image, and `mode="vector"` refuses it. Flat rectangles in other 3D views are vectors too, drawn back to front by depth (approximate where marks cross closely). A `fill` column of numbers or categories stays vector, in a polar frame too. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Histogram bins](/HMPlot/examples/histograms.md)
