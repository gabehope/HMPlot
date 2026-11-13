# Changelog

All notable changes to HMPlot: the JavaScript package and the Python package, which
release together under one version. The history before the first release is in
[docs/history](docs/history/CHANGELOG-before-0.1.0.md).

## 0.1.0-alpha.1 (2026-11-13)

- The first public release, an alpha: the API may still change. It installs from the GitHub
  release's wheel and npm tarball, not yet from PyPI or npm. The documentation site's user guide
  is under construction; the reference and the examples are complete. A data table's rows holding
  `[x, y]` positions no longer leak their device column on each update.

- What agents wrote that broke (2026-10-23, the second hard-task eval). Text in expressions: a
  comparison of text constants (an input's value against `literal("")`) is computed on the host,
  a `where()` over text constants is a category per row, a constant choice of text is that text,
  and a Filter whose condition is the same on every row keeps all rows or none; each crashed with
  "Invalid type for full". `fill`, `color` or `outlineColor` set to a `where()` over CSS colors
  (D3's and Vega-Lite's way to color a highlight) draws those colors, through a categorical scale
  of them with no legend entries. `continuous({ domain: [low, mid, high] })`, d3's diverging
  domain, is the ends and the midpoint. A GeoJSON's faces count their corner, height and join
  fields in the vertex buffer budget, so a choropleth with hover and respond draws (it asked for
  nine buffers of eight and drew nothing). Curved paths stop refining intervals that lie off
  screen, and a path that reaches the subdivision budget draws instead of failing the mark:
  zoomed far in, a bundled-edge chart refined every path to the budget on each step and then
  showed "subdivision count overflowed". A click or hover writing an int64 column writes a
  number. A continuous scale's `range` of CSS colors (d3's color range) is its colormap. Rows
  holding positions as `[x, y]` (deck.gl's style) make an N x 2 column. Category codes not in
  their scale's order map through the lookup (a `where()` promoted them to float32 and the lookup
  refused them). A transform inside a Plot with no table is a Python error where the scene is
  built. A Data that takes over a second to read its table warns, in `hmplot/check` too, naming
  Svelte's deep `$state` proxy (two eval pages took 14 s and over 2 minutes; `$state.raw` took
  them to 1.3 and 3.6 s). Clearer errors: a standalone page names WebGPU only when it is missing,
  a channel scale passed as a plain dict or object, an unknown axis key (it suggests
  `majorInterval`), a missing column that a string in a condition named (it suggests `literal`),
  a positions column used as a key, a transform with no table, a Button with neither `name` nor
  `set`.
