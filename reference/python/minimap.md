# Minimap

A small overview of a plot's whole extent, with a rectangle to drag its view around (a 3D plot gets an orientation gadget).

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    with hm.Plot(data=data, height=300, axes2d=True) as plot:
        hm.Points(x="x", y="y")
    hm.Minimap(target=plot)
scene
```

## Options

Keywords are snake_case.

### Options

- `axis` (`FrameHandle`): The Frame whose axis settings (bounds, transform, format) the minimap's axis labels follow. Default: the plot's root frame.
- `axes` (`boolean | {x, y}`): Whether the minimap labels its axes: true for both, or {x, y} for each. Default: `False`.
- `display_scale` (`number`): A multiplier on the marks' sizes in the overview, relative to their sizes in the plot. Default: `0.35`.
- `target` (`PlotHandle`): The Plot the minimap shows and moves (Python target=).
- `width` (`number`): The minimap's width. Default: `180` px.
- `height` (`number`): The minimap's height. Default: `120` px.

### Advanced renderer options

- `max_instances` (`number | null`): The most rows of each mark the overview draws; past it the rows are sampled (null draws them all). Default: `1000`.

## Usage

for selects the source (target in Python). axes defaults to false. Source updates repaint overview content; camera-only navigation updates the viewport rectangle. 3D views use the orientation gadget. The minimap takes its plot's background and text color, and leaves text out (labels, TeX and a map's place names). A live VectorTile's minimap shows the whole world, from its zoom-0 tile.

> **SVG and PDF export**
>
> **Image.** In a Scene's SVG and PDF exports a 2D Minimap is an image at the export's raster DPI, and `mode="vector"` refuses it. A Minimap of a 3D plot is left out, with a warning in the report. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Long time series](/HMPlot/examples/timeseries.md)
