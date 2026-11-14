# Stack

Stacks values on one another, for stacked bars and areas, 100% stacks and streamgraphs.

## Example

```python
import hmplot as hm

data = {
    "region": ["North", "North", "South", "South", "East", "East"],
    "product": ["A", "B", "A", "B", "A", "B"],
    "sales": [3, 2, 4, 1, 2, 3],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Stack(x="region", y="sales", series="product"):
        hm.charts.Bar(x="region", y="y1", baseline="y0", fill="product")
plot
```

## Options

Keywords are snake_case.

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `x` (`column`): The column whose values make the stacks: rows with the same x stack together; without it, every row is in one stack.
- `y` (`column`): The values to stack; each row gets y0 and y1, the bottom and top of its segment.
- `series` (`column`): The column naming each row's layer; within a stack, rows are ordered by series, then by row.
- `order` (`"none" | "appearance" | "asc" | "desc" | "insideOut" | "reverse" | category[]`): The order of the series in each stack: "none" (their own), "appearance" (by where each peaks), "asc" or "desc" (by total), "insideOut" (the largest in the middle, for streamgraphs), "reverse", or a list of categories. Every order but "none" and "reverse" needs series. Default: `"none"`.
- `offset` (`"zero" | "expand" | "center" | "wiggle"`): Where each stack sits: "zero" stacks positive values up from 0 and negative ones down, "expand" scales each stack to span 0 to 1 (100% stacks), "center" centers it on 0, and "wiggle" makes a streamgraph (needs series). center and wiggle need non-negative values. Default: `"zero"`.
- `as_` (`{y0, y1}`): New names for the y0 and y1 columns, such as {y0: "low", y1: "high"}.

## Usage

Outputs lower and upper interval columns, y0 and y1, with names configurable through as. Rows with the same x stack together, ordered by series, then by row; aggregation remains explicit.

offset places each stack. "zero" (the default) stacks positive values up from 0 and negative ones down. "expand" scales each stack's total magnitude to 1, for 100% stacks: draw a Bar with y="y1" and baseline="y0" over it. "center" centers each stack on 0, and "wiggle" is d3's streamgraph offset: each stack moves so the layers change slope as little as they can. center and wiggle need non-negative values (a negative one is an error naming the column), and wiggle needs series.

order sets the series' order in each stack: a list of categories, or "none" (the series' own order), "appearance" (by the x of each series' peak), "asc" or "desc" (by each series' total), "insideOut" (the largest series in the middle, the streamgraph order) or "reverse". Hidden rows add nothing to the totals, peaks or offsets.

To let the viewer change a setting, read an input in it: `offset={input("offset")}` (Python `offset=hm.input.offset`), where `offset` is a [Select](select) of offsets.

## Related examples

- [Streamgraph](/HMPlot/examples/streamgraph.md)
- [100% stacked bars](/HMPlot/examples/stacked-percent.md)
- [Bar chart](/HMPlot/examples/bar.md)