- Failures agents could not see (2026-10-22, from the hard-task eval). A Treemap, Pack, Tree,
  DAG, Sankey, Nodes, Edges, GraphData, Force or Simulate error inside a Plot was an alert in
  the canvas element's fallback content, drawn by no browser and skipped by `hmplot/check`;
  each now reports to the Plot's diagnostics (`componentError.svelte`), which the Plot shows and
  `hm.check` lists, and the checker keeps any alert left inside a canvas. `input(name,
  { default })` resolves to its default while no control or writer declares the input (its
  writers can be the marks inside the layout that reads it; Python encodes the default and
  `_check_inputs` accepts it). Treemap and Pack `root` is optional: the hierarchy's own root.
  New lints: `lint.mark-empty` (a mark that drew no rows, replacing Python's warning) and
  `lint.rerun-per-pointer` (a transform that re-ran ten times within a second as a hover, brush,
  selection or the pointer changed; `work` in a plot's inspection carries the counts). A tween
  matching rows by position is a warning of the mark, not only a console line. A mark outside a
  Plot says so. Legend swatches follow each mark's declared kind (Segments and Arrows draw a
  stroke, Prism and Heatmap a square), not its material.
- Interaction state that reaches the page (TODO 145). `read()` on a transform's handle, a
  Data's (`DataHandle`) and a layout's Nodes or Edges gives the rows it holds now, on the host:
  `{ length, version, columns }`, or `{ rows: true }` for objects, `columns` and `limit` to read
  less. One read per call, after the producer settles, bounded by `limit.readback` (16 MiB).
  Python: `await node.read()` in a displayed scene returns NumPy arrays (also for a chain an
  `hm.Data` adopted into a scene); pandas' eager names point to it. Not a new keyword.
- Inputs a click or a hover writes (TODO 145.2): a mark's `select={{ input, column }}` sets the
  input to the clicked row's value and a click on nothing restores its `default`;
  `hover={{ input, column }}` shows the hovered row's value until the pointer leaves. Several
  marks may write one input, and a Select or Slider of the same name shows and edits it; writers
  that disagree on the default or the column's kind are an error naming both, and so is a hover
  writing an input a transform above that mark reads. GeoJSON features write inputs too, and a
  click on no feature reaches their `onpointermissed`. `select` and `hover` take a new kind of
  value; no keyword is added. An input with no value (null) inside an expression matches no row.
- Writes made from the input (TODO 145.7): `const root = input("root", { default: "all" })`
  reads the input and makes its writes, `select={root.set("id")}` (the clicked row's id),
  `root.set(literal("b"))` (a constant) and `root.reset()` (the default), each carrying the
  default. A Button's new `set` writes them on a press (`<Button label="Top"
  set={root.reset()} />`), and then needs no `name`. Python: `hm.input("root", default="all")`,
  `root.set("id")`, `hm.Button(label="Top", set=root.reset())`. The object form still works.
- Drillable Treemap and Pack (TODO 145.3): `root` may be any node, or `input("root")`; the
  layout divides that node's subtree and the other nodes stay rows of the table, hidden. `depth`
  counts from root; `levels` shows that many levels below it (root left out); a new `total`
  column holds each node's summed value (a node table with a column named total is an error
  naming it). A cycle in the edges now reports "requires an acyclic hierarchy".
- `TableView` (TODO 145.4): the rows of the data around it as an HTML table, live (a Group's
  groups, a Sort's top rows, a brushed Filter's rows), with `columns`, `limit`, `title`, and
  `select` and `hover` on rows as marks take them. Omitted from image exports, kept in standalone
  HTML. A public component because rows of text in the DOM cannot be composed from GPU marks
  (Html's reason); its keywords are existing names.
- `is_missing` and `is_finite` of a text or boolean constant (an input a hover writes, "OAK") give
  false and true on every row; they threw "Invalid type for full". A curved Segments or Line
  whose subdivision count overflows now says a missing or infinite endpoint causes it, instead of
  asking to zoom out.
- `Plot(interactive="brush")` (TODO 145.5): a plain drag brushes a mark with `brush`, Shift-drag
  pans and the wheel zooms; a drag inside the brush still moves it and a click outside clears it.
  `interactive={false}` brushes on a plain drag, as it already did; the default is unchanged.

- Add completed-draw `getScreenMapping()` / `subscribeScreenMapping()` handles for numeric
  2D Cartesian coordinates, and Svelte-only `Html` attachments with native HTML interaction.
  HTML is omitted from plot exports; SVG/PDF export reports disclose the omission.
  `Html` warrants a public component because DOM placement, Svelte ownership, focus and
  teardown cannot be supplied by composing existing GPU marks. It is JavaScript-only.
- Add the explicit `hmplot/check` browser entry point for serializable Svelte diagnostics,
  first-draw readiness, bounded settling, mark summaries and export omissions. Native Data
  and mark errors now reach plot diagnostics without requiring the Python scene runtime;
  a Data scope clears a prior table error when its pipeline reference becomes ready.
- Close component prop types while retaining supported runtime settings and intentionally
  open plugin/calculated-column dictionaries. Type mark callbacks, feature payloads and
  public handles; installed-consumer fixtures reject misspellings and invalid assumptions.
- Add focused Svelte authoring and HTML/accessibility guidance, a compile/inspect/interaction
  runner, and packaged Svelte references for the fifteen hard visualization tasks. Existing
  guidance is preserved separately for the documentation comparison.

- Plot, Facet and figure `data` accept live pipeline outputs as well as tables, including
  Python construction and updates. Their descendants inherit the output and its source
  interaction identity; shared transforms still execute once. The data shorthand reuses Data
  instead of maintaining a separate table-only provider. Both agent doc sets show this form.

- Swarm zoom placement waits for the gutter refit after a gesture ends, avoiding a second
  collision-layout readback for the same zoom.

- A pending transform run cannot clear a newer validation error, including conflicting clocks
  on a shared pipeline; the error clears when its settings or consumers become valid.

- Hover and selection opacity follow joined GeoJSON feature rows and filtered series rows,
  rather than applying their local drawing indices directly to the source table.

- Both agent doc sets front-load explicit expression operands, pipeline ownership, brushing and
  facet choices. Fluent examples display and export an explicit Scene containing their adopted
  pipelines, with export-boundary checks for every fluent reference and recipe.
- Label margin damping follows text footprints rather than camera-dependent fitted insets,
  preventing wide plots with EndLabels from oscillating and timing out during export.
- Updated Line and Area series fit their drawn rows, excluding missing series keys; curved
  lines calculate their bounds from each series' own neighbors.
- Consumed live-title markers cannot silently read a newer expression.
- Shared Python pipelines stop notifying scenes when they close or remove their last consumer;
  closing one scene preserves the pipeline's callbacks for its other consumers. Rejected updates
  leave pipeline subscriptions unchanged.
- Chained data pipelines in Python, with polars' names: `sales = hm.Data(df)`, then
  `sales.filter(hm.col.amount > 100)`, `.with_columns(share=...)`,
  `.group_by("region").agg(revenue=hm.col.revenue.sum())`, `.join(other, on="key")` and
  `.sort("revenue", descending=True)`, each returning the transform it adds; marks draw any step
  with `data=`. A chain built outside any `with` block is sent with the scene that draws it, and
  `data=sales` reads the same table (and brush) as the chain. Reductions are methods too
  (`hm.col.x.mean()`, `.alias("name")`). pandas' names raise errors naming the method. The
  nested blocks build the same transforms and keep working. `npm run build:llm-docs` writes the
  docs agents read twice, with nested and with chained pipelines, for the eval's
  `pipelines.toml`.
- Production builds rebuild the Python browser bundles before exporting documentation examples,
  preventing stale bundles from rejecting current properties after a pull.
- A plot whose legend strip arrives after its first layout (a bar chart colored by a category)
  lands on the same gutters on every draw; a side kept 2 to 6 px of room solved for the canvas
  before the strip, by the order its data and legend arrived. Recipes 37-38: a layered DAG
  drawn with Routes and a Sankey drawn with Flow.
- Interaction performance (TODO 143): a domain read from brush bounds (`min("@brush_min:x")`)
  reads them on the host, with no GPU readback per brush step; axis layouts and option
  snapshots are reused while nothing they read changes; the marks of one change (a Line and
  its labels over a new Calculate) publish one domain instead of one each. A division of
  integers (`row()`, codes) divides as floats, and `floor`/`round` of an integer is itself (was
  an error). EndLabels spread overlapping labels apart.
- `keyframes({ms: value, ...}, {easing, loop, time})` (Python `hm.keyframes`): a value moving
  through its stops as the view clock runs, built from existing expressions; `time` shifts it
  per row (a staggered reveal). A per-row opacity reading the clock now updates every frame.
- `Panels` stacks Plots over one shared x (one union domain, panned and zoomed together, the
  axis drawn once under the stack, the plot areas lined up), the evals' stacked-panel charts
  (134.31). `hm.charts.FocusContext` draws a line chart over a strip of the whole series; a
  drag across the strip zooms the chart to that x interval. A Plot that does not pan or zoom
  (`interactive=false`) brushes with a plain drag. `hm.charts.EndLabels` labels each series at
  its last (or first) point without widening the axis. A Title inside a Data is a readout: its
  text holds live reductions (`hm.Title(f"Selected: {hm.count(where='@brushed'):,}")`).
  Recipes 34-36.
- Text draws numbers with no category workaround: `text="count"` under a Group, a Calculate's
  value or any numeric column (computed on the GPU or not) is written as tooltips write numbers
  (four significant digits, whole numbers exact, thousands grouped from 10,000), live; a GPU
  value is read back when it changes, before the labels and their room in the domain publish.
  `format` takes a d3-format string (`",.0f"`, `".1%"`) or a %-pattern for a datetime column
  besides `"axis"`: no new keyword. Host numbers changed from `String(value)` (Float32 noise
  such as 12.300000190734863) to the same writing; missing values draw no label.
  Migration: drop `as_category(..., domain=...)` and per-digit Text from numeric labels.
- `Group` without `by` writes one row of totals over the visible rows, shown with a `count` of
  0 when none is (a live total no longer needs a constant key column).
- A transform's output is a data source by reference: `<Data value={handle}>` in Svelte
  (`bind:this` on a Filter, Group, ...), `hm.Data(value=node)` or a mark's `data=node` in
  Python. One pipeline computed once feeds plots anywhere in the scene, each mark keeping its
  visual parent; removing one reader leaves the others; a reference is fixed, a pipeline never
  reads its own output, and a view-dependent pipeline takes its readers' clock (ambiguous clocks
  are reported). The reason for the extension: an existing keyword (`value`, `data`) takes a new
  kind of value instead of a new component, so shared pipelines need no duplicated transforms.
  Transform runs moved into a component-independent runner (`transformRunner.js`).
- `Join(data=...)` takes a transform's live output too: route geometry gets the live counts of
  a Group of the brushed flights, in the browser and in exported pages, without a round trip.
  Left/inner, many-to-one as before (a repeated key is an error); new keys replan the match,
  new values only regather. Recipe 33 shows it.

- A selection resource is an expression operand: `hm.where(focus, 1, 0.15)`,
  `focus & (hm.col.value > 10)` and `~focus` in Python, `where(focus, 1, 0.15)` and
  `logical_not(focus)` in JavaScript, each row's membership at the live phase. The reason for
  the extension: Filter already took a resource directly, and expressions needed an Interaction
  alias to read the same value.
- `selection(by="gene")` (`selection({by: "gene"})`) selects values: rows picked in one table
  select their values of the column, and every row with one of them is a member, in any table
  with the column; missing values match nothing. The new keyword's reason: group-linked and
  cross-table interactions without propagation transforms or misusing a table key as identity.
- One membership for every reader of a selection (`respond`, `Filter(where=resource)`, an
  Interaction's columns, expressions): nested and filtered intermediate aggregates now agree,
  an aggregate's contributors are composed back to the original rows (they were the
  intermediate group indices), an aggregate reads `"@selected"` in expressions and Filters
  (it reported a missing field), a resource read below a Group's BarGeometry has that view's
  length, and an Interaction placed below a Filter reads its columns over the filtered rows.
- A 2D orthographic globe draws its graticule and reference rules on the GPU, projected through
  the live center like its marks, instead of sampling SVG paths on every rotation and zoom:
  navigation no longer rebuilds guides (it doubled frame times), the graticule lies under the
  marks as a Cartesian grid does and reference rules over them, and vector export samples the
  same lines at its resolution. Labels and the sphere's outline stay in the overlay.

- Nullable Python dates and durations use explicit microsecond units for missing values,
  avoiding NumPy deprecations in timeline examples and warning-strict applications.

- Stationary Z-up cameras use the same stable matrix identity for picking and curve
  refinement as for guides, so 3D hover and PNG exports complete despite idle orbit roundoff.
- GeoJSON retains its feature identity across failed preparations, so invalid RGB data
  reports its validation error and correcting it draws normally.

- Add four supplied-value templates in `hm.charts` / `hmplot/charts`: ForestPlot (Points,
  horizontal ErrorBars and optional RuleX), BulletChart (actual, target tick and supplied
  qualitative range columns), IntervalTimeline (task intervals and optional milestones), and
  Sparkline (Line, optional BandY and final finite-row label). Named part objects style their
  existing marks, and the main parts provide the usual mark handles/settings. These are
  compositions, with paired examples, references and agent recipes; no renderer, numerical
  plugin or statistical/scheduling algorithm is added. The four kinds and seven named concepts
  are the user-authorized public-surface exception; the largest signature does not grow.

- Automatic category-color swatches now retain point glyphs; filled regions keep square
  swatches and explicit guide-shape overrides still win. Neutral captions retain readable
  contrast after their rendered opacity is applied.

- `marks/` partial themes compose point, line, interval, area and Bar-opacity defaults through
  the existing marks section in JavaScript and Python. Explicit mark props still win. Open
  flat points retain transparent interiors; solid 3D counterparts use the palette unless
  explicitly styled rather than inheriting an invisible transparent fill.

- Existing neutral themes now differ in title hierarchy, spacing, guides and mark treatment.
  Presentation enlarges ticks, legends, controls and marks; Notebook stays compact, Journal uses open points and Ink outlined points, and Minimal is airy. HMPlot's default preset is unchanged.
  Add composable title hierarchy, quiet/print axes and compact/generous legend partials.

- `hm.check` inspects Marginals as a composite figure, reporting all three views' marks,
  diagnostics and a PNG instead of returning an empty successful result.

- Axis margin fitting resets when annotation label insets change, so callout layout does not
  retain a transient gutter from before the annotation reserved its space.
- Add executable Marginals and ordered gene heatmap recipes, and embed Manhattan flyover
  initial-view tiles for reproducible offline startup while retaining live navigation. Embedded
  bytes are seeded before the planet background starts, avoiding a redundant live request.

- Plain Heatmap matrices retain cell-index placement on categorical axes, so named rows
  and columns match the rendered values in either axis direction.

- Plot.dynamicMargins (Python dynamic_margins) can hold the initially fitted margins during
  pan and zoom. Resize and axis-content changes still refit; alignment peers still share space.

- Named brush columns now follow live preview membership, and brush overlays track the
  selections used by their marks. Crossfilter histograms retain matching rows and visible
  brush bands after release, including when selections are changed or cleared in code.

- Marginals fills its grid cells in wide figures and image exports, keeping the right
  histogram beside the scatter instead of leaving a gap from the ordinary Plot width cap.

- Tree layout updates no longer deadlock when another update arrives during an atomic
  publication, including sunburst/tree interactions stepped with a frozen animation clock.

- Flyover momentum stops before applying a frame that arrives after its wall-time deadline,
  avoiding an extra camera movement after a long rendering pause.

- Plain Group keys preserve source-column identity for linked brushes. Repeated locations can
  draw one point per group while selecting all contributing events; renamed keys work too.

- GeoJSON accepts the existing mark `tooltip`, `hover`, `respond` and `selectionOpacity`
  controls. Feature tooltips honor Plot defaults; multipart features share hover and opacity,
  and joined/geometry-column features coordinate with their source table's rows.

- Notebook widgets and exported HTML embed shared input styles in their JavaScript bundle.
  Playback and the other controls retain their themed font, accent, spacing and button styling
  without relying on a separately loaded CSS file.

- BandX and BandY are chart templates for shaded reference intervals that span the visible
  frame during pan and zoom (Plotly vrect/hrect patterns), using existing Rect machinery.

- Tile network failures name the requested URL and explain offline embedding. Map export
  guidance distinguishes live navigation from snapshotting the initial offline view.

- Size, width and opacity legends reserve space for their formatted labels. Cartesian reference
  rules draw above marks with the theme's axis-text contrast; grids and bands stay underneath.

- Data, Plot and Frame accept scoped `animationGroup` (`animation_group` in Python) to
  match animated rows across filtered snapshots independently of selection and Data keys.
  Child scopes inherit or override the group; null restores key/position matching. Duplicate
  groups are checked on tweened snapshots, and changing the scheme resets motion history.

- `Plot(type="3d")` now defaults to Z-up. Use `type="3d-y-up"` for the previous
  Y-up orientation; `cameraUp`/`camera_up` overrides either preset. Both presets are
  available in the settings pane and share the same 3D marks, effects and export path.

- Z-up 3D scenes now settle for PDF/HTML export: projected axis guides ignore
  machine-precision camera drift instead of continually requesting another frame.

- Structured plug-in field parameters now align with filtered and reordered input rows without
  mutating authored objects. Nested unions preserve field and expression dependency tracking.

- Grouped plug-in field reads now use each group's rows consistently; unsupported per-group
  masks are rejected and released. Nested array schemas reject null/missing items in both APIs.

- Density runs as a bundled numerical plug-in, preserving Gaussian estimates, grouped
  grids, Violin layouts and expression-driven bandwidth/resolution. Plug-in grids retain
  explicitly published coordinates and release lazy categorical coordinates correctly.

- Contour runs as a bundled plug-in through the shared numerical contract. Its public
  component and line/band geometry remain unchanged; oversized geometry is rejected before
  allocating output rows. Transform settlement errors retain the component name.

- Plug-in output metadata can inherit a source column title, and independent aggregate
  outputs can describe inspection fields without claiming source-row contributors.

- Slice and Interpolate now use the common transform runner for result publication,
  cancellation and disposal, preserving their grid metadata and cached geometry.

- `Transform(kind=..., params=...)` runs registered computations and graph layouts;
  Python also accepts schema parameters as keywords. TODO 138.7 authorizes this one
  generic component and its `kind` selector so plug-ins need no new public components.
  Expression defaults participate in input resolution and dependency tracking; grid/row-only
  defaults apply only to their active branch, and explicit inactive parameters are rejected.
  Layout expressions use the shared scalar resolver over input edges, including defaults,
  and rerun when their input, interaction, clock or pointer dependencies change.
  Parameter schemas compose unions, arrays and objects, with recursive expression resolution
  and settings editors; field parameters also accept arrays aligned to the input rows.
  Registered transforms and layouts expose schema-driven parameter editors in the settings
  pane; viewer edits reach Python and survive re-exported HTML.
  Transform/layout kind collisions and schema parameters that shadow host controls are
  rejected atomically during registration. New-row plug-ins can retain source-row identity
  or declare aggregate contributors through validated provenance buffers. Geometry plug-ins
  can read aligned host columns, upload shaped arrays, and publish validated triangle rows;
  numerical vector schemas accept nested shapes for parameters such as Voronoi bounds.
  Regression now runs as a bundled numerical plug-in; its `fit()` summary stays lazy, using
  owned auxiliary buffers without adding a readback to ordinary fitting.
  Transforms can wrap a Plot, retain input-driven parameters in exported HTML, and forward
  their preparation status. The large-graph example generates up to 100,000 nodes through
  the bundled `community-graph` plug-in and can regenerate edges without Python callbacks.
  Delaunay, Voronoi and Hull now use bundled plug-ins through the same public computation
  contract, retaining their component APIs, geometry and source-row identities. Named
  numerical wrappers, props and reference metadata are generated from their plug-in manifests.

- Lollipop's `stemColor`/`stemWidth` (`stem_color`/`stem_width` in Python) are
  removed: pass `stem={{ color: "gray", width: 2 }}` in Svelte, or
  `stem={"color": "gray", "width": 2}` in Python. The named part keeps the same
  defaults and theme styling, with all Segments props available in one object.

- `Segments(cap="arrow", headLength=10, headWidth=8)` draws a pixel-sized arrow
  end (TODO 137.6/130.1). Reusing Arrows' head-size keywords on the segment primitive
  makes the Arrows chart a template instead of a separate mark lifecycle. Arrows
  keeps its pixel-valued widths, including width columns. Its unused
  `lit` option is removed; use Arrows3D for lit solid arrows.

- Plot settlement waits for axis overlays queued by font and margin refits, so
  exported tick positions match the completed plot frame.

- `Area(lower=..., upper=...)` replaces Ribbon and the old Area `y`/`baseline`
  value props (TODO 137.6). `lower` defaults to zero; `orientation="horizontal"`
  uses `y` for positions and bounds on x. Both edges may cross. Area brushes along
  its position axis; use explicit opacity for translucent bands and `marks.Area`
  for theme overrides. Smooth and Violin compose the same Area implementation.

- `Plot(lights=[...])` replaces the four Python light components (TODO 137.6).
  Use `hm.light("ambient" | "directional" | "hemisphere" | "point", ...)`; JavaScript
  uses `light(kind, {...})` or plain specs. Lights support input-driven updates,
  settings-pane controls and exports. This planned `lights` prop and `light` helper replace
  four node kinds and their renderer dispatch branches.

- Combined brush constraints retain integer masks, avoiding downstream shader variants
  when a brush changes from one axis to two.

- Growing curved-path metadata buffers updates their storage bindings without recompiling
  unchanged shaders, keeping force-layout updates smooth after warm-up.

- VectorTile settlement includes pending place labels, so exports capture the labels of the
  loaded tiles instead of the previous debounced label set.

- Automatic axis margins recompute after data changes without retaining widths from the last
  second. Returning to a streamgraph offset restores its original layout; navigation still
  keeps room for labels after zooming.

- Histogram templates preserve named bin rules such as `"sturges"` in props and settings.
  An unfinished numeric-list edit keeps its previous value without discarding valid rule names.

- `GeoJSON(fill=null)` (Python `hm.GeoJSON(fill=None)`) replaces `GeoJSONLine` (TODO 137.6).
  `color` and `width` style LineStrings and polygon boundaries without triangulating faces.
  Feature joins, color scales, picking and boundary exports use the same GeoJSON component.

- `Data(rows=N)` replaces `ConstantData` in both APIs (TODO 137.6). Use `row()` / `hm.row()`
  for zero-based visible positions, numeric constants for zeros/ones, and seeded `random()`
  expressions in `Calculate(columns=...)`. Calculate before filtering to retain source-row
  values. Row counts allocate no placeholder columns; pass a table or `rows`, not both.

- Pixel-offset channels are now `dx` and `dy` in both languages, replacing JavaScript
  `offsetX`/`offsetY` and Python `offset_x`/`offset_y`. Data-unit `xOffset`/`yOffset`
  (`x_offset`/`y_offset` in Python) and drag-state `@offset_x`/`@offset_y` are unchanged.

- Notebook plots settle without a reactive update loop when no legend position is specified.
  Clearing an absent option override no longer notifies dependent plots.

- Python `Controls` is replaced by `hm.Row(wrap=True, min_width=0)` (TODO 137.6).
  Inputs in a Row keep their natural widths; plot children still share the available width.
  Both use the surrounding input context. The removed name explains the migration.

- `Slider(value=[lower, upper])` replaces `RangeSlider` in both languages (TODO 137.6).
  Interval sliders share scalar sliders' data-derived bounds, formatting and calendar steps.
  Omit `value` for a scalar slider starting at `min`; pass both endpoints for an interval.

- Shared continuous scales now update every mark's domain after other marks contribute.
  An inferred preview no longer overrides subsequent scale updates as an authored option.

- `Select(multiple=true)` replaces `MultiSelect` (Python: `hm.Select(multiple=True)`).
  Multiple selections keep their list values, labels and data-derived options. The new
  `multiple` keyword removes a duplicate public component and implementation (TODO 137.6).
  Python's removed name explains the replacement.

- `stats.Normalize` and `stats.Window` are declarative templates over Calculate. They keep
  their props, settings, input controls, status and updates while sharing expression kernels.

- Statistical patterns Bin, Hexbin, Normalize, Window and Summary live in `hmplot/stats`
  and `hm.stats` (TODO 137.1c). Use `hm.stats.Bin(...)` instead of `hm.Bin(...)`, or
  `import { Bin } from "hmplot/stats"` in Svelte. Old Python root names explain the move.

- Chart patterns live in `hmplot/charts` in Svelte and `hm.charts` in Python (TODO 137.1b).
  Move imports such as `import { Bar } from "hmplot"` to `"hmplot/charts"`, and calls such as
  `hm.Bar(...)` to `hm.charts.Bar(...)`. Python's old names raise an error naming the new path.
  This applies to Bar, Histogram, BoxPlot, Violin, Swarm, Pie, Lollipop, Smooth, Ecdf,
  DensityContour, DensityBands, RuleX, RuleY, Callout, Crosshair, ErrorBars and Arrows.

- A page restyles a plot's title block and legends with CSS custom properties, over the theme
  (TODO 132.7): `--hm-title-font`, `--hm-title-color`, `--hm-title-align`, `--hm-title-spacing`,
  `--hm-title-font-size`, `--hm-title-font-weight`, `--hm-subtitle-font-size`,
  `--hm-caption-font-size`, and `--hm-legend-font`, `--hm-legend-color`, `--hm-legend-font-size`,
  `--hm-legend-title-font-size` and `--hm-legend-title-font-weight`, set on any element around
  the plot. Layout and PNG/SVG/PDF exports from the page follow them.

- Compound marks are no longer a separate concept (TODO 130.5): every one is a template, and
  each built-in template declares its options in its definition, from which the options table,
  TypeScript props and Python signatures are generated. Names, props and behavior are unchanged.
  docs/USAGE.md's "Writing a compound mark" is now "Writing a pattern", covering the four ways
  to write one (a built-in template, a chart, a Python template, a Svelte component over
  `composition`). The reference sidebar lists the built-in templates after the primitive marks.

- `Marginals` (`hm.charts.Marginals`, TODO 136.16): a scatter of `x` against `y` with a histogram of
  each column along its top and right sides, as seaborn's jointplot draws it. Its three Plots line
  up their plot areas, each histogram shares the scatter's domain on its axis and follows it as
  the scatter pans and zooms, and `bins` sets both histograms. Its other keywords go to the
  scatter's Points (`fill`, `size`, `tooltip`, `brush`, ...), its children are drawn in the
  scatter's Plot, and `data`, `key` and `schema` work as on a Plot. It sits where a Plot does
  (Python raises when it is put inside a Plot, or a Plot or layout inside it); its PNG, SVG and
  PDF exports compose its three views, and `marginals.view("top" | "main" | "right")` is a view's
  Plot handle. Its `viewport`, `onviewportchange` (Python: `on_event("viewportchange")`),
  `getViewport`, `setViewport` and `fit` are its scatter's. A built-in template's definition can now hold Plots: `slot()` places the caller's
  children and `links` names Plots that share a domain and pan and zoom together.

- Candlestick, a chart of the chart library (TODO 130.4): prices as candles, a wick from each
  period's low to its high and a body from its open to its close,
  `hm.charts.Candlestick(x="day", open="open", high="high", low="low", close="close")` and the same
  props in Svelte. Bodies are filled by direction, so a Legend names "Rising" and "Falling"
  (`fillScale` picks their colors); `wick={...}` sets the wicks' props (a Segments), and
  `bandFraction` the bodies' width (in the axis's units on a numeric or date axis: milliseconds
  for dates). The wicks, like a Dumbbell's stems, follow the chart's axes, opacity, selection and
  animation.

- Themes have an `animation` section (TODO 132.7): `duration` and `easing` are the Plots'
  `animationDuration` and `animationEasing`, and `enter` and `exit` the marks' `enterEffect` and
  `exitEffect`, where those are not set; it does not turn animation on. New partial themes set
  it: `animation/fast` (150 ms), `animation/slow` (600 ms), `animation/linear` and
  `animation/fade` (keyed rows fade in and out). The JSON schema and Python's `load_theme` check
  the section.

- Waterfall, a chart of the chart library (TODO 130.4): a running total built from changes,
  `<Waterfall x="step" y="change" />` and `hm.charts.Waterfall(x="step", y="change")`. Each bar spans
  the total before its step to the total after it, in row order, filled by the change's direction
  so a Legend names "Increase" and "Decrease" (`fillScale` picks their colors). The steps may
  be categories, numbers or dates; a zero or missing change draws no bar, and `bandFraction` sets
  the bars' width.

- Dumbbell, the first chart of the chart library (TODO 130.4): two values per category as points
  joined by a stem, `<Dumbbell y="city" x0="y2015" x1="y2025" />` and
  `hm.charts.Dumbbell(y="city", x0="y2015", x1="y2025")`. The points take a color per column, so a
  Legend names the two columns (`fillScale` picks their colors); `stem={...}` sets the stems'
  props (a Segments), which follow the chart's opacity, selection and animation. Leaving out `y`,
  `x0` or `x1` is an error naming it. A chart is one
  file in `src/lib/charts/` (`defineChart`), from which the generator writes its options entry,
  TypeScript props, Svelte component, Python signature and reference page; docs/USAGE.md,
  "Writing a chart".

- Themes compose (TODO 132.7, first part): a theme's `extends` can be a list, merged left to
  right with the theme's own keys last, and the library ships partial themes that each set one
  section, named `axes/minimal`, `axes/grid`, `axes/frame`, `legend/inline-top`,
  `legend/inline-bottom`, `legend/stacked-right`, `title/left`, `title/centered`,
  `controls/compact`, `controls/large`, `numbers/currency`, `numbers/percent` and `numbers/si`:
  `extends=["paper", "axes/minimal", "legend/inline-top"]`. A partial lends its section, not its
  name. A theme whose name starts with a group (`"axes/"`, `"legend/"`, ...) is a partial: it
  lends only its section (in `extends` or as a nested `Theme`), takes only that section from its
  own `extends`, and warns when it sets keys outside it. The JSON schema and Python's `load_theme` accept
  the list.

- Bar infers orientation from string and boolean literal categories as it does from categorical
  columns, and preserves the literal category in its geometry.
- Aggregate picks keep their source contributors through row-preserving transforms such as
  BarGeometry and Calculate, so selecting a region bar filters all its underlying sales.
- Plain clicks on selectable marks now clear the owner's selection when the picked source-row
  set exactly equals its current membership, including aggregate and series picks. Other plain
  clicks still replace membership, including a subset of a multi-selection. Shift/Meta/Ctrl
  clicks still toggle individual membership; background clicks still clear. No new option is
  required. Linked aggregate drilldowns can restore all rows with a second plain click.

- An exported HTML page has a modest layout of its own (TODO 132.6): a 24 px margin (12 px on a
  narrow screen) and its content centered at most 960 px wide, with plots filling that width and
  the page's snapshot drawn at it (it was a 16 px margin, edge to edge). `export_html`'s new
  `page` option sets it: `page={"max_width": 1200, "margin": 16}` (`max_width=None` for none),
  or `page=False` for a bare page; JavaScript's `exportHTML` takes `page: { maxWidth, margin }`.
  A Plot with a fixed width wider than the maximum widens the page to it.
  Other exports and a notebook's display are unchanged.

- Inputs have a themed look instead of the browser's (TODO 132.3): Sliders, Selects, Buttons,
  Checkboxes, Playbacks and the other inputs take the theme's font and a new `controls` section:
  `controls.accentColor` (a slider's handle and fill, a checked box, the focus ring; default the
  palette's first color) and `controls.fontSize` (default the text size; heights and spacing
  scale with it). Each shows its label before the control, and a Slider's, RangeSlider's or
  Playback's value beside it reads to its step's decimals, else as tooltips do (`12,346`; was
  `12350`); the theme's `numbers.format` stays with data values. A page
  restyles them with `--hm-controls-accent`, `--hm-controls-font`, `--hm-controls-font-size`,
  `--hm-controls-color` and `--hm-controls-background`, and the classes `hm-input`, `hm-slider`
  (one per kind), `hm-input-label` and `hm-input-value`. Their text color is now the page's.
  JSON schema and Python validation check the new section.
  `{$name}` placeholder text writes numbers the same readable way: thousands grouped from 10,000
  and a true minus sign (U+2212), as ticks and tooltips do; a RangeSlider's reads `4 – 7` as the
  control does (was `4, 7`).

- Annotations look like one set (TODO 134.29). A Callout's text has no box by default
  (`box=True` brings it back) but a halo of the plot's background, and its leader is 1.5 px in
  the text's color, stopping 3 px short of the point (a Text's `leader=True` too). Callout takes
  the theme's text size and color, as Text does (14 in the default theme; it was 12), and so do
  the labels of a Plot's `rules` and `bands`, which used the axes' size (so the settings pane's
  axis font size no longer changes them under a theme). A rule's label sits 5 px
  beside a vertical rule and above a horizontal one with its descenders clear of the line, where
  it used to touch it.

- Numbers in tooltips read as ticks do (TODO 132.4): four significant digits, a whole number
  kept whole and thousands grouped from 10,000 (`12,345`, not `1.235e+4`); dates are unchanged.
  A theme's new `numbers` section sets the number format of linear axes' ticks, legends and tooltips:
  `numbers.format` is a d3-format string, as an axis's `format` (`",.2f"`, `".1%"`, currency
  as `"$,.0f"`). An axis's `format`, a mark's `legendTickFormat` and a tooltip field's `format`
  win over it; dates, durations, log axes and angles (polar, globe) keep theirs. JSON schema and Python validation check it.

- Deep zooms near large values label their ticks compactly, as Matplotlib does: ticks that share
  four or more leading digits show the digits that change (0.08, 0.09, 0.1) beside an offset
  (+932,000) above a y axis or at the end of an x axis, where each used to round to the same
  "932,000". An axis's `format` or a theme's `numbers.format` keeps its labels.

- A theme can take its page's font and text color (TODO 132.5): `"inherit"` as
  `typography.fontFamily` or `typography.color` uses the font or color of the element the plot
  sits in (a page's column; in a notebook, the notebook's font), for axes, legends, titles and
  Text marks, over a preset's. Exported files and pages give it a system sans-serif.

- Sunbursts and ringed pies (TODO 134.28): with `by`, a ring's sectors start and end where the
  inner sectors whose values they sum do; each sector's `pad_angle` now comes out of its own
  share (a sector loses at most half its width to it, so a very small one gets a narrower gap),
  where the outer ring's extra pads used to push its sectors past their parents. A `sort` sorts
  each ring on its own and breaks the alignment. A polar Rect's arcs (every Pie) take their segment count from the radius they
  are drawn at in device pixels, so ring edges are round instead of visibly polygonal. A Pie's
  `sector_label` that would overlap a larger sector's is hidden, judged at the pie's drawn size.

- A plot without a width fills its notebook cell or exported page (TODO 132.5); it used to stop
  at 800px and leave the rest of a wide cell or page empty. `hm.export_png`, `export_svg` and
  `export_pdf`, which have no page to fill, still draw it 800px wide (a view's own export draws it
  as shown), and a Svelte `<Plot>` on its own page keeps its
  800px default; `<SceneRenderer fill={false}>` keeps it in a scene.

- Zooming and panning no longer make a Plot's area jump. A side's margin only grows while you
  navigate, when labels no longer fit, and keeps that room afterwards; it shrinks back only when
  the plot's size, fonts, axis settings or data change. Side axes also leave one digit of room
  past their labels, so a zoom that lengthens them by a character fits without a change.

- A 2D orthographic globe reads as a globe by default (TODO 135.5): without `axes2d` it draws the
  sphere's outline and a graticule, a line every 15° without labels (an axis's `step` or
  `tick_count` draws labeled lines of its own), as Vega-Lite and Observable Plot do;
  `axes2d=False` turns them off. It fills the plot: the disk no longer adds the default z domain's 1 to its radius when no mark
  maps z (it drew at half size). No Cartesian grid is drawn behind it, meridians are labeled
  where they cross the center's latitude (they all stacked at the pole; seen from within 30° of
  a pole, at their outer ends), parallels left of the limb, and a label that would overlap
  another shown one is hidden unless the axis's `label_overlap` is "show". There is no bundled land layer: draw
  one from GeoJSON or a VectorTile source.

- Themes style legends (TODO 132.2): `theme.guides` takes `position` (where a Plot's own legend
  sits: `"bottom"`, the default, `"top"`, `"left"` or `"right"`), `layout` (`"auto"`, `"inline"` or
  `"stacked"` entries), `swatchSize` and `swatchShape` (`"auto"`, `"circle"` or `"square"`), and
  `titleFontSize` and `titleFontWeight` for the legend's title. Unset, legends look as before; a
  Plot's `legend={{ position }}` still wins over the theme.

- A Plot's axis gutters no longer depend on what it showed before. A side whose labels became
  4 px or less narrower (a new domain, data arriving) kept its old width, so the same plot could
  lay out a few pixels differently depending on its history. The rule that holds a side's width
  now applies only while the plot fits itself to its own gutters, which it is there for.

- A Plot shows a legend by default for a color mapped from a category column (TODO 136.17): a
  mark whose `fill`, `color` or `outline_color` reads a category column gets its swatches at the
  bottom without `legend=True`, as ggplot, Vega-Lite and Observable Plot do. Nothing else shows by
  default (a continuous colorbar and the labeled marks still need `legend=True` or a `Legend`).
  `legend=False` turns it off. A Facet without `legend` shows its cells' default legend once
  around the grid (`legend=False` on the Facet hides it). A color that repeats the mark's x or y
  column (`Bar(x="c", fill="c")`) is read off the axis and gets none unless `legend=True`. The
  Plot's automatic legend no longer repeats a channel an explicit
  `Legend` explains (TODO 134.9): `legend=True` with `Legend(channel="fill")` drew the fill twice.

- `display_scale` is gone from the marks, the Plot, Mapping and themes (TODO 137.5): a mark's
  pixel sizes (`size`, `width`, `outline_width`, dash, cap and head sizes, offsets) are its size
  on screen. Migration: multiply those by the old factor. Passing it is an error naming them. The
  Minimap's `display_scale` and the Plot's `overview_scale`, which size the marks in an
  overview, stay.

- A twin axis (a Frame with its own y, or x, on a side of the Plot) fits its labels and title like
  the Plot's own axes: axes stacked on one side sit past each other's labels, however wide. They
  were 48 px apart (36 px for x), and the side's margin was pinned to that, so long labels
  overlapped the next axis or ran off the plot. A margin the Plot sets (`axisMarginRight=`) now
  holds with twin axes too; they overwrote it.

- Denser ticks and rounded ends on 2D axes (TODO 136.17): a Cartesian linear numeric axis asks
  for about one tick per 80 px along x and per 45 px along y (it was one per 90 px, two or three
  per axis), and its automatic domain, after `padding`, rounds out to tick values, so the data
  has headroom and both ends carry labeled ticks. The rounding does not depend on the plot's
  size, so linked plots, facet cells and exports at other sizes show the same range. An explicit domain, `tickCount` or `step`
  still decides; a bar's 0 baseline, a Heatmap's or Image's bounds and a ranged or placed Frame's fit stay; an end whose padding
  already reaches past a tick (data from 0) keeps it; `padding: 0` keeps the data's ends.
  Datetime, log, polar, geo and 3D axes are unchanged.

- Marks list only the keywords that change what they draw (TODO 137.5). `series`, `start`/`end`,
  `sampling`, `max_instances`, `interpolation`, `rotation`, `shape`/`shape_scale`, `size_units`
  and `texture_resolution` are no longer shared by every mark; each mark lists those it reads.
  Removed, as they had no effect: `interpolation` on Area, Ribbon, ErrorBars, Rect, Prism,
  GeoJSON, GeoJSONLine, Histogram, Violin, BoxPlot, Swarm, Bar, Lollipop, Callout, Smooth, Ecdf,
  Polygon and Pie; `series` and `start`/`end` on Violin, BoxPlot, Swarm, Bar, Lollipop, Smooth,
  Ecdf and DensityContour; `rotation` on Violin, Callout, Smooth, Ecdf, DensityContour and Text;
  `shape` on Heatmap, Image, Histogram, Violin, BoxPlot, Callout, Smooth, Ecdf, DensityContour
  and Text; `size_units` on Violin and BoxPlot; and `max_instances` on Heatmap, Surface, Text3D,
  Image, GeoJSON, GeoJSONLine and Polygon. Migration: delete the keyword; Python raises an
  unknown-property error for it.

- In a notebook, an update the view refuses no longer blocks the ones after it: its error
  stays on the view (`SceneRuntime.rejected`, apart from `error`) until an update applies, and
  the restored scene still settles and answers the kernel's commands.

- BoxPlot is a template (TODO 130.3): BoxStats with a Rect box, a Segments with bar caps for
  the whiskers and another for the medians, and BoxOutliers with Points, drawn as before. The
  whiskers still take the theme's ErrorBars entry beneath the BoxPlot one. As a connection
  endpoint a BoxPlot also offers its box's `left`, `right`, `bottom` and `top`, as a Bar does,
  besides `center`, `q1`, `q3` and `median`. The whiskers, medians and outliers follow the box
  in the legend and the settings pane, which list only the box (the whiskers had their own
  "Error bars" entry); a pane edit to the box's visibility now reaches Python, its fill and
  outline stay the box's. BoxStats adds `__whiskerStart` and `__whiskerEnd` columns, each
  whisker's two ends (missing where the whisker is reversed, which is not drawn).

- Violin is a template (TODO 130.3): a Density by category, a Ribbon and an Anchor, drawn,
  exported and described as before, with the same props, theme entry and errors.

- Pie is a template (TODO 130.3): PieGeometry, a Rect for the sectors and a Text for their
  labels, drawn as before. Its connection attachments add the sector box's own (left, right,
  bottom, top) beside center, outer and inner; outer and inner are the box's top and bottom, as
  they were. The labels follow the sectors in the legend and the settings pane, which list only
  the sectors, and reappear with them; a pane or legend edit to the sectors now reaches Python.

- Lollipop is a template (TODO 130.3): a BarGeometry, a Segments stem and Points heads, drawn
  as before (with a baseline column the left gutter can settle a few pixels wider). Its new
  `stem` prop takes the stems' own props as one object (`stem={{ color: "gray", dash: [2, 2]
}}`, `stem={"color": "gray"}` in Python), over `stemColor` and `stemWidth`. Its stems run
  from the baseline to the value, so a vector export writes each from its base end, and no
  longer writes an empty cap path at each end. A tooltip `content` callback reads the heads'
  positions as `__barTipX`/`__barTipY`, as a Bar's are; a missing x or y is now Lollipop's
  error; a datetime value column keeps its dates (a Bar's too, unless stacked).

- ErrorBars is a template (TODO 130.3): one Segments with bar caps, drawn as before. A row
  whose upper is below its lower, or with a missing bound, is still not drawn and no longer
  widens the value axis; neither does the y column. The tooltip lists x, lower and upper, and
  a Segments with composed ends (`start={["x0", "y0"]}`) now lists their columns too.
  Datetime and category bounds map onto their axis, and a missing column is reported as
  Segments' ("Segments: Expression references missing field ..."). Arrays given inside a
  data scope count their own rows. Segments take `capSize` from a Mapping or theme. Segments
  in a polar frame or on a map now export as vectors, as drawn, and curved Segments' caps
  export across the local tangent.

- Crosshair is a template (TODO 130.3), drawn as before in Cartesian frames. Its new
  `readoutPosition` ("edges", the default, or "pointer") sets where the readouts sit: a polar
  frame or a map now needs `readoutPosition="pointer"` for the one label beside the pointer,
  which the Crosshair chose by itself before (the template does not detect the frame). Its
  `dash` is Segments' own, as RuleX's is. Text `format="axis"` takes `text="@pointer"`, both of
  the pointer's values as "x, y". The composition surface loses `Rule`: rules are Segments with
  frame-edge ends (RuleX, RuleY and Crosshair are templates of it).

- DensityBands is new (TODO 130.3): the filled bands of a 2-D density, each filled by its lower
  level, which DensityContour's `mode="bands"` drew. DensityContour draws contour lines only;
  its `mode` is deprecated (any value or input: a warning in the browser console, and a
  FutureWarning in Python, naming DensityBands) and will be removed, and `mode="bands"` draws a
  DensityBands until then (its settings-pane edits stay in the browser, as before). The bands
  take a theme entry of their own (`marks.DensityBands`, whose `fill` now applies; a
  `marks.DensityContour` entry styled them before) and are described as density bands. DensityBands takes Polygon's keywords: no color,
  width, size, position, z, interpolation or maxInstances, which drew nothing on the bands. Both
  are templates, drawn and exported as before, and DensityContour's settings-pane edits now
  reach Python as its props. The density-contours gallery example draws the two marks, shown or
  hidden with a checkbox each.

- Callout is a template (TODO 130.3), drawn, exported and described as before. It now has a
  handle (`getMark()`, `getLegendSource()`, `whenSettled()`, `subscribeSettings()`), its edits
  in the settings pane (size, opacity, visibility, legend) reach Python as its props, and inside
  a Python template it follows the template's main part as other marks do. A pane color edit to
  a Text or Callout now reaches Python as its `color`; it was sent as a `fill` neither has.

- RuleX and RuleY are templates (TODO 130.3), drawn, exported and described as before. They
  now have handles (`getMark()`, `getLegendSource()`, `whenSettled()`), and edits to them in the
  settings pane (color, width, dashes, visibility) reach Python as their props, where they
  stayed in the browser. Their `dash` is Segments' own, so a value it does not accept (0, a
  negative length, a one-number list) is an error naming `Segments.dash`; it was drawn as it
  came. The composition surface gains `planeRule`, a rule's refusal in a 3D Cartesian view.

- Smooth is a template (TODO 130.3), drawn, exported and described as before. Edits to its
  line in the settings pane and legend (color, width, visibility, label) now reach Python as the
  Smooth's props, and HTML exports keep them, where they stayed in the browser; the line's own
  opacity is not sent, since the Smooth's `opacity` styles its band. The band follows the
  line's visibility through the template, so a Smooth inside a template that hides it hides its
  band too. The band is no longer listed in the settings pane: its fill and opacity are the
  Smooth's `fill` and `opacity` (or the theme's Smooth entry).

- Swarm is a template (TODO 130.3), drawn, exported and described as before. Edits to its
  points' options in the settings pane (fill, size, opacity, visibility) now reach Python as the
  Swarm's props, and HTML exports keep them, where they stayed in the browser. A Swarm whose x
  and y are both categorical or both numeric (with no orientation) is now the mark's error, as a
  Bar's is, and clears with the next good update; it was thrown from the component. The
  composition surface gains `DODGE_AXIS_CONTEXT`, a compound's own axis rule for its Dodge.

- Histogram is a template (TODO 130.3), drawn, exported and described as before. Edits to its
  bins and normalization in the settings pane now reach Python as the Histogram's `bins` and
  `normalization` (a bins entry once it reads as a count or edges, after a pause in typing),
  where they stayed in the browser; so do edits to its bars' own options (fill, opacity).

- A Python template's `update(**params)` re-runs `build()` in place with those parameters
  changed (other keywords go to its main part, as in the call): `pop.update(y="other")`.
  Components built again (matched by kind and position) stay the same objects, with their ids
  and the callbacks registered outside `build()`, so handles, references and connections keep
  working; their props come from the new build. Nested templates rebuild with it, the
  caller's children stay in the slot, and a failed build leaves the template as it was. It
  raised before (TODO 130.2).

- A portable template file keeps each nested template's contract (its kind, main part, parts
  and legend entries) as that Template node's `contract` prop, so after `export_template` and
  `load_template` or `<PortableTemplate>` a nested lollipop's stems still follow its head and
  its settings group keeps its name. A contract part that is a nested template passes its
  props and events to that template's main mark (TODO 130.2).

- A template's named parts take their props by name: `lollipop("day", "value",
stem={"color": "gray"})` with `hm.contract(parts={"stem": stem})` in `build()`, and
  `<PortableTemplate props={{ stem: { color: "gray" } }}>` for a loaded file. A part name that
  is a `build()` parameter or a prop of the main part is refused, and a part's dict wins over
  the main part's keywords. A nested template whose only mark is the declared main part now
  leads the outer template's other marks, as a declared one did (TODO 130.2).

- A Heatmap of a small grid draws sharp cells, each a flat square of its value, where it
  blended neighboring cells into blurred blobs (TODO 134.15). The new `pixelated` keyword (as
  Image's) chooses: unset, a 2-D array of at most 64 cells along each side is sharp, and a finer
  one, a grid table's field, surfaceMode, contours and a 3D plot blend; `pixelated={false}` keeps
  the blend. A plain 2-D array's cells now sit on their indices, beside other marks too: the cell
  in row i and column j is centered at x = j, y = i (row 0 at the bottom), and the axes span -0.5
  to n - 0.5 unpadded, where they spanned -1 to 1. An explicit domain, `xbounds`/`ybounds`, a non-Cartesian or scaled axis, or a Plot
  that fits no domains (a JavaScript Plot without data) keeps the old placement; a grid table
  is placed by its coordinates as before.

- FromEdges is part of GraphData (TODO 137.3): `nodes=` and `edges=` are optional. With `edges=`
  alone GraphData infers the nodes from the endpoints; with neither, the surrounding data (a
  Plot's `data`, a Data or a transform above) are the edges. FromEdges' `node_from=`/`nodeFrom`
  and `reduce=` are GraphData's, for inferred or supplied nodes. Migration: rename `FromEdges` to
  `GraphData`; a FromEdges inside a GraphData becomes that GraphData's `reduce` and `node_from`.
  `hm.FromEdges` raises an error naming GraphData, and the JavaScript export is gone.

- A template with a main part (`hm.contract(main=...)`, a portable file's `contract.main`) has
  one legend entry, the main part's: its other marks get `legend=False` unless they set a
  legend. They also follow the main part's visibility, so hiding it (a legend click, the pane,
  `visible=False` on the template) hides its other marks too, while a part's own `visible=`
  still wins (TODO 130.2). A Smooth, BoxPlot, Lollipop or Pie among those marks hides its main
  mark (a Smooth's line, not yet its band) until it becomes a template itself.
  A template with no main part declares its own legend entries with
  `hm.contract(legend_entries=[{"label": "Change", "swatch": end, "parts": [start, bar, end]}])`:
  one entry for the listed marks, which one click hides together; exported files keep them
  (`contract.legendEntries`).
  In the settings pane, a template inside a Plot is one group, "lollipop 1 defaults": with a
  main part it lists only that mark, and a group lists its parts, by their `hm.contract(parts=)`
  names when they have no `name=` (that name is also their legend label).

- A Line colored by a category column (`color="city"`), or an Area or Ribbon filled by one,
  draws one path per category, as ggplot, Vega-Lite and Observable Plot do; it joined every
  category into one path, with stray segments between them. `series=` still sets the paths
  itself, and a connector Line (`connections`) is unchanged.

- Settings-pane edits to a Bar or an Ecdf (its color, opacity, ...) now reach Python as edits of
  that Bar or Ecdf, as they do for other marks (TODO 130.2).

- Python templates have a main part: events (but a Plot's camera events), selections,
  `endpoint()` and `hm.connect(t)` use the template's only mark wherever it sits (a Mapping or
  Transform around it), not its single top-level node, and a template with several marks
  raises naming them. `hm.contract(main=..., parts={...})` in `build()` names the main part and
  the parts `t.part(name)` returns; references such as `Legend(target=t)` use a declared main
  part, else the single top-level node as before (a Legend falls back to the only mark when
  there are several). Keyword arguments `build()` does not take are props of the main part
  (a group of marks with no main part takes only `visible=`). A Template subclass's signature
  is its `build()`'s, and a loaded portable template's lists its parameters (TODO 130.2).
  `export_template` writes the contract to the file (`template.contract`), and loading it in
  Python or with `PortableTemplate` restores the main part and parts: keywords that are not
  parameters (Python) and the new `props` (Svelte) go to the main part, and `events` bind to
  contract part names.

- A Bar's stacking and grouping series is its `fill`, or its `color` when `fill` is left out, if
  that names a column. A Bar whose `fill` is a color and whose `color` is a column no longer
  stacks or groups by the `color` column; `fill={col("product")}` and an input read
  (`fill="$choice"`) naming a column now stack and group by it, as a plain column name does. `arrange="stack"` with a baseline other than 0 is now
  refused by BarGeometry, with the same message.

- The scene registry (`sceneRegistry` from `hmplot/scene`, and Python's `registry.json`) lists
  the mark kinds `theme.marks` accepts as `themeKinds`. Python validates themes with that list,
  which now comes from the renderer (TODO 130.2), so the two cannot drift apart.

- A count Ecdf (`normalize="count"`) titles its y axis, and names it in its description,
  "ECDF (count)" (or "1 − ECDF (count)"), from its transform, where it said "ECDF". Ecdf is now
  a template that the library's template host expands (TODO 130.2); `by={null}` now means no
  groups, as leaving it out does. Otherwise it draws, exports and describes itself as before.

- Room for text labels at a plot's edge is now pixel padding inside the plot area: the domain
  and its ticks stay the data's (they widened to fit the labels). Frames drawn through their
  parent (facet cells, twins, ranged or placed Frames) still widen their domain.

- A category y axis lists its categories from the top, as a table and a sorted bar chart read
  (it listed them from the bottom). `y={"invert": True}` keeps the old bottom-up order.

- Four transforms are removed (TODO 137.3); in Python each is an error naming what replaces it:
  - `JoinAggregate`: a group's statistic on every row is a reduction with `by` in Calculate:
    `<Calculate columns={{ groupMean: mean("value", { by: "group" }) }}>` (Python
    `hm.Calculate(group_mean=hm.mean("value", by="group"))`).
  - `Quantile`: a quantile is the new `quantile(x, p)` reducer (`hm.quantile`), between the two
    nearest values as NumPy interpolates by default, with `by` and `where` like the others:
    `hm.Group(by="region", columns={"p90": hm.quantile("delay", 0.9)})`. For a curve of
    quantiles, sort the rows and give each its share of its group:
    `divide(cumsum(is_finite("x"), { by: "g", orderBy: "x" }), count("x", { by: "g" }))`.
  - `ECDF`: the `Ecdf` chart draws the distribution (`<Ecdf x="x" by="g" />`). The expression
    above gives the same fraction in Calculate when the values are distinct; tied values each
    take their own step there, where Ecdf puts a tie at its last rank.
  - `Shuffle`: `Sample` takes `order="random"`, which puts the sampled rows in the seed's random
    order and, without a size or proportion, keeps every row: `<Sample order="random">`
    shuffles the table.

- RuleX, RuleY and Crosshair rules reach the frame's edges in every frame while the plot pans
  and zooms: a Segments end that is a bare `"@view_y_min"` (and so on) on its own axis, as in
  `start={[x, "@view_y_min"]}`, is read from the camera in the shader in a flat Cartesian frame,
  where it used to trail the edge by a frame or more and prepare the mark again.

- A channel's scale is one object: `fillScale`, `colorScale`, `sizeScale` and `widthScale`
  (Python `fill_scale=`, ...) take `continuous({ domain, range, colormap, transform })` or
  `categorical({ domain, range })`. The flat per-channel keys are removed: `fillDomain`,
  `fillRange`, `fillTransform`, the same for `color`, `size` and `width`, and GeoJSON's
  `heightDomain` and `heightRange`; each is an error naming its replacement. GeoJSON's height
  takes `heightScale=continuous({ domain, range })` (both default to [0, 1], as before).
  `colormap` stays. A size or width scale without a range draws at the automatic size range.
  Migration:
  - `fillDomain={[0, 1]}` is `fillScale={continuous({ domain: [0, 1] })}` (Python
    `fill_scale=hm.continuous(domain=[0, 1])`), and `"symmetric"` works the same way.
  - `fillRange={colors}` is `continuous({ colormap: colors })` for numbers, or
    `categorical({ range: colors })` for categories; a domain of categories is
    `categorical({ domain, range })`.
  - `sizeDomain`, `sizeRange` and `sizeTransform` are `sizeScale={continuous({ domain, range,
transform })}`, and the same for width. A literal width (`width={2}`) is pixels, so the
    `widthDomain={[0, 1]} widthRange={[0, 1]}` it was sometimes given can be dropped.
  - `colormap` beside a `fillScale` or `colorScale` goes onto the scale:
    `continuous({ domain, colormap })`.
    The settings pane still edits a mark's domain, range and transform, but those edits stay on
    screen: they are not sent to a Python scene or written into an export.

- Polygon is a core primitive mark rather than a compound mark: import it from the package root
  (it is no longer exported from `hmplot/compound`). It draws vertex rows grouped by `series`,
  or the triangle rows Contour, Voronoi and Hull make, as before; the experimental composition
  surface drops `Triangles`, which Polygon covers. Like the other primitives, a Polygon's
  defaults now yield to an enclosing `Mapping` or compound theme (`<Mapping fill="species">`
  colors it by species; it used to keep the default fill).

- Bin takes `normalization` (`"count"`, `"proportion"` or `"density"`) for a histogram over
  x alone or y alone: each bin also gets `y0` (0), `y1` and `y` (`x0`, `x1` and `x` when
  binning y), so `<Bin x="v" normalization="density"><Rect x0="x0" x1="x1" y0="y0" y1="y1" />`
  (Python `hm.Bin(x="v", normalization="density")`) draws a histogram either way round.

- A point mark under a Dodge takes its offsets itself: `<Dodge x="value"><Points x="value"
y={0} /></Dodge>` (Python `hm.Points(x="value", y=0)`) needs no `offsetY="offset"`; naming
  the offset column still works. Dodge's `axis` defaults to `"auto"`: the points move across a
  categorical x (a swarm per category), or along x for a lone y, otherwise along y as before.

- `lookup(x, row)` (`hm.lookup`) reads a column at another row, as `x[parent]`: each row gets x
  at the row numbered `row` (0-based) of the visible rows in their order, so
  `hm.Calculate(parent_x=hm.lookup("x", "parent"))` puts each node's parent's x beside it. A row
  number that is missing, fractional or past the last row reads `fill` (missing by default;
  int32 and boolean columns need one, as in `lag`). It keeps a category or a datetime, runs on
  the GPU, and a drag cannot move a value read through it. Row operations in a Group's columns
  are rejected, as `lag` is. `lag` and `lead` of a boolean column now stay boolean (they came
  back as 0 and 1 floats).

- `hm.extent(column, where=)` reads a domain from the data: `x={"domain": hm.extent("x",
where="@brushed")}` zooms a plot to the rows brushed in another and follows the brush, and is
  automatic while nothing is brushed. A domain's ends can be any reductions.

- The view can be written into a scene: with the Plot's `animation` on, a new `viewport` or
  camera prop (position, target, up, fov; from an input, a callback or Python) eases there over
  its `animation_duration`, also in an exported page, and the viewer's press or wheel stops it
  where it is. `when_animations_finished` waits for it. Without animation, or under reduced
  motion, the view jumps there as before.

- The sky and a Frame's atmosphere are plugins of the library's own, built on the same plugin
  API as anyone's and registered when the package (or a Python view) loads: they draw as before,
  and their kinds are taken, so another plugin declaring "sky" or "atmosphere" is a
  `plugin.conflict`. Plugins gain what they needed: `vector` parameters (a list of 2 to 4
  numbers, a uniform) and `image` parameters (a URL, bitmap, image, canvas or Blob, or in Python
  a path, bytes or PIL image, which the library loads before the effect draws; `wrap: "repeat"`
  for a panorama), a `check(values, context)` for what a schema cannot say, `shown(values)` to
  leave an effect out (not drawn, not exported), the camera's `up`, and effects of stage
  `"object"`, an object a Frame adds to the plot's scene and fits before each draw. A parameter
  without a default that is left out is now `null` in an effect's or a shade's `params` (it
  was 0 or black), and a `null` value counts as left out. Image parameters are an effect's only.
  A few messages change: a sky's rotation of the wrong length says "rotation is a list of 3
  numbers", and a sky in a 2D plot "sky needs a 3D view".

- `hm.LinkViews` shares one domain on the linked axes: the union of the plots' data, so a value
  lines up in each plot (each fitted its own data before, so stacked panels drifted apart as
  they panned). `scales="free"` keeps each plot's own domain, and an explicit domain is kept.

- A domain can be dates: `x={"domain": [datetime.date(2024, 1, 1), datetime.date(2024, 3, 1)]}`
  draws a time axis over those days. It failed with "requires two distinct finite values".

- `aspect="equal"` no longer widens a domain you gave: with x and y domains of [0, 1] in a wide
  plot, the x axis showed -0.5 to 1.5. The plot area now narrows (letterboxes) so the domain
  fills it, centered; an automatic domain still widens to fill the area.

- Transforms take values for their numeric fields, as marks take them for channels: one number
  per row of the data, in its row order (also under a Filter), as a list, typed array, NumPy
  array or Series: `hm.Regression(x=days, y=weights)`. This covers Bin's x, y, z and weight,
  Density's x, y and weight, Regression's x and y, ECDF's x, Window's and Normalize's field
  and Stack's y. A missing value (None or null) is NaN. Any other count is an error naming the
  transform and the field.

- Frame takes `placement="fit"`: the frame is centered in its Cartesian parent's domain, across
  90% of the parent's shorter side, and refits as the parent pans, zooms or resizes. A Pie in a
  Cartesian plot places its own polar Frame this way, and no longer adds its center to the
  plot's domain.

- A Plot takes `effects`, a list of effects composited over the whole plot, and the sky, bloom
  and fog move into it. `<Sky zenith="#2f5f9e" />` is now
  `effects={[{ kind: "sky", zenith: "#2f5f9e" }]}` (Python `effects=[hm.effect("sky",
zenith="#2f5f9e")]`), `<Bloom strength={1.2} />` is `{ kind: "bloom", strength: 1.2 }`, and
  `fog={{ near: 50, far: 200 }}` is `{ kind: "fog", near: 50, far: 200 }`. Their parameters and
  what they draw are unchanged. Sky, Bloom (`hm.Sky`, `hm.Bloom`) and Plot's `fog` are removed;
  each raises an error naming its replacement. Export reports name the sky "sky".

- Plugins: `registerPlugin(definePlugin({ name, apiVersion: 1, setup }))` adds effects written
  in TSL, which a Plot's `effects` name by kind with their parameters (`{ kind: "vignette",
amount: 0.6 }`; Python `hm.effect("vignette", amount=0.6)`). An effect declares its stage
  (before or after tone mapping), a parameter schema (values are checked, naming the
  parameter; number and color parameters are uniforms, so changing one compiles nothing) and
  whether SVG and PDF draw the plot as one image while it shows. A kind no plugin registers is
  skipped with a `plugin.missing` warning, and drawn once its plugin registers; an effect that
  fails to build is skipped with a `plugin.failed` warning.

- Python uses plugin packages: `hm.use_plugin("acme-hatch")` takes an installed package's
  plugin by name (packages declare theirs under the `hmplot.plugins` entry point, with the
  plugin's file and a `manifest.json` that `node scripts/plugin-manifest.mjs` writes). Its
  effects' and shades' parameters are then checked in Python, and a scene naming them carries
  the plugin's name, version and hash, never its code. Notebooks get the file from the
  installed package, exported HTML pages embed it, and headless exports and `hm.check` serve
  it; the browser runs it only when its hash matches (`plugin.failed` otherwise), and a plugin
  it has no file for is a `plugin.missing` warning. Portable templates record the plugins they
  name, and loading one uses them.

- Marks take `shade`, a plugin's fragment hook: `shade={{ kind: "hatch", spacing: 6 }}` (Python
  `shade=hm.shade("hatch", spacing=6)`) recolors each fragment the mark draws, from its color,
  its pixel position and, on marks with surface normals (Points3D, Prism, Surface, Arrows3D,
  GeoJSON's faces, a Heatmap, a lit Image), its normal. A plugin declares it with
  `hm.shade(kind, { parameters, shade })`. Picking, tooltips, domains and legends are unchanged;
  number and color parameters are uniforms, so changing one compiles nothing. Reading a normal
  on a mark without one, a kind no plugin registers or a refused parameter is the mark's error,
  and it draws unshaded. SVG and PDF exports draw a shaded mark as an image.

- The compound composition surface (`hmplot/compound`'s `composition`) exports `Anchor`, which
  registers its positions on the axes, a categorical one included, without drawing. Violin
  uses it in place of an invisible Points.

- Ribbon takes `orientation="horizontal"`: the band spans x between `lower` and `upper` along
  y, with its positions given as `y`, as a horizontal ErrorBars does:
  `hm.Ribbon(y="depth", lower="low", upper="high", orientation="horizontal")`. It brushes
  along y. A vertical Ribbon given `y`, or a horizontal one given `x`, is now an error naming
  the fix (a vertical Ribbon ignored `y`); a Mapping's `y` reaches a horizontal Ribbon as its
  positions, and a Mapping no longer sets a band's internal `axis`. Violin turns its bands this
  way.

- Segments takes `cap="bar"` and `cap_size` (6 px by default): a bar across each segment at both
  ends, as ErrorBars draws its caps, in the plot and in SVG and PDF export (2D and 3D).
  ErrorBars now draws its caps this way, which changes nothing it shows.

- Text takes `format="axis"`: with `text="@pointer_x"` (or `@pointer_y`, `@view_x_min`, ...)
  the label shows that value as the axis's readout writes it, finer than its ticks, and follows
  the pointer and the view: `hm.Text(x="@pointer_x", y="@view_y_min", text="@pointer_x",
format="axis", rows="auto")`. Crosshair's Cartesian readouts are drawn this way.

- Text takes `align="auto"`: each row's label sits on the side of its point it is offset to
  (starting there when offset_x is more than 4 pixels right, ending there when more than 4
  left, else centered), in the plot and its exports. Callout's default `align` is now "auto",
  so a Callout whose offset_x is a column puts each row's text on its own side; it was
  centered.

- `hm.Regression(band=False)` still writes `lower` and `upper`, every value missing, instead of
  leaving them out, so a mark that reads them no longer fails on a missing column.

- Marks take `domains=False` and `rows="auto"`. `domains=False` leaves a mark out of its axes'
  automatic domains, as rules always were (it replaces the internal `_domains`). `rows="auto"`
  draws one item when none of the mark's channels reads a column of its data (a line at a
  value, a label at a point, `@` view-state fields included), instead of one per row:
  `hm.Points(x=4.5, y=2, rows="auto")` in a Plot of 1,000 rows draws one point. RuleX, RuleY and
  Callout are built on them, so a Callout whose `text` names a column draws one callout per row,
  and a rule or callout at a string that names no column draws one. Chart templates (Bar,
  Histogram, ...) leave `rows` out; RuleX, RuleY and Callout leave `domains` out too (they set
  it), and GeoJSON, GeoJSONLine and Mapping both.

- Every transform names its outputs for axis titles. A Window's mean, sum, min, max, first,
  last or std is titled by its field (its count is "count"; a variance is untitled), not by the
  output column's name. A grid Dodge's cells are
  untitled; they were titled "x" and "y". BarGeometry, BoxStats and PieGeometry declare theirs
  too, so a Bar's value axis takes its title from the transform, as any mark's does.

- The Python package's registry lists the transforms' expression parameters in the transform
  table's order; the parameters themselves are unchanged. They now come from each transform's
  parameter schema, the groundwork for plugins (TODO 138.2), which are not public yet.

- Polar, globe and map plots size their margins to fit their labels, like Cartesian ones: the
  disk takes the canvas but for the room the angle and radius labels around it need, instead of
  the fixed 80/24/24/64 px margins it had. A side with nothing to fit keeps 8 px, and a margin
  set as a number still pins its side.

- `hm.check` lints what the drawn layout shows: category labels hidden where they would
  overlap, an explicit domain holding none of the data (in 3D, data past it, which draws
  outside the axes), and points at least half the plot across (a size expression drawn as
  pixels). Its PNG draws a fixed-width Plot at its own width; it was stretched across the page.

- Group's keys can be bins and hexagons: `hm.Group(by=hm.bin("delay", 20))` has a row per bin of
  `delay` with a row, with its edges and center (`delay0`, `delay1`, `delay`), and
  `hm.Group(by=hm.hexbin("lon", "lat", radius=0.5))` a row per hexagon, with its center. They bin
  as Bin and Hexbin do (a count, a rule or explicit edges; datetime intervals), sit beside column
  keys (`by=["carrier", hm.bin("delay", 20)]`) and take Group's `columns`. JavaScript `bin` and
  `hexbin`. `hm.bin` is left out of `from hmplot import *`, as `hm.min` is, so it does not
  replace Python's `bin`.
- `hm.check` lints a color mapped from data that no legend explains (add a Legend for the
  channel, or `legend=True` on the Plot; a color repeating the x or y column needs none) and an
  explicit x or y domain at least 20 times wider than the data, which squeezes the marks into a
  sliver of the plot.

- A size or width with its own domain (`size_domain=`, `width_domain=`) draws at the automatic
  size range (4 to 16 px, widths 1 to 6 px) and has a legend: the points drew a fraction of a
  pixel wide, and a size Legend said size was not mapped.

- What does not fit says so, and a Facet no longer scrolls: its columns share the grid's
  width (each was at least 220 px). A Plot whose `width` is wider than its container (it is cut
  off), Facet cells too narrow for their axes, and axis labels that need more than 45% of a plot
  (they clip there) are each a warning in the scene's diagnostics and `hm.check`
  (`layout.width`, `layout.facetCells`, `layout.overflow`).

- A Facet grid labels one set of outer axes, as ggplot's facet_grid does, and pans them
  together: `link` defaults to `"auto"`, which links the axes the cells share (`scales`
  "shared", or the axis a `free-x`/`free-y` leaves shared), and each such axis is labeled on
  the lowest cell of each column (x; the highest for a top axis) and the leftmost of each row
  (y; the rightmost for a right axis). The other cells keep its ticks and grid lines, without
  tick labels or a title, and the cells line up their plot areas. Panning or zooming one cell
  moved only that cell; `link="none"` keeps that, and every cell's labels. `fields` and
  `pairs` grids (`scales="field"`) are unchanged.

- `hm.check` lints a Filter that reads a pointer state no mark sets: a Filter on `"@brushed"`
  (or `"@hovered"`, `"@nearby"`) over data no mark brushes (hovers, marks nearby) keeps the same
  rows whatever the viewer does. Each Plot given its own `data=` is the usual cause: the brush is
  on one table and the Filter reads another.

- Group, Pivot, Bin and Hexbin take reduction expressions, the ones Calculate uses, instead of reducer specs:
  one syntax for reductions. `reduce=` is removed from all four, and passing it is an error that

- Plots laid out together line up their plot areas: side by side in a `Row` (or a `LayoutGrid`
  row) they share the area's top and bottom, and stacked in a `Column`, a Scene or a
  `LayoutGrid` column its left and right, so a title, a legend or wider tick labels on one no
  longer leave the others' axes out of line. A pinned `axisMargin*` side keeps its value.

- `hm.check` lists lints: what runs but does nothing or looks wrong, each naming the component
  and the fix, apart from its errors and warnings. The first is a Legend that explains nothing (no
  mark maps its channel, a bare Legend over marks that map nothing and have no label, or a channel
  its mark does not map: these were errors in `hm.check`). `hm.check(plot, strict=True)` and
  `hmplot check --strict` list lints as errors. A legend whose mark has not bound yet is a warning.

- An unknown colormap name (`colormap="blues"`) is an error naming the mark and the names it
  takes, raised by Python when the mark is made, and in JavaScript the plot's error (its exports
  fail, as for a missing column); the mark drew Viridis with only a console warning.

- Group and Pivot take reduction expressions, the ones Calculate uses, instead of reducer specs:
  one syntax for reductions. `reduce=` is removed from both, and passing it is an error that
  says what to write.
  - Group: `reduce={"mean_x": {"op": "mean", "field": "x"}}` becomes
    `columns={"mean_x": hm.mean("x")}` (JavaScript `columns={{ mean_x: mean("x") }}`). A column
    can be any reduction (median and mode are new here), arithmetic of reductions
    (`divide(sum("x"), count())`), or a reduction with `where`; a column read outside a
    reduction must be a key.
  - Pivot: `value="x", reduce="mean"` becomes `value=hm.mean("x")`; the old default,
    `value="x"`, is `value=hm.sum("x")`.
  - Bin and Hexbin: `reduce=` becomes `columns=` the same way
    (`columns={"total": hm.sum("trips")}`). A column can be any reduction expression, as in
    Group; an empty bin's is missing (a `count()` or `sum(x)` column of its own is 0, as before).
    With `weight`, `count()`, `sum(x)` and `mean(x)` columns weigh their rows and any other
    column leaves out rows of weight 0, as min and max did; with a column weight, a sum, mean or
    count inside a larger expression is an error that says to compute it after the Bin. A column cannot take the
    name of one the transform writes (count, the bin edges and centers, a hexagon's x, y,
    width, depth and rotation): it replaced it before, or on one of Hexbin's paths failed.

- An auto margin holds still while you pan or zoom, and fits the new tick labels once the drag
  or the wheel stops; while a transition runs it only grows. It followed every frame, so the
  plot area could jump under the pointer.

- A Plot's `height` is the whole plot: its title, subtitle, caption and top or bottom legends
  take their room from it, and the drawing area the rest, keeping at least a quarter of the
  height. They added to it, so a titled plot with a legend below was taller than `height`. A
  plot without them is unchanged, and a Facet still sizes its cells.

- A reduction by groups in an expression (`hm.mean("x", by="g")`) works for any number of
  groups: past 1,024 it was an error (`limit.reductionGroups`, now removed). Every group is
  reduced at once, by a one-hot pass for few groups and over the rows sorted by group for many,
  instead of one pass per group; `median` and `mode` by group as well. Window, cumsum, lag and
  lead by group no longer slow down with the number of groups.

- A 2D plot's margins fit its axes: `axisMarginLeft`, `axisMarginRight`, `axisMarginTop` and
  `axisMarginBottom` (Python `axis_margin_*`) are `"auto"` by default, measured from the tick
  labels (rotated ones at their angle, a datetime axis's second row) and outside titles, with the
  ticks chosen for the area that leaves. Long category names and y titles no longer fall off the
  canvas, and an end label that reaches past the area widens the side it reaches. A number still
  pins a side. This changes every 2D Cartesian plot's layout: the margins were 36, 12, 12 and 32
  pixels, and the bundled themes pinned them (80, 24, 24 and 64 in most); the themes no longer set
  margins, and a theme's `axes.margin*` takes `"auto"` too. In the settings pane an empty margin is
  automatic. Polar and globe plots are not laid out yet: an automatic side there keeps 80, 24, 24
  or 64.

- A Line, Segments or Arrows mark with one channel too many for the device's vertex buffers (a
  connector Line with Dodge offsets and per-row color, width and opacity) draws: the extra
  channel is read from a storage buffer, as Points and Text already did, instead of the mark
  reporting an error.

- A Rect or bar that starts at or below zero on a log axis is no longer drawn as a long
  diagonal sliver running off the plot: a rectangle with a corner the axis cannot map draws
  nothing, as do Points and Text at such a value.

- Data preparation no longer replaces an authored setting or the viewer's edit: a datetime
  column's axis settings and a scale's options (domain, colormap, quantize) are a derived layer
  below them, so a settings-pane edit to a mark's color domain stays when its scale updates. Each
  options node keeps its values in layers (the viewer's edits, the authored props, the theme, the
  derived values), and `options.set(key, value, { layer })` and `options.clear(key, { layer })`
  write and clear one. An authored value that changes (a bound prop, a Python assignment) replaces
  the viewer's edit of it. A Frame's exported or edited axes carry only what the viewer changed
  (they sent every axis setting, defaults and inferred domains included), a Facet cell remounted
  after scrolling restores only the viewer's edits, and Partition's groups share the viewer's
  edits and authored values but each keeps its own scale options.

- Curved and map paths past 1,024 in one mark draw: 1,560 great-circle routes on a map, or a
  Line of thousands of points on a globe, failed with "a batch of curved or spherical paths needs
  1,025 paths". Paths refine in batches of 1,024, and where each piece starts is a parallel scan;
  each path keeps the detail a batch gives it, however many there are (`limit.curvedPaths` is
  now done in parts). A mark's refined pieces are limited to 4,194,304 (`limit.curvedPieces`),
  not 65,536; a sampled curved Line (`maxInstances`) samples at most 1,024 paths.

- Every component's error is a diagnostic naming it and its own scene node: inputs, Data,
  ConstantData, Flow, Routes, Partition, Facet, titles, Markdown and templates report through
  the scene node they render in (they showed their errors only on the page, which `hm.check`
  read), and a mark's or transform's diagnostic names the mark's node, not its Plot's. A legend
  that cannot show is a warning. `hm.check` no longer reads the page's alerts.

- Points and Rect with many per-row channels, outlines and click handlers draw: their
  shaders failed as a WebGPU validation error ("Invalid CommandBuffer") once they passed 16
  inter-stage locations, because three.js numbered locations with gaps. Locations are now
  numbered without gaps (the widest Points uses 14), and a shader past the device's limit is the
  mark's error, naming it (`limit.varyings`).

- Capacity limits report one error: "<Component>: <what> needs <count> <unit>; the limit is
  <limit>. <hint>", with the code `limit.<name>` in diagnostics. Every limit, with its value and
  what happens past it, is listed in docs/LIMITATIONS.md ("Capacity"). Messages changed for about
  60 errors (GPU buffer and texture sizes, curved paths, reductions, Stack, Dodge, Partition,
  shapes, colormaps, tiles, axes, exports, templates); the code `animation.limit` is now
  `limit.animation`. A page holds 233 custom shapes, not 24 as the docs said.

- A cycle through the view stops and says so: when a mark draws a column computed from the view
  (`@view_*`, `@pointer`) and that column sets an axis's automatic domain, each run moves the view
  that the next run reads. After 40 such rounds without input, the plot stops re-running what
  reads the view and shows an error (code `view.cycle`) naming the transform and the marks. The
  next pointer move, wheel, drag or viewport set by code resumes it.

- A plot whose transform reads the view (a Hexbin radius from the visible span, a Filter to the
  visible window) settles while idle: its marks take the axes' automatic domains from the
  transform's input. Their own extents fed the domain, which moved the view, which re-ran the
  transform about 60 times a second.

- Moving the pointer from one point to another no longer flashes the un-hovered state: a pointer
  event's hover leave and enter publish together, once the entered row is read (a slow read
  publishes after 100 ms).

- Exports and notebook edits carry what was authored and what the viewer changed, nothing else:
  the settings pane and legend toggles are the user layer (`options.set(key, value, { layer:
"user" })`), and an exported page or a Python edit no longer replays every setting a plot holds
  (about 50 for a Plot: margins, camera, animation) or the marks' defaults. A plot nobody panned
  exports no viewport.

- Errors are diagnostics: `SceneRuntime.diagnostics()` lists every error a scene holds (its own,
  its transforms' and each plot's marks, fields and axes), each with its severity, code,
  component, scene node, property and message, and `hm.check(...)` returns them as
  `result.diagnostics` beside `result.errors`. A scene that hits an error stops waiting at once
  instead of timing out, and a timeout names what was still preparing. In a notebook, errors
  that appear after a scene was accepted are reported in `scene.diagnostics` (the scene is not
  rolled back), and an exported page's status line names its errors.

- Lines with `series` on a log axis end at their last points: each series end drew a line toward
  the plot's far corner (the row that separates series could not be mapped).

- An exported page whose mark has a shared scale (`fill_scale=hm.continuous(...)`) goes live:
  its snapshot replayed the settings pane's quantize and levels beside the scale, and the live
  view failed ("fillScale conflicts with quantize, levels") and stayed a static preview. The
  page now logs a live view's failure to the console.

- GeoJSON zooms a 2D map to its features: `fit` (default true) frames them as VectorTile frames
  its tiles, so a city's districts fill the plot instead of a speck in a world map. A Plot's own
  `viewport` wins; `fit=False` keeps the whole map. A world-sized layer is left as it is.
  An explicit `x`/`y` domain on a flat map (longitudes, latitudes) now frames the view the same
  way; it changed only the axis labels, so a city given its domain was a speck.

- Bars, histograms and areas sit on their axis: an automatic domain is no longer padded past
  their 0 baseline (it is at the other end, and for points and lines), and a tick on the
  axis's end is labeled, so a bar chart's value axis starts with its 0.

- Density over many rows is fast: above about 2^28 kernel entries (rows x grid cells) it counts
  the rows onto a grid four times finer than its own (padded by four bandwidths) and smooths the
  counts with the separable Gaussian, agreeing with the exact estimate to well under a percent of
  its peak. Ten million rows on a 512 x 512 grid draw in about 5 s and refilter in about 0.1 s;
  they never finished before (200,000 rows took 39 s). Smaller inputs stay exact.

- Plots draw colors exactly by default: `toneMapping` (`tone_mapping`) defaults to 0, no tone
  mapping, so marks match their legends and colormaps. It was 4 (ACES filmic), which muted flat
  colors. A glowing or lit 3D scene that wants the filmic look sets `toneMapping={4}`; the
  Lorenz, ten-million-stars and bloom examples now do.

- A point's `outlineWidth` (`outline_width`) is CSS pixels, as every other mark's is. It was a
  fraction of the point's radius (0 to 1): `outline_width=0.2` on a 10 px point drew a 1 px
  ring and now draws 0.2 px. Multiply old values by the point's radius (half its size). Theme
  point outlines and legend swatches are converted.

- Points3D's default `size` is 4 world units (the 3D box is 100 across); it was 25, a quarter
  of the box, which merged a few hundred points into blobs. Its `sizeRange` is documented in
  world units. Pass `size=25` for the old look.

- A category axis shows every tick label that fits: a label hides only where it would overlap
  the last one shown, by its measured extent along the axis (rotation included). It needed
  max(55, 7 per character) px either way, which dropped every other row's name on horizontal
  bar and dot charts.

- Selection resources now declare both interval and nearby-radius constraint snapshots.
  `getConstraints()` returns `SelectionConstraint[]`; `bounds` is optional because radius
  constraints carry `center` and `radius` instead. TypeScript callers must check for interval
  bounds before reading them. `table()` preserves its input type and accepts string keys or a
  string-key list; `selection()` accepts an options object with optional `active`. Runtime
  constraint snapshots and selection behavior are unchanged.

- A cached scalar reduction evaluated with `broadcast: false` remains readable after its
  reduction cache is released. Eager expression results now retain their device value until
  `dispose()`, so retiring a cache or another evaluation cannot free a held result.

- Expression helpers now declare their operands as `unknown` and their constructed values as
  expressions, allowing their implementation to be checked strictly. Calendar options are
  optional; cast/calendar/tween options must be objects, and `is_in` takes an iterable or an
  input expression. TypeScript code passing primitive options or a noniterable collection
  must supply an options object or a collection instead. Runtime validation and results are
  unchanged.

- `SceneRuntime.exportHTML()` types its `warnings` as `string[]` (they were `any[]`). They are
  the same messages as before; only the type changed.

- A live VectorTile in a Cartesian plot with automatic bounds frames its requested tiles together
  with the plot's other marks, padded like them. The tiles and the marks each set the plot's
  bounds, so a plot of live tiles and one point showed the point's domain alone. A plot of live
  tiles alone now has the same padding around them as other marks get; to frame the tiles
  exactly as before, give the Plot's `x` and `y` a `domain`.

- The scene registry (`sceneRegistry` in `hmplot/scene`, and Python's `registry.json`) records
  what a component's positional argument sets (`positional`: Data's `value`, Title's and
  Markdown's `text`, LinkViews' `plots`) and lists the input components (`inputs`) and input
  contexts (`inputContexts`), all generated from `scene/options.json`. Python's signatures and
  behavior are unchanged.

- Python: `hm.Shift(field="$name")` reads an input the way Normalize's and Window's `field` do.
  The browser already read it, but Python did not check it, so a misspelled name raised no error
  until the page drew, and `visualize_tree` did not list the input or column Shift reads. A
  misspelled name now raises "Shift.field reads $name, but no input named ..." when the scene is
  built.

- GPU arrays: a brush constraint's member count is no longer disposed twice, and Bin's
  automatic rules ("sturges", "fd", "scott", "auto") and Pivot no longer keep an array per run.
  An Interaction inside a Filter (or another view) no longer keeps an extra reference to its
  selection's mask on every read of an `@` column, which kept each revision's mask alive.

- A scene update's brush constraints resolve their owners as live interactions do, including
  standalone identities (a full update resolved only tables' identities and dropped the rest).
  `SceneResources.transaction()` runs an update's resources (prepare, activate, accept, roll
  back, retire), `owners()` resolves interaction owners by id, and
  `SceneRuntime.restoreConstraints()` is the one place both paths restore constraints.

- A scene update that fails before it settles restores the previous themes and offsets too:
  the page went back to the previous scene but kept the failed update's theme values and dragged
  offsets. `SceneResources.snapshot()` and `restore()` hold what an update changes (the runtime's
  own rollback list moved there), including the offset and selection version maps.

- `getMark().filteredCount` is gone. A mark drawing a Filter's rows set it, with other
  internal fields (`interaction`, `dataExtents`, `categories`, `resolvedScales`, ...), on the
  object `getMark()` returns; the mark now publishes them together, as its accepted binding,
  and the object keeps only its own fields. `getMark().count` is still the rows the mark draws
  (the Filter's input rows). The rows a padded mark shows have no public replacement; tests
  read them from the binding (`getMark().view.marks.of(getMark()).rows.count`), which is
  internal.

- A mark under Dodge > Interaction is dodged and drawn; it lost the table's rows and drew
  nothing, with "Expected undefined numeric values".

- A filtered mark whose drawn column changes in the same update as its kept rows (a Calculate
  before a Filter) redraws at the new values: it swapped only the rows and drew them at the old
  ones.

- Turning a Plot's `axisMask` off redraws it and lets picking reach the points it had hidden.

- A Calculate, Bin or Hexbin reading interaction state (`@brushed`, `@hovered`, ...) inside a
  Facet follows it: a Calculate of `@brushed` in a Facet showed no brushed rows. A transform's
  `update()` that changes which interaction columns it reads follows the new ones.

- An HTML export of a grid table (an xarray or NetCDF field) includes its coordinate, edge and
  position columns. The browser's export, which Python's `export_html` uses whenever it adds a
  snapshot, left them out, so the exported page could not rebuild the grid.

- DAG, Sankey, Pack and Treemap handles have `subscribe`, like every other transform: their
  status is pending while a layout runs and carries its error, so the scene runtime and Svelte
  callers see their work. A transform's status ends with `mounted: false, pending: false` when
  it unmounts.

- **Python: an HTML export target must contain what it refers to.** `export_html` of a Plot (or
  any part of a scene) that refers to a component outside it, such as a Legend for a mark in
  another Plot, exported the whole scene instead; it now raises, as the browser's export does.
  To migrate, export the Scene that holds both: `hm.export_html(scene, "page.html")`. Python's
  and the browser's export traversals now keep the same resources for the same target.

- **Python: every mark must be inside a Plot.** Bar, BoxPlot, Crosshair, DensityContour,
  Ecdf, GeoJSONLine, Lollipop, Pie, Polygon, RuleX, RuleY, Smooth, Swarm, VectorTile and Violin
  were accepted outside one and failed later in the browser; they now raise the same error as
  Points ("Bar must be inside a Plot: …"). The check follows the generated mark registry, so a
  new mark is covered without a hand edit. To migrate, create the mark in a `with hm.Plot():`
  block or pass it to one (`hm.Plot(hm.Bar(...))`); a root mark given `data=` still gets its
  Plot implicitly.

- Compiled expressions keep a separate program for each literal compared with a gathered or
  reduced category (`lag`, `first`, `mode`), and a host number or boolean compared with a
  category column matches that category whether or not the expression compiles. `lag`, `lead`
  and rolling `any`/`all` give rows with a missing `by` key no other row's category, integer or
  boolean value. Simulate's compiled path rejects categorical updates, and a step reading `@dt`
  beside a manual selection stays compiled. Edges keeps a layout's own `start`/`end` (Tree's
  parent-to-child edges, Sankey's attachment points). Force drag applies only to marks over its
  node rows, not under Filter, Sort, Sample or Group; two Forces over one GraphData no longer
  share endpoint mappings; and a numeric update no longer races steps or teardown. GraphData,
  Nodes and Edges report their rebuilds as pending, so scene exports wait for them. Tree
  `mode="cluster"` again rejects `where`, `enter`, `exit` and `edgeLength`, and a string `root`
  beside them names a node ID. Extent batches mask scalars and rasters by their own reshaped
  masks, and Text label bounds keep live positions when `align` or `displayScale` changes.

- Python scene columns omit unset optional metadata, allowing ordinary numeric expressions
  to use the shared compiled plans. This fixes repeated eager arithmetic in gallery
  Sunburst updates while preserving supplied metadata, layout and fade timing.

- String columns share lazy, data-owned category codes. Retained immutable Filter mappings
  reuse gathered columns with bounded leases. Compatible moving Text updates its geometry,
  opacity and automatic bounds while retaining unchanged glyph data and export labels;
  changed content, fonts, row membership and unsupported representations still prepare fully.
  Font loading refreshes retained glyphs and footprints. Text payload validation errors stay
  within the plot and recover when valid content is supplied.

- Shared extent batches preserve separate revisions of mutable validity masks. Missing-value
  legend checks recheck mutable host arrays and share pending immutable-column work; canceling
  one caller leaves other callers' results usable.

- Per-row animations apply their current value immediately after retargeting. Live layouts
  with animated text or other channels can draw that publication without waiting an extra
  animation tick; fades, row start times and the normal rendering guard are retained.

- Expressions share consumer-owned compiled plans across marks, transforms, layout inputs and
  Simulate. Numeric inputs, predicates, view state and rolling-window sizes reuse compatible
  programs. Host metadata operations retain their existing evaluation and tween ownership.
  Reductions accept `where`; `any`/`all` return logical booleans and also work in Group,
  JoinAggregate, FromEdges and Window. `cumsum`, `lag`, `lead` and `window` expressions support
  group-local ordering while keeping original row alignment. Exact int32 neighbors require an
  explicit integer fill. Opt-in plot diagnostics attribute Three.js shader builds to picking
  materials and their invalidation reasons, separately from GPU pipeline creation.

- Streamed vector tiles refresh GPU bind groups when their storage buffers grow, preventing
  destroyed-buffer errors when Manhattan flyover changes tile detail or zooms between levels.
  Existing shader and pipeline caches remain in use.

- Seeded `random` expressions generate uniform, normal or exponential values per row.
  The Galaxy example has matching Svelte/Python programs, generates its ten million stars
  on the GPU in both languages, and uses square points. Its scene contains generation settings
  and expressions rather than the generated dataset.

- Points and Points3D accept `depthWrite` (`depth_write` in Python). Normal blending defaults
  to depth writes; disabling them changes visible overlap while picking still uses nearest
  depth. Other blend modes keep depth writes disabled. Disabled depth writes in a 3D Points
  view use raster SVG/PDF output so exports preserve the rendered order.

- GraphData now pairs node/edge tables, and FromEdges infers or enriches nodes with the same
  typed reducers as Group. Nodes/Edges are ordinary table selectors before or after layout.
  Row-preserving transforms retain graph identity; filtering nodes induces surviving edges.
  Graph is removed: position nodes with ordinary columns or Calculate. Move endpoint mappings
  and node tables from Force/Tree/DAG/Pack/Treemap/Sankey to GraphData or FromEdges; replace
  Nodes' data/key join with ordinary Join. Examples and Python APIs use the new composition.
- Tween columns now publish current values and keep interpolation state private to their
  producer. Downstream expressions, transforms and layouts read the same values as marks and
  exports. Numeric updates retain structural plans, and eligible live mark fields update
  without rebuilding whole marks or adding another interpolation clock.
  Text retains unchanged glyph fields across position/paint updates, shares bounded font
  measurements with automatic bounds, and compiles changed code/width preparation together.
- Eligible numerical mark expressions share bounded compiled plans, passing current columns,
  masks and typed literals as runtime inputs. Operators retain the existing evaluator;
  unsupported types, shapes and stateful expressions keep ordinary evaluation.
- Keyed fades preserve their displayed opacity when live geometry republishes the same
  source frame. Queued uploads retain their own animation settings, and unchanged uniform
  targets keep their existing transition. Vector exports capture displayed opacity and colors.
  Literal transparent fills keep hollow interiors in SVG output. Unchanged Filter membership
  shares lazy source-index mappings and row-key downloads across animated publications.
  Rect, Prism and GeoJSON mesh rendering honors fractional row opacity. Sunburst sectors
  and labels fade while their branches collapse, including the focused sector's white center.
  Numeric host opacity arrays retain their values instead of falling back to opaque rows;
  animated opacity enables blending even when its endpoints are zero and one.
- Shared finite-extent summaries deduplicate compatible scale requests. Appearance-only
  changes reuse positional bounds when their geometry dependencies are unchanged; mutable
  inputs, live expressions and text footprints retain their required invalidation.
- Rect and Prism now animate interval bounds supplied by Calculate tween columns; temporary
  component metadata no longer disconnects `x0`/`x1` and other bounds from rendered buffers.
  Vector exports capture transitioning positions and interval bounds as displayed, rather
  than the uploaded targets.
- Animation preparation and uploads skip frames without discarding elapsed time or stretching
  transition durations. Explicit pauses and exports still freeze time; Playback/Simulate
  retain bounded automatic steps. Tree animation reuses numeric targets, structural columns
  and compiled output gathers; numeric tweens and label bounds reuse compiled programs.
  Unchanged Filter membership is cached, and continuous opacity ranges are read only when a
  legend needs them. Moving opacity keeps blending without a per-frame classification readback.

- Tree roots tidy, partition and cluster layouts consistently, omits unreachable nodes,
  retains node identity, and publishes child depth on edges. Layout changes refit automatic
  bounds. Nodes expose parent coordinates and partition bounds; numeric enter/exit expressions
  use the new/previous layout respectively. The expandable tree example demonstrates branch
  collapse, depth filtering and layout-owned transitions in Svelte and Python.
- Tree adds GPU `tidy-approx` and GPU partition geometry with cached hierarchy buffers;
  `tidy` uses compact CPU Reingold–Tilford. `edgeLength` reads independent edge lengths.
  Node filtering (`where`) and layout `enter`/`exit` contributions shrink/grow branches before
  geometry, retaining departing rows until completion. `presence` supports matching mark
  opacity. Incoming tweens retain their own timing; geometry is no longer recalculated on
  the host each animation frame in GPU modes. The Python tree visualizer fits the actual
  layout and labels instead of imposing domains derived from the old layout.
  Overlapping exports and atomic updates now release their animation holds independently,
  preventing a live animation from freezing after an export.

- The sunburst example now supports animated click-to-zoom and center/background reset, using
  Tree partition, selection and input tweens. Partition accepts zero widths and per-node
  band heights; tweening them before layout preserves the hierarchy while branches shrink
  and grow. Sectors and text fade on enter/exit; color transitions and focused-root fading
  preserve the white center while geometry reflows. Paired Svelte/Python
  programs retain their interaction in standalone HTML without host callbacks.
  Annular sectors now supply picking UV coordinates, avoiding Three.js warnings on hover.

- Simulate compiles and reuses numeric row updates instead of allocating expression
  intermediates at every step. The live 60,000-point Lorenz example retains its simulation,
  linked views and slider behavior with substantially lower allocation overhead.
  Intersected rectangular brushes retain the compiled path with boolean membership, keeping
  double gyre responsive during dragging and after a brush is committed.

- Curved paths keep drawing while Force positions and animations change. GPU snapshots keep
  subdivision's count/fill passes consistent, and complete refinements remain usable while
  the next one is prepared. GeoJSON coalesces seam updates through completed draws, retaining
  its worker and publishing meshes during longitude gestures instead of restarting each time.

- All gallery examples share the Example preview, source-language controls and cancellable
  loading queue. Older gallery programs now have full-size static previews; `/gallery` opens
  the current examples site. Navigating away aborts scene downloads and releases pending loads.
- The large Calculate example constructs its immutable data without reactive per-element
  writes, avoiding a long initialization stall in legacy Svelte development builds.
- Scene rendering imports only the marks/transforms used by the scene, caching them across
  pages, instead of downloading every registered component for a simple plot. The docs build
  uses native top-level await, avoiding a D3 initialization failure with split imports.

- Automatic 2D Cartesian bounds now reserve room for Text labels' font sizes, widths,
  alignment, pixel offsets, boxes and leaders. Resize and alignment edits reuse cached
  measurements; explicit domains and viewport navigation retain their clipping behavior.

- Audited outline support: Rect and filled sectors now draw inside borders; Area/Ribbon/Flow
  and Polygon retain their actual boundary strokes in 2D SVG/PDF exports. Numeric outline
  width and categorical/RGB color channels work on filled marks. Added `outlineOpacity` / `outline_opacity` for
  literal, column, array and expression border alpha, independent of the fill.
- DensityContour bands now expose contour-level boundaries without internal triangle edges.
  Filled shaders share compact boundary/style varyings and use storage overflow handling,
  retaining rendering with numeric fills and per-row outlines within WebGPU limits.
- Removed ineffective glyph outlines from Text/Callout and line-only outline settings from
  ErrorBars, Ecdf and Smooth. Use `color`/`width` for lines, `box` for label-box borders, and
  compose a Ribbon for a separately styled Smooth confidence-band boundary. BoxPlot boxes now
  use Rect, with borders scoped to the boxes rather than outlier symbols.

- Added `Shift`, a composable coordinate-offset transform for numeric and UTC datetime
  intervals in Python and Svelte, with named original/shifted outputs and portable serialization.
- Streamed vector tiles retain runtime-sized storage nodes when buffers grow and queue costly
  publications per renderer through completed draws, reducing repeated Three.js node builds.
  Tile materials omit unused instance matrices in both rendering and picking, preventing
  invalid GPU draws after zoom-driven buffer growth.
- Atomic scene updates and hidden views retain deferred axes without waiting for a paused
  draw, fixing preparation timeouts when updating Python scenes or opening a component tree.
- Added downloadable portable candlestick, parallel-coordinate, ridgeline and radar templates
  with paired Python/Svelte gallery examples and host-supplied data.

### Portable templates

- Python `Template` instances can export a code-free scene subtree with explicit
  `hm.template_param()` values. `hm.load_template()` and Svelte's `PortableTemplate` load
  the same JSON file, including nested templates, slots, Calculate and Simulate nodes.
  Host code supplies data and event handlers; the loader rejects external sources and
  embedded resources.

The first public release. A 0.x version says the API may still change: a minor release may
break things, and every break is listed here (docs/STABILITY.md says what the public API is;
`api/hmplot.api.md` lists it).

### Breaking changes

- `hmplot` is now the default theme: white background, readable Source Sans 3 text,
  bright contrasting categorical colors, palette-colored lines and solid 10 px points.
  `minimal` restores the original compact typography, points and inside/end titles,
  with ticks and short filled arrows but no baselines, grid or mask. Added `ink` with
  charcoal-led ink colors. Every preset now provides a continuous colormap as well as a palette.
  Axis title weights and appearance are theme settings; Paper, Journal, Graph and Blueprint
  use full borders. Cartesian masking defaults on except in Minimal.

- Plots now default to container width capped at 800 px and a 450 px drawing height.
  Explicit responsive mode fills the container; explicit dimensions are honored in Python
  as well as JavaScript. Axes and subtle major grids default on only for 2D Cartesian plots.

- Themes now support axis title and tick-label positioning. Built-in presets except Minimal use centered
  outside axis titles, at least 14 px text and 8 px points for readability; explicit plot
  and mark settings still override the theme.

- Browser scene edits and Python updates now accept only each component's declared properties
  and settings. Accidentally exposed implementation names such as `pending`, `revision`,
  `requestKey` and `plotControls` are rejected; `Template` and `Slot` accept no properties.
  The browser converts scale aliases, axis settings and composite dashes to public properties
  before sending edits, and preserves mapped color channels. Documented constructors and
  protocol message shapes are unchanged; the protocol remains version 1. The full removed-name
  list and generator inputs are documented in `docs/API-GENERATION.md`.

### Axes and interaction

- Frames and Plots now accept `animateBounds`, `boundsDuration`, and `boundsEasing` for numeric
  domain and range changes, independently of mark animation. Nested Frames inherit scale timing;
  interrupted changes continue from displayed bounds and frozen exports retain that mapping.
  The streamgraph now transitions its scales and areas together.
- Plot antialiasing adds `ssaa8` and `ssaa16`: hybrid 4× MSAA and higher-resolution
  rendering through the presentation compositor, with nominal 8×/16× sampling density.
  The settings pane labels these as hybrid modes; native WebGPU MSAA remains 4×.
- Added per-axis baseline/tick switches, tick size/direction, numeric title weight and
  grid color/width/dashes. Arrows remain filled and independent of baselines; hidden
  baselines leave short shafts. Plot/Frame `axisFrame` adds a rectangular border.
- Automatic axes and inherited grids now react to coordinate and view changes, appearing
  only in Cartesian 2D. Explicit settings retain precedence.
- `aspect="equal"` preserves transformed data-unit proportions in Cartesian 3D through
  the common display transform. `axes3d` accepts box/triad configuration with selected
  camera-facing far-plane grids and readable near-edge labels.
- Plot/Frame `axisMask` clips Cartesian data fragments and picking, intersects nested/facet
  masks and shares boundaries with transparent PNG/SVG/PDF exports.
- Added `@brush_min:<column>` and `@brush_max:<column>` virtual columns for live brush
  bounds, including empty selections and identity-linked aliases. Missing bounds are NaN;
  no selected-row reduction or GPU readback is required.

### Maintenance

- Manhattan flyover opens with streamed tiles and a Tile detail slider, backed by the new
  `VectorTile.zoomBias` (`zoom_bias` in Python). Streamgraph area updates animate by default
  with HMPlot controls; world projections now use HMPlot Select/Slider controls too.
- Flat GeoJSON maps omit hidden extrusion geometry, reuse their geometry worker across seam
  changes, and retain geometry when only the projection formula changes.

- Series marks retain animation across numerical updates to views with the same rows;
  structural topology changes still suppress implicit transitions.
- Flyover momentum retains its 1.5-second wall-time limit when slow tile frames cap the
  displacement step.
- Prepared marks use one resource owner and shared retirement ordering. Separate helpers own
  preparation publication, displayed keyed frames, procedural updates, brushing and tooltips.
  Internal contracts are checked strictly without changing repository-wide TypeScript settings.
- Vector export shares captured live-field semantics between its 2D and depth-sorted 3D writers.
  Export readbacks borrow live arrays; renderer buffers remain renderer-owned.
- The maintained JAX fork has a pinned base commit and build toolchain. `build:jax-fork -- --check`
  compares every artifact and the license without modifying them; CI verifies fork-related changes.

### Examples

- Added Lincoln temperature ridgelines from real weather data, plus Python programs for
  ridgelines, Apple year-over-year prices and animated country trails.
- Streamgraph is a paired Svelte/Python example in the shared Example component, with
  live controls, animated scales/areas, downloadable source and the Python editor.
- The ten-million-star galaxy and its H–R diagram default to antialiasing off.
- The ten-million-star galaxy is now 3D, with an illustrative mass-based stellar population,
  temperature colors, luminosity-based intensity and a linked, brushable H–R diagram.
- The galaxy has a compact older core, with spiral arms fading into the bulge. Its H–R diagram
  draws a fixed sample of 100,000 stars; brushing still highlights matching stars across all
  ten million. Age filtering preserves the sampled identities.

### Inputs

- Added `RangeSlider`, `TextInput`, `ColorPicker`, and `DateTimeInput` in JavaScript and Python.
  They share named input values with plots; datetime editing uses an explicit time zone.

### Data

- Added `ConstantData(rows=...)` in JavaScript and Python. It generates selected `row`, `zeros`,
  `ones` and `random` columns on the browser's GPU, with only `ones` enabled by default. Simulations
  can start from generated columns without uploading dummy tables from Python.

### Fixed

- Empty basis-curved Lines can update between empty and populated rows without failing their preparation.

- An exported HTML page keeps its Plot's legend setting. The live page showed an automatic
  legend (titled with the raw column name) beside an explicit `Legend`, or on a Plot that asked
  for none, while the PNG export and the page's snapshot did not: the marks' default legend
  entry was written as the Plot's `legend`. A legend turned on or moved in the settings pane now
  reaches Python and the export as the Plot's `legend`.

- Themes take a `title` section for the title block of Plots and Facets: `align` (left by
  default, center or right), `fontSize`, `fontWeight`, `subtitleFontSize`, `captionFontSize` and
  `spacing`. Exports draw the block as laid out. The defaults are the previous look.

- Provider `accumulate` (Python `accumulate=`): each completed load merges into the table on
  screen instead of replacing it, upserting by `key` or appending, with `{ maxRows }` keeping
  the newest rows. A url's `{version}` placeholder asks for rows since the result on screen.
  New params start a fresh table; a failed, superseded or mismatched load keeps the rows.
  docs/PROVIDERS.md, "Accumulating a feed".

- Python: a Facet around marks makes their cell Plot. `with hm.Facet(data=df, column="g"):
hm.Histogram(x="x")` draws the grid that `Facet > Plot > Histogram` draws (it raised
  "Histogram must be inside a Plot"). A Facet holding both a Plot and bare marks is an error;
  an embedded Facet is unchanged.

- Python: a mark displayed on its own (`hm.Points(data=df, x=..., y=..., fill="species")`) shows
  tooltips on hover, and the automatic legend when it has something to explain (a label, or a
  fill, color, size, shape, opacity or outline color read from data). Existing notebooks that
  display a bare mark gain both. A mark's `tooltip=False` still turns its tooltip off; an
  explicit Plot is unchanged. Tooltips cost no measurable frame time on a million points.

- A GeoJSON whose lines take a width per feature (`width="kind"` with a width domain and range)
  draws. It freed the gathered widths twice ("Referenced tracer ... freed") and the whole plot
  failed; per-feature outline widths and opacities on lines had the same fault.

- Bars that share a category stack by default: `Bar(x="region", y="sales", fill="product")`
  stacks each region's products from zero, in the order of the column fill (or color) names.
  They overlapped, each drawn from zero, which read as stacked but was not. `arrange="group"`
  sets them side by side, each fill value in the same slot of every category, and
  `arrange="overlap"` keeps the old drawing. A Bar with a `baseline` overlaps unless asked.
  One bar per category draws as before.

- Points, Prism and Text take `xOffset` and `yOffset`: a position offset in data units, so on a
  categorical axis a quarter band is 0.25 (grouped bars, dodged points). `offsetX` and
  `offsetY` remain pixel offsets.

- Histogram takes `brush`: a Shift-drag brushes an interval of the binned column, its rows are
  `@brushed` in every view of the data, and `respond="brushed"` fades the other bins. A
  crossfilter of histograms needs no hidden marks. `hmplot/compound`'s `composition` adds
  `Undescribed`, which leaves a helper part out of the plot's description.

- A Filter's `where` list may hold selections, as documented: `where=[brush_a, brush_b]` keeps
  the rows in both, and an inactive selection keeps every row, as one alone does. The list read
  each selection as a field named "undefined", and the scene failed to load with "Expected N
  numeric values for undefined." A condition Filter cannot read is now refused, naming the forms
  it takes and the value received.

- Bands and rules take plain ISO dates and date-times on a datetime axis: `"2024-03-01"` or
  `"2024-03-01T09:30"` is read in the axis's time zone (UTC by default), as an offset such as
  `"2024-03-01T12:00:00Z"` still says exactly when. A plain date was refused, and the whole plot
  failed to draw. The error for a value it cannot read now shows the accepted forms and the value.

- A continuous fill, color, size or width given as an expression, or with only a transform
  (`sizeTransform: "sqrt"`, `fillTransform: "log"`), takes its domain from its own values. Before,
  it kept the default domain of 0 to 1: every color saturated at one end, and a size such as a
  population drew each point large enough to fill the plot. A numeric fill or color expression is
  always mapped; a size or width expression is mapped when the mark gives a range, domain or
  transform, and otherwise stays pixels (`size=where("@hovered", 11, 5)`).

- `PlotSettings` (Plot's and Facet's `settings`) takes `showExport` and `menu` (Python
  `show_export` and `menu`), both default true. `showExport: false` hides the export button and
  the context menu's "Export…"; `menu: false` turns the plot's context menu off, so right-click
  shows the browser's own. A Facet's cells follow its flags. A read-only published plot sets
  `showTrigger`, `showExport` and `menu` to false; `openSettings()` and the export methods still
  work. Existing settings behave as before.

- `hmplot check` checks the plots a program exported when it leaves none behind: a script that
  builds and exports its plot inside `main()` reported that it "builds no plot".

- Axis and colorbar ticks are written as decimals: a log axis reads 10,000 and 100,000, not
  1e+4 and 1e+5 (as did any axis past 10,000). Thousands are grouped once a tick on the guide
  reaches 10,000, so a year axis still reads 2020. Size legends round to four significant
  digits the same way. Values under 0.0001 or from 10^15 keep an exponent. An axis's `format` and
  a mark's `legendTickFormat` still win.

- An exported HTML page or notebook opened from disk draws GeoJSON, Dodge and live
  VectorTile marks. Their workers, inlined as module workers, failed on a page with a `file://`
  origin, and the page kept its static preview. The bundles now inline them as classic workers.

- An exported HTML page of a 2D plot no longer warns in the console that `cameraFov`,
  `cameraNear` and `cameraFar` apply only to 3D plots: the export wrote those unused defaults
  into the page.

- A Line with `series` and a per-row `opacity` draws every series with its own opacity. The
  opacity column stayed in the ungrouped row order, so later series took other rows' opacity
  and the last one drew nothing.

- GPU memory no longer leaks on these paths: a Force graph with edges, on each topology
  update; a Force parameter or initial position given as an expression; a keyed Points update
  (one mask per update, and one reference per column its enter and exit both read); a Pie whose
  values are an expression; a Bin whose options fail validation; a nearby interaction in a
  facet cell whose rows changed; and a series grouped by a numeric column.

- Thick curved lines join their actual adjacent curve pieces, removing cracks at data points.
  Fast input changes allow pending curve geometry to draw before replacing it; appearance
  changes reuse subdivision, and 2D projections keep drawing while their subdivision updates.
  Axis overlays now update with completed canvas frames instead of running ahead of the marks.
  Settlement waits for those guides to publish, so PNG/SVG exports retain matching labels
  after completed or interrupted scale transitions.
  2D SVG exports of connected lines with varying widths use a compound outline, avoiding
  seams and repeated opacity at their joins.
- Small outlined 2D points use smooth alpha blending to avoid rough contrasting rims.
  HMPlot and Ink uncertainty ribbons again default to a translucent fill (20% opacity).
- Changing nested Frame ranges no longer stalls preparation through competing automatic
  axis defaults. Root theme margins and unauthored coordinate-aware guides stay automatic
  when scenes are mounted or exported to HTML.
- `hm.check(timeout=...)` now applies the requested preparation timeout during initial scene
  mounting as well as later settling. Large scenes on software WebGPU no longer hit an
  unrelated 30-second limit first.
- JavaScript connection-contract definitions can again be imported without renderer
  dependencies, keeping their Python parity checks usable in minimal installations.
- Orthographic globe dragging and wheel/pinch zoom anchor the rendered globe surface to the
  pointer, including visible points near a pole more than 90° in longitude from the view center. The
  camera's fitted radial extent no longer slows surface navigation. Navigation regressions now
  compare rendered pixel positions; older direction checks use gestures inside the actual disk.
- Live tiles align with point data on centered Equal Earth, Natural Earth and Albers maps,
  including after changing projections in settings. Unchanged tile slots retain their state
  objects during navigation, reducing unnecessary reactive updates.
- Scale contributions release once with their prepared mark, including canceled preparations.
- Procedural field writes report applied, superseded, disposed or failed outcomes; failed writes
  remain eligible for retry.
- Canceled brush gestures restore the navigation controls they disabled. Late tooltip reads
  cannot restore tooltip row membership after pointer leave, mark replacement or teardown.
- SVG/PDF export uses the current effective literal color after a settings edit while retaining
  numeric and categorical scale bindings. Mapped sizes and widths use the renderer's arithmetic,
  including inferred equal domains, reversed domains, nonlinear transforms and midpoints.
- Python Frame settings edits preserve grouped axis definitions and parent-coordinate ranges
  when replayed. Inherited Mapping channels do not become Plot axis settings.

- Closed settings panes unmount their controls and unsubscribe from the settings tree. Reopening
  restores the selected target, search, expanded sections and scroll position with current values.

- Scalar appearance expressions update uniforms or single-value GPU storage instead of
  expanding to one value per row. Zoom-dependent opacity no longer rebuilds unchanged mark
  geometry. Numeric colors keep their scale semantics, and scalar opacity stays separate from
  RGBA alpha, filtering and interaction feedback. Internal regression assertions now check those
  separate factors and host scalar results; the rendered composition is unchanged.
- Filter planning uses a mark's current allocation after normal growth, rather than treating
  `maxElements` as a permanent ceiling. Eligible filters reuse physical-row buffers and update
  membership; a narrow initial selection still uses compaction without allocating the full source.
  Export descriptions report the filtered count when physical rows stay allocated.

### Documentation

- Added three gallery examples, first in the gallery, with screen recordings in the README:
  - **Ten million stars, filtered live**: ten million stars of a spiral galaxy, generated on the
    GPU from a seed with `hmplot/jax` (nothing is downloaded), drawn as points with additive
    blending. Two sliders filter all ten million by age as they move (a Filter on two inputs), a
    histogram counts the kept stars, and the stars brighten as you zoom in (their opacity reads
    the visible x span). A Svelte program: a Python pair would send the rows.
  - **Mixing in a double gyre**: 45,000 particles in a classic model of ocean mixing, stepped by
    Simulate at the display's rate. A Shift-drag box drops dye into the running simulation (its
    update reads the brush), and a slider sets how much the eddies wobble and mix.
  - **A globe with streamed map tiles**: a live VectorTile on the orthographic globe, from the
    whole Pacific down to a city's streets, with every magnitude 4.5+ earthquake of 2024 on top
    and the tiles' credit in the corner.
- The gallery's paired examples keep what their earlier pages had: the Lorenz attractor's 3:2
  layout (the 3D orbit beside its projection and speed histogram, one column on a phone), its
  explanation and a working ρ slider (each point of the orbit moves on with the system at the
  chosen ρ, on the GPU, in Svelte and Python alike); the earthquakes' layout, explanation,
  depth-exaggeration slider and credits; the coordinated explorer's instructions and its large
  view beside the details; the time series' Detail control (adaptive extremes or every point);
  and the faceted histograms, normalization before faceting and extruded bins of Facets &
  transforms. A gallery page without WebGPU says the example needs it, and a page whose program
  has no pair shows its Python equivalent.
- Every curated gallery example is a Python and Svelte program pair now, 22 more of them: the
  page draws the Python program's scene, and "Edit in Python" runs it in Pyodide. Each keeps its
  guidance, layout, controls and data, except as noted:
  - Data shortcuts, Shared and independent scales, Signal and uncertainty (its New target button
    and Animate checkbox are inputs now), Violin plot, Twin coordinate frames, Brushing frame
    strips, Polar sunburst and Theme presets. Theme presets picks its preset from a "Theme preset"
    select of the 30 built-in themes (a Theme's value reads the select), in place of the grid of
    swatch buttons.
  - The calculated scatterplot matrix, the large calculated point cloud, the coordinated
    interaction dashboard, the interaction matrix, keyed updates under interaction, the
    scatterplot matrix and keyed enter and exit. Data steps that used to replace the rows are
    inputs now (a Rows select, a Frame slider and a Reverse checkbox, a button that steps through
    three keyed states). The large point cloud offers 10,000 or 100,000 rows (250,000 is left out
    to keep its download small), and the dashboard 256 or 1,024 (at 4,096 its hover label needed a
    texture larger than the device allows).
  - Force layout · 2D, Large force graph (64 to 10,000 nodes, 2D or 3D), Polar radius, Polar and
    tangent insets, Solar system, Earth relief and Manhattan building flyover. The solar system
    plays from a Date control with its orbits, labels, stars and glow switches; the Earth's imagery
    and the planets' textures travel as their image files; the flyover's Buildings select flies
    down to the streamed map tiles. What a scene cannot keep is listed in the TODO (69.10): the
    flyover draws 10,000 buildings (a constant in its programs) and no longer reports a clicked
    building, and the polar inset's slider no longer follows a drag of the globe.
- Guide navigation and runnable Python/Svelte pairs now come from Markdown front matter and
  inline fences. Public docs use the shared snapshot, source, tree, and Python editor component;
  examples refresh during development, and API-name links and source-line diagnostics are checked.
- Each component's reference page says what SVG and PDF exports do with it, in one kind of note
  ("SVG and PDF export": an image, partly an image, vector except in the cases it names, or left
  out), and the export guide lists everything that is not exported as vector, with the reason
  each still is.
- A reference page in one language shows its source from the other language's route too: a
  JavaScript-only page such as `initializePlot` opened from the Python reference showed an empty
  snippet; a Python-only component's example on a Svelte page no longer switches the page to
  Python. An example whose build is missing says so where its preview would be.
- The Arrows, Hexbin and Pack examples draw what they should: separate arrows (not a chain that
  read as a polyline), regular hexagons (`aspect="equal"`) and circles inside their parents.
- The docs site loads faster. Pages are prerendered with their prose, navigation, example source
  and a preview image, so they are readable before any script runs; a text page loads 82 KB of
  JavaScript instead of 1.7 MB. An example's live plot loads when it comes near the viewport, and
  only where WebGPU is available (elsewhere the preview stays). Large scenes preview as WebP
  images rather than megabytes of SVG (the Lorenz attractor's 6.7 MB preview is now 135 KB). On a
  10 Mbps connection with 80 ms latency, the Points page paints at 0.3 s instead of 2.8 s and shows
  its example's preview at 0.5 s instead of 3.0 s. The full-quality SVG exports are unchanged.
  Docs headings have ids, so links to sections work, and code blocks scroll on narrow screens.
- The home page's first plot is the Palmer penguins: bill length against bill depth, colored by
  species, with a legend, in a dozen lines of Svelte or Python (it was a four-point plot). The
  penguins' CSV comes with the example, so the Python editor runs it as shown.
- The home page has a gallery of eight examples, and the examples page shows every example as a
  card with a thumbnail of its chart, the additional ones grouped (marks, composition, maps, ...)
  and still searchable. Thumbnails are small WebP images made when the site is built (a few KB
  each, 34 KB at most), loaded lazily; a card never loads a live plot. `npm run build` makes them: an
  example with a Python program gets its thumbnail from the example build, a gallery program from
  `npm run build:thumbnails`, which draws it in Chrome with WebGPU and exports its plot.
- The docs' dev server keeps the examples and the gallery current without a restart, after a pull
  too: an example folder added while it runs is built, a page waiting for an example gets it next
  (also during a build of every example), and after the Python package changes, each example is
  built again when a page shows it. A gallery card without a thumbnail gets one in the background,
  one capture at a time on the running server, and shows it without a reload (until then, its
  tags). A build lock left by a killed build is taken over at once, not after ten minutes.
  `npm run build:thumbnails` works in a git worktree whose `node_modules` links to another
  checkout, and pre-bundles its dependencies in a cache of its own (it re-bundled those of a dev
  server running beside it).
- The Surface example draws a smooth bump sampled on a 41 x 41 grid; its 4 x 4 grid drew a
  coarse, kinked surface (a Surface draws the grid it is given, one vertex per value).
- Every function the package exports has a reference entry with its arguments, result and an
  example, found by the reference's search: the expression functions (`less_equal`, `is_in`,
  `coalesce`, `sin`, ...), the reductions, calendar functions and casts one row each, and pages
  for `fetchJSON`/`fetchCSV`/`fetchArrow`/`fetchParquet`, `typedColumn`, `zoomViewport` and
  `columnNames`/`categories`. The theme presets in `themes` are listed (30, not 4).
- A new "Package" section indexes the npm package's entry points (`hmplot/jax`, `/vite`,
  `/tiles`, `/video`, `/scene`, `/types` and the experimental `/compound`) with their
  stability, what each exports and how to use it.
- The Plot handle, transform handle, `selection` and `identity` pages list Python's own
  members, with their signatures, which ones need a displayed notebook view (`await`) and the
  synchronous `hm.export_*` functions for scripts; the JavaScript tables say which language
  they describe.
- The AxisDefinition, DictionaryColumn, DocumentExportOptions and mark options pages explain
  when to use them and their constraints, with links to complete examples.
- The Manhattan flyover's buildings file holds the 10,000 footprints the example draws (4.2 MB;
  it held all 45,194, 19 MB), so "Edit in Python" downloads a fifth as much.
  `scripts/build-manhattan-buildings.py --all` writes all of them from NYC Open Data's pages.
