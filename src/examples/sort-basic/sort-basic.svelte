<script>
  import { Plot, Sort, Line } from "hmplot";
  const data = { x: [3, 1, 4, 2, 5], y: [2, 1, 4, 3, 5] };
</script>

<Plot {data} height={300} axes2d>
  <Sort by="x">
    <Line x="x" y="y" />
  </Sort>
</Plot>
