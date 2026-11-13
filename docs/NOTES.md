# Feature and implementation notes

Developer notes that were the repository's README before the first release (R2.4 moved them
here). They describe behavior and decisions in detail; the user-facing documentation is the
docs site, and the README is for newcomers.

> **Use this in another Svelte app:** see [library installation and usage](USAGE.md).
> Build with `npm run package`, or create a local installable tarball with `npm pack`.
> The package name is `hmplot`; it is not yet published to npm.

# Plot studio

A static SvelteKit plotting playground using jax-js 0.1.25, Three.js WebGPU, and Threlte. Computation and rendering share a GPU device. A WebGPU-capable browser is required.

```sh
npm ci
npm run dev
```

Open `/` for the interactive studio and `/gallery` for surfaces, curves, arrows, labels, picking, and multiple plots embedded beside an application sidebar.

```sh
npm test                         # numerical, ownership, validation, and lifecycle tests
npm run check                    # Svelte and TypeScript checking
npm run test:browser             # Chrome with WebGPU; Playwright starts Vite if needed
npm run test:examples            # gallery example specs (separate Playwright config)
npm run test:package             # pack the library and build a consumer app against it
npm run test:python-scenes       # notebook scene and interaction fixtures
npm run check:python-signatures  # generated Python stubs match the registry
npm run build                    # static site in build/
```

The browser suite uses locally installed Google Chrome. Set the Playwright `channel` to your installed Chromium channel if needed. There is no dependency on a sibling JAX checkout.

## Embedding a plot

```svelte
<script>
  import { Plot, Points } from "hmplot";
  let plot;
</script>

<Plot bind:this={plot} name="Measurements" width={640} height={420}>
  <Points name="Samples" position={[[0, 0], [0.5, 0.8]]} fill="#5366dc" />
</Plot>
```

A Plot fits its container up to 800px wide (or fills it with `responsive`) and is 450px tall; `width` fixes the width in pixels, and `height` sets the height. Use `type="2d"` or `type="3d"`; both retain their camera controls. Plot names update their display label without changing option identity. Unnamed plots receive stable numbered labels, and duplicate names are disambiguated. Mark and context names identify their scopes at mount time.

Settings open from a button inside the owning plot. The built-in buttons require a canvas of at least 240 × 160 CSS pixels; smaller plots can use an external trigger. Pointer and touch behavior, docking and the plot's context menu are described below.

The first opening selects **Plot settings**, containing 2D/3D view mode, antialiasing, navigation, and axis overlays. Reopening remembers that plot’s selected target, search, section expansion, and scroll position (including explicit shared editing) for its mounted lifetime. **Marks** contains values inherited by marks; named group defaults and marks are nested below it. The breadcrumb and per-control source identify the editing scope. Reset removes an override. Related controls stay grouped and remain visible but disabled when their feature is inactive. Shared defaults require a separate action and identify the mounted plots they can affect; local overrides survive shared changes. View mode is local to each plot, while sizing remains host-controlled.

The existing `type` prop accepts host updates. To observe panel edits in the host, use optional two-way binding:

```svelte
<script>
  let view = $state('2d');
</script>

<Plot name="Measurements" bind:type={view} width={640} height={420}>
  <!-- marks -->
</Plot>
```

Under **Plot settings → Axes**, enable **Show 2D axes** for overlaid tick marks and labels. These follow the X/Y data bounds, transforms (linear, log, square root, or symlog), and output ranges in **Marks**, including pan and zoom; mark-specific overrides do not redefine the common axes. The `axes2d` plot prop defaults to `false`.

**Plot settings → 2D axis style** controls font size, line thickness, tick length, all four margins, tick-label visibility, and editable X/Y titles. Dimensions are CSS pixels. In code, a Theme's `axes` sets the style (`fontSize` 11, `lineWidth` 1, `tickSize` 5, `marginLeft` 64, `marginRight` 12, `marginTop` 12, `marginBottom` 24); the Plot's `axisTickLabels` (true) and `axisTitles` (true) show the tick labels and titles, and `x={{ label }}` and `y={{ label }}` title the axes. An empty label means automatic: an axis is titled by the one column its marks plot there (`x="hour"` titles it "hour", a Facet over `fields` titles each cell by its field), and has no title when they plot several columns, raw arrays or expressions. These support inheritance and per-control reset. Margins reposition the overlay without changing the data scale; oversized margins are bounded to half the canvas dimension. Controls remain visible but disabled while 2D axes are inactive.

