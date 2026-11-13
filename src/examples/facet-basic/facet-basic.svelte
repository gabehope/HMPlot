<script>
  import { Facet, Plot, Points } from "hmplot";
  const data = {
    x: [1, 2, 3, 4, 1, 2, 3, 4],
    y: [3, 1, 4, 2, 2, 4, 1, 3],
    group: ["a", "a", "a", "a", "b", "b", "b", "b"],
  };
</script>

<Facet {data} column="group">
  <Plot height={300} axes2d>
    <Points x="x" y="y" />
  </Plot>
</Facet>
