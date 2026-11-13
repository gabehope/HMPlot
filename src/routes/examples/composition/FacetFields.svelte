<script>
  import { untrack } from "svelte";
  import { Plot, Facet, Line, Points, Legend } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state(), points = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Two days of hourly weather at three stations (deterministic).
  const stations = ["Harbor", "Ridge", "Valley"];
  const rows = Array.from({ length: 144 }, (_, i) => {
    const hour = Math.floor(i / 3), s = i % 3;
    return {
      hour, station: stations[s],
      temperature: 12 + 6 * Math.sin((hour - 9) * Math.PI / 12) - 3 * s + Math.sin(i * 1.3),
      humidity: 70 - 18 * Math.sin((hour - 9) * Math.PI / 12) + 6 * s + 3 * Math.cos(i * 0.7),
      wind: 4 + 2 * s + 2.5 * Math.abs(Math.sin(hour / 7 + s)),
    };
  });
  const data = Object.fromEntries(Object.keys(rows[0]).map((key) => [key, rows.map((row) => row[key])]));
</script>
<p>One cell per variable: <code>Facet fields</code> repeats its children once per field over the same rows, and inside each cell <code>value</code> is that field. The Line is written once, <code>y="value"</code>; each field keeps its own y scale while <code>hour</code>, a column of the table, stays shared. Below, <code>fields</code> with <code>row="station"</code> makes a grid of fields by station, where a field keeps one scale down its column.</p>
<Plot bind:this={plot} {data} responsive height={260} axes2d>
  <Facet fields={["temperature", "humidity", "wind"]}>
    <Line x="hour" y="value" color="station" width={1.5} />
  </Facet>
</Plot>
<Plot {data} responsive height={420} axes2d>
  <Facet fields={["temperature", "humidity", "wind"]} row="station">
    <Points bind:this={points} x="hour" y="value" fill="station" size={2} />
  </Facet>
  <Legend for={points} channel="fill" label="Station" position="right" />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
