<script>
  // Four polar Rect sectors in a polar Plot; ?scene=pie: a Pie in a Cartesian Plot (TODO 39.4),
  // which places its own polar Frame, keyed by region so an update tweens its sectors.
  import { page } from "$app/state";
  import { Plot, Rect, categorical } from "$lib/index";
import { Pie } from "$lib/charts/index.js";
  const scene = page.url.searchParams.get("scene");
  let plot = $state(), pie = $state();
  let period = $state(24);
  const regions = ["North", "East", "South", "West"];
  let sales = $state([1, 1, 1, 1]);
  const colors = categorical({ domain: regions, range: ["#d22b2b", "#249a49", "#245cc0", "#df8e20"] });
  $effect(() => {
    window.stage14PolarSectors = {
      get plot() { return plot; },
      get pie() { return pie; },
      get pick() { return window.stage14PolarSectorPick; },
      get period() { return period; },
      setPeriod(value) { period = value; },
      setSales(values) { sales = values; },
    };
    return () => { delete window.stage14PolarSectors; };
  });
</script>

{#if scene === "pie"}
  <Plot bind:this={plot} data={{ region: regions, sales }} key="region" width={400} height={400}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Pie bind:this={pie} value="sales" category="region" fillScale={colors} padAngle={2}
      animation animationDuration={600} animationEasing="linear"
      onclick={(event) => window.stage14PolarSectorPick = { axisValue: event.axisValue, rowIndex: event.rowIndex, uv: event.uv && [event.uv.x, event.uv.y] }} />
  </Plot>
{:else}
  <Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={period}
    baseRadius={0} radialScale={1} x={{ domain: [0, 24], step: 6 }} y={{ domain: [0, 3], step: 1 }} width={400} height={400}
    axes2d={true}>
    <Rect x0={0} x1={6} y0={1} y1={2} fill="#d22b2b"
      onclick={(event) => window.stage14PolarSectorPick = { axisValue: event.axisValue, quadrant: "red" }} />
    <Rect x0={6} x1={12} y0={1} y1={2} fill="#249a49" />
    <Rect x0={12} x1={18} y0={1} y1={2} fill="#245cc0" />
    <Rect x0={18} x1={24} y0={1} y1={2} fill="#df8e20" />
  </Plot>
{/if}
