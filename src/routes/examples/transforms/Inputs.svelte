<script lang="ts">
  import { onMount } from "svelte";
  import { Data, Filter, InputContext, Playback, Plot, Rect, Select, Slider, categories, col, equal, greater_equal, input, logical_and, max, min } from "$lib";
import { Bin } from "$lib/stats/index.js";
  let { onready } = $props();
  let plot = $state<any>();
  const data = {
    x: Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.4) + (i % 3)),
    species: Array.from({ length: 120 }, (_, i) => ["A", "B", "C"][i % 3]),
  };
  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    if (import.meta.env.DEV) (window as any).__inputsExample = { get plot() { return plot; } };
    return () => delete (window as any).__inputsExample;
  });
</script>

<!-- Inputs send their values up to the InputContext; everything in it reads them by name. The
     Species options and the range of Minimum x are read from the data around them, and Minimum x
     plays: it sweeps the Filter across the data, 0.5 per second. -->
<InputContext>
  <Data value={data}>
    <div class="controls">
      <Select name="species" options={categories("species")} label="Species" />
      <Playback name="start" min={min("x")} max={max("x")} step={0.1} rate={0.5} loop label="Minimum x" />
      <Slider name="bins" min={4} max={40} step={1} value={12} label="Bins" />
    </div>
    <Filter where={logical_and(equal(col("species"), input("species")), greater_equal(col("x"), input("start")))}>
      <Plot x={{ domain: [-1.1, 3.1] }} y={{ domain: [0, 20] }} responsive bind:this={plot} height={350} axes2d>
        <Bin x="x" bins={input("bins")}>
          <Rect x0="x0" x1="x1" y0={0} y1="count" fill="#547ba2" />
        </Bin>
      </Plot>
    </Filter>
  </Data>
</InputContext>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
</style>
