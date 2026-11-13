<script>
  import { untrack } from "svelte";
  import { Plot } from "$lib";
import { Lollipop } from "$lib/charts/index.js";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  const data = {
    category: ["Alder", "Birch", "Cedar", "Douglas fir", "Elm", "Hemlock", "Larch"],
    value: [18, 31, 12, 44, 26, 9, 37],
  };
</script>
<p>A lollipop chart: a stem from the baseline to each value, on either side of it, with a point at the end. Lollipop is a built-in template: BarGeometry places each stem, a Segments draws the stems and Points the heads; a categorical y lays the stems along x.</p>
<Plot bind:this={plot} data={data} responsive height={360} axes2d y={{ domain: [0, 50] }}>
  <Lollipop x="category" y="value" fill="#547ba2" size={7} />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
