<script>
  import { untrack } from "svelte";
  import { Plot, Facet, Points, Legend, continuous } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state(), points = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Deterministic pseudo-random measurements for three species on three islands.
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const species = ["Adelie", "Gentoo", "Chinstrap"], islands = ["Biscoe", "Dream", "Torgersen"];
  const rows = Array.from({ length: 180 }, (_, i) => {
    const s = i % 3;
    return { species: species[s], island: islands[Math.floor(noise(i, 5) * 3)],
      bill: 38 + 6 * s + 5 * noise(i, 1), flipper: 185 + 12 * s + 14 * noise(i, 2),
      mass: 3000 + 900 * s + 1500 * noise(i, 3) };
  });
  const data = Object.fromEntries(Object.keys(rows[0]).map((key) => [key, rows.map((row) => row[key])]));
  const mass = continuous({ domain: [3000, 6300], range: [3, 14] });
</script>
<p>One column drives both fill and shape, so the species legend draws colored symbols. Mass is numeric, so its legend is a ramp of sample sizes. Click a species to hide it; Shift-click isolates it.</p>
<Plot bind:this={plot} data={data} responsive height={380} axes2d>
  <Points bind:this={points} x="bill" y="flipper" fill="species" shape="species" size="mass" sizeScale={mass} />
  <Legend for={points} channel="fill" label="Species" position="right" />
  <Legend for={points} channel="size" label="Body mass (g)" position="right" />
</Plot>
<p>In a facet grid the same mark is drawn in every cell but listed once, in one legend around the grid. Hiding a species there hides it in every cell.</p>
<Facet data={data} column="island">
  <Plot height={220} axes2d>
    <Points x="bill" y="flipper" fill="species" size="mass" sizeScale={mass} />
    <Legend channel="fill" label="Species" position="bottom" />
  </Plot>
</Facet>
<style>p {font-size:14px;line-height:1.5}</style>
