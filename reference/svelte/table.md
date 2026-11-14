# table

A table with an identity, so updates and shared views know its rows.

## Example

```svelte
const observations = table({ id: [1, 2], x: [1, 2], y: [3, 4] }, { key: "id" });
<Plot data={observations}><Points x="x" y="y" /></Plot>
```

## Parameters

- `value` (`table`): Columns or rows (Python: a dict, a DataFrame or an xarray Dataset).
- `key` (`column | column[]`): The column whose values identify a row across updates.
- `update_columns / replace` (`methods`): Python: change some columns, or the whole table, and redraw.

## Usage

Python snapshots numeric columns when updates are queued. update_columns changes named columns; replace replaces the table. In-place array mutations are not observed. Use key for identity across reordering. GPU tensors require explicit host conversion in Python.

## Related examples

- [Data shortcuts](/HMPlot/examples/data-shortcut.md)
