# World map projections

equal-earth and natural-earth world maps, albers (conic equal-area) and albers-usa (the United States with Alaska and Hawaii as insets): each maps longitude and latitude jointly into one curved outline around its center, cut at its seam, with a graticule and outline instead of edge axes. Move the center to move the seam; click a country for the longitude and latitude under the pointer.

## Python

```python
import hmplot as hm

# countries: a GeoJSON FeatureCollection with a "continent" property per country.
with hm.Plot(coordinates="spherical", projection="equal-earth", projection_center=[150, 0],
             type="2d", height=440, axes2d=True) as plot:
    hm.GeoJSON(data=countries, fill="continent")
plot
```

## Svelte

```svelte
<script>
  // World map projections with curved outlines (TODO 39.5-39.6): equal-earth and natural-earth
  // for world maps, albers (conic equal-area) and albers-usa (the United States with Alaska and
  // Hawaii as insets). A graticule and the map's outline replace the edge axes.
  import { onMount } from "svelte";
  import { Plot, GeoJSON, InputContext, Select, Slider } from "hmplot";
  const loadCountries = async () => { const response = await fetch("/data/geo/countries.json"); if (!response.ok) throw Error("Could not load countries."); return response.json(); };
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
```
