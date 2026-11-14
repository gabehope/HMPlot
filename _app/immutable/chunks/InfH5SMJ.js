const t=`<script>
  import { Plot, DAG, Edges, Nodes, Routes, Points, GraphData } from "hmplot";
  const data = {
    source: ["a", "a", "b", "c", "a"],
    target: ["b", "c", "d", "d", "d"],
  };
<\/script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><DAG>
      <Edges><Routes /></Edges>
      <Nodes><Points position="position" /></Nodes>
    </DAG></GraphData
  >
</Plot>
`;export{t as default};
