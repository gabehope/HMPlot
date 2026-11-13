<script>
  import { Plot, Line } from "hmplot";
  import { BandY } from "hmplot/charts";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [3, 4, 2, 5, 6, 5] };
</script>

<Plot {data} height={300} axes2d>
  <BandY y0={2} y1={4} fill="#3478c7" />
  <Line x="x" y="y" />
</Plot>
