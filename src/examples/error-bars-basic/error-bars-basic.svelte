<script>
  import { Plot, Points } from "hmplot";
import { ErrorBars } from "hmplot/charts";
  const data = { x: [1, 2, 3, 4], y: [3, 5, 4, 6], lower: [2, 4, 3.5, 5], upper: [4, 6, 4.5, 7] };
</script>

<Plot {data} height={300} axes2d>
  <ErrorBars x="x" y="y" lower="lower" upper="upper" />
  <Points x="x" y="y" />
</Plot>
