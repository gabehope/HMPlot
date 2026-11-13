<script>
  import { untrack } from "svelte";
  import { Plot, Points, where } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state(), radius = $state(24);
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Dense clusters with many exactly overplotted rows, so hover alone would reach only one of them.
  const count = 3000;
  const centers = [[25, 30], [60, 70], [75, 25]];
  const data = {
    x: Array.from({length: count}, (_, i) => { const c = centers[i % 3]; return i % 5 === 0 ? c[0] : c[0] + 12 * Math.sin(i * 1.7) * Math.cos(i * 0.31); }),
    y: Array.from({length: count}, (_, i) => { const c = centers[i % 3]; return i % 5 === 0 ? c[1] : c[1] + 12 * Math.cos(i * 1.3) * Math.sin(i * 0.53); }),
  };
</script>
<p>Move the pointer over the clusters: every row within the radius grows, including all overplotted rows at a cluster center. The rest shrink only while something is nearby (<code>@any_nearby</code>). Leave the plot to clear.</p>
<label class="controls">Radius <input type="range" min="6" max="80" bind:value={radius} /> {radius} px</label>
<Plot bind:this={plot} data={data} responsive height={420} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points x="x" y="y" nearby={{radius}} fill="#547ba2"
    size={where("@any_nearby", where("@nearby", 5, 1), 2)} />
</Plot>
<style>p {font-size:14px;line-height:1.5} .controls {display:flex;gap:10px;align-items:center;margin:12px 0}</style>
