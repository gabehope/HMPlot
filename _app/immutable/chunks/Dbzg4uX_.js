const n=`<script lang="ts">
  import { onMount } from "svelte";
  import { Data, Interpolate, InputContext, Line, Plot, Select, Slider, input } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    gridding = $state<any>();
  const signal = { time: [0, 1, 2, 4, 5], value: [0, 1, -0.5, 0.8, 0] };

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
<\/script>

<InputContext>
  <div class="controls">
    <Slider name="resolution" min={2} max={512} step={1} value={128} label="Resolution" />
    <Select name="method" options={["auto", "linear", "idw", "nearest"]} label="Interpolation" />
  </div>
  <Data value={signal}>
    <Interpolate bind:this={gridding} x="time" values={["value"]} resolution={input("resolution")} method={input("method")}>
      <Plot x={{ domain: [0, 5] }} y={{ domain: [-1, 1.2] }} responsive bind:this={plot} height={320} axes2d>
        <Line x="x" y="value" width={2} />
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
`;export{n as default};
