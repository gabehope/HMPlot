<script>
  import { Plot, Regression, Line } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [2, 3, 5, 4, 6, 7] };
</script>

<Plot {data} height={300} axes2d>
  <Regression x="x" y="y">
    <Line x="x" y="y" />
  </Regression>
</Plot>