**Show 3D orientation** displays an X/Y/Z indicator in the lower left while the 3D canvas is hovered. It follows camera rotation without intercepting pointer gestures. The `orientation3d` plot prop defaults to `false`: the overview minimap shows the camera, and the plot's settings and export buttons use the lower right. Both settings are retained when switching views and can be changed in the panel.

Switching view mode replaces camera controls while preserving marks, data, and overrides. Each mode starts with its existing default camera view.

Each plot has a settings button and an export button in its lower right, inside the default bottom axis margin. They are hidden until the pointer is over the plot, faint while it is, and fully shown while the pointer or keyboard focus is on one; touch screens show them faintly. On a plot at least 480 × 320 on screen, settings dock inside the plot's right side, full height; a smaller plot's settings float beside the button. Export opens a small panel above its button, and the plot's context menu offers both. They follow the plot's theme (its background and text color), and a page can restyle them with the custom properties `--hm-controls-background`, `--hm-controls-color`, `--hm-controls-accent` and `--hm-controls-font`. A Facet has the same buttons in its top right, clear of its cells' own.

A host application can own the trigger:

```svelte
<button onclick={(event) => plot.openSettings(event.currentTarget)}>Appearance</button>
<Plot bind:this={plot} name="Measurements"
  settings={{ showTrigger: false, allowSharedDefaults: false }}>
  <!-- marks -->
</Plot>
```

The settings flags all default to `true`:

- `showTrigger: false` hides both buttons; `showTrigger: true` still respects the minimum size (a canvas of at least 240 × 160).
- `showExport: false` hides the export button (the settings button keeps its place) and the context menu's "Export…". With `showTrigger: false` both buttons go whatever `showExport` says.
- `menu: false` turns off the plot's context menu: right-click shows the browser's own menu, the ContextMenu key and Shift+F10 do nothing, and marks' `contextmenu` callbacks still fire. With `showTrigger: false` and the menu on, the menu still offers settings.
- `allowSharedDefaults: false` leaves "Shared defaults…" out of the settings pane.

A Facet takes `showTrigger`, `showExport` and `menu` for its own buttons; its cells' Plots follow its `showExport` and `menu` unless they set their own. A read-only published plot turns all three off, so no buttons or menu remain and keyboard focus reaches only the plot:

```svelte
<Plot settings={{ showTrigger: false, showExport: false, menu: false }}>
  <!-- marks -->
</Plot>
```

```python
hm.Plot(settings={"show_trigger": False, "show_export": False, "menu": False})
```

The host's own calls (`openSettings()`, `exportPNG()` and the other exports) work whatever the flags say. External triggers work at every size. `openSettings()` without a usable trigger falls back to the plot bounds. If shrinking a plot removes the trigger anchoring an open panel, that panel closes and focus returns to the plot; externally anchored panels remain open. `closeSettings()` dismisses the panel. `whenSettled()` waits for queued field uploads and submitted GPU work; `getDiagnostics()` reports renderer resource counts and active field managers. These methods also support integration tests. The optional `toolbar` snippet renders directly below the canvas.

## Data and options

