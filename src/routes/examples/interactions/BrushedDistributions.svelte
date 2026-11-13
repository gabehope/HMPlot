<script>
  import { untrack } from "svelte";
  import { Data, Plot, Points, Filter, categorical } from "$lib";
import { Violin, BoxPlot } from "$lib/charts/index.js";
  let { onready = () => {} } = $props();
  let plot = $state(), violins = $state(), boxes = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  $effect(() => {
    if (import.meta.env.DEV) window.__brushedDistributions = { get plot() { return plot; }, get violins() { return violins; }, get boxes() { return boxes; } };
  });
  // 60,000 deterministic observations in five overlapping clusters. Where a row sits (x, y)
  // says which cluster it likely came from, and its value grows with its distance from the
  // middle, so every brush position gives each group a different distribution.
  const rows = 60000, groups = ["North", "East", "South", "West", "Center"];
  const centers = [[0, 1.7], [1.7, 0], [0, -1.7], [-1.7, 0], [0, 0]];
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const gauss = (i, k) => Math.sqrt(-2 * Math.log(noise(i, k) + 1e-7)) * Math.cos(2 * Math.PI * noise(i, k + 17));
  // The first five rows are one of each group, in the order of `groups` (the axis order).
  const code = Uint8Array.from({ length: rows }, (_, i) => (i < 5 ? i : Math.floor(5 * noise(i, 1))));
  const x = Float32Array.from({ length: rows }, (_, i) => centers[code[i]][0] + 0.8 * gauss(i, 2));
  const y = Float32Array.from({ length: rows }, (_, i) => centers[code[i]][1] + 0.8 * gauss(i, 3));
  const table = {
    x, y,
    group: Array.from(code, (c) => groups[c]),
    value: Float32Array.from({ length: rows }, (_, i) => 20 + 6 * code[i] + 12 * Math.hypot(x[i], y[i]) + 5 * gauss(i, 4)),
  };
  const scale = categorical({ domain: groups });
</script>
<p>Shift-drag in the scatter to brush 60,000 points. The violins (a density per group) and box plots (quartiles and outliers per group) are recomputed from the brushed rows on every move. The Filter marks the brushed rows instead of copying them, so no array changes length and no new GPU kernels compile while you drag. Click away to clear.</p>
<Data value={table}>
  <div class="views">
    <Plot bind:this={plot} responsive height={340} axes2d x={{ domain: [-4.5, 4.5] }} y={{ domain: [-4.5, 4.5] }}>
      <Points x="x" y="y" size={1} fill="group" brush maxElements={rows} />
    </Plot>
    <Plot x={{ scale: scale }} bind:this={violins} responsive height={340} axes2d y={{ label: "value" }}>
      <Filter where="@brushed"><Violin x="group" y="value" fill="group" outlineColor="#30343b" /></Filter>
    </Plot>
    <Plot x={{ scale: scale }} bind:this={boxes} responsive height={340} axes2d y={{ label: "value" }}>
      <Filter where="@brushed"><BoxPlot x="group" y="value" fill="group" /></Filter>
    </Plot>
  </div>
</Data>
<style>
  p { font-size: 14px; line-height: 1.5; }
  .views { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
</style>
