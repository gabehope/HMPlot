---
name: hmplot
description: Write and fix plots with HMPlot, a WebGPU plotting library for Python notebooks (pip package hmplot, imported as hm) and Svelte 5 (npm package hmplot). Covers when it fits (large or live data, GPU transforms, 3D, maps, graphs, simulations), how a scene is built, a translation table from matplotlib, Plotly, Vega-Lite, D3, Observable Plot and pandas names to HMPlot's, tested patterns, common mistakes, and checking a plot headlessly with `hmplot check`. Use when code imports hmplot, or when the user asks for an HMPlot chart.
---

# HMPlot

HMPlot draws charts, maps and 3D scenes with WebGPU. Python (`import hmplot as hm`, in Jupyter,
VS Code notebooks or scripts that export files) and Svelte 5 (`import { Plot, Points } from
"hmplot"`) build the same scenes from the same components: `Plot`, marks (`Points`, `Line`, `Rect`,
`Heatmap`, `Surface`, `GeoJSON`, `Text`, ...), transforms (`Filter`, `Group`, `Calculate`,
`Density`, `Force`, ...), inputs (`Slider`, `Select`, `Checkbox`), facets and layouts. Python
spells options in snake_case (`fill_scale`), Svelte in camelCase (`fillScale`).

Core marks and transforms live in `hm` / `"hmplot"`. Reusable chart patterns live in
`hm.charts` / `"hmplot/charts"`: for example `hm.charts.Bar(...)`, or
`import { Bar } from "hmplot/charts"`. The old root chart names raise a migration error.
Statistical patterns (Bin, Hexbin, Normalize, Window, Summary) live in `hm.stats` /
`"hmplot/stats"`; Calculate, Group, Filter and Sort stay in the core. Choose a pattern when
it matches the task; compose core operations when it does not.

## Find the page for the task

Search, then read: each task below names its reference page (`reference/svelte/<page>.md` or
`reference/python/<page>.md` in the docs folder) and the keywords to search for in it. Run
`grep -rn "<keyword>" <docs>/reference/svelte/<page>.md` and read the lines the search lands on;
read a whole page only when the search does not answer. Every page you print stays in every
later step, so five pages read at once cost five times over.

| Task | Page | Keywords |
|---|---|---|
| Drag a range on one view to filter another | mark-options, filter | `brush`, `where="@brushed"`, `inactive="all"`, `respond="brushed"` |
| Brush with a plain drag, no Shift | plot | `interactive="brush"` |
| Clear a brush, reset selections, a Reset button | selection, plot-handle, mark-options | `clear()`, `clear_columns`, `clearBrush`, Escape, Delete; a Button `set=` writes inputs only |
| One brush per axis (parallel coordinates) | frame, plot | child `Frame` strips, `interactive="brush"` |
| A count, total or KPI in text that follows a brush | title | `count({ where: "@brushed" })` |
| Hover or click to highlight the same rows elsewhere | mark-options, selection | `hover`, `select`, `respond="hovered"`, `selection()` |
| A click sets one value (a drill-down's root, a focused series) | mark-options, input-context | `input("root", { default })`, `select={root.set("id")}`, `hover={root.set("id")}`, Button `set={root.reset()}` |
| Statistics of the brushed rows drawn in another plot | group, join, data | `Filter where="@brushed"`, `Group by`, `Join data={handle}`, `Data value={handle}` |
| A list or table of rows beside the plots (a top ten) | table-view, sort | `TableView`, `limit`, `Sort by order="desc"` |
| A value in your own code (a breadcrumb, a label) | data | `read()`, `subscribe` |
| Your code decides which rows are selected | selection | `replace(owner, rows)` |
| A drillable treemap or packed circles | treemap, pack | `root={root}`, `levels`, `total`, `parent` |
| Stacked areas, a streamgraph | stack, area | `offset="wiggle"`, `order="insideOut"`, `lower`, `upper` |
| A choropleth or a map of points | geojson, plot | `fill`, `projection`, `coordinates="spherical"` |
| A control (slider, menu, checkbox) | slider, select, input-context | `name`, `input("name")` |
| Dates on an axis | axis-definition, datetime-coordinates | `type: "datetime"`, `major_interval`, `format` |
| Many rows (100,000 or more), binned or filtered live | filter, bin, density | `Bin`, `Density`, `where` |
| Animation over time | animate-tween, playback | `animate`, `tween`, `Playback` |
| A tooltip | tooltips | `tooltip`, `fields`, `format` |
| A chart pattern (bar, histogram, box plot) | bar, histogram, box-plot | `hmplot/charts` |

Interaction runs inside the plot: a brush, a hover or a click becomes a column (`@brushed`,
`@hovered`, `@selected`) that a Filter, a Group or a mark's `respond` reads on the GPU, so linked
views stay fast at any row count. Recomputing rows in your own code and passing new tables on
every pointer move is slower than SVG; reach for `read()` only for values shown outside a plot.
On every pointer move, prefer what marks `respond` to (a brush, a selection, even one your code
sets with `replace(rows)`): it re-runs no transform. A Filter, Group or Sort re-runs when its
settings or the state it reads change, which is right for a list or a total, not for a fade.

## Translate what you already know

[translation.md](translation.md) lists every public HMPlot name beside the closest name in
matplotlib, Plotly, seaborn, Vega-Lite, Observable Plot, D3, pandas or Polars, with its kind
(mark, transform, option, expression, state) and the reference page to search. Read it when
you know what you want in another library's words (a facet, a brush, a param, a data join, a
`twinx`, `fill_between`) and don't know HMPlot's, and before concluding that HMPlot lacks
something: its last section lists what is genuinely missing and the nearest route. Its
snippets show where a familiar word means a different mechanism here (D3's enter/exit, a
Vega-Lite brush filter, a Dash callback).

