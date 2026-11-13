<script>
  import { untrack } from "svelte";
  import { Data, Plot, Points, Filter, Group, Rect, add, mean } from "$lib";
import { Bin } from "$lib/stats/index.js";
  let { onready = () => {} } = $props();
  let plot = $state(), histogram = $state(), bars = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  $effect(() => {
    if (import.meta.env.DEV) window.__brushedFilterChain = { get plot() { return plot; }, get histogram() { return histogram; }, get bars() { return bars; } };
  });
  // 50,000 deterministic rows: a position to brush, a value that grows with x and y, and a
  // level (0-7) that is the y band a row falls in.
  const rows = 50000;
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const table = {
    x: Float32Array.from({ length: rows }, (_, i) => noise(i, 1)),
    y: Float32Array.from({ length: rows }, (_, i) => noise(i, 2)),
    value: Float32Array.from({ length: rows }, (_, i) => 60 * noise(i, 1) + 30 * noise(i, 2) + 20 * noise(i, 3)),
    level: Float32Array.from({ length: rows }, (_, i) => Math.floor(8 * noise(i, 2))),
  };
</script>
<p>Shift-drag in the scatter to brush. Each Filter keeps its input's rows and marks the ones the brush keeps, so moving the brush changes no array length and compiles no new GPU kernels: the histogram and the per-level means follow the pointer. Levels are bands of y, so a brush shows only the levels it crosses. Click away to clear.</p>
<Data value={table}>
  <div class="views">
    <Plot bind:this={plot} responsive height={320} axes2d x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
      <Points x="x" y="y" size={1} fill="#547ba2" brush maxElements={rows} />
    </Plot>
    <Plot bind:this={histogram} responsive height={320} axes2d x={{ label: "value" }} y={{ label: "rows" }}>
      <Filter where="@brushed">
        <Bin x="value" bins={32}><Rect x0="x0" x1="x1" y0={0} y1="count" fill="#cf8955" /></Bin>
      </Filter>
    </Plot>
    <Plot bind:this={bars} responsive height={320} axes2d x={{ label: "level" }} y={{ label: "mean value" }}>
      <Filter where="@brushed">
        <Group by="level" columns={{ mean: mean("value") }}>
          <Rect x0="level" x1={add("level", 0.8)} y0={0} y1="mean" fill="#7b9865" />
        </Group>
      </Filter>
    </Plot>
  </div>
</Data>
<style>
  p { font-size: 14px; line-height: 1.5; }
  .views { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
</style>
