# HMPlot for Python notebooks

Build interactive WebGPU plots with Python context managers. The wheel contains the compiled Svelte frontend; users do not need Node.js or a development server.

HMPlot 0.1.0-alpha.1 is an alpha release, not yet on PyPI: install the wheel from its
[GitHub release](https://github.com/gabehope/HMPlot/releases/tag/v0.1.0-alpha.1).

```sh
python -m pip install https://github.com/gabehope/HMPlot/releases/download/v0.1.0-alpha.1/hmplot-0.1.0a1-py3-none-any.whl
# With the optional dataframe adapters:
python -m pip install 'hmplot[dataframes] @ https://github.com/gabehope/HMPlot/releases/download/v0.1.0-alpha.1/hmplot-0.1.0a1-py3-none-any.whl'
```

```python
import hmplot as hm

with hm.Scene() as scene:
    with hm.Data({"x": [0, 1, 2], "y": [0, 1, 0.5]}):
        with hm.Plot(axes2d=True) as plot:
            points = hm.Points(x="x", y="y", size=6)
scene
```

The package depends on `numpy`, `anywidget`, `ipywidgets`, and `traitlets`.

For simulations, `with hm.Data(rows=10000):` supplies rows without uploading a dummy table.
Use `hm.row()`, constants and `hm.random(seed=7)` in `hm.Calculate(columns={...})` to generate
initial columns, then place `hm.Simulate` inside it; see [the complete example](examples/82_constant_data.py).

Use JupyterLab, Notebook 7, or VS Code notebooks in a WebGPU-capable browser. In a browser without WebGPU, a displayed scene shows a static image instead, read-only and labeled so: the kernel draws it in the headless Chrome the exports use, at the view's width, and draws it again after each update. With no Chrome where the kernel runs, the output shows the error and what to install; the display never downloads Chrome for Testing (`hmplot install-chrome` does). Commands that need the live view (`await plot.export_png()`, `get_camera()`, ...) need a view with WebGPU; `hm.export_png(plot)` and the other `hm.export_*` functions draw headlessly. Other initialization errors, such as a lost GPU device (reload the page), are reported as before.

Notebook viewers without the widget (GitHub, nbviewer, notebooks exported to HTML) show nothing for a scene unless `HMPLOT_NOTEBOOK_SVG=1` is set in the kernel's environment (`%env HMPLOT_NOTEBOOK_SVG=1` in a cell, or `os.environ` before displaying): each display's output then also carries the scene's SVG, which those viewers show while Jupyter shows the widget. It is off by default because each display then draws the scene headlessly, which takes a second or more (see docs/DOCUMENT-EXPORT.md, "Notebooks without WebGPU").
Install the wheel with the Python interpreter selected as the notebook kernel, then restart that kernel. Check `sys.executable`, `hm.__version__`, and `hm.__file__` inside the notebook if behavior differs from the installed wheel.

## Composition

Constructors attach to the active context. Enter containers with `with`; marks do not need a context. Context exit never displays a plot. Evaluate the root or use `display(root)`.

So every component created while a `with` block is open belongs to that block's node, whether or not it is added anywhere later. Build an optional part inside the branch that uses it; a Legend created before the `if` would be drawn either way:

```python
with hm.Plot(data=penguins, axes2d=True) as plot:
    points = hm.Points(x="bill_length", y="bill_depth", fill="species")
    if show_legend:
        hm.Legend(target=points)
```

A component has one place: to draw the same mark in two plots, build it in a function and call the function once per plot.

A Plot describes itself for screen readers and in its exports (`description=` is read first; `describe=False` keeps only yours), and `plot.description` reads the text once a view has shown the plot: alt text for a paper.

`Scene`, `Row`, `Column` and `Grid(columns=2)` compose layouts. Text sits beside plots in them: `hm.Title("...")` is plain text drawn as SVG (vector and searchable in the scene's SVG and PDF exports; `size="subtitle"` or `"caption"`), and `hm.Markdown("...")` is rich text for dashboards (tables, lists, `$math$`), exported as an image. Both show input values through `{$name}` (in an f-string, `{{$name}}`). A plot's own heading is `hm.Plot(title=..., subtitle=..., caption=...)`, kept in its own exports; `bands=[{"axis": "x", "from": 40, "to": 52}]` shades a span of an axis, and `hm.charts.Callout(x=..., y=..., text=..., dx=..., dy=...)` points at a value (see `examples/79_titles_and_markdown.py`). `Data`, transforms and facets preserve their normal library scopes. `Grid(x="time", values=["signal"])` is the interpolation transform; `Grid(columns=2)` is the layout. These two forms cannot be mixed.

Grouping is explicit. A transform computes over all its rows unless it is grouped; unlike plotnine or seaborn, a color mapping does not split it. `hm.Density(x="bill_length")` makes one curve over every species, and its rows have no `species` column, so `fill="species"` on an Area below it is an error. Group with the transform's `by=` (Density, Group, Normalize, Pivot, Slice, Sort, Summary, Window, and reductions such as `hm.mean("x", by="species")`), which computes every group in one transform and keeps the key column, or with `hm.Partition(by=...)`, which runs everything inside it once per group:

```python
with hm.Plot(data=penguins, axes2d=True):
    with hm.Density(x="bill_length", by="species"):  # one grid and bandwidth for all groups
        hm.Area(x="x", lower=0, upper="density", fill="species", opacity=0.4)

with hm.Plot(data=penguins, axes2d=True):
    with hm.Partition(by="species"):  # each species' own bins
        with hm.stats.Bin(x="bill_length", bins=20):
            hm.Rect(x0="x0", x1="x1", y0=0, y1="count", fill="species", opacity=0.6)
```

Containers support `add`, `remove`, `clear`, and reopening with `with`. `add` takes several components and returns the container, so `plot.add(points, line)` and `hm.Plot(data=table).add(points)` work; `remove` returns the removed component. Adding a component to the container it is already in moves it to the end, which is also where it draws. Explicit construction works too: `hm.Scene(hm.Plot(hm.Line(position=values)))`. Positional arguments to a container are its children, and a constructor never takes a parent: the enclosing `with` block, or a later `add`, decides where a component goes. Explicit placement wins over the block that created a component while that block is open: `points` made in an outer `with` block moves into `hm.Frame(points)` in a nested one. A component put somewhere explicitly, or whose block has closed, stays there, and putting it elsewhere raises. `hm.LinkViews(a, b)` takes plots as references, and a template's positional arguments go to its `build()`. A visual object has one parent. Tables and categorical scales can be shared. References use `target=object`, without moving that object.

Construction uses task-local contexts. A failed outer transaction restores earlier children and properties. Concurrent tasks must create independent scenes instead of attaching to an inherited construction context.

A Line, Segments, Arrows3D, or Arrows with `connections=hm.connect(...)` draws between other marks instead of from its own columns. `hm.connect(before, after, key="id")` pairs the rows of `before` and `after` that share an `id` (exact values; without `key`, both must show one table and rows pair by observation). `hm.Anchor` holds a position and draws nothing. `mark.endpoint(at="left")` chooses where a connection attaches (`"center"`, edge midpoints, a bar's `"value"` end, a segment's `"start"`/`"end"`), and a mark written inside an embedded Facet (or a Partition) names the mark repeated in every cell (or group), not one cell: passed alone, `hm.connect(values)` connects the cells in facet order, which is how parallel coordinates are drawn (`hm.Facet(fields=[...])` shows the same rows in every cell, its `value` column being the cell's field, so no key is needed and each cell's axis is titled by its field; a `Frame` in each cell that sets x from 0 to 1 puts the points on the cell's axis; and `brush={"axis": "y"}` on the points brushes each field). `facet.endpoint("values")` selects the same mark by its `name` (the Svelte way, kept for parity). Endpoints may be defined after the connector. Click and hover events on a connector carry `event.connection`: the matched key and, per endpoint, its row and node id (`event.connection["source"]["node"] == before.id`).

```python
with hm.Plot(data=countries, axes2d=True) as plot:
    before = hm.Points(x="y2000", y="country")
    after = hm.Anchor(x="y2021", y="country")
    arrows = hm.charts.Arrows(connections=hm.connect(before, after, key="country"), color="region")

with hm.Plot(data=penguins, axes2d=False):
    with hm.Fold(fields=["bill_length", "bill_depth", "flipper", "mass"]):
        with hm.Facet(column="key", scales="free-y", layout="grid"):
            with hm.Frame(x={"domain": [0, 1], "visible": False}):
                values = hm.Points(x=0, y="value", brush={"axis": "y"})
        hm.Line(connections=hm.connect(values), color="species")
```

See `examples/52_connect.py`, [docs/CONNECTIONS.md](../docs/CONNECTIONS.md), and the `$connect` descriptor in [PROTOCOL.md](PROTOCOL.md).

## Templates

A template packages a pattern of components as one reusable node that still takes children. The library's own patterns are templates too: `hm.charts.Bar`, `hm.charts.Histogram`, `hm.charts.Pie` and the other built-in templates, and the charts (`hm.charts.Dumbbell`, `hm.charts.Waterfall`, `hm.charts.Candlestick`), are templates the browser expands from their definitions; a template of yours runs `build()` in Python, and the browser draws the components it built. Subclass `hm.Template`, build the pattern in `build()`, and call `hm.slot()` where the caller's children go:

```python
class Panel(hm.Template):
    def build(self, data, *, title=None):
        with hm.Data(data):
            with hm.Plot(title=title) as self.plot:
                hm.Frame()
                hm.slot()                  # the caller's children go here
                self.legend = hm.Legend()  # still drawn after them

with hm.Scene():
    with hm.Row():
        with Panel(penguins, title="Bills") as bills:
            hm.Points(x="bill_length", y="bill_depth", fill="species")
        Panel(penguins, title="Flippers")
    bills.add(hm.Line(x="bill_length", y="bill_depth"))  # also lands in the slot
    bills.plot.update(title="Bill size")
```

For a short pattern, decorate a function instead; calling it runs the function as `build()`:

```python
@hm.template
def panel(data, *, title=None):
    with hm.Data(data):
        with hm.Plot(title=title):
            hm.slot()

with panel(penguins, title="Bills"):
    hm.Points(x="bill_length", y="bill_depth")
```

- Calling a template builds it at once and attaches it to the active context, like any component. It is a node: it can be a positional child (`hm.Row(panel(a), panel(b))`), be removed from its parent, or be displayed on its own.
- `with template:`, `add`, `remove`, and `clear` act on the slot. Children keep the slot's position, so what `build()` creates after `hm.slot()` stays drawn on top, and `clear()` removes only the caller's children (so `clear(); with template: ...` rebuilds them).
- `children` lists the template's own top-level nodes; the caller's are `template.slot.children`. A class template can keep components as attributes (`self.plot` above) and add methods.
- `hm.slot()` is called once, inside `build()` or a helper function it calls. A template without it takes no children: `with` and `add` raise, as they do on a mark. A template may have several top-level nodes (two sibling marks, say).
- Events (`on_click`), selections, `endpoint()`, and `hm.connect(template)` use the template's *main part*: its only mark, wherever it sits in the pattern (the caller's children in the slot do not count). A template with several marks names one with `hm.contract(main=...)`, or these raise, naming the marks; call them on one part instead. Exports, cameras and camera events (`camerachange`) use the template's single top-level node, and `export_html` exports the template itself. References such as `Legend(target=template)` use a declared main part, else the single top-level node (a Legend falls back to the only mark when there are several).
- Keyword arguments `build()` does not take are props of the main part: `lollipop("day", "value", color="tomato")` colors the head below, so a single-mark template takes every option of its mark without listing them. A template with several marks and no main part takes only `visible=` (for all of its marks) and raises on other props. With a main part, the legend entry is the main part's (the other marks get `legend=False` unless they set one), and the other marks follow its visibility: hiding the head hides the stems, unless a part sets its own `visible=`. A class template's signature is its `build()`'s.
- `hm.contract(main=..., parts={...})`, called once in `build()`, declares the main part and names parts for `template.part(name)`, whatever their `name=` props. A keyword named after a part takes a dict of that part's props, `lollipop("day", "value", stem={"color": "gray"})`, which wins over the main part's keywords; so a part name may be neither a `build()` parameter nor a prop of the main part (a `build()` that takes `**kwargs` receives every keyword itself):

  ```python
  @hm.template
  def lollipop(x, y):
      stem = hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y)
      head = hm.Points(x=x, y=y)
      hm.contract(main=head, parts={"stem": stem})

  pop = lollipop("day", "value")
  pop.on_click(show)                      # the head's clicks
  pop.part("stem").update(color="gray")
  ```

  A template with no main part (a group) may declare its legend entries, `legend_entries=[{"label": ..., "swatch": mark, "parts": [marks]}]` (each key optional): an entry stands for its parts (default every mark), shows its swatch (default the first part) with the label (default the swatch's own), and one click hides all of its parts. Marks no entry lists keep their own entries.
- `update(**params)` re-runs `build()` in place with those parameters changed (other keywords go to the main part, as in the call): `pop.update(y="other")`. Components built again (matched by kind and position) stay the same objects with their ids and the callbacks you registered, so handles, references and connections keep working; their props come from the new build, so a settings-pane edit to one resets. Nested templates rebuild too (their own `update()` calls reset), the caller's children stay in the slot, and a failed build leaves the template as it was. Call it after the template's `with` block.
- The browser draws only a template's children (see [PROTOCOL.md](PROTOCOL.md)), so a templated scene renders exactly like the same scene written by hand. `visualize_tree` shows a template by its class name.

Two lighter patterns keep working when you do not need a reusable node: a `@contextlib.contextmanager` function that `yield`s where the body goes (a one-shot `with`; a bare call builds nothing), and a function that builds the pattern and returns the inner node to enter later. See `examples/58_templates.py`.

## Properties and data

Keywords are snake_case: `animation_duration`, `fill_scale`, `surface_mode`, `height_scale`. A camelCase keyword (`surfaceMode=`) raises a TypeError that names the snake_case spelling. The keys of dict options take snake_case too: `x={"tick_count": 5, "major_interval": {"unit": "day", "step": 1}}`, `placement={...}`, `brush={"axis": "y"}`, `viewport={"zoom_x": 2}`. A key the option does not have raises at construction, naming the accepted keys. The package's type stubs describe these dicts (`hm.AxisDefinition`, `hm.FramePlacement`, ...) and what a mark channel accepts (`hm.Channel`), so editors complete them and type checkers such as pyright check them. Each signature lists every keyword the component takes, its settings-pane options (`surface_mode`, `lit`) included, so a misspelled keyword is a type error as well as a run-time one. A keyword a component would ignore is refused: a transform takes no drawing settings. `axes2d=True` draws a 2D plot's axes and `axes3d=True` a 3D plot's box. Python plots default to 450 pixels high and automatic data bounds; set `auto_bounds=False` to keep the library's default bounds. An explicit domain (`x={"domain": [0, 1]}`) takes precedence.

A value in a column's place (a mark channel, an expression's argument, a column-name parameter such as `by=`) is one of four kinds, each with an exact accessor and, except literals, a string shorthand:

| Kind | Accessor | String |
|---|---|---|
| Column | `hm.col.weight`, `hm.col("weight")`; fails if the column is missing | `":weight"` (fails if missing), or `"weight"` |
| Input | `hm.input.bins` | `"$bins"` |
| State | `hm.view.time` | `"@time"` |
| Literal | `hm.literal("red")` | none |

In a mark channel a plain string is the column when there is one, else the literal (`fill="white"`). Inside an expression and in a column-name parameter it is always a column, and never an input. Elsewhere a string is literal (`title=":x"`). `hm.view` is a closed set, `hm.STATE_NAMES`: `selected`, `brushed`, `hovered`, `nearby`, `nearest`, `tooltip` and `any_` of each; `time`, `pointer_x`, `pointer_y`, `view_x_min` ... `view_y_max`; `dt` (a Simulate's step); `offset_x`, `offset_y`, `offset_z`. The accessors go wherever a column's name does: `hm.Sort(by=hm.col.species)`, `hm.mean("x", by=hm.col.g)`, `hm.Facet(row=hm.col.island)`. Casts type one use of a value, where a schema types a column: `hm.as_category(x, domain=[...])`, `hm.as_ordinal`, `hm.as_numeric`, `hm.as_datetime(x, unit="s", timezone="UTC")` and `hm.as_duration` (docs/DATA.md "Casts"); `hm.typed_column(values, type=...)` types one column. `hm.categorical(domain=[...], range=[...])` shares assignments across marks and plots.

Colors can come straight from data: `fill=hm.rgb("red", "green", "blue")` names three columns, and an N x 3 (or N x 4 with alpha) NumPy array works directly. Integer arrays are 0-255 and float arrays 0-1. A colormap may be a name, a list of colors, or `hm.colormap(colors, space="lab", positions=None)`, anywhere a colormap is accepted: `hm.continuous(colormap=...)`, `hm.ordinal(colormap=...)`, or a theme's `colormap`. A continuous scale without a colormap follows the enclosing theme's `colormap` (Viridis by default), and `scale.update(colormap=None)` returns to it. `hm.COLORMAP_NAMES` lists the built-in names. A scale's `transform` is "linear", "log", "sqrt" or "symlog" (with `constant`, linear within ±constant), on axes too (`y={"transform": "symlog", "constant": 10}`); `hm.continuous(colormap="RdBu", midpoint=0)` is a diverging scale whose halves meet at 0. A zero or negative under log is a missing value, not drawn. Maps take `projection="equal-earth"`, `"natural-earth"`, `"albers"` (with `parallels=[29.5, 45.5]`) or `"albers-usa"`; `projection_center=[lon, lat]` sets the central meridian (python/examples/74_map_projections.py).

`shape` accepts a shape name (23 built in, from `circle` and `star` to `triangle-down`, `circle-open`, `heart` and `pin`: see `hm.BUILTIN_SHAPES`), a column (`shape="species"`), or one name per row. `hm.register_shape(name, definition)` registers a custom shape: a polygon (`[x, y]` vertices in [-1, 1], y up, as a list or an `(n, 2)` numpy array) or SVG path data with curves, arcs and several subpaths; `view_box=[min_x, min_y, width, height]` fits a path drawn in its own coordinates (an icon's), and `fill_rule="evenodd"` makes holes. It checks the shape with the browser's rules and messages. A column named like a shape wins; `hm.literal("name")` forces the shape. Use `shape="column"` for a column of shape names.

Calendar functions read datetime columns: `hm.year`, `hm.month`, `hm.day_name`, `hm.time_floor("t", "1 month")` and the rest, each with `tz=`; a Bin over datetimes takes `interval="1 month"`; a Slider or Playback over dates (`min=hm.min("t")`) has a datetime value; `hm.Plot(x={"breaks": ["weekends"]})` leaves out weekends (docs/DATA.md "Time as data"). `hm.view.time` is the scene's clock in milliseconds (one for every Plot in the Scene, which its Playbacks and Simulates move with), on mark channels and in `Filter`, `Calculate` and transform parameters; `hm.interval(expr, ms)` steps what it reads every `ms` milliseconds, and `hm.floor`/`hm.round` round (`hm.round` stays out of `from hmplot import *`, as `hm.min`, `hm.max` and `hm.sum` do). `hm.tween(...)` in a Calculate column moves the data itself: a Filter or a Bin under it sees the values move. See docs/ANIMATION.md.

`hm.Provider(url=..., params=..., format="json" | "csv")` is a Data scope the browser loads: `{name}` in the URL is filled from `params`, assigning `provider.params = {...}` reloads it (the plot keeps the last result until the new one arrives), `await provider.refresh()` loads the same params again, and `refresh_interval=` polls. `provider.on_event("load" | "error", callback)` reports loads (`event.rows`, `event.ms`) and failures (`event.message`). `await scene.export_html()` embeds the loaded result; the browserless `hm.export_html()` exports the Provider live, with a warning. See docs/PROVIDERS.md, including CORS and why API keys never belong in the URL.

`hm.VectorTile(url="https://.../{z}/{x}/{y}.pbf", tile=(14, 9014, 4818))` loads vector map tiles named by their coordinates (`tile`, `tiles=[...]`, or `bounds=(west, south, east, north)` with `zoom`) and draws them as a basemap in a `Plot(coordinates="spherical", projection="mercator", tone_mapping=0)`; displayed on its own it is shown in such a map. In a Cartesian or 3D plot, `origin=(lon, lat), units_per_meter=...` draws the tiles in a local plane (meters around the origin) and `plane="xz"` lays them on the ground. `styles={"buildings": False, "water": {"fill": "#8fb8de"}}` hides or restyles parts, `source_layers={"parcels": "buildings"}` assigns a custom tileset's layers, and `tiles.update(tile=...)` loads other tiles while the plot keeps showing the current ones. In a 2D plot (the orthographic globe included) the tiles are live by default (`live=True`): as the view moves, the tiles it shows load at the nearest zoom (`min_zoom`, `max_zoom`), over the requested tiles, which stay where live tiles fail; live tiles need opaque styles. Under a 3D flyover camera (`hm.Plot(type="3d", camera_mode="flyover")`) with `origin`, `units_per_meter` and `plane="xz"`, the tiles lie flat on the ground and follow the camera at a zoom from its height, and their buildings stand from their height tags (`extrude_buildings=True`, the default; `False` draws flat footprints). Roads, landuse and place names show by zoom and kind, after VersaTiles' own style, with overlapping names left out. `attribution="© OpenStreetMap contributors"` draws the credit a tile license asks for, in the plot and its exports. `await scene.export_html()` embeds the tiles on screen as raw bytes (`tile_data`), so the page draws them offline and loads live tiles online; the browserless `hm.export_html()` exports the mark live, with a warning. See docs/VECTOR-TILES.md.

A Plot takes `lights=[hm.light("ambient", intensity=0.3), hm.light("directional", position=[3, 2, 4])]` for lit marks. The other light kinds are `"point"` and `"hemisphere"`; lights can also be adjusted in the settings pane. A Plot takes `effects=[...]` of `hm.effect(kind, ...)`: `hm.effect("sky", image=...)`, an equirectangular image around the camera (a URL, which the browser loads, or a file path, bytes or a PIL image, sent in its own encoding: a JPEG stays a JPEG), or a gradient (`zenith=`, `horizon=`, `ground=`); `hm.effect("fog", near=100, far=300, color="#dde4ee")` on a 3D Plot (world units from the camera; the color defaults to the background); and `hm.effect("bloom", strength=..., radius=...)`, how marks with `glow=` (0, the default, does not glow) bloom. A spherical Frame takes `atmosphere=True` or `{"color": ..., "thickness": 0.1}`. All are drawn after the scene, so they never change picking or the axes. With any of them (a bloom effect alone does nothing) `export_svg` and `export_pdf` draw all of the plot's marks, with the effect, as one image, keeping its axes, titles and legends vector, and `mode="vector"` refuses it; `export_png` includes them. See `examples/62_solar_system.py`.

`hm.Table` accepts column dictionaries, row dictionaries, 2D NumPy arrays, pandas, Polars (a `LazyFrame` is collected, with a warning), pyarrow Tables and RecordBatches, and GeoJSON FeatureCollections. `hm.Table.from_parquet(path, columns=["x", "y"])` reads a Parquet file (only the named columns when given), and `hm.Table.from_arrow(table)` any Arrow table, including a Polars or DuckDB result; both need `pip install "hmplot[arrow]"`. Arrow columns keep their types: integers stay exact on the wire (int64, and uint64 for unsigned 64-bit integers, with missing rows beside the values), timestamps their unit and time zone (as Polars Datetimes and pandas pyarrow-backed columns do), dictionaries their categories and order (a Polars `Enum` its declared order), and missing values (pandas `NA`, Arrow nulls) stay missing. NumPy table columns are named `"0"`, `"1"`, etc. Arrays are copied at update time and transferred as separate binary resources. Only changed columns are replaced. Strings and booleans use category dictionaries; missing entries remain missing. Numerical execution is float32; overflow is rejected. Convert Python JAX/PyTorch/CuPy device arrays to host NumPy explicitly. There is no shared GPU memory between Python and the browser.

`hm.Join(data=table, on="key")` adds a second table's columns to each row by key, many to one (`left_on=`/`right_on=` for keys named apart, `fields=` to pick columns, `as_=` to rename them, `how="inner"` to hide unmatched rows); see docs/DATA.md "Joining tables" and python/examples/76_join.py.

A channel takes a column by name (`y="width"`) or the column itself: a NumPy array, a pandas `Series` or `Index`, a Polars `Series`, or anything else NumPy converts (`__array__`). A Series converts as the same column of a `Table` does (a category dtype stays categorical, a tz-aware one a datetime), and a named Series titles its axis with its name. Rows are matched by position; a pandas Series whose index differs from the plotted DataFrame's raises, since a reordered Series would otherwise pair values with the wrong rows (`s.reindex(df.index)` aligns it, `s.to_numpy()` keeps positions). A DataFrame is a table: pass it as `data=`.

```python
table = hm.Table(frame)
with scene.batch_update():
    table.update_columns(x=new_x, y=new_y)
    points.update(size=10, opacity=0.8)
await scene.when_settled()
await scene.when_animations_finished()
```

`when_settled` waits for preparation and uploads; `when_animations_finished` also waits for targets. `scene.pending`, `scene.status`, and `scene.error` expose state. In-place changes to input arrays are not observed.

## Climate data

NetCDF files and xarray datasets load as grid tables (docs/DATA.md "Grid tables"): a row per cell of the variables' dimensions, with the variables as columns and the coordinates as columns the browser computes from their 1-D values, so only the variables' values travel. `pip install "hmplot[netcdf]"` installs xarray, netCDF4 and cftime.

```python
sst = hm.Table.from_netcdf("ersst.nc", time="2015-12")        # variables=..., then .sel(**selection)
field = hm.Table.from_xarray(ds[["tas", "pr"]].sel(lev=850))    # a Dataset or DataArray
```

- The selected variables must share their dimensions (load others as separate tables). CF decoding (scale and offset, fill values, times) is xarray's; missing values stay missing, and a Heatmap leaves their cells blank. CF bounds (`lat_bnds`) become the cells' edges.
- Each variable's `long_name` and `units` become its display name ("Near-surface air temperature (K)"), which axis titles, legend titles and tooltips show; a coordinate's too.
- Times become datetimes where every date exists in the Gregorian calendar (standard, proleptic_gregorian, noleap). Times in the 360_day and all_leap calendars stay days since their reference date, and their axes, calendar functions and bins read them in that calendar (dates such as 30 February on the axis). A warning names `ds.convert_calendar("standard", align_on="year")` for comparing them with Python dates.
- Two-dimensional latitude and longitude coordinates make a curvilinear grid, which a Heatmap draws on its own cells. Longitudes stay as given (0 to 360 or -180 to 180); maps and the globe wrap them.
- A dimension of one coordinate (a month selected by `time="2015-12"`) counts as sliced. A Heatmap draws two dimensions of a grid; `hm.Slice(field="time", at=...)` takes the others away, blending between steps on the GPU.
- A variable larger than the GPU's storage-buffer limit is refused before anything is sent, naming `.sel`, `.isel` and `.coarsen`: the limit the browser reports, else WebGPU's guaranteed 128 MB.

`hm.stream(path_or_dataset, dim="time", at=hm.input.month)` is a grid table of one slice at a time: the dataset stays in Python, and when the input moves the slice at its value is loaded off the notebook's event loop and replaces the table's variables (the coordinates are not sent again). The latest value wins, so a fast Playback skips the slices it passes, and while it plays the next slice is loaded ahead. The input's value is a position along `dim` (`hm.Playback(name="month", min=0, max=sst.size - 1, step=1)`), or with `by="value"` the nearest coordinate. `stream.coords` are the dimension's coordinates and `stream.close()` stops it. An HTML export carries the slice showing when it was made.

An anomaly is a Calculate with a reduction by the grid's dimensions, which reshapes the grid instead of grouping it: `hm.Calculate(anomaly=hm.col.sst - hm.mean("sst", by=["lat", "lon"]))` subtracts each cell's mean over time. A Hovmöller diagram slices a latitude away and draws time against longitude: `hm.Slice(field="lat", at=0)` around `hm.Heatmap(x="lon", y="time", fill="anomaly")`. python/examples/80_netcdf.py does all three with NOAA's ERSST v5 sea-surface temperatures.

## Inputs

Inputs take keyword arguments: `hm.Slider(name="threshold", min=0, max=10, step=1, value=5)`, `hm.Select(name="metric", options=["length", "width"])`, `hm.Select(name="chosen", options=["a", "b"], value=["a"], multiple=True)`, `hm.Checkbox(name="running", value=False)` and `hm.Button(name="reset")` (its value counts presses). `hm.Playback(name="year", min=1950, max=2020, step=5, rate=10, loop=True, autoplay=False)` is a slider that plays: play advances the value by `rate` value units per second (one `step` every step/rate seconds), at `max` it stops or wraps (`loop=True`), and reset returns to its first value; `playback.play()`, `pause()` and `reset()` do the same from Python, and `playback.playing` follows the viewer's presses. Each has an optional `label`. An input sends its value up to its input context, the Scene, and everything in the Scene reads it by name:

```python
with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Select(name="metric", options=["length", "width"])
        hm.Slider(name="threshold", min=0, max=10, value=5)
    with hm.Data(table):
        with hm.Filter(where=hm.col.weight > hm.input.threshold):
            with hm.Plot(title=hm.input.metric):
                hm.Points(x="$metric", y="height")
```

`hm.input.threshold` reads an input anywhere: inside an expression it is the value, and as a whole property it is replaced by the value, so a Select of column names in `x` chooses the plotted column. The string `"$metric"` reads an input where a string names a column (a mark's channels, a transform's column parameters); elsewhere a string is literal, so `title="$GDP"` is a title. Input values are never columns. `hm.is_in(hm.col.species, hm.input.chosen)` keeps the rows a Select with multiple=true chose.

A moved input re-runs its readers once, and the change animates like any other data change. A read inside an expression is a constant there, so a new value compiles nothing on the GPU.

An input inside a Data scope can read its options and range from the data: `hm.Select(name="species", options=hm.categories("species"))`, `hm.Select(options=hm.column_names())`, `hm.Slider(min=hm.min("x"), max=hm.max("x"))`. They are read once, and again when the data changes; until then the input is pending and its readers wait instead of drawing with a stand-in value. When the data moves the range, the value is kept inside it. `input.value` is `None` until the browser has read it.

`hm.InputContext()` is an input context of its own: its inputs' names do not reach outside it, and an inner name shadows an outer one. Each Template instance is an input context too, so two copies of a template with a slider do not clash. Inputs go beside Plots (in a Row or Column), not inside them. The scene checks every read when it is built: a misspelled name raises, naming the reader and the inputs in view. `input.value` is the viewer's latest value, sent back from the browser without a new revision; assigning it sets it in every view. `input.on_change(callback)` runs after each change with `event.value`. Copying a value (`bins=slider.value`) does not follow the input; pass `hm.input.bins`.

## Events and views

```python
import ipywidgets as widgets
from IPython.display import display

status = widgets.HTML(value="Click a point")

def inspect(event):
    status.value = f"Selected row {event.source_index}"

points.on_click(inspect)
display(plot, status)
```

Dragging: `drag=True` on a point mark makes its rows draggable. A drag writes offsets on the table's rows (the table itself never changes), and a view follows where it reads `hm.moved(column)`. `table.offsets` is a DataFrame of the offsets (key, column, delta), updated as the browser drags; `table.apply_offsets()` returns a new Table with the moved values; `table.set_offsets(column, deltas)` and `table.clear_offsets()` change them from Python. `points.on_event("drag" | "dragend", callback)` reports `event.keys` and `event.changes` (drag events are throttled to 30 Hz). See `examples/63_dragging.ipynb`.

`on_hover` is opt-in and throttled to 30 Hz. Callbacks may be async. Events carry view and revision identity. Panning, zooming, dragging, transforms and animations run locally while Python is busy.
`event.frame` is the node whose coordinates `event.data_coordinates` use: the nearest enclosing `Frame`, or the `Plot` itself for a mark placed directly in it. It is found in the Python tree, so it is always a node you created. A `Facet` creates its cells in the browser and has no Python node per cell, so for a mark inside a Facet (embedded in a Plot or not) `event.frame` is the node around the Facet, usually the Plot, while `data_coordinates` are in that cell's own scale; use `event.facet_cell` to tell the cells apart.
`print()` inside a callback is not reliably attached to a completed notebook cell; update a displayed widget or use `ipywidgets.Output` for visible feedback.
If a callback raises, the exception is logged with its traceback through the `hmplot.core` logger. `scene.error` holds the latest failure and `scene.errors` the last ten.

In 3D, `camera_position`, `camera_target`, `camera_up` (lists, tuples, or NumPy arrays of three numbers), `camera_fov`, `camera_near`, `camera_far`, `camera_mode="orbit" | "flyover"`, `fly_speed` and `flyover_momentum` (a released flyover drag glides on; default `True`) set the camera. `await plot.get_camera()` returns `{position, target, up, fov, near, far, zoom, mode}` and `await plot.set_camera(position=[...], animate=True)` merges a partial state (a dict or keywords), easing when `animate` is set. `plot.on_event("camerachange", callback)` runs after the camera moves (at most once per frame) with the state in `event.camera`; `event.target` is the Plot. On a Plot repeated in Facet cells, `set_camera` moves every cell and `get_camera` reports the first.

`hm.LinkViews(a, b, axes="x")` links compatible 2D views. Cameras remain local to a widget view. Displaying a scene twice shares accepted data/configuration; pass `view=...` to commands when multiple views exist (`scene.views` lists them).

```python
await plot.export_png("plot.png", scale=2)
await scene.export_png("dashboard.png", scale=2)
scene.close()
```

No filename returns PNG bytes. Scene exports use GPU plot exports and include titles and standalone 2D minimaps, excluding controls and navigation gadgets. `export_svg` and `export_pdf` (on a displayed view, or `hm.export_svg` and `hm.export_pdf` without one) keep axes, text, legends and most 2D marks as vector shapes and draw the rest as images at `raster_dpi`: docs/DOCUMENT-EXPORT.md ("What is not vector") and the docs' export guide list what, and `mode="vector"` refuses a figure that has any. Closing releases callbacks and widget resources. Declarative scenes can also export self-contained HTML; Python callbacks are omitted from that file. The page shows a snapshot of the scene first (`snapshot="svg"`, `"png"` or `False`) and keeps it where WebGPU is missing; `hm.export_html()` draws that snapshot in the export session's headless browser (see docs/DOCUMENT-EXPORT.md, "HTML exports"). In a notebook, `await scene.export_html()` exports a page too large to send from the view to the kernel (Jupyter's server closes the connection on a message over 10 MiB) headlessly instead, as `hm.export_html()` does, with a warning: from the scene as Python has it, not the view's pan, zoom or settings edits. The headless Chrome runs in its sandbox; where it cannot (Chrome for Testing on Ubuntu 23.10 and later quits with "No usable sandbox!"), install Google Chrome from its `.deb` package, or set `HMPLOT_CHROME_NO_SANDBOX=1` to run it unsandboxed, accepting that a page exploiting a Chrome bug would run with your rights (docs/DOCUMENT-EXPORT.md, "The export browser"; SECURITY.md).

Tooltips (docs/GUIDES.md, "Tooltips") are a mark setting: `tooltip=True` lists the columns the
mark's channels read, and a list picks the fields, each a column name or
`{"field", "label", "format"}`; `{"radius": 24}` sets how near the pointer a row is found. A Plot's
`tooltip=` is its marks' default, and `tooltip={"mode": "x"}` lists every series' value at the
pointer's x. The box is drawn in the browser, never exported, and needs no Python round trip (see
python/examples/78_tooltips.py). The row it shows is `@nearest` (`hm.view.nearest`), which
`nearest=True` (or `{"radius": 24}`, or a `hm.selection()`) sets without a box: the row under the
pointer, else the nearest drawn row within the radius, where `hover` takes only the row exactly
under it.

## Checking a plot without a notebook

`hm.check(plot)` draws a scene headlessly, in the Chrome the exports use, and returns what it
drew: the errors (Python's validation and every error the browser showed, each naming the
component and what to pass instead), each plot's marks with their row counts and columns, its
axes' ranges and size, warnings (marks that drew no rows, what SVG and PDF exports draw as images)
and a PNG. `print(result)` shows it as text; `result.save_png("plot.png")` writes the picture.
`timeout=60` gives each wait for component preparation or first-frame readiness 60 seconds,
including the initial mount. Large scenes on software WebGPU may need a larger value; it is
not an overall deadline for resource loading and image export.

```python
with hm.Plot(data={"x": [1, 2, 3], "y": [3, 1, 2]}, axes2d=True) as plot:
    hm.Points(x="x", y="y")
result = hm.check(plot)
print(result)        # check: 1 plot drawn, no errors. / Points: 3 rows; x: x, y: y / ...
```

From a shell, `hmplot check plot.py` (or `python -m hmplot check plot.py`) runs a program as a
notebook cell runs and checks the plot it ends with, prints the summary (`--json` for JSON), saves
`plot.check.png` and exits with 1 when the program raised or the check found errors.

## Developing

From the repository root, install the package editable into the environment you develop and run notebooks with, so every interpreter and kernel imports this checkout rather than a stale copy of an earlier install. The notebook and export bundles (`hmplot/static/widget.js` and `standalone.js`) are built from the JavaScript sources, not kept in git: building the package from a checkout without them runs `npm run build:python` (`python/hatch_build.py`), which needs Node.js and `npm ci` first. Rerun `npm run build:python` after changing the JavaScript.

```sh
npm ci
python -m pip install -e python
```

Then:

```sh
python3 scripts/generate-python-api.py
npm run build:python
python -m build python
PYTHONPATH=python pytest python/tests
```

See `examples/` for executable notebooks. The scene adapter lives in `src/lib/scene` and uses the same registered library components as Svelte applications. See `PROTOCOL.md` for transport details.

The Node generator reads component exports through the TypeScript AST, public prop types,
options metadata and runtime enumeration declarations. `python3 scripts/generate-python-api.py`
is a wrapper for `node scripts/generate-python-signatures.mjs`, which writes all API outputs.
Each registry component declares its accepted `properties` and `runtimeOptions`; there is no
global-name fallback. Construction, updates and browser edits use the same declarations, and
`Template`/`Slot` accept no properties. Browser settings aliases are normalized to public patches
before validation, preserving mapped channels and explicit scale resources. Undeclared internal
names are rejected. `npm run check:python-signatures` checks every generated file for staleness;
`python/tests/test_api_consistency.py` checks the contract from Python. Regenerate after changing
public declarations and inspect the diff. [API generation](../docs/API-GENERATION.md) documents
the inputs, settings adapter and complete list of removed accidental global names.

## Verification

Run `PYTHONPATH=python pytest python/tests` for construction and protocol tests. With the development server running, `node tests/notebook/scenes.mjs` and `node tests/notebook/interactions.mjs` check scene publication, resource reuse, GPU PNG pixels, picking, inputs, and linked navigation. Set `HEATMAP_TEST_URL` when using a different port. Rebuild fixtures with `python scripts/generate-notebook-fixtures.py`.

GPU marks use browser-resident tensors. The existing generic `Surface` mark retains its mesh-preparation behavior; direct Python source buffers are reused for this preparation without a GPU readback. Use `Heatmap(surface_mode=True)` for fully GPU-based regular surfaces, especially after browser transforms.

### Data shortcuts and coordinate frames

`Plot(data=table)` and `Facet(data=table)` introduce the same
scope as `Data(table)`. Plot remains compatible with existing flat scale options.
Use sibling Frames inside Plot for twin axes; one Plot owns one renderer. `Axis` remains
available as a compatibility alias.

```python
with hm.Plot(data=measurements) as view:
    with hm.Frame(x={'domain': [0, 24]}, y={'domain': 'auto', 'label': 'Temperature'}):
        hm.Line(x='hour', y='temperature')
    with hm.Frame(x={'domain': [0, 24], 'visible': False},
                 y={'domain': 'auto', 'label': 'Rainfall', 'side': 'right'}):
        hm.Line(x='hour', y='rainfall')
view
```

`hm.charts.Histogram(x='value', bins=24, normalization='density')` composes the existing
Bin/Rect pipeline. Use `y` for horizontal bars. Examples 10–12 cover frames,
histograms, facets, categories, and 3D axes.

### JSON themes

Built-in presets live in `src/lib/plot/themes/*.json` in the source tree. Edit one there, then run `python scripts/sync-themes.py` before building the Python wheel. For your own theme, save the same JSON structure and call `hm.load_theme("my-theme.json")`; use the returned resource with `hm.Theme(value=...)` or `hm.Scene(theme=...)`. A theme can inherit from another and name only its differences: `hm.create_theme("Desk", extends="finance-terminal", palette=[...])`, `extends=` another theme resource, or `"extends": "dark"` in JSON. `extends` can also be a list merged left to right, a preset and then partial themes that each change one section: `extends=["paper", "axes/minimal", "legend/inline-top"]` (the reference's "Compose themes" lists them). A theme's `vector_tile` section is the basemap scheme `hm.VectorTile` uses below it; every preset has one, and `hm.VectorTile(scheme="sea")` picks a preset's scheme directly. The source tree includes `theme.schema.json` for editor completion and validation.

A standalone Python mark can be displayed with its own `data=` argument, for example `hm.Points(data=table, x="x", y="y")`. This convenience creates one implicit Plot when displayed. The implicit Plot shows tooltips on hover (a mark's own `tooltip=False` wins) and the automatic legend when the mark has something to explain: a `label`, or a fill, color, size, shape, opacity or outline color read from a column or an expression. Use an explicit Plot for composition, camera settings, and multiple marks; an explicit Plot's legend stays off unless you ask for it.

A Facet around marks makes the cell Plot they need: `with hm.Facet(data=df, column="group"): hm.charts.Histogram(x="x")` is a grid of small multiples, exactly as if `hm.Plot()` were written between them, wherever the Facet sits (alone, in a Row, in a template), and with transforms between the Facet and its marks (`Facet > Bin > Rect`). The cell Plot takes no options: write it to set a height, axes or a legend. A Facet holding both a Plot and marks outside it is an error, and a Facet inside a Plot (embedded) is unchanged. `facet.children` keeps the marks you wrote, and `hm.visualize_tree` shows the cell Plot as implicit. This is a Python shorthand: in Svelte, write the Plot.

`hm.GraphData(nodes=people, edges=links, node_key="person_id")` pairs node and edge tables. `hm.Nodes()` and `hm.Edges()` select ordinary tables for transforms and marks. When nodes should be inferred, omit `nodes=`: `hm.GraphData(edges=links)`, or `hm.GraphData(source="source", target="target")` inside Data, whose table is then the edges. Its `reduce=` (with `node_from=`) adds node columns aggregated from edge attributes, to inferred or supplied nodes. Layouts consume graph data and keep their algorithm settings; endpoint mappings and node tables belong to GraphData. Nodes no longer has a separate `data`/`key` join; use ordinary `hm.Join()` inside it.

Supplied `hm.Table` resources retain their observation key and interactions; `node_key` separately names the graph endpoint IDs. A mark under Nodes exposes that node Table's `.selection`, `.brush`, and `.hover`, while Edges uses the edge Table. Inferred nodes have no Python host Table for direct resource access: use explicit GraphData nodes when Python needs their selection. Browser interactions remain available for inferred nodes.

Positioned graphs need no Graph layout: supply node `position`, or `x`/`y` columns directly or via Calculate inside Nodes. Edges lazily gather current coordinates. `hm.DAG` and `hm.Routes()` draw layered links. `hm.Tree(mode="partition")` emits icicle/sunburst bounds, and `hm.Sankey` plus `hm.Flow` draws weighted networks. See examples 50, 53, 54 and 55.

Dendrograms come from a precomputed clustering. `hm.linkage_table(Z, labels)` turns a scipy linkage matrix into Tree's tables and returns a dict of plain lists: `"edges"` (`source`, `target`: each merge's two children), `"nodes"` (`id`, `label`, `height`, `count`; leaves 0 to n - 1 with height 0, then merge i as node n + i with its distance) and `"root"`. `hm.Tree(mode="cluster", height="height")` draws it to scale, with the leaves at 0, 1, ... in the order `leaves_list(Z)` gives, so `X[leaves_list(Z)]` lines a heatmap's rows up with them; the Tree's `order` node column is each leaf's place. Right-angle links are `hm.Segments(curve="step-after")` for `orientation="down"`/`"up"` and `curve="step-before"` for `"left"`/`"right"`:

```python
from scipy.cluster.hierarchy import linkage
Z = linkage(X, "average")
tree = hm.linkage_table(Z, labels)
with hm.GraphData(nodes=tree["nodes"], edges=tree["edges"]):
    with hm.Tree(root=tree["root"], mode="cluster", height="height"):
        with hm.Plot():
            with hm.Edges():
                hm.Segments(start="start", end="end", curve="step-after")
```

Example 71 is a clustered heatmap (seaborn's clustermap) with dendrograms on both margins.

`hm.Pack` and `hm.Treemap` lay out a connected hierarchy with a `root` and optional node `value` expression. Pack exposes circle radius `r` and centers; Treemap exposes rectangle bounds. See examples 56 and 57.

To inspect a component hierarchy, evaluate `hm.visualize_tree(plot)` (or pass a Scene, transform, or mark). It returns a separate Plot, drawn with the built-in Tree layout, that labels component kinds and colors each by its component's group (the reference's groups). Hovering a node shows a tooltip (its kind, the props set on it, the columns and inputs it reads, a table's rows and columns, a template's class) and highlights the path from it to the root and its subtree. The highlighting is the library's own interaction: each node's row holds its depth-first place and the last place in its subtree, a `Calculate` over `@nearest` (the row the tooltip shows) marks the pointed node's ancestors and descendants, and a `Filter` of them draws the path's edges. Pass `split_facet=True` to show each Facet cell as its own branch containing the repeated plot definition. Cell names use row and column values from the Facet's Data table; numeric facet fields need an explicit `row_order` or `column_order`.
