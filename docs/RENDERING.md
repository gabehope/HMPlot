# Lines, flat symbols and 2D axes

All settings are optional. Grids, reference lines and minor ticks default off;
existing circle/square sizes and solid Points3D geometry are unchanged.

```svelte
<script>
  import {
    Plot,
    Line,
    Points,
    datetimeCoordinates,
  } from "hmplot";
  import { numpy as np } from "hmplot/jax";
  // Run after await initializePlot(), in the browser.
  const time = datetimeCoordinates([
    new Date("2026-11-01T00:00:00-04:00"),
    new Date("2026-11-01T01:00:00-04:00"),
    new Date("2026-11-01T01:00:00-05:00"),
    new Date("2026-11-01T02:00:00-05:00"),
  ]);
  const points = np.array(
    Array.from(time.values, (x, i) => [x, [20, 24, 23, 26][i]]),
  );
  // Own and dispose points after marks settle on replacement/unmount.
</script>

<Plot
  axes2d
  width={800}
  height={480}
  x={{
    domain: [0, 3 * 3600000],
    type: "datetime",
    origin: time.origin,
    timezone: "America/New_York",
    majorInterval: { unit: "hour", step: 1 },
    minor: true,
    minorInterval: "15 minutes",
    grid: "major-minor",
  }}
  y={{
    domain: [15, 30],
    format: ".1f",
    step: 5,
    subdivisions: 5,
    grid: "major",
  }}
  rules={[
    {
      axis: "y",
      value: 22,
      label: "Target",
      color: "#98704c",
      width: 1,
      dash: [4, 3],
    },
  ]}
>
  <Line position={points} color="#347cac" width={2} />
  <Points
    position={points}
    shape="diamond"
    rotation={15}
    fill="#f4f2ed"
    outlineColor="#30343b"
    outlineWidth={0.45}
    onclick={(event) => console.log(event.axisValue.x)}
  />
</Plot>
```

`axisValue.x/y` on 2D picking events use data units, or Unix milliseconds for
datetime axes. `point` remains the existing world-space coordinate; surface
`dataPoint` remains unchanged. Picking uses two float32 attachments (IDs/UV and world coordinates), staying
within the standard 32-byte-per-sample limit while retaining temporal detail.

## Axis options

A Plot's (or Frame's) `x`, `y` and `z` are its axes. Besides `domain`, `range`, `transform`,
`scale` and `label`, each accepts:

- `type`: `numeric` (default) or `datetime`.
- `format`: D3 numeric or time-format string; empty chooses automatic labels.
- `timezone`: `UTC` (default), `Local`, or an IANA name.
- `origin`: Unix milliseconds subtracted from every datetime coordinate.
- `major` (default true), `step` (0: automatic) and `majorInterval` (a datetime interval;
  automatic when empty).
- `minor` (default false), `subdivisions` (default 5), `minorStep` and `minorInterval`. Log
  scales instead use intermediate decade ticks.
- `grid`: `off`, `major`, or `major-minor`. X produces vertical rules; Y horizontal.
- `context` (datetime x axes, default `true`): a second row of labels; see "Datetime axes".
- `breaks` (datetime axes): intervals the axis leaves out; see "Datetime axes".
- `calendar`: a model calendar's axis, set from its column; see "Datetime axes".

Calendar intervals accept `{unit,step}` or text such as `15 minutes`, `1 month`.
Units range from millisecond through year. Hour/minute arithmetic advances elapsed
time across skipped/repeated hours; day/week/month/year arithmetic is calendar based.
Automatic repeated-hour labels include their UTC offsets. Custom formats are used
verbatim: include `%Z` if a custom format must distinguish repeated local hours.

`rules` contains `{axis, value, label?, color?, width?, dash?}`. X means vertical;
Y means horizontal. Numeric values use data units. Datetime rules accept numeric
Unix milliseconds, Date objects or ISO strings with an explicit Z/offset. Width
and dash lengths use CSS pixels. Six-digit hex colors are supported. A label sits
beside its rule, above a horizontal one, in the theme's text size (as Callout's).
On a 2D orthographic sphere, numeric X and Y rules follow longitude and
latitude curves and stop at the visible horizon. They are drawn on the GPU over
the marks (docs/SPHERICAL.md); their labels are in the SVG axes, and their
colors, widths and dash patterns in vector exports. A rule replaces
a coincident graticule rather than drawing twice.
On a 2D polar plot, X rules follow the angle as radial lines and Y rules follow
the radius as circles. They also retain their labels and styles in vector output.

The inherited settings pane exposes the same fields, a formatting preview, and a
reference-line list. Invalid edits retain the prior valid setting. Internally,
per-field inheritance uses flat keys such as `plot.axisXFormat` and
`plot.axisXMajorInterval`; rules use `plot.referenceRules`. `getAxisLayout()` returns
the current shared CPU tick layout for diagnostics; it does not read mark arrays.

Labels alone are culled for collisions. Rules and minor ticks remain aligned, are
clipped to the axis rectangle, and dense requests are suppressed before geometry
allocation. Rules render before marks without depth writes or picking. An opaque
heatmap can cover them. Export uses the same GPU frame plus the formatted SVG axes.

## Datetime axes

