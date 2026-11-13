<script>
  // Sibling Frames sharing the Plot's categorical x (TODO 134.13): each owns its y, neither sets
  // an x, so the month band scale their marks infer is the Plot's, and the Plot's own y is unused.
  // ?case=scopes: each Frame's marks read their own data, with months the other's lack.
  import { onMount } from "svelte";
  import { Plot, Frame, Line, Points, Data } from "$lib";
import { Bar } from "$lib/charts/index.js";
  const scene = typeof location === "undefined" ? "shared" : new URLSearchParams(location.search).get("case") ?? "shared";
  const data = {
    month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    precip: [96, 85, 60, 70, 50, 15],
    temp: [11.5, 12.5, 14.5, 15.5, 18, 21],
  };
  const first = { month: ["Jan", "Feb", "Mar"], precip: [96, 85, 60] },
    second = { month: ["Apr", "May", "Jun"], temp: [15.5, 18, 21] };
  let plot = $state(), precipitation = $state(), temperature = $state();
  onMount(() => {
    window.twinCategories = {
      get plot() { return plot; },
      get precipitation() { return precipitation; },
      get temperature() { return temperature; },
    };
    return () => { delete window.twinCategories; };
  });
</script>
{#if scene === "shared"}
  <Plot bind:this={plot} {data} type="2d" width={600} height={400}>
    <Frame bind:this={precipitation} name="Precipitation" y={{ domain: "auto", label: "Precipitation (mm)" }}>
      <Bar x="month" y="precip" />
    </Frame>
    <Frame bind:this={temperature} name="Temperature" y={{ domain: "auto", label: "Temperature (°C)", side: "right" }}>
      <Line x="month" y="temp" />
      <Points x="month" y="temp" />
    </Frame>
  </Plot>
{:else}
  <Plot bind:this={plot} type="2d" width={600} height={400}>
    <Frame bind:this={precipitation} name="Precipitation" y={{ domain: "auto", label: "Precipitation (mm)" }}>
      <Data value={first}><Bar x="month" y="precip" /></Data>
    </Frame>
    <Frame bind:this={temperature} name="Temperature" y={{ domain: "auto", label: "Temperature (°C)", side: "right" }}>
      <Data value={second}><Points x="month" y="temp" /></Data>
    </Frame>
  </Plot>
{/if}
