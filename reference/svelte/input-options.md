# Options from data

columnNames and categories: an input's options read from the data around it.

## Example

```svelte
<InputContext>
  <Data value={penguins}>
    <Select name="species" options={categories("species")} />
    <Select name="metric" options={columnNames()} />
    <Filter where={equal(col.species, input("species"))}>
      <Plot><Points x="$metric" y="body_mass" /></Plot>
    </Filter>
  </Data>
</InputContext>
```

## Functions

- `columnNames()` (`string[]`): The column names of the Data scope around the input, for a Select of columns.
- `categories(column)` (`category[]`): A categorical column's categories, in order. A numeric column is an error.

## Usage

An input inside a Data scope can take its options from that data: `columnNames()` for a Select that chooses which column to plot (read it as `x="$metric"`), and `categories("species")` for a Select or Select with multiple=true of a categorical column's values. A Slider's `min` and `max`, and any input's first `value`, can be a [reduction](reductions) such as `min("x")` the same way.

They are read once, and again when the data changes, never when the input moves. Until they are read, the input is pending and its readers wait instead of drawing with a stand-in value. When new data changes the options, a Select keeps its value if it is still an option, else takes the first one, and a Select with multiple=true drops the values that are gone. `categories` of a numeric column is an error; type it with a schema or [typedColumn](typed-column) first.

See docs/INPUTS.md, "Options and ranges from the data".

## Related examples

- [Inputs](/HMPlot/examples/inputs.md)
- [Filter and bin inputs](/HMPlot/examples/transform-controls.md)
