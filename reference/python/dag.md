# DAG

A layered layout of a directed acyclic graph, with edges routed around the nodes.

## Example

```python
import hmplot as hm

data = {"source": ["a", "a", "b", "c", "a"], "target": ["b", "c", "d", "d", "d"]}
with hm.Plot(data=data, height=300) as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.DAG():
            with hm.Edges():
                hm.Routes()
            with hm.Nodes():
                hm.Points(position="position")
plot
```

## Options

Keywords are snake_case.

- `orientation` (`"left" | "right" | "down" | "up"`): The direction the layers run, from sources to sinks. Default: `"down"`.
- `node_width` (`number | column | expression`): Each node's width, which the layout keeps clear: a number, or a nodes-table column or expression. Default: `1` data units.
- `node_height` (`number | column | expression`): Each node's height, which the layout keeps clear: a number, or a nodes-table column or expression. Default: `1` data units.
- `node_gap` (`number`): The space between neighboring nodes in a layer. Default: `1` data units.
- `layer_gap` (`number`): The space between layers. Default: `1` data units.

## Usage

DAG consumes GraphData and uses d3-dag's Sugiyama layout to place an acyclic directed graph. It exposes node positions and bounds, edge endpoints, and complete routed paths. `Routes` draws the paths; ordinary edge marks can use `start` and `end`. The layout runs when input changes.

## Related examples

- [Layered DAG](/HMPlot/examples/layered-dag.md)
