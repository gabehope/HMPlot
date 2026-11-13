<script>
  import { untrack } from "svelte";
  import { Plot, Legend } from "$lib";
import { Pie } from "$lib/charts/index.js";
  let {onready = () => {}} = $props();
  let plot = $state(), pie = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  const data = {
    region: ["North", "East", "South", "West", "Central"],
    sales: [42, 18, 27, 9, 14],
  };
</script>
<p>A pie chart: each region's share of the sales, clockwise from 12 o'clock in row order, labeled with its percentage. Pie is a built-in template: a PieGeometry transform and Rects in a polar Frame, which the Pie places in this Cartesian Plot. Hover a sector to highlight it.</p>
<Plot bind:this={plot} {data} responsive height={380}>
  <Pie bind:this={pie} value="sales" category="region" sectorLabel="percent" hover respond="hovered" />
  <Legend for={pie} channel="fill" label="Region" position="right" />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
