# Sankey

A flow diagram layout, with nodes in columns and links as thick as their values.

## Example

```python
import hmplot as hm

data = {"source": ["in", "in", "a", "b"], "target": ["a", "b", "out", "out"], "value": [3, 2, 3, 2]}
with hm.Plot(data=data, height=300) as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.Sankey(value="value"):
            with hm.Edges():
                hm.Flow(start_lower="startLower", end_lower="endLower",
                        start_upper="startUpper", end_upper="endUpper")
            with hm.Nodes():
                hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1")
plot
```

## Options

Keywords are snake_case.

- `value` (`column`): The edge table's column of nonnegative flows, which set the links' thickness.
- `orientation` (`"left" | "right" | "down" | "up"`): The direction the flow runs. Default: `"right"`.
- `node_width` (`number`): The thickness of each node's bar along the flow; the layout spans 0 to 1. Default: `0.025` data units.
- `node_padding` (`number`): The gap between neighboring nodes in a column; the layout spans 0 to 1. Default: `0.02` data units.
- `iterations` (`number`): Relaxation passes that straighten the links. Default: `8`.
- `align` (`"left" | "right" | "center" | "justify"`): Which column each node takes: its depth from the sources (left), its distance to the sinks (right), beside its targets for a source (center), or left with every sink in the last column (justify). Default: `"justify"`.

## Usage

Sankey consumes GraphData and lays out nonnegative flows in an acyclic directed graph. Nodes expose `x0`, `x1`, `y0`, `y1`, `x`, `y`, `position`, `depth`, and `throughput`. Edges expose four attachment corners for `Flow`, plus the original edge columns. Explicit GraphData node tables can include isolated nodes.

## Related examples

- [Sankey flow](/HMPlot/examples/sankey-flow.md)
