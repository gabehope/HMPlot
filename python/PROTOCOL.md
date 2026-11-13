# Notebook protocol, version 1

The anywidget model contains a reconstructible `state` snapshot and independently addressed `columns` widgets. Scene JSON names nodes, resources and references; numeric payloads are contiguous little-endian float32, int32, int64 or uint64 buffers with explicit shapes. No executable Python or generated Svelte source crosses the protocol.

A column descriptor's `dtype` is `float32` (missing values NaN), `int32` (dictionary codes, -1 missing), `int64`, `uint64`, or `uint8` for an encoded image (below). An `int64` column is an integer column, or a datetime or duration column with its `unit` (`ns`, `us`, `ms`, `s`, `m`, `h` or `d`; any other unit is an error) and, for a datetime, its `timezone`. A `uint64` column is an unsigned integer column (NumPy's uint64; narrower integers travel as `int64`, and `source_dtype` names the original). No integer value marks a missing row: an `int64` or `uint64` column with missing rows has `"validity": "uint8"` and `"nullable": true`, and its payload is the values followed by one byte per value, 1 where the row has a value and 0 where it is missing (the value there is 0). Python converts times to these units before sending them: NumPy's days (`D`) are `d`, weeks, months and years become days by the calendar, and units finer than `ns` become `ns`; durations in months or years (no fixed length), conversions past the int64 range and times beyond JavaScript's date range (±100,000,000 days from 1970) are refused. The browser keeps every integer's exact value on the host (BigInts, for keys, joins and identities) and stores the GPU's copy as float32, exact up to 2^24 (it warns once when a column holds larger values); datetime columns reach the GPU as float32 milliseconds from their first value (`origin`), which the browser keeps exact, and duration columns as float32 milliseconds (no origin). Arrow and Parquet data are converted to these columns in Python (`hm.Table.from_arrow`, `hm.Table.from_parquet`); Arrow IPC never crosses the protocol. A descriptor's optional `label` is the column's display name (axis titles, legend titles, tooltips; a NetCDF variable's long name and units), and `calendar` with `calendar_units` mark numbers that are times in a model calendar (`"360_day"`, `"days since 1850-01-01"`).

A view announces `capabilities` (with `limits.maxStorageBufferBindingSize`, its GPU's largest storage buffer, against which Python checks a grid table's variables before sending them), then prepares and publishes a snapshot under plot update holds. It sends `status`, `ack` or `error` with its view ID and revision. Source column IDs are immutable and unique across Python processes. Shared browser resources are reference-counted and retired after consumers settle.

A view in a browser without WebGPU (its initialization failed with the code `webgpu.unavailable`; a lost device is another error and gets no image) sends `error` and `capabilities` with `ready: false` as any failed view does, then `snapshot_request` with its `width` in CSS pixels (null before it has a layout). Python draws the scene's SVG export, all its plots in one image as `export_svg` on the scene, in a private headless Chrome on a page that wide, and answers `snapshot` with the `revision` drawn and the SVG as the message's one binary buffer, or with `error` (why there is no image, saying what to install) and no buffer. It draws again after each new revision (debounced) until the view's `dispose`. The view shows the newest image read-only, with the SVG's `<title>` and `<desc>` as its alt text, and never prepares the scene itself. With `HMPLOT_NOTEBOOK_SVG` set, the display's MIME bundle also carries `image/svg+xml`, the same export drawn 800 pixels wide, for viewers without the widget manager.

An HTML page embeds the standalone runtime (`static/standalone.js`, 14 MB), which the widget's bundle does not contain. Python's `export_html` command passes `embedRuntime: false`: the page comes back with `/* HMPlot runtime */` in the runtime's script (`<script type="module" id="hmplot-runtime">`), and Python puts the file there (a front end sends no message over 10 MB to the kernel). A view exporting a page for its own download (the settings pane) first sends `standalone_request` with a `request` id; Python answers `standalone` with that `request` and the file as the message's one binary buffer, or with `error` and no buffer. The view asks once and keeps it.

A view sends a command's result to the kernel as one message, and Jupyter's server closes the connection on a message over 10 MiB (tornado's `websocket_max_message_size`), which ends the session. A command whose `args` has `maxBytes` gets no result larger than that: the view answers `error` with the code `bridge.message_too_large` and `diagnostic.details` `{bytes, maxBytes}` instead. Python's `export_html` passes `maxBytes` (10 MiB less 64 KiB for the message around the page). It first counts the page's data and state itself (their size in the page's JSON) and does not ask the view for a page they already make too large; for either, it exports the page headlessly, as `hm.export_html()` does, and warns.

The browser processes one update at a time and coalesces unstarted snapshots to the newest state. Commands are ordering barriers. Commands include `settled` (it also waits for Providers' and VectorTiles' loads in flight), `animations_finished`, `fit`, `camera`, `viewport`, `time` (see Animation), `groups` (see Partition groups), transform `action`, `export_png`, `export_svg`, and `export_pdf`. `camera` returns the target's 3D camera state `{position, target, up, fov, near, far, zoom, mode}`; with `args.state` (a partial state) it first applies it, easing when `args.animate` is true. The `camerachange` event carries the same fields (no `projection`: orthographic 3D is deferred, and `mode` names the controls); a `camera` command on a Plot repeated in Facet cells applies the state to every cell and returns the first. Python exposes the payload as `event.camera` because `event.target` is the node. `viewport` returns a 2D Plot's `{x, y, zoom, zoomX, zoomY}` and optional orthographic `center: [longitude, latitude]`; with `args.state` it merges a partial viewport, applies it to all mounted copies and returns the first. Python exposes this through `get_viewport()` and `set_viewport()`, with `zoom_x` and `zoom_y` keyword aliases. A registered `viewportchange` callback receives the browser-local state as `event.viewport`. Document-export results carry an export report in JSON plus the SVG or PDF binary attachment. `dispose` detaches a view or closes the scene.

Only registered interactions produce `event` messages. Events include the displayed revision and view identity; stale events are rejected. The settings pane sends per-property `edit` messages; a parameter set by an expression (`bins=hm.count("x") ** 0.5`) is shown read-only and never sent back. An input sends `input` messages: `{target, value, sequence}` when the viewer (or the data, for a value read from it) changes it, and a Playback's `{target, playing}`; Python keeps the value as the node's `value` without a new revision and forwards it to the scene's other views as `input` messages. Automatic axis titles are derived in the browser (from the column an axis's marks plot) and are never sent back as edits; an axis `label` of `""` (or `None`), such as `x={"label": ""}` in Python, means automatic, and a settings edit that sets a label sends that label. Python owns accepted configuration and newer explicit Python edits override conflicting browser changes. Camera state is local and browser interaction never waits for a kernel round trip.

