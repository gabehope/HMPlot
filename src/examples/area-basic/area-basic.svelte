<script>
  import { Plot, Area } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5], y: [2, 4, 3, 5, 4] };
</script>

<Plot {data} height={300} axes2d>
  <Area x="x" upper="y" />
</Plot>
