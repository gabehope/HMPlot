# HMPlot in words you already know

Every public HMPlot name, next to the closest thing in a library you may know better. Scan the
first column for the concept you have in mind; the second is HMPlot's word, the third where it
lives (what kind of thing it is, and the reference page to search:
`reference/python/<page>.md` or `reference/svelte/<page>.md`). A note says where the analogy
breaks. Python spelling throughout (`fill_scale`); Svelte is the same word in camelCase
(`fillScale`), and Svelte components have the same names. A snippet appears only where the
other library's word implies a different mechanism. If a concept is missing here, see "Not in
HMPlot" at the end before searching the docs.

Kinds: **container** holds children (`with` block in Python); **mark** draws rows; **chart** is a
mark pattern in `hm.charts`; **transform** gives the components inside it a new table;
**layout** arranges plots (beside them, never inside one); **option** is a keyword of the
component named; **channel** is a mark option that takes a column, per-row values or one value;
**expression** runs per row on the GPU wherever a column goes; **resource** is a shared object
made by a function; **state** is a column interaction writes.

## Figure and layout

| Known as | HMPlot | Kind · page | Note |
|---|---|---|---|
| matplotlib `Figure` + `Axes`, Plotly `go.Figure`, Plot `Plot.plot()`, Vega `view` | `Plot` | container · plot | one chart: axes, camera, marks inside; `data=` feeds every mark inside |
| `plt.subplots`, `make_subplots`, Vega `hconcat`/`vconcat`, a dashboard grid | `Scene`, `Row`, `Column`, `Grid` | layout · scene, row, column, grid | distinct charts side by side; a notebook cell displays one root |
| seaborn `FacetGrid`, Plot `fx`/`fy`, ggplot `facet_wrap` | `Facet(row=, column=, wrap=)` | container · facet | one cell per category; `pairs=` is a scatterplot matrix (`pairplot`) |
| ggplot `group=` (one line per group), `sns.lineplot(hue=)` | `Line(series="country")`, or `Partition(by=)` | channel, container · line, partition | Partition repeats its children per group in one frame (a fit per group) |
| matplotlib `twinx()`, inset axes, Plotly `yaxis2` | `Frame` | container · frame | its own scales inside a Plot: a second y axis, a small chart within a chart |
| matplotlib `sharex`, Plotly `shared_xaxes` stacked rows | `Panels(x=)` | layout · panels | Plots stacked over one shared x, plot areas lined up; in Svelte the only aligning layout |
| Bokeh shared `x_range`, Vega `resolve: shared` across charts | `LinkViews` | layout · link-views | 2D plots pan and zoom together |
| `plt.title`, `suptitle`, `Layout.title` | `Plot(title=, subtitle=, caption=)` | option · plot | |
| `fig.text`, a readout, a KPI | `Title(text)` | layout · title | live: `hm.Title(f"{hm.count(where='@brushed'):,} selected")` inside the Data |
| a Markdown cell beside a chart | `Markdown` | layout · markdown | |
| `plt.style.use`, `pio.templates`, ggplot `theme_*()` | `Theme(value=)`, `create_theme(extends=[...])`, `themes` | container, resource · theme, themes | presets `paper`, `journal`, `presentation`, ...; partials like `title/centered` |
| `ax.legend()`, `fig.colorbar()`, Plot `legend: true` | `Legend(channel=)`, `Plot(legend=)` | component, option · legend | automatic per channel; explicit for placement or a `target` mark |
| shared encodings for several marks | `Mapping` | container · mapping | channels the marks inside it share |
| D3 `foreignObject`, an HTML overlay | `Html` (Svelte only) | component · html | DOM at a data position; left out of exports |
| `df.head()` beside a chart, a DataTable | `TableView(columns=, limit=)` | component · table-view | live rows of the data around it, after its Filter, Group or Sort |
| D3 brush overview, Plotly `rangeslider` | `charts.FocusContext`, `Minimap` | chart, component · focus-context, minimap | |
| a React or Svelte component, a ggplot function | `Template`, `@hm.template`, `slot` | authoring · template, slot | a reusable pattern with a slot for the caller's marks |
| `plt.polar`, `coord_polar`, `go.Scatterpolar` | `Plot(coordinates="polar")` | option · plot | |

## Marks and charts

