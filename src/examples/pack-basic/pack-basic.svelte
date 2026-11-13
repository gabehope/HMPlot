<script>
  import { Plot, Pack, Nodes, Points, multiply, GraphData } from "hmplot";
  const data = {
    source: ["root", "root", "a", "a", "a", "b", "b"],
    target: ["a", "b", "a1", "a2", "a3", "b1", "b2"],
  };
</script>

<Plot {data} height={300} aspect="equal">
  <GraphData source="source" target="target"
    ><Pack root="root">
      <Nodes
        ><Points
          position="position"
          size={multiply("r", 2)}
          sizeUnits="data"
          fill="depth"
        /></Nodes
      >
    </Pack></GraphData
  >
</Plot>
