# Named data and categories

`Data` is a context provider, not a renderer or a dataframe engine. It accepts arrays of row objects or objects of columns. Columns may be host arrays, typed arrays, or GPU-resident JAX arrays. Nested Data components replace the table scope.

```svelte
<script>
  import { Plot, Data, Points, Legend, categorical, literal } from 'hmplot';
  const colors = categorical({domain: ['Control', 'Treatment'], range: ['#547ba2', '#cf8955']});
  const groups = categorical({domain: ['Control', 'Treatment']});
  const rows = [{group: 'Control', value: 2}, {group: 'Treatment', value: 4}];
  let points = $state();
</script>
<Plot x={{ scale: groups }} y={{ domain: [0, 5] }} axes2d>
  <Data value={rows}>
    <Points bind:this={points} x="group" y="value" fill="group"
      fillScale={colors} outlineColor={literal('white')} />
  </Data>
  <Legend for={points} channel="fill" label="Group" />
</Plot>
```

### Generated data

`Data(rows=N)` supplies a row count and ordinary index-based identity without allocating
placeholder columns or uploading a table. Pass a table or a row count, not both. Counts are
integers from 0 to 2147483647; generated arrays are still limited by device memory.

Use `row()` (`hm.row()`) for zero-based positions among the current visible rows, numeric
constants for zeros or ones, and `random({seed: 7})` (`hm.random(seed=7)`) for seeded draws.
Calculate columns before Filter/Sample to retain source-row values. For example:

```python
with hm.Data(rows=10000):
    with hm.Calculate(columns={"index": hm.row(), "noise": hm.random(seed=7)}):
        hm.Points(x="index", y="noise")
```

Calculate owns and reuses the generated arrays. Equal random seeds and row counts reproduce
the same draws; use different seeds for independent streams. See the paired `constant-data`
example and `python/examples/82_constant_data.py` for a simulation.

### Data loaded asynchronously

`Provider` is a Data scope whose table is loaded from explicit `params` (a REST query that
follows a slider, a file chosen by name): `<Provider url={"/data/{year}.csv"} format="csv"
params={{ year }}>`, or `source={{ load: async ({ params, signal }) => ... }}`. The last result
stays on screen while the next loads, a newer request aborts the one in flight, errors keep the
previous result, and plots below wait for its loads in `whenSettled()` and exports. See
docs/PROVIDERS.md.

### Explicit references to a pipeline (TODO 142)

A data scope reaches marks two ways, both through `DATA_CONTEXT`: by ancestry (a Data, a
transform and the marks inside them), or by an explicit reference, `<Plot data={handle}>`
or `<Data value={handle}>` (Python `hm.Plot(data=node)` or `hm.Data(value=node)`), anywhere else.
A Plot's `data` supplies the default table to its descendants; an inner Data or a mark's own
`data=` replaces it for that branch or mark. The data dependency is the reference; the visual parent
is wherever the Data is. Before (context only), one Filter > Group drawn in two Plots ran
twice, once inside each Plot:

    Data(sales) > Filter > Group > Plot A > Points
    Data(sales) > Filter > Group > Plot B > Points

After, it runs once and both Plots read its output, each mark still under its own Plot:

    Data(sales) > Filter > Group (totals)
    Row > Plot A(data=totals) > Points
        > Plot B(data=totals) > Points

What a reference reuses rather than adds: the transform's runs are a component-independent
runner (`utils/transforms/transformRunner.js`: serialized runs, superseded requests dropped
before they start, publication under the change they serve, retirement of the replaced output
one tick later), and its handle's `dataSource()` is the provider its children read through
context (`current()`, `read()`, `domainSource()`, and `adopt(view)`, the clock adoption a view
under it would make). Views keep retaining what they read, so removing a reader disposes
nothing of the others'; unmounting the transform retires its output, and a referencing Data
then shows nothing. Facet cells still replay a pipeline per cell (`facetEngine.js`); a
reference reads the one output it names. The connections are fixed when made, so the data
graph is acyclic by construction; a transform whose input derives from its own output stops
with an error rather than loop. A Join's `data` (TODO 140) takes the same references.

## Field resolution

A value in a column's place (a mark channel, an expression's argument, a column-name parameter
such as Sort's `by`) is one of four kinds. Each has an exact accessor and, except literals, a
string shorthand:

| Kind | Accessor (JS / Python) | String |
|---|---|---|
| Column | `col.weight`, `col("weight")` / `hm.col.weight`; fails if the column is missing | `":weight"` (fails if missing), or `"weight"` |
| Input | `input.bins` / `hm.input.bins` | `"$bins"` |
| View state | `view.time` / `hm.view.time` | `"@time"` |
| Literal | `literal("red")` / `hm.literal("red")` | none |

- In a mark channel a plain string is the column when there is one, else the literal: `fill="red"`
  is a column named red if one exists, otherwise the color red. `literal("red")` is always the
  color, and `":red"` or `col.red` always the column.
- Inside an expression and in a column-name parameter a plain string is always a column. It is
  never an input, so a column added later cannot change what a slider read means.
- Strings are names only in a column's place. Elsewhere a string is literal: `title=":x"` is the
  title ":x", and names and labels stay literal.
- Each accessor is an expression of its own, so `col("$price")` reads a column named `$price`.
  Data columns may not start with `@`, which names state. Any other `@` name (`"@focus"`) is a
  column an `Interaction` names (`columns={{"@focus": selection}}`); it is read like a column
  and fails where no Interaction around the reader has it.
- `view` is a closed set, and an unknown name fails at once with the list: `selected`, `brushed`,
  `hovered`, `nearby`, `nearest`, `tooltip` and `any_` of each (interaction); `time`, `pointer_x`,
  `pointer_y`, `view_x_min`, `view_x_max`, `view_y_min`, `view_y_max` (the view); `dt` (a
  Simulate's step); `offset_x`, `offset_y`, `offset_z` (drag offsets of the column a mark's x, y
  or z names).
- The accessors go wherever a column's name does: `by={col.species}`, `mean("x", {by: col.g})`,
  `moved(col.weight)`, `categories(col.species)`, a reducer's `field`, a Facet's `row`.
- In JavaScript, `col`, `input` and `view` can be called or read by property. Every property is
  a name (`col.name` and `col.length` are those columns), except `then`, so `await` does not take
  them for promises. `shape` is a channel like `fill`: a shape name such as `shape="circle"` sets one symbol for the mark, a column name such as `shape="group"` maps categories to symbols (customize with `shapeScale={categorical({range: ['circle', 'triangle']})}`), and an array of shape names sets one symbol per row. As with `fill`, a column wins over a shape name spelled the same (`literal('circle')` always means the symbol), whether the name is built in or registered anywhere on the page. A theme's `shape` is always a symbol name. Register custom polygons with `registerShape(name, vertices)` (see the shape reference).

