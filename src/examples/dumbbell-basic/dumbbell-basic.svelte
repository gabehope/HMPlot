<script>
  import { Plot, Legend } from "hmplot";
  import { Dumbbell } from "hmplot/charts";
  const data = { city: ["Oslo", "Lima", "Pune", "Nice", "Kobe"], y2015: [12, 30, 21, 18, 25], y2025: [19, 26, 34, 22, 31] };
</script>

<Plot {data} height={300} axes2d>
  <Dumbbell y="city" x0="y2015" x1="y2025" />
  <Legend />
</Plot>
