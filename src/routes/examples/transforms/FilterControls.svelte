<script lang="ts">
  import { onMount } from "svelte";
  import { Data, Filter, InputContext, Select, Plot, Rect, Slider, categories, col, input, is_in } from "$lib";
import { Bin } from "$lib/stats/index.js";
  let { onready } = $props();
  let filter = $state<any>(),
    binning = $state<any>(),
    plot = $state<any>(),
    inputs = $state<any>();
  const data = {
    x: Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.4) + (i % 3)),
    species: Array.from({ length: 120 }, (_, i) => ["A", "B", "C"][i % 3]),
  };

  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    if (import.meta.env.DEV)
      (window as any).__transformExample = {
        get filter() {
          return filter;
        },
        get binning() {
          return binning;
        },
        get plot() {
          return plot;
        },
        get bins() {
          return inputs?.getValues().bins;
        },
      };
    return () => {
      delete (window as any).__transformExample;
    };
  });
</script>

<!-- The Species choices are the column's categories; the Filter keeps the chosen ones. -->
<InputContext bind:this={inputs}>
  <Data value={data}>
    <div class="controls">
      <Select multiple name="species" options={categories("species")} value={["A"]} label="Species" />
      <Slider name="bins" min={1} max={64} step={1} value={12} label="Bins" />
    </div>
    <Filter bind:this={filter} where={is_in(col("species"), input("species"))}
      ><Plot x={{ domain: [-1.1, 3.1] }} y={{ domain: [0, 20] }}
        responsive
        bind:this={plot}
        height={350}
        axes2d
        ><Bin bind:this={binning} x="x" bins={input("bins")}
          ><Rect x0="x0" x1="x1" y0={0} y1="count" fill="#547ba2" /></Bin
        ></Plot
      ></Filter
    >
  </Data>
</InputContext>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }
</style>