| Known as | HMPlot | Kind · page | Note |
|---|---|---|---|
| `plt.scatter`, `go.Scatter(mode="markers")`, Plot `dot` | `Points` | mark · points | `size` in px, `shape`, `fill` |
| `plt.plot`, `go.Scatter(mode="lines")`, Plot `line` | `Line` | mark · line | one path through the rows in order; `series=` for one per group; `dash`, `curve` |
| `fill_between`, Plot `areaY`, `go.Scatter(fill="tonexty")` | `Area(x=, upper=, lower=)` | mark · area | `lower` defaults to 0; a band is `lower` + `upper` + `opacity` |
| `plt.bar`, `px.bar`, Plot `barY`, `geom_col` | `charts.Bar(x=, y=, fill=)` | chart · bar | bars sharing a category **stack**; `arrange="group"` sets them side by side; `orientation="horizontal"` is `barh` |
| `plt.hist`, Plot `rectY(binX())`, `geom_histogram` | `charts.Histogram(x=, bins=)` | chart · histogram | `brush=True` makes it a crossfilter source |
| Plot `rect`, `cell`, `go.Heatmap` of categories | `Rect` | mark · rect | rectangles by their edges, one per row |
| `imshow(matrix)`, `go.Heatmap`, `sns.heatmap` | `Heatmap` | mark · heatmap | a grid of values as colors; pixels are `Image` |
| `imshow(rgb)` | `Image` | mark · image | |
| `ax.text`, `annotate`, Plot `text` | `Text(x=, y=, text=, format=)` | mark · text | numbers format live (`format=","`), no cast |
| `annotate(arrowprops=)` | `charts.Callout` | chart · callout | a note with a leader line |
| `axvline`/`axhline`, Plotly `add_vline`, Plot `ruleX` | `charts.RuleX(x=)`, `charts.RuleY(y=)` | chart · rule-x, rule-y | one per row, or one at a value or the pointer |
| `axvspan`/`axhspan`, `add_vrect` | `charts.BandX(x0=, x1=)`, `charts.BandY` | chart · band-x, band-y | |
| Plot `rules and bands` at the axis level | `Plot(rules=, bands=)` | option · bands | behind the marks, on a Plot or Frame |
| `plt.fill`, `Polygon` patch, Plot `area` of a shape | `Polygon` | mark · polygon | one per series, vertices in order |
| `LineCollection`, Plot `link`, `go.Scatter` with `None` gaps | `Segments` | mark · segments | one segment per row, start to end |
| `plt.quiver`, Plot `arrow` | `charts.Arrows` | chart · arrows | `Arrows3D` in 3D |
| `sns.boxplot`, `go.Box`, Plot `boxY` | `charts.BoxPlot` | chart · box-plot | |
| `sns.violinplot`, `go.Violin` | `charts.Violin` | chart · violin | |
| `sns.swarmplot`, `stripplot`, Plot `dodgeX` | `charts.Swarm` | chart · swarm | |
| `sns.ecdfplot`, `stat_ecdf` | `charts.Ecdf` | chart · ecdf-chart | |
| `sns.kdeplot`, `geom_density` | `Density` + `Line`/`Area`; 2D: `charts.DensityContour`, `charts.DensityBands` | transform, chart · density, density-contour, density-bands | |
| `plt.contour`, `contourf` | `Contour` | transform · contour | lines or filled bands of a grid |
| `sns.regplot`, `lmplot`, Plot `linearRegressionY`, `geom_smooth` | `charts.Smooth`, `Regression` | chart, transform · smooth, regression | least squares with a confidence band; no LOWESS |
| `plt.errorbar`, Plotly `error_y`, `sns.pointplot` | `charts.ErrorBars`, `stats.Summary` | chart, transform · error-bars, summary | Summary computes mean/median and an interval per group |
| `plt.pie`, `go.Pie(hole=)` | `charts.Pie(value=, category=, inner_radius=)` | chart · pie | |
| `sns.jointplot` | `charts.Marginals` | chart · marginals | scatter with histograms on its sides |
| `plt.stem` | `charts.Lollipop` | chart · lollipop | |
| `go.Candlestick` | `charts.Candlestick(x=, open=, high=, low=, close=)` | chart · candlestick | |
| `go.Waterfall` | `charts.Waterfall` | chart · waterfall | |
| `px.timeline` (Gantt) | `charts.IntervalTimeline` | chart · interval-timeline | |
| `go.Indicator` bullet | `charts.BulletChart` | chart · bullet-chart | |
| forest plot, coefficient plot | `charts.ForestPlot` | chart · forest-plot | |
| dumbbell, connected dot plot | `charts.Dumbbell` | chart · dumbbell | |
| sparkline | `charts.Sparkline` | chart · sparkline | |
| direct line labels (Plot `text` at the last point) | `charts.EndLabels` | chart · end-labels | |
| Plotly `hovermode="x"` spike lines | `charts.Crosshair` | chart · crosshair | rules that follow the pointer with a readout |
| `scatter3D`, `go.Scatter3d` | `Points3D` | mark · points-3d | solid spheres or cubes |
| `plot_surface`, `go.Surface`, `plot_trisurf` | `Surface` | mark · surface | a grid of heights or a triangle mesh |
| `bar3d`, extruded columns | `Prism` | mark · prism | |
| `quiver3d`, `go.Cone` | `Arrows3D` | mark · arrows-3d | |
| 3D text, TeX label in a scene | `Text3D` | mark · text-3d | |
| D3 links between elements, Plotly annotation arrows between traces | `connect(a, b)`, `Anchor` | resource, mark · connect, anchor | Line, Segments and Arrows draw between marks' positions |

