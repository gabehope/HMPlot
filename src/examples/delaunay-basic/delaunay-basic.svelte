<script>
  import { Plot, Delaunay, Segments } from "hmplot";
  const data = { x: [0, 2, 4, 1, 3, 2], y: [0, 0, 0, 2, 2, 4] };
</script>

<Plot {data} height={300} axes2d>
  <Delaunay x="x" y="y">
    <Segments start="start" end="end" />
  </Delaunay>
</Plot>