Settings edits carry `props` patches using public camelCase names. Before emitting or snapshotting
them, the settings adapter converts internal aliases into grouped axis objects, scale props,
literal colors and `dash`. It preserves mapped channels, authored scalar expressions and explicit
scale resources. JavaScript validates each node against its component's declared properties and
settings; Python applies the same validation to browser edits, including nested option keys, and
rolls back invalid patches. The global property list is never a fallback. `LinkViews.plots` carries
its positional references explicitly. Python keywords remain snake_case. `Template` and `Slot`
explicitly reject nonempty props. This validation tightening does not change protocol version 1
or its message shapes; see [API generation](../docs/API-GENERATION.md).

The adapter (`SceneRuntime` / `SceneRenderer`) is independent of anywidget. Its loader supplies binary columns, its send callback carries protocol messages, and its keyed scene tree uses statically compiled Svelte components. The widget entry supplies notebook transport and disposal.

The browser applies an update's resources as one transaction (`SceneResources.transaction()`): it prepares them, activates them with a snapshot of what they replace, mounts and settles the tree, then accepts them or rolls back. An update that fails before it settles leaves the previous revision's resources in place, including theme values, offsets, selections and the offset and selection versions, and the next update retries. Brush constraints are restored on their owners (tables' and standalone identities) by one `restoreConstraints`.

The standalone exporter uses the same adapter and bundled component registry in
a private headless Chromium process. It reconstructs a snapshot, uploads each
column resource, waits for the accepted completed frame, and invokes the same
export command as a notebook view. It does not generate Svelte source or run a
development server.

The synchronous headless `ExportSession.get_viewport(plot)` and
`ExportSession.set_viewport(plot, state=None, **fields)` use the same `viewport`
command after mounting the Plot in its private browser. A compute server can
render several orientations in one session without rebuilding the scene.

A Join's `data` (like a Nodes' or a Provider's `initial`) is a `{"$table": id}` reference to a table in the snapshot's `tables`: the joined table's columns travel as any table's do, and a new version of it replans the join in the browser.

## Templates

Portable template files use the scene protocol's `Template` subtree with `protocol: 1`,
`library`, and `template: {version: 1, parameters, slot}`. `{"$param": "name"}` is resolved
before the subtree is mounted. No binary resources or event callbacks travel in this file;
the host supplies data and handlers. See [Portable templates](../docs/PORTABLE-TEMPLATES.md).

`Template` and `Slot` nodes come from Python templates (`hm.Template`, `hm.slot()`). They have
no events and no props, except a `Template`'s optional `contract`: `{main}` (the id of its main
part, whose visibility its other marks follow) or `{legendEntries: [{swatch, parts}]}` (each
entry's other parts follow its swatch), with the template's `kind` (its settings group's label)
and the `parts` it names, by id. The browser renders only their children: no
element, no handle, and nothing registered, so layout, draw order, and the Svelte contexts
marks read are those of the same tree without them (a Template only scopes which marks follow
its main part, and a Slot's children are outside that scope). The registry marks both kinds `"passthrough": true`. Commands addressed to a
template's id: `settled`, `animations_finished`, and `export_html` (which keeps the template's
subtree) work; the others need a mounted handle, so Python sends them to the template's single
top-level node instead, as it does for node references in props (`Legend(target=template)`).

## Partition groups and repeated nodes

A node inside a `Partition` (or a Facet cell) is one node in the snapshot however many times the
browser mounts it. Each mounted instance registers its own runtime handle, keyed
`<node id>:<instance key>`. The instance key is the facet cell key, then the group key of each
enclosing Partition from the outermost in, joined by `/`, leaving out whichever is absent (`""`
outside both). A facet cell key is JSON of `[row, column]` values (`[null,"Male"]` for
`column="sex"`); a group key is JSON of that Partition's `by` values in order (`["Adelie"]`,
`["Adelie","Male"]` for `by=["species","sex"]`, `[null]` for rows whose key is missing).
Examples: `points:["Adelie"]`, `points:[null,"Male"]/["Adelie"]` (Facet cell, then Partition),
`points:["Adelie"]/["Male"]` (nested Partitions). A command addressed to such a node reaches
every mounted instance: `fit` and `action` run on each, `camera` and `groups` answer from the
first. When a group exits (its value leaves the table), only its instances unregister.

The `groups` command targets a Partition and returns one entry per mounted group, in group
order: `{"key": str, "values": {column: value | null}, "label": str, "marks": [str]}`. `values`
includes the enclosing Partitions' keys; `label` joins the values with " · ", and a missing value
reads `"(missing)"`; `marks` lists the legend labels of the marks the group mounted. Any other
target fails with "Target is not a Partition." Python: `await partition.groups()`.

`event` payloads from a repeated node carry `facet_cell` (the facet cell key, when inside a
Facet) and `partition_group` (the enclosing group keys joined by `/`, when inside a Partition);
each is omitted when it does not apply. Python exposes them, when present, as
`event.facet_cell` and `event.partition_group`. Python also sets `event.frame`, which is not
sent in the payload: the nearest Frame node enclosing the target, or the Plot when there is none.
A promoted root Frame is the explicit Frame node. Facet cells exist only in the browser, so an
event from a cell reports the node around the Facet, and `facet_cell` names the cell.

## Data-owned interaction state

Tables and explicit identity resources carry stable selection, brush, hover, nearby, and nearest resource IDs (`nearest` is optional: a table or identity descriptor without it gets a resource of its own in the browser). Marks may produce or respond to those resources without a Python round trip. The frontend emits coalesced `interaction` status messages after committed changes; Python uses the `selection` command for `replace`, `add`, `remove`, `toggle`, and `clear`. Snapshots serialize accepted row identities so new views and offline HTML reconstruct the same committed state. Preview brush, hover, nearby, and nearest rows remain browser-local until committed; hover and nearest are never committed.

A selection descriptor (`selections[id]`) may carry `by`, a column's name (`hm.selection(by="gene")`): the browser makes the resource with it, rows written on a table select their values of that column, and each table's members are its rows with one of those values. A `{"$selection": id}` may be an expression's argument (`{"$expression": {"op": "where", "args": [{"$selection": id}, 1, 0.15]}}`): each row's membership at the live phase, over the expression's rows (an aggregate's row while any contributor is a member).

