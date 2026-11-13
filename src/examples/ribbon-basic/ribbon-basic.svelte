<script>
  import { Plot, Area } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5], lower: [1, 2, 1.5, 3, 2.5], upper: [3, 4, 3.5, 5, 4.5] };
</script>

<Plot {data} height={300} axes2d>
  <Area opacity={0.2} x="x" lower="lower" upper="upper" />
</Plot>