## Channels and the options every mark shares

Page `mark-options` for all of these.

| Known as | HMPlot | Kind | Note |
|---|---|---|---|
| `x=`, `y=`, Plot `x`/`y` | `x`, `y`, `z` | channel | a string names a column; a string that names no column is a constant; `position=` takes an N×2 array |
| `color=`, `c=`, seaborn `hue`, Plot `fill` | `fill` (filled shapes), `color` (lines, text) | channel | a CSS color or a column; numbers map through a colormap, categories through a palette |
| Plot `stroke` | `color` on a line; `outline_color` on a filled mark | channel | |
| `s=`, `markersize`, Plot `r`, `size=` | `size` | channel | px |
| `linewidth`, Plot `strokeWidth` | `width` | channel | px |
| `alpha=`, `opacity` | `opacity` | channel | **colors carry no alpha**: `rgba()` and `#rrggbbaa` are errors |
| `edgecolor`, `edgecolors`, `linewidths` | `outline_color`, `outline_width`, `outline_opacity` | channel | |
| `marker="o"`, Plot `symbol` | `shape`, `register_shape()` | channel, function | |
| Plot `dx`/`dy` | `dx`, `dy` | channel | px offsets |
| `cmap=`, `vmin`/`vmax`, `norm=`, `color_continuous_scale` | `colormap=`, `fill_scale=hm.continuous(domain=, transform=)` | option, resource | pages colormap, continuous; `hm.normalization()` makes several scales agree |
| `palette=`, `color_discrete_map` | `fill_scale=hm.categorical(domain=, range=)`, theme `palette` | resource | page categorical; `hm.ordinal()` for ordered categories along a colormap |
| `BoundaryNorm`, a stepped colorbar | `quantize=True`, `levels=` | option | |
| `label=` (legend text) | `label`; `legend=False` hides the entry | option | |
| `zorder` | child order | | later marks draw over earlier ones |
| `visible="legendonly"`, `set_visible(False)` | `visible=False` | option | |
| datashader `how="add"`, additive blending | `blend="additive"` (also multiply, screen, subtractive) | option | |
| bloom, neon glow | `glow=` | option | |
| `hatch="//"` | `shade=hm.shade("hatch", spacing=6)` | option | |
| excluding a reference layer from autoscale | `domains=False` | option | |
| one item from a value (not per row) | `rows="auto"` | option | a line at a value, a label at a point |
| per-trace log axis, image extent | `x_transform`, `xbounds`, `xrange`, `x_invert` (also y, z) | option | this mark's own mapping instead of its frame's |
| a cap on points drawn | `max_elements` | option | default 250,000 per mark |

## Axes and scales

Pages `axis-definition` (the `x=`, `y=`, `z=` dicts) and `plot`.

