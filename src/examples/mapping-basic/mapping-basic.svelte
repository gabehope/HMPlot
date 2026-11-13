<script>
  import { Line, Mapping, Plot, Points } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
</script>

<Plot {data} height={300} axes2d>
  <Mapping x="x" y="y">
    <Line />
    <Points />
  </Mapping>
</Plot>
