<script>
  import { Plot, Points3D } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2], z: [2, 4, 1, 3] };
</script>

<Plot {data} type="3d" height={300} axes3d>
  <Points3D x="x" y="y" z="z" />
</Plot>