| Known as | HMPlot | Kind | Note |
|---|---|---|---|
| `set_xlabel`, `labels=`, `xaxis_title`, `axis(label=)` | `Plot(x={"label": "Revenue (USD)"})` | option | title every axis; an untitled one shows the column name |
| `set_xlim`, `range=`, `scale(domain=)` | `x={"domain": [lo, hi]}` | option | |
| `set_xscale("log")`, `log_x=True`, `scale(type="log")` | `x={"transform": "log"}` | option | also `sqrt`, `symlog` |
| `invert_yaxis()`, `autorange="reversed"`, `reverse: true` | `y={"invert": True}` | option | a category y axis lists from the top by default |
| date axis, `type="date"`, `scale(type="time")` | `x={"type": "datetime"}` | option | page datetime-coordinates; `major_interval="1 month"`, `breaks="weekends"` |
| `tickformat`, `FuncFormatter`, `axis(format=)` | `x={"format": ",.0f"}` | option | d3-format strings; `tick_count`, `step`, `tick_label_angle` |
| `grid(True)`, `showgrid` | `x={"grid": "major"}` | option | |
| `xticks(rotation=45)` | `x={"tick_label_angle": 45}` | option | |
| `set_aspect("equal")` | `Plot(aspect="equal")` | option | |
| `figsize`, `width`/`height` | `Plot(width=, height=)` | option | |
| `axis("off")`, `showticklabels=False` | `Plot(axes2d=False)`, `x={"visible": False}` | option | |
| `yaxis="y2"` | `Frame` | container | see Figure and layout |
| Vega `resolve: {scale: {y: "independent"}}` in a facet | `Facet(scales=, resolve=)` | option | page facet |
| matplotlib `projection="3d"`, `go.Scatter3d` camera | `Plot(type="3d")`, `camera_position=`, `camera_target=`, `camera_up=` | option | Z-up; `type="3d-y-up"` when height is y |
| cartopy or Plotly `geo.projection` | `Plot(projection="mercator")` | option | equirectangular, equal-earth, natural-earth, albers, albers-usa, orthographic |
| a globe, `go.Scattergeo(projection="orthographic")` | `Plot(coordinates="spherical")` | option | tilt and spin; `projection="orthographic"` is a flat disk |
| `set_zlim` | `z={"domain": ...}`, `z_scale=` | option | |

## Data and transforms

| Known as | HMPlot | Kind · page | Note |
|---|---|---|---|
| a DataFrame passed to the plot | `Data(value=df)`, `Plot(data=df)` | container, option · data | a dict of columns, pandas, Polars, Arrow or `hm.Table`; strings inside name its columns |
| Vega `data: {url}`, `pd.read_csv(url)` at view time | `Provider(url=)` | container · provider | loaded in the browser; `refresh_interval` polls |
| `np.arange(n)` as a dummy frame | `Data(rows=N)` + `hm.row()`, `hm.random(seed=)` | option, expression · data | generate rows without a table |
| `df.index`, a primary key, D3's key function | `hm.Table(identity=)`, `hm.identity(keys=)`, `Data(key=)` | resource, option · table, identity | selections and animation follow keys across updates |
| `astype("category")`, `pd.to_datetime` | `hm.typed_column()`, `Data(schema=)` | function, option · typed-column | pandas types mostly carry over |
<!-- pipeline -->
| `df[df.x > 0]`, `.query()`, Vega `filter`, Plot `filter` | `table.filter(hm.col.x > 0)` (`Filter`) | transform · filter | `where="@brushed"` keeps brushed rows; `inactive="all"` keeps all when nothing is brushed |
| `groupby().agg()`, Vega `aggregate`, Plot `groupX` | `table.group_by("region").agg(total=hm.sum("x"))` (`Group`) | transform · group | always outputs `count`; no `by` is one row of totals |
| `assign()`, `mutate()`, Vega `calculate` | `table.with_columns(ratio=hm.col.a / hm.col.b)` (`Calculate`) | transform · calculate | |
| `merge()`, `join()`, Vega `lookup` | `table.join(other, on="id")` (`Join`) | transform · join | |
| `sort_values()`, Plot `sort` | `table.sort("x", descending=True)` (`Sort`) | transform · sort | a Line connects rows in table order, so sort before it |
<!-- /pipeline -->
| `pivot()`, `pivot_wider` | `Pivot` | transform · pivot | |
| `melt()`, `pivot_longer`, `stack` | `Fold` | transform · fold | |
| `sample(n)`, `sample(frac=)` | `Sample` | transform · sample | |
| `pd.cut`, `np.histogram`, Plot `binX` | `stats.Bin(x=, bins=)` | transform · bin | also 2D and 3D grids |
| `plt.hexbin`, Plot `hexbin` | `stats.Hexbin` | transform · hexbin | |
| `rolling().mean()`, Plot `windowY` | `stats.Window` | transform · window | |
| z-score, `normalizeY`, share of total | `stats.Normalize` | transform · normalize | |
| `describe()`, mean ± CI per group, seaborn estimator | `stats.Summary` | transform · summary | |
| `scipy.stats.gaussian_kde` | `Density` | transform · density | 1D curve or 2D grid |
| `np.polyfit`, `statsmodels.OLS` | `Regression` | transform · regression | |
| `scipy.interpolate.griddata` | `Interpolate` | transform · interpolate | a grid from scattered samples |
| Plot `stackY`, `offset="wiggle"` streamgraph | `Stack(offset=, order=)` | transform · stack | `lower`, `upper` outputs for Area |
| Plot `dodgeY`, waffle chart | `Dodge` | transform · dodge | |
| `scipy.spatial.Delaunay`, `Voronoi`, `ConvexHull` | `Delaunay`, `Voronoi`, `Hull` | transform · delaunay, voronoi, hull | geometry for Segments or Polygon |
| `df.x + pd.DateOffset(months=1)` | `Shift` | transform · shift | |
| a cross-section at one time, per entity | `Slice` | transform · slice | interpolates between observations |
| a custom transform, Vega `registerTransform` | `Transform`, `use_plugin()` | transform · transform, use-plugin | |
| reusing a computed table in several charts | `totals = sales.group_by(...).agg(...)` then `data=totals` | | one pipeline, several plots |

