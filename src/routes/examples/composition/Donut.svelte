<script>
  import { untrack } from "svelte";
  import { Plot } from "$lib";
import { Pie } from "$lib/charts/index.js";
  let {onready = () => {}} = $props();
  let plot = $state(), month = $state(0);
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  const regions = ["North", "East", "South", "West", "Central"];
  // Deterministic sales for the months after the first.
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const sales = $derived(month ? regions.map((_, i) => 8 + Math.round(40 * noise(i, month))) : [42, 18, 27, 9, 14]);
</script>
<p>A donut: <code>innerRadius</code> opens the hole and <code>padAngle</code> separates the sectors. The rows are keyed by region, so the next month's sales tween each sector's angles: it grows or shrinks in place.</p>
<button onclick={() => month++}>Next month</button>
<Plot bind:this={plot} data={{ region: regions, sales }} key="region" responsive height={380}>
  <Pie value="sales" category="region" innerRadius={0.55} padAngle={1.5} sectorLabel="category"
    animation animationDuration={700} />
</Plot>
<style>p {font-size:14px;line-height:1.5} button {margin-bottom:8px}</style>
