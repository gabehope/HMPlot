# Contour

Contour lines or filled bands of a grid, such as a 2-D density.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 2, 3, 3, 4, 5], "y": [2, 1, 3, 2, 4, 3, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Density(x="x", y="y"):
        with hm.Contour(field="density"):
            hm.Segments(start="start", end="end")
plot
```

## Options

Keywords are snake_case.

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `field` (`column`): The grid table's column to contour (a Density's or an Interpolate's output, or a gridded dataset).
- `thresholds` (`number | number[]`): The levels: a count of round values across the field's range (about that many), or the list of levels. Default: `10`.
- `mode` (`"lines" | "bands"`): "lines" gives a row per segment (`start`, `end`, `level`) for Segments; "bands" gives the regions between levels as triangles (`lower`, `upper`, `band`) for Polygon. Default: `"lines"`.
- `x` (`string`): The grid dimension on the x axis. Default: the grid's last dimension.
- `y` (`string`): The grid dimension on the y axis. Default: the grid's second-to-last dimension.

## Usage

Contour draws iso-lines (`mode="lines"`: `start`, `end` and `level` per segment, for Segments) or filled bands (`mode="bands"`: triangles with `lower`, `upper` and `band`, for Polygon) of a grid table's `field`, on the GPU. `thresholds` is a count of nice levels over the field's range (default 10) or the levels themselves.

Lines match d3-contour's marching squares. Bands clip four triangles per cell against each band, so a saddle is resolved by the cell's mean. Missing values and hidden cells draw nothing.

## Related examples

- [Density contours](/HMPlot/examples/density-contours.md)