- `CITATION.cff` says how to cite HMPlot.
- The Pie page's legend snippet spells the Svelte prop `for` (`<Legend for={pie}>`); it said
  `target`, which is Python's keyword (`hm.Legend(target=pie)`). The scales guide names a Plot's
  or Frame's axes, not the old Axes component.
- **animate() or tween():** the animation docs (docs/ANIMATION.md, the animate reference page and
  the guide's Motion section) say which space each interpolates in: `animate()` in scale space
  (what the scale draws: by equal ratios on a log axis), `tween()` in data space (the value
  itself), when to use which, and that `animation` on a mark is `animate()` on every channel. The
  animate page's example, in Svelte and Python, moves one point of each from 1 to 1000 on a log
  axis.
- The interaction guide compares hover (the row exactly under the pointer), nearest (the row a
  tooltip shows) and nearby (every row within a radius in data space).
- **The docs as plain text.** The docs site serves every guide, reference and example page as
  Markdown beside its HTML (its address plus `.md`, such as `/reference/python/points.md`; each
  page links its Markdown), `/llms.txt` (one line per page), `/llms-full.txt` (every guide and
  reference page in one file) and `/reference/api.md` (every component's Python signature and
  Svelte props on one page, from the Python package's registry and signatures). They are built
  from the same sources as the HTML pages.
- **An agent skill.** `skills/hmplot/SKILL.md` describes when HMPlot fits, how a scene is built,
  the common mistakes and how to check a plot, with twelve tested programs (`patterns.md`); the
  repository is a Claude Code plugin and its marketplace (`/plugin marketplace add hmplot/hmplot`,
  then `/plugin install hmplot@hmplot`).

### JavaScript (Svelte 5)

- **Plots:** `Plot` draws 2D and 3D charts on WebGPU, filling its container's width, 400px
  tall, as in Python (`width` fixes it). Its `x`, `y` and `z` define the axes
  (domain, range, transform, scale, label, ticks, grid, datetime and calendar axes, breaks);
  `Frame` nests coordinate frames: Cartesian, polar and spherical, with map projections.
- **Antialiasing:** a Plot's `antialias` (in Python, `antialias=`) is `"msaa"` (4x, the
  default), `"smaa"` or `"off"`; exports always use 4x MSAA. Without MSAA, `Rect`, `Histogram`,
  `Bar` and `BoxPlot` fills compute their edges in the shader, as points and lines do, so they
  stay smooth (side-by-side bars leave no seam), and a rectangle thinner than a pixel still
  shows. Other filled marks (Area, polar sectors, hexagons, 3D) need MSAA for smooth edges.
- **Marks:** `Points`, `Points3D`, `Line`, `Segments`, `Arrows`, `Arrows3D`, `Area`, `Ribbon`,
  `ErrorBars`, `Rect`, `Prism`, `Polygon`, `Heatmap`, `Image`, `Surface`, `Text`, `Text3D`
  (with TeX), `GeoJSON`, `GeoJSONLine`, `VectorTile` and `Anchor`; and the compound marks
  `Histogram`, `Bar`, `BoxPlot`, `Violin`, `Swarm`, `Lollipop`, `Pie`, `RuleX`, `RuleY`,
  `Crosshair`, `Callout`, `Smooth`, `Ecdf` and `DensityContour`.
- **Data:** `Data` and `Provider` (`fetchJSON`, `fetchCSV`, `fetchArrow`, `fetchParquet`);
  tables with schemas and typed columns, grid tables, times as data (a `schema` entry for a
  column that is already a time, such as Python's, keeps its dates).
- **Transforms,** on the GPU through jax-js: `Bin`, `Hexbin`, `Group`, `Filter`, `Sort`,
  `Shuffle`, `Sample`, `Normalize`, `Stack`, `Window`, `Dodge`, `Density`, `Interpolate`,
  `Slice`, `Pivot`, `Fold`, `Join`, `JoinAggregate`, `Quantile`, `Summary`, `Regression`,
  `ECDF`, `Contour`, `Delaunay`, `Voronoi`, `Hull`, `Calculate` and `Partition`; graph layouts
  `Force`, `Tree`, `Graph`, `DAG`, `Pack`, `Treemap` and `Sankey`, drawn through `Nodes`,
  `Edges`, `Flow` and `Routes`.
- **Expressions:** `col`, `input` and `view` name columns, inputs and view state; arithmetic,
  reductions, calendar functions and casts (`as_datetime`, ...); `animate`, `tween` and `@time`.
- **Scales and appearance:** per-channel scale props (`fillDomain`, `sizeRange`, `colormap`,
  ...) and shared scale resources (`continuous`, `ordinal`, `categorical`, `normalization`);
  `Legend`; `Theme`, `createTheme` and the presets in `themes`; `registerShape`.
- **Sky, glow and fog:** `Sky` puts an image (a star map) or a zenith-horizon-ground gradient
  behind a 3D plot; a mark's `glow` makes it bloom, tuned by `Bloom` (`strength`, `radius`);
  a 3D Plot's `fog={{ near, far, color }}` fades distant geometry; a spherical Frame's
  `atmosphere` draws a glowing rim around its globe. Sky, glow and fog are composited after the
  scene is drawn, so picking, the minimap and auto bounds never see them, and plots without them
  render as before. PNG exports include them. In SVG and PDF exports such a plot (the
  atmosphere's too) is one image: all its marks, with the effect, while its axes, titles and
  legends stay vector; `mode: "vector"` refuses it, naming the effect.
- **Vector tiles under a 3D flyover:** in a 3D plot with `cameraMode="flyover"`, a
  `VectorTile` in a local plane (`origin`, `unitsPerMeter`, `plane="xz"`) is a flat basemap on
  the ground that streams the tiles around the camera, at a zoom from its height, and stands
  their buildings up from their height tags (`extrudeBuildings`, default true, "3D buildings" in
  the settings pane; Python `extrude_buildings`): VersaTiles' zoom-14 buildings, `height` over
  `min_height` in meters, 5 m without a height, flat roofs, shaded without lights. `false` draws
  flat footprints. The basemap draws before the plot's 3D marks without depth, so its parts
  keep their order on one plane, and a ground plane gives buildings, other marks and fog its
  depth; a click on a building picks the building. 2D maps are unchanged and always flat.
- **Flyover momentum:** a flyover ground drag released while moving glides on for a moment and
  slows to a stop (`flyoverMomentum`, default true, "Flyover momentum" in the settings pane;
  Python `flyover_momentum`). Height and direction stay; a drag held still before release, any
  new input, reduced motion and `flyoverMomentum={false}` stop on release; `whenSettled()` and
  exports wait for a glide.
- **Interaction:** selection, brushing, hover, nearby picking, tooltips, dragging rows (offsets),
  `Interaction`, linked viewports, `Minimap` and the settings pane. `Line`, `Area` and `Ribbon`
  hover, select and brush whole series (see Changed).
- **Nearest:** `nearest` on a mark (or a Plot, for its marks) marks the row a tooltip shows as
  `@nearest`, without the box: the row under the pointer, else the nearest drawn row of the mark
  within `radius` CSS pixels (default the tooltip's, else 16), so a small point or a 1 px line is
  easy to reach; a whole series for `Line`, `Area` and `Ribbon`. `nearest={selection}` or
  `{ selection, radius }` writes it elsewhere, `respond="nearest"` fades the other rows, and
  `@any_nearest` is 1 on every row while one is nearest. A mark with a tooltip sets `@nearest` to
  the row its box shows, so the two always agree.
- **Inputs:** `InputContext`, `Slider`, `Checkbox`, `Button`, `Select`, `MultiSelect` and
  `Playback`; `Simulate` steps per-row state.
- **Types:** each component's props type (`PointsProps`, `LineProps`, `DataProps`, ...) declares
  the options it takes and leaves out the ones it would ignore (a `Pie` has no `sizeScale`).
- **Composition:** `Facet` (rows, columns, fields and pairs), `Mapping`, `Title`, and
  connections between marks (`connect`).
- **Export:** PNG, SVG, PDF and HTML from every Plot and Facet; a Plot's animation as an MP4
  encoded in the browser (`exportVideo()`, from `hmplot/video`).
- **Subpaths:** `hmplot/jax` (the bundled jax-js), `hmplot/tiles` (vector-tile helpers),
  `hmplot/video` (the browser's video encoder), `hmplot/vite`, `hmplot/types`, `hmplot/scene`,
  and the experimental `hmplot/compound`. In `hmplot/scene`, `runtime.snapshot` (`{ src, alt,
width, height, note }`) shows a static image in the scene's place, as the notebook widget does
  without WebGPU.
- **Image files:** `Image`'s `data` may be an image file instead of pixel values: a URL, a Blob,
  an ImageBitmap, or an image or canvas element, which the browser decodes once (RGB, or RGBA
  when a pixel is not opaque); the plot waits for it. `Sky`'s `visible={false}` hides the sky
  and keeps its image loaded, for a switch.

### Python

- `import hmplot as hm`: the same components with snake_case keywords, in Jupyter and in
  standalone HTML, from NumPy, pandas, Polars and xarray (NetCDF grid tables).
- Layout: `Scene`, `Row`, `Column`, `Grid`, `Controls`, `Title`, `Markdown`, `Template` and the
  lights. `hm.Row(widths=[3, 2])` gives each child its share of the row at every width; with
  `wrap=True` and `min_width` the row stacks once its narrowest share would be narrower than
  `min_width` (a 3:2 dashboard that becomes one column on a phone).
- Inputs and view state sync both ways; `on_event` callbacks; `update()` and `batch_update()`.
- `hm.Sky` and `hm.Bloom` inside a Plot, `glow=` on every mark, `hm.Plot(fog={...})` and
  `hm.Frame(atmosphere=...)`, as in Svelte. A Sky's image is a URL, or a file path, bytes or a
  PIL image sent to the browser in its own encoding (a JPEG stays a JPEG), not as pixels.
  `hm.Image(data=...)` takes an image file the same way, and `hm.Sky(visible=hm.input.stars)`
  switches the sky.
- A prop that takes a plain value may be an expression of inputs, evaluated in the browser when
  an input changes: a Frame's `placement` turned by a Playback
  (`{"anchor": [8 * hm.cos(hm.input.day / 58), 0, 0], ...}`), a Force's
  `dimensions=hm.where(hm.input.view == hm.literal("3d"), 3, 2)`, a light's intensity,
  `camera_position`, `fog` distances, `glow`, `visible`. Channels and transform expressions stay
  expressions, read from uniforms.
- Each component's docstring gives every keyword a sentence, with its default and units; a
  keyword the component would ignore raises (`hm.Points(curve=...)`).
- Typed stubs: every keyword a component takes, so editors complete them and type checkers
  check them.
- Exports (`export_png`, `export_svg`, `export_pdf`, `export_html`, `export_mp4`) with nothing
  else to install: they draw in an installed Chrome, Edge or Chromium, or in Chrome for Testing,
  downloaded once (`hmplot install-chrome` ahead of time), on the GPU or, without one, on
  SwiftShader; MP4s through imageio-ffmpeg's ffmpeg or the browser's encoder.
- `visualize_tree` draws a component tree with the library's own marks: each node colored by its
  component's group, with a tooltip, and hovering highlights its path to the root and its
  subtree.
- `nearest=` on marks and Plot (`True`, a `hm.selection()`, or `{"selection", "radius"}`),
  `hm.view.nearest` and `hm.view.any_nearest`, and `table.nearest` (a node's `nearest` reaches its
  data's), as in Svelte.
- **A notebook without WebGPU shows a static image** of the scene where it showed only "WebGPU
  backend is unavailable": the kernel draws it in the headless Chrome the exports use, at the
  view's width, all of a scene's plots in one image, labeled as static, with the plots'
  descriptions as alt text, and draws it again after each update. With no Chrome where the
  kernel runs, the output shows the error and what to install; nothing is downloaded. A lost GPU
  device is reported as before (reload the page). `HMPLOT_NOTEBOOK_SVG=1` in the kernel's
  environment also puts the scene's SVG in each display's output, for viewers without the widget
  (GitHub, nbviewer, notebooks exported to HTML); it is off by default, since each display then
  takes a headless render.
- **`hm.check(plot)` and `hmplot check plot.py`** draw a plot headlessly, in the exports' Chrome,
  and say what it drew: the errors (Python's validation and each error the browser showed), each
  plot's marks with their row counts and columns, its axes' ranges, size and description,
  warnings (marks that drew no rows, what SVG and PDF exports draw as images) and a PNG.
  `str(result)` is a summary; `hmplot check` (also `python -m hmplot check`) runs a program as a
  notebook cell runs, checks the plot it ends with, saves `plot.check.png`, prints the summary or
  JSON (`--json`) and exits with 1 on errors.
- Every public name in the stubs has a docstring with a short example: each component's is its
  reference page's program, and the functions, resources and expression functions have their
  own.

### Changed

Since the preview builds:

- **A literal Points size is the point's diameter in CSS pixels**, as a size column mapped
  through `sizeRange` always was: `size={10}` draws points 10 pixels across (it drew them 5
  across), and so do unscaled per-row sizes, expressions and categorical size ranges. The
  defaults are halved, so default points look as they did: Points 6 (was 12), Lollipop's heads
  5 (was 10), BoxPlot's `outlierSize` 2.5 (was 5), and each built-in theme's
  `marks.Points.size`. To keep a plot's look, halve its literal Points, Swarm and Lollipop sizes
  (and a theme's `marks.Points.size`); the gallery's and the docs' examples are. `sizeUnits="data"`,
  Points3D, Text, GeoJSON and VectorTile sizes are unchanged; SVG, PDF and PNG exports follow.
- **Dashes are CSS pixels along the drawn path**, as the docs said (they were measured in world
  units, so a dash's length on screen depended on the plot's size, its direction and the zoom):
  `dash={[8, 4]}` on a Line, Segments, RuleX, RuleY or Routes draws 8-pixel dashes and 4-pixel
  gaps along x and y alike, whatever the zoom or the frame chain (log axes, polar and map frames,
  3D views), and a dashed Line's pattern runs on across its vertices and starts over where its
  path breaks. `dash={true}` draws 4-pixel dashes and gaps (it was 1 world unit). SVG and PDF
  exports draw each run as one path with the pattern as its `stroke-dasharray`. A dashed Line now
  fits per-row color, width and opacity together (its dash distances no longer take a vertex
  buffer); a sampled Line's dashes start over at each drawn segment.
- **A missing value in a colormapped fill or color draws in a missing color**, not the
  colormap's end color: NaN, `null` or `None` in the column draws in the scale's new `missing`
  (`continuous({ missing: "#cccccc" })`, `hm.continuous(missing=...)`, cleared with
  `update({ missing: null })`), else the theme's new `missing` color, a neutral gray (`#92989f`)
  that reads on light and dark backgrounds. SVG, PDF and PNG exports draw it too, and a colorbar
  whose mark holds a missing value shows a "Missing" swatch in it. A GeoJSON's features without a
  value (no joined row, or NaN) follow the same color unless it sets `missingColor` (whose default
  was `#b8bdc2`). A value outside a transform's domain is still not drawn.
- **The export browser's local server answers only under a per-session token.** The loopback
  server that gives the headless Chrome its page and runtime served any request to its port; it
  now answers only under a random path in its URL, so another user or process on the machine
  that finds the port gets nothing. SECURITY.md and docs/DOCUMENT-EXPORT.md ("The export
  browser") now say what the export browser may do: its WebGPU and SwiftShader flags, the remote
  URLs it loads for a scene, when its sandbox is off, and that Chrome's DevTools port on
  127.0.0.1 has no token.
- **The license is MIT** (it was ISC): "Copyright (c) 2026 Gabe Hope and contributors". Both
  packages ship `THIRD_PARTY_NOTICES.md`, which lists the code bundled into the Python package's
  notebook and export bundles with their license texts, the fonts (Source Sans 3, MathJax's and
  three.js's) and the data the examples use, each with its license and the credit it asks for.
- **Building the Python package from a source checkout needs Node.js.** The notebook and export
  bundles (`hmplot/static/widget.js` and `standalone.js`) are no longer kept in the repository:
  `pip install ./python` or `python -m build python` runs `npm run build:python` when they are
  missing (after `npm ci` in the repository root). Wheels and sdists carry them, so
  `pip install hmplot` needs no Node.
- **Static previews say so, and fade into the live plot.** A docs example's preview and an
  exported HTML page's snapshot carry a small "Static preview" label in their top right corner,
  in the plot's own colors, with a pulsing dot while the interactive plot loads; a status tells
  screen readers, then says "Interactive plot". Once the live plot has drawn, the preview fades
  out over it in a quarter of a second, with no change in size or position (at once under
  `prefers-reduced-motion`). Without WebGPU the preview stays and its label says "Static · no
  WebGPU" (the status says "Static preview: this browser has no WebGPU"); an exported page no
  longer adds a note below its snapshot, since the label says it. The label belongs to the page:
  exported files, thumbnails and the snapshot's SVG never contain it.
- **The keyed-update effects are `enterEffect` and `exitEffect`.** `enter="fade"` and
  `exit="fade"` on a mark or an Anchor are now `enterEffect="fade"` and `exitEffect="fade"`
  (Python `enter_effect="fade"`, `exit_effect="fade"`; the same values, "fade", `true` or
  `{effect, duration, easing}`), so they no longer share their names with `animate()`'s `enter`
  and `exit` options, the values a channel starts from and ends at, which keep theirs.
- **Hover's state is `@hovered`.** The row under the pointer was `@highlighted`; it is now named
  after its prop, as `@selected`, `@brushed`, `@nearby` and `@nearest` are. `@highlighted` is now
  `@hovered`, `@any_highlighted` is `@any_hovered`, and `respond="highlighted"` (or its alias
  `"highlight"`) is `respond="hovered"` (`"hover"` still works). In Python, `hm.view.highlighted`
  is `hm.view.hovered`, `hm.view.any_highlighted` is `hm.view.any_hovered`, and `hm.STATE_NAMES`
  lists `hovered`. The old spellings have no alias: an expression that reads `"@highlighted"`
  fails with the list of state names, and `respond="highlighted"` fades nothing.
- **Hover is the exact pick on a mark with a tooltip too.** Hover, clicks (`select`) and pointer
  handlers on such a mark took the tooltip's tolerant row (the nearest within its radius); they
  now take the row exactly under the pointer, as on every other mark. The tooltip's row is
  `@nearest`: read it for emphasis that follows the box (`size={where("@nearest", 10, 5)}`).
  `visualize_tree` highlights its path from `@nearest`.

- **A Simulate respects reduced motion.** Under `prefers-reduced-motion` a `Simulate` that runs
  from the start stays at its first state until its `running` changes (a Checkbox the reader
  ticks), as a Playback's autoplay does; `setAnimationTime` still steps it. Exports at rest show
  that first state rather than wherever the simulation had run to.
- **Axes with breaks pick coarser automatic ticks.** A break gathers the times inside it at its
  end, so an interval suited to the axis's span could label every session's open with the same
  time (a market-hours axis read "09:30" across its width); automatic ticks on an axis with
  `breaks` now step to coarser intervals until they are about as many as the axis asks for.
- **Rounder 3D spheres and arrows.** A `Points3D` sphere is an icosahedron divided 3 times by
  default (320 triangles), not once (80): its outline stays within about 1% of a circle, where
  it was a visible polygon. A `detail` set above the mark (a Plot's mark defaults in the settings
  pane) now reaches its Points3D, which set 1 over it, and a reset returns to 3; `detail` on the
  mark works as before (0 to 4). Past about 100,000 spheres a `detail` of 1 or 2 keeps 60 frames a
  second (docs/PERFORMANCE.md). `Arrows3D` shafts and heads have 24 and 32 sides (12 and 16).
- **3D marks take the theme's colors.** A `Points3D` with no `fill` draws the theme's Points
  fill (#4c78a8 in the default theme), not bright green; an `Arrows3D` with no `color` the
  theme's Arrows color (it was #4682b4), and a `Text3D` the theme's Text color (it was #30374a,
  hard to read on a dark theme). Only the color carries over, not a Points symbol, size or
  outline; a theme's own `marks.Points3D`, `Arrows3D` or `Text3D` entry wins, a mark's props and
  Mappings win over both, and a theme changed after mount recolors them.
- **Rects, bars, histograms and prisms take the theme's color.** A `Rect`, `Bar`, `Histogram`
  or `Prism` with no `fill` draws the theme's first palette color (#4c78a8 in the default theme,
  #60a5fa in Dark), not #547ba2 under every theme; the palette's first color stands out on the
  background in all 30 presets. A theme's `marks.default` fill or its own entry for the mark
  (`marks.Rect`, which a Histogram's bars take too, `marks.Prism`, `marks.Bar`,
  `marks.Histogram`) wins, a mark's `fill` and a Mapping's win over the theme, and a theme
  changed after mount recolors them.
- **A Plot's and a Facet's automatic legend explains the encodings.** `legend` (Python
  `legend=True`) showed only the labeled marks, so a plot whose marks were colored by a column but
  unlabeled showed an empty legend; it now draws what a `Legend` without a channel draws: a guide
  for each channel the marks map from data (a fill column's categories, a colorbar, a size ramp),
  then the labeled marks. The themes example's legend lists North, Central and South before
  Trend and Observations; the gallery's Partition densities, gridded globe, Hovmöller and smooth
  examples show the legends they ask for. A plot that also has a `<Legend channel=...>` for the
  same channel now shows that encoding twice: drop one of them.
- **Hover fades nothing by itself.** `hover` marks the row under the pointer as `@hovered`,
  and a mark's `respond`, omitted, is now the states it sets except hover, so the other rows no
  longer fade while the pointer rests on one. Ask for the fade with `respond="hovered"` (or
  `respond={true}`), or draw the emphasis from the state: `width={where("@hovered", 2, 1)}`.
  Pie's labels and Lollipop's stems follow their marks. Select, brush and nearby still fade the
  other rows by default.
- **Lines interact by series.** `Line`, `Area` and `Ribbon` (so `Ecdf` too) hover and select
  a whole series, every row of its `series` value (the whole mark without `series`), not the row
  under the pointer; Shift-click toggles a series. They can now `brush` (Python `brush=True`): a
  brush takes every series with a row inside it (a Ribbon brushes along x). Tooltips still show
  the row at the pointer.
- **A width of literals is pixels.** `width={where("@hovered", 2, 1)}` on `Line`,
  `Segments` and `Arrows3D` draws 2 and 1 pixels, as `width={2}` does; it went through the
  width scale and drew lines about 20 and 40 pixels wide. Widths that read a column keep their
  scale.
- **A Legend without a channel explains the plot's encodings:** every channel its marks map
  from data, categorical or continuous (a Line colored by city lists the cities in their
  colors), then the labeled marks as before. It was empty when no mark had a label. The Plot's
  and Facet's `legend` still list the labeled marks.
- **An Interaction's columns can be read.** `Filter where="@focus"` and expressions such as
  `where("@focus", 16, 8)` read the column an `Interaction columns={{"@focus": sel}}` names, as
  they read `@selected`; they were refused as unknown state names, in Svelte and Python. An
  Interaction's column names must now start with `@` (`"@focus"`, not `"focus"`), and an `@`
  name that is neither state nor such a column is an error listing both.
- **`fill="transparent"` on Points draws a hollow point**, its outline alone (`outlineColor`,
  `outlineWidth`), over whatever is behind it, as its SVG export already did; it drew white. A
  color with an alpha anywhere else (`rgba(...)`, `"#rrggbbaa"`, `"transparent"`) is an error
  that points to `opacity`: colors are drawn opaque, and the alpha was dropped.
- **A column of categories makes a band axis** even without a type, such as a transform's group
  keys: a `Violin` over a text column no longer needs an explicit categorical scale.
- **`aspect="equal"` keeps one data unit the same length on x and y.** It kept world units
  equal, and a Cartesian plot stretches its bounds onto a 100 x 100 world box, so data units
  were not (a Pack's children escaped their parents; Hexbin's cells stretched). Polar plots and
  maps are unchanged.
- **Automatic domains hold what marks draw.** An Area's baseline (0 by default) bounds its y
  axis, so the fill no longer runs below the plot; a Points mark with `sizeUnits="data"` bounds
  the axes with its whole disk (y too under `aspect="equal"`); an empty Filter's mark no longer
  widens its plot to 0. An Area that crosses its baseline turns at the crossing (its fill
  overlapped itself there), and on a log or sqrt axis a band's value outside the axis's domain
  is missing, as on other marks, while an Area's baseline there is an error saying what to pass.
- **Exports:** an Arrows shaft stops at its head in SVG and PDF (it ran under the head to the
  tip, its round cap past it); messages and reports name marks by their component, not by a
  minified class name ("hdA was rasterized"); a Scene's export warns that it leaves out a
  Minimap of a 3D plot. A rule spanning the visible domain follows the plot's new automatic
  bounds (a Python export could draw it across the default bounds' view).
- **Arrows3D sizes are world units, in 2D and 3D plots.** A curved Arrows3D (a `curve`, or in a
  polar, map or globe frame) was sized in pixels (in 2D, device pixels, so they halved at a device
  pixel ratio of 2), a straight one in world units; both are world units now, and SVG and PDF
  exports draw each arrow's outline in world units. On a map a world unit is the projection's (a
  flat map is 2π across): give such arrows sizes in those units.
- **GeoJSON colors by number, and GeoJSONLine by category or number.** A numeric `fill` or line
  `color` maps through `fillDomain` or `colorDomain`, else the values' extent, with the
  `colormap` and `fillScale`/`colorScale`; it mapped through [0, 1] and these props were ignored.
  A `GeoJSONLine` `color` column, which threw (a polygon's boundary too), colors each feature by
  its category or maps its numbers the same way.
- **GeoJSON heights map through `heightDomain`.** A GeoJSON's `height` maps from `heightDomain`
  (Python `height_domain`) onto `heightRange`, as documented; the prop was ignored and heights
  mapped through [0, 1], so a population column raised every country to full height. The
  gallery's extruded globe and projected map raise each country by its population again, and the
  Manhattan flyover's buildings stand at the exaggeration its slider shows (they drew twice as
  tall, and the tallest were cut off).
- **`as` renames once.** `Fold`, `Quantile`, `Summary` and `Density` named their outputs by
  `as` and were renamed again, so an output renamed to another output's name (Fold's
  `as={{ key: "value", value: "amount" }}`) lost a column.
- **`axis` is not a prop of Area, Ribbon or ErrorBars:** a stray one no longer turns them
  (ErrorBars turn by `orientation`). **Text3D's `x`, `y` and `z`**, which it ignored, are an
  error: it draws one label at `position`; use Text for text at each row.
- **A Line, Area or Ribbon groups its `series` by a numeric column**; it failed with
  "scope.resolve is not a function".
- **A Density inside a Plot leaves the plot's axes to its marks:** its grid set the plot's bounds
  and raced the marks' automatic domains, so a DensityContour's axes could change from one
  drawing to the next (its Svelte and Python examples differed).
- **Vector export:** SVG and PDF draw more 2D marks as vectors, in the colors the GPU
  draws: a `fill` or `color` column of numbers (through its scale and colormap: points by
  value, a Pie or Treemap by value, DensityContour's levels) or of categories (Line, Segments,
  Arrows, Arrows3D, Area, Ribbon, ErrorBars, Text, Rect, Bar, Prism, GeoJSON boundaries, and
  BoxPlot, Violin, Ecdf, RuleX, RuleY); `dash` (`stroke-dasharray`, a dash pattern in PDF);
  `curve="basis"`, curves on maps and curved Arrows and Arrows3D; connectors to points Dodge
  or Swarm displaced; a band, Rect or sector across a map's seam (a piece on each side). Lines
  export as polylines with the GPU's miter joins. They were images before; what still is (3D
  views, additive blending, Heatmap, Image, Surface, ...) is listed in the export guide. Fixed
  on the way: a Pie or polar Rect filled by a column of numbers exported white sectors, curved
  Arrows exported straight and too wide, straight Arrows3D too thin, and a point's vertical
  pixel offset (Dodge's, Swarm's) went the wrong way.
- **Vector export of 3D plots:** a 3D scatter, line or labeled plot exports to SVG and
  PDF as vectors, not one image. When every mark in a 3D view is a 2D mark (Points, Text, Line,
  Segments, Arrows, ErrorBars, Area, Ribbon, flat Rects, Histograms, Bars and BoxPlot boxes, Polygon,
  unlit, not on a globe or in a polar frame), each is projected through the plot's camera, cut
  at its near and far planes, and all of them are drawn back to front by depth, lines and fills
  in short pieces so that a line passing in front of another is ordered piece by piece; marks
  on one plane keep their drawing order. Where marks intersect or cross closely, which one is in
  front is approximate, and the export report says so. A 3D view with any other mark (Points3D,
  Arrows3D, Text3D, Surface, a Prism, an extruded Rect, Heatmap, Image, a lit or additive mark)
  still exports all its marks as one image, with a warning naming the mark, and
  `mode="vector"` refuses it naming the mark.
- **Live vector tiles are smoother and lighter.** Panning and zooming no longer draw a picking
  pass for marks that only take clicks (a live VectorTile's tiles, `onclick` on a mark): a click
  waits for one frame that draws it. A first zoom out and back over dense city tiles completed
  about 220 frames in 4 s instead of 175 in the dev server, with no long tasks, and a production
  build held 60 frames a second. A change of colors, widths or sizes in `styles` repaints the
  tiles on screen without preparing them again. The tiles' GPU memory after a session of panning
  and zooming fell by more than half, within budgets for idle tiles and caches; zooming in, a
  level stays a little past half-way, so a zoom that wavers there no longer switches levels
  back and forth; while the view pans, the tiles ahead of it load. Fixed on the way: a view
  of a large region at a deep zoom took over half a second to select its tiles, and the whole
  world at zoom 14 threw; a tile the view left while it was being prepared could keep a slot.
- **Dragging a Force node draws every frame, and a running layout keeps running.** A drag
  applies the pointer's latest position once per display frame. With pointer events faster than
  the display (a 120 Hz mouse) it published every move, and the plot could draw a few frames a
  second, with pauses of up to a second; a running layout all but stopped while a node was held.
  Now each frame of a running layout's drag applies the move, ticks and draws once. A 2.5 s drag
  at 120 moves a second drew 149-150 of 150 frames (13-148 before) and the layout ticked 150
  times (0-8). A release ends at the last position even when it was not drawn yet (it could stop
  a move short), and `whenSettled()` and exports wait for a move still waiting for its frame.
- **3D vector tiles and the Manhattan flyover.** Under a flyover camera with a local plane a
  `VectorTile` is now live by default (its tiles follow the camera) and draws flat on the ground
  plane with its buildings standing, instead of its requested tiles each part a meter below the
  next; pass `live={false}` for the requested tiles alone and `extrudeBuildings={false}` (or
  `styles.buildings=false`) for flat buildings. The gallery's Manhattan flyover keeps its
  bundled tiles with `live={false}` and can stream VersaTiles' tiles with their own buildings.
- **HTML exports keep a 3D plot's camera,** as they keep a 2D plot's viewport: the page opens on
  the exported view. Fixed on the way: an exported Plot's axes lost their `range` (a 3D plot
  with an explicit z range reopened with its ground elsewhere).
- **A drag press cancelled while it is picked is given back.** Escape or a pointercancel before
  the press's pick returned was ignored: the late pick then turned the plot's pan and zoom off
  and blocked every later press on the canvas.
- **Python durations keep their values.** A `timedelta64` (or pandas, Polars or Arrow duration)
  column of 5 and 10 seconds is 5000 and 10000 milliseconds on an axis and in expressions, as a
  JavaScript duration column is; it counted from its first row (0 and 5000), so it drew shifted
  and its arithmetic depended on the row order.
- **Python integers keep their sign, range and missing rows.** A uint64 column travels as uint64
  (values at or above 2^63 wrapped to negative numbers), -2^63 is a value (it read as missing),
  and missing rows (pandas `NA`, Arrow and Polars nulls, NumPy masked arrays) travel as a mask
  beside the values. Keys, joins and identities match the exact values, uint64 above 2^63 and
  int64 past 2^24 included (an identity's keys were the GPU's float32 copy); positions and colors
  still draw a float32 copy.
- **NumPy times arrive in units the browser reads.** A `datetime64[D]` column was read as
  milliseconds (consecutive days 1 ms apart, near 1970); days, weeks, months and years now
  convert to days by the calendar, and units finer than nanoseconds to nanoseconds. A duration
  in months or years, a conversion that would overflow, a time beyond JavaScript's date range,
  a schema `unit` other than ns, us, ms, s, m, h or d (or `D`), and a fraction of a schema's
  unit are errors naming the fix; the browser refuses a unit it has no conversion for instead of
  reading it as milliseconds. A tz-aware pandas column keeps its dtype's unit (pandas 3 stores
  microseconds, which were sent as nanoseconds).
- **An HTML page Python builds keeps an identity's keys.** `hm.export_html(..., snapshot=False)`,
  and the page built when no browser is available, left out the key column of an
  `hm.identity(keys=...)` that no mark read, so the page failed to start ("identity requires
  keys"). They now keep every resource the exported part needs, as the browser's export does.
- **Joins on several key columns match the whole tuple.** A text key holding a NUL character and
  a kind tag could make two different tuples one key, so a Join (and Nodes `data=`, GeoJSON's
  key join) attached another row's columns, or refused a valid joined table as having a repeated
  key. Each part is now encoded with its length.
- **Providers share a load only when the requests are the same.** Two Providers fetching one URL
  shared one in-flight load even when their `init` differed (an `Authorization` header,
  credentials, a POST body), so both showed the first one's response. A fetch source with
  `init` now shares only with itself; a url function shares with itself only under the same
  format, path and columns; and loads share under one `schema` only, whatever the source.
- **Hiding a BoxPlot or a Smooth hides all of it.** `visible={false}` (Python `visible=False`),
  its legend entry or its mark's options hid only the box (its whiskers, median and outliers
  stayed) or only the fitted line (its band stayed); every part now follows, and comes back with
  it.

### Removed

- **The `AggregateHit` and `SurfacePointerEvent` types.** No component, event or handle gave or
  took either of them; a Surface's pointer events are the marks' pointer events.

### Fixed

- **Python plots honor an explicit width.** `Plot(width=850)` keeps that width unless
  `responsive=True` is set. Plots without a width fill their container, and setting a width
  later also works for standalone marks' implicit plots.
- **Channel legends follow a theme change.** A legend of one channel (`<Legend channel="fill">`)
  kept the first theme's font, size and text color when the theme changed after mount (its
  swatches and labels followed); its text now follows the theme, in exports too.
- **Error messages say what to pass instead.** A column type's error lists the types (it printed
  only "Invalid logical column schema"), a table's columns of different lengths give each
  length, a missing key column lists the columns, a repeated key names it, an unknown event
  lists the events, a non-component child or a `with` block on a mark says where it goes, a
  reference to a component outside the scene names the keyword, `animate()` in arithmetic says to
  animate the whole expression, and a missing column suggests the nearest one or lists them.
  The same for a colormap's unknown keys, a categorical scale's repeated category, a Facet's
  `wrap`, a fill range that is not colors, a Rect with only one of z0 and z1, a position with x but
  not y, a selection updated without its data, a Sankey's self-loop or crowded `nodePadding`, a
  Pack node column named `r`, and a curve the mark does not draw (the error lists those it does).
- **The Python stubs match the package.** They declared `hm.state` (now `hm.view`), whose import
  failed in type checkers, and `PlotScope`, `Axes`, `Axis` and `Pairs`, which no longer exist; and
  lacked `hm.view`, `hm.typed_column` (declared as `column`) and `hm.linkage_table`. A keyword doc
  with a backslash (Title's `"\n"`) broke the docstring it was in.
- **A live VectorTile's exports no longer depend on which tile arrived first.** `whenSettled()`
  and the exports waited for the tiles the view selects, not for the zoom-0 tile and the
  overview drawn under them, so a globe exported as its page loaded could leave out the zoom-0
  tile (in the docs, the globe-tiles example's Python and Svelte exports differed). They wait for
  those too now.
- **Exports where Chrome's sandbox cannot start say what to do.** Chrome for Testing on Ubuntu
  23.10 and later quits with "No usable sandbox!" (AppArmor restricts the user namespaces its
  sandbox needs), and every `hm.export_*` failed with Chrome's log. The error now says why and
  names the fixes: install Google Chrome from its `.deb` package, or set
  `HMPLOT_CHROME_NO_SANDBOX=1` to run Chrome without its sandbox (new; hmplot never turns the
  sandbox off on its own, except as root, where Chrome refuses it).
- **HTML pages exported from Python go live.** A page from `hm.export_html()` or a notebook's
  `await scene.export_html()` embedded the runtime's unbuilt source instead of the built runtime
  (the Python bundles inlined it by its URL), so the page's script failed ("Failed to resolve
  module specifier 'svelte'"): in every browser it kept its snapshot with the "Static preview"
  label pulsing, and without WebGPU it showed no note. Pages now embed the built runtime (Python
  puts it in; a notebook view's own "Interactive HTML" download asks the kernel for it once), go
  live opened from disk with no network, and export themselves again from their own settings
  pane.
- **A notebook's HTML export of a large scene no longer breaks the session.** `await
scene.export_html()` gets the page from the notebook's browser as one message, and Jupyter's
  server closes the connection on a message over 10 MiB: with more data (or a dense plot's SVG
  snapshot) than that, the export timed out and the notebook lost its connection. Such a page is
  now exported headlessly, as `hm.export_html()` exports it (it has no such limit), with a
  warning: Python counts the data before asking the view, and the view sends no page over the
  limit. That page starts from the scene as Python has it, not the view's pan, zoom or settings
  edits. With no export browser to draw its snapshot, the error says so and what to do.
- **The snapshot of an HTML export of a Theme, Data, Row, Column or Grid.** `hm.export_html()`
  of a Theme or Data (a scene built under `with hm.Theme(...)`) had no snapshot ("n.handle.exportSVG
  is not a function"), and a Row, Column or Grid inside a larger scene showed the whole scene in
  its snapshot; the snapshot is now the plots inside the exported part.
- **Text3D, TeX and standalone exports:** Text3D stays hidden until its font geometry is ready,
  and TeX outlines load without CSS-color warnings. Standalone exports wait for the plots' first
  frame and subsequent preparation, so viewport-dependent rules export at their visible endpoints.
- **A brush on a Simulate's rows** stopped with "Referenced tracer ... freed" after the
  next step; it brushes the rows the Simulate shows now. A mark with automatic axes whose data
  changes every frame (a `Bin` under a Simulate) drew nothing while its runs kept overtaking one
  another; it draws the newest one that finishes.
- **A new scene replaces the old one's inputs.** Running an example with a Slider in the
  docs' Python editor failed with "Two inputs are named ..."; a scene applied in place of
  another declares its inputs afresh.
- **Headless exports on Linux and Windows without a GPU.** On Linux, Chrome found SwiftShader's
  WebGPU adapter, but the first frame a plot drew lost the GPU device, and every `hm.export_*`
  failed ("WebGPU device lost: Device was destroyed", "A valid external Instance reference no
  longer exists"); on Windows, Chrome offered no WebGPU adapter at all (GitHub's runners, Chrome
  154). SwiftShader's setup now has Chrome composite on SwiftShader's Vulkan on Linux and on
  Microsoft's software Direct3D (WARP) on Windows, where a WebGPU canvas draws, and a setup is
  used only once a WebGPU canvas has drawn in it. When none draws, or an export loses its device
  later, the error says which Chrome, flags and adapter it ran on, with the GPU lines of Chrome's
  log.
- **Headless exports on Windows start.** Reading the port file Chrome was still writing failed
  with `PermissionError`; it is read again until Chrome lets go of it.
- **An export's own error is no longer replaced by its cleanup's.** Chrome is asked to quit and
  waited for, and its temporary profile is deleted with retries: Chrome's processes still writing
  into it raised "Directory not empty" on Linux, hiding the error the export failed with.
- **The bundled jax-js runs in Node 20**, which has no global `navigator`: tuning a kernel for
  WebGPU (`webgpuShaderSource`) threw "navigator is not defined", and `init("webgpu")` now finds
  no WebGPU there instead of throwing.
- **Text labels with `enter`/`exit` fades follow keyed updates of text from Python or a
  Filter.** Text whose column arrives as categories and codes (strings from Python, or text
  read through a Filter or Calculate) failed on its next keyed update with "Invalid type for
  full", and its labels stayed where they were while the points moved on. The labels now move,
  enter and leave with their rows.
- **A Force in a Python scene runs.** A checked Run (`running=hm.input.run`) started the layout
  and stopped it again at once: any change of the Force's props restarted the layout, paused.
  It now restarts only when its graph or setup changes.
- **A Python scene re-runs only what a changed input reaches.** A component got all its props
  as new values whenever any input it read changed, so everything reading any prop ran again: a
  Playback moving Frames re-configured each of them on every frame. Each prop now reaches its
  component on its own, and an unchanged value stays the same.
- **A Line with `sampling="uniform-x"` fills the view when zoomed in.** It found the rows to
  draw as if they spanned the whole x axis, but an automatic x domain is padded past the first
  and last x: zoomed in away from the middle, the line stopped short of one edge of the plot, by
  up to a quarter of its width, and ran past the other (the long time series example showed it).
  The rows are now placed by the line's own x extent.
- **Exports made right after a plot first draws carry its description.** The generated
  description follows the settled plot after a pause, so Python's headless exports
  (`hm.export_svg`, `hm.export_html`'s snapshot) had a `<title>` but no `<desc>` unless the plot
  had a `description=`; an export now generates it when it is not there yet.
- **Docs examples keep their preview until the live plot has drawn on a development server.** A
  guide page's example replaced its preview with its loading Svelte program at once, and after a
  change to the library each open example redrew its scene as the server rebuilt the examples,
  so readers saw loading spinners where the preview was. Published pages were not affected.
- **The custom point shapes example runs.** It registered `pentagon` and `arrow`, which are
  built-in shapes now, so it stopped with "pentagon is a built-in shape and cannot be
  redefined"; so did the `registerShape` reference's snippet and Python example 43. They register
  `kite`, `bolt` and `house` instead.
- **Straight lines in a Frame under a log axis draw on high-density screens.** A straight
  segment of a Segments, Line, Area or Ribbon inside a Frame mapped into a log (or other
  nonlinear) parent axis, starting near the low end of the axis, could need more than the 256
  pieces a segment may have to meet `subdivisionTolerance`: at a device pixel ratio of 2, or in a
  large plot, the mark drew nothing, reported "Spherical detail exceeds the execution budget",
  and PNG export failed. At that limit the pieces are now accepted when the drawn line is within
  the tolerance of the true one.
- **A Facet's PNG export is the whole grid on high-density screens.** At a device pixel ratio of
  2 each cell was drawn at twice its size and cropped to its top left quarter. The PNG now has
  the cells' resolution, `scale` times the device pixel ratio pixels per CSS pixel, as a Plot's
  PNG export has: twice the size at a ratio of 2. SVG and PDF exports were not affected.
- **The context menu exports plots that hide their buttons.** With `settings={{ showTrigger:
false }}`, "Export…" opened the export panel and it closed at once; it now stays open and
  exports. A panel opened from the export button still closes when the plot becomes too small
  for its buttons.
