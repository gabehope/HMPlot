<script>
  import { onMount, untrack } from "svelte";
  import { Data, Plot, GeoJSON, Points, Text, moved } from "$lib";
  import { loadCountries } from "./load.js";
  let { onready = () => {} } = $props();
  let countries = $state(), error = $state(""), plot = $state(), data = $state(), status = $state("Drag a city.");
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  onMount(() => {
    const cancel = new AbortController();
    loadCountries(cancel.signal).then((value) => (countries = value)).catch((reason) => {
      if (reason.name !== "AbortError") error = reason.message;
    });
    return () => cancel.abort();
  });
  const cities = {
    name: ["Lisbon", "Nairobi", "Mumbai", "Tokyo", "Sydney", "Lima", "Toronto"],
    lon: [-9.1, 36.8, 72.9, 139.7, 151.2, -77.0, -79.4],
    lat: [38.7, -1.3, 19.1, 35.7, -33.9, -12.0, 43.7],
  };
  const degrees = (value = 0) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}°`;
  const report = (event) => {
    status = event.cancelled ? "Cancelled." : `${event.keys.join(", ")}: ${degrees(event.changes.lon)} longitude, ${degrees(event.changes.lat)} latitude`;
  };
</script>
<p>Drag a city across the map. The table's coordinates never change: the drag writes offsets in degrees, and the point and its label both follow because they read <code>moved("lon")</code> and <code>moved("lat")</code>. The drag goes back through the Mercator projection, so the city stays under the pointer at any latitude.</p>
<p class="status">{status} <button onclick={() => { data?.resetOffsets(); status = "Reset."; }}>Reset</button></p>
{#if error}<p role="alert">{error}</p>{:else if countries}
  <Data bind:this={data} value={cities} key="name">
    <Plot bind:this={plot} responsive height={420} type="2d" coordinates="spherical" projection="mercator"
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-60, 75], visible: false }}>
      <GeoJSON data={countries} fill="#d8dde3" />
      <Points x={moved("lon")} y={moved("lat")} size={5} fill="#d62728" drag ondragend={report} />
      <Text x={moved("lon")} y={moved("lat")} text="name" dy={14} />
    </Plot>
  </Data>
{/if}
<style>p {font-size:14px;line-height:1.5} .status {font-variant-numeric: tabular-nums}</style>