## Choose the language workflow

For **Svelte**, read [svelte.md](svelte.md) first, then the specific Svelte reference
pages it points to. The Python examples below are not JavaScript syntax. For Python,
continue with the reading workflow and patterns below.

## Composable presentation

Use existing neutral presets before inventing a new theme. `paper`, `journal`, `presentation`,
`notebook`, `minimal`, `ink`, `bureau` and `observable` differ in typography, spacing, guides
and marks; `hmplot` keeps its default look. Compose `extends=["paper", "title/centered",
"legend/inline-bottom", "marks/points-dense"]`; later keys win and explicit mark props win
last. A marks partial preserves unrelated mark kinds and palettes. The presentation recipes in
[patterns.md](patterns.md) cover a centered report, dense scatter, supplied band + rule,
annotation card and compact colorbar. Read `reference/python/theme.md` (or the Svelte page)
for exact partial names and capability limits. Set per-axis tick density/rotation/grid on the
axis, Bar gaps with `band_fraction`, and Callout box/leader styles as explicit props. Do not
promise rounded/variable-size colorbars, automatic cell-label contrast, theme bar spacing or
statistical semantics from style names; those are recipes or deferred capabilities.

## Reading the docs

Read little, and the right page: whole files cost far more than the answer needs. Search
before you read (the table above names the page and the words), one page at a time.

