<script>
  import { untrack } from "svelte";
  import { Data, Plot, Points, Filter, Sort, Line } from "$lib";
import { Window } from "$lib/stats/index.js";
  let { onready = () => {} } = $props();
  let plot = $state(), totals = $state(), averages = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  $effect(() => {
    if (import.meta.env.DEV) window.__runningTotals = { get plot() { return plot; }, get totals() { return totals; }, get averages() { return averages; } };
  });
  // 50,000 deterministic transactions over a year: a day, an amount (larger in December and
  // on weekends), and nothing sorted.
  const rows = 50000;
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const gauss = (i, k) => Math.sqrt(-2 * Math.log(noise(i, k) + 1e-7)) * Math.cos(2 * Math.PI * noise(i, k + 17));
  const day = Float32Array.from({ length: rows }, (_, i) => 365 * noise(i, 1));
  const table = {
    day,
    amount: Float32Array.from({ length: rows }, (_, i) => {
      const season = 1 + 0.8 * Math.exp(-((day[i] - 350) ** 2) / 300) + (Math.floor(day[i]) % 7 >= 5 ? 0.4 : 0);
      return Math.min(400, 40 * season * Math.exp(0.6 * gauss(i, 2)));
    }),
  };
</script>
<p>Shift-drag in the scatter to brush transactions. The brushed rows are sorted by day, then a running sum gives the cumulative total and a 500-row window gives a moving average. Sort and Window work on the Filter's marked rows (the kept ones first), so dragging changes no array length and compiles no new GPU kernels. Click away to clear.</p>
<Data value={table}>
  <Plot bind:this={plot} responsive height={300} axes2d x={{ domain: [0, 365], label: "day" }} y={{ domain: [0, 400], label: "amount" }}>
    <Points x="day" y="amount" size={1} fill="#547ba2" brush maxElements={rows} />
  </Plot>
  <div class="views">
    <Plot bind:this={totals} responsive height={260} axes2d x={{ domain: [0, 365], label: "day" }} y={{ label: "cumulative total" }}>
      <Filter where="@brushed"><Sort by="day">
        <Window field="amount" size={rows} reduce="sum" as="total"><Line x="day" y="total" color="#cf8955" maxElements={rows} /></Window>
      </Sort></Filter>
    </Plot>
    <Plot bind:this={averages} responsive height={260} axes2d x={{ domain: [0, 365], label: "day" }} y={{ label: "moving average" }}>
      <Filter where="@brushed"><Sort by="day">
        <Window field="amount" size={500} reduce="mean" as="average"><Line x="day" y="average" color="#7b9865" maxElements={rows} /></Window>
      </Sort></Filter>
    </Plot>
  </div>
</Data>
<style>
  p { font-size: 14px; line-height: 1.5; }
  .views { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-top: 12px; }
</style>