Use public data-bound marks such as `Heatmap`, `Points`, `Points3D`, `Segments` and `Line` from `hmplot`. Their authored-prop wrappers live in `src/lib/plot/bound/`, and their prepared components in `src/lib/plot/marks/`; see [the mark navigation map](MARK-ORGANIZATION.md#current-mark-navigation-map-october-17-2026).

- Position arrays use `[N, 2]` or `[N, 3]`; a single position tuple is supported for scatter and segment endpoints. Scalar attributes accept a number or a matching `[N]` / `[N, 1]` array. `fill` / `color` accepts a solid CSS color or a scalar array mapped through the selected colormap. Points3D size additionally accepts three components.
- JavaScript arrays and JAX arrays are accepted. Inputs are borrowed: the caller owns its original reference. Fields retain inputs synchronously while work is queued, then release them on replacement or teardown. Dispose application-owned JAX arrays when replacing them.
- Empty position arrays render no instances. A line needs at least two vertices. Invalid shapes and mismatched attributes are reported with field names and hide the affected mark; they do not leave a partially updated mesh visible.
- Coordinates retain the existing transforms: default data bounds `[-1, 1]` map to output ranges `[-50, 50]` on each axis. Scalar color bounds default to `[0, 1]`. Set a Plot's `x={{ domain, range }}` (and `y`, `z`) when using other units.
- Levels accepts positive integers up to 2,147,483,647. Its convenience slider covers 1–100; the numeric input permits larger values. Levels controls both quantized colors and contour spacing. Invalid numeric drafts display an error and do not change the effective value; Enter or blur commits valid input, and Escape cancels an invalid/uncommitted draft before dismissing the panel.
- Context inheritance, local overrides, and `options={['opacity', 'cmapIndex', ...]}` display lists remain supported. The inspector provides reset-to-inherited controls.
- The `antialias` plot prop accepts `"msaa"` (4×, the default), `"ssaa8"`, `"ssaa16"`, `"smaa"` or `"off"`. Picking always uses a separate single-sample target so transparency cannot blend object IDs.
- Marks forward pointer and click callbacks through the picking plugin. Events retain object and instance identifiers and UV coordinates.

## New geometry

| Component | Inputs and behavior |
| --- | --- |
| `Line` | `position`, `width`, `color`; connected strokes with round joins/caps and optional `dash` (true, a length, or `[dash, gap]` in CSS pixels). Dash distance is the cumulative length on screen along the drawn path, for every camera and frame chain (TODO 73.2). Attributes may have one row per vertex (the starting vertex colors each segment) or per segment. |
| `Surface` | Either `height={[H,W]}` with optional one-dimensional `x` and `y`, or `position={[N,3]}` plus flat/nested triangle `indices`. `fill` is a CSS color or values matching the grid/vertices; omitted fill uses height. Supports `lit`, `opacity`, colormaps, and transforms. Normals are computed from transformed geometry. |
| `Arrows3D` | Matching `start` / `end`, `width`, `color`, `headLength` (default 3), `headWidth` (default 2), and `lit`. Heads use output-coordinate units; widths use the existing width transform. Coincident endpoints are collapsed in the shader and produce no visible or pickable geometry; instance indices continue to match the input arrays. |
| `Text3D` | `text`, `position`, `size` (default 3), `color`, `align` (`left`, `center`, `right`), `billboard`, and `font` (default `helvetiker`). Flat, depth-tested glyph geometry. Fonts: `helvetiker`, `helvetiker-bold`, `optimer`, `optimer-bold`, `gentilis`, `gentilis-bold`, and `droid-sans-mono`. Select **Font** under the text mark’s **Text layout** settings; inherited defaults and reset are supported. |
| `Text3D` with `tex` | TeX math as geometry, with MathJax base/AMS/newcommand input converted to SVG paths. For example, `<Text3D tex text={'\\frac{1}{x^2+1}'} />`. |

Labels share cached geometry while mounted, handle asynchronous replacement, and release it after their last consumer unmounts. Text3D uses geometry because the installed Threlte/Troika text path depends on shaders that do not fit this WebGPU renderer. MathJax conversion is loaded lazily.

Line, Segments, and Arrows3D keep WebGPU-backed JAX inputs on the GPU. Segments with control points compute Bézier subdivisions and per-link cumulative distances after coordinate transforms using JAX, with one segment per link when both controls are omitted. Arrows3D retains input rows and collapses zero-length arrows in the shader instead of reading back and compacting them. The Arrows chart template draws pixel-sized heads through Segments with `cap="arrow"`. CPU work is limited to shape metadata, static mesh templates, and upload orchestration; these paths still allocate intermediate GPU arrays and copy into rendering buffers. Surface still reads JAX inputs to CPU for mesh construction and normals.

## Validation notes

See [implementation and validation notes](IMPLEMENTATION.md) for fixed bugs, compatibility decisions, and measured checks. Browser measurements apply to the tested Chrome/WebGPU environment; no cross-browser performance claim is implied.

## Feature examples

### Interaction state as columns

`select`, `brush`, `hover`, `nearby` and `nearest` store membership on the data, and every Data scope exposes it as virtual columns: `@selected`, `@brushed`, `@hovered`, `@nearby` and `@nearest` per row, plus `@any_selected` and friends, which are 1 on every row while anything is selected. Hover only marks `@hovered`, and nearest `@nearest` (the row a tooltip shows: under the pointer, else the nearest drawn row within its radius): a mark fades its other rows for the states named by `respond` (by default select, brush and nearby, not hover or nearest; `respond="hovered"` or `"nearest"` adds them). Line and Area (including uncertainty bands) select, hover, brush and take nearest by whole series. `nearby` matches every point within a radius of the pointer, including overplotted ones:

```svelte
<Plot data={readings} axes2d>
  <Points x="t" y="value" nearby={{ axis: "x", units: "data", radius: 0.5 }}
    size={where("@nearby", 6, 2)} opacity={where("@any_nearby", where("@nearby", 1, 0.3), 1)} />
</Plot>
```

Shift-drag brushes: a rectangle in the plot interior, or a band on an axis. Inside a child `Frame`, Shift-drag on the frame's own tick strip brushes the column its marks plot on that axis; the band stays on the strip, and a column shared by several strips shows one band on each. Drag a band's edges or middle, scroll over it, or use the Arrow keys to edit it; Escape clears the band you edited last. See [Brushing](DATA.md#brushing).

```svelte
<Plot data={scores} axes2d>
  <Points x="x" y="y" brush size={where("@brushed", 4.5, 2.5)} />
  <Frame x={{ domain: [0, 100], range: [62, 96] }} y={{ domain: [0, 100], range: [8, 48] }}>
    <Points x="x" y="score" brush={{ axis: "y" }} />
  </Frame>
</Plot>
```

`drag` makes a point mark's rows draggable. A drag writes offsets on the table's rows instead of changing it, and a view follows where it reads `moved()`, so one drag moves a row in every view of the table. See [Dragging](DATA.md#dragging).

```svelte
<Data value={penguins} key="id">
  <Plot axes2d>
    <Points x={moved("bill")} y={moved("depth")} drag />
  </Plot>
</Data>
```

Run `npm run dev` and open `/examples`. Each example includes copyable markup, full component source, and data construction.

A `Legend` explains a series or one encoding. Category columns list swatches, and channels driven by the same column combine (colored symbols below). Numeric columns get a colorbar for fill and color, or a ramp of sample glyphs for size, width, and opacity. A mark drawn in every cell of a Facet is listed once, in one legend around the grid.

```svelte
<Plot data={penguins} axes2d>
  <Points bind:this={points} x="bill" y="flipper" fill="species" shape="species" size="mass" />
  <Legend for={points} channel="fill" label="Species" />
  <Legend for={points} channel="size" label="Body mass" />
</Plot>
```

See [Legends and uncertainty marks](GUIDES.md) for series guides, channel legends, shared colorbars, Area bands, and ErrorBars.

A plot's `title`, `subtitle` and `caption` are part of it and of its exports; `bands` shade a span of an axis behind the marks, and `<Callout x={48} y={1.2} text="Warmest month" dx={-30} dy={-28} />` points at a value with a note ([Titles, bands and callouts](GUIDES.md#titles-bands-and-callouts)).

Plot text uses the bundled Source Sans 3 unless a theme names a font, and `exportPDF()` (Python `export_pdf`) embeds it, as journals that check fonts require; the export report names each font and any substitution ([SVG and PDF export](DOCUMENT-EXPORT.md#fonts)).

Colors can come from data or from your own colormaps. `fill={{ r: "red", g: "green", b: "blue" }}` (or an N x 3 array) colors each row directly, with integers as 0-255 and floats as 0-1. A colormap can be a list of colors or `{colors, space, positions}` wherever a name works, including a theme's default:

```svelte
<Points x="x" y="y" fill={{ r: "red", g: "green", b: "blue" }} />
<Points x="x" y="y" fill="anomaly"
  fillScale={continuous({ domain: [-1, 1], colormap: ["#2166ac", "#f7f7f7", "#b2182b"] })} />
```

Maps: `<Plot coordinates="spherical" projection="equal-earth">` draws a world map with a curved outline and graticule (also `"natural-earth"`, `"albers"` with `parallels`, and `"albers-usa"` with Alaska and Hawaii as insets); `projectionCenter` moves the central meridian, and paths and polygons are cut at the seam opposite it (docs/SPHERICAL.md).

For data that crosses zero, `transform: "symlog"` is logarithmic away from 0 and linear near it, and `midpoint` centers a diverging colormap on a value: `fillScale={continuous({ colormap: "RdBu", midpoint: 0 })}` maps values below 0 to the red half and above to the blue half, whatever the extent on each side (docs/DATA.md, "Scale transforms"). Zeros or negatives under a log scale are missing values, not drawn.

`shape` is a channel too: a shape name for every point, a column mapped to symbols, or one name per row. `registerShape(name, vertices)` adds your own polygons (vertices in [-1, 1], or an M/L/Z path):

```svelte
<script>
  registerShape("kite", [[0, 1], [0.7, 0.2], [0, -1], [-0.7, 0.2]]);
</script>
<Points x="x" y="y" shape="kind" shapeScale={categorical({ range: ["kite", "star"] })} />
```

See [Named data and categorical plotting](DATA.md) for named columns, category scales, axes, and legends.

Expressions can reduce as well as calculate: `mean`, `sum`, `count`, `min`, `max`, `std`, `variance`, `median`, `mode`, `first`, and `last` collapse a column to one value that broadcasts over the rows, with `by=` to reduce within each category. The same reductions set transform parameters, so a bin count or a bandwidth can follow the data — `hm.stats.Bin(x="value", bins=hm.count("value") ** 0.5)`, `hm.Density(x="value", bandwidth=hm.std("value") * 0.3)` — and `Bin` also takes numpy's rule names (`"auto"`, `"sturges"`, `"fd"`, `"scott"`). Other settings take plain numbers; compute them with numpy or a `$derived`.

`Facet` repeats a child plot over categorical subsets in a grid; `Partition` repeats the same children once per group inside a single frame, sharing its scales, axes, and legend, which is how you overlay a density or a fit per category. A Facet can also repeat over variables: `fields` makes one cell per field, in which `value` is that field, and `pairs` makes a scatterplot matrix, each field keeping one domain:

```svelte
<Facet fields={["temp", "rain"]}><Line x="time" y="value" /></Facet>
<Facet pairs={["length", "width", "height"]} triangle="lower"><Points x="x" y="y" /></Facet>
```

Connectors draw between other marks: pass `connections={connect(before, after, {key: "id"})}` to a Line, Segments, Arrows3D, or Arrows and it pairs the rows of `before` and `after` that share an `id`, wherever each is drawn (nested frames and Facet cells included), and follows them as they animate. `Anchor` is a mark that holds a position and draws nothing, `rect.endpoint({at: "left"})` picks where a connection attaches, and `connect(facet.endpoint("values"), {key: "id"})` connects a mark repeated in every Facet cell across the cells, which is how parallel coordinates are drawn. Python: `hm.connect(before, after, key="id")`. See [Connections](CONNECTIONS.md).

```svelte
<Plot data={countries} axes2d>
  <Points bind:this={before} x="y2000" y="country" />
  <Anchor bind:this={after} x="y2021" y="country" />
  <Arrows connections={connect(before, after, { key: "country" })} color="region" />
</Plot>
```

Marks animate their data changes per row in scale space when `animation` is on. `animate(value, {duration, enter, exit})` picks one channel and gives rows that arrive or leave a value to move from or to; `tween(value)` interpolates anywhere inside an expression; and a channel that reads `@time` moves every frame. Freeze the clock with `setAnimationTime` for a deterministic export, or render a video with Python's `export_mp4` (ffmpeg). See [Animation](ANIMATION.md).

See [Facets, transforms, and columns](FACETS.md) for indexed data scopes, shared domains, GPU transformations, Rect, Prism, and swarms.

See [inputs, Interpolate, Slice, and force-directed graphs](INPUTS.md) for interactive data preparation and layout examples.

For network diagrams, GraphData pairs nodes and edges; Nodes and Edges select ordinary tables for transforms and marks. DAG layers acyclic graphs, Tree partition supplies icicle and sunburst bounds, and Sankey with Flow draws weighted links. Without a node table, GraphData infers the nodes from the endpoints.

```svelte
<GraphData {edges} {nodes}>
  <Nodes>
    <Calculate columns={{ x: "column", y: "lane" }}>
      <Plot><Edges><Segments start="start" end="end" /></Edges>
        <Nodes><Points position="position" /></Nodes></Plot>
    </Calculate>
  </Nodes>
</GraphData>
```

See [graph composition and hierarchy layouts](COMPOSITION.md) and the graph examples page.

GeoJSON maps and choropleths support feature data, table joins, and extruded regions on projected maps or globes. See [the GeoJSON guide](GEOJSON.md).

## Python notebooks

The `python/` package exposes the same renderer through context managers and anywidget. See [the Python interface](../python/README.md) for composition, shared tables, callbacks, live updates, and GPU PNG export. Example notebooks are in [python/examples](../python/examples). Wheels bundle the frontend and require no Node.js server.

The [statistical plots guide](STATISTICAL-PLOTS.md) covers grouped density estimation, Pivot/Fold/Sample, Violin, BoxPlot, Swarm, Bar, Lollipop, Pie and donut charts, polar Rect sectors, and atomic plot loading.
