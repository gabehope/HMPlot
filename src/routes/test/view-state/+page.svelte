<script>
  // TODO 28 fixtures: @time in Filter conditions and Calculate columns, interval() steps, a
  // transform outside its Plot reading that Plot's clock, and one over two Plots (an error
  // unless an InputContext around them gives them one clock, TODO 50, with a Playback on it).
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Data, Plot, Facet, Filter, Calculate, Points, InputContext, Playback, input, less, interval, col, subtract, divide, floor, animate } from "$lib/index";
import { Crosshair, RuleY } from "$lib/charts/index.js";
  import Probe from "./Probe.svelte";
  const rows = { t: Array.from({ length: 10 }, (_, i) => i * 100), y: Array.from({ length: 10 }, (_, i) => i) };
  const probes = {};
  let revealPlot = $state(), revealFilter = $state(), revealPoints = $state(), stepPlot = $state(), outerPlot = $state(),
    channelPlot = $state(), steppedPoints = $state(), flooredPoints = $state(), facetPlot = $state(), fadePlot = $state(), fadePoints = $state(),
    sharedA = $state(), sharedB = $state(), sharedPlayback = $state();
  const facetRows = { g: [...Array(10).fill("a"), ...Array(10).fill("b")], t: [...rows.t, ...rows.t], y: [...rows.y, ...rows.y] };
  const domains = { x: { domain: [-100, 1000] }, y: { domain: [-1, 10] } };
  // TODO 45 fixtures (?section=pointer): a Crosshair in a dated Cartesian plot, a polar one and a map.
  const pointerSection = page.url.searchParams.get("section") === "pointer";
  const T0 = Date.UTC(2026, 0, 1), DAY = 86400000;
  const series = { t: Array.from({ length: 5 }, (_, i) => new Date(T0 + i * DAY)), v: [1, 3, 2, 4, 3] };
  const places = { lon: [-100, 0, 100], lat: [40, 50, -20] };
  let datedPlot = $state(), datedCrosshair = $state(), polarPlot = $state(), polarCrosshair = $state(), mapPlot = $state(), mapCrosshair = $state();
  onMount(() => {
    if (pointerSection) {
      window.pointerFixture = {
        get datedPlot() { return datedPlot; }, get datedCrosshair() { return datedCrosshair; },
        get polarPlot() { return polarPlot; }, get polarCrosshair() { return polarCrosshair; },
        get mapPlot() { return mapPlot; }, get mapCrosshair() { return mapCrosshair; },
      };
      return () => { delete window.pointerFixture; };
    }
    window.viewState = {
      probes,
      get revealPlot() { return revealPlot; }, get revealFilter() { return revealFilter; },
      get revealPoints() { return revealPoints; }, get stepPlot() { return stepPlot; }, get outerPlot() { return outerPlot; },
      get channelPlot() { return channelPlot; }, get facetPlot() { return facetPlot; },
      get fadePlot() { return fadePlot; }, get fadePoints() { return fadePoints; }, get steppedPoints() { return steppedPoints; }, get flooredPoints() { return flooredPoints; },
      get sharedA() { return sharedA; }, get sharedB() { return sharedB; }, get sharedPlayback() { return sharedPlayback; },
    };
    return () => { delete window.viewState; };
  });
</script>

{#if pointerSection}
<h3>Crosshair on a datetime axis, with a rule at 2.5</h3>
<Plot bind:this={datedPlot} data={series} width={300} height={200} axes2d y={{ domain: [0, 5] }}>
  <Points x="t" y="v" size={3} fill="#547ba2" />
  <RuleY y={2.5} color="#2f8f5b" width={3} />
  <Crosshair bind:this={datedCrosshair} color="#ff0000" width={3} />
</Plot>
<h3>Crosshair in a polar frame</h3>
<Plot bind:this={polarPlot} data={places} width={300} height={300} coordinates="polar">
  <Points x="lon" y="lat" size={3} fill="#547ba2" />
  <Crosshair bind:this={polarCrosshair} color="#ff0000" width={3} readoutPosition="pointer" />
</Plot>
<h3>Crosshair on a map</h3>
<Plot bind:this={mapPlot} data={places} width={300} height={200} coordinates="spherical" x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }}>
  <Points x="lon" y="lat" size={3} fill="#547ba2" />
  <Crosshair bind:this={mapCrosshair} color="#ff0000" width={3} readoutPosition="pointer" />
