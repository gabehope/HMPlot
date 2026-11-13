<script>
  import { untrack } from "svelte";
  import { Provider, Plot, Points, continuous } from "$lib";
  let { onready = () => {} } = $props();
  let plot = $state(), status = $state("");
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  const magnitudeColors = continuous({ domain: [4.5, 8], colormap: ["#ffe066", "#e0245e", "#4361ee"] });
</script>

<p>
  Ten years of magnitude 4.5+ earthquakes (USGS) from one Parquet file. The Provider reads only its
  <code>lon</code>, <code>lat</code> and <code>mag</code> columns, with HTTP range requests; the file's
  <code>year</code> and <code>depth</code> columns are never downloaded.
</p>
<Provider url="/data/earthquakes/usgs-m45-2015-2024.parquet" format="parquet" columns={["lon", "lat", "mag"]}
  onload={({ rows, ms }) => (status = `${rows.toLocaleString()} earthquakes in ${Math.round(ms)} ms`)}
  onerror={({ error }) => (status = String(error?.message ?? error))}>
  <Plot bind:this={plot} responsive height={360} axes2d x={{ domain: [-180, 180], label: "longitude" }}
    y={{ domain: [-90, 90], label: "latitude" }}>
    <Points x="lon" y="lat" fill="mag" fillScale={magnitudeColors} size={1} label="Earthquakes" />
  </Plot>
</Provider>
<output>{status}</output>
<small>Data: U.S. Geological Survey earthquake catalog (public domain).</small>

<style>
  p { font-size: 14px; line-height: 1.5; }
  output { display: block; color: #5b6470; font-size: 13px; margin-top: 6px; }
</style>