Two-level labels (TODO 53.4). A datetime x axis labels its ticks by their unit (day numbers
under days, `%H:%M` under hours, `%b` under months) and adds a second row where the coarser unit
changes: the date under hours, the month and year under days and weeks, the year under months.
Its first entry starts at the first tick drawn; when the first period is a sliver at the edge,
the next one's label takes its place. `x={{ context: false }}` keeps one row, with the span-based
labels (`%b %d`) as before; an explicit `format` labels the ticks and keeps the second row. The
bottom margin grows to fit both rows (36 px at the default font). Y axes have one row.

Range breaks (TODO 53.5). `x.breaks` leaves intervals out of a datetime axis, as Plotly's
rangebreaks do, in the axis's time zone: `"weekends"` (Saturday 00:00 to Monday 00:00),
`{ hours: [16, 9.5] }` (every day from 16:00 to 09:30, wrapping past midnight),
`{ dates: ["2026-12-25"] }` (whole days) and `{ from, to }` (one interval), alone or in a list.
Patterns expand over 20 years either side of the axis's origin. Positions on the axis are times
less the time removed before them, counted from the origin: the mapping happens where a datetime
column meets its axis (utils/namedData.js, on the GPU), so every mark maps through it and a line
joins its points across a break. The axis ticks at the interval the visible positions call for;
a tick inside a break (or at its start) moves to its end, so a day's tick sits at the session's
open. The axis inverts positions for brushes, the pointer and the visible domain (@view_x_min
reads a time). Breaks are not a coordinate transform: the linear requirement below stands, and
a grid (Heatmap) draws its cells without them. A view across a break far longer than itself
draws no ticks rather than stepping through it.

Model calendars (TODO 53.6). Times in a 360_day, all_leap (366_day) or noleap (365_day) calendar
stay numbers since a reference date (a NetCDF file's, TODO 48.6, or a JS schema entry's
`{ type: "numeric", calendar: "360_day", calendarUnits: "days since 1850-01-01" }`). Their axis
is a datetime axis in that calendar: ticks at its years, months and days, labels by its own
arithmetic (a 30 February exists in 360_day), tooltips and readouts in it. Breaks do not apply.

## Datetime precision

Call `datetimeCoordinates(dates, {origin: existingOrigin})` for subsequent batches.
The helper subtracts in JavaScript number precision **before** float32 conversion.
It returns `{values: Float32Array, origin: number}`. Pass that origin explicitly to
the axis, and keep mark bounds relative to it. Never convert absolute modern epoch
milliseconds to float32 first. Timezones only alter ticks/labels, not coordinates.
Datetime axes require linear mapping.

