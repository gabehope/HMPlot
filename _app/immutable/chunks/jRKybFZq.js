const t=`<script lang="ts">
  import { onMount } from "svelte";
  import { Data, InputContext, Playback, Plot, Points, Slice, input, max, min } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    slicing = $state<any>();
  const temporal = {
    entity: ["A", "B", "A", "B", "A", "B"],
    time: [0, 0, 2, 2, 5, 5],
    x: [-2, 2, -1, 1, 2, -2],
    y: [-1, 1, 1, -1, 2, -2],
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
        get slice() {
          return slicing;
        },
      };
    return () => {
      delete (window as any).__transformExample;
    };
  });
<\/script>

<!-- Time spans the column's range; the Slice interpolates each entity between the times around it. -->
<InputContext>
  <Data value={temporal}>
    <Playback name="t" min={min("time")} max={max("time")} rate={1} loop label="Time" />
    <Slice bind:this={slicing} field="time" at={input("t")} by="entity">
      <Plot x={{ domain: [-3, 3] }} y={{ domain: [-3, 3] }} responsive bind:this={plot} height={380} axes2d>
        <Points
          x="x"
          y="y"
          fill="entity"
          size={14}
        />
      </Plot>
    </Slice>
  </Data>
</InputContext>
`;export{t as default};
