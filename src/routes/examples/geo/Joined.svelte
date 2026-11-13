<script lang="ts">
  import { onMount } from "svelte";
  import {
    Plot,
    GeoJSON,
    Legend,
    Data,
    Filter,
    Facet,
    continuous,
  } from "$lib";
  import { loadCountries } from "./load.js";
  let { onready } = $props();
  let countries = $state<any>(),
    error = $state(""),
    plot = $state<any>(),
    regions = $state<any>(),
    height = $state(0.35),
    selected = $state("None"),
    filter = $state<any>();
  const measurements = {
    country: ["USA", "BRA", "FRA", "CHN", "IND", "AUS", "ZAF"],
    rate: [3, 2, 4, 1, 2.5, 4.5, 3.5],
  };
  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    const cancel = new AbortController();
    loadCountries(cancel.signal)
      .then((d) => (countries = d))
      .catch((e) => {
        if (e.name !== "AbortError") error = e.message;
      });
    if (import.meta.env.DEV)
      (window as any).__geoExample = {
        get plot() {
          return plot;
        },
        get mark() {
          return regions;
        },
      };
    return () => {
      cancel.abort();
      delete (window as any).__geoExample;
    };
  });
</script>

{#if error}<p role="alert">{error}</p>{:else if countries}
  <Data value={measurements}>
    <Plot
      responsive
      bind:this={plot}
      height={480}
      coordinates="spherical"
      type="2d"
      overview
    >
      <GeoJSON
        bind:this={regions}
        data={countries}
        featureKey="iso"
        dataKey="country"
        fill="rate"
        fillScale={continuous({ domain: [0, 5] })}
        onclick={(e) => (selected = e.feature.properties.name)}
      />
      <Legend for={regions} channel="fill" label="Illustrative index" />
    </Plot>
  </Data>
  <p aria-live="polite">Selected: {selected}</p>
{:else}<p>Loading map…</p>{/if}
<small>Natural Earth · public domain. Source estimates are illustrative.</small>
