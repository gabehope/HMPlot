# Legends and uncertainty marks

`Legend` is a library component. Inside a Plot it reserves a guide strip; outside
it occupies normal document flow. A `for` target can be a Plot, Facet, or mark
handle, or a list of mark handles. Omit `for` inside a Plot to collect its
labeled marks. Explicit undefined targets render nothing until mounted.

```svelte
<Plot bind:this={plot} legend={{ position: 'bottom' }}>
  <Area x={x} lower={lo} upper={hi} opacity={0.2} fill="steelblue" label="95% interval" />
  <Line bind:this={estimate} position={fit} label="Estimate" />
</Plot>
<Legend for={[estimate]} />
```

`label` supplies legend text; `name` identifies a mark in settings. A Plot's or
Facet's automatic legend (`legend`) is a Legend without a channel: it explains what
the marks map from data (a guide per channel, as in "Channels" below), then lists the
labeled marks; marks with `legend={false}` are left out. With no `legend`, a Plot shows
only the colors (fill, color, outline color) mapped from a category column, at the bottom;
`legend={false}` shows none. It leaves out a channel an explicit `<Legend>` explains.
Click or use Enter / Space to toggle visibility; Shift-activation isolates an entry,
repeating it restores the prior visibility. This is independent of observation selection.

## One entry per authored mark

Legend entries belong to the mark as written, not to each place it is drawn.
A mark inside a Facet is drawn once per cell (and inside a Partition once per
group), but it is one entry. Toggling that entry, or clicking one of its
categories, affects every cell. Two marks written side by side are two entries.
Entries are identified by the mark's scope path: each enclosing component's
`name`, or its position among unnamed siblings of the same kind. Renaming a mark
gives it a new entry. Theme scopes are not part of the path, so switching a theme
preset keeps every entry; renaming an enclosing scope at runtime moves the entry,
with its hidden state, to the new name. The exception is `Partition legendGroups`:
each group is its own entry ("Points · Adelie"), and toggling or isolating it
affects only that group (docs/FACETS.md).

Hidden series and hidden categories belong to the entry, not to one drawn copy:
Facet cells that mount later (scrolled into view, or mounted offscreen for a PNG,
SVG, or PDF export) and new Partition groups start with the same series and
categories hidden, and a second click shows them again everywhere. A Legend given
one drawn copy (`<Legend for={points}>` written inside a Facet cell) or a cell Plot
lists and toggles the mark in every cell.

When the mounts of one mark disagree in their written appearance (fill color or
shape), the legend shows the first and logs a warning once the difference holds
across two updates; colors in mid-animation do not count.

## One legend per plot

There is one legend per outermost Plot or Facet. Plots inside an external
Facet grid add their marks to the Facet's legend, which is drawn once around the
grid; the cells draw none. A `legend` setting on a cell Plot, or a `<Legend>`
written inside the cell, is shown once at the Facet level. Use
`<Facet legend={{ position: "right" }}>` to show the automatic legend there, or
`legend="cell"` to restore one legend per cell. `legend={false}` on the Facet hides
the grid legend even when the cells ask for one. The prop can change at runtime:
switching to or from `"cell"` remounts the cells with or without their own
legends. Embedded Facets already share their Plot's legend.

## Channels

`channel` chooses the encoding to explain. Without it, the legend explains every channel
its marks map from data, then lists the labeled marks (series).

| Channel | Category column | Numeric column |
|---|---|---|
| `fill`, `color` | color swatches | colorbar |
| `shape` | symbols | — |
| `outlineColor` | outline rings (point marks) | — |
| `size` | symbols at each size | ramp of 4 sizes |
| `width` | line samples | ramp of 4 widths |
| `opacity` | swatches at each opacity | ramp over the column's range |

Category columns in `size`, `width`, and `opacity` map through `sizeScale` /
`widthScale` / `opacityScale` given as `categorical()` or `ordinal()` with a
numeric range, or spread evenly over sizes 5-16, widths 1-6, and opacities 1-0.3
by default. Numeric `opacity` columns are used as alphas directly.

