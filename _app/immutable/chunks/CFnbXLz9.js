const n=`<script lang="ts">
  import { T } from "@threlte/core";
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
<\/script>

{#if error}<p role="alert">{error}</p>{:else if countries}
  <label
    >Relief <input
      aria-label="Relief"
      type="range"
      min="0"
      max=".8"
      step=".01"
      bind:value={height}
    /></label
  >
  <Plot
    responsive
    bind:this={plot}
    height={480}
    coordinates="spherical"
    type="3d-y-up"
    sphericalView="projected"
    projection="mercator"
    overview
  >
    <T.AmbientLight intensity={0.5} />
    <T.DirectionalLight position={[3, 4, 5]} intensity={2} />
    <GeoJSON
      bind:this={regions}
      data={countries}
      fill="population"
      fillScale={continuous({ domain: [0, 1.4e9] })}
      height="population"
      heightScale={continuous({ domain: [0, 1.4e9], range: [0, height] })}
      lit
      animation
      onclick={(e) => (selected = e.feature.properties.name)}
    />
    <Legend for={regions} channel="fill" label="Source population estimate" />
  </Plot>
  <p aria-live="polite">Selected: {selected}</p>
{:else}<p>Loading map…</p>{/if}
<small>Natural Earth · public domain. Source estimates are illustrative.</small>
`;export{n as default};
