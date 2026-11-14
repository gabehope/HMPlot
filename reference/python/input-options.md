# Options from data

columnNames and categories: an input's options read from the data around it.

## Example

```python
with hm.Scene() as scene:
    with hm.Data(penguins):
        hm.Select(name="species", options=hm.categories("species"))
        hm.Select(name="metric", options=hm.column_names())
        with hm.Filter(where=hm.col.species == hm.input.species):
            with hm.Plot():
                hm.Points(x="$metric", y="body_mass")
```

## Functions

- `hm.column_names()` (`string[]`): The column names of the Data scope around the input, for a Select of columns.
- `hm.categories(field)` (`category[]`): A categorical column's categories, in order. A numeric column is an error.

## Usage

An input inside a Data scope can take its options from that data: `columnNames()` for a Select that chooses which column to plot (read it as `x="$metric"`), and `categories("species")` for a Select or Select with multiple=true of a categorical column's values. A Slider's `min` and `max`, and any input's first `value`, can be a [reduction](reductions) such as `min("x")` the same way.

They are read once, and again when the data changes, never when the input moves. Until they are read, the input is pending and its readers wait instead of drawing with a stand-in value. When new data changes the options, a Select keeps its value if it is still an option, else takes the first one, and a Select with multiple=true drops the values that are gone. `categories` of a numeric column is an error; type it with a schema or [typedColumn](typed-column) first.

See docs/INPUTS.md, "Options and ranges from the data".

## Related examples

- [Inputs](/HMPlot/examples/inputs.md)
- [Filter and bin inputs](/HMPlot/examples/transform-controls.md)