Expressions may read the interaction state `@selected`, `@brushed`, `@hovered`, `@nearby`, `@nearest`, `@tooltip` (1 on member rows) and `@any_selected`, `@any_brushed`, `@any_hovered`, `@any_nearby`, `@any_nearest`, `@any_tooltip` (1 on every row while the matching column has any member), as `hm.view.selected` or the string `"@selected"`. Data columns cannot start with `@`. An `Interaction` node's `columns` (`{"@focus": {"$selection": id}}`) name selections the same way: inside it, `"@focus"` is 1 on the selection's member rows; each name is `@` and an identifier that is not a state name. Other `@` names are errors, except the brush extents and offsets described below.

`@brush_min:<column>` and `@brush_max:<column>` are virtual columns broadcast across the current scope's rows. Read them as strings or column expressions (`hm.col("@brush_min:weight")`; serialized as an ordinary `column` expression). They resolve the current scope's column identity against its data-owned brush's constraints and use the same preview/committed phase as `@brushed`, including through aliases and linked views. Bounds are ordered data coordinates, not selected-row extrema: an empty brush still has bounds, and log/inverted axes do not transform them. Datetimes retain the source column's metadata and numeric representation (milliseconds relative to `origin`), converting the constraint's epoch-millisecond bounds accordingly. Cleared brushes, unconstrained fields, categorical constraints, and manual row selections return `NaN`; nonexistent source columns are errors. Looking up bounds requires no row reduction or GPU readback.

A table's offsets (TODO 38) are per-row deltas on its numeric columns. Its snapshot descriptor carries them as `offsets`: `{ "version": n, "length": rows, "columns": { name: { "rows": [row, ...], "deltas": [delta, ...] } } }`, rows indexing this table version's rows. The frontend applies a descriptor only when its `version` is newer than the last it applied for that table, so a snapshot sent again for another reason does not undo offsets changed in the browser; when the table's data changed in the same snapshot, the offsets wait for the new rows, so a keyed remap does not move them. The expressions `{"op": "offset", "args": [name]}` and `{"op": "moved", "args": [name]}` read a column's offsets and the column plus its offsets (the virtual column `@offset:<name>`; data columns cannot start with `@offset:`).

A drag (a mark's `drag` prop) changes offsets in the browser. The frontend sends `{ "type": "offsets", "table": id, "revision", "table_version", "sequence", "columns": { name: { "rows", "deltas" } } }`, the table's whole offset state, at most ten times a second, always its last state, and at once before a `drag` or `dragend` event; offsets that came from Python are not sent back. `table_version` is the version of the table data whose rows `rows` index. Python rejects a message whose `table_version` is not the table's current version (without one, a message from another revision) or with a sequence it has already seen for that view and table, takes the offsets (by key; rows out of range, deltas that are not finite and columns that are not numeric are left out), increments the table's offsets version, answers the sending view with `{ "type": "offsets_ack", "table": id, "version" }`, and sends every other ready view of every scene showing the table `{ "type": "offsets", "table": id, "version", "length", "columns" }`. A view applies neither a snapshot's offsets nor an `offsets` message at or below the last version it applied or was acknowledged, so a snapshot sent later cannot undo a newer drag. The events `drag` (throttled to 30 Hz) and `dragend` carry `table` (its id), `row` (the grabbed table row; null for an aggregate's row), `rows` and `changes` (column to change in its units); `dragend` adds `cancelled`. Python gives the callback's event `key` and `keys`, the rows' keys as `table.offsets` names them (tuples for several key columns), and takes drag events from an earlier revision too while their node exists. `export_html` writes the browser's current offsets into each table's descriptor.