Relative float32 coordinates still have finite precision: spacing is roughly
`abs(relativeMilliseconds) / 2^23`. For example, millisecond detail is available
near the origin but cannot be retained across a multi-year span. Rebase all related
arrays and their shared origin together when finer detail is needed; the library
never infers an origin from GPU arrays. A column with a datetime schema reads ISO strings (a
CSV's dates): with their offset, else as UTC.

## Blend modes

Every mark takes `blend`: `"normal"` (default), `"additive"`, `"multiply"`, `"screen"`, or `"subtractive"`. Blending is a property of the mark's material, so it applies to every row; any mode but normal draws the mark transparent and without depth writes, since order-independent composites should not occlude one another. Picking always uses no blending. Vector export keeps screen and multiply as `mix-blend-mode` on the exported elements; additive and subtractive have no SVG equivalent, so those marks are rasterized into the document with a report warning (or refused in `mode: "vector"`). The Mona Lisa histogram example screens its three channel histograms so overlaps add up to white.

## Sky, fog and glow

A Plot can show four presentation effects (TODO 37), all off by default: a sky behind a 3D plot
(an equirectangular image, or a zenith-horizon-ground gradient), `glow` on any mark (tuned by a
bloom effect), distance fog on a 3D Plot, and an `atmosphere` around a spherical Frame's globe.
The sky, bloom and fog are entries of the Plot's `effects` list (TODO 138.3), beside plugins'
effects. A plot with none of them renders exactly as before, through the same path.

**Why after the scene pass.** The GPU scene stays transparent: the page and the export
compositors own the plot's background, so CSS colors come out exact. Sky, fog and glow are
composited in the presentation step that turns the scene pass into the canvas (utils/presentation.js),
not added to the scene: no `scene.background`, no sky mesh, no `scene.fog` and no per-mark fog
shader. The picking pass, the minimap, surface textures and document-export rasters render the
scene themselves, and a sky or a glow there would be read as data or drawn twice. The live
canvas and PNG exports build their output with the same function, so an export shows what the
screen shows (exports at 4x MSAA, at their own size); SVG and PDF draw such a plot as one raster
image.

**The order.** Per pixel, from the scene pass's premultiplied linear color and its depth:

1. Fog: the color (unpremultiplied) blends toward the fog color by the pixel's camera-space
   depth, linearly from `near` to `far`, clamped; alpha is kept, so empty pixels stay clear.
2. Glow: the bloom of the glow attachment is added. The glow has no coverage of its own outside
   its mark, so its brightest channel is its coverage (alpha = max(scene alpha, glow)): a halo
   shows on a transparent canvas and over the page's background.
3. The output conversion: tone mapping and the color space.
4. The sky goes beneath, in display space, so an image shows its file's colors and a gradient
   its CSS colors, as an Image does, never through the tone mapper. It is opaque.

**Hooks (TODO 138.1).** Each effect attaches through one hook in utils/presentation.js, and the
render loop (scenes/interactive.svelte) names none of them: it asks the presentation which
attachments the scene wants this frame (`attachmentsFor`; a change rebuilds the scene pass),
which linear and display hooks a render through its camera shows (`activeFor`; a change of their
key rebuilds the output node), and which effects an export must rasterize (`rasterEffects`). The
stages are an attachment (the glow's MRT output and its bloom), linear (fog, then the glow's
composite), display (the sky) and object (an atmosphere, registered with `addObject`). Each hook
declares its order in its stage, the cameras it applies to and whether SVG and PDF must draw the
plot as a raster while it shows. Settings stay uniforms.

**Plugins' effects (TODO 138.3).** A registered plugin's effect (registerPlugin, plot/plugins/)
is a linear or display hook like the built-ins', added when a Plot's `effects` lists its kind
(`setPluginEffects`). Its number and color parameters are uniforms the presentation creates for
it (display-stage colors in display space), so a new value redraws and compiles nothing; any
other parameter, and one marked structural, is part of the hook's key, so a change rebuilds the
output node. A hook whose nodes throw is left out with a plugin.failed warning, and a kind no
plugin registers is a plugin.missing warning: the plot draws without either.

**Plugins' shades (TODO 138.3).** A mark's `shade` (utils/shade.js) is a plugin's fragment hook:
the mark's applyBlend, which every mark's build calls, sets the material's outputNode to
`shade({ color, screenCoordinate, screenUV, time, params })` over the output the mark set (or
three's own `output`); the line material, which sets its outputNode in setup, applies it there
(`shadeOutput`). Marks with a lit material add `normalView` and `positionView`; reading one on
another mark throws while the shade is built, which is the mark's plugin.input error, and the
mark draws unshaded. Uniforms are as an effect's; a plain parameter is part of the shade's key,
and a new key shades the material again (one compile). The picking pass's MRT output replaces the
shaded color, so picking is unchanged; varyings a shade adds count in the varyings check
(limit.varyings names the mark). SVG and PDF exports draw a shaded mark as an image.

There is no physical coupling between fog and bloom: a glow is added after the fog, so a
fogged glowing mark keeps its halo. Fog blends before the tone mapper like the scene's own
colors; without tone mapping (the default) full fog is exactly its color, while with ACES
(`toneMapping={4}`) a white fog shows as a light gray.

**Glow.** When a visible mark glows, the scene pass writes a second attachment beside its color:
each drawn object's own linear color times its glow, with the material's blending. The value is
read per object (`plotGlow`, set from the mark's `glow` option) by one uniform the whole pass
shares, so changing a glow compiles nothing; objects that are not marks write 0. Opaque marks
without glow write 0 there too and hide a glow behind them through the shared depth buffer, and
a translucent one in front dims it. Three's `BloomNode` blurs the attachment (a high pass and five
half-resolution mips, sized by the canvas). Without a glowing mark the attachment and the blur
passes do not exist. The glow is a pass-level MRT, not a material's `mrtNode`: a material MRT
replaces the output of every render without one (an export straight into a target, a surface
texture's color pass), which would draw nothing there.

**Fog** reads the scene pass's depth texture (multisampled with MSAA) and needs a perspective
camera. **The sky** reconstructs each pixel's view direction from the camera's inverse
projection and world matrix (utils/sky.js has the math, unit tested); its up is the camera's
up. **The atmosphere** is the one effect in the scene: a back-facing shell fitted to its globe
before each draw, additive, not pickable (the picking pass draws interactive marks only), with
no data and no legend, and left out of the minimap.

**Accepted limits.** One depth sample cannot represent overlapping translucent marks, so fog
uses the nearest opaque depth (or the far plane); marks that do not write depth (labels,
translucent marks) take the fog of what is behind them. Antialiased edges show small
depth/coverage artifacts in fog. The bloom's tail reaches far on a small canvas: a transparent
export keeps faint coverage around a large glowing mark. Marks drawn onto a Surface do not glow.
**Export.** PNG includes every effect. A sky, fog, a glowing mark or an atmosphere makes the
whole plot one image in SVG and PDF exports: all of the plot's marks, with the effect, are drawn
as one image (its axes, titles and legends stay vector; a report warning says why), and
`mode="vector"` refuses it, naming the effect. A bloom effect alone changes nothing; a plugin's
effect rasterizes unless it declares `export: "none"`. DOCUMENT-EXPORT.md,
"What is not vector", has the whole list.

**Cost.** See docs/PERFORMANCE.md "Sky, fog and glow".

## Mark order in 2D

In a 2D view, marks draw in the order they are written: a later mark covers an earlier one wherever they overlap. The order is the component order, across Data scopes, transforms, graph scopes, Frames and embedded facets, and it does not depend on when a mark's data finishes preparing: `<Edges><Routes /></Edges>` written before `<Nodes>` stays under the node symbols although Routes starts drawing last. Opaque and translucent marks interleave in that order. Reordering components (a keyed `{#each}`) or inserting one later puts each mark at its written position; the marks are not rebuilt. Rows inside one mark keep their own order. A compound mark (Bar, BoxPlot, Histogram, ...) draws its parts in the order it writes them, at its own position. Picking gives a click to the mark on top, and PNG, SVG and PDF export paint in the same order. A chart drawn into a surface texture orders its own marks the same way.

Only coplanar marks follow the written order. Depth testing still applies, so a mark placed at a nearer explicit `z` covers a farther one whatever the order; translucent marks that intersect at different depths blend in drawing order, as before. Two marks are flat in 2D for this reason: a Heatmap's value relief and the thickness of `Arrows3D`' solid shafts apply only in 3D (seen from above they look the same). A spherical 2D heatmap keeps its deliberate small offset behind the other marks. In a periodic (wrapping) spherical 2D view, the wrapped copies are drawn in extra passes and can land above marks written after them.

3D views keep three.js ordering: opaque objects first, then translucent ones sorted by distance; the written order has no effect there. Switching a view between 2D and 3D switches the behavior.

How it works (for contributors): each NamedMark and GeoJSON renders an empty `<template data-plot-layer>` outside its `{#if prepared}`. Threlte renders the component tree inside the view's `<canvas>`, and Svelte inserts late `{#if}` content at its anchor and moves keyed content with its component, so the markers' document order is the written order. A Threlte plugin registers every drawing object below a marker with that marker's slot; utils/layerOrder.js sorts the slots of each scene by document order (a MutationObserver on the canvas notices keyed moves) and sets consecutive `renderOrder` values, flushing pending changes before each render of the scene. For a 2D scene it also moves three's opaque render items into the transparent list after `RenderList#finish`, so one sort by `renderOrder` covers both; materials, blending and anti-aliasing are untouched (forcing `material.transparent` would change shaders that branch on it). That hook reaches `RenderList` through the renderer's private `_renderLists`; tests/browser/layer-order.spec.js fails if a three.js upgrade breaks it. Coplanar marks tie exactly in depth, so no depth offset is used.

## Mark names: screen-sized and 3D

Point, arrow and text marks come in two kinds. The short name is screen-sized: sizes in pixels
by default, drawn facing the camera, the right default in 2D and 3D plots alike. `3D` means
geometry in data units, not "for 3D plots": it shrinks with perspective, can be lit, and text can
lie in a plane.

| Screen-sized | Geometry in data units |
|---|---|
| `Points`: symbols of every shape | `Points3D`: spheres or cubes, lit |
| `Arrows`: 2 px shafts, 10 x 8 px heads | `Arrows3D`: tube shafts and cone heads, lit |
| `Text`: text from data, with `box` and `leader` | `Text3D`: text geometry in the plot plane unless `billboard`; `tex` draws TeX |

`Callout` is a `Text` with a leader and a halo (or a box). `Rect` and `Prism` split the same way under two
nouns. Marks are named after the shape they draw, as in the grammar-of-graphics libraries
(ggplot2's `geom_point`, Vega-Lite's `point`), not after a chart.

## Point size units

A `Points` size is the point's diameter, in CSS pixels by default (`sizeUnits="px"`): a point keeps its width whatever the zoom, and a literal `size` of 6 (the default) draws a point 6 pixels across, as a column mapped through `sizeScale`'s range draws the range's pixels (TODO 73.1; before, a literal drew at half its value). `sizeUnits="data"` makes `size` a length in source x units — a size-1 square tiles a Cartesian unit grid, and zooming scales the points with the axis. A root Cartesian plot's automatic x domain holds each such point's whole width (center ± size/2), and its y domain too when the plot keeps `aspect="equal"` (under `"auto"` a point's height in y units depends on the final scales, so y holds the centers). For polar and spherical frames, x units are angular. The shader measures the local projected x-direction scale at each row through the complete frame chain and camera; a zero-radius or pole singularity collapses to zero size. Simple affine Cartesian frames retain a constant-scale shader path. These calculations use GPU data and camera uniforms, with no per-frame CPU readback or rebuild on zoom. SVG exports use the same local source-direction measurement. `Points3D` is geometry in data units and keeps `sizeAttenuation` in its three.js sense (perspective shrinking); that option is hidden for the 2D marks, where it never applied.

`Text` stays screen-facing and keeps its pixel size inside nested polar and
orthographic spherical Frames. Its position follows the owning frame and its
pixel offsets remain screen offsets. Eligible 2D labels export as searchable
SVG/PDF text. CPU `Text3D` still follows its documented placement
limits.

## Symbols and lines

Flat symbols: `circle`, `square`, `diamond`, `triangle`, `hexagon`, `plus`, `cross`,
`star`. Rotation is counterclockwise degrees in the glyph plane, default zero. Symbols
use a shared GPU signed boundary for fill, inward outline and picking; transparent
corners do not capture events. Square rotation is fitted inside its existing glyph
area. Points remains camera facing in 3D; solid Points3D is unchanged.

Point and path opacity (decision, 2026-09-22; revised 2026-09-23 by TODO 6.11 A5 and the
stage merges; extended to Segments, Lines and Arrows3D 2026-09-28). Flat points, Segments,
Lines and Arrows3D draw opaque (points and lines with alpha-to-coverage) and blend when
opacity can drop below 1 (`blended()` in objects/base.js): `opacity < 1`, `transparent`, a
blend mode other than `normal`, or an `interactionOpacity` field (brushable, hover- or
select-responsive marks, keyed fades, per-row opacity or RGBA alpha, `@time` opacity). In
2D, large or outlined points blend too: points in data units, a constant size above 16 CSS
pixels, a size scale reaching past it, unscaled per-row sizes, or a nonzero outline width.
Alpha-to-coverage turns edge coverage into a few MSAA sample levels, which Apple GPUs dither,
so large circles and small contrasting outlines had frayed edges. Blending costs fill rate
(1M overlapping 24 px points at a
device pixel ratio of 2 drew in 101 ms a frame against 85), so small unoutlined points keep
alpha-to-coverage, where the edge is a pixel or two. In 2D a mark with an interactionOpacity
field blends from the start, even while every row is opaque: switching on the first dimmed
row would rebuild every mark's material, and compile pipelines, during the first hover or
brush. 3D marks are the exception: they keep alpha-to-coverage until a row is actually
translucent (namedMark reports it through `setInteractionTranslucent()`), because blended
fringes lose per-sample depth, and the old always-blend rule cut light halos into
overlapping 3D points. Once a 3D mark has blended it stays blended, so later fades and
brushes do not rebuild it, and blended 3D sprites discard fragments below half coverage
instead of writing fringe depth. Blending does not cost antialiasing: the fragment alpha
already carries a smooth coverage ramp at the symbol edge (1 - smoothstep over one pixel of
the signed distance), so blended rims are as soft as coverage rims (opacity.spec.js checks
both). What blending gives up is order independence: overlapping points composite in draw
order. Paths blended only when `transparent` was set until 2026-09-28: an unblended Line or
Segments at opacity 0.5 drew at 0.25, since alpha-to-coverage both covers that fraction of
the samples and keeps the alpha in each covered one, and Arrows3D (a mesh) drew opaque.

Row opacity (the `interactionOpacity` field: hover dimming, responds, keyed fades, per-row
opacity expressions, and a Filter's hidden rows at 0) means, per mark (TODO 32.2):
- points and labels blend (above);
- Segments, Arrows3D and Lines blend (above) and multiply it into their alpha; rows at 0 are
  dropped by an alpha test;
- Uncertainty bands are transparent (0.2 by default), so row opacity dims them;
- Rect, Prism, polar Rect and GeoJSON fills are opaque meshes: row opacity shows or hides a row
  (0 hides it; any other value draws it fully), as dimming an opaque mesh would need
  transparency and depth sorting;
- Heatmap, Image and Surface have no rows to dim.
Objects compute it with `rowAlpha()` (objects/base.js). Before 32.2, polar Rects, Uncertainty
bands and GeoJSON fills ignored it: a polar Rect drew the rows a Filter hid.

Connected Line paths use neighboring GPU positions for miter joins (limit 4),
bevel fallback, and round caps only at path endpoints. Independent Segments retain
the original geometry. Dashes, GPU width/color attributes and surface subdivision
remain supported. Connected paths add two neighboring-position attributes; no
position readback or CPU path tessellation is used. Surface sampling and animation
continue on the GPU. Degenerate/two-point paths are supported.

Transparent line coverage uses alpha blending once, rather than applying opacity
again through hardware alpha-to-coverage. The scene output unpremultiplies linear
RGB before display conversion and premultiplies it afterward, preventing pale
antialiased colors and white grid rules on transparent canvases.

### Antialiasing modes

A Plot's `antialias` option (TODO 58; it replaced the numeric `msaa`) chooses how the screen
smooths triangle edges:

- `"msaa"` (the default): 4x multisampling.
- `"ssaa8"` and `"ssaa16"`: hybrid sampling through the existing presentation compositor.
  Native MSAA remains 4x (WebGPU supports only 1 or 4 samples); the scene pass renders
  at √2 or 2 times the width and height, then downsamples in linear light with a small
  positive-weight reconstruction filter measured in output pixels. This avoids the integer
  ratio producing harder edges than the fractional ratio. This gives
  nominal 8x/16x sampling density, with 2x/4x as many rendered pixels and higher GPU/memory
  cost. CSS mark sizes, frame placements and masks stay unchanged. Picking stays at the
  canvas resolution; optional bloom/fog/sky use the higher-resolution scene.
- `"smaa"`: a post pass in linear light, before the output conversion. Three's SMAA 1x medium,
  with edge detection that compares alpha as well as color (threeExtensions/smaa.js). The
  canvas is transparent and premultiplied, and a mark's edge against the page is a change of
  alpha. Its passes clear to transparent: three's cleared to opaque black, which blacked out
  the plot's background.
- `"off"`.

Exports always render with 4x MSAA, whatever the screen uses.

Points, lines, text and heatmap contours antialias in their shaders, whatever the mode. Flat 2D
rectangles do too when the canvas has one sample ("off" and "smaa"; see "Analytic edges"
below): Rect, Histogram, Bar and BoxPlot's boxes. The modes matter for the other filled marks
(Area, other Prism footprints such as Hexbin's hexagons, 3D Prisms, polar sectors and
Pie, GeoJSON fills, surfaces, 3D meshes).

Measured 2026-09-28 (Apple M-series, device pixel ratio 2): 1.5M rectangles and 2M points on
a 1400 x 900 plot drew in 54-57 ms a frame with MSAA, 42-43 ms with SMAA and 42-43 ms with
none. Scenes that fit a frame drew at 60 fps in every mode.

SMAA is not the default because it smooths edges the shaders already smoothed. Thin lines
pinch, and straight edges bend where lines cross them. FXAA, tried the same day, frayed both.
Use SMAA for fill-bound scenes where the frame rate matters more.

#### Analytic edges

On a Plot whose `antialias` is "off" or "smaa" (TODO 59), a flat 2D rectangle computes its
edges' coverage in its shader (objects/prism.js, utils/analyticEdges.js), so Rect, Histogram,
Bar and BoxPlot edges look as they do with MSAA:

- Each row is a quad. Its vertex maps its own corner and its two neighbors across the rectangle
  through the frame chain, which gives the rectangle's screen parallelogram (its chain is
  affine; or, unturned, an axis-aligned box through log, sqrt or symlog scales). The corner
  moves out to where the edge's fringe ends, and the distances to the four edges, in device
  pixels, interpolate exactly.
- Coverage is a one-pixel box filter across each pair of edges: the exact area, so a rectangle
  narrower than a pixel draws as a faint line (4x MSAA misses the thinnest).
- The mark blends: alpha-to-coverage needs samples. Blended draws lose the GPU's removal of
  hidden fragments, which costs on scenes where opaque rectangles overlap many times (below).
- Rectangles side by side would let the background through where their shared edge crosses a
  pixel (a quarter of it at worst; SVG renderers do the same). So an opaque mark in normal
  blending grows each side of at least 2 pixels by half a pixel (tapering to none at 1 pixel):
  the later neighbor covers the shared pixel and a Histogram shows no seams. Its ink is 1-4%
  above MSAA's. Translucent rectangles, and other blend modes, keep the exact filter: grown,
  two translucent neighbors would blend twice, a darker line.
- Only the live canvas's scene pass draws them, while it has one sample. Exports (always 4x
  MSAA), picking, minimaps and Heatmap texture children draw the plain rectangle at full alpha,
  the same pixels as before: an export under "off" equals one under "msaa", and picks follow
  pixel centers. With MSAA (the default) the mark builds exactly as before.
- Drawn as before, without analytic edges: rectangles refined as patches (polar and spherical
  chains, a turned rectangle under nested log scales), a turned rectangle with a log, sqrt or
  symlog axis (its corners do not make a parallelogram), other Prism footprints, and 3D.

Measured 2026-10-01 (Apple M-series, Chrome, device pixel ratio 2, a 1400 x 900 plot, the
points turning each frame; mean frame, median of 3-5 runs; "before" is "off" without analytic
edges):

| Scene | MSAA | SMAA | off | off before |
| --- | --- | --- | --- | --- |
| 60k rects, 100k points, a 40k-point line; 600k rects, 800k points; 1M rects in a grid | 16.7 | 16.7 | 16.7 | 16.7 |
| 1.5M rects and 2M points at 16 px | 33.9 | 29.9 | 30.3 | 28.0 |
| 1.5M overlapping rects, 7-55 px (about 200 layers deep) | 20.6 | 17.3 | 18.5 | 16.7 |
| 4M rects under a pixel | 16.7 | 18.9 | 18.3 | 16.7 |

Analytic edges cost about a tenth over plain "off" where rectangles dominate: blending gives up
the GPU's removal of hidden fragments, and each rectangle draws its fringe. "off" stays faster
than MSAA on fill-bound scenes, but millions of sub-pixel rectangles draw faster with MSAA,
which spends no fragments on them. The default stays MSAA; whether 2D plots should default to
"off" is open (TODO 59).

## Mark capabilities

What each mark kind can do is one table, `MARK_CAPABILITIES` in utils/markKinds.js (TODO 32.7);
namedMark, namedData, the keyed lifecycle, connections and Frames read it instead of lists of
kind names, and tests/unit/mark-kinds.test.js checks that every kind declares every capability.
The main columns, as of 2026-09-26:

| Kind | A Filter's hidden rows | Keyed | Endpoint | `connections` | Point interactions | Inside Frames |
|---|---|---|---|---|---|---|
| Anchor | compacted | yes | yes |  |  | nested |
| Points | scattered | yes | yes |  | yes | nested |
| Points3D | scattered | yes | yes |  | yes | flat |
| Text | scattered | yes | yes |  | yes | nested |
| Text3D | compacted |  |  |  |  | nested |
| Rect | scattered | yes | yes |  |  | patches |
| Prism | scattered | yes | yes |  |  | flat |
| Line | prefix |  |  | yes |  | nested |
| Segments, Arrows3D | scattered | yes | yes | yes |  | nested |
| Arrows | compacted | yes | yes | yes |  | flat |
| Area | masked |  |  |  |  | intervals |
| ErrorBars | masked | yes |  |  |  | intervals |
| Flow, GeoJSON | compacted |  |  |  |  | Cartesian only |
| Heatmap, Image | (a raster) |  |  |  |  | warped |
| Surface | (a raster) |  |  |  |  | Cartesian only |

- **A Filter's hidden rows**: "scattered" draws every physical row, the hidden ones at row
  opacity 0; "masked" draws hidden rows as missing (NaN bounds), which breaks a band as a
  missing row does; "prefix" draws a straight Line's visible rows first, up to the count;
  "compacted" reads the visible rows packed together, so a new selection is new data. In the
  first three forms the lengths stay fixed as the selection changes, so nothing recompiles and
  a new selection swaps the rows' opacity (namedMark's `paddedMode` and `swapValid`). A mark
  with channel animation (`animate()`, `tween()`, `@time`) or `enterEffect`/`exitEffect`, series, Dodge, a
  connection that matches rows on it, or more rows than `maxElements` reads the compacted rows
  whatever its form. A mark animated by the `animation` switch alone keeps the scattered or
  masked form over a Filter of its table (TODO 32.12): rows the Filter shows or hides do so at
  once (its row opacity never transitions), a row that enters while its values change takes
  them at once (hidden rows are -1 in the write's `snapRows`, and RowTransition.reindex snaps
  them before the retarget), and the table's keys match rows across data updates. A straight
  Line's valid-first rows reorder with the mask, so an animated Line reads them compacted.