When several channels are driven by one column, their swatches combine:
`fill="species" shape="species"` draws colored symbols. Attributes no
category drives use the mark's constant appearance.

Ramps sample the scale at four evenly spaced points in its transformed domain,
so a log scale over [1, 1000] shows 1, 10, 100, and 1000. With
`sizeUnits="data"` a point's size is measured in data units, not taken from the
pixel range, so the ramp draws its glyphs in proportion to the sample values (the
largest 20 px wide) and its title notes "(data units)".

Colorbar ticks and ramp labels over a datetime column read as dates, formatted
like a datetime axis for the span shown ("Jan 01" over a year); set the mark's
`legendTickFormat` to a `%` pattern such as `"%Y-%m-%d"` to choose one. Duration
columns label d, h, min, s, or ms.

With several marks (a Plot, Facet, or list target) and a channel, marks that
share one scale resource share one guide: two marks given the same
`fillScale={continuous(...)}` show one colorbar. Marks with automatic scales keep
their own. The guides are titled apart: a scale's `label`
(`continuous({ label: "Score" })`, `ordinal({ label })`, `categorical({ label })`,
Python `hm.continuous(label=...)`) titles its guide, else the guide takes its
first mark's `label`. A single guide keeps the Legend's own `label`. A channel's
guide with none of these is titled by the column the channel plots, as an axis
is: `fill="tas"` titles its colorbar "tas", or a NetCDF variable's long name and
units ("Near-surface air temperature (K)") in Python.

For a continuous colorbar use `<Legend for={heatmap} channel="fill"
label="Density" />`, or `channel="color"` for Line/Segments. Fixed and automatic
normalization, transforms, quantization and live colormap changes use the source
mark's mappings. Only compact bounds cross to the CPU for labeling; gradients use
the same GPU colormap as marks. Bounds updates are coalesced to five per second. A mark whose
colors hold a missing value (NaN or null) adds a "Missing" swatch in the color it draws them in
(its scale's `missing`, else the theme's), on screen and in exports; one without none.
Positions are top/bottom/left/right. A colorbar's five ticks sit evenly along the
colormap, so with a `midpoint` (docs/DATA.md) the middle tick is the midpoint and each half
is labeled on its own piece of the map; a size or width ramp with a midpoint gets an odd
number of samples, the middle one at the midpoint. symlog scales label their ticks through
the transform, as log scales do.

## Settings and export

Plot settings include an automatic legend switch and placement. Inherited mark
settings include label, participation, visibility, guide font size, text color,
and tick format. Explicit Legend placement overrides inherited placement.

Embedded guides appear in PNG, SVG, and PDF exports of the Plot or Facet;
external legends export on their own (`exportSVG`, `exportPDF`). In SVG and PDF,
colorbars are vector `<linearGradient>` fills (quantized maps use hard stops);
PNG keeps the rendered colorbar. Legends never appear in minimaps.

Marks colored through a colormap export as vectors too: each point, line or fill
gets the color the GPU draws (TODO 70), so a 2D plot with its colorbar exports
with `mode: "vector"`. What still draws as an image is listed in
DOCUMENT-EXPORT.md ("What is not vector").

## Cartesian uncertainty

- `Area x={x} upper={y}` fills to zero. Supply `lower={lo}` for another edge,
  including a column of values. Edges may cross. The default theme uses opacity 1;
  set `opacity={0.2}` for a translucent uncertainty band. Boundary outlines are optional.
- `ErrorBars position={points} lower={lo} upper={hi} orientation="vertical" capSize={6}` accepts
  absolute bounds along X or Y. Width defaults to 1; capSize is the full width
  in screen pixels.

Arrays may be literals or JAX arrays. Shapes must match; supplied ordering is
preserved. Nonfinite values break geometry; reversed ErrorBars intervals
are omitted. The marks do not compute statistics. Picking identifies the original
interval (Area) or observation (ErrorBars). Compatible updates animate
through existing raw GPU attributes; shape changes replace atomically.

