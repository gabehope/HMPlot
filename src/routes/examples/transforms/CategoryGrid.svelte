<script lang="ts">
  import { onMount } from "svelte";
  import { Data, Interpolate, Heatmap, InputContext, Plot, Slider, input } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    gridding = $state<any>();
  const regular = {
    x: Array.from({ length: 25 }, (_, i) => i % 5),
    y: Array.from({ length: 25 }, (_, i) => Math.floor(i / 5)),
    value: Array.from(
      { length: 25 },
      (_, i) => Math.sin(i % 5) + Math.cos(Math.floor(i / 5)),
    ),
    region: Array.from({ length: 25 }, (_, i) => (i % 5 < 2 ? "West" : "East")),
  };

  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    if (import.meta.env.DEV)
      (window as any).__transformExample = {
        get plot() {
          return plot;
        },
        get grid() {
          return gridding;
        },
      };
    return () => {
      delete (window as any).__transformExample;
    };
  });
</script>

<!-- Categories are not interpolated (each cell takes the nearest row's), so only the resolution is an input. -->
<InputContext>
  <div class="controls">
    <Slider name="resolution" min={2} max={512} step={1} value={16} label="Resolution" />
  </div>
  <Data value={regular}>
    <Interpolate bind:this={gridding} x="x" y="y" values={["region"]} resolution={input("resolution")}>
      <Plot x={{ domain: [0, 4] }} y={{ domain: [0, 4] }} responsive bind:this={plot} height={380} axes2d>
        <Heatmap fill="region" />
      </Plot>
    </Interpolate>
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
