# Dodge

Moves overlapping points apart, for a beeswarm, or lays out one unit per row in a grid, for a unit (waffle) chart.

## Example

```python
import hmplot as hm

data = {"value": [1, 1.1, 1.2, 2, 2.05, 2.1, 2.15, 3, 3.1, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Dodge(x="value"):
        hm.Points(x="value", y=0)
plot
```

## Options

Keywords are snake_case.

- `mode` (`"collision" | "grid"`): "collision" offsets the points of one point mark so they do not overlap; "grid" lays out units in rows of `columns` cells: each unit gets x and y (its cell's center), x0, x1, y0 and y1. Default: `"collision"`.
- `columns` (`number | expression`): In grid mode, how many cells each row of units has. Default: `10`.
- `count` (`column`): In grid mode, how many units each row makes (whole numbers). Default: one unit per row.
- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `x` (`column`): The points' x column: with axis "y", their positions; with axis "x", groups whose points are laid out separately.
- `y` (`column`): The points' y column: with axis "x", their positions; with axis "y", groups whose points are laid out separately, such as one row per category.
- `axis` (`"x" | "y" | "auto"`): The direction points move to clear each other: "x", "y", or "auto": across a categorical x (or a lone y), otherwise along y. The point mark inside takes the offsets itself. Default: `"auto"`.
- `as_` (`string`): The name of the offset column, in pixels; a point mark may still give it as dy (or dx). Default: `"offset"`.
- `padding` (`number`): The gap between neighboring points. Default: `1` px.
- `seed` (`number`): The random seed of the order in which points are placed. Default: `42`.

## Usage

Adds pixel offsets consumed by one flat point mark, which takes them itself: no dy (or dx) is needed. With axis="auto" (the default) the points move across a categorical x, or along x for a lone y, otherwise along y. Deterministic seed defaults to 42. Layout accounts for glyph sizes and changes with zoom or dimensions, but not pure pan. Supported for Cartesian 2D only.

To let the viewer change a setting, read an input in it: `padding={input("padding")}` (Python `padding=hm.input.padding`), where `padding` is a [Slider](slider).

## Related examples

- [Swarm plot](/HMPlot/examples/swarm.md)
