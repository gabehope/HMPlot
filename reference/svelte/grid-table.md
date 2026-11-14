# gridTable

A table of every cell of a grid: its dimensions' coordinates and its variables.

## Example

```svelte
const field = gridTable({ dims: { lat, lon }, columns: { temperature } });
<Plot data={field}><Heatmap fill="temperature" /></Plot>
```

## Parameters

- `dims` (`object`): Each dimension's coordinates, in order.
- `columns` (`object`): The variables, one value per cell.
- `edges` (`object`): Optional cell bounds per dimension.
- `positions` (`object`): Optional curvilinear positions.

## Usage

`gridTable({ dims, columns, edges, positions })` is a table of every cell of a grid, for `Data value=` or `Plot data=`: one row per combination of its dimensions' coordinates, the first dimension outermost. The coordinates are columns made when something reads them; only the variables are stored.

Any node reads its rows as a table's: points colored by a variable, a Filter, a Group by a coordinate, a Join on one. Heatmap draws a variable over two of its dimensions, placed by their coordinates (uneven, descending and wrapped ones too, and a curvilinear grid's positions); Image takes band columns as `fill={{ r, g, b }}`; Slice through a dimension blends the two slabs around `at` on the GPU. Calculate keeps the grid for new columns, rewrites a coordinate computed from itself, and drops the grid (saying why) for anything else. See docs/DATA.md, "Grid tables".

## Related examples

- [Bilinear grid](/HMPlot/examples/transform-grid.md)
