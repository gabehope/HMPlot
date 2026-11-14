const n=`<script>
  import {
    Plot,
    GraphData,
    Edges,
    Nodes,
    Segments,
    Points,
    Calculate,
    multiply,
  } from "hmplot";
  const edges = { source: ["A", "A", "B", "C"], target: ["B", "C", "D", "D"] };
  const nodes = {
    id: ["A", "B", "C", "D"],
    column: [0, 1, 1, 2],
    lane: [1, 0, 2, 1],
  };
<\/script>

<GraphData {nodes} {edges}>
  <Nodes>
    <Calculate columns={{ x: multiply("column", 2), y: "lane" }}>
      <Plot height={300}>
        <Edges><Segments start="start" end="end" /></Edges>
        <Nodes><Points position="position" /></Nodes>
      </Plot>
    </Calculate>
  </Nodes>
</GraphData>
`;export{n as default};
