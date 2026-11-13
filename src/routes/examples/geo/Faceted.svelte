<script lang="ts">
  import { onMount } from "svelte";
  import {
    Plot,
    GeoJSON,
    Legend,
    Data,
    Filter,
    Facet,
    InputContext,
    Select,
    categories,
    col,
    input,
    is_in,
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
  <InputContext>
    <Data value={countries}>
      <Select multiple
        name="continents"
        options={categories("continent")}
        value={["Europe", "Africa", "South America"]}
        label="Continents"
      />
      <Filter bind:this={filter} where={is_in(col("continent"), input("continents"))}>
        <Facet
          column="continent"
          columnOrder={["Europe", "Africa", "South America"]}
          wrap={3}
        >
          <Plot responsive height={240} coordinates="spherical">
            <GeoJSON
              geometry="geometry"
              fill="continent"
              onclick={(e) => (selected = e.feature.properties.name)}
            />
          </Plot>
        </Facet>
      </Filter>
    </Data>
  </InputContext>
  <p aria-live="polite">Selected: {selected}</p>
{:else}<p>Loading map…</p>{/if}
<small>Natural Earth · public domain. Source estimates are illustrative.</small>