Pandas' names on these nodes (`groupby`, `assign`, `merge`, `query`, `to_pandas`, `len`) raise
errors that name the HMPlot spelling. A transform runs live in the browser; Python reads its
rows only with `await node.read()`.

## Expressions

Pages `names` (`col`, `input`, `view`), `expressions`, `reductions`, `calendar-functions`, `casts`.

| Known as | HMPlot | Kind | Note |
|---|---|---|---|
| `df["x"]`, `pl.col("x")`, Vega `datum.x` | `hm.col.x` (or `"x"` where a channel expects a column) | expression | an error when the column is missing |
| `pl.lit(1)`, a constant where a column name would match | `hm.literal("x")` | expression | |
| pandas masks `(a > 0) & (b < 1)` | the same: `&`, `\|`, `~`, each comparison in parentheses | expression | Python `and`, `or`, `not` and `a < b < c` do not work |
| `np.where`, `pl.when().then().otherwise()`, `CASE WHEN` | `hm.where(cond, a, b)` | expression | |
| `fillna`, `COALESCE` | `hm.coalesce(a, fallback)` | expression | |
| `isin` | `hm.is_in("col", values)` | expression | `values` may be a multi-Select input |
| `isna`, `notna` | `hm.is_missing`, `hm.is_finite` | expression | |
| `np.log`, `np.sqrt`, `np.clip`, `round` | `hm.log`, `sqrt`, `exp`, `abs`, `square`, `power`, `floor`, `round`, `clip`, `minimum`, `maximum`, `sin`, `cos` | expression | `hm.round`, `hm.min`, `hm.max`, `hm.sum`, not the builtins |
| `+ - * / **`, `== != < <= > >=` | the operators, or `add`, `subtract`, `multiply`, `divide`, `power`, `negative`, `equal`, `not_equal`, `less`, `less_equal`, `greater`, `greater_equal`, `logical_and`, `logical_or`, `logical_not` | expression | |
| `df.x.mean()` broadcast to rows, `transform("mean")`, `AVG() OVER (PARTITION BY)` | `hm.mean("x")`, `hm.mean("x", by="group")` | reduction | also `sum`, `count`, `min`, `max`, `median`, `std`, `var`, `quantile`, `mode`, `first`, `last`, `extent`, `any`, `all`; `where=` restricts rows |
| `cumsum`, `shift(1)`, `shift(-1)`, `iloc[i]`, `rolling` | `hm.cumsum`, `hm.lag`, `hm.lead`, `hm.lookup`, `hm.window` | reduction | row-aligned; `order_by` within groups |
| `pd.cut` as a group key | `hm.bin("x", bins=)`, `hm.hexbin("x", "y")` | expression | keys for Group |
| `dt.year`, `dt.day_name()`, `dt.floor("1M")` | `hm.year`, `quarter`, `month`, `week`, `day`, `weekday`, `day_of_year`, `hour`, `minute`, `second`, `month_name`, `day_name`, `time_floor("1 month")` | expression | `tz=` names a zone |
| `astype(...)` for one use | `hm.as_category`, `as_ordinal`, `as_numeric`, `as_datetime`, `as_duration` | cast | |
| `np.random.rand(n)`, `range(n)` | `hm.random(seed=7)`, `hm.row()` | expression | compute them in a Calculate before filtering to keep them stable |
| `rgb` from three columns | `hm.rgb("r", "g", "b")` | expression | |
| a widget's value inside the chart | `hm.input.bins`, `"$bins"` where a string names a column | expression | page names |
| `$time`, `datum.selected`, pointer position | `hm.view.time`, `hm.view.hovered`, `"@hovered"`, `"@pointer_x"` | state | page pointer-columns; all names in `hm.STATE_NAMES` |
| Vega signals for the pointer, the visible domain, the clock | `@pointer_x`, `@pointer_y`, `@view_x_min`, `@view_x_max`, `@view_y_min`, `@view_y_max`, `@time`, `@dt` | state | per-row flags: `@selected`, `@brushed`, `@hovered`, `@nearby`, `@nearest`, `@tooltip` and their `@any_*` forms; drags: `@offset_x`, `@offset_y`, `@offset_z` |
| a widget's options from the data | `hm.categories("col")`, `hm.column_names()` | expression | page input-options |
| previous frame's state in a simulation | `hm.prev.x` | expression | inside Simulate |
| a dragged row's displacement | `hm.offset("x")`, `hm.moved("x")` | expression | page offsets-drag |
| `tween`, `interval`, `keyframes` | see Animation | | |

