<script>
  import { untrack } from "svelte";
  import { Plot, Points } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // A 40 x 24 grid whose colors come straight from data: red grows left to right,
  // green bottom to top, and blue is fixed. Integer columns are 0-255.
  const columns = 40, rows = 24;
  const cells = Array.from({ length: columns * rows }, (_, i) => [i % columns, Math.floor(i / columns)]);
  const data = {
    x: cells.map(([c]) => c), y: cells.map(([, r]) => r),
    red: Uint8Array.from(cells, ([c]) => Math.round((c / (columns - 1)) * 255)),
    green: Uint8Array.from(cells, ([, r]) => Math.round((r / (rows - 1)) * 255)),
    blue: Uint8Array.from(cells, () => 140),
  };
</script>
<p>Each point's color is read from three columns with <code>fill={"{{"}r: "red", g: "green", b: "blue"{"}}"}</code>. Integer data is 0-255 and float data 0-1. RGB colors have no scale, colormap, or legend.</p>
<Plot bind:this={plot} data={data} responsive height={380} axes2d toneMapping={0}>
  <Points x="x" y="y" fill={{ r: "red", g: "green", b: "blue" }} shape="square" size={6} />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
