<script>
  import { Data, Panels, Plot, Line } from "hmplot";
  import { Bar } from "hmplot/charts";
  const days = Array.from({ length: 120 }, (_, d) => d);
  const data = { day: days, price: days.map((d) => 100 + 10 * Math.sin(d / 8) + d / 6), volume: days.map((d) => 50 + 30 * Math.abs(Math.cos(d / 5))) };
</script>

<!-- Two Plots over one x: zooming or panning either moves both; the axis is drawn once. -->
<Data value={data}>
  <Panels x={{ label: "Day" }}>
    <Plot height={220} y={{ label: "Price" }}><Line x="day" y="price" /></Plot>
    <Plot height={120} y={{ label: "Volume" }}><Bar x="day" y="volume" orientation="vertical" /></Plot>
  </Panels>
</Data>
