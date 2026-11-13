<script>
  import { Plot, Density, Contour, Segments } from "hmplot";
  const data = { x: [1, 2, 2, 3, 3, 4, 5], y: [2, 1, 3, 2, 4, 3, 4] };
</script>

<Plot {data} height={300} axes2d>
  <Density x="x" y="y">
    <Contour field="density">
      <Segments start="start" end="end" />
    </Contour>
  </Density>
</Plot>
