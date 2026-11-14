# DAG

A layered layout of a directed acyclic graph, with edges routed around the nodes.

## Example

```svelte
<script>
  import { Plot, DAG, Edges, Nodes, Routes, Points, GraphData } from "hmplot";
  const data = {
    source: ["a", "a", "b", "c", "a"],
    target: ["b", "c", "d", "d", "d"],
  };
</script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><DAG>
      <Edges><Routes /></Edges>
      <Nodes><Points position="position" /></Nodes>
    </DAG></GraphData
  >
</Plot>
```

## Options

- `orientation` (`"left" | "right" | "down" | "up"`): The direction the layers run, from sources to sinks. Default: `"down"`.
- `nodeWidth` (`number | column | expression`): Each node's width, which the layout keeps clear: a number, or a nodes-table column or expression. Default: `1` data units.
- `nodeHeight` (`number | column | expression`): Each node's height, which the layout keeps clear: a number, or a nodes-table column or expression. Default: `1` data units.
- `nodeGap` (`number`): The space between neighboring nodes in a layer. Default: `1` data units.
- `layerGap` (`number`): The space between layers. Default: `1` data units.

## Usage

DAG consumes GraphData and uses d3-dag's Sugiyama layout to place an acyclic directed graph. It exposes node positions and bounds, edge endpoints, and complete routed paths. `Routes` draws the paths; ordinary edge marks can use `start` and `end`. The layout runs when input changes.

## Related examples

- [Layered DAG](/HMPlot/examples/layered-dag.md)
