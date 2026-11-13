<script>
  import { Plot, Tree, Nodes, Text, GraphData } from "hmplot";
  const data = {
    source: ["root", "root", "a", "a", "b"],
    target: ["a", "b", "a1", "a2", "b1"],
  };
</script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><Tree root="root">
      <Nodes><Text position="position" text="id" /></Nodes>
    </Tree></GraphData
  >
</Plot>
