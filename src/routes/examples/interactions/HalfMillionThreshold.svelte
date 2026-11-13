<script>
  import { untrack } from "svelte";
  import { T } from "@threlte/core";
  import { Data, Plot, Filter, Prism, Rect } from "$lib";
import { Hexbin, Bin } from "$lib/stats/index.js";
  let { onready = () => {} } = $props();
  let plot = $state(), histogram = $state(), minimum = $state(2);
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  $effect(() => {
    if (import.meta.env.DEV) window.__halfMillion = { get plot() { return plot; }, get histogram() { return histogram; }, setMinimum(value) { minimum = value; } };
  });
  // 500,000 deterministic points. Magnitudes are log-normal and larger near two hot spots, so
  // raising the threshold leaves fewer points, concentrated around the hot spots.
  const rows = 500000;
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const gauss = (i, k) => Math.sqrt(-2 * Math.log(noise(i, k) + 1e-7)) * Math.cos(2 * Math.PI * noise(i, k + 17));
  const x = Float32Array.from({ length: rows }, (_, i) => 2 * gauss(i, 1));
  const y = Float32Array.from({ length: rows }, (_, i) => 2 * gauss(i, 2));
  const hot = (i) => Math.exp(-((x[i] - 1.5) ** 2 + (y[i] - 1) ** 2) / 2) + Math.exp(-((x[i] + 2) ** 2 + (y[i] + 1.5) ** 2) / 1.5);
  const magnitude = Float32Array.from({ length: rows }, (_, i) => Math.exp(0.5 * gauss(i, 3) + 1.3 * hot(i)));
  const table = { x, y, magnitude };
  const kept = $derived(magnitude.reduce((total, m) => total + (m > minimum ? 1 : 0), 0));
</script>
<p>A slider filters 500,000 points by magnitude. The 3D hexbin counts the kept points in each cell, and the histogram shows their magnitudes. The Filter marks the kept rows instead of copying them, and when it keeps under a quarter of the rows it packs them into one of a few fixed lengths, so the work after it shrinks with the selection and each length compiles its GPU kernels only once.</p>
<label>Minimum magnitude <input type="range" min="0.5" max="6" step="0.01" bind:value={minimum} /> {minimum.toFixed(2)}: {kept.toLocaleString()} of {rows.toLocaleString()} points</label>
<Data value={table}>
  <div class="views">
    <Plot x={{ domain: [-6, 6] }} y={{ domain: [-6, 6] }} bind:this={plot} responsive height={440} type="3d" axes3d
      cameraPosition={[110, -140, 130]} cameraUp={[0, 0, 1]}>
      <T.AmbientLight intensity={1.5} /><T.DirectionalLight position={[40, 80, 100]} intensity={3} />
      <Filter where={{ field: "magnitude", op: "gt", value: minimum }}>
        <!-- A fixed grid over the plot's bounds: a new threshold changes no length (TODO 17.14d). -->
        <Hexbin x="x" y="y" bins={36} bounds={{ x: [-6, 6], y: [-6, 6] }}>
          <Prism x="x" y="y" width="width" depth="depth" z0={0} z1="count" shape="hexagon" rotation="rotation" fill="count" colormap="Viridis" lit={true} />
        </Hexbin>
      </Filter>
    </Plot>
    <Plot bind:this={histogram} responsive height={440} axes2d x={{ label: "magnitude" }} y={{ label: "points" }}>
      <Filter where={{ field: "magnitude", op: "gt", value: minimum }}>
        <Bin x="magnitude" bins={40}><Rect x0="x0" x1="x1" y0={0} y1="count" fill="#5f8fb4" /></Bin>
      </Filter>
    </Plot>
  </div>
</Data>
<style>
  p, label { font-size: 14px; line-height: 1.5; }
  label { display: block; margin: 8px 0; font-variant-numeric: tabular-nums; }
  .views { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
</style>
