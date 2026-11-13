<script>
  // World map projections with curved outlines (TODO 39.5-39.6): equal-earth and natural-earth
  // for world maps, albers (conic equal-area) and albers-usa (the United States with Alaska and
  // Hawaii as insets). A graticule and the map's outline replace the edge axes.
  import { onMount } from "svelte";
  import { Plot, GeoJSON, InputContext, Select, Slider } from "$lib";
  import { loadCountries } from "./load.js";
  let { onready } = $props();
  let countries = $state(), error = $state(""), plot = $state(), mark = $state(), picked = $state("");
  let projection = $state("equal-earth"), center = $state(0);
  const projections = ["equal-earth", "natural-earth", "albers", "albers-usa", "equirectangular"];
  $effect(() => { if (plot) onready?.(plot); });
  $effect(() => {
    if (!import.meta.env.DEV || !plot || !mark) return;
    window.__projections = { plot, mark };
    return () => { delete window.__projections; };
  });
  onMount(() => {
    const cancel = new AbortController();
    loadCountries(cancel.signal).then((data) => (countries = data))
      .catch((e) => { if (e.name !== "AbortError") error = e.message; });
    return () => cancel.abort();
  });
</script>

<InputContext>
<div class="controls">
  <Select name="projection" label="Projection" options={projections} bind:value={projection} />
  <Slider name="center" label="Center longitude" min={-180} max={180} step={5}
    format={(value) => `${value}°`} bind:value={center} />
  <span aria-live="polite">{picked}</span>
</div>
{#if error}<p role="alert">{error}</p>{:else if countries}
  <!-- albers centers on the United States' latitude, as d3.geoAlbers does. -->
  <Plot bind:this={plot} responsive height={440} type="2d" coordinates="spherical" {projection}
    projectionCenter={[projection === "albers" ? center - 96 : center, projection === "albers" ? 38.7 : 0]} axes2d>
    <GeoJSON bind:this={mark} data={countries} fill="continent"
      onclick={(event) => (picked = `${event.feature.properties.name}: ${event.geographicCoordinates
        ?.map((value) => value.toFixed(1)).join("°, ")}°`)} />
  </Plot>
{:else}<p>Loading map…</p>{/if}
<small>Natural Earth · public domain.</small>
</InputContext>

<style>
  .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-bottom: 8px; font: 13px system-ui; }
</style>
