# Connections: Anchor, connect(), and endpoint()

A *connector* is a Line, Segments, Arrows3D, or Arrows that draws between other marks
instead of from its own columns. `connect()` names the marks to join (the *endpoints*) and how
their rows pair up; the connector takes every position from where those endpoints are drawn.
`Anchor` is an endpoint mark that holds a position and draws nothing.

```svelte
<script>
  import { Plot, Points, Anchor, connect } from "hmplot";
import { Arrows } from "hmplot/charts";
  let before = $state(), after = $state();
</script>
<Plot data={countries} axes2d>
  <Points bind:this={before} x="y2000" y="country" />
  <Anchor bind:this={after} x="y2021" y="country" />
  <Arrows connections={connect(before, after, { key: "country" })} color="region" />
</Plot>
```

```python
with hm.Plot(data=countries, axes2d=True) as plot:
    before = hm.Points(x="y2000", y="country")
    after = hm.Anchor(x="y2021", y="country")
    hm.charts.Arrows(connections=hm.connect(before, after, key="country"), color="region")
```

The gallery has two worked examples: `before-after-arrows` (the one above, with labels and a
legend) and `parallel-coordinates-connected` (a Line through the points repeated in every cell
of an embedded `<Facet fields={[...]}>`, each cell holding a Frame that sets x from 0 to 1 so the
points sit on the cell's axis). `python/examples/52_connect.py` builds both from Python and reads
`event.connection` in a click callback. The reference pages are `connect` and `anchor`, and the
Composition guide has a "Connecting marks" section.

## Endpoints

An endpoint is one argument of `connect()`:

- a mark (`bind:this` handle in Svelte, the node in Python): attaches at the mark's default
  attachment. In Python a mark written inside an embedded Facet or a Partition is the repeated
  mark itself (see below);
- `mark.endpoint({at: "left"})` (Python `mark.endpoint(at="left")`): a named attachment;
- `facet.endpoint("values")` or `partition.endpoint("values")` (optionally `{at}` / `at=`): the
  mark named `"values"` that an embedded Facet repeats in every cell, or a Partition in every
  group. Passed alone, `connect(facet.endpoint("values"))`, it connects the cells in facet
  order (see Slots). The name must be unique among the endpoint marks inside that
  Facet or Partition; two definitions with the same name are an error. A Facet placed outside
  a Plot (an external grid of separate views) offers no endpoints. This is how Svelte reaches a
  repeated mark (its `bind:this` holds one cell's copy); Python has it for parity, but the mark
  variable is simpler there.

In Svelte, `bind:this` is unset on the first render, so `connect(before, after)` may receive
`undefined`: that endpoint is *pending*, not an error. The connector draws once every endpoint
has mounted and published its rows. Forward references are fine in both languages: a connector
written before its endpoints resolves them when they mount, and `whenSettled()` / Python's
`when_settled()` waits for that preparation. While an endpoint is pending the connector keeps
what it last drew (nothing on the first frame). An endpoint that resolved before and is removed
later becomes a *missing slot*: its connections break there instead of the connector failing.

A Python node is the authored definition, so a reference to a mark inside an embedded Facet or
Partition identifies the *repeated definition*, not the last rendered cell: passed alone,
`hm.connect(values)` expands to every cell, exactly like `hm.connect(facet.endpoint("values"))`,
and needs no `name`.

In Svelte, a `bind:this` inside Facet cells or Partition groups holds one cell's copy, so select
a repeated mark through the Facet or Partition handle. Marks written in an `{#each}` (say one
Frame per field, for wide parallel coordinates) are not repeated in this sense: each mount is
its own mark, so bind each one and pass them all, `connect(...axes)`. Only Facet cells and
Partition groups make a repeated definition.

### The endpoint registry

Each Plot keeps one endpoint registry (`src/lib/plot/utils/endpointRegistry.js`). Every mounted
endpoint-capable mark registers one entry, keyed by its *definition* (where it is authored in
the tree, the same key legends use; every cell of a repeated mark shares it) and its *cell*
(the facet cell and partition group it is mounted in, with an ordinal for facet order). A mark
passed to `connect()` resolves to its whole definition only when it is mounted in a cell; any
other mount resolves to itself. Definition keys follow settings-tree labels, and unnamed Frames
all read "Frame", so unnamed marks in sibling Frames (an `{#each}` of Frames) share a key
without being one mark; inside a cell such marks are ambiguous, and the connector reports
`connect: "Sprites 1" is mounted more than once in one facet cell; give each mount its own
name.` An entry
refers to the mark's live GPU fields and to the prepared frame it shows, with a data revision
(new rows, new values) and a frame revision (new mapping). Nothing reads pixels or DOM
positions back. Connectors subscribe to the entries they use; registration changes re-resolve,
data changes re-match, and frame changes only re-gather positions.

Only marks that mount through the same Plot can connect: an endpoint in another Plot (another
Plot of a Scene, a cell of an external Facet) is an error.

## Slots and connector kinds

A *slot* is one position along a connection. With two or more arguments, each argument is one
slot, in argument order, and must resolve to one mark. One endpoint passed alone must be a
mark repeated in embedded Facet cells or Partition groups, and it expands into one slot per
cell in facet order: the configured `columnOrder`/`rowOrder`, Partition groups in group order
(within each cell when a Partition sits inside a Facet), row-major for `fields` with a
categorical split (fields x category), and row-major for a `pairs` matrix (row = y field,
column = x field, in the `pairs` lists or as `rowOrder`/`columnOrder` reorder them). `order: "facet"` (Python `order="facet"`) names that order; it is the
default and the only order, and it takes exactly one endpoint.

Two mistakes are errors when the connector resolves its endpoints:

- a repeated mark among other endpoints: `connect: "values" is repeated in 4 facet cells; pass
  it alone (the only endpoint) to connect the cells in facet order.` (Partition groups and
  Partitions inside Facet cells are named as such);
- one mark that nothing repeats, passed alone: `connect: "Anchor 1" is a single mark, so it has
  nothing to connect to; pass two or more endpoints, or one mark repeated by a Facet or
  Partition.` Python raises the same error as soon as it can see the mark's place.

- **Line** draws one path per connection through all of its slots.
- **Segments**, **Arrows**, and **Arrows** draw one row per adjacent slot pair (one
  arrowhead per pair): `connect(a, b, c)` gives two segments per connection.

`connections` replaces `x`, `y`, `z`, `position`, `start`, and `end`; writing any of them (or
`series`) on the same mark is an error. Channels inherited from a `Mapping` give way silently.
Only the four connector kinds accept `connections`.

## Matching rules

A *connection* joins one row of each slot.

- **Explicit key** (`{key: "id"}` / `key="id"`): one column, present in every endpoint's data.
  Values match exactly: `"1"` never matches `1`, and there is no string/number coercion. Null,
  NaN, and infinite key values match nothing. Keys must be strings, numbers, or booleans.
- **Implicit** (no key): every endpoint must show observations of one table (the table itself,
  or a Sort, Filter, or Sample of it), and rows pair by original observation, through the same
  source provenance keyed animation uses. Endpoints from different tables are an error that
  asks for `key=`; an endpoint that shows one observation twice is an error too.
- A Facet over `fields` (or `pairs`, or a Facet split by a Fold's key) builds each cell over
  the table's own rows (docs/FACETS.md, "Facet over fields"), so a mark repeated in those cells
  shows the same observations everywhere: parallel coordinates match without `key`, and a
  Shift-drag on one cell's y strip brushes that field.
- Aggregates (Histogram bins, Bar or BoxPlot groups) have no single source observation, so they
  need an explicit key naming a group column.
- One endpoint row per key per slot. A key that repeats within one endpoint is an error naming
  the key and the endpoint, never a Cartesian-product join.
- A key missing in a slot does not match: a Line path breaks there (it never skips across the
  gap), and a pair that would use that slot is not drawn. Rows whose endpoint position is not
  finite (a missing value) break the same way.
- Connections are ordered by first appearance of their key, slot by slot.
- Visibility and data changes follow the rows: hiding a legend category breaks that category's
  connections, while hiding the whole endpoint mark (its `visible` option) keeps them; a Filter
  on an endpoint breaks the filtered rows' connections and re-pairs them when its condition
  changes; replacing a keyed table re-pairs by key; connectors to Tree or Force Nodes pair by
  node id.

The match is cached separately from positions. It depends on the endpoints' data revisions and
the descriptor only: frame changes, camera motion, and placement moves never invalidate it.

## Coordinate space

Every endpoint position is where that endpoint is drawn:

1. the attachment is evaluated on the endpoint's own rows in its own data coordinates (see
   the table below);
2. the result goes through the endpoint's own frame chain: nested Frames, embedded Facet cells,
   log and sqrt ancestors;
3. layout displacement is included: Force and Tree positions are data, and Dodge's per-point
   pixel offsets travel with the connection as pixel shifts at each end.

The connector draws those positions directly (its `positionSpace` is "world"): its own frame's
mapping is not applied a second time, and curves and dashes are evaluated in that space. The
connector must be mounted in a frame that contains every endpoint, usually as a sibling of the
Facet rather than inside one of its cells; an endpoint outside the connector's frame is an
error. In 3D, a straight connection is a world-space chord between the placed endpoints.

Connectors ignore the camera: an endpoint outside the viewport keeps its connection (the part
on screen is drawn), and there is no clipping to a child frame and no rerouting around other
marks. Hiding an endpoint's categories through its legend makes those endpoints missing, so
their connections break. An Anchor has no visible geometry at all and is still a full
endpoint.

## Attachments

| Endpoint kind | Default (mark passed directly) | `at` values |
| --- | --- | --- |
| Anchor, Points, Points3D | `center` | `center` |
| Text | `anchor`: the data position, before `dx`/`dy` | `anchor` |
| Rect, Prism | `center` | `center`, `left`, `right`, `bottom`, `top` (edge midpoints) |
| Bar, Histogram | `center` | the Rect values, plus `baseline` and `value` |
| BoxPlot | `center` (box center) | the Rect values, plus `q1`, `q3`, `median` |
| Segments, Arrows3D, Arrows | none: `at` is required | `start`, `end` |

- `left`/`right`/`bottom`/`top` are the x0/x1/y0/y1 edges in data order, so an inverted axis
  draws `top` lower on screen. A rotated Prism footprint attaches as its unrotated box.
- A bar's `value` end is the end away from its baseline (for a negative bar, its lower edge);
  `baseline` is the other end. Histogram `value`/`baseline` lie along the value axis.
- BoxPlot `q1` and `q3` are the box edges on the value axis, `median` the median line. While a
  BoxPlot animates, the median attachment keeps its relative position inside the moving box.
- `at` that a kind does not offer is an error listing the available names; a Segments endpoint
  passed without `at` is an error listing `start, end`.

Marks without an attachment cannot be endpoints yet, and the error says why and suggests an
Anchor: Line (general line vertices), Area, ErrorBars, and Violin (boundary
intersections), GeoJSON (feature representatives), Surface (surface samples),
Heatmap (solid-surface attachments), Image (raster cells), and Text3D (positioned on the CPU;
use Text). A connector cannot itself be an endpoint yet either. The fix in every case is an
Anchor at the position the connection should attach to.

The attachment names per kind are generated from `ATTACHMENTS` in
`src/lib/plot/utils/connections.js` into Python's `registry.json`, so both languages list the
same names; a unit test compares them.

## Appearance

Color, width, opacity, and the connector's other channels resolve once per connection, in a
scope built from the endpoints:

- When each connection joins one observation of one shared table in every slot (always the
  case for implicit matching; for an explicit key when every endpoint shows the same table),
  unqualified columns come from that observation's row: `color="species"`, `width="mass"`. The connector's `select` and `hover` act on those rows, so selecting a
  connection selects the observation and linked marks respond.
- Across tables, unqualified names are ambiguous; use `"source.<column>"` and
  `"target.<column>"`, which read the first and last declared slot. When the first or last slot
  has no row for a connection, its qualified columns are missing for that connection; they are
  never taken from another slot. An unqualified name that more than one endpoint table has is
  an error suggesting both qualified forms.
- Constants and explicit per-connection arrays keep working.

Scales, legends, and category state key on the original column, so a categorical `colorScale`
shared with the endpoints stays consistent, and `<Legend for={connector} channel="color">`
(Python `hm.Legend(target=connector, channel="color")`) lists the connector's categories.
Arrowheads, widths, `curve`, and `dash` apply to connectors as to any Line or Segments.

## Picking and events

A connector is pickable like any mark. Its pointer events carry `event.connection` (Python
`event.connection`, a dict):

```text
{ index, key, source, target, slots, pair?, ownerRow? }
slot = { slot, label, definition, cell, kind, row, key, node? }
```

- `key` is the matched key value (for implicit matching, the observation token such as
  `"row:3"`); `index` the connection's position in the connector.
- `source` and `target` are the first and last declared slots, `slots` all of them, and `pair`
  the two slots of the picked segment (Segments/Arrows row, or the Line piece under the
  pointer).
- A slot names its endpoint (`label`: the mark's `name` or settings-tree label; `kind`;
  `definition`; `cell`: the facet cell or partition group) and its row in that endpoint
  (`row`, or `null` where the connection is missing in that slot). Python events add each
  slot's `node`, the endpoint's scene node id (one id for every cell of a repeated mark).
- With one shared table, `ownerRow` is the connection's row in it, and the event's row index
  is that row, which is what select and hover use. Across tables, a click does not change
  either endpoint's selection; callbacks get both endpoints and decide.

## Animation

A connector never animates on its own: its positions have no transitions, no enter/exit, and
no lifecycle fade, and animating it would double the endpoints' motion. Instead it follows its
endpoints live on the GPU, at the same clock time:

- endpoints that animate (implicit transitions, `animate()`, keyed enter/exit) are followed
  right after each blend step of the Plot clock, so the connector is always drawn at its
  endpoints' current time;
- endpoints with a procedural `@time` channel are followed after every step;
- frame bounds and range *option* changes (settings-pane sliders, `frameOptions.set(...)`) are
  followed without re-preparing anything.

A Frame whose `x`/`y` *props* change re-prepares its marks, so connectors to them update
through a full preparation: correct once settled, one step behind while a prop-driven animation
of the range runs. A `projectionCenter` prop change (its own or a parent's) only moves the
mapping: it re-prepares nothing, and connectors follow through the live gather.

## How it runs

Two tiers share one attachment formula:

- **Preparation** (`utils/connectionPrepare.js`, jax): runs when the descriptor changes
  structurally (a re-render that builds an equal descriptor does nothing), when an endpoint
  registers or unregisters, and when an endpoint's data changes. It resolves the endpoints,
  builds the slots, matches (cached), gathers positions, and prepares the connector and its
  appearance scope. At most one run is in flight with one pending update.
- **Live gather** (`utils/connectionGather.js`, WGSL compute): re-reads the endpoints' live GPU
  field buffers and writes the connector's own position buffers in place, so material
  bindings never change. Two pipelines per device are created once, frame parameters travel in
  a uniform buffer, and nothing is read back; sliders and animation compile no programs. A
  dispatch is skipped (the previous geometry stays) while an endpoint shows rows the current
  match has not seen, so no stale endpoint combination is ever drawn.

Camera changes run neither tier. The view's counters (`diagnostics.counters` in its services:
`connectionMatches`, `connectionPreparations` and `connectionGathers`) count matches,
preparations, and live dispatches for tests.

## Python

```python
before = hm.Points(x="x0", y="y")
after = hm.Anchor(x="x1", y="y")
hm.Arrows3D(connections=hm.connect(before, after, key="id"), color="group")

bars = hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1")
hm.Segments(connections=hm.connect(bars.endpoint(at="right"), after, key="id"))

with hm.Facet(fields=["bill_length", "bill_depth", "flipper", "mass"]):
    with hm.Frame(x={"domain": [0, 1], "visible": False}):  # x = 0 is the cell's left edge
        values = hm.Points(x=0, y="value", brush={"axis": "y"})  # Shift-drag an axis to brush it
hm.Line(connections=hm.connect(values), color="species", respond="brushed")
```

- `hm.connect(*endpoints, key=None, order=None)` returns an immutable `hm.Connect`;
  `mark.endpoint(at=None)` and `facet.endpoint(name, at=None)` / `partition.endpoint(...)`
  return an immutable `hm.Endpoint`. One endpoint alone is a repeated mark, connected across
  its cells in facet order (`order="facet"` is the default and may be omitted). Replace a
  connection with `connector.update(connections=hm.connect(...))`.
- The descriptor travels in the scene snapshot as `{"$connect": {"version": 1, ...}}` with
  `$ref` node ids and no data (python/PROTOCOL.md, "Connections"), so it round-trips through the
  widget, self-contained HTML export, headless export, and Pyodide the same way.
- Python checks what it can before sending, with the renderer's texts in Python call syntax:
  `connections` only on the four connector kinds, never with positional channels or `series`,
  never nested inside a list, dict, literal, or expression; unknown `at` names; kinds that
  cannot be endpoints; Facet or Partition passed without `.endpoint(name)`; one mark alone
  that no Facet or Partition repeats (at `hm.connect` when the mark is already placed, else
  when the scene validates); endpoints missing from the scene or in another Plot; a selection
  on a Facet placed outside a Plot. Matching,
  attachment, and frame errors come back from the browser as the connector's error.
- `event.connection` in `on_click` / `on_hover` callbacks is the payload above, with endpoint
  node ids (`event.connection["source"]["node"] == before.id`).

## Limitations

- Endpoints in a pixel-anchored (2D placed) Frame raise an error: the placement depends on the
  camera of each render pass. Endpoints in a 3D world-size placed Frame are supported; 3D
  billboard Frames raise an error (they turn with the camera).
- A connector whose own frame is a 2D globe or map gathers its endpoints in that frame's
  longitude and latitude and draws them like a spherical Line: great circles (or the
  frame's `interpolation`), cut at the horizon, with heads only at visible true ends. Its
  endpoints must be on the globe or in a frame ranged on it. A connector on a 3D globe
  raises an error. Connections stay within one Plot: no cross-canvas connections.
- Curved connectors (catmull-rom, monotone, cubic, quadratic, link) follow endpoint motion
  with their curve controls from the last rest state, and are exact again about 120 ms after
  the frame stops moving; basis curves and surface-attached Lines update only at rest. Curved
  connectors ignore endpoints' pixel offsets (such as Dodge's); straight ones apply them.
- Explicit-key and compound (Bar, Histogram, BoxPlot) attachments wait while an endpoint shows
  a keyed-lifecycle union (the rows of a keyed update that are still entering or leaving); the
  connector keeps its last geometry meanwhile and catches up when the update settles.
- A Frame prop change (`x={{range}}`) re-prepares the marks inside it, so their connectors
  re-run the full preparation (see Animation).
- A running Force publishes new Nodes every simulation step, so its connectors are re-matched
  and re-prepared per step: exact at every step, but a large graph pays one connection
  preparation per step. Tree layouts are static and cost nothing extra.
- An embedded Facet nested inside another embedded Facet's cell is ordered and selected by the
  inner Facet alone.
- Line vertices, band boundaries, GeoJSON features, surfaces, rasters, CPU text, and connectors
  cannot be endpoints yet; place an Anchor instead.
- Solid `Arrows3D` show selection fading only with `transparent` (as elsewhere);
  Arrows and Segments fade as usual.
