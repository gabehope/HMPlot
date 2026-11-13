<script>
  import { Plot, Points } from "hmplot";
import { Smooth } from "hmplot/charts";
  const data = { x: [1, 2, 3, 4, 5, 6, 7, 8], y: [2.1, 2.9, 3.2, 4.8, 4.9, 6.1, 6.8, 8.2] };
</script>

<Plot {data} height={300} axes2d>
  <Points x="x" y="y" />
  <Smooth x="x" y="y" />
</Plot>
