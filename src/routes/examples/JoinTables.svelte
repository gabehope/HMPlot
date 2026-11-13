<script>
  import { onMount, untrack } from "svelte";
  import { Data, Join, Plot, Points, categorical } from "$lib";
  let { onready = () => {} } = $props();
  let flightsPlot = $state(), regionsPlot = $state(), regionPoints = $state(), count = $state(0);
  $effect(() => { if (flightsPlot) untrack(() => onready(flightsPlot)); });
  $effect(() => {
    const resource = flightsPlot?.getBrush?.();
    if (resource) return resource.subscribe((status) => (count = status.count));
  });
  // Two tables: airports (one row per airport) and flights (one row per flight, by origin code).
  const airports = {
    code: ["SEA", "SFO", "LAX", "PHX", "DEN", "SLC", "DFW", "ORD", "MSP", "ATL", "JFK", "BOS"],
    city: ["Seattle", "San Francisco", "Los Angeles", "Phoenix", "Denver", "Salt Lake City", "Dallas", "Chicago", "Minneapolis", "Atlanta", "New York", "Boston"],
    region: ["West", "West", "West", "Mountain", "Mountain", "Mountain", "Central", "Central", "Central", "East", "East", "East"],
  };
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const n = 600;
  const origin = Array.from({ length: n }, (_, i) => airports.code[Math.floor(noise(i, 1) * airports.code.length)]);
  const flights = {
    id: Array.from({ length: n }, (_, i) => i),
    origin,
    distance: Array.from({ length: n }, (_, i) => Math.round(300 + noise(i, 2) * 3700)),
    // Eastern airports run later in this made-up sample.
    delay: Array.from({ length: n }, (_, i) => Math.round((noise(i, 3) - 0.35) * 60 + airports.code.indexOf(origin[i]) * 2.5)),
  };
  const regions = categorical({ domain: ["West", "Mountain", "Central", "East"], range: ["#547ba2", "#8a6fb3", "#cf8955", "#5a9e6f"] });
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = { flights, airports, get flightsPlot() { return flightsPlot; }, get regionPoints() { return regionPoints; } };
    window.__joinTablesExample = exposed;
    return () => { if (window.__joinTablesExample === exposed) delete window.__joinTablesExample; };
  });
</script>

<p>
  Flights name their origin airport by code; a second table gives each airport's city and region.
  <code>Join</code> adds the region to every flight, so the flights are colored and grouped by it.
  Shift-drag across regions on the right to brush them.
</p>
<Data value={flights} key="id">
  <Join data={airports} leftOn="origin" rightOn="code" fields={["city", "region"]}>
    <div class="views">
      <Plot bind:this={flightsPlot} responsive height={320} axes2d x={{ label: "distance (km)" }} y={{ label: "delay (min)" }}>
        <Points x="distance" y="delay" fill="region" fillScale={regions} size={2.5} respond="brushed" label="Flights"
          tooltip={["origin", "city", "region", "distance", "delay"]} />
      </Plot>
      <Plot bind:this={regionsPlot} responsive height={320} axes2d y={{ label: "delay (min)" }}>
        <Points bind:this={regionPoints} x="region" y="delay" fill="region" fillScale={regions} size={2.5}
          brush={{ axis: "x" }} respond="brushed" legend={false} />
      </Plot>
    </div>
  </Join>
</Data>
<output aria-live="polite">{count} flights brushed</output>

<style>
  p { font-size: 14px; line-height: 1.5; }
  .views { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 12px; }
  output { display: block; color: #5b6470; font-size: 13px; margin-top: 6px; }
</style>
