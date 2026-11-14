const n=`<script>
  import { Plot, Sankey, Edges, Flow, GraphData } from "hmplot";
  const data = {
    source: ["in", "in", "a", "b"],
    target: ["a", "b", "out", "out"],
    value: [3, 2, 3, 2],
  };
<\/script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><Sankey value="value">
      <Edges>
        <Flow
          startLower="startLower"
          endLower="endLower"
          startUpper="startUpper"
          endUpper="endUpper"
        />
      </Edges>
    </Sankey></GraphData
  >
</Plot>
`;export{n as default};
