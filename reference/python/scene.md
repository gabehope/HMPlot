# Scene

The root of a Python display: it holds plots, layouts and inputs and stacks its children top to bottom.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Line(x="x", y="y")
scene
```

## Options

Keywords are snake_case.

- `gap` (`number`): Space between the children. Default: `16` px.
- `theme` (`theme`): A theme for everything in the scene: a preset such as hm.themes.dark, hm.create_theme(...), or a definition dict.

## Usage

Optional for a single Plot or Facet. Use Scene with Row, Column, or Grid(columns=...) for dashboards. Its batch_update coordinates changes and its export methods compose the display. Svelte applications use normal markup/CSS for this layout.

> **SVG and PDF export**
>
> **Partly an image.** A Scene's SVG and PDF exports compose its Plots, Facets, Titles and Legends, each as its reference page says; a Markdown block and a 2D Minimap are images, and inputs and a Minimap of a 3D plot are left out. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Linked views & minimap](/HMPlot/examples/linked.md)