1. This file, [translation.md](translation.md) when the task is phrased in another library's
   words, then the closest program in [patterns.md](patterns.md) (the site's `/recipes.md`):
   tested programs for the common charts, from scatter and bars to maps, animation and export;
   most tasks start from one. `hm.export_html(chart, "chart.html")` writes an interactive page.
2. The lines of a component's reference page your search lands on: `reference/python/<name>.md`
   (Python) or `reference/svelte/<name>.md`, such as `reference/python/bar.md`. Read the whole
   page only when the search does not answer. `llms.txt` lists every page with a line each.
3. To look up one signature, search `reference/api.md` (`grep -n "def Bar" -A 30`); do not read
   it whole. `llms-full.txt` is every page in one file (over 600 KB): search it, never print it.

## When it fits

- Large data: hundreds of thousands to millions of rows that pan, zoom, filter and brush in the
  browser, with transforms (filters, bins, expressions, densities) computed on the GPU.
- Live interaction declared in the chart: selections, brushes, hover, tooltips, sliders and linked
  views work in the browser without Python callbacks.
- 3D scenes, surfaces, globes and map projections with vector-tile basemaps; graph and hierarchy
  layouts; simulations stepped on the GPU every frame.
- Output: notebook widgets, Svelte components, PNG, SVG, PDF, MP4 and standalone HTML files.

Other tools fit better when the data is larger than a browser holds (aggregate it first, or use
Datashader or Mosaic), when charts must render without WebGPU (Matplotlib, Vega-Lite, Plotly),
when a Python server runs the app's callbacks (Dash, Panel), or for an estimator HMPlot lacks
(seaborn's bootstrapped intervals, LOWESS; translation.md's last section lists these). The
docs' guide page "Compared with other libraries" (`/docs/compare.md`) has the details.

## How a scene is built

- **A tree of components.** Containers hold children: `Plot`, `Data`, `Facet`, transforms (`Filter`,
  `Calculate`, `Group`, ...), and in Python the layouts `Scene`, `Row`, `Column` and `Grid`.
  Marks draw. In Python a component made inside a `with` block belongs to that block
  (or pass children positionally: `hm.Plot(points)`); in Svelte children are child markup. A
  component has one parent.
- **Data flows down.** `data=` on a Plot (or `Data`, a `Facet`, a mark) makes a table: a dict of
  columns, a pandas or Polars DataFrame, an Arrow table or an `hm.Table`. Inside it a string
  names a column (`x="weight"`); a string that names no column is a constant (`fill="red"`).
  `hm.literal("x")` forces a constant, `hm.col.x` a column (an error when it is missing).
- **Data pipelines are chains, as in polars.** Start from the data, `sales = hm.Data(df)` (a
  DataFrame, a dict of columns or an `hm.Table`), and
  chain steps; each returns a node that plots or marks draw with `data=`:

```python
import hmplot as hm

sales = hm.Data({"region": ["N", "S", "N", "S"], "revenue": [120, 80, 150, 60]})
by_region = sales.group_by("region").agg(revenue=hm.col.revenue.sum(), orders=hm.count())
large = sales.filter(hm.col.revenue > 70).with_columns(share=hm.col.revenue / hm.sum("revenue"))
with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(data=by_region):
            hm.charts.Bar(x="region", y="revenue")
        with hm.Plot(data=large):
            hm.Points(x="revenue", y="share")
chart
```

- **The steps:** `filter(*predicates, inactive=)` (an expression, `"@brushed"`, a selection or an
  input comparison; several must all hold), `with_columns(name=expression)`,
  `group_by(*keys).agg(name=reduction)` (`group_by()` with no keys is one row of totals;
  `.len()` counts rows), `join(other, on=, how="left" | "inner", fields=)` and
  `sort(*by, descending=False)`. Reductions are `hm.sum("x")` or `hm.col.x.sum()`: `sum`,
  `mean`, `min`, `max`, `count`, `median`, `std`, `var`, `first`, `last`; with `by=`,
  each row gets its group's value. `.alias("name")` names an output passed positionally.
- **A chain runs live in the browser, on the GPU.** It recomputes as brushes, selections and
  inputs change, so Python cannot read its rows (no `to_pandas`, no `len`): prepare static data
  with pandas or polars before `hm.Data`. Build chains anywhere (at the top of the program); the
  scene that draws one includes it. Plots can draw the same chain, and branches of one
  `hm.Data` share its interaction state: a brush on `data=sales` is the one
  `sales.filter("@brushed")` keeps. pandas' names (`groupby`, `assign`, `merge`, `query`)
  raise errors that name these.
- **Export the Scene, including its pipelines.** Use an explicit `with hm.Scene() as chart:`
  around the views and export `chart`. Exporting only a Plot or Row leaves out detached
  pipelines outside that subtree. `hm.Plot(data=chain)` supplies it to all marks inside;
  use a mark's `data=` to override it for that mark, or `hm.Data(value=...)` for a branch.
- **Live maps that open offline:** leave `VectorTile.snapshot=True` (default) while using
  `live=True`. `hm.export_html` embeds loaded tiles and preserves online navigation. Export
  needs tile-service access, or local MVT bytes supplied as `tile_data`; `snapshot=False`
  deliberately leaves the map dependent on the network. See `reference/python/vector-tile.md`.
- **Map boundaries:** use `hm.GeoJSON(fill=None, color=..., width=...)` to draw polygon
  boundaries and LineStrings. This replaces GeoJSONLine; filled maps use a fill color or column.
- **Areas and uncertainty bands:** use `hm.Area(x="time", upper="value")` (lower defaults
  to zero), or supply `lower="low", upper="high", opacity=0.2` for a band. Horizontal areas
  take `y` positions and `orientation="horizontal"`. Ribbon and Area's old `baseline`/value-`y`
  API were removed; see `reference/python/area.md`.
- To prevent axis margins shifting after zoom, use `hm.Plot(dynamic_margins=False)`
  (Svelte: `dynamicMargins={false}`). Initial labels still fit; later longer labels can clip.
  Resize/style/data-domain changes refit, and aligned peers can still widen shared space.
- Reference overlays: `hm.charts.RuleX(x=...)` / `RuleY(y=...)` match Plotly vline/hline;
  `hm.charts.BandX(x0=..., x1=...)` / `BandY(y0=..., y1=...)` match vrect/hrect.
  Bands use `fill` and `opacity`, follow the other axis during pan/zoom, and do not widen
  automatic domains. Compose Text/Callout for annotation; `label` names a legend entry.
- **Numbers in Text need no cast.** `hm.Text(text="count", format=",")` writes a Group's count,
  a Calculate's value or any numeric column, live, computed on the GPU or not (`format` is a
  d3-format string, or a %-pattern for dates; default as tooltips write numbers). A live total
  is `table.group_by().agg(...)`: one row, `count` 0 when nothing is selected. Don't use `as_category`
  or one Text per digit for numbers.
