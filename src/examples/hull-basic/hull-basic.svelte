<script>
  import { Plot, Hull, Polygon } from "hmplot";
  const data = { x: [1, 3, 2, 4, 2.5, 3], y: [1, 1, 3, 3, 2, 2.5] };
</script>

<Plot {data} height={300} axes2d>
  <Hull x="x" y="y">
    <Polygon />
  </Hull>
</Plot>
