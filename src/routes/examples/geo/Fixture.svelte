<script lang="ts">
  import { onMount } from "svelte";
  import { Plot, GeoJSON, Legend, Data, Filter, Heatmap } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    mark = $state<any>(),
    height = $state(0.2),
    mode = $state<"2d" | "3d">("2d"),
    view = $state<"globe" | "projected">("globe"),
    selected = $state("None");
  const initial = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "region",
        properties: { name: "Region", value: 2, group: "A" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-40, -25],
              [40, -25],
              [40, 25],
              [-40, 25],
              [-40, -25],
            ],
            [
              [-8, -8],
              [-8, 8],
              [8, 8],
              [8, -8],
              [-8, -8],
            ],
          ],
        },
      },
      {
        type: "Feature",
        id: "island",
        properties: { name: "Island", value: 1, group: "B" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [50, -10],
                [70, -10],
                [70, 10],
                [50, 10],
                [50, -10],
              ],
            ],
            [
              [
                [80, 20],
                [90, 20],
                [90, 30],
                [80, 30],
                [80, 20],
              ],
            ],
          ],
        },
      },
      {
        type: "Feature",
        id: "points",
        properties: { name: "Cities", value: 3, group: "A" },
        geometry: {
          type: "MultiPoint",
          coordinates: [
            [-60, 0],
            [-60, 25],
          ],
        },
      },
      {
        type: "Feature",
        id: "road",
        properties: { name: "Route", value: 4, group: "B" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-80, -40],
            [-40, -50],
            [10, -45],
          ],
        },
      },
    ],
  };
  let painted = $state(false);
  let map = $state.raw(initial),
    hits = $state(0);
  const select = (e) => {
    selected = e.feature.properties.name;
    hits++;
  };
  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    (window as any).__geo = {
      get plot() {
        return plot;
      },
      get mark() {
        return mark;
      },
      get selected() {
        return selected;
      },
      get hits() {
        return hits;
      },
      replace: (value) => (map = value),
      restore: () => (map = initial),
    };
    return () => {
      delete (window as any).__geo;
    };
  });
</script>

<div class="controls">
  <label><input type="checkbox" bind:checked={painted} />Paint on surface</label
  ><label
    >View <select bind:value={mode}
      ><option>2d</option><option>3d</option></select
    ></label
  ><label
    >3D mode <select bind:value={view}
      ><option>globe</option><option>projected</option></select
    ></label
  ><label
    >Height <input
      aria-label="Height"
      type="range"
      min="0"
      max=".5"
      step=".01"
      bind:value={height}
    /></label
  >
</div>
<Plot
  responsive
  bind:this={plot}
  height={420}
  coordinates="spherical"
  type={mode === "3d" ? "3d-y-up" : "2d"}
  sphericalView={view}
  overview
>
  {#if painted}<Heatmap
      fill={[
        [0, 0],
        [0, 0],
      ]}
      textureResolution={[512, 256]}
    >
      <GeoJSON
        bind:this={mark}
        data={map}
        fill="group"
        height={0}
        size={8}
        width={1}
        onclick={select}
      />
    </Heatmap>{:else}
    <GeoJSON
      bind:this={mark}
      data={map}
      fill="group"
      {height}
      size={8}
      width={1}
      onclick={select}
    />
  {/if}
  <Legend for={mark} channel="fill" label="Group" />
</Plot>
<p aria-live="polite">Selected: {selected}</p>