A brush or nearby resource's `constraints` entries are descriptors. Column brushes have `identity`, `name`, `type`, `bounds`, optional `categories`, and `frame`, `axis`, and `origin` (`"plot"` for the plot interior or root axes, `"strip"` for a child frame's axis strip). A brush made on a series mark (Line, Area) also has `series`, the series column (or columns, joined with ", "): the resource brushes every row of each series that has a row inside all of the constraints, and a restored constraint with `series` does so again through that mark. Nearby constraints have `type: "radius"`, `axis` (`"x"`, `"y"`, or `"xy"`), `units` (`"px"` or `"data"`), and per-axis `center` and `radius` objects; for `"px"` the values are world coordinates. For `"data"` the `center` values are data values, and a per-axis `transform` (`"linear"`, `"log"`, or `"sqrt"`, the axis transform) says where the `radius` is measured: a row is nearby when the sum over axes of ((transform(value) - transform(center)) / radius)^2 is at most 1, so on a log axis a radius r reaches a factor of e^r either side of the center. Constraints with `units: "px"` are in the originating view's world coordinates, which mean nothing in another view: they stay browser-local previews, a resource never commits them (a commit keeps only the other constraints), and the frontend publishes committed constraints only, so they never reach Python or a snapshot. Nearby is preview-only today, so no nearby descriptor is published yet; a future committed nearby (for example click-to-pin) must first convert a pixel radius into a `"data"` constraint, whose shape above needs no protocol change.

## Grid tables

A table from `hm.Table.from_xarray`, `hm.Table.from_netcdf` or `hm.stream` (TODO 48.6) is a grid table: one row per cell of its dimensions in C order (the first dimension outermost), its `columns` the variables, and its descriptor a `grid`:
`{ "dims": [{ "name", "coords": {"$column": id}, "edges"?: {"$column": id} }, ...], "positions"?: { "dims": [a, b], "columns": { name: {"$column": id} }, "x"?, "y"? } }`.
Each dimension's `coords` column holds its 1-D coordinates (numbers, times as `int64` with a unit, or categories), sent once; `edges` (size + 1, from CF bounds) bound its cells. `positions` are a curvilinear grid's 2-D coordinates, one value per cell of dimensions `a` and `b` (named, in the grid's order); `x` and `y` name the ones on the axes. The browser decodes coordinates and edges on the host (never uploaded) and builds the table with `gridTable()`, whose coordinate columns are computed when read, so a new version of a streamed table that changes only its variables sends only them. Dimension names are strings that are not integers.

## Providers

A `Provider` node (TODO 20) is a data container the browser loads: props `url` (with `{name}` placeholders filled from `params`), `format` (`"json"` or `"csv"`), `path`, `params` (JSON-compatible plain values), `key`, `schema`, `initial` (a `$table`), `debounce`, `refreshInterval` and `snapshot`. No new message types: a `params` change is an ordinary state update, and the browser acknowledges it once the tree is mounted, without waiting for the load it starts; commands (`settled`, exports, `time`, ...) wait for loads in flight. A load error never fails a command or an update (the previous result stays); the transform `action` command with `action: "refresh"` loads the same params again and fails with the load's error. The events `load` (`load_revision`, `rows`, `ms`) and `error` (`load_revision`, `message`) are the only events sent while an update is being applied, under the revision being applied (a payload's `revision` would collide with the event's own). The browser's `export_html` replaces a snapshot Provider's `url`, `params` and `refreshInterval` with `initial`: its last result as JSON.

## Vector tiles

A `VectorTile` node (TODO 24, 35) is a mark the browser loads: props `url` (with `{z}`, `{x}` and `{y}`), `tile`, `tiles` or `bounds` with `zoom`, `styles`, `sourceLayers`, `clip`, `fit`, `snapshot`, `live`, `minZoom`, `maxZoom` and `attribution`, or `data` (decoded tiles: a GeoJSON FeatureCollection, sent as a structured geometry resource like GeoJSON's `data`). As with Providers, an update is acknowledged without waiting for the load it starts, commands wait for loads in flight (in live mode, the tiles the view selects too), and a load error never fails a command (it shows on the plot; a live tile's failure does not). `tileData` is a list of `{ "tile": [z, x, y], "bytes": base64 text | null }`: tiles that load nothing. The browser's `export_html` adds `tileData` to a snapshot VectorTile (the requested tiles, and in live mode the live tiles on screen) and keeps its `url`, `tile`, `bounds`, `zoom` and `live`.

## Frame placement

A Frame's `placement` prop is `{ "version": 1, "anchor": [x, y] | [x, y, z], "size": [w, h] | [w, h, d], "rotation"?: [rx, ry, rz], "orientation"?: "parent" | "billboard" | "tangent" }`. Tangent orientation uses local east and north at a spherical parent anchor and is the default for spherical parents. Python always writes `version: 1`. The frontend reads a placement without `version` as a legacy version 1 descriptor and rejects any other value with "unsupported placement version <v>; expected 1". The Python `FRAME_PLACEMENT_VERSION` and the JS `FRAME_PLACEMENT_VERSION` must match; a unit test checks it.

## Scale resources

Snapshots address continuous and ordinal scales by stable IDs. A continuous scale refers to a separately versioned normalization resource through `$normalization`; two output encodings can therefore share one source domain without sharing a colormap or numeric range. Resource changes keep component IDs and browser mark buffers intact. The scene snapshot carries only compact domain and configuration metadata, while numerical columns remain separate binary resources. Offline HTML exports, built in the browser or by Python, include only the resources reachable from the requested subtree, following each one's dependencies: a table's columns and interaction resources, an identity's key column and resources (also when no mark reads that column), a scale's normalization. A continuous, ordinal, or categorical scale may carry `label`, a string that titles the legend guide shared by the marks using it; the key is absent when no label was given, and the label is fixed when the scale is created (updates do not send it).

A scale's `colormap` is either a built-in name string or a custom map `{ "colors": [css color, ...], "space": "lab" | "hsl" | "srgb", "positions": [number, ...] | null }`. Theme definitions may carry the same value under `colormap`. The built-in names are listed in `registry.json` under `colormaps`. A continuous scale whose `colormap` and `range` are both `null` uses the inherited default (the enclosing theme's `colormap`, else Viridis); an update that sets `colormap` back to `null` returns to it. Ordinal scales always carry a colormap or a range.