These marks occupy the Cartesian XY plane in either camera mode and work inside
Cartesian heatmap texture scenes. Spherical coordinates and standalone surface
attachment are deliberately unsupported. Minimap sampling retains each complete
error bar and uses the same indices for both ribbon boundaries.

## Rules and crosshairs

`RuleX x={…}` and `RuleY y={…}` draw a line where x (or y) is constant, across the frame's visible
domain: a threshold, a release date, one rule per row of a column (`<Data value={events}><RuleX
x="date" /></Data>`), or the pointer. `y0`/`y1` (RuleX) and `x0`/`x1` (RuleY) give other ends,
numbers, columns or view state. A rule follows the frame's coordinates: a spoke or a circle in a
polar frame, a meridian or a parallel on a map or a globe. Rules never widen automatic domains,
and a time on a datetime axis (`x={new Date("2026-02-03")}`, Python a `pd.Timestamp`) counts from
the axis's origin as columns do. `dash` takes `true`, a length, or `[dash, gap]`.

`Crosshair` is a RuleX at `"@pointer_x"` and a RuleY at `"@pointer_y"` with a readout of each
value, finer than the ticks: just inside the frame's bottom and left edges, or with
`readoutPosition="pointer"` (for a polar frame or a map) one label beside the pointer. It draws in the frame it is placed in (a Plot's root frame,
or a Frame), nothing while the pointer is off that frame, and nothing in exports. A still pointer
costs nothing: its parts update once per animation frame with a move. `theme.marks.RuleX`,
`.RuleY` and `.Crosshair` set their colors and widths.

The pointer and the visible domain are view state, readable by any channel or expression: see
"Pointer columns" in [Data](DATA.md). Axis `rules` (and `bands`) are the other kind: fixed
lines and spans drawn as part of an axis, configured with the axis rather than as marks.

## Titles, bands and callouts

A Plot (or a standalone Facet) takes `title`, `subtitle` and `caption`: a heading above its
frames and a note below them, in the theme's font and text color (the title bold and about a third
larger than the theme's text, the subtitle and caption lighter). They are part of the plot: its
own PNG, SVG, PDF and HTML exports keep them as text, laid out line by line where the page wraps
them, and a scene's exports get them from the plot. The canvas keeps its `height`; the heading and
caption add to the plot's height, as legends do. `{$name}` shows an input's value
(`title="Anomaly, {$year}"`). In Python, `hm.Plot(title=...)` is the plot's own title now, so
`plot.export_*()` keeps it.

`bands=[{axis, from, to, label?, color?, opacity?}]` on a Plot or a Frame shades a span of an axis
behind the marks and the grid lines: a vertical strip for x, a horizontal one for y, and in a
polar frame a wedge of angles or a ring of radii. A Frame also takes `rules=` in its own
coordinates. Bands and rules are part of the axes: they never read the data, and the settings
pane lists them under Axis.

`Callout` points at a value with a note a fixed distance away: `dx` and `dy` pixels from its point
(default up and to the right), with a leader line from just short of the point to the text
(`leader`). The text has a halo of the plot's background, or a box with `box`, and the theme's text
size, which rule and band labels share. Numbers draw one callout, columns one per row. Callouts do
not avoid each other: choose the offsets. A Callout is a Text with a leader, and Text takes `box`
and `leader` too.

```svelte
<Plot data={series} axes2d title="Monthly temperature anomaly" subtitle="°C" caption="Source: …"
  bands={[{ axis: "x", from: 40, to: 52, label: "Warm spell", color: "#d9824b", opacity: 0.16 }]}>
  <Line x="month" y="anomaly" />
  <Callout x={48} y={1.21} text="Warmest month" dx={-30} dy={-28} />
</Plot>
```

## Text in layouts