- **Keyed**: a keyed update stages its instances, entering and departing rows included (see
  ANIMATION.md, "How a keyed update is drawn").
- **Endpoint** and **`connections`**: it can be a connection endpoint; it can draw
  connections (docs/CONNECTIONS.md).
- **Point interactions**: `nearby` and graphical brushes pick it, and its rows take their
  feedback opacity as a component prop.
- **Inside Frames** (frameMarks.js): "nested" follows any chain of Frames, nested coordinate
  overrides included; "intervals" and "patches" are refined through any chain; "flat" follows
  any nonlinear or placed chain but not a nested coordinate override; "warped" is a texture
  whose grid vertices map through the chain; "Cartesian only" needs a Cartesian range Frame
  with linear parents.

Row opacity per mark is under "Symbols and lines" above. The table also has columns for Dodge,
endpoint pixel offsets, widths in data units, segment rows, grid tables (`gridTable`), regions a
tolerant pick takes only under the pointer (`regions`) and per-row stroke widths
(`strokeWidth`); see the comment at its top.

It also says how an update may reach a mark's published preparation without preparing it again
(Stage 118): `liveChannels` and `liveWriter` (Points and Points3D rewrite positions, Rect its
corners, Text its labels' positions, sizes, offsets and opacity), `retains: "static"` (Text keeps
its preparation, atlas and fields when nothing it reads changed) and `feedbackChannels` (Points
rewrite their hovered size in place). `planMarkUpdate` (utils/markUpdatePlan.js) reads these to
choose between static reuse, a live write, a mask swap and full preparation. A mask swap waits
for a channel whose columns changed in the same update to be written.

