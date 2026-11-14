# connect

Connections between marks: Line, Segments, Arrows3D and Arrows draw them between the endpoints' positions.

## Example

```svelte
<Points bind:this={before} x="x0" y="y" />
<Points bind:this={after} x="x1" y="y" />
<Arrows connections={connect(before, after, { key: "id" })} />
```

## Members

### Members

- `key` (`string`): A column matched by exact value in every endpoint; without it, the endpoints must show observations of one table, matched by identity.
- `order` (`"facet"`): "facet" (the default and only order): one endpoint repeated in Facet cells or Partition groups connects its cells in facet order.

### Endpoints

- `mark.endpoint({at})` (`endpoint`): A mark as an endpoint, with an attachment; passing the mark itself uses its default. Python: mark.endpoint(at="left").
- `facet.endpoint(name, {at})` (`endpoint`): The mark an embedded Facet or a Partition repeats in every cell, by name. Python: the mark itself.
- `at` (`string`): Where on the endpoint: center, anchor, left, right, top, bottom, baseline, value, q1, q3, median, start or end, as its kind offers.

## Usage

`connect()` describes connections between marks, and a Line, Segments, Arrows3D, or Arrows with `connections={connect(...)}` draws them from where those marks are drawn instead of from its own `x`/`y`/`z`, `position`, or `start`/`end`. `connect(before, after, {key: "id"})` pairs the row of `before` and the row of `after` that share an `id`; `connect(a, b, c, {key})` makes three-stop paths; `connect(facet.endpoint("values"), {key: "id"})` connects the mark an embedded Facet or a Partition repeats in every cell, in facet order. One endpoint passed alone must be such a repeated mark (one mark alone has nothing to connect to), and a repeated mark among other endpoints is an error; `{order: "facet"}` names the order and is optional. A Line draws one path per key; Segments, Arrows3D, and Arrows one row per adjacent pair. In Python: `hm.connect(before, after, key="id")`, `mark.endpoint(at="left")`, and `hm.connect(values, key="id")` with `values` the Anchor written inside the Facet (a Python mark is its repeated definition; `facet.endpoint("values")` works too).

Rows match by the exact value of `key` (`"1"` never matches `1`). Without `key`, every endpoint must show observations of one table (a mark, a Sort or Filter of the same data) and rows match by observation. A key missing in one endpoint breaks that connection there; a key that repeats within one endpoint is an error, never a join. Aggregates such as Histogram bins have no single source row, so they need a key.

Endpoints are marks, `mark.endpoint({at})` to choose where a connection attaches (a bound mark that can be an endpoint is an `EndpointHandle`, with `getMark()` and `endpoint()`), or `facet.endpoint(name)` / `partition.endpoint(name)`. Points and Anchors attach at `center`; Text at `anchor`, its data position before any pixel offset; Rect and Prism at `center` or an edge midpoint (`left`, `right`, `bottom`, `top`); Bar and Histogram also at `baseline` and `value`; BoxPlot at `center`, `q1`, `q3`, or `median`; Segments, Arrows3D, and Arrows at `start` or `end`, which they require. Marks without an attachment (a Line's vertices, an Area's boundary, a GeoJSON feature, a Heatmap cell) cannot be endpoints yet: place an Anchor where the connection should attach.

Positions are where each endpoint is drawn, through its own frame, and the connector is drawn in its own frame, which must contain every endpoint (a sibling of the Facet, not a mark inside one of its cells). Color, width, and the other channels resolve per connection: when every endpoint shows one table, unqualified columns come from that table's row and `select`/`hover` act on it; across tables, `source.<column>` and `target.<column>` read the first and last endpoint. Pointer events carry `event.connection` with the key and every endpoint's row. Connectors never animate on their own: they follow their endpoints live, at the same clock time. See docs/CONNECTIONS.md for the matching rules, animation, and the current limitations.

## Related examples

- [Before and after arrows](/HMPlot/examples/before-after-arrows.md)
