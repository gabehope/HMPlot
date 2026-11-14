# stats.Normalize

Rescales a column to z-scores, to 0 to 1, or relative to its sum, first value or maximum, over all rows or per group.

## Example

```python
import hmplot as hm

data = {
    "day": [1, 2, 3, 4, 1, 2, 3, 4],
    "stock": ["A", "A", "A", "A", "B", "B", "B", "B"],
    "price": [10, 12, 11, 14, 50, 52, 57, 60],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.stats.Normalize(field="price", method="first", by="stock"):
        hm.Line(x="day", y="normalized", series="stock")
plot
```

## Options

Keywords are snake_case.

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `field` (`column`): The numeric column to normalize.
- `method` (`"deviation" | "extent" | "sum" | "first" | "max"`): "deviation" gives z-scores (0 for a constant column), "extent" maps the minimum to 0 and the maximum to 1, and "sum", "first" and "max" divide by the column's sum, first value or maximum. Default: `"deviation"`.
- `by` (`column | column[]`): Normalize within each group of these columns instead of over all the rows.
- `as_` (`string`): The name of the normalized column it adds. Default: `"normalized"`.

## Usage

Retains source columns and adds the as column. Methods are deviation (default), extent, sum, first, and max. by sets groups. Constant-feature deviation normalization produces zero.

To let the viewer change a setting, read an input in it: `method={input("method")}` (Python `method=hm.input.method`), where `method` is a [Select](select) of methods.

This is a template over [Calculate](calculate), not a separate normalization kernel. The
`deviation` method expands to `(field - mean(field)) / where(std(field) > 0, std(field), 1)`;
`extent` uses the minimum and maximum, and `sum`, `first`, and `max` divide by that reduction.
Reductions ignore hidden and nonfinite values. With `by`, the runner prepares the grouping keys
once for the expression, including numeric keys. The caller's children read the resulting column.

## Related examples

- [Signal and uncertainty](/HMPlot/examples/layered-signal.md)
