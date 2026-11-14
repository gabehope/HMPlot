# Frame

A coordinate frame inside a Plot: its own scales for some marks (a second y axis), or a small chart placed within its parent.

## Example

```svelte
<script>
  import { Frame, Line, Plot } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2], count: [40, 10, 25, 5] };
</script>

<Plot {data} height={300} axes2d>
  <Line x="x" y="y" />
  <Frame y={{ domain: "auto", side: "right" }}>
    <Line x="x" y="count" />
  </Frame>
</Plot>
```

## Options

- `animationGroup` (`column | column[] | null`): Match animation rows by these columns within each filtered/transformed snapshot; selections keep Data.key. null restores key/position matching. Default: inherited; otherwise Data.key, then position.
- `animateBounds` (`boolean`): Animate numeric domains and ranges independently of mark animation; structural changes and direction reversals snap. Default: the parent frame's (false on Plot).
- `boundsDuration` (`number`): Duration of scale transitions, independent of mark timing. Default: the parent frame's (300). In ms.
- `boundsEasing` (`"linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out"`): Easing of scale transitions, independent of mark timing. Default: the parent frame's (cubic-in-out).
- `axisFrame` (`boolean`): Draw a complete rectangular border in 2D Cartesian frames without duplicate ticks or labels. Default: the theme's.
- `axisMask` (`boolean`): Clip marks and picking to the rectangular 2D Cartesian axes interior, intersecting ancestor masks. Default: the theme's.
- `placement` (`"fit" | {anchor, size, orientation, rotation}`): Anchors a fixed-size frame at a point of its parent: anchor in parent data coordinates, size in CSS pixels (2D) or world units (3D), and an optional rotation. "fit" centers it in a Cartesian parent's domain, across 90% of the parent's shorter side, and refits it as the parent's view changes. It cannot combine with ranges.
- `rules` (`{axis, value, label, color, width, dash}[]`): Reference lines in this frame's coordinates (a spoke or circle in a polar frame), as on Plot.
- `bands` (`{axis, from, to, label, color, opacity}[]`): Shaded spans of this frame's x or y axis behind its marks, as on Plot.
- `coordinates` (`"cartesian" | "polar" | "spherical"`): This frame's coordinate system. A frame that changes its parent's needs x and y ranges or a placement. Default: the parent's.
- `sphericalView` (`"globe" | "projected"`): How a 3D spherical frame shows the sphere, as on Plot. Default: the parent's.
- `angleUnit` (`"degrees" | "radians" | "extent" | "custom"`): The unit of this frame's polar or spherical angles, as on Plot. Default: the parent's.
- `anglePeriod` (`number`): Angle units in one turn when angleUnit is "custom", as on Plot. Default: the parent's.
- `baseRadius` (`number`): The radius at zero in a polar or spherical frame, as on Plot. Default: the parent's.
- `radialScale` (`number`): The radius per unit in a polar or spherical frame, as on Plot. Default: the parent's.
- `polarAxis` (`"X" | "Y" | "Z"`): The axis a 3D polar frame turns around, as on Plot. Default: the parent's.
- `projection` (`"equirectangular" | "mercator" | "equal-area" | "orthographic" | "equal-earth" | "natural-earth" | "albers" | "albers-usa"`): The map projection of a spherical frame, as on Plot. A spherical frame with ranges must be a flat orthographic disk (radialScale 0). Default: the parent's.
- `projectionCenter` (`[number, number]`): The map's center [longitude, latitude], as on Plot. Default: the parent's.
- `parallels` (`[number, number]`): The albers projection's two standard parallels, as on Plot. Default: the parent's.
- `atmosphere` (`boolean | {color, thickness}`): A glow around a spherical frame's globe in a 3D plot: true, or a CSS color (default "#7fb2ff") and a thickness as a fraction of the radius (default 0.1). It is not picked and has no legend. SVG and PDF exports draw the whole plot as an image. Default: `false`.
- `x` (`{domain, range, transform, label, ...}`): Omit it to share the parent's x scale. A domain (or "auto") gives the frame its own; a range places the frame within its parent, in parent data coordinates, and fits the frame's own data unless a domain is given.
- `y` (`{domain, range, transform, label, ...}`): The frame's y, as x: a domain with side "right" makes a second y axis.
- `z` (`{domain, range, transform, label, ...}`): The frame's z in a 3D plot, as x.
- `scaleDefaults` (`{color, size, width}`): Defaults for the continuous color, size and width scales this frame's marks make, as on Plot.
- `name` (`string`): The frame's name in the settings pane. Default: `"Frame"`.
- `autoBounds` (`boolean`): Fit the frame's missing domains to its marks' data; an explicit domain always wins. Default: `true`.