## What recompiles

(docs/PERFORMANCE.md goes node by node: what each transform and mark reads, passes down, reads
back and compiles.)

Transforms and interaction masks run as jax-js compute kernels; marks draw with three.js render pipelines. Compiling either takes milliseconds to tens of milliseconds, and neither cache is ever emptied, so a gesture that compiles on every move is slow and keeps growing memory. hmplot bundles a patched jax-js (`@hmplot/jax`; vendor/jax-js/PATCHES.md) whose kernels read their lengths and constants from uniforms, so a compute kernel compiles once for its structure, not once per value or row count. After a gesture has run once, repeating it with different values compiles nothing (tests/browser/pipeline-churn.spec.js and the specs named below check each case):

- Hover, picking and selection. A pointer move reads back the picking pass under the pointer. Brush, category and nearby masks are jitted functions that take their bounds as arguments.
- Brushes and Filter sliders. A Filter passes on its input's rows with a mask of the kept ones, so lengths downstream do not change (docs/DATA.md, "Filters and padded views"). When a narrow selection of 65,536 rows or more is compacted into a bucket, each bucket length compiles once, the first time it is used.
- New numeric values: Filter thresholds, Bin extents, expression literals, Slice times, brush extents, axis and scale domains and ranges, colormaps, `opacity` while it stays below 1, fill and outline colors (except a solid Surface's fill, which rebuilds it), and rotation.
- Mark options that are uniforms: `quantize`, the fill, size and width scales' transforms (rebuilds.spec.js), Text `align`, the position and size of a Text3D on a sphere (label-options.spec.js), Segments `curveAlpha`, and the device pixel ratio.
- Facets and Partitions. The cells of one mark compile the same shader, so the interaction matrix draws with 3 distinct render pipelines (facet-variants.spec.js). A Partition group whose rows did not change in a data update keeps its view and nothing under it runs again (docs/FACETS.md).
- A 50,000-row filter chain under 40 random brushes and 15 slider values compiles nothing and holds its memory flat after warming up (soak.spec.js).
- Distributions and animation after a Filter: a new brush over Violin and BoxPlot, a Slice at a new time every frame, and a Hexbin with an `extent` under a slider (pipeline-churn.spec.js, the brushed-distributions, moving-particles and half-million-threshold examples).
- New row counts: data replaced with a different number of rows, a keyed update that adds rows, or a Filter's kept rows compacted at a new count. tests/unit/kernel-lengths.test.js runs every transform, alone and after a Filter, at two lengths.

These compile once for each new value:

- A new integer divisor or short loop in a kernel. A divisor is an inner dimension: a new number of bins, groups or categories, or a new grid resolution. A loop is a reduction's length when one thread computes each output: a reduction shorter than 64 rows, or into more than 256 outputs, keeps its length in the kernel, where the shader compiler unrolls it (2-4 times faster than a length read at run time). Sorts of 512 rows or fewer and cumulative sums compile once per power of two, and a Filter's bucket lengths (over 65,536 rows) are powers of two.
- Options that change a shader's structure: `shape`, `lit`, `transparent` (and `opacity` crossing 1, which switches it), `sizeAttenuation`, `sizeUnits`, `detail`, `blend`, `dashed`, `curve`, `xTransform`/`yTransform`/`zTransform`, Heatmap `surfaceMode` and `depthtest`, contour and grid flags, and registering a custom shape. The mark rebuilds once per change; several options changed together still rebuild it once.
- The first use of a mark type, transform or gesture in a session.

Readbacks wait for the GPU and copy values to the CPU, which takes tens of milliseconds while the GPU is busy. These remain:

- A mark on an axis with an automatic domain reads its extents: every field on every such axis in one readback per update. An explicit domain (`x={{ domain: [0, 1] }}`) skips it. The readback starts while the mark prepares its data, and the data and the new axis appear in the same frame.
- Grouped transforms (Group, BoxStats, BoxOutliers, Window with `by`, Density with `by`, ...) read back their group count once, when their key columns first appear (after a Filter, a new selection reuses the grouping, unless the Filter buckets its rows: then the groups are found again among the kept rows on every run), and their output's row count once per run. BoxStats, BoxOutliers and the `quantile` reducer compute every group at once on the GPU; `series` on a Line, Area reads back only its series count.
- A Filter reads its kept count once per run (for `view.length`, the rows a padded mark shows and the bucket choice).
- A Slice after a Filter reads its entity count once per Filter update, and again only while `at` lies outside the times at which every entity is active (docs/INPUTS.md, "Slice").
- An input whose range reads the data (`min=hm.min("x")`) reads it once per data version, never per move.
- Picking reads back once per pointer move; committing a selection reads its count once.

A brush drag over the Mona Lisa histograms went from 529 readbacks to 64.

### Rules for contributors

- A data-dependent JavaScript number may go into a jax-js operation: the bundled jax-js reads a kernel's nonzero constants from uniforms, so a new value compiles nothing. Zero and nonzero are different kernels, and integer divisors stay in the source: keep data-dependent numbers out of shapes (`reshape`, broadcasts) and out of `%` and integer division. utils/deviceParams.js (`deviceParams`, `deviceScalar`, `deviceArray`) still keeps a value on the device, which upstream jax-js needed. tests/unit/kernel-literals.test.js (new values) and tests/unit/kernel-lengths.test.js (new row counts) record the WGSL each kernel compiles to (tests/unit/compiled-programs.js); add a case for each new transform or interaction path.
- Create a jitted function once per module, not per call. Pass every data value as an argument, since closures are frozen when the function is traced. Arguments are consumed, so pass `.ref`.
- Read a Filter's rows through `view.padded()` or `view.prefixed()` and mask every reduction, count and extent by `valid` (the invariants are at the top of utils/dataView.js). A consumer that calls `get()` sees the kept rows compacted. That is correct, but it sorts and gathers the rows again for every selection.
- Name every storage buffer node. three names an unnamed one `NodeBuffer_<id>`, which makes every mark's shader unique.
- If an option changes only a value, make it a uniform (base.js `transformOption`, `flagOption`, or `this.option(name, true)`). Rebuild only for structural changes, and apply several options at once with `batchOptions`.

### Measuring

tests/perf/kernel-profile.spec.js totals GPU time per jax-js kernel over a brush with jax-js's profiler (`PAGE=` a route; `DUMP=` a regular expression prints the WGSL of the matching kernels). Its timestamps come in steps of about 65 µs and share the GPU with rendering, so compare totals over many dispatches, alternating builds.

tests/browser/gpu-counters.js counts compute and render pipelines, shader modules, created buffers and live buffer bytes, readbacks by source, and mark `build()` calls. Run specs that assert build counts on a fresh dev server. After an edit, a long-running server gives the app a new copy of each edited module (`?t=`) that the counter does not wrap, so `build()` counts read 0 and those assertions pass vacuously.

The measurement specs under tests/perf/ are not part of the regular suite. They start a dev server on port 5173 unless one is running:

```sh
PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/gesture-churn.spec.js
SCENARIO="filter-chain" PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/gesture-churn.spec.js
PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/transform-churn.spec.js
PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/facet-dupes.spec.js
```

gesture-churn runs each scenario three times: cold, warm (the identical gesture) and fresh (a different gesture of the same kind). It prints one `RESULT {json}` line per scenario, and `SCENARIO` selects scenarios by regular expression. Fresh is what a user pays. Warm repeats every value, so it hides kernels that bake values in. transform-churn counts compute pipelines for each transform at a cold length, warm, with new values at the same length, and at new lengths. facet-dupes counts distinct render pipelines by their full descriptor across facet cells.