- **Readouts (a live count, a KPI) are a Title inside the Data:**
  `hm.Title(f"Selected: {hm.count(where='@brushed'):,}")` follows the data and its brush.
- **Generate rows without a dummy table.** `hm.Data(rows=N)` replaces ConstantData. Use
  `hm.row()` for zero-based visible positions and `hm.random(seed=7)` for reproducible draws.
  Retain them with `.with_columns(index=hm.row(), noise=hm.random(seed=7))`
  before filtering or sampling to keep source-row values. Pass a table or `rows`, not both.
- **Expressions run per row on the GPU** wherever a column goes: `hm.col.mass / hm.col.volume`,
  `hm.where(cond, a, b)`, `hm.log("x")`, `hm.mean("x", by="group")`. Combine conditions with
  `&`, `|` and `~`, each comparison in parentheses.
- **Inputs are named.** `hm.Slider(name="bins", ...)` is read as `hm.input.bins` (or `"$bins"`
  where a string names a column) by anything in the same scene, in the browser.
  `hm.Slider(name="window", min=0, max=10, value=[2, 8])` selects an interval;
  read `hm.input.window` as a pair, for example as a plot's domain.
  `hm.Select(multiple=True, name="groups", options=[...])` holds a list; read it with
  `hm.is_in("group", hm.input.groups)` to filter rows.
- **Interaction state is columns.** `select=True`, `brush=True`, `hover=True`, `nearby=True` and
  `nearest=True` on a mark fill `@selected`, `@brushed`, `@hovered`, `@nearby` and `@nearest`
  (`@any_selected` and the others: whether any row is). Read them as `hm.view.hovered`, or as
  `"@hovered"` in `.filter("@hovered")` or a channel; `respond="brushed"` fades a mark's other rows.
  Views of one table share its states (linked views). A shared `focus = hm.selection()` is an
  expression operand: `hm.where(focus, 1, 0.15)`, `focus & (hm.col.v > 10)`, `~focus`. Picking an
  aggregate (a bar, a bin) selects its rows. `hm.selection(by="gene")` links tables by a column's
  values: hovering a gene in one plot highlights every row with that gene in another.
- **One pipeline, several plots.** A chain step is a data source: `totals = sales.group_by(...).agg(...)`,
  then `hm.Points(data=totals, ...)` in any Plot of the scene. It runs once and every plot reads
  its live output.
