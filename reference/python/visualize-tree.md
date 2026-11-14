# visualize_tree

Draw a scene's component tree as a plot: each component a node, colored by its group. Hovering a node shows its tooltip and highlights its path to the root and its subtree.

## Example

```python
with hm.Plot(data={"x": [1, 2], "y": [2, 3]}) as plot:
    hm.Points(x="x", y="y")
hm.visualize_tree(plot)
```

## Parameters

- `obj` (`Node`): The root of the components to draw.
- `returns` (`Plot`): A plot of the tree, to display.

## Usage

`hm.visualize_tree(obj)` builds a separate HMPlot Plot from an object's structural children. Each node is labeled with its component type and colored by its component's group. Hover a node for its kind, the props set on it, the columns and inputs it reads, a table's rows and columns and a template's class; the path from it to the root and its subtree stay highlighted. It reads the source object without changing it. An isolated mark also works.

Use `hm.visualize_tree(obj, split_facet=True)` to expand a Facet into one labeled branch per row/column cell, including empty matrix intersections. Each branch repeats the Facet's child definition. This requires a host-backed Data table; numeric facet fields need an explicit order.

```python
import hmplot as hm

with hm.Plot(data={"x": [1, 2], "y": [2, 3]}) as source:
    hm.Points(x="x", y="y")

hm.visualize_tree(source)
```
