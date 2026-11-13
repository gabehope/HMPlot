<script>
  import { untrack } from "svelte";
  import { Plot, Points, Anchor, Text, Legend, connect } from "$lib";
import { Arrows } from "$lib/charts/index.js";
  let {onready = () => {}} = $props();
  let plot = $state(), before = $state(), after = $state(), arrows = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Illustrative life expectancy at birth (years), 2000 and 2021.
  const data = {
    country: ["Nigeria", "Kenya", "South Africa", "India", "Russia", "Brazil", "United States", "Chile", "Norway", "Japan"],
    region: ["Africa", "Africa", "Africa", "Asia", "Europe", "Americas", "Americas", "Americas", "Europe", "Asia"],
    y2000: [46.3, 52.2, 55.9, 62.7, 65.3, 70.1, 76.6, 76.9, 78.7, 81.1],
    y2021: [52.7, 61.4, 62.3, 67.2, 69.4, 72.8, 76.4, 78.9, 83.2, 84.5],
  };
</script>
<p>A before/after chart from connections. The 2000 values are gray points; the 2021 values are an invisible <code>Anchor</code>, so only the arrowhead marks them. <code>connect(before, after, {"{"} key: "country" {"}"})</code> pairs the two by country, and the arrows take their color from the shared table's <code>region</code> column.</p>
<Plot bind:this={plot} {data} responsive height={440} axes2d
  x={{ label: "Life expectancy at birth (years)", domain: [40, 90] }} y={{ visible: false }}>
  <Points bind:this={before} x="y2000" y="country" size={5.5} fill="#9aa3ad" />
  <Text x="y2000" y="country" text="country" align="right" dx={-10} size={12} color="#39424d" />
  <Anchor bind:this={after} x="y2021" y="country" />
  <Arrows bind:this={arrows} connections={connect(before, after, { key: "country" })} color="region" width={2.5} headLength={11} headWidth={9} />
  <Legend for={arrows} channel="color" label="Region" position="right" />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
