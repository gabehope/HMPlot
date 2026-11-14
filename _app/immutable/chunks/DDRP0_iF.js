const e=`<script>
  import { Plot, Sankey, Edges, Nodes, Flow, Rect, GraphData } from "hmplot";
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
      <Nodes><Rect x0="x0" x1="x1" y0="y0" y1="y1" /></Nodes>
    </Sankey></GraphData
  >
</Plot>
`;export{e as default};