## Custom shapes

The snapshot's top-level `shapes` object maps each shape registered with `hm.register_shape(name, vertices)` to its polygon, `[[x, y], ...]` in the unit square [-1, 1] with y up (path strings are converted to vertices in Python). The frontend registers every entry before mounting marks; registering a name again with identical vertices is a no-op and different vertices are an error. Theme definitions may carry the same mapping under `shapes` (names verbatim, vertices as lists; Python validates them without registering them). A mark's `shape` prop is a shape name string, a column name, or a `$column` of per-row names.

## Names in expressions

An expression serializes as `{ "$expression": { "op": ..., "args": [...] } }`. A name in a
column's place is an expression of its own kind (R2.0): `hm.col.x` is `{"op": "column", "args":
["x"]}`, `hm.input.bins` is `{"op": "input", "args": ["bins"]}` and `hm.view.time` is
`{"op": "state", "args": ["time"]}`, where the state name is one of `hm.STATE_NAMES` (the frontend
checks it too). A string argument inside an expression is a name: `"@time"` state, `"$bins"` an
input, `":x"` or `"x"` a column. `hm.prev.x` is `{"op": "column", "args": ["@prev:x"]}`, a field
of the Simulate's own. A cast (`as_category`, `as_ordinal`, `as_numeric`, `as_datetime`,
`as_duration`) carries its options as a final `{ "$expression_options": { "domain"?, "unit"?,
"timezone"? } }`.

## Reduction options

A reduction
(`mean`, `sum`, `count`, `min`, `max`, `std`, `variance`, `median`, `mode`, `first`, `last`, `any`, `all`)
has arguments `[value, options?, predicate?]`. Options are
`{ "$expression_options": { "by"?: name | [names], "orderBy"?: name | [names], "order"?: "asc" | "desc" } }`.
Only first/last accept ordering. `where=` is the ordinary third operand, so field/input/interaction
discovery includes it; it is never hidden inside options. An empty options marker precedes a predicate
when there is no grouping. Boolean outputs use logical values, including boolean dictionaries;
empty any/all results are false/true. The
transform parameters listed under `expressionParams` in `registry.json` accept an expression
where they otherwise take a number.

`cumsum`, `lag` and `lead` use `[value, options]`, with optional by/orderBy/order. lag/lead also
carry `periods` (nonnegative integer, default 1) and `fill` (default null). `window` uses
`[value, options, size]`; reduce/align are structural options, and size is a positive integer or
ordinary scalar input expression, default 5. Python's order_by serializes as orderBy.
These operations calculate over visible rows within groups and restore original row order;
they neither change membership nor picking identities. Ordered grids are rejected.

`lookup` uses `[value, row, options]` with options `{ "$expression_options": { "fill": value | null } }`.
Each row reads `value` at the row numbered `row` (0-based) of the visible rows in their current
order; a missing, fractional or out-of-range row number reads the fill, and a hidden row reads
nothing. Float row numbers are exact to 2^24 rows; an int32 row column is exact throughout.

Float missing values are NaN and categorical missing values retain code -1. Int32 and device
boolean buffers require explicit typed fills because the protocol has no nullable version of
those buffers. Exact int32 neighbors are gathered without float conversion. Date fills decode
recursively inside expression options; their values are shifted to the source datetime origin.

## Seeded random expressions

`hm.random(seed=7, distribution="normal")` serializes as
`{"$expression":{"op":"random","args":[7,{"$expression_options":{"distribution":"normal"}}]}}`.
It produces one float32 value per input row. The distribution is `"uniform"` ([0, 1)),
`"normal"` (mean 0, variance 1), or `"exponential"` (mean 1); defaults are seed 0 and uniform.
Seeds are integers from 0 to 4294967295, or scalar input expressions resolved before drawing.
Table columns and view state cannot supply a seed. The same seed, distribution and input row
count reproduce the same values; reading them never advances a mutable random stream.

`Calculate` owns and reuses immutable draws until their seed, distribution or row count
changes, and releases unused draws and its cache on teardown. Generate before Filter, Sort
or Sample to keep random values attached to the original rows. Over a masked table Calculate
uses every physical row, including hidden rows; per-row random coordinates drop grid
structure, while ordinary random value fields preserve it. The browser generates these
arrays, so Python sends only expressions and Data's row count, without uploaded data.

## Animation

`hm.animate(value, duration=, easing=, enter=, exit=)` serializes as
`{ "$animate": { "value": ref, "duration"?: ms, "easing"?: name, "enter"?: ref, "exit"?: ref } }`
and decodes to the JS `animate()` descriptor. `value` is a column name, an expression, a
constant, or a `$column` (Python turns arrays and lists into columns); `enter` and `exit` are
constants in the channel's units (a number, a color string, or component numbers), numeric column names, or numeric expressions. Enter expressions read new rows and exit expressions read previous departing rows; nonfinite components retain the channel value. It
is accepted only as the whole value of a mark or Mapping channel: animate() must be the
outermost operator on a mark channel, so Python rejects it inside an expression, a Calculate
output, a list or dict, or a non-channel prop. `hm.tween(value, duration=, easing=)` is the
expression op `"tween"` whose second argument is `{ "$expression_options": { "duration"?, "easing"? } }`.
Durations are finite, nonnegative milliseconds and easings are one of `linear`, `quad-in`,
`quad-out`, `quad-in-out`, `cubic-in`, `cubic-out`, `cubic-in-out`, `sine-in-out`.

The state `"@time"` (`hm.view.time`) is the view clock in milliseconds: 0 when the view mounts, it
advances by the frame time (once per displayed frame) while anything on the view animates, and
stops while frozen. Mark channels, Filter conditions, Calculate columns and expression-valued
transform parameters read it. `hm.interval(value, ms)` is the op `"interval"` whose second
argument is `{ "$expression_options": { "period": ms } }` (a finite number, at least 1);
`hm.floor(x)` and `hm.round(x)` are the ops `"floor"` and `"round"`. A table column named
`"@time"` is rejected. The
`time` command reads and sets it. With no `time` argument it only reads the clock; with
`{"time": ms, "freeze"?: bool}` it first sets the clock, frozen there unless `freeze` is false
(`freeze` defaults to true); `{"time": null}` resumes a frozen clock. Either way it returns
`{"time": ms, "frozen": bool}`, so a caller can save the state and put it back. The target is a
Plot, Scene, or Facet, which sets every clock inside it and reports the first.
Exports evaluate `@time` at the frozen value, which is how `export_mp4` renders frames; it
restores the saved time and frozen state afterwards.

## Encoded images

The sky effect's image given in Python as a file path, bytes or a PIL image travels as its encoded file, not as pixels: a `$column` whose descriptor has `dtype` `uint8`, `shape` `[byte length]`, `logical_type` `"encoded-image"` and `mime` (`image/png`, `image/jpeg`, `image/webp`, `image/gif` or `image/bmp`, from the file's first bytes; a PIL image is encoded in its own format when it has one, else as PNG). The browser turns it into a `Blob` of that type and decodes it with `createImageBitmap`, so a 2048 x 1024 JPEG star map is 250 KB on the wire instead of 25 MB of float32 pixels. A URL string (`http`, `https` or `data:`) is sent as the string and fetched by the browser. An Image's `data` given as a file travels the same way (TODO 69.10), and the browser decodes it into the Image's pixels (RGB, or RGBA when a pixel is not opaque). Other props never use this column kind.

## Effects and glow

A Plot's `effects` (TODO 138.3) is a list of `{kind, ...parameters}`, each kind once: `sky` (`image`, `zenith`, `horizon`, `ground`, `rotation`, `visible`; a 3D Plot only), `bloom` (`strength`, `radius`), `fog` (`near`, `far`, `color`; a 3D Plot only), or a plugin's kind, whose parameters the browser checks against the plugin's schema (a kind no plugin registers is skipped with a `plugin.missing` warning). The values are plain except the sky's encoded image; the state carries only the kind's name, and the plugin's file comes from its installed package (see Plugins). `glow` is a mark prop (a number, at least 0), and a Frame's `atmosphere` is a boolean or `{color, thickness}`.

A prop that takes a plain value (not a channel or a transform's expression: the registry's `stringReads` lists those) may be an `$expression` whose only reads are inputs, such as a Frame's `placement` numbers, a Force's `dimensions`, `camera_position`, the fog effect's `near` and `far`, `glow` and the sky's `visible` (TODO 69.10). The browser replaces the input reads by their values and evaluates the expression on the host (numbers, booleans, text literals and dates; arithmetic, comparisons, `where`, `clip`, trigonometry) each time an input it reads changes; the component gets the value. The browser composites them after the scene pass (docs/RENDERING.md "Sky, fog and glow").

## Plugins

A scene's state names the plugins its effects and shades need (TODO 138.4): `plugins`, a list of `{name, version, hash}` (left out when it names none), where `hash` is `"sha256-"` and the base64 of the SHA-256 of the plugin's file, from the installed package's `manifest.json`. The state, saved states and portable templates (`template.plugins`) carry names only, never code. The file comes from an installed plugin package, never from Python code: a view sends `plugin_request` with `request`, `name`, `version` and `hash`, and Python answers `plugin` with that `request` and the file the package installed as the message's one binary buffer, or no buffer for a plugin it does not use (`hm.use_plugin`). An exported page's payload holds `plugins`, `{name: {hash, source}}`, beside `state` and `columns`; Python's export session serves each file at a URL instead (`{name: {hash, url}}`). The browser hashes each file, runs it only when the hash matches, and registers its default export once per page. A plugin with no file is a `plugin.missing` warning, one whose file does not match or throws a `plugin.failed` warning, and another copy of a plugin the page loaded already a `plugin.conflict` warning; the scene draws without it.

## RGB color channels

`hm.rgb(r, g, b, a=None)` serializes as `{ "$rgb": { "r": ref, "g": ref, "b": ref, "a"?: ref } }`, where each ref is a column-name string or a `$column` reference. The frontend decodes it to the `{r, g, b, a}` object a mark's `fill`, `color`, or `outlineColor` accepts. An N x 3 or N x 4 NumPy array needs no descriptor: it is an ordinary 2-D `$column`. Integer columns are 0-255 and float columns 0-1; the frontend validates the range and reports errors through the usual `error` message.

Outlined marks use opaque RGB colors plus `outlineOpacity` (Python `outline_opacity`) for
border alpha. It is an ordinary numeric channel: a scalar, column name, one-dimensional
`$column`, or `$expression`, including `animate` wrappers. Width/opacity are resolved per
row, with missing values hiding the border. Mark opacity and interaction feedback still
apply to the whole mark; inside borders fade over the fill. Glyphs and line-only marks
have no outline channel. See [outline support](../docs/OUTLINES.md) for compound scopes and units.

## Connections

`hm.connect(*endpoints, key=None, order=None)` serializes as a versioned descriptor on the
`connections` prop of a Line, Segments, Arrows3D, or Arrows:

```json
{ "$connect": { "version": 1, "key": "id" | null, "order": "facet" | null,
    "endpoints": [ { "target": { "$ref": "<mark id>" }, "at": "left" | null },
                   { "scope": { "$ref": "<Facet or Partition id>" }, "name": "values", "at": null } ] } }