## Usage

Each dimension inherits its parent's scale unless you give it a domain, "auto", or a range. A dimension with its own domain is linear unless you set `transform`, even inside a log or sqrt parent; a range-only dimension keeps the parent's transform. A range places the child in parent data coordinates, composed through linear, log, and sqrt ancestors. `placement` anchors a fixed-size frame at a parent data position (CSS pixels in 2D, world units in 3D) with optional rotation. Moving a placement moves the frame and re-prepares nothing inside it; in a Python scene its numbers may be expressions of inputs, evaluated as they change (`{"anchor": [8 * hm.cos(hm.input.day / 58), 0, 0], ...}`: the gallery's solar system orbits its planets this way). `placement="fit"` centers the frame in a Cartesian parent's domain (at the middle of each axis as drawn, on log, sqrt and symlog axes too), across 90% of the parent's shorter side, and refits it as the parent pans, zooms or resizes; a Pie places its own polar Frame this way.

Shift-drag on a child frame's tick strip brushes the column its marks plot on that axis, counting the marks of frames inside it that inherit that axis; a twin axis (a child with its own axis and no range) brushes on its own strip too. The band is drawn only on the strip, and a column shared with other strips shows the same band on each; editing any of them edits the one constraint.

A child frame's axis titles follow its own dimensions: one it owns is titled by its own label, else by the column its marks plot on it; one it inherits is titled by the frame it inherits from, where its marks' columns count (see [Frame axis titles](frame#axis-titles)).

Child axes are drawn on the child's own boundary; inherited dimensions do not duplicate their axes. A dimension a child owns draws its axis once it has a domain: one you give, or the extent of the marks that plot on it. Until then it draws no axis, so a range-only child whose marks all sit in a Frame inside it that sets its own x (a Frame in every facet cell, say) shows only its y axis.

## Animated scales

Set `animateBounds={true}` on a Frame to transition numeric `x`, `y`, and `z` domains and
ranges, including inferred domains. `boundsDuration` (milliseconds) and `boundsEasing`
configure scale transitions independently of mark animation. Nested Frames inherit these
scale settings; child marks retain their own `animation`, `animationDuration`, and
`animationEasing` settings. Plot accepts the same bounds controls for its implicit frame.
Python uses `animate_bounds`, `bounds_duration`, and `bounds_easing`.

Transitions start from the layout currently displayed, including when interrupted. Guides,
marks, picking, masks, and PNG/SVG/PDF exports all read that displayed mapping. A frozen
animation clock freezes scales too. Initial layout, categorical scales, changes of transform,
and interval direction reversals arrive immediately instead of interpolating through an
invalid or zero-width scale. Scale endpoints interpolate in data units. Placement and
projection parameters are not animated by this option.

The [Streamgraph example](/HMPlot/examples/streamgraph.md) transitions its inferred scale and areas
together, with equivalent Svelte and Python programs.

```svelte
<Frame animateBounds boundsDuration={700} boundsEasing="cubic-in-out"
  y={{ domain: [0, maximum] }}>
  <Area x="time" upper="value" />
</Frame>
```

## Axis borders and masks

`axisFrame={true}` adds a complete border to a rectangular 2D Cartesian frame. It does not add duplicate ticks or labels on the opposite edges. Set each axis's `line` independently to hide its baseline while retaining ticks, titles, or arrows.

`axisMask={true}` clips data to the axes interior, including parts of large points, thick lines, fills, and data text that cross an edge. The `hmplot` theme enables masking; `minimal` leaves it off. Use `axisMask={false}` to allow overflow from this frame. An enabled ancestor mask still applies, so a child cannot draw outside a masked parent. Nested ranged frames, rotated Cartesian placements, and facet cells use their own boundaries.

Masks work even when axis lines are hidden. They leave guides, titles, legends, brush handles, and controls visible. Hidden fragments cannot be picked, and visible fragments retain their normal interactions. Brushing continues to store constraints in data units; masking does not filter the underlying table or clear an existing selection when you pan.

PNG uses the same fragment mask as the screen; SVG and PDF use matching clip paths, preserving transparent margins. This option supports rectangular 2D Cartesian surfaces. Theme masks are ignored on polar, spherical, and 3D frames; explicitly enabling `axisMask` or `axisFrame` there reports an error. Python uses `axis_mask` and `axis_frame`.

`invert: true` on an axis definition flips its direction on screen — the domain runs top-to-bottom for y, right-to-left for x, near-to-far for z. It is a reversed output range, so automatic domains, log and sqrt transforms, brushing, nearby picking, and ticks all keep working; the settings pane shows it as an Invert checkbox next to the transform. Explicit domains override inference; hidden decorations do not disable the scale. `scaleDefaults` configures automatic appearance mappings for compatible data channels.

> **SVG and PDF export**
>
> **Vector, except** a spherical Frame drawn as a globe, or a Frame in a 3D plot whose view holds a mark with no vector form there (see [Plot](plot)): SVG and PDF exports draw all of that view's marks as one image, and `mode="vector"` refuses it. In other 3D plots a Frame's 2D marks are vectors, drawn back to front by depth. The Frame's axes, `rules` (dashed ones too) and `bands` stay vector. An `atmosphere` makes the whole plot one image: SVG and PDF exports draw all of the plot's marks, with the atmosphere, as one image (its axes, titles and legends stay vector), and `mode="vector"` refuses it. See [what is not exported as vector](/HMPlot/docs/export.md).

## Atmosphere

`atmosphere` on a spherical Frame in a 3D plot draws a glowing rim around its globe: `atmosphere` (true) or `atmosphere={{ color: "#7fb2ff", thickness: 0.1 }}`, the thickness a fraction of the globe's radius. It is a slightly larger sphere seen from inside, added onto what is behind it, brightest at the globe's edge and fading outward; it moves with a placed Frame. It is not a mark: it is not picked, it sets no axis domain and has no legend. The solar system example gives the Earth one. PNG exports include it; SVG and PDF exports draw the whole plot as an image (see the note above).

## Axis titles

An axis is titled by its `label`; without one (an empty label or null means automatic), by a categorical position scale's label (`categorical({label})`), else by the name of the one column its marks plot there. Names follow aliases and transform outputs: a Facet over `fields` titles each cell's axis by its field (the column `value` is that field), a Bin's edges and a Histogram's bars by the binned column, a Histogram's height by its normalization (count, proportion or density), and Bar, BoxPlot, Violin and Lollipop by the columns you give them. Constants (a baseline of 0, a Text at `x={5}`) do not count. An axis whose marks plot several different columns, raw arrays, expressions, or nothing has no title at all; set `label`, or hide every title with `axisTitles={false}`. A Frame that sets its own domain, range, transform or scale for a dimension reads only its own label (a twin y axis is not titled by the Plot's label), and a dimension a Frame inherits is titled by the frame that owns it. The 3D box uses the same titles. Automatic titles are never stored as settings: the settings pane shows them as the label's placeholder, and Reset returns to them.

`animationGroup` (`animation_group` in Python) on Data, Plot or Frame matches animated
rows by a column or list of columns independently of Data keys. It inherits through the
tree; a child Frame overrides its branch, and explicit null (Python None) restores
Data-key/position matching. Filter to one row per group before tweening: a country/year
table can keep `key=["country", "year"]` and animate by `"country"` after filtering
to one year. Groups must be unique in each tweened snapshot, and changing the group
column scheme resets motion history. Selection, hover and connections keep Data identity.

## Related examples

- [Nested scales](/HMPlot/examples/nonlinear-frames.md)
