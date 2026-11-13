<script>
  import { Plot, Treemap, Nodes, Rect, GraphData } from "hmplot";
  const data = {
    source: ["root", "root", "a", "a", "a", "b", "b"],
    target: ["a", "b", "a1", "a2", "a3", "b1", "b2"],
  };
</script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><Treemap root="root" padding={0.02}>
      <Nodes><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="depth" /></Nodes>
    </Treemap></GraphData
  >
</Plot>
