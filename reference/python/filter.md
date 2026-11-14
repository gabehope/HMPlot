# Filter

Keeps the rows that meet a condition, or the selected or brushed rows.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6], "y": [3, 1, 4, 1, 5, 2]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Filter(where=hm.col.y > 2):
        hm.Points(x="x", y="y")
plot
```

## Options

Keywords are snake_case.

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `inactive` (`"all" | "none"`): What a condition on a selection or brush keeps while nothing is selected or brushed: every row, or none. Default: `"all"`.
- `where` (`string | expression | {field, op, value} | selection | array`): The rows to keep: an interaction column such as "@brushed", a comparison {field, op, value} (op eq, ne, lt, lte, gt, gte, in or finite), a selection, an expression with one value per row such as `greater(col.x, mean(col.x))`, or a list of these that must all hold.

## Usage

Retains source columns and observation identities in their original order. Supports eq, ne, lt, lte, gt, gte, in, and finite, as well as selection resources and virtual fields. Filtering reconnects retained line rows; category hiding instead leaves breaks.

`where` also takes an expression with one value per row, which may use reductions: `where={greater("x", mean("x"))}` keeps the rows above the mean, and `where={logical_and(view.brushed, greater("x", mean("x")))}` keeps the brushed ones among them and re-runs as the brush changes. A condition that is a single value (a bare reduction) is an error.

To let the viewer change a setting, read an input in it: `where={greater(col("x"), input("threshold"))}` (Python `where=hm.col.x > hm.input.threshold`), where `threshold` is a [Slider](slider).

## Related examples

- [Filter and bin inputs](/HMPlot/examples/transform-controls.md)
