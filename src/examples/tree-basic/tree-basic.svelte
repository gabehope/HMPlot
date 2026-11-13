<script>
  import {
    Plot,
    Tree,
    Edges,
    Nodes,
    Segments,
    Points,
    GraphData,
  } from "hmplot";
  const data = {
    source: ["root", "root", "a", "a", "b"],
    target: ["a", "b", "a1", "a2", "b1"],
  };
</script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><Tree root="root">
      <Edges><Segments start="start" end="end" /></Edges>
      <Nodes><Points position="position" /></Nodes>
    </Tree></GraphData
  >
</Plot>