## Interaction

Pages `mark-options` (the mark options), `selection`, `identity`, `interaction`, `tooltips`,
`pointer-columns`, `input-context`.

| Known as | HMPlot | Kind | Note |
|---|---|---|---|
| D3 `brush`, Vega `selection_interval`, Plotly box select | `brush=True` on a mark; `Plot(interactive="brush")` for a plain drag | option | Shift-drag by default; fills the `@brushed` column |
| Vega `selection_point`, Plotly `clickData` | `select=True` | option | fills `@selected`; plain click replaces, Shift-click toggles, background clears |
| Vega `on: "mouseover"`, Plot `pointer`, Bokeh `HoverTool` | `hover=True`, `nearby=`, `nearest=` | option | `@hovered`, `@nearby`, `@nearest` |
| `hovertemplate`, Plot `tip`, `title` channel | `tooltip=True`, `tooltip=["a", "b"]`, `tooltip={"fields": [...], "format": ...}` | option | page tooltips |
| Vega `condition={param, value, else}` | `respond="brushed"`, `selection_opacity=` | option | fades the mark's other rows; re-runs no transform |
| Vega `transform_filter(param)`, crossfilter | `Filter(where="@brushed", inactive="all")` | transform | a brush is a column any transform reads |
| Bokeh shared `ColumnDataSource`, Vega shared `param` | the same `Data` | | views of one table share its interaction states |
| Vega `param` with `fields`, a selection by key | `focus = hm.selection()`, `hm.selection(by="gene")` | resource | an expression operand: `hm.where(focus, 1, 0.15)`, `~focus`; `by=` links tables by value |
| naming a selection for the marks inside | `Interaction(columns={"focus": ...})` | container | reads as `"@focus"` |
| Vega `param` bound to a widget, Dash `Input` | `root = hm.input("root", default="all")`; `select=root.set("id")`; `Button(set=root.reset())` | resource, option | a click writes an input; the read is its default until something writes it; see the snippet below |
| D3 `drag` behavior | `drag="xy"` | option | rows move by offsets; `hm.moved("x")` reads them |
| `on_click` callbacks, Bokeh `on_change`, Dash callbacks | `plot.on_click(cb)`, an input's `on_change` | handle · plot-handle | Python runs only while the kernel is attached; exports keep the declared interactions |
| reading the selection in code | `plot.selection`, `plot.brush`, `await node.read()`, Svelte `read()` / `subscribe` | handle · plot-handle, transform-handle | for values shown outside a plot, not per pointer move |
| `relayout`, `ax.set_xlim` after the fact | `plot.update(**props)`, `await plot.fit()`, `set_viewport`, `set_camera` | handle · plot-handle | |

A brush that filters another view, Vega-Lite versus HMPlot:

```python
# Vega-Lite: brush = alt.selection_interval(); chart.add_params(brush); other.transform_filter(brush)
# HMPlot: the brush is a column of the shared table; a Filter reads it, a mark can also fade by it
with hm.Data(value=df):
    with hm.Plot():
        hm.Points(x="a", y="b", brush=True)
    with hm.Plot():
        with hm.Filter(where="@brushed", inactive="all"):
            hm.charts.Histogram(x="c")
```

A click that drives a drill-down, Dash callback versus HMPlot:

```python
# Dash: @callback(Output("detail", "figure"), Input("bars", "clickData")) def update(click): ...
# HMPlot: the click fills a shared selection; a Filter over the same source rows reads it; no callback
focus = hm.selection()
with hm.Data(sales):
    with hm.Group(by="region", columns={"revenue": hm.sum("revenue_k")}):
        hm.charts.Bar(x="region", y="revenue", select=focus, respond=False)   # picking a bar selects its rows
    with hm.Filter(where=focus, inactive="all"):
        with hm.Group(by="product", columns={"revenue": hm.sum("revenue_k")}):
            hm.charts.Bar(x="product", y="revenue")
```

