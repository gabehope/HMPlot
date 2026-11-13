<script>
  import { FocusContext } from "hmplot/charts";
  const days = Array.from({ length: 365 }, (_, d) => d);
  const data = { day: days, visits: days.map((d) => 200 + 80 * Math.sin(d / 9) + d / 2) };
</script>

<!-- Drag across the strip below to zoom the chart to those days; clear the brush to see them all. -->
<FocusContext {data} x="day" y="visits" height={360} />