</Plot>
{:else}
<h3>Filter on @time</h3>
<Plot bind:this={revealPlot} data={rows} width={300} height={200} axes2d {...domains}>
  <Filter bind:this={revealFilter} where={[less("t", "@time")]}>
    <Probe name="reveal" {probes} />
    <Points bind:this={revealPoints} x="t" y="y" size={4} />
  </Filter>
</Plot>

<h3>Filter on interval(@time, 500)</h3>
<Plot bind:this={stepPlot} data={rows} width={300} height={200} axes2d {...domains}>
  <Filter where={[less("t", interval("@time", 500))]}>
    <Probe name="stepped" {probes} />
    <Points x="t" y="y" size={4} />
  </Filter>
</Plot>

<h3>Channels on interval(@time) and floor(@time)</h3>
<Plot bind:this={channelPlot} data={rows} width={300} height={200} axes2d {...domains}>
  <Points bind:this={steppedPoints} x="t" y={divide(interval("@time", 500), 100)} size={4} />
  <Points bind:this={flooredPoints} x="t" y={floor(divide("@time", 1000))} size={4} fill="#d1495b" />
</Plot>

<h3>Rows entering through a Filter on @time</h3>
<!-- Rows from t = 10 s, so none enters before the test sets the clock. -->
<Plot bind:this={fadePlot} data={{ t: rows.t.map((t) => t + 10000), y: rows.y }} width={300} height={200} axes2d
  x={{ domain: [9900, 11000] }} y={{ domain: [-2, 10] }}>
  <Filter where={[less("t", "@time")]}>
    <Points bind:this={fadePoints} x="t" y={animate("y", { enter: -1, duration: 400, easing: "linear" })} size={4} />
  </Filter>
</Plot>

<h3>Filter on @time in a Facet</h3>
<Plot bind:this={facetPlot} data={facetRows} width={420} height={200} axes2d {...domains}>
  <Facet column="g">
    <Filter where={[less("t", "@time")]}>
      <Probe name="facet" {probes} />
      <Points x="t" y="y" size={3} />
    </Filter>
  </Facet>
</Plot>

<h3>Calculate outside its Plot</h3>
<Data value={rows}>
  <Calculate columns={{ age: subtract("@time", "t") }}>
    <Probe name="outer" {probes} column="age" />
    <Plot bind:this={outerPlot} width={300} height={200} axes2d x={{ domain: [-100, 1000] }} y={{ domain: [-1000, 5000] }}>
      <Points x="t" y="age" size={4} />
    </Plot>
  </Calculate>
</Data>

<h3>Filter over two Plots</h3>
<div data-fixture="two-views">
  <Data value={rows}>
    <Filter where={[less("t", "@time")]}>
      <Plot width={200} height={120} {...domains}><Points x="t" y="y" /></Plot>
      <Plot width={200} height={120} {...domains}><Points x="t" y="y" /></Plot>
    </Filter>
  </Data>
</div>

<h3>Two Plots and a Playback in one InputContext (one clock)</h3>
<div data-fixture="shared-clock">
  <InputContext>
    <Playback bind:this={sharedPlayback} name="p" min={0} max={1000} rate={1000} loop />
    <Data value={rows}>
      <Filter where={[less("t", "@time")]}>
        <Probe name="shared" {probes} />
        <Plot bind:this={sharedA} width={200} height={120} {...domains}><Points x="t" y="y" /></Plot>
      </Filter>
      <Filter where={[less("t", input("p")), less("t", "@time")]}>
        <Probe name="played" {probes} />
        <Plot bind:this={sharedB} width={200} height={120} {...domains}><Points x="t" y="y" /></Plot>
      </Filter>
    </Data>
  </InputContext>
</div>
{/if}