A scene can hold text beside its plots. `Title` (Python `hm.Title("...")`) is plain text drawn as
SVG text: its lines break at `"\n"` and wrap at the block's width in the loaded font, so the
scene's SVG and PDF exports write the same lines as vector, searchable text (in the embedded
default font). `size="title"`, `"subtitle"` or `"caption"` follow the theme's text size. Use
Title for publications.

`hm.Markdown("...")` (Python scenes; Svelte apps write their own HTML) is rich text for dashboards:
CommonMark with GitHub's tables, strikethrough, task lists, autolinks and footnotes, and
`$math$` / `$$math$$` typeset by MathJax. Raw HTML is not rendered. Exports place it as an image
of how it looks (captured at `rasterDpi`, listed as a raster layer in the report), so its text is
not searchable there, and `mode="vector"` refuses it.

Both show input values through `{$name}` placeholders, as the input shows them (a Slider in its
format, a Select's label, a multiple Select's labels joined by commas), and follow the input; in a
Python f-string, double the braces: `f"{{$year}}"`. A placeholder naming no input is an error that
names it. Title and Markdown belong in a Scene, Row, Column or Grid, not inside a Plot. Inputs
themselves are left out of static exports.

## Tooltips

`tooltip` on a mark shows the nearest row's values in a box beside the pointer; it is off by
default. `true` lists the columns the mark's channels read (an expression's columns, and an
expression position's plotted value); a list picks the fields, each a column name or
`{ field, label, format }` (a d3-format string for numbers, a %-pattern for datetimes); an object
also sets `radius` (CSS pixels, default 16) and, in Svelte, `content`, a snippet given
`{ values, row, mark, lines }`. A Plot's `tooltip` is its marks' default.

```svelte
<Points x="bill" y="mass" fill="species" tooltip={["island", { field: "mass", label: "Mass (g)", format: ",.0f" }]} />
<Plot data={prices} tooltip={{ mode: "x" }}>
  <Line x="date" y="price" series="ticker" color="ticker" />
  <Crosshair axes="x" readout={false} />
</Plot>
```

- The row is found by a tolerant pick: while a mark has a tooltip (or `nearest`), each pointer move
  reads a window of the pick buffer around the pointer (radius x DPR device pixels; about 83 KB at
  DPR 2, under a millisecond) and takes the nearest drawn row of such a mark, each within its own
  radius. A row under the pointer wins; an area (Heatmap, Image, Surface, Area) under it
  loses to a row within the radius. Occluded and hidden rows are never shown, in 2D, 3D, polar and
  map views alike. That row is `@nearest` (TODO 72): the box shows the row of the same pick, so
  `size={where("@nearest", 10, 5)}` always enlarges the row the box describes, and `nearest` on a
  mark sets it without a box. Hover, clicks and pointer handlers keep the exact pick, on these
  marks too.
- The title is the mark's label, or the category its fill names, with its color. An interval's ends
  under one name (a Histogram bar's) read as one line; an aggregate row lists its provenance. A
  Heatmap or Image shows the cell under the pointer, a Surface its point.
- Values are the table's host values where it has them, else one gathered readback per row, so a
  row's datetimes are exact and categories read as their values; a missing value reads "—".
- `@tooltip` is a virtual column like `@hovered`: 1 on the rows a tooltip shows (the picked
  row, an aggregate row's contributors, each series' row in unified x), in every view of the
  table, and `@any_tooltip` on every row while one is shown. `size={where("@tooltip", 10, 5)}`
  marks the row the box describes.
- The box follows the pointer and flips to stay inside the plot. A drag, pan, brush, wheel zoom or
  camera move hides it until the next plain move; Escape until another row; leaving the canvas
  clears it. On touch a tap shows it and a tap elsewhere hides it. Exports never include it.
- Unified x (`tooltip={{ mode: "x" }}` on a Plot, 2D Cartesian): once per frame while the pointer
  moves, a strip of the pick buffer a few pixels wide at its x lists each series' row nearest the
  pointer's x (a line's nearer vertex), titled by that x, with a marker where each series crosses
  it. A series hidden under another at that x is left out.