- **One root is displayed.** A notebook cell displays its last expression; one Plot needs no
  Scene. Several plots and inputs go in `hm.Scene()` (Python) or an HTML page (Svelte). A script
  writes files with `hm.export_png(plot, "plot.png")` and the other `export_*` functions.

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "group": ["a", "b", "a", "b"]}

with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Points(x="x", y="y", fill="group", select=True, respond="selected")
    hm.Legend(channel="fill")

plot
```

```svelte
<script>
  import { Plot, Points, Legend } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2], group: ["a", "b", "a", "b"] };
</script>

<Plot {data} height={300} axes2d>
  <Points x="x" y="y" fill="group" select respond="selected" />
  <Legend channel="fill" />
</Plot>
```

## Patterns

[patterns.md](patterns.md) contains tested, complete programs: a scatter plot with a legend
and tooltips; lines over time; stacked and grouped bars; a histogram and a density; small multiples (facets); a dashboard
with inputs; brushing linked across views; a million points; maps and 3D points; a simulation;
a force-directed network; marginals; ordered heatmaps; exports and checks.

## Presentation and themes

Start with a full preset, then partials: for example
`report = hm.create_theme(extends=["paper", "title/centered", "legend/inline-top"])`, applied with
`with hm.Theme(value=report):` around the plots and inputs it should style. See
`reference/python/theme.md` for the complete partial list and `reference/python/themes.md`
for presets. In Svelte use `createTheme` and `<Theme value={report}>`.

- Themes merge left to right; explicit mark props and scale ranges win. A copied recipe's
  `fill`, `size` or `width` can prevent the theme from changing that property. Omit incidental
  styling when you want defaults; keep intentional data encodings and semantic colors.
- Named partial groups cover axes, legend, title, controls, numbers, animation and marks.
  Use documented names such as `marks/points-dense`; colorbar-shape partials remain proposals.
  Check the reference before using a planned style. Theme definitions use `guides` for legend defaults.
- Axis rotation/density belongs on the relevant axis: inspect its options before applying a
  global theme angle to both axes. Keep measured margins for long labels; fixed margins and
  `dynamic_margins=False` can clip later labels. A theme cannot repair missing geometry.
- Use one guide per encoding: either automatic Plot legends or explicit `hm.Legend` targets
  where needed. Inspect the result for duplicates, unreadable colorbar ticks and overlapping
  size samples. Directly labeled lines may not need an additional legend.
- For matrices use categorical axes with row/column labels, not hidden numeric axes plus
  manually positioned Text. Use Marginals for marginal distributions; count axes need count
  domains, not [0, 1] unless normalized. See the final two programs in patterns.md.

## Animation correspondence

For longitudinal animation, keep a unique observation key (for example country+year)
and set `animation_group="country"` on Data or Plot. Filter to one year before
`animate()` or `tween()`; repeated groups in the full table are allowed, but each tweened
snapshot must have one row per group. Frame overrides apply to one branch, including
Calculate tween producers; `animation_group=None` restores Data-key/position matching.
Changing the group columns resets motion history; selection and hover still follow Data keys.

Playback changes an input; it does not itself interpolate marks. The playback recipe in
patterns.md demonstrates filtered snapshots. For smooth motion use `animate()` or `tween()`
with stable correspondence; see `reference/python/animate-tween.md`.
Do not reuse an entity ID as a unique observation key across all years.

## Authoring reusable patterns

Use `@hm.template` or subclass `hm.Template` with a `build()` method to reuse components.
A pattern can be marks inside a Plot, or a non-mark wrapper such as Calculate → Plot → `hm.slot()` whose
caller's marks read the calculated columns. Place one unnamed slot where those children
belong; `with`, `add` and `clear` act on it, leaving the pattern's own components intact.

- With one own mark, Python infers its main part. With several, use
  `hm.contract(main=head, parts={"band": band})` when callers need one mark for events or a
  legend. Slot children do not select the main. Part names take prop dicts; build parameters
  configure the pattern, and other keywords go to the main mark. A build taking `**kwargs`
  must forward them itself. A group without a main takes only `visible` besides part dicts.
- `update(**params)` rebuilds after the template's `with` block closes; stable parts keep IDs
  and callbacks, and caller children move to the rebuilt slot. Each call creates new parts.
  Build parameters do not automatically create settings controls.
- To share without Python code, export a fresh instance with an empty slot, no callbacks and
  explicit `hm.template_param(name, default=...)` markers. The marker owns the file default.
  Load with `hm.load_template()` in Python or `PortableTemplate` from `hmplot/templates` in
  Svelte; reattach host callbacks. Files keep the fixed tree and contracts, not methods or
  Python branching. Host data stays outside the file.
- Repository JavaScript definitions (`defineTemplate` / `TemplateHost`) are internal; they
  are not exports of `hmplot/templates`. An application can author an ordinary Svelte
  component with a children snippet. A new numerical operation, layout execution or shader
  belongs to the plug-in contracts, not a template.

When authoring, read `reference/python/template.md` and `reference/svelte/package-templates.md`;
in a checkout, [the template authoring guide](../../docs/PORTABLE-TEMPLATES.md) has executable
mark and transform/layout examples. For new execution or rendering, read
`reference/svelte/plugins.md` and `reference/python/use-plugin.md`.

Plugin computations register with `hm.transform` or `hm.layout`, and callers use
`hm.Transform(kind="acme.operation", ...)` or Svelte's `<Transform kind="acme.operation"
params={...}>`. Their parameter schemas drive validation, dependencies and settings controls.
Borrowed JAX inputs require `.ref` when consumed; returned arrays transfer ownership to the
runner. Respect `valid` when reducing padded rows. A template may compose a plugin with
marks, and Python HTML exports embed registered plugins for updates without callbacks.

## Mistakes to avoid

- **WebGPU is required to draw.** Notebooks need a browser with WebGPU (Chrome or Edge 113+ on the
  desktop; check Safari and Firefox support). Without it a notebook shows a static image drawn by
  the kernel. There is no WebGL or CPU fallback.
- **Exports and checks need Chrome.** `hm.export_*` and `hm.check` draw in a headless Chrome: an
  installed Chrome, Edge or Chromium, else Chrome for Testing, downloaded on first use
  (`hmplot install-chrome` does it ahead; `HMPLOT_NO_DOWNLOAD=1` forbids it; `HMPLOT_CHROME`
  names a browser). Without a GPU they draw on SwiftShader.
- **Python keywords are snake_case** (`fill_scale`, `axes2d`, `size_units`); a camelCase keyword
  is an error that names the snake_case spelling. `for=` is `target=` and `as=` is `as_=`.
- **A mark goes inside a Plot**, or takes `data=` to display on its own. Layout components (`Row`,
  `Column`, `Grid`, `Title`, `Markdown`) go in a Scene beside plots, never inside one.
- **A component belongs to the `with` block open when it is made.** Build an optional part inside
  the branch that uses it; to draw one mark in two plots, make it twice (a function helps).
- **Python's `and`, `or`, `not` and chained comparisons do not work on expressions:** write
  `(hm.col.x > 0) & (hm.col.y < 1)`. Use `hm.min`, `hm.max`, `hm.sum` and `hm.round` for
  expressions, not the builtins.
- **Numbers are float32 on the GPU** (about seven significant digits). Integer and string keys
  stay exact; float keys that differ only beyond float32 collide, so key rows by integers or
  strings.
- **Pyodide's default integer is 32-bit** (the docs' in-browser Python editor, JupyterLite): write
  `np.arange(n, dtype=np.int64)` before multiplying into large numbers, such as milliseconds
  since 1970.
- **Title every axis**: `hm.Plot(x={"label": "Region"}, y={"label": "Revenue (USD)"})`. An
  untitled axis shows the raw column name (`revenue_k`).
- **Bars that share a category stack** by default: `hm.charts.Bar(x="region", y="sales", fill="product")`.
  `arrange="group"` sets them side by side (patterns.md 3); aggregate rows first (`.group_by(...).agg(...)`)
  when there are several per bar.
- **A category y axis lists its categories from the top** (horizontal bars sorted largest first read top-down); `y={"invert": True}` lists them from the bottom.
- **Draw repeated locations once:** group event rows by their location ID, coordinates and
  tooltip names with `flights.group_by("origin", "lon", "lat", "name").agg(departing=hm.count())`
  as the `Points`' data. Plain grouping keys keep brushes linked to all contributing events, and
  event brushes highlight their groups. Draw the event histogram from the events, not the groups; use separate
  selections for the map filter and histogram response (patterns.md 23).
- **Crossfilters brush histograms directly:** `hm.charts.Histogram(x="delay", brush=True)`; a
  `table.filter("@brushed")` as another view's `data=` follows it. For views that filter by each
  other's brushes, give each histogram `brush={"selection": hm.selection()}` and filter with
  `.filter(*the_other_selections)`. Keep the brush source outside its own selection filter;
  otherwise brushing can remove the rows that sustain the brush. Use `inactive="all"` when
  an inactive selection should leave a view unfiltered.
- **Click drilldowns:** keep source rows in one Data: `sales.group_by("region")` for the selectable
  bars, and `sales.filter(focus, inactive="all").group_by("product")` for the target
  (the click drilldown in patterns.md). Plain clicks replace; an exact source-row repeat clears.
  Shift/Meta/Ctrl clicks toggle membership; background clears. No Python callbacks needed.
- **Colors are opaque:** a color with alpha is an error; use `opacity=`.
- **Lights are Plot settings.** For marks with `lit=True`, use
  `hm.Plot(lights=[hm.light("ambient", intensity=0.3), hm.light("directional", position=[3, 2, 4])])`.
  This replaces the four light components; the settings pane edits the lights. See
  `reference/python/light.md` for point and hemisphere lights.
- **3D is Z-up by default:** use `type="3d"` for surfaces and terrain with elevation on z.
  Use `type="3d-y-up"` when height is y. `camera_up` overrides either preset.
- **Interaction state names:** `@selected`, `@brushed`, `@hovered`, `@nearby`, `@nearest`,
  `@tooltip`, their `@any_` forms, and view state such as `@time`, `@pointer_x`, `@view_x_min`
  (`hm.STATE_NAMES` lists them). A column cannot start with `@`.
- **Python callbacks** (`on_click`, input `on_change`) run only while the kernel is attached; an
  exported HTML file keeps the declared interactions and leaves the callbacks out.

## Checking a plot

`hmplot check plot.py` runs a program as a notebook cell runs (its last line is the plot) and
draws it headlessly: it prints the errors (each naming the component and what to pass instead),
each plot's marks with their row counts and columns, the axes' ranges, warnings (marks that drew
no rows, what SVG and PDF exports draw as images), lints (what runs but does nothing or looks wrong,
such as a Legend no mark feeds, a color with no legend, a domain far wider than the data), and saves `plot.check.png`. It exits with 1 when the program raised or the
check found errors (`--strict`: or lints); `--json` prints the result as JSON. It checks
the plot on the program's last line, else the components the program leaves at its top level,
else the plots it exported (a plot built inside `main()`). From
Python, `print(hm.check(plot))` gives the same summary and `hm.check(plot).png` the image. Look at
the PNG as well as the text: a plot can be valid and still show the wrong thing.

## Reference

- The documentation site serves plain text for agents: `/llms.txt` (one line per page),
  `/llms-full.txt` (every guide and reference page), `/reference/api.md` (every component's Python
  signature and Svelte props on one page), and each page as Markdown at its address plus `.md`
  (`/reference/python/points.md`, `/docs/interaction.md`).
- The Python package's type stubs give editors each component's keywords, their descriptions
  and an example; `hm.visualize_tree(plot)` draws a scene's component tree.
- In a checkout of the repository: `src/routes/content` (the docs' Markdown), `src/examples` (each
  reference page's programs, in Python and Svelte) and `python/examples`.

## Supplied-value chart patterns

Start from the Forest plot, Bullet chart, Interval timeline or Sparkline in patterns.md
(`hm.charts` in Python, `hmplot/charts` in Svelte). These are templates over existing marks.
Supply estimates/intervals, qualitative upper-bound columns or schedule endpoints; they do not
fit statistics, allocate lanes or infer thresholds. Style named parts with their object props
(`interval`, `reference_line`, `ranges`, `tick`, `milestones`, `band`, `last`), and use Plot for
axes and figure layout. The main handles draw Points, Bar, Prism and Line respectively.
