const e=`<script lang="ts">
  import { onMount } from "svelte";
  import { Data, Interpolate, Heatmap, InputContext, Playback, Plot, Slice, input, max, min, continuous } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    gridding = $state<any>(),
    slicing = $state<any>();
  const regular = {
    x: Array.from({ length: 25 }, (_, i) => i % 5),
    y: Array.from({ length: 25 }, (_, i) => Math.floor(i / 5)),
    value: Array.from(
      { length: 25 },
      (_, i) => Math.sin(i % 5) + Math.cos(Math.floor(i / 5)),
    ),
    region: Array.from({ length: 25 }, (_, i) => (i % 5 < 2 ? "West" : "East")),
  };
  const fieldFrames = {
    x: [...regular.x, ...regular.x],
    y: [...regular.y, ...regular.y],
    time: [...regular.x.map(() => 0), ...regular.x.map(() => 1)],
    value: [...regular.value, ...regular.value.map((v) => -v)],
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
        get slice() {
          return slicing;
        },
      };
    return () => {
      delete (window as any).__transformExample;
    };
  });
<\/script>

<!-- Time spans the column's range; playing it slices the field between its two frames. -->
<InputContext>
  <Data value={fieldFrames}>
    <Playback name="t" min={min("time")} max={max("time")} rate={0.25} loop label="Time" />
    <Slice bind:this={slicing} field="time" by={["x", "y"]} at={input("t")}>
      <Interpolate bind:this={gridding} x="x" y="y" values={["value"]} resolution={[16, 16]}>
        <Plot x={{ domain: [0, 4] }} y={{ domain: [0, 4] }} responsive bind:this={plot} height={380} axes2d>
          <Heatmap fill="value" fillScale={continuous({ domain: [-2, 2] })} />
        </Plot>
      </Interpolate>
    </Slice>
  </Data>
</InputContext>
`;export{e as default};
