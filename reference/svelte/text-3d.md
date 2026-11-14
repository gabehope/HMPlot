# Text3D

One piece of text drawn as geometry in the plot, plain or TeX math.

## Example

```svelte
<script>
  import { Plot, Text3D } from "hmplot";
</script>

<Plot type="3d" height={300} axes3d>
  <Text3D text="Hello" position={[0, 0.4, 0]} size={10} />
  <Text3D text={"e^{i\\pi} + 1 = 0"} tex position={[0, -0.4, 0]} size={10} />
</Plot>
```

## Options

### Options

- `text` (`string`): The text to draw. Text3D draws one label; use Text for a label per row.
- `tex` (`boolean`): Typeset the text as TeX math (with MathJax), such as \frac{1}{x^2+1}. Default: `false`.

### Position

- `position` (`[number, number] | [number, number, number]`): Where the text sits, [x, y] or [x, y, z]: its middle, or the end that align names. Default: `[0, 0, 0]`.

### Appearance

- `color` (`channel`): The text's color, a CSS color. Default: the theme's Text color (#252525 in the default theme).
- `size` (`channel`): The text's size (its font size): one number. Default: `3` world units.
- `opacity` (`channel`): The opacity, 0 to 1: a number, or a column (categories map through opacityScale). Default: `1`.

### Scales

- `sizeScale` (`scale`): The size's scale, which marks can share: continuous({domain, range, transform}) for numbers (without a range, the automatic one), or categories with a numeric range.

### Display

- `label` (`string`): The mark's name in the legend and the settings pane.
- `legend` (`boolean`): Whether the mark has a legend entry. Default: `true`.
- `visible` (`boolean`): Whether the mark is drawn. Default: `true`.
- `domains` (`boolean`): Whether the mark's data counts toward its axes' automatic domains; false leaves them to the other marks (a reference line, a decorative part). Default: `true`.
- `rows` (`"auto"`): "auto" draws one item when no channel reads a column (a line at a value, a label at a point), instead of one per row of the data; "@" view-state fields are not columns.
- `blend` (`"normal" | "additive" | "multiply" | "screen" | "subtractive"`): How the mark mixes with what is drawn under it; any mode but normal draws it transparent, and SVG and PDF exports draw additive and subtractive as an image. Default: `"normal"`.
- `glow` (`number`): How much the mark glows: its own color times glow blooms around it in the plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's strength and radius. SVG and PDF exports draw the whole plot as an image. Default: `0`.
- `options` (`string[]`): The settings the settings pane shows for this mark, by name.
- `name` (`string`): The mark's name in the settings pane, and the name facet.endpoint() and partition.endpoint() find it by.

### Interaction

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

### Animation

- `animation` (`boolean`): Animate changes to the mark's values. Default: `false`.
- `animationDuration` (`number`): How long an animated change takes. Default: `300` ms.
- `animationEasing` (`"linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out"`): The animation's easing. Default: `"cubic-in-out"`.

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

### Text settings

- `font` (`string`, setting): The typeface of the 3D text. Default: `"helvetiker"`.
- `align` (`"left" | "center" | "right"`, setting): How each text sits at its position. Default: `"center"`.
- `billboard` (`boolean`, setting): Turn the text to face the camera. Default: `false`.

## Usage

For text as geometry in data units (in the plot plane unless billboard; tex draws TeX). Use Text for a data-driven text channel or many screen-sized labels. Text3D keeps its existing sizing and geometry semantics. Without a `color`, it takes the theme's Text color.

> **SVG and PDF export**
>
> **Image.** SVG and PDF exports draw Text3D, TeX included, as an image at the export's raster DPI (in a 3D view with all of that view's marks), so its text is not searchable, and `mode="vector"` refuses it. Text exports as text. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Point labels](/HMPlot/examples/point-labels.md)
