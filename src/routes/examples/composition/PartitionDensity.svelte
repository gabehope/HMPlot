<script>
  import { untrack } from "svelte";
  import { Plot, Partition, Density, Area, Line } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Three species with different bill lengths.
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const species = ["Adelie", "Chinstrap", "Gentoo"], centers = [39, 49, 48], spreads = [2.5, 3, 3.5];
  const rows = Array.from({ length: 240 }, (_, i) => {
    const group = i % 3;
    const gauss = (noise(i, 1) + noise(i, 2) + noise(i, 3) - 1.5) * 2;
    return { species: species[group], bill_length: centers[group] + gauss * spreads[group] };
  });
  const data = { species: rows.map((row) => row.species), bill_length: rows.map((row) => row.bill_length) };
</script>
<p><code>Partition</code> repeats its children once per group, all in one frame with the parent's scales and axes — no grid, no extra renderers. Here one <code>Density</code> runs per species, so the three curves overlay and share the x domain. Use <code>Facet</code> when you want a cell per group instead.</p>
<Plot bind:this={plot} data={data} responsive height={380} axes2d legend
  x={{ label: "Bill length (mm)" }} y={{ label: "Density" }}>
  <Partition by="species" legendGroups>
    <Density x="bill_length" resolution={128}>
      <Area x="x" upper="density" fill="species" opacity={0.35} />
      <Line x="x" y="density" color="species" width={2} />
    </Density>
  </Partition>
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