Column names also title axes: an axis without a label is named after the one column its marks plot there. Aliases name the column they are (a Facet's `value` is its field; a Pairs cell's `x` and `y` are its fields), and transform outputs declare theirs (a Bin's edges are the binned field, a Stack's bounds its y, a Density's points its x). Raw arrays and expressions are unnamed, so an axis that plots one has no automatic title.

Use either `position` or separate `x`, `y`, and optional `z`. Arrays still work directly without Data. Marks validate row counts before replacing their current attributes. Replace the table or column references to update data; arbitrary in-place mutations are not tracked.

## Category mappings

String and boolean color columns infer a category scale; numeric columns stay continuous unless given an explicit categorical scale. Inferred scales append categories in first-seen order and preserve previous assignments. An explicit domain fixes order and membership. Color scales inferred from the same named column share assignments within a Data scope. Share a `categorical()` object to share assignments between scopes or plots.

The default palette is `#547ba2`, `#cf8955`, `#7b9865`, `#a278a4`, `#c4a451`, `#579b9a`, `#bc7180`, `#838997`. Default symbols are circle, triangle, diamond, square, hexagon, plus, cross, and star. Finite palettes repeat. Missing or unknown categories use `#92989f` or circle. Unknown positional categories are omitted.

Category columns can also drive `size`, `width`, `opacity`, and (on point marks) `outlineColor`. Give `sizeScale`, `widthScale`, or `opacityScale` a `categorical()` or `ordinal()` scale with a numeric range, or let the categories spread over sizes 5-16, widths 1-6, and opacities 1-0.3.

## RGB colors from data

When the data already holds colors, give `fill`, `color`, or `outlineColor` an object naming red, green, and blue columns, or an N x 3 array:

```svelte
<Points x="x" y="y" fill={{ r: "red", g: "green", b: "blue" }} />
<Points position={points} fill={rgbRows} />   <!-- N x 3, or N x 4 with alpha -->
```

Integer data (typed integer arrays, integer GPU arrays, NumPy integer columns) is 0-255; float data is 0-1. All components must be the same kind, and values outside the range raise an error that names the channel instead of being clamped. An optional `a` component or fourth column is per-row opacity on Points, Points3D, and Text, multiplied into the mark's `opacity` (a number, an array, or a column); other marks, and `outlineColor`, reject it. RGB colors bypass scales, colormaps, and category legends; a `fillScale`, `levels`, or `quantize` given alongside is ignored with a warning.

Limitation: WebGPU gives a draw 8 vertex buffers, and every per-row channel of a point or label mark takes one (position, size, per-row colors, per-row outline colors, a shape channel, offsets, text, per-row opacity). A Text fits per-row position, text, and RGBA colors, but not a per-row size or offset on top of them; Points fits RGBA fill with an RGB outline, but not per-row size on top of them. A Line fits per-row color, width, and opacity together (dashed too: its dash distances are a storage read), and Segments, Arrows3D, and Arrows fit all three. Points, Text and segment marks read a few channels past the limit from storage buffers instead (a connector Line with Dodge offsets as well as all three draws). A mark further over the limit reports an error naming itself and its per-row channels; give one of them a single value. Python uses `hm.rgb("red", "green", "blue")` or a NumPy array. Plots draw colors exactly by default (no tone mapping); `toneMapping={4}` (ACES filmic) desaturates them for a photographic look. Raster colors go to `Image` (`data` of shape [height, width, 3 or 4], same integer/float rule); `Heatmap` maps one value per cell and rejects an RGB grid.

## Custom colormaps

Wherever a colormap name is accepted (`continuous()`, `ordinal()`, a mark's `colormap`, a theme's `colormap`), a list of at least two opaque colors or `{colors, space, positions}` also works. Colors interpolate in Lab unless `space` is "hsl" or "srgb"; `positions` place each color on [0, 1] (evenly spaced positions are the default). Colors with alpha are rejected, since the colormap texture, legends, and exports are opaque; use the mark's `opacity` instead. A theme's `colormap` is the default for continuous fills without an explicit colormap.

Categorical axes use category centers 0, 1, … with half-step bounds. Set a Plot's `x={{ scale }}`, `y={{ scale }}` or `z={{ scale }}`; axes remain Cartesian and linear. A Plot's `zScale` is a number, the surfaces' height exaggeration. No sorting, grouping, stacking, aggregation, or jitter is implied. Lines connect the supplied row order.

## GPU dictionary columns

```js
const table = {
  x: gpuX,
  y: gpuY,
  group: {codes: gpuIntegerCodes, categories: ['Control', 'Treatment']}
};
```

Codes index the supplied dictionary; out-of-range, fractional, and nonfinite codes are unknown. Encoding, palette lookup, and visibility masks stay on the GPU. Numeric GPU values can also use an explicit numeric categorical domain. No GPU category-discovery readback is performed.

## Guides and editing

`Legend for={mark} channel="fill"` (or `color`, `shape`, `outlineColor`, `size`, `width`, `opacity`) describes category mappings; see docs/GUIDES.md for combined swatches and continuous ramps. Click or keyboard-activate entries to hide categories; Shift-activate to isolate, then repeat to restore. Visibility belongs to that mark, even when its mapping is shared. Hidden observations keep original indices, and connected paths break at hidden rows.

Category labels, palette entries, symbols, and unknown colors are editable in the Categories section of the mark settings. Editing an explicitly shared scale changes all its consumers. Series legends remain separate. Embedded guides are included in PNG exports; minimaps reuse mappings without guides.

The Examples gallery contains the complete copyable component, including row/column replacement, categorical axes, symbol legends, and GPU dictionaries.

Categorical color channels are supported on point marks, lines, segments, arrows, links, and uncertainty marks. Heatmap/image category grids and per-glyph categorical text are not supported; these combinations report an error instead of rendering an incorrect mapping. Their existing numeric tensor and literal appearance inputs remain available through Data.

## Logical column types

`schema` declares interpretation separately from physical storage and shape. It is
available on `Data`, `Plot`, and `Facet`; Python `Table` accepts it too.
Pandas categorical, nullable boolean, datetime, duration, and index metadata are
carried into the browser automatically. Date-looking strings stay categorical
unless declared otherwise.

```svelte
<Plot data={records} schema={{
  time: { type: "datetime", unit: "ms", timezone: "UTC" },
  severity: { type: "ordinal", domain: ["low", "medium", "high"] }
}}>
  <Points x="time" y="response" fill="severity" />
</Plot>
```

```python
with hm.Plot(data=frame, schema={
    "condition_id": "categorical",
    "severity": {"type": "ordinal", "domain": ["low", "medium", "high"]},
}):
    hm.Points(x="date", y="response", fill="severity")

time = hm.typed_column(timestamps, type="datetime", unit="ms")
```

`typedColumn(values, {type, domain, unit, timezone})` (Python `hm.typed_column`) types one
column where a schema would. A CSV that a Provider loads is parsed by its schema: a column the
schema declares categorical, ordinal or boolean stays text (`"02134"` keeps its zero), and a
datetime column parses ISO 8601 strings. Text columns that are dictionary-coded (an Arrow
dictionary, a pandas categorical) are parsed once per category.

### Casts

A schema types a column for its whole scope; a cast types one use of a value. Casts are
expression operators, so they go in channels and Calculate columns, and the result carries its
type to scales, legends, brushes and tooltips. An axis plotting one is titled by its column.

| Cast | Result |
|---|---|
| `as_category(x, {domain})` | Categories. With a domain: those, in that order, and values outside it missing, matched on the GPU with no read back, so colors stay put when a Provider refresh lacks a category. Without one: the distinct values, numbers ascending (one read of a host column). |
| `as_ordinal(x, {domain})` | Ordered categories. Text needs a domain: alphabetical order is rarely the right one (`low`, `medium`, `high`). |
| `as_numeric(x)` | Numbers: text parsed (once per category), booleans as 0 and 1. |
| `as_datetime(x, {unit, timezone})` | Times: numbers in `unit` (`ms` by default; `ns`, `us`, `s`, `m`, `h`, `d`), or ISO 8601 text. A host column's numbers are converted exactly; a computed value is float32 already. |
| `as_duration(x, {unit})` | Durations: numbers in `unit`. |

```svelte
<Points x={as_category("rating", { domain: [1, 2, 3, 4, 5] })} y="price" fill={as_numeric("zip") } />
```

```python
hm.Points(x=hm.as_category("rating", domain=[1, 2, 3, 4, 5]), y="price",
                 fill=hm.as_datetime("updated", unit="s"))
```

Python takes the options as keywords (`domain=`, `unit=`, `timezone=`). As with any categorical
column, arithmetic on an `as_category` result is an error. To group by a cast, cast in a
Calculate and name the new column in `by` (`Calculate(columns={rating: as_category("rating")})`).

Pandas indexes are exposed as collision-safe columns (`index`, named levels, or
`level_N`) without mutating the input dataframe. All-missing untyped columns need
an explicit schema so the interpretation cannot change accidentally on update.

Missing values: `null`, `undefined` and NaN in a numeric column are missing (left out of
domains; a row with a missing position is not drawn or picked). A missing value of a colormapped
`fill` or `color` draws in the missing color: its scale's `missing`, else the theme's (a neutral
gray, `#92989f`), and the mark's colorbar shows a "Missing" swatch (TODO 73.3; it drew in the
colormap's end color). Integer columns from `BigInt64Array` or plain BigInts stay exact on
the host, so keys (Facet, Partition, Group) compare them exactly, and reach the GPU as float32,
exact up to 2^24 (a larger value logs a warning). A `Float64Array` is float32 on the GPU too.

Python's integer columns arrive the same way: int64 and uint64 (NumPy, pandas, Polars, Arrow)
keep their exact values on the host, a uint64 above 2^63 included, and their missing rows (pandas
`NA`, Arrow and Polars nulls, a NumPy masked array) travel beside the values, so -2^63 is a value
like any other. Keys, joins and identities match these exact values; what the GPU draws (positions,
colors, sizes) is the float32 copy, which rounds integers past 2^24. That rounding is expected; a
key never rounds.

A datetime column (Dates, or numbers with `type: "datetime"` in their `unit`) is stored as
milliseconds from its first time, as Python's datetime64 columns are, so points a millisecond apart
stay apart. A duration column is milliseconds, with no origin: a Python `timedelta64` of 5 and 10
seconds is 5000 and 10000 on an axis and in expressions, as a JavaScript one is. Python sends times
in a unit the browser reads: NumPy days (`datetime64[D]`) as days, weeks, months and years as the
days they start on (by the calendar), and units finer than nanoseconds as nanoseconds. A duration
in months or years (`timedelta64[M]`) has no fixed length and is refused, as are times a conversion
would overflow; convert them to a fixed unit first. The first datetime column on an axis sets the axis's origin (unless the Frame names
one, `x={{ type: "datetime", origin }}`); others are shifted into it, so tables that start at
different times share the axis. Brush bounds and events report epoch milliseconds.