(Each Group goes in its own Plot; patterns.md has the complete program. A click can also write
an input: `root = hm.input("root", default="all")`, `select=root.set("id")`, for a drillable
Treemap or a focused series.)

## Inputs

Page per component; `input-context` for the scope, `input-options` for options from data.

| Known as | HMPlot | Kind | Note |
|---|---|---|---|
| `ipywidgets.IntSlider`, `Inputs.range`, `dcc.Slider` | `Slider(name="bins", min=, max=, value=)` | component | read as `hm.input.bins`; `value=[lo, hi]` is a range slider |
| `Dropdown`, `Inputs.select`, `dcc.Dropdown` | `Select(name=, options=, multiple=)` | component | a Select of column names picks what a channel plots |
| `Checkbox`, `Inputs.toggle` | `Checkbox(name=)` | component | |
| `Button`, `Inputs.button` | `Button(label=, set=)` | component | counts presses; `set=` writes an input |
| `Text`, `Inputs.text` | `TextInput` | component | |
| `ColorPicker`, `Inputs.color` | `ColorPicker` | component | opaque RGB |
| `DatePicker`, `Inputs.date` | `DateTimeInput` | component | |
| `ipywidgets.Play`, Plotly animation buttons | `Playback(name="year", min=, max=)` | component | a slider that moves over time; it changes an input, it does not interpolate marks |
| `ipywidgets.interact` scope, Dash `Input` ids | `InputContext` | container | a Python `Scene` is one already |
| `d3.timer`, `requestAnimationFrame` state, `forceSimulation.tick` by hand | `Simulate` | container | per-row state stepped at a fixed interval; `hm.prev.x` reads the last step |

## Animation

Page `animate-tween`; `playback`; Plot options `animation`, `animation_duration`, `animation_easing`.

| Known as | HMPlot | Kind | Note |
|---|---|---|---|
| D3 `transition()`, Plotly `transition`, `animated: true` | `animation=True` on a mark or Plot | option | changed rows interpolate in scale space |
| `transition().attr("cy", ...)` on one channel | `y=hm.animate("y", duration=, easing=)` | expression | per row, in the scale's space; `enter=`/`exit=` are start and end values |
| `d3.interpolate` feeding a recomputation | `hm.tween(value)` | expression | in data units, anywhere in an expression; a Filter or Bin sees the moving value |
| D3 data join `enter` / `exit` | `enter_effect="fade"`, `exit_effect="fade"` + keyed rows | option | see the snippet below |
| D3 key function, Plotly `ids` | `Data(key=)`, `animation_group="country"` | option | which rows are the same thing across updates |
| Plotly `animation_frame`, `FuncAnimation` | `Playback(name="year")` + `Filter(where=hm.col.year == hm.input.year)` + `animation=True` | | filter to one row per entity per frame |
| a clock, Vega `timer` | `hm.view.time` (`"@time"`), `hm.interval(ms)`, `hm.keyframes({0: a, 1000: b})` | state, expression | `export_mp4(duration=)` renders the clock |
| an easing name | `animation_easing="cubic-in-out"` | option | `hm.EASINGS` lists them |

Enter and exit, D3 versus HMPlot:

```python
# D3: svg.selectAll("circle").data(rows, d => d.id)
#       .join(enter => enter.append("circle").attr("r", 0), update => update, exit => exit.transition().remove())
# HMPlot: key the rows, then say what arriving and leaving rows do; nothing is called on update
with hm.Data(value=df, key="id"):
    hm.Points(x="x", y=hm.animate("y", enter=0, exit=0), animation=True,
              enter_effect="fade", exit_effect="fade")
```

Three differences: rows are keyed on the Data, not on the mark; changed rows interpolate because
`animation=True`, not because anything is called; enter and exit are either a row-level effect
(`enter_effect`) or a per-channel start and end value (`animate(enter=, exit=)`), and both combine.

## Graphs, hierarchies, maps and 3D

