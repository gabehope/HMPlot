# stats.Window

A moving average (or other reduction) over each row and its neighbors.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6, 7, 8], "y": [2, 5, 3, 6, 4, 7, 5, 8]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.stats.Window(field="y", size=3):
        hm.Line(x="x", y="smoothed")
plot
```

## Options

Keywords are snake_case.

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `field` (`column`): The numeric column to reduce; windows run over the rows in their order, so Sort them first if they are not.
- `size` (`number | expression`): How many rows each window spans; windows at the ends use the rows there are. Default: `5` rows.
- `reduce` (`"mean" | "sum" | "count" | "min" | "max" | "first" | "last" | "variance" | "std" | "any" | "all"`): What to compute over each window. Default: `"mean"`.
- `align` (`"trailing" | "center" | "leading"`): Where each row sits in its window: at its end (the row and the ones before it), in its middle, or at its start. Default: `"trailing"`.
- `by` (`column | column[]`): Window each group of these columns separately.
- `as_` (`string`): The name of the column it adds. Default: `"smoothed"`.

## Usage

Adds a derived column without sorting observations. Defaults to a trailing mean over five observations. align supports trailing, center, or leading; by separates groups. Sort explicitly before Window when time order is required.

To let the viewer change a setting, read an input in it: `size={input("size")}` (Python `size=hm.input.size`), where `size` is a [Slider](slider).

`any` and `all` reduce logical booleans or finite numeric truth values; empty/all-missing windows
yield false and true respectively. The `window(value, {size, reduce, align, by, orderBy})`
expression uses the same kernels and restores results to original rows after local ordering.
Python uses `hm.window(value, size=..., order_by=...)`. See [Reductions](reductions).

This template expands to [Calculate](calculate) with
`columns={smoothed: window(field, {size, reduce, align, by})}` (using the name passed as `as`).
It reuses the window expression's kernels and the ordinary transform lifecycle, including input
controls, status subscriptions, updates, and error recovery.

## Related examples

- [Signal and uncertainty](/HMPlot/examples/layered-signal.md)
