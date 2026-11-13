<script>
  import { Plot, Density, Line } from "hmplot";
  const data = { value: [1.2, 2.5, 2.9, 3.1, 3.4, 3.8, 4.2, 4.4, 5.1, 6.3] };
</script>

<Plot {data} height={300} axes2d>
  <Density x="value">
    <Line x="x" y="density" />
  </Density>
</Plot>
