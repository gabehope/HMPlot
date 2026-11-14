# Pivot

A long table made wide: a row per group and a column per category of a field.

## Example

```python
import hmplot as hm

data = {
    "shape": ["a", "a", "b", "b", "c", "c"],
    "measure": ["width", "height", "width", "height", "width", "height"],
    "value": [1, 2, 3, 1, 2, 4],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Pivot(field="measure", value=hm.sum("value"), by="shape"):
        hm.Points(x="width", y="height")
plot
```

## Options

Keywords are snake_case.

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `field` (`column`): The categorical column whose categories become the output's columns, one each.
- `value` (`expression`): A numeric reduction expression filling the cells, over each group's rows in each category: sum("value"), mean("value") or count(). A cell with no rows gets a missing value.
- `by` (`column | column[]`): The columns that group the rows: an output row per group, with its keys (one row without it).
- `as_` (`string[]`): Names for the output columns, one per category of `field`, in its category order. Default: the categories.

## Usage

Outputs one row per by key and a column per field category (first and second in this excerpt). `value` is a reduction expression that fills each cell from the group's rows in that category: `value={sum("value")}` (Python `value=hm.sum("value")`), `mean("value")` or `count()`. Missing combinations become NaN. Duplicate output names and source-column collisions are errors.

To let the viewer change a setting, read an input in it: `by={input("by")}` (Python `by=hm.input.by`), where `by` is a [Select](select) of column names.

## Related examples

- [Pivot and fold](/HMPlot/examples/pivot-fold.md)