```

`target` endpoints are marks (`hm.connect(mark, ...)` or `mark.endpoint(at=...)`); `scope`
endpoints select the uniquely named mark a Facet or Partition repeats in every cell or group
(`facet.endpoint("values", at=...)`). One endpoint alone must be a mark repeated by a Facet or
Partition and connects its cells in facet order whether `order` is `"facet"` or `null`. `at` names an attachment (`null`: the mark's default);
the attachment names per mark kind, the endpoint and connector kinds, and the `order` values are
listed under `connections` in `registry.json`, generated from the renderer. The descriptor
carries node references only, never data: the browser resolves each `$ref` through the mounted
handle's own `endpoint()` (as a Svelte author writes `connect(before, after.endpoint({at}))`),
matches rows by the exact value of `key` (or, without it, by source observation identity in one
table), and gathers positions on the GPU. A reference to a mark repeated by a Facet or Partition
identifies the repeated definition, not one cell. The frontend decodes versions up to its own
and rejects a newer one with "connect descriptor version <v> is newer than this library supports
(1)."; Python always writes `version: 1`.

Endpoint references may point forward: a connector may precede its endpoints in the snapshot.
An endpoint whose node has not mounted yet is pending; the connector keeps what it drew (nothing
on the first frame) and resolves when the endpoint registers, and `settled` waits for that
preparation. Python checks what it can before sending: `connections` only on the four connector
kinds and never together with `x`, `y`, `z`, `position`, `start`, `end`, or `series`; the
descriptor is the whole value (not inside a list, dict, literal, or expression); endpoints are
in the scene, in the consumer's Plot, and a Facet selection names an embedded Facet (inside a
Plot). Matching, attachment, and frame errors come back from the browser as `error` messages
naming the connector, with the renderer's texts (`src/lib/plot/utils/connections.js`).

Pointer `event` payloads of a connector carry `connection`:
`{ "index": int, "key": value, "source": slot, "target": slot, "slots": [slot, ...], "pair"?: [slot, slot], "ownerRow"?: int }`,
where `key` is the matched key value (for identity matching, the observation token such as
`"row:3"`), `source`/`target` are the first and last declared slots, `pair` the two slots of the
picked segment, and `ownerRow` the shared owner row when every endpoint shows the same table
(the event's `row_index` is then that row). A slot is
`{ "slot": int, "label": str, "definition": str, "cell": str | null, "kind": str, "row": int | null, "key": str | null, "node": str | null }`:
`row` is the endpoint's row (`null` where the connection has no row in that slot, which breaks
the path), `key` that row's match token (`"number:2"` for the key value 2), `cell` the facet cell
or partition key, and `node` the endpoint's scene node id (one id for every cell of a repeated
mark). Python exposes it as `event.connection`.

`Data` accepts `{rows: N}` instead of a table resource. It carries no binary columns and
provides index-based row identity without allocating placeholder arrays. `rows` is an integer
from 0 to 2147483647. The `row` expression (`{"op":"row","args":[]}`) enumerates visible
rows from zero; hidden physical rows contain -1. Calculate can retain it before filtering.
Seeded `random` expressions generate columns on the device through ordinary Calculate ownership.

## Graph tables and current-value columns

GraphData serializes `nodes` and `edges` as ordinary `$table` resources. `nodeKey`, `source` and `target` are column names. Its default descendant scope is edges; Nodes/Edges select a relation without a renderer. The browser attaches a graph capability to ordinary table views, analogous to grid metadata. Most consumers see only a table; graph-aware layouts specialize to its canonical IDs and endpoint mappings.

The supplied Table's observation `key` and interaction resources remain independent from structural `nodeKey`; GraphData does not rekey shared tables. Python resource properties on descendants resolve to the nearest selected relation, defaulting to edges. A GraphData without `nodes` computes inferred node rows only in the browser, so these nodes have no Python host Table for `.selection` access. Explicit GraphData node Tables retain that access through `reduce` enrichment. Interaction status and selection commands continue using the ordinary resource IDs and owner row indices.

A GraphData without `edges` uses the current table as its edges, and without `nodes` infers them from the endpoints (FromEdges was folded into it, TODO 137.3). `nodeFrom` selects source/target grouping; `reduce` maps output names to `{op, field}` reducer descriptors. Existing nodes retain ID/order and gain or replace reduced attributes. Row-preserving transforms keep graph identity, node filtering induces edges, and destructive aggregation ends that capability. No extra wire-level linked-table generalization is introduced.

Force, Tree, DAG, Pack, Treemap and Sankey no longer accept endpoint mappings or node tables. Graph is removed; use node coordinates directly or Calculate inside Nodes. `position` takes precedence over `x`/`y`/`z`; Edges' derived endpoints gather current node values lazily.

Tween producers keep targets, timing and keyed interpolation state private. Every ordinary column read returns the current published value, including nested numerical expressions. Generic live-column notifications tell downstream transforms/layouts/marks that values can change; they expose no tween target descriptors. Producers publish complete snapshots before dependent work, and retained snapshots keep their buffers alive for picking and exports.

## Tree output columns

Every Tree mode roots reachable nodes consistently: directed follows outgoing edges, undirected reroots the component. Nodes retain original node-table identity and expose `id`, `parent`, `position`, `x`, `y`, `depth`, `degree`, `order`, `parentPosition`, `parentX`, and `parentY`. Partition adds `x0`, `x1`, `y0`, `y1` and matching `parentX0`, `parentX1`, `parentY0`, `parentY1`. Parent coordinates are NaN for roots. Column names are identical in both languages. Edges preserve original rows and expose `start`, `end`, and child endpoint `depth`. `root` accepts a scalar expression descriptor over the original node table, including selection.

Tree partition's `nodeWidth` and `layerHeight` accept numeric expressions, including `$expr` tween descriptors. The browser evaluates these against the persistent keyed node table on the plot clock before layout. Zero widths/heights collapse geometry while retaining node identity; restoring values grows it again. Each child's band begins at its parent's end.


## Tree layout animation

Tree offers compact CPU `tidy`, GPU `tidy-approx` (horizontal intervals per subtree),
GPU `partition`, and CPU `cluster`. GPU modes cache topology by node IDs/order, source/target
columns, root and direction. Width/height changes reuse structural buffers. Partition uses
leaf prefix sums; root-path accumulation uses logarithmic pointer-jumping passes. Approximate
and fixed-width subtree sizing uses ordered depth passes, so very deep trees cost more.
CPU tidy can consume moving inputs too, but reads numeric values and lays out on the host.

`edgeLength` (Python `edge_length`) reads a nonnegative edge-table column or expression.
Tidy modes accumulate lengths along root paths, multiplied by `depthSpacing`; siblings can
have unequal lengths. Partition uses per-node `layerHeight`; cluster uses merge heights.

Put visibility on Tree's `where`, not a Filter after Nodes, when branches should reflow.
It reads the node table and disconnects descendants of hidden nodes; the root remains present.
Tree's `enter` and `exit` specify nonnegative numeric `nodeWidth`, `layerHeight`, and
`edgeLength` contributions (omitted endpoints are zero). `animationDuration` and
`animationEasing` control these lifecycle transitions. Initial mounting rests at the target.
In Python, nested keys are `node_width`, `layer_height`, and `edge_length`.

Departing nodes and edges remain until their contributions land; new rows start at enter
values. Interrupted membership transitions continue from their current contribution.
`presence` on Nodes and Edges ranges from zero to one, so `opacity="presence"` fades marks
with their branch. Incoming `tween()` expressions remain ordinary numeric inputs with their
own timing; they do not declare layout entry/exit. Draw moving geometry directly without
another mark animation or bounds animation. Cluster does not support layout lifecycle.
Changing the root or reparenting a surviving node switches topology discretely; it does not
retain both parents. Use a fixed root with tweened weights/heights for continuous zoom, as in
the sunburst example. Structural changes may compile a new GPU plan.

Source validation and membership updates may read data once; GPU numeric layout does not
read coordinates back each frame. Rendering, bounds, picking and export retain their existing
readbacks. See [Expandable tree](/examples/expandable-tree) and [Sunburst](/examples/sunburst).
