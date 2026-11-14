# col and view

How a value names a column, an input or view state: col.x, input.bins, view.time.

## Example

```svelte
<Filter where={greater(col.mass, input("threshold"))}>…</Filter>
```

## Functions

- `col` (`column read`): col.weight or col("weight"): the column weight. It fails where the column is missing, as the string ":weight" does; a plain "weight" in a mark channel is the literal when there is no such column.
- `input` (`input read`): input("bins") or input.bins: the value of the input named bins in the nearest input context that has one. As a whole prop it is the value; inside an expression, a constant. "$bins" reads the same where a string names a column.
- `view` (`state read`): view.time, view.pointer_x, view.selected and the other state names (see view): view and interaction state. "@time" reads the same. An unknown name fails at once.
- `prev(name)` (`column read`): Inside a Simulate's update: the state column name after the previous step. Python: hm.prev.x or hm.prev("x").

## Usage

A value in a column's place (a mark channel, an expression's argument, a column-name parameter such as Sort's `by`) is a column, an input, state or a literal. `col.weight` reads a column and fails if it is missing, as the string `":weight"` does; a plain `"weight"` in a mark channel is the column when there is one, else the literal. `input.bins` (or `"$bins"`) reads an input and `view.time` (or `"@time"`) view and interaction state. Inside an expression and in a column-name parameter a plain string is always a column, never an input, so a column added later cannot change what a slider read means.

## Related examples

- [Filter and bin inputs](/HMPlot/examples/transform-controls.md)
