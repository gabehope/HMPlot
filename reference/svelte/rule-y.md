# RuleY

A horizontal reference line at y across the frame: one per row, or one at a value or the pointer.

## Example

```svelte
<script>
  import { Plot, Line } from "hmplot";
import { RuleY } from "hmplot/charts";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [3, 4, 2, 5, 6, 5] };
</script>

<Plot {data} height={300} axes2d>
  <Line x="x" y="y" />
  <RuleY y={4} />
</Plot>
```

## Options

### Options

- `x0` (`channel`): Where the rule starts in x: a number or a column. Default: the left of the frame's visible domain.
- `x1` (`channel`): Where the rule ends in x: a number or a column. By default the rule spans the frame as it pans and zooms. Default: the right of the frame's visible domain.
- `dash` (`boolean | number | [number, number]`): Dash the rule: true (4 px dashes and gaps), a dash length (gaps as long), or [dash, gap], measured along the drawn rule. In px.

### Position

- `y` (`channel`): Where the rule stands: a number, a time or a category draws one rule, a column one per row, and "@pointer_y" follows the pointer.

### Appearance

- `color` (`color`): The rule's color. Default: `"#8a949e"`. Default: the theme's rule gray.
- `width` (`number`): The rule's width. Default: `1` px. Default: 1.
- `opacity` (`number`): The rule's opacity, 0 to 1. Default: `1`.

### Display

- `label` (`string`): The mark's name in the legend and the settings pane.
- `legend` (`boolean`): Whether the mark has a legend entry. Default: `false`.
- `visible` (`boolean`): Whether the rule is drawn. Default: `true`.
- `blend` (`"normal" | "additive" | "multiply" | "screen" | "subtractive"`): How the mark mixes with what is drawn under it; any mode but normal draws it transparent, and SVG and PDF exports draw additive and subtractive as an image. Default: `"normal"`.
- `glow` (`number`): How much the mark glows: its own color times glow blooms around it in the plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's strength and radius. SVG and PDF exports draw the whole plot as an image. Default: `0`.
- `shade` (`ShadeSpec`): A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind: "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each fragment the mark draws; picking, tooltips, domains and legends are unchanged. SVG and PDF exports draw a shaded mark as an image.
- `name` (`string`): The rule's name in the settings pane.

### Interaction

- `identity` (`identity`): Whose rows these are for selections: an identity() shared by tables that show the same things. Default: its data's.
- `select` (`boolean | selection`): Click a rule to select its row: true uses its data's selection, or give a selection().
- `hover` (`boolean | selection`): Mark the rule under the pointer as @hovered, without fading the others: true uses its data's hover, or give a selection().
- `respond` (`boolean | "selected" | "brushed" | "hovered" | "nearby" | selection | array`): Which interaction states fade the rules outside them. Default: the states it sets, except hover.
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

- `transparent` (`boolean`, setting): Draw the mark in the transparent pass, blended in depth order with other transparent marks. Default: `false`.

### Advanced renderer options

- `maxInstances` (`number | null`): The most rows drawn; past it the rows are sampled (null draws them all), though SVG and PDF exports draw every row. Default: `null`.

## Usage

RuleY draws a horizontal rule at `y` across the frame: a threshold, one rule per row of a column, or the pointer (`y="@pointer_y"`). By default it spans the frame's visible domain in x; `x0` and `x1` give other ends, so `x1="@pointer_x"` draws a leader from the axis to the pointer.

The rule follows the frame's coordinates: a circle in a polar frame (an arc between `x0` and `x1`), a parallel on a map or a globe. Rules never widen automatic domains.

RuleY is a built-in template, built from transforms and simpler marks: import it from `hmplot/charts`.

> **SVG and PDF export**
>
> **Vector, except** in a 3D view that holds a mark with no vector form there (Points3D, Surface or another 3D mark, a Heatmap or Image, a lit or additive mark, a globe or polar frame): then SVG and PDF exports draw all of that view's marks as one image, and `mode="vector"` refuses it. In other 3D views the rules are vectors too, drawn back to front by depth (approximate where marks cross closely). `dash` and a `color` column stay vector. See [what is not exported as vector](/HMPlot/docs/export.md).

For Plotly users, this is the `add_hline` pattern. For a shaded interval, use [BandY](/HMPlot/reference/svelte/band-y.md) (the corresponding `add_hrect` pattern).

## Related examples

- [Crosshair and rules](/HMPlot/examples/crosshair.md)
