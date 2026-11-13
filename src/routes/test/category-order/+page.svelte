<script>
  // TODO 17.14e fixture: groups first appear North, West, South, East; the x axis orders them
  // North, East, South, West. Each group's values sit in its own band (North 0-10, East 10-20,
  // South 20-30, West 30-40), so a whisker, median or violin drawn on the wrong category is visible.
  import { onMount } from "svelte";
  import { Data, Plot, Points, categorical } from "$lib";
import { Violin, BoxPlot } from "$lib/charts/index.js";
  const axis = ["North", "East", "South", "West"], firstSeen = ["North", "West", "South", "East"];
  const rows = 2000;
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const group = Array.from({ length: rows }, (_, i) => firstSeen[i % 4]);
  const table = { group, x: Float32Array.from(group, (g, i) => axis.indexOf(g) + noise(i, 2) * 0.6 - 0.3), value: Float32Array.from(group, (g, i) => axis.indexOf(g) * 10 + 10 * noise(i, 3)) };
  const scale = categorical({ domain: axis });
  let points = $state(), violins = $state(), boxes = $state();
  onMount(() => { window.categoryOrder = { get points() { return points; }, get violins() { return violins; }, get boxes() { return boxes; }, async settle() { await Promise.all([points, violins, boxes].map((p) => p?.whenSettled())); } }; });
</script>
<Data value={table}>
  <Plot bind:this={points} width={400} height={240} axes2d><Points x="x" y="value" fill="group" size={1.5} /></Plot>
  <Plot x={{ scale: scale }} bind:this={violins} width={400} height={240} axes2d><Violin x="group" y="value" fill="group" /></Plot>
  <Plot x={{ scale: scale }} bind:this={boxes} width={400} height={240} axes2d><BoxPlot x="group" y="value" fill="group" /></Plot>
</Data>
