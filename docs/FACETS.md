# Facets, transforms, and columns

`Data`, `Facet`, and transforms are context providers. They do not create GPU devices. Ordinary child markup defines the repeated plot or the consumers of a derived table; no explicit Svelte snippets are needed.

## Facets

```svelte
<script>
  import { Data, Facet, Plot, Points } from "hmplot";
  let facets;
  const observations = {
    length: [4, 5, 6, 7],
    width: [2, 3, 3, 4],
    species: ["A", "A", "B", "B"],
  };
</script>

<Data value={observations}>
  <Facet bind:this={facets} column="species" wrap={3}>
    <Plot height={240} axes2d>
      <Points x="length" y="width" fill="species" />
    </Plot>
  </Facet>
</Data>
```

- `row` and `column` name categorical fields. `rowOrder` / `columnOrder` override category order. Matrix facets include empty intersections. Inferred category domains append without changing existing assignments, so removed categories can retain empty cells.
- `wrap` is the maximum columns for **one** facet field; wrapping two fields is an error. Cells have a 220px minimum width and wrap responsively.
- `scales="shared"` (the default for categorical facets) collects domains from all subsets, including offscreen transformed data. `free-x`, `free-y`, `free-z`, and `free` collect independent domains. `scales="field"` groups domains by the column each mark plots (see "Facet over fields" below); for a categorical facet it equals `shared`. Explicit Plot bounds override inference. Category mappings remain shared.
- `link="auto"` is the default: it links the dimensions the scales share (both, x or y; none with `"field"` scales). `"none"` keeps each cell's own view; `x`, `y`, or `xy` links shared 2D dimensions. Linking a free dimension is an error. 3D cameras remain independent.
- Nearby plots mount with 240px overscan. Offscreen plots retain settings and camera state by category keys; their data domains are prepared without mounting renderers. Exactly one Plot belongs to each cell.
- `getPlots()` returns `{plot, row, column}` for **mounted** cells. `whenSettled()` awaits preparation and completed visible frames. `exportPNG({ scale })` (scale 1 by default) returns a Blob for the entire grid, headings included, at `scale` times the device pixel ratio pixels per CSS pixel, as a Plot's PNG export (twice the size on a screen with a ratio of 2). It renders offscreen cells sequentially, preserving their state. Export rejects a changed dataset and preflights final image size.

### Facet over fields: one cell per variable

`fields={[...]}` gives each listed field a cell over the **same** rows, one row per observation. Inside a cell the column `value` **is** that field's column (the same column, with its identity, metadata, and category scales) and `field` holds the field's name on every row.

```svelte
<Plot data={penguins}>
  <Facet fields={["bill_length", "bill_depth", "flipper", "mass"]}>
    <Frame x={{ domain: [0, 1], visible: false }}>
      <Points name="values" x={0} y="value" brush={{ axis: "y" }} />
    </Frame>
  </Facet>
</Plot>
```

