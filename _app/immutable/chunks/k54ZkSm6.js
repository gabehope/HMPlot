const n=`<script>
  import {
    Plot,
    Force,
    Edges,
    Nodes,
    Segments,
    Points,
    GraphData,
  } from "hmplot";
  const data = {
    source: ["A", "A", "B", "C", "D"],
    target: ["B", "C", "C", "D", "E"],
  };
<\/script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><Force warmup={300}>
      <Edges><Segments start="start" end="end" /></Edges>
      <Nodes><Points position="position" /></Nodes>
    </Force></GraphData
  >
</Plot>
`;export{n as default};
