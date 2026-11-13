<script>
  import { Plot, Points } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
</script>

<Plot {data} height={300} axes2d>
  <Points x="x" y="y" />
</Plot>