### Time as data

Calendar functions (TODO 53.1) read a datetime column on the GPU: `year`, `quarter`, `month`
(1 to 12), `week` (ISO), `day`, `weekday` (Monday = 0, as pandas), `day_of_year`, `hour`, `minute`
and `second` give numbers; `month_name` and `day_name` give ordered categories ("Jan" ... "Dec",
"Mon" ... "Sun"), so a Group by them keeps calendar order and an axis lists them so;
`time_floor(t, "1 month")` gives the start of the interval each time is in and stays a time
(weeks start on Monday). The same names are in Python (`hm.month_name("t")`).

```svelte
<Calculate columns={{ weekday: day_name("t"), month: time_floor("t", "1 month", { tz: "Europe/Paris" }) }}>
  <Group by="weekday"><Plot><Bar x="weekday" y="count" /></Plot></Group>
</Calculate>
```

Time zones: each function takes `{ tz }` (Python `tz=`), an IANA name, `"UTC"` or `"Local"`; the
default is the column's own zone (a time-zone-aware pandas, Polars or Arrow column carries one;
JS Dates and naive times are UTC), so the parts agree with pandas on the same data. A zone's
changes of UTC offset within 100 years of the column's origin become one table, looked up per
row on the GPU. The parts are as exact as the column's float32 times (a column spanning ten
years steps by about 8 s at its far end): a time within that precision of a boundary (a day, an
hour, a minute, a second, or time_floor's interval) is taken to be on it, so dates stored at
midnight stay at midnight.

Times compare with times: a Date (Python `datetime`) in an expression is a time, as is another
table's datetime column (shifted to one origin), and a time plus or minus a number of
milliseconds stays a time; a time minus a time is milliseconds. `min`, `max`, `median`, `first`
and `last` of a time are times.

Calendar bins (TODO 53.2): a Bin over a datetime column uses calendar boundaries: automatically
the interval axis ticks would choose for that many bins (days, weeks from Sunday, months,
years), or `interval="1 month"`, in the column's zone or `tz`. Every bin is [start, next start),
the edges and centers stay times, and a Facet's shared bins are calendar edges over its cells.
Explicit edges may be Dates. A model calendar's column bins in its calendar.

Group keeps its key columns' types: a Group by a calculated `day_name` or `time_floor` gives an
axis categories in calendar order, or times.

## Arrow and Parquet

`data=` takes an Arrow `Table` or `RecordBatch` (apache-arrow) as it takes an object of columns;
the Data scope reads the table's vectors without importing apache-arrow itself. Each column keeps
its type:

| Arrow type | Column |
| --- | --- |
| Int, Float (Float16 included) | numeric; nulls missing; int64 exact on the host |
| Utf8, LargeUtf8 | categorical, categories in first appearance |
| Dictionary | categorical (ordinal when ordered); batches' dictionaries merged |
| Bool | boolean |
| Timestamp, Date32, Date64 | datetime, with the timestamp's time zone |
| Duration | duration |
| Decimal | numeric, with a warning |
| FixedSizeList of 2 or 3 numbers | positions (`[x, y]` or `[x, y, z]` per row) |

Other types (lists, structs, maps, binary, time of day) are refused with an error naming the
column. The same table passed again is not converted again.

```svelte
<script>
  import { tableFromIPC } from "apache-arrow";
  let { bytes } = $props(); // an Arrow IPC file's bytes
  const table = $derived(tableFromIPC(bytes));
</script>
<Plot data={table}><Points x="distance" y="delay" /></Plot>
```

A Provider loads them: `format="arrow"` (an Arrow IPC file or stream) or `format="parquet"`
with `columns` to read only those, by HTTP range requests (docs/PROVIDERS.md); in code,
`fetchArrow(url)` and `fetchParquet(url, { columns })`. An exported page embeds a Provider's
Arrow or Parquet result as binary columns.

Python reads Arrow through pyarrow (`pip install "hmplot[arrow]"`): `hm.Table` takes a pyarrow
Table or RecordBatch, `hm.Table.from_arrow(table)` any Arrow table (a Polars or DuckDB result),
and `hm.Table.from_parquet(path, columns=["x", "y"])` a Parquet file, reading only the named
columns. The columns cross to the browser as binary columns (float32, int32 codes, int64 and
uint64 with their missing rows beside them), not Arrow IPC.

## Grid tables

A grid table is gridded data (a climate model's temperature over time, latitude and longitude, a
satellite scene's bands) as a table: one row per cell, every combination of its dimensions'
coordinates, the first dimension outermost (C order). The coordinates are columns beside the
variables, made on the device when something reads them, so only the variables' values are
stored. Anything that reads rows reads it as it reads any table: `Points x="lon" y="lat"
fill="tas"`, a Filter on `tas > 300`, a Group by `lat`, a Join on a coordinate, brushing,
selection and tooltips. Grid-aware nodes also read its shape: Heatmap and Image draw a field of it,
and Slice slices through a dimension.

```svelte
<script>
  import { Data, Plot, Heatmap, gridTable } from "hmplot";
  // tas: one value per (lat, lon) cell, lat outermost; or a device array of shape [180, 360].
  const field = gridTable({ dims: { lat, lon }, columns: { tas } });
</script>
<Data value={field}>
  <Plot axes2d><Heatmap fill="tas" /></Plot>
</Data>
```

`gridTable({ dims, columns, edges, positions })`:

- `dims`: `{ name: coordinates }` in order. Coordinates are numbers (increasing or decreasing),
  Dates (a datetime dimension, as a datetime column is) or categories; `typedColumn()` gives one a
  type.
- `columns`: the variables, one value per cell in C order: flat arrays, typed arrays, nested
  arrays, or a device array of the grid's shape.
- `edges`: `{ name: bounds }`, each dimension's cell bounds (CF bounds, `size + 1` values).
  Without them a cell reaches halfway to its neighbours, and the end cells as far again.
- `positions`: a curvilinear grid (an ocean model's `lat(y, x)`, `lon(y, x)`): `{ dims: ["y",
  "x"], columns: { lat, lon }, x: "lon", y: "lat" }`, each column one value per cell of those two
  dimensions.

Keys on a coordinate (a Partition, a Join, a Facet) are coded by index, with no per-row copy: a
coordinate's key is its row's index along the dimension, in the dimension's order.

**Heatmap and Image.** A Heatmap's `fill` names a variable; it draws the grid's last two
dimensions (x the last), or the ones `x` and `y` name, and every other dimension must be sliced
away first (a dimension of one coordinate counts as sliced, and is passed over when choosing the
last two). Evenly spaced coordinates place the field by its extent; uneven ones (Gaussian
latitudes), descending ones and a wrapped longitude map through a table per axis, in the flat,
surface, map and globe modes alike. On a map or the globe a latitude's cells end at the poles.
A curvilinear grid draws on a mesh of its own cells, each corner placed by its positions (flat,
on maps and on the globe; not in surface mode). Missing values (NaN) and the rows a Filter hides
draw nothing, cut at the cells' edges. An Image's `fill` takes colors: an `[n, 3 or 4]` column,
or `{ r, g, b, a }` naming columns (integers 0-255 or floats 0-1), as every mark's RGB channel
does: `<Image fill={{ r: "B04", g: "B03", b: "B02" }} />`. A tooltip names the cell's coordinates
and its value.

**Slice.** Sliced through one of a grid table's dimensions (`field`, with `by` omitted or naming
the others), Slice finds the coordinates on either side of `at` and blends those two slabs on the
GPU: its output is a grid table of the other dimensions. Slicing time gives a lat × lon field
(a Playback on `at` moves smoothly between steps, reading nothing back); slicing one latitude
gives time × lon (a Hovmöller diagram). Outside the coordinates every cell is hidden;
categories take the nearer step. Any other `by` runs Slice's general path.

**What keeps the grid.** Transforms that keep the rows keep it: a Calculate, and a Filter, whose
grid is on its padded form (the rows it hides draw transparent); its compacted rows are a plain
long table. Transforms that change the rows (Group, Sort, Sample, Fold, Bin) give a plain long
table. A Calculate decides per column, from its expressions, without reading data:

- a new column, or a rewritten variable (an anomaly, `subtract("tas", mean("tas", { by: ["lat",
  "lon"] }))`, or `tas` in °C): the grid is kept, and the column is a field. A reduction by a grid
  table's dimensions reduces over the others without grouping rows, however many groups;
- a coordinate from itself (and constants, inputs and `@time`: `log(plev)`, `time + offset`):
  the expression runs on the dimension's coordinates, which must stay monotonic, or increase
  with one wrap: `lon = lon − 360 · (lon > 180)` turns 0…359 into 0…180, −179…−1, a rotation the
  Heatmap draws in place;
- a coordinate from two coordinates (a rotated pole: `lat = f(lat, lon)`): a curvilinear grid;
- anything else (`lat = lat + 0.1 · tas`): the grid is dropped, with a message naming the column
  once. The rows and columns stay the same; only the grid paths stop applying, and a Heatmap
  reading the output says why.

Maps and the globe wrap longitudes themselves; for Cartesian plots of 0…360 data, sorting the
longitudes before loading (xarray's `.sortby("lon")`) is cleaner than a wrap.

**Grid and Density.** A Grid's output and a 2-D Density's are grid tables (y then x); a
Density grouped by one key gains a leading dimension of its groups.

In Python, `hm.Table.from_xarray(ds)` and `hm.Table.from_netcdf(path, time="2020-01")` load
xarray datasets and NetCDF files as grid tables, with each variable's long name and units as its
display name (axis titles, legend titles, tooltips), and `hm.stream(ds, dim="time",
at=hm.input.month)` keeps a dataset in Python and sends one slice at a time as an input moves
(python/README.md "Climate data").

## Joining tables

`Join` adds columns from a second table to every row of the Data scope it sits in, matching rows
by a key: each flight gets its origin airport's region from a table of airports.

```svelte
<Data value={flights}>
  <Join data={airports} leftOn="origin" rightOn="code" fields={["region"]}>
    <Plot><Points x="distance" y="delay" fill="region" /></Plot>
  </Join>
</Data>
```

```python
with hm.Data(flights):
    with hm.Join(data=airports, left_on="origin", right_on="code", fields=["region"]):
        with hm.Plot():
            hm.Points(x="distance", y="delay", fill="region")
```

- Keys: `on` names a column both tables have (a list for a composite key); `leftOn` and
  `rightOn` name them apart, paired in order. Keys match by value: text with text, numbers with
  numbers (exact past 2^24, BigInt and int64 columns included), datetimes as times, and a
  composite key as one key. Keys of different kinds (text against numbers) are an error naming
  both columns. A missing key (null, NaN, a missing category) matches nothing.
- Many to one: a key the joined table has twice is an error naming it. Joins that repeat rows are
  not supported.
- `how="left"` (the default) keeps every row; an unmatched row's joined values are missing (NaN,
  or a missing category). `how="inner"` hides the unmatched rows, as a Filter does: the row count
  does not change, so nothing below recompiles as matches come and go.
- `fields` picks the joined columns (default: every column of the joined table but its key). A
  joined column named like a column the table has is an error; pick the columns with `fields`,
  or rename them with `as` (`as={{ name: "airportName" }}`, Python `as_=`).
- Joined columns are ordinary columns below the Join: marks, Filters, brushes, axis titles and
  legends read them, and a categorical one keeps the joined table's categories and colors. They
  are not the table's own columns, so a drag cannot move them.
- The joined table is a value (`data=`: columns, rows, typed arrays, an Arrow table; in Python a
  DataFrame or `hm.Table`). A new table replans the join.
- Cost: the row mapping is built on the host, once per key column and table version, from a Map
  over the joined table's keys (no readback when the key is a column of the table; a key a
  transform computed is read back once per change). Each run gathers the joined columns on the
  GPU in one program, so a Filter above the Join costs one gather.

## Calculate and inline expressions

Expressions are serializable element-wise graphs evaluated by the existing GPU
array runtime. Strings inside expressions name columns; use `literal()` for a
literal string. `Calculate` adds named columns while inline expressions can be
used directly in `Mapping` and supported mark channels.

A column that follows an input (a Slider's scale factor, an offset: `multiply("x", input("scale"))`)
is cheaper as a `Calculate` than as a new column in the table: the input's value reaches the GPU
as a constant (nothing recompiles), and only the Calculate and what is under it rerun. Replacing
the table reruns every transform and mark that reads it. Each column of a `Data` table is uploaded
to the GPU once and shared by everything that reads it; an update that passes a column again (the
same array object) keeps its upload.

```svelte
<Calculate columns={{ x2: square("x"), adjusted: add("x", 1) }}>
  <Points x="adjusted" y="x2"
    size={where("@hovered", 10, 7)} hover respond={false} />
</Calculate>
```

```python
with hm.Calculate(x2=hm.square("x"), adjusted=hm.col.x + 1):
    hm.Points(
        x="adjusted", y="x2", hover=True, respond=False,
        size=hm.where("@hovered", 10, 7),
    )
```

Assignments in one `Calculate` all read its incoming scope. Nest calculations
when one derived output depends on another.

A Calculate column, a Filter condition or a transform parameter can read `@time`, the view
clock (`subtract("@time", "t")`); the transform re-runs as the clock moves, once per step inside
`interval(expr, ms)`. `floor(x)` and `round(x)` round element-wise (halves to even, as numpy;
Python `hm.round`, left out of `from hmplot import *` like `min`, `max` and `sum`). A
`tween()` in a Calculate column moves the column's values, and every transform under it sees
them move. See [Animation](ANIMATION.md#time-in-transforms). Python uses `&`, `|`, and `~` for
boolean expressions; `and`, `or`, chained comparisons, and arbitrary callbacks
are deliberately rejected.

### Pointer columns

`@pointer_x` and `@pointer_y` are the pointer in the data of the frame that reads them, and
`@view_x_min`, `@view_x_max`, `@view_y_min` and `@view_y_max` that frame's visible domain as it
pans and zooms. Like `@time` they are view state: a mark channel can name one (`x="@pointer_x"`)
and any expression can read one (`view.pointer_x`, Python `hm.view.pointer_x`), in a mark,
a Filter, a Calculate or a transform parameter. A mark reads its own frame; a transform reads its
nearest Frame, else the root frame of the one Plot it draws in.

- The pointer is missing (`is_missing`) off the frame (a polar disk, a map's outline, an inset's
  domain) and before it arrives; a finger is tracked while it is down.
- Over a band axis it is the category under it, which compares with a categorical column by value
  (`equal("species", "@pointer_x")`); the visible domain there is in positions (-0.5 to n - 0.5).
- On a datetime axis both count from the axis's time origin, where the marks on it draw.
- A channel over them follows the axis and never sets an automatic domain, so a Text at
  `y="@view_y_max"` stays at the top of the frame.
- Marks whose channels read only the pointer update once per animation frame with a move and never
  on the clock: a still pointer runs nothing. Exports leave the pointer out.

RuleX, RuleY and Crosshair are built on them; see [Rules and crosshairs](GUIDES.md#rules-and-crosshairs).

## Reductions

`mean`, `sum`, `count`, `min`, `max`, `std`, `variance` (Python `var`), `median`,
`mode`, `first`, and `last` collapse a column to a single value, which broadcasts
over every row wherever it is used:

```svelte
<Calculate columns={{ z: divide(subtract(col("score"), mean("score")), std("score")) }}>
  <Points x="score" y="z" />
</Calculate>
```

```python
with hm.Calculate(z=(hm.col.score - hm.mean("score")) / hm.std("score")):
    hm.Points(x="score", y="z")
```

Every reduction but `count` needs a column or expression (`count()` alone is the row
count); calling one without is an error at once. In Python, `from hmplot import *`
leaves out `min`, `max`, and `sum` so it does not shadow the builtins; use `hm.min`,
`hm.max`, and `hm.sum`.

Missing and nonfinite values are skipped, an empty input is NaN (`count` and `sum`
are 0), and the population forms use ddof = 0, as numpy does by default. `mode`
takes the smallest of a tie; `mode`, `first`, and `last` of a category column stay
categorical, and an empty group (or an empty input) gives a missing category, not
the first one.

`by=` reduces within each group and gives every row its own group's value, the way
pandas `transform` does: `hm.mean("score", by="species")`, or a list of columns for
combinations. Grouping columns must be categorical — expressions are evaluated
without reading anything back from the GPU, so a numeric key's group count is
unknowable; use `Group` there.

Reductions are ordinary expression nodes, so they also work inside `Filter`
(`hm.col.x > hm.mean("x")` keeps the rows above the mean; a condition that is a
single value rather than one per row is an error). A condition that reads an
interaction column, such as `hm.logical_and(hm.view.brushed, hm.col.x > hm.mean("x"))`,
re-runs whenever that interaction state changes, as a plain `where="@brushed"` does.

## Data-derived transform parameters

Transform parameters take expressions too, evaluated against that transform's own
input and resolved to numbers before it runs:

| Transform | Parameters |
| --- | --- |
| `Bin` | `bins` |
| `Hexbin` | `bins`, `radius` |
| `Density` | `bandwidth`, `resolution` |
| `Sample` | `size`, `proportion` |
| `Dodge` | `columns` |
| `Window` | `size` |
| `Grid` | `resolution` |

```python
hm.stats.Bin(x="value", bins=hm.count("value") ** 0.5)
hm.Density(x="value", bandwidth=hm.std("value") * 0.3)
```

Counts are rounded to integers. A per-row result is an error naming the property,
and so is a nonfinite one. The settings pane shows a parameter set by an expression
read-only, as the expression; in a notebook, the number it resolves to is never sent
back to replace the Python expression. `Bin` also takes a rule name — `"auto"`, `"sturges"`,
`"fd"`, or `"scott"`, computed exactly as numpy 2 computes them, including its
degenerate cases (a rule whose bin width comes out zero, such as `"fd"` on a column
whose interquartile range is 0, gives one bin, and a constant column is one bin) —
and `Density` already had `bandwidth="auto"` for Scott's rule. Changing one of these
changes the number of output rows, so marks snap to the new bins instead of animating.

Inside a `Facet`, `Bin` and `Hexbin` share one set of edges across the cells by
default (`sharedBins`), so a rule name or an expression count is resolved once, over
the rows of every cell together: `Histogram(x="value", bins="sturges")` gives every
cell the same bins, chosen for the whole table rather than for one cell's rows.
With `sharedBins={false}` each cell resolves its own count against its own rows.

Channels take reductions as ordinary per-row broadcasts. Every other option — mark
uniforms, axis domains, style properties — takes a plain number: compute it with
numpy in Python, or `$derived` in Svelte. Binding those was considered and
deliberately left out, because the same expression would behave differently on a
channel (broadcast immediately) than on an option (resolved asynchronously, with a
default showing until the first readback), bound domains feed back into layout, and
the settings pane has no good way to show a value it cannot edit. `autoBounds`,
the named rules above, and ordinary host arithmetic cover the cases that motivated
it.

## Brushing

Marks with `brush` (point marks, and the series marks Line, Area, in Cartesian 2D with named x/y columns) make the data's brush editable with Shift-drag. A brush is a set of constraints on columns, stored on the data like selection, and read by `@brushed`.

```svelte
<Plot data={data} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points x="x" y="y" brush />
  <Frame x={{domain: [0, 100], range: [62, 96]}} y={{domain: [0, 100], range: [8, 48]}}>
    <!-- Shift-drag on this frame's y tick strip brushes score. -->
    <Points x="x" y="score" brush={{axis: "y"}} />
  </Frame>
</Plot>
```

- In the plot interior, Shift-drag brushes a rectangle over the columns the root's marks plot on x and y (`brush={{axis: "x"}}` or `"y"` brushes one of them). On the root's axis strip it brushes a band that spans the plot.
- Inside a child `Frame` that draws its own axis (a ranged frame, a facet cell, or a twin axis without a range), Shift-drag on that axis's tick strip brushes the column the frame's marks plot on that axis. The band is drawn only on the strip, never across the child's or the plot's interior. Child interiors are not brushable.
- A strip is where the frame's axis actually draws its ticks and labels, so label placement, offsets, hidden tick labels, and plots too small to draw axes all change it. Strips overlap the parent's interior; where strips nest, the innermost frame's strip wins, and a root interior brush cannot start on top of a child strip.
- A brush is a constraint on a column, not an axis. Every strip whose frame plots that column shows the same band, and moving, resizing, or scrolling any of those bands edits the one constraint. Constraints on different columns combine with AND.
- A strip's column comes from the brushable marks that plot on its axis: the marks in that frame, and the marks in child frames that inherit that axis from it (through every frame in between). A Frame inside a facet cell that sets its own x but not its y plots on the cell's y axis, so the cell's y strip brushes its marks; a child that sets its own y has its own y axis and does not count. A strip with no such mark does not start a strip gesture; one whose marks plot different columns shows no band, and a Shift-drag on it reports the ambiguity.
- Editing: drag a band's edges to resize it and its middle to move it; edges can be grabbed up to 6 px outside (12 px for touch) and show resize or move cursors on hover. A strip band only resizes along its axis. Scroll over a band to scale it about the pointer. With a band focused, Arrow keys move it 1 px (Shift: 10 px) and Alt+Arrow moves only its trailing edge. A click without dragging changes nothing, and edits keep any part of a constraint that reaches past the strip.
- Clearing: hovering or focusing a band highlights every band of its constraint and shows a clear control on a strip band. The plot's controls offer "Clear current" (the band last hovered, focused, or edited) and "Clear all". Delete or double-click removes a band. Escape clears the most recently edited band; it acts only in the plot whose canvas has focus (or, when no plot does, the plot under the pointer) and never inside text fields.
- Constraint descriptors (`getConstraints()`, and Python's `get_constraints()`) record `frame`, `axis`, and `origin` ("plot" or "strip"), so bands reproject after navigation and strip-made constraints stay off the full-plot rectangle.
- A series mark (Line, Area) brushes whole series: every row of a series that has a row inside the rectangle or band is brushed, so its whole line lights up and so do its rows in every other view. Its constraints are the same column intervals, each naming the series column (`series` in the descriptor); the series are grouped over the whole table, so the series column must be a column of the table (not one a transform adds). Without `series` the mark is one series. Area's `lower` and `upper` bound its value axis, so it brushes along its position axis only: x for a vertical Area, y for `orientation="horizontal"`.
- An axis with no valid domain, such as a log axis whose automatic domain contains 0, cannot be brushed; the plot reports "This axis has no valid domain to brush." and leaves the brush unchanged.
- Parallel coordinates brush per field. They are drawn with connect ([docs/CONNECTIONS.md](CONNECTIONS.md), gallery `parallel-coordinates-connected`) through brushable points in a Frame inside each cell of a `<Facet fields={[...]}>` (the Frame sets x and inherits the cell's y, so the cell's y strip brushes its points): each cell shows the table's own rows with `value` aliasing that cell's field ([docs/FACETS.md](FACETS.md), "Facet over fields"; `pairs` cells alias `x` and `y` the same way). A Shift-drag on a cell's y strip therefore constrains that field (`flipper`, not `value`), brushes on different fields AND together, and `@brushed` selects whole observations in every cell. A Facet split by a Fold's key builds the same cells; a transform between the Fold and the Facet, or a second facet field, keeps the folded rows, whose `value` column cannot be brushed.

## Dragging

`drag` on a point mark (Points, Points3D, Text) makes its rows draggable. A drag never changes the table: it writes **offsets**, per-row deltas in each column's own units, on the table's rows, and every view of the table shares them. A view follows only where it reads them.

```svelte
<Data value={penguins} key="id">
  <Plot axes2d>
    <Facet pairs={["bill", "depth", "mass"]} triangle="lower">
      <Points x={moved("x")} y={moved("y")} fill="species" select drag
        ondragend={(event) => console.log(event.keys, event.changes)} />
    </Facet>
  </Plot>
</Data>
```

- `moved("weight")` is the column plus its offsets and `offset("weight")` the offsets alone (0 where none). `x={moved("weight")}` follows a drag; `x="weight"` does not, the dragged mark included. Offsets live in column units, so `x={log(moved("weight"))}` stays right through a nonlinear channel. In a mark, `"@offset_x"`, `"@offset_y"` and `"@offset_z"` read the offset of the column its x, y or z names (`size={abs("@offset_x")}`). Numeric columns only, for now.
- `drag` is `true` (every numeric axis of the view; a categorical axis is skipped, so a strip plot drags along its numeric axis) or the axes to drag: `"x"`, `"y"`, `"xy"`, `"xyz"`. Naming a categorical axis, or an axis whose channel cannot be dragged, is an error that says why.
- The write direction goes back through the channel's expression (every operator on the path needs an inverse: arithmetic, `log`/`exp`, `sqrt`/`square`, `power`, `abs`, `sin`/`cos` on the current branch, `clip`, `minimum`/`maximum`, `floor`/`round`; comparisons and logical operators cannot be dragged) and through the transforms above the mark: Filter, Sort, Sample, a Calculate column, a facet cell's alias (in a scatterplot matrix `x` is weight in one cell and age in the next), and a Fold's value. A channel reads one column to drag: the one inside `moved()`, else its only column.
- A row of a Group or a Bin drags its members. A mean, median, min, max or a bin's position moves every member by the change; a sum splits it in proportion to each member, and stops where the total reaches zero (equal shares when the total is 0 or the signs are mixed). Compute `moved()` in a Calculate before the Group (`<Calculate columns={{ w: moved("weight") }}>`, then a `mean` of `w`) so the group follows. Counts, densities, quantiles and layouts (Force, Dodge, trees) cannot be dragged.
- The drag uses the pointer's movement since the press (a point grabbed off-center keeps its offset from the pointer) and lands under the pointer in log, polar and map frames. In 3D it moves on the plane facing the camera; `drag="xz"` moves on the plane of those axes, and one named axis on the plane through it that faces the camera most.
- A Filter that reads `moved()` applies during the drag: a row dragged out of its range disappears and comes back if dragged back in. Dragging a selected row moves the whole selection by the same change in each column.
- Rows being dragged skip their transitions (`animate()`, `tween()`, `animation`) so they stay under the pointer; offset changes that are not a live drag (Escape, `resetOffsets()`, code) animate as usual. `@time` terms keep playing.
- A press on a draggable row starts a drag once the pointer moves 3 pixels (a click still selects); anywhere else the plot pans, and Shift-drag still brushes. Escape cancels a drag and restores the offsets from its start.
- `ondrag` and `ondragend` report the grabbed row and key, every dragged row and key, and each column's change (a group's change for an aggregate); `ondragend` adds `cancelled`.
- `getOffsets()` on a Data, Provider or Plot returns the table's offset layer (`set(column, rows, deltas)`, `entries()`, `clear()`, `subscribe()`); `resetOffsets()` clears them; `applyOffsets()` returns the table with each dragged column replaced by its moved values, under the same names. Offsets follow their keys when a keyed table's data is replaced; without a key they stay by row while the row count stays the same.
- Python: `hm.moved()` and `hm.offset()`; `table.set_offsets(column, deltas)` (a key-to-delta dict or one delta per row), `table.offsets` (a DataFrame of key, column and delta, updated by drags), `table.clear_offsets()` and `table.apply_offsets()` (a new Table); `on_event("drag" | "dragend", callback)`. Offsets ride exported HTML.

## Filters and padded views

A `Filter` does not copy the rows it keeps. It passes on its input's rows with a mask of the kept ones (a padded view), so a brush or slider that changes the kept rows changes no array length downstream, and moving it compiles no new GPU kernels. What you see does not change: every transform and mark computes what it would over the kept rows alone.

These read the padded rows directly: they mask by the kept rows, and their outputs keep a fixed length.

- Transforms: Filter, Calculate (every reduction in an expression, such as `mean("v")` or `count()`, covers the kept rows), Bin, Group, Sort, Window (every reducer, with or without `by`), Normalize, Stack, BoxStats, BoxOutliers, Summary (except bootstrap intervals), Pivot, Hexbin, Density, Sample (shuffling too), Fold, BarGeometry, and Slice. A grouped output has a row for every group of the Filter's input and shows the groups with a kept row. Hexbin's cells follow the data, so a new selection can change how many there are (and compile); give it `bounds` (`bounds={{ x: [x0, x1], y: [y0, y1] }}`) and it bins over a fixed grid of the hexagons covering those bounds, a row per cell with the occupied ones shown, so a selection changes no length. Points outside the extent fall in no cell.
- Marks: point marks, labels, rectangles, prisms, Segments (including the Arrows and ErrorBars templates) and Arrows3D draw every row and hide the ones not kept; Area bands draw every row with the hidden bounds missing; a straight Line draws the kept rows and stops. Composed charts follow their primitive marks' policies. `getMark().count` is then the input row count; the number of rows shown is the mark's own (internal: its accepted binding's `rows.count`). A mark that is animated, keyed, split into series, dodged, or has more rows than `maxElements` reads the kept rows instead.

Everything else reads the kept rows compacted, once, when it first needs them: Force, Tree, Edges, Nodes, Dodge, Interpolate, geographic marks, bootstrap Summary intervals, curved lines and surfaces, and Facet and Partition planning.

When a Filter keeps under a quarter of an input of 65,536 rows or more, it also compacts the kept rows into a bucket for the consumers whose work follows the row count: a power-of-two length of at least 16,384 rows, the kept rows first and copies of the first kept row (hidden) after them. The transforms listed above that read padded rows, except Slice, read the bucket, so their work follows the selection, and so does a mark whose Filter input has more rows than its `maxElements`. The bucket is built when one of them first asks for it, one sort per Filter update. Marks that can draw every row, and a Slice, keep the Filter's own rows: a mark swaps which rows are hidden instead of refilling its buffers with the bucket's, and a Slice keeps one row per entity. A bucket grows as soon as the kept rows outgrow it and shrinks only after the count has stayed under a quarter of it for three updates, so a brush near a boundary does not switch lengths back and forth. Memory never exceeds the input's.

Sample after a Filter gives each of the Filter's input rows a random key (from `seed`) and take the kept rows with the smallest keys. The same seed keeps picking the same rows as the Filter changes, but the selection differs from the same Sample over a table that holds only the kept rows.

Apart from Sample, every result equals what the same transform computes over a table that holds only the kept rows (tests/unit/padded-views.test.js compares each one with that reference). Anything that reads a view's columns, keys or source rows gets the kept rows, compacted. Three invariants keep this safe; they are stated at the top of src/lib/plot/utils/dataView.js for anyone adding a consumer:

- Every physical row is a real row of the source. Hidden rows hold real values, never placeholders, so group and category discovery and extents over the physical rows see only real values.
- Which rows are kept lives only in the mask. Every reduction, count, extent and key is masked, and nothing reads meaning from a hidden row's values.
- A consumer opts in by asking for the padded rows. Every other accessor gets the compacted rows, computed once on first use.

The trade-off: a padded chain does work in proportion to the Filter's input, not to what it keeps. A Bin after a Filter that keeps 1% of 50,000 rows still reads all 50,000 and masks out 49,500 of them, which costs less than sorting and gathering the kept rows on every move, and each mark keeps its rows (and their animation and picking identity) as the selection changes. Buckets bound the waste for transforms over inputs of 65,536 rows or more: once the count settles, such a transform reads at most four times the kept rows, or 16,384 rows, whichever is larger (a count that drops sharply takes three updates to shrink its bucket). A mark does not: drawing 500,000 points with most hidden costs less per brush move than refilling a bucket's (34 against 50 ms a brush step on the 500,000-row fixture), and the same per frame. A Filter adds a 4-byte mask per input row and copies no columns; a bucket gathers the columns read from it at the bucket's length, which is never longer than the input.

## Writing a transform

A transform is a definition in `src/lib/plot/utils/transforms/` (listed by kind in `index.js`); `src/lib/plot/utils/transforms/runner.js` states the contract in full. A transform declares what it reads of an input with hidden rows and what its output is, and the runner does the rest: it converts the input, runs the transform, and builds the output view with its mask, its visible-first flag and whether its values follow the mask.

- `reads`: `"rows"` (every row, hidden ones included, with `input.valid`, their 0/1 mask, or null when every row is visible), `"visibleFirst"` (the same rows with the visible ones first), or `"compacted"` (the visible rows only). It may be a function of the config (a Window reads visible-first rows without `by`).
- `output`: `"sameRows"` (new columns over the same rows; a Filter returns its own `valid`), `"reordered"` (an `order` of the rows; the runner puts the visible ones first), `"subset"` (some rows in order, the first `count` visible), `"aggregate"` (a row per group; `valid` hides groups with no visible row), or `"newRows"` (rows in any order and number, such as a Fold).
- `run(input, config, context)` does the work. Reductions mask by the visible rows with the helpers in `common.js` (`visibleRows`, `whereVisible`), which treat a null mask as every row visible, so a transform has one code path whether or not rows are hidden. `context.own(array)` releases an array with the output.
- `names(config, source, columns)` (optional) declares display names for its outputs, keyed like the columns before `as`: a Bin's edges are the binned field, a Stack's bounds its y. Axes are titled by them; an output without one is named by its key, and `null` marks it unnamed.
- `dependencies(settings)` (optional) declares what its settings read besides the input: the `expressions` it evaluates, the `fields` it reads directly (`"@brushed"`) and the interaction `resources` it reads (a selection). `utils/transforms/dependencies.js` turns that into its interaction, clock and pointer subscriptions; without it, the kind's expression-valued parameters (`{ type: "expression" }` in its definition's `parameters`) are what it reads.
- Columns read from `input` are lent (`utils/columnReads.js`): use them within the run, and pass `.ref` to an operation that consumes its inputs. Keep one past the run only through `acquireColumn(scope, field)` and its `release()`. A cache entry the definition fills registers its release with `ownCacheEntry(cache, name, dispose)` (`utils/cacheEntries.js`), where it fills it.

A transform that reads rows must give the same result as over a table holding only the visible rows (tests/unit/padded-views.test.js checks each kind against that reference).

A transform that runs on every brush move should compile its device work (docs/PERFORMANCE.md, "What runs as one program"). Split `run` into a host plan and a kernel:

- The plan does everything that needs the host: validation, category dictionaries, readbacks (cached where the rows allow), and the structure the kernel depends on (reducer ops, which inputs are columns or numbers).
- The kernel is a pure function of arrays, jitted once per plan (`JSON.stringify(plan)` as the key, in a bounded map). It must be traceable: no readbacks and no host branches on data. Numbers from the config or the data come in one `deviceArray` buffer, so a new value compiles nothing. Leave bin counts and other sizes to the arrays' shapes, and pass `{ dtype }` to `np.zeros`, `np.ones` and `np.full`: they ignore a positional dtype, and a traced float32 index fails where eager promotion hid it.
- Run the kernel eagerly for an empty input.

Check a new kernel both ways: `tests/unit/compiled-transforms.test.js` (a new number on the same shapes gives new results) and `tests/unit/kernel-lengths.test.js` (a new row count compiles nothing).

## Scope and scale rules

Observation identity comes from `key=` on a table or from `identity(keys=...)`. Keys may be strings, categories, integers (int32, int64 or uint64, matched exactly, past 2^53 too), or float32 values, and must be unique, finite, and present. Float keys are stored as float32, so Python floats (float64) are narrowed first: keys that differ only beyond float32 precision (about seven significant digits; any whole number above 2^24 = 16,777,216) become equal and are rejected as duplicates, for example `identity(keys=np.array([16777216.0, 16777217.0]))`. The error names the colliding pair. Use integer or string keys for large or high-precision identifiers. In Python, `Table.replace(value, schema=...)` replaces the columns and the schema together, whether or not a transaction is open; omit `schema` to keep the current one.

A nested `Data` replaces its enclosing table. `Mapping` supplies channel names,
but each consuming mark resolves those names in its own active table. Aggregating
transforms expose their output columns; they do not rename inherited mappings.

Every scope in the tree derives from the one above it: `Data` replaces the table,
a transform derives a new one, a `Facet` cell narrows it to that cell's rows, and a
`Partition` group narrows it to that group's rows (see docs/FACETS.md). Marks and
transforms always read the nearest enclosing scope, so the same child markup means
"per cell" inside a Facet and "per group" inside a Partition.

```svelte
<Data value={raw}>
  <Plot><Mapping x="time" y="response"><Line /></Mapping></Plot>
  <Data value={summary}>
    <!-- This table replaces raw, so use its estimate column explicitly. -->
    <Plot><Line x="time" y="estimate" /></Plot>
  </Data>
</Data>
```

```python
with hm.Data(raw):
    with hm.Plot():
        with hm.stats.Summary(field="response", by="time"):
            # Summary outputs estimate/lower/upper; response is no longer present.
            hm.Line(x="time", y="estimate")
```

Raw arrays remain valid and can share normalization by using one explicit scale
resource. A local palette changes only the output encoding and retains that
shared domain.

```svelte
<script>
  import { Plot, Points, continuous } from "hmplot";
  const temperature = continuous({ domain: [0, 100], colormap: "Viridis" });
</script>
<Plot>
  <Points position={a} fill={aTemperature} fillScale={temperature} />
  <Points position={b} fill={bTemperature} fillScale={temperature} />
</Plot>

<!-- With an inferred named-field scale, this keeps the shared domain while
     changing only this mark's palette. -->
<Plot data={observations}>
  <Points x="x" y="y" fill="temperature" />
  <Points x="x2" y="y2" fill="temperature" colormap="Inferno" />
</Plot>
```

```python
temperature = hm.continuous(domain=(0, 100), colormap="Viridis")
with hm.Plot():
    hm.Points(position=a, fill=a_temperature, fill_scale=temperature)
    hm.Points(position=b, fill=b_temperature, fill_scale=temperature)
```

### Scales on a mark: one scale object per channel

A mark's channel takes its scale from one object, a scale that marks can share (TODO 137.4):

| Channel | Scale object |
|---|---|
| `fill` | `fillScale` (and `colormap`, beside an automatic scale) |
| `color` | `colorScale` (and `colormap`) |
| `size` | `sizeScale` |
| `width` | `widthScale` |
| GeoJSON's `height` | `heightScale` (continuous only) |

- `continuous({ domain, range, colormap, transform, midpoint })` maps numbers. Its domain is two
  numbers, or `"symmetric"` (the data's extent centered on zero: `[-m, m]` for the largest
  magnitude m); without one, the values' extent. Colors take a `colormap` (a name or a list of
  colors); sizes and widths a numeric `range`, and without one the automatic scale's range.
- `categorical({ domain, range })` maps categories in the domain's order to the range's colors,
  sizes or widths.
- The flat per-channel keys that did this before (`fillDomain`, `sizeRange`, `widthTransform`,
  GeoJSON's `heightDomain`, ...) were removed; each is an error naming its scale object.
- `colormap` beside a `fillScale` or `colorScale` is an error: set the colormap on the scale.
  A colormap alone keeps the normalization the mark shares with others reading the same column.
- On a Heatmap or Surface, a scale's domain reads the values as they are
  (`fillScale={continuous({ domain: [0, 1] })}` for values already in 0 to 1). Without one, the
  values' extent is used.
- The settings pane still edits a mark's domain, range and transform; since the flat keys went,
  those edits stay on screen and do not reach a Python scene or an export, as edits of a shared
  scale's settings never did.

```svelte
<Points x="x" y="y" fill="anomaly" fillScale={continuous({ domain: "symmetric", colormap: "RdBu" })}
  size="count" sizeScale={continuous({ range: [2, 18] })} />
```

```python
hm.Points(x="x", y="y", fill="anomaly", fill_scale=hm.continuous(domain="symmetric", colormap="RdBu"),
          size="count", size_scale=hm.continuous(range=[2, 18]))
```

### Scale transforms, symlog and diverging scales

A scale transform is `"linear"`, `"log"`, `"sqrt"` or `"symlog"`, on an axis
(`y={{ transform: "log" }}`) or a value scale (`continuous({ transform })`,
`normalization({ transform })`, Python `hm.continuous(transform=...)`). `symlog`
is d3's scaleSymlog, y = sign(x)·log1p(|x|/c): linear within ±c and logarithmic beyond,
for data that crosses zero. Its constant is `constant` (default 1) on the axis
(`y={{ transform: "symlog", constant: 10 }}`) or the scale. A symlog axis ticks 0 and ±10^k,
spaced in transformed space, with minor ticks at 2..9 × 10^k; inside [-c, c] it ticks
linearly. Every transform comes from one table (`utils/scaleTransforms.js`), and a new
transform or constant compiles nothing on a value scale.

A value outside a transform's domain (a zero or a negative under log, a negative under
sqrt) is invalid: it is not drawn, not picked, and left out of automatic domains, on axes
and value scales alike (a NaN color, by contrast, draws in the missing color). An explicit domain outside the transform's domain
stays an error (a log axis over [0, 10] draws no ticks; `normalization({ domain:
[0, 10], transform: "log" })` throws). An automatic axis domain is padded in transformed
space, so a log axis stays positive.

`midpoint` makes a diverging value scale (d3's scaleDiverging): the domain's halves map to
the range's halves, [lo, midpoint] to [0, 0.5] and [midpoint, hi] to [0.5, 1], each linearly
in transformed space. `continuous({ colormap: "RdBu", midpoint: 0 })` over [-2, 10] puts
RdBu's white at 0 and uses both ends of the colormap. An explicit domain must contain the
midpoint (the error names both); an automatic one grows to include it. Color, size and width
scales take a midpoint; position axes do not. A `"symmetric"` domain (`continuous({ domain: "symmetric" })`) maps [-m, m] linearly (m the largest magnitude), so the shorter side uses less of the
colormap, where a midpoint uses all of both halves.

```svelte
<Plot data={accounts} axes2d y={{ transform: "symlog", constant: 10 }}>
  <Points x="month" y="balance" fill="change"
    fillScale={continuous({ colormap: "RdBu", midpoint: 0 })} />
</Plot>
```

```python
with hm.Plot(data=accounts, axes2d=True, y={"transform": "symlog", "constant": 10}):
    hm.Points(x="month", y="balance", fill="change",
                     fill_scale=hm.continuous(colormap="RdBu", midpoint=0))
```