- A list lays the cells along columns (`fields={{column: [...]}}` says so explicitly, and `wrap` applies when the list is the only dimension); `fields={{row: [...]}}` stacks them. A categorical split may take the other dimension: `fields={[...]} row="species"` is a fields x species grid, cells row-major, each over that species' rows. A split on the same dimension is an error that says which one to move.
- The fields dimension's order (`columnOrder` for a list, `rowOrder` for `{row}`) picks and orders the fields; a name that is not a field is an empty cell. Cell keys are `[row, column]` with the field name as the fields dimension's value, and labels are the field (`"Adelie · bill_length"` with a split), the same keys a Facet by a Fold's key gives, so camera and settings memory carries over.
- `value` and `field` hide table columns of the same names inside the cells (their metadata does not leak through). `as={{value: "v", field: "name"}}` renames them.
- A Shift-drag on a cell's axis strip constrains that cell's field (`flipper`, not `value`), brushes on different fields AND together, selection and hover line up by observation across the cells, and a connector over a mark repeated in the cells matches observations without a key (docs/CONNECTIONS.md). `color="field"` is one categorical scale across the cells.
- Any 1-D column can be a field: numeric, datetime (the axis reads the field's type), or categorical.
- Each cell's axis is titled by its field: `value` names the column it is. The same holds for pairs cells (`x` and `y`) and a Facet by a Fold's key.
- A grid labels one set of outer axes: with `link="auto"` (the default) the axes the cells share (`scales="shared"`, or the one a `free-x`/`free-y` leaves) pan and zoom together, and each is labeled on the lowest cell of each column (x) and the leftmost of each row (y). The other cells keep its ticks and grid lines, and the cells line up their plot areas. `link="none"` keeps each cell's own view and labels; `"field"` scales are never linked automatically.
- Small multiples of different variables are the same thing: `<Facet fields={["temp", "rain"]}><Line x="time" y="value" /></Facet>`.

### Scatterplot matrices: pairs

`pairs={["a", "b", "c"]}` makes a scatterplot matrix whose cells alias `x` and `y` to their two fields (rows from y, columns from x). `triangle="upper"` or `"lower"` and `diagonal={false}` reduce a square matrix; `pairs={{x: [...], y: [...]}}` makes a rectangular one (only `diagonal` applies). `rowOrder` and `columnOrder` pick and order the y and x lists. Pairs are numeric; `pairs` cannot combine with `row`, `column`, or `fields`; `as={{x, y}}` renames the aliases. Labels read `"y · x"`. `link="grid"` works (two split dimensions), as it does for fields x a category. The old `<Pairs>` wrapper was removed; put `pairs` on Facet directly.

### Domains: scales="field"

With `fields` or `pairs`, `scales` defaults to `"field"`: each mark registers the columns it plots on each axis, and a domain entry joins a group by the column's identity:

- one of the facet's fields (through `value`, `x`/`y`, or plotted directly) -> that field's group, shared across the cells and across x and y (a pairs row and column of the same field match);
- a column of the facet's input (`time`) -> one shared domain for that axis;
- a constant or unnamed data (arrays, positions) -> the shared domain for that axis;
- anything else (a column computed inside the cells, an expression) -> the group of the cell's own field on that axis.

A cell axis takes the union of its groups. Groups are per frame, so a child Frame in the cells groups separately. The pass runs once per registration burst (coalesced in a microtask). For a categorical facet "field" equals "shared". `shared`, `free-x`, `free-y`, and `free` are unchanged. The settings pane shows the effective default and does not write it back as a prop; its Reset returns to `"shared"`.

Embedded Facets with fields or pairs default to `layout="grid"` (each cell owns its x and y). `layout="bands"` stays available: the split dimension becomes a categorical axis of field names and the other dimension is the Plot's, shared.

### Facet by a Fold's key: one cell per field

This is the older spelling of `fields`, and remains supported. A Facet placed directly on a `Fold`'s output and split by the Fold's key column gives each folded field a cell, built the way `fields` builds its cells: every cell shows the Fold's **source** rows, one row per observation, and its `value` column **is** that field's column rather than a slice of the folded values.

```svelte
<Plot data={penguins}>
  <Fold fields={["bill_length", "bill_depth", "flipper", "mass"]}>
    <Facet column="key" scales="free-y" layout="grid">
      <Frame x={{ domain: [0, 1], visible: false }}>
        <Points name="values" x={0} y="value" brush={{ axis: "y" }} />
      </Frame>
    </Facet>
  </Fold>
</Plot>
```

- A Shift-drag on a cell's axis strip constrains that cell's field (`flipper`), not `value`, so each field brushes independently and constraints on different fields combine with AND (docs/DATA.md, "Brushing"). This is how parallel coordinates brush per axis.
- Every cell shows the same observations, so selection, hover, and `@brushed` line up by row across the cells, and a connector over a mark repeated in the cells matches observations without a `key` (docs/CONNECTIONS.md).
- The key column holds the cell's field name on every row, with the Fold's categories, so `color="key"` and a `Group(by="key")` title work as before; the Fold's other source columns (`species`, `id`, ...) stay readable.
- Cell keys, labels, and order are the same as for any Facet: the Fold's field order, or `columnOrder` / `rowOrder` (which may pick a subset). `wrap` works as usual. `scales="shared"`, `free-y`, and the others set position domains as before.
- A continuous appearance scale on `value` (`fill="value"`) is now one scale per field, keyed by the field's column as in Pairs, so each cell's colors span its own field. Pass one explicit scale (`fillScale={continuous(...)}`) to share it across the cells.
- It applies only when the Facet reads the Fold's output directly and the key is its only field (`row="key"` or `column="key"`, with or without `wrap`). A Filter, Sort, or any other transform between the Fold and the Facet, a second facet field (`row="species" column="key"`), or a facet field other than the key partitions the **folded** rows as before: every cell then plots the Fold's own `value` column, whose rows are not the table's, so a Shift-drag on a cell's strip reports that it cannot be brushed.
- Embedded Facets (inside a Plot) and grids of Plots behave the same, and so does a Python scene (the same JavaScript builds the cells). Its cells carry the same `scales="field"` grouping as `fields` cells (the default here stays `"shared"`).

## Partition

`Partition` is the other way to repeat children: once per group, but **inside one frame**.

```svelte
<Data value={observations}>
  <Plot height={320} axes2d legend>
    <Partition by="species">
      <Density x="length">
        <Area x="x" upper="density" fill="species" opacity={0.4} />
      </Density>
    </Partition>
  </Plot>
</Data>
```

Grouping is always explicit. In ggplot2 or seaborn a color mapping also splits a statistic (`geom_density(aes(fill = species))` draws one density per species); here a transform computes over all its rows unless it is grouped, and a mapping only colors. `<Density x="length">` alone makes one curve over every species, and its rows have no `species` column, so `fill="species"` on an Area below it is an error: "Area.fill is neither a field in the active Data scope nor a valid CSS color". Group in one of two ways:

- The transform's own `by`: `<Density x="length" by="species">` (Density, Group, Normalize, Pivot, Slice, Sort, Summary and Window take one, as do reductions: `mean("x", {by: "species"})`). One transform computes every group, and its output keeps the key column. Density's groups share one grid and one bandwidth (Scott's rule over all the rows), so their curves compare directly.
- `Partition`, as above: everything inside runs once per group, on that group's rows only. Each group's Density gets its own grid and bandwidth, and each group's Bin its own edges (pass explicit edges to share them). Transforms without a `by`, such as Bin, group this way.

- `by` is a column name or a list of names. One key makes one group per value **that has rows**, whatever the column's encoding: a value that disappears from the table (or is filtered out above the Partition) takes its group with it, and a categorical column's unused categories mount nothing. A list makes one group per combination of those values, including combinations with no rows (their children still mount, so a mark that later gains rows animates in).
- Group order follows how the key column is stored: a plain JavaScript array in first-appearance order; a categorical (dictionary) column — every string column from Python, and pandas `Categorical` — in dictionary order; a numeric column (a typed array, or any numeric column from Python) by value, ascending. With a list of keys the first key varies slowest.
- Rows whose key is missing (`null`, `undefined`, `NaN`, or a dictionary code with no category) are not dropped: they form one trailing group whose value for that key is `null` and whose label is `(missing)`. That keeps every row drawn, so domains and brush counts match the unpartitioned plot. The missing key is not a constant column in that group. With a list of keys, the missing value is one more slot in that key's product (`Adelie · (missing)`).
- Partition does not touch any scale: its keys are not added to the key column's scale domain, and refusing over `limit` leaves every scale as it was. A mark that maps a key (`fill="species"`) builds that scale exactly as it would without the Partition.
- Every group contributes to the parent's inherited domains, so the frame looks as it would if the children had been mounted once over the whole table. There is no `scales` option: there is one frame.
- Transforms inside a Partition run once per group. So does everything else in the subtree — each group is a data scope filtered to its rows, exposing the key columns as constant columns.
- When the data updates, a group whose rows the update leaves alone keeps its data scope, so nothing under it runs again: changing one species' rows, or appending rows to one species, reruns that species' transforms and marks only. A group is kept when it has the same rows at the same positions and every column the update replaced is equal at those rows (a column object passed again as the same array is not compared; a table given as an array of rows, a new schema, or an added or removed column compares or reruns everything). Reuse is positional: inserting or deleting a row shifts every later row, so the groups after it rerun. A kept group holds on to the table it was made from until it reruns. Facet cells do not reuse their scopes yet.
- The key columns stay readable inside the group, even through an aggregating transform: they hold one value for every row, so `Bin`, `Density`, and friends carry them into their output and `fill="species"` still means something two scopes down.
- `limit` (default 256) caps the number of groups; more than that is an error rather than a page full of pipelines. The count (the product of the keys' value counts, the missing slot included) is checked before any group is built.
- `legendGroups` gives each group its own legend entry labelled by the key values, and each entry toggles its own group: clicking one hides that group only, and shift-click isolates it. Nested Partitions with `legendGroups` join every enclosing label, outermost first (`Points · Adelie · Male`). Without it, one authored mark makes one entry however many groups there are, and that entry shows or hides every group. `legendGroups` can change on a mounted Partition; the groups remount and the legend follows.
- `getGroups()` returns `{key, values, label, marks}` for the mounted groups; Python: `await partition.groups()`. `key` is JSON of the group's values in `by` order (`["Adelie"]`, `["Adelie","Male"]`, `[null]` for the missing group); `values` includes the enclosing Partitions' keys; `label` joins the values with ` · `.
- In a Python scene, one Python object stands for a node however many groups repeat it. The browser registers one runtime handle per mounted instance, keyed by the node id, then the facet cell key and each enclosing group key from the outermost Partition in, joined by `/`: `points:["Adelie"]`, `points:[null,"Male"]/["Adelie"]` inside a Facet cell, `points:["Adelie"]/["Male"]` under nested Partitions. `fit` and `action` reach every instance; `camera` and `groups` answer from the first. Events from a repeated mark carry `partition_group` (the group keys joined by `/`) next to `facet_cell` (the cell key alone). See python/PROTOCOL.md.

| | Facet | Partition |
| --- | --- | --- |
| Layout | A grid of cells | One frame |
| Renderers | One per mounted cell | One, the parent's |
| Scales | `scales` chooses shared or free | Always shared |
| Axes | One set per cell | The parent's |
| Legend | One for the grid (or per cell) | The parent's, deduped across groups |
| Nesting | A Partition may go inside a cell | A Facet may **not** go inside a group |

## Transform scopes

A transform creates a new table for its children. Siblings still see the input table. A transform outside Facet operates globally; inside Facet it operates on each cell's indexed subset.

```svelte
<Data value={observations}>
  <Normalize field="length" as="standardLength">
    <Facet column="species" wrap={3}>
      <Plot height={240} axes2d>
        <Bin x="standardLength" bins={24}>
          <Rect x0="x0" x1="x1" y0={0} y1="count" />
        </Bin>
      </Plot>
    </Facet>
  </Normalize>
</Data>
```

Move Normalize inside Facet to standardize each subset independently. Bin edges and hexagonal lattices are shared across facets by default; `sharedBins={false}` opts into local binning after upstream transforms. A rule name (`bins="sturges"`) or an expression count (`bins={power(count("x"), 0.5)}`) is then resolved once, over the rows of every cell together, so the cells still share one set of edges; with `sharedBins={false}` each cell resolves it against its own rows.

| Component   | Props and output                                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bin`       | `x`, optional `y`/`z`; `bins={30}`, explicit edge array, or `{x: edgesOrCount, y: …, z: …}`. Aggregate output: centers `x/y/z`, bounds `x0/x1`, etc., and `count`. `mode="assign"` retains rows and adds `binX/binY/binZ` and `binX0/binX1`, etc., without overwriting input coordinates. `empty={false}` omits empty bins. |
| `Hexbin`    | `x`, `y`, `bins={30}` across X, optional `radius`, `orientation="pointy"` or `"flat"`. Occupied cells expose `x`, `y`, `width`, `depth`, `rotation`, `count`. The lattice is anchored at coordinate zero.                                                               |
| `Group`     | `by="field"` or an array of fields; grouping keys, `count`, and named reductions.                                                                                                                                                                                       |
| `Filter`    | `where={{field:'value', op:'gte', value:0}}`, or an AND-list. Operators: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in` (array), `finite`. Retained rows stay ordered; lines reconnect those rows.                                                                          |
| `Sort`      | `by="field"` or an array, `order="asc"` / `"desc"`. Stable lexicographic order, missing values last.                                                                                                                                                                    |
| `Normalize` | `field`, `method="deviation"`, optional `by` grouping and `as="normalized"`. Other methods: `extent`, `sum`, `first`, `max`. Constant deviation becomes zero; constant extent becomes 0.5; division by zero is missing.                                                 |
| `Stack`     | `y`, optional `x` grouping, `series`, `order` (categories, or `appearance`, `ascending`, `descending`, `insideOut`, `reverse`) and `offset` (`zero`, `expand`, `center`, `wiggle`). Outputs ordered `y0/y1`: by default around zero, stacking positive and negative values separately. Retains input row order. |
| `Window`    | `field`, `size={5}`, `reduce="mean"`, `align="trailing"` (`leading` / `center`), optional `by`, `as="smoothed"`. Edge windows use available rows.                                                                                                                       |
| `Dodge`     | `x` and `axis="y"`, or `y` and `axis="x"`; `padding={1}`, `seed={42}`, `as="offset"`. Screen-space offsets for one flat point mark.                                                                                                                                     |

Group computes named reductions, each an expression as in Calculate:

```svelte
<Group by="species" columns={{ average: mean("length") }}>
  <!-- species, count, average -->
</Group>
```

Bin and Hexbin take the same `columns`, reduced over each bin or hexagon.

Any reduction works: `count`, `sum`, `mean`, `min`, `max`, `first`, `last`, `variance` (population), `std`, `median`, `mode`, `any`, `all`, and arithmetic of them. Missing numeric values are ignored; undefined results stay missing, as does an empty bin's column, except that a `count()` or `sum(x)` column of its own is 0 there. `count()` counts rows. With a Bin's column `weight`, `count()`, `sum(x)` and `mean(x)` columns weigh their rows and other columns leave out rows of weight 0; a sum, mean or count inside a larger expression is an error there, so compute it in a Calculate after the Bin. Aggregated tables contain keys and computed columns; row-preserving transforms retain original columns. `as={{count:'frequency', x0:'left'}}` renames multi-column outputs.

Bins are half-open except the final inclusive upper boundary. Nonfinite and out-of-domain values are excluded. Input order is never implicitly sorted, grouped, or jittered.

## Rect and Prism

```svelte
<Rect x0="left" x1="right" y0={0} y1="count" />

<Bin x="x" y="y" z="z" bins={8} empty={false}>
  <Rect x0="x0" x1="x1" y0="y0" y1="y1" z0="z0" z1="z1" fill="count" />
</Bin>

<Hexbin x="x" y="y">
  <Prism
    x="x"
    y="y"
    width="width"
    depth="depth"
    z0={0}
    z1="count"
    shape="hexagon"
    rotation="rotation"
    fill="count"
  />
</Hexbin>
```

Rect is flat without Z bounds; paired Z bounds make a box. Prism supports `rectangle`, `triangle`, `hexagon`, and `circle` footprints. `axis="z"` selects extrusion: use that axis's lower/upper bounds and the remaining axes' center coordinates. Width/depth follow the remaining axes in X/Y/Z order. Scalar bounds broadcast against arrays.

Footprints fit their width×depth rectangle and then rotate in degrees. Hexagons are flat-top at zero; 30° is pointy-top. Dimensions use data coordinates. In 2D, columns show their XY projection without lighting; in 3D, `lit` enables lighting from the Plot's lights. Opacity defaults to one, with no outline.

Both marks use shared instanced GPU geometry. They support numeric/categorical fills, legends, minimaps, picking, compatible numeric animation, and PNG export. Nonfinite/reversed intervals are omitted. Cartesian flat footprints can be texture children; extruded texture children, spherical columns, and standalone surface attachment report an error.

## Swarms

```svelte
<Dodge x="value" axis="y" as="offset" padding={1} seed={42}>
  <Points
    x="value"
    y={0}
    dy="offset"
    size={8}
  />
</Dodge>
```

`dx` / `dy` are pixel channels applied after mapping, including in picking. Dodge uses seeded randomized placement without changing identities. Its conservative collision radius contains the selected flat symbol. It recomputes on data, effective glyph size, dimensions, or zoom; pure pan does not move the swarm layout. The previous completed layout stays visible during cancellable GPU preparation. Dodge supports one Cartesian 2D point consumer per scope.

## Ownership and interaction

Numeric columns, partitioning, sorting, reductions, geometry, and contributor lists stay on the shared GPU. Indexed views lazily gather referenced columns; offscreen transform pipelines reuse versioned caches. Host category dictionaries and compact group counts, offsets, and domain summaries are allowed; there are no full numeric-column readbacks during plotting.

Row-preserving event handlers receive the original `instanceId` and local `rowIndex`. Aggregate handlers receive `aggregate` (kind, keys/bounds, count) and `getContributors()`, which explicitly returns an owned GPU index array. The caller must dispose it after use. Category visibility creates gaps; Filter intentionally reconnects retained observations.

Replacements validate before publication. Failed updates retain the previous complete result. Unmounts and superseded work cancel preparation; arrays retire after consumers settle. Numeric updates animate only with compatible row topology. Ordering/membership changes replace atomically. Allocations are checked against the device limits; no CPU rendering fallback is introduced.

The `/examples` gallery includes wrapped/matrix facets, global normalization, per-cell histograms, rectangular/hexagonal columns, voxel bins, stacked intervals, rolling signals, and swarms, each with copyable source.

See [inputs, Interpolate, Slice, and force-directed graphs](INPUTS.md) for interactive data preparation and layout examples.