| Known as | HMPlot | Kind · page | Note |
|---|---|---|---|
| networkx graph + `d3.forceSimulation` | `GraphData(edges=)` + `Force` + `Nodes`/`Edges` with marks inside | container, transform · graph-data, force, nodes, edges | the layout is simulated live on the GPU |
| graphviz `dot`, dagre | `DAG` + `Routes` | transform, mark · dag, routes | layered layout with routed edges |
| `d3.tree`, `d3.cluster`, icicle, `scipy.cluster.hierarchy.dendrogram` | `Tree(mode=)`, `hm.linkage_table()` | transform, function · tree | |
| `d3.treemap`, `px.treemap`, `d3.pack` | `Treemap(root=, levels=)`, `Pack` | transform · treemap, pack | `root=hm.input("root")` makes it drillable |
| `d3.sankey`, `go.Sankey` | `Sankey` + `Flow` | transform, mark · sankey, flow | |
| `geopandas.plot`, `px.choropleth`, Plot `geo` | `GeoJSON(data=geojson, fill="rate")` in a `Plot(projection=)` | mark · geojson | `fill=None` draws boundaries; `height=` extrudes in 3D |
| contextily, Mapbox basemap, `folium.TileLayer` | `VectorTile` | component · vector-tile | land, water, roads and labels from vector tiles |
| `plt.imshow` over a map | `Image` with `xbounds`/`ybounds` | mark · image | |
| mplot3d lighting, three.js `Light` | `Plot(lights=[hm.light("ambient", intensity=0.3), hm.light("directional", position=[3, 2, 4])])`, mark `lit=True` | option · light | |
| fog, sky, bloom | `Plot(effects=[hm.effect(...)])` | option · effects | |
| xarray slices over time, `go.Volume` frames | `hm.stream(dataset, dim, at=hm.input.t)` | function (xarray extra) | a grid table of one slice of a dataset, following an input |

## Output and checking

| Known as | HMPlot | Kind · page | Note |
|---|---|---|---|
| `plt.show()`, `fig.show()` | the cell's last expression | | one root per cell; several plots go in `hm.Scene()` |
| `savefig`, `write_image`, `write_html`, `to_html` | `hm.export_png(chart, "a.png")`, `export_svg`, `export_pdf`, `export_html`, `export_mp4` | function · plot-handle, document-export-options | exports draw in a headless Chrome; `export_html` keeps the interactions |
| a snapshot test, `fig.to_dict()` | `hm.check(plot)`, CLI `hmplot check plot.py` | function · check | errors, each mark's rows, the axes, lints and a PNG |
| `print(fig)`, inspecting the spec | `hm.visualize_tree(plot)` | function · visualize-tree | |
| `kaleido` install | `hmplot install-chrome` | CLI | |
| a saved template file | `hm.load_template()`, `hm.load_theme()` | function · template, theme | |

## Not in HMPlot

What an agent often searches for and should stop searching for, with the nearest route.

| You may look for | Instead |
|---|---|
| LOWESS or loess, a logistic fit, bootstrapped confidence intervals (seaborn) | `Regression` and `charts.Smooth` are least squares with an analytic band; `stats.Summary` gives mean or median intervals. Fit anything else in Python first and plot the result |
| a color with alpha (`rgba(...)`, `#ff000080`) | `opacity=` |
| drawing onto an `ax` after the fact, `fig.add_trace`, `update_traces`, `update_layout` | everything is a prop in the tree; later changes go through the handle, `plot.update(**props)` |
| Vega expression strings (`"datum.x > 0"`), Plotly `hovertemplate` strings | Python expressions (`hm.col.x > 0`), `tooltip={"fields": [...], "format": ...}` |
| a server-side callback framework (Dash, Panel, Bokeh server) | interactions are declared and run in the browser; Python callbacks exist but only with a live kernel |
| React or Vue bindings | Svelte 5 components only; `export_html` embeds a page anywhere |
| CPU or SVG rendering, a WebGL fallback | WebGPU is required to draw; headless exports draw in Chrome |
| pandas on a live node (`.to_pandas()`, `len(node)`, `groupby`) | `await node.read()`; the HMPlot transform names |
| `d3.scaleLinear()` and pixel arithmetic | scales belong to the Plot and Frame; a mark's `x_transform`/`xbounds` override its own |
| Plotly subplots sharing one figure object | `Row`/`Column`/`Grid` of Plots; `LinkViews` or `Panels` to link them |
| a mark outside a Plot | a mark goes inside a Plot, or takes `data=` to display on its own; layouts go beside plots, never inside |
| a chart from the package root (`hm.Bar`) | `hm.charts.Bar`; statistics in `hm.stats`; core marks and transforms in `hm` |
| camelCase keywords in Python (`fillScale`) | snake_case (`fill_scale`); `for=` is `target=`, `as=` is `as_=` |
| 64-bit precision on the GPU | float32 (about seven digits); key rows by integers or strings |
| candlesticks, waterfalls, Gantt charts, bullets as missing | they exist: `charts.Candlestick`, `Waterfall`, `IntervalTimeline`, `BulletChart` |
