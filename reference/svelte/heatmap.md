# Heatmap

A grid of values drawn as colors, one cell per value.

## Example

```svelte
<script>
  import { Plot, Heatmap } from "hmplot";
  const fill = [
    [0, 1, 2, 1],
    [1, 3, 4, 2],
    [2, 4, 3, 1],
  ];
</script>

<Plot height={300} autoBounds>
  <Heatmap {fill} />
</Plot>
```

## Options

### Options

- `pixelated` (`boolean`): Draw each cell as a flat square of its value instead of blending it into its neighbors. Default: true for a 2-D array of at most 64 cells along each side, without surfaceMode or contours in a 2D plot; false for a grid table.

### Position

- `x` (`column`): Over a grid table, the dimension drawn along x. Default: the grid's last dimension.
- `y` (`column`): Over a grid table, the dimension drawn along y. Default: the grid's second-to-last dimension.
- `z` (`channel`): The z position, in a 3D plot: a column, per-row values, or one value.

### Appearance

- `fill` (`column | number[][]`): The values, one per cell, mapped to colors: a 2-D array (nested lists or a NumPy array in Python), or a variable of a grid table. A 2-D array's cell in row i and column j is centered at x = j, y = i (row 0 at the bottom), so the axes span -0.5 to n - 0.5, unless the plot sets the axis's domain.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacityScale). Default: `1`.

### Scales

- `fillScale` (`scale`): The fill's scale, which marks can share: continuous({domain, colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for categories.
- `colormap` (`string | color[] | object`): The colormap of a numeric fill or color: a name, a list of colors, or {colors, space, positions}. Default: the theme's (Viridis).
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

### Geometry

- `detail` (`number`, setting): How finely a point's or a surface's geometry is divided (sphere segments, grid cells).

### Shading

- `lit` (`boolean`, setting): Shade the mark with the plot's lights. Default: `false`.
- `transparent` (`boolean`, setting): Draw the mark in the transparent pass, blended in depth order with other transparent marks. Default: `false`.

### 3D settings

- `sizeAttenuation` (`boolean`, setting): Shrink far points in perspective, as three.js does. Default: `true`.

### Surface settings

- `zScale` (`number`, setting): How high a surface's values stand: the relief's height scale. Default: `0`.
- `surfaceMode` (`boolean`, setting): Draw the grid as a surface whose height is its values, instead of a flat raster. Default: `false`.
- `surface3d` (`boolean`, setting): Draw the surface in 3D, lit and seen from the camera, rather than flat in 2D. Default: `false`.
- `depthtest` (`boolean`, setting): Hide the parts of the surface behind other geometry. Default: `true`.

### Advanced renderer options

- `textureResolution` (`[number, number]`): The size of the texture a Heatmap's child marks are drawn into. In px.

## Usage

fill accepts a shaped tensor or a named shaped column. surfaceMode and zScale control numeric relief; texture resolution is independent of mesh detail. Child marks paint an interactive texture.

A plain 2-D array places its cells on their indices: the cell in row i and column j is centered at x = j and y = i, row 0 at the bottom, so a 4 x 4 matrix's axes span -0.5 to 3.5 with no padding, and its cells stay there beside other marks. The axis's domain, set on the Plot or Frame, or `xbounds`/`ybounds` place the grid over another extent instead, and a Plot that fits no domains (`autoBounds={false}`, a JavaScript Plot without data) keeps its default one.

For a labeled matrix, pass categorical position scales on the Plot: `x={"scale": hm.categorical(domain=column_labels)}` and `y={"scale": hm.categorical(domain=row_labels)}` in Python. The labels name the matrix indices in that order; categorical y puts row 0 at the top, and `invert=True` reverses it. Axis labels reserve their own margins, unlike manually positioned Text marks near the canvas edge.

For ordered or clustered genes, see the [ordered gene heatmap recipe](/HMPlot/recipes.md#ordered-gene-heatmap-with-a-condition-strip). Supply a leaf order or compute one with SciPy before plotting; index both the matrix rows and gene labels with the same order, leaving the original matrix unchanged. The recipe includes a diverging colorbar, a column condition strip and its legend, with room for 40 gene labels.

`pixelated` draws each cell as a flat square of its value. Unset, a 2-D array of at most 64 cells along each side draws sharp cells, and a finer one (a sampled field) and a grid table's field blend neighboring cells smoothly; surfaceMode, contours and a 3D plot's relief, which read the field between cell centres, blend unless `pixelated` is set. `pixelated={false}` blends a small grid; `pixelated` sharpens a large one.

Over a grid table (a `gridTable()`, a Grid's or a 2-D Density's output; see Data, "Grid tables"), `fill` names a variable and the Heatmap draws the grid's last two dimensions, or the ones `x` and `y` name, placed by their coordinates: uneven, descending and wrapped coordinates in every mode, a curvilinear grid on its own cells. Missing values and cells a Filter hides draw nothing. Slice away any other dimension first.

> **SVG and PDF export**
>
> **Image.** SVG and PDF exports draw a Heatmap, with any marks drawn into it, as an image at the export's raster DPI (in a 3D view with all of that view's marks), and `mode="vector"` refuses it. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Density & surfaces](/HMPlot/examples/surface.md)
