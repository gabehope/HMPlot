const n=`<script>
  import { onMount } from "svelte";
  import { T } from "@threlte/core";
  import { Data, Facet, Plot, Points, Rect, Prism, Sort, Line, Dodge, Stack, InputContext, Slider, input, continuous } from "$lib";
import { Bin, Hexbin, Normalize, Window } from "$lib/stats/index.js";
  let { onready = undefined, oncode = undefined } = $props();
  let plot = $state(),
    points = $state(),
    hit = $state(""),
    pointSize = $state(7);
  const faceted = new Set(["facets", "matrix", "histogram", "global", "stack"]);
  let example = $state("facets"),
    mode = $state("3d"),
    bins = $state(8),
    facet = $state();
  let data = $state.raw({
    x: Array.from({ length: 120 }, (_, i) => Math.sin(i * 1.71) * 2 + (i % 3)),
    y: Array.from({ length: 120 }, (_, i) => Math.cos(i * 0.71) * 2),
    group: Array.from({ length: 120 }, (_, i) => ["A", "B", "C"][i % 3]),
    time: Array.from({ length: 120 }, (_, i) => i),
    z: Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.31) * 2),
    site: Array.from({ length: 120 }, (_, i) => (i % 2 ? "North" : "South")),
  });
  $effect(() => {
    onready?.(
      faceted.has(example)
        ? facet
          ? {
              exportPNG: (scale) => facet.exportPNG({ scale }),
              whenSettled: () => facet.whenSettled(),
              openSettings: (anchor) =>
                facet.getPlots()[0]?.plot.openSettings(anchor),
            }
          : undefined
        : plot,
    );
  });
  const codes = {
    matrix: \`<Data value={observations}>
  <Facet row="site" column="group" link="x">
    <Plot height={240} axes2d><Points x="x" y="y" fill="group" /></Plot>
  </Facet>
</Data>\`,
    global: \`<Data value={observations}>
  <Normalize field="x" as="x">
    <Facet column="group" wrap={3}>
      <Plot height={260} axes2d><Points x="x" y="y" fill="group" /></Plot>
    </Facet>
  </Normalize>
</Data>\`,
    voxel: \`<Plot type="3d">
  <Bin x="x" y="y" z="z" bins={4} empty={false}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" z0="z0" z1="z1" fill="count" />
  </Bin>
</Plot>\`,
    stack: \`<Plot axes2d>
  <Stack y="x" series="group">
    <Rect x0={0} x1={1} y0="y0" y1="y1" fill="group" />
  </Stack>
</Plot>\`,
    facets: \`<Data value={observations}>
  <Facet column="group" wrap={3}>
    <Plot height={260} axes2d>
      <Points x="x" y="y" fill="group" />
    </Plot>
  </Facet>
</Data>\`,
    histogram: \`<InputContext>
  <Slider name="bins" min={1} max={64} step={1} value={8} label="Bins" />
  <Facet column="group" wrap={3}>
    <Plot height={260} axes2d>
      <Bin x="x" bins={input("bins")}>
        <Rect x0="x0" x1="x1" y0={0} y1="count" />
      </Bin>
    </Plot>
  </Facet>
</InputContext>\`,
    hex: \`<Plot type="3d">
  <Hexbin x="x" y="y" bins={8}>
    <Prism x="x" y="y" width="width" depth="depth"
      z0={0} z1="count" rotation="rotation" shape="hexagon" fill="count" />
  </Hexbin>
</Plot>\`,
    bins: \`<Plot type="3d">
  <Bin x="x" y="y" bins={8}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" z0={0} z1="count" fill="count" />
  </Bin>
</Plot>\`,
    swarm: \`<Plot axes2d>
  <Dodge x="x" axis="y" as="offset" padding={1} seed={42}>
    <Points x="x" y={0} dy="offset" size={7} />
  </Dodge>
</Plot>\`,
    signal: \`<Normalize field="x" as="normalized">
  <Sort by="time">
    <Window field="normalized" size={7} as="smooth">
      <Plot axes2d><Line x="time" y="smooth" /></Plot>
    </Window>
  </Sort>
</Normalize>\`,
  };
  $effect(() => oncode?.(codes[example]));
  onMount(() => {
    if (import.meta.env.DEV)
      window.__facetExample = {
        get facet() {
          return facet;
        },
        get plot() {
          return plot;
        },
        get points() {
          return points;
        },
        replace: (next) => (data = next),
      };
    return () => delete window.__facetExample;
  });
<\/script>

<InputContext>
<div class="controls">
  <label
    >Example <select aria-label="Example" bind:value={example}
      ><option value="facets">Wrapped facets</option><option value="matrix"
        >Matrix facets</option
      ><option value="global">Global normalization before faceting</option
      ><option value="histogram">Faceted histograms</option><option value="hex"
        >Hexagonal columns</option
      ><option value="bins">Rectangular columns</option><option value="voxel"
        >Voxel bins</option
      ><option value="stack">Stacked intervals</option><option value="swarm"
        >Swarm</option
      ><option value="signal">Normalized rolling signal</option></select
    ></label
  >{#if ["bins", "hex", "voxel"].includes(example)}<label
      >View <select aria-label="View" bind:value={mode}
        ><option>2d</option><option>3d</option></select
      ></label
    >{/if}{#if ["bins", "hex", "voxel"].includes(example)}<label
      >Bins <input type="number" min="1" max="20" bind:value={bins} /></label
    >{/if}{#if example === "swarm"}<label
      >Point size <input
        aria-label="Point size"
        type="range"
        min="3"
        max="14"
        bind:value={pointSize}
      /></label
    >{/if}{#if example === "histogram"}<Slider
      name="bins"
      min={1}
      max={64}
      step={1}
      value={8}
      label="Bins"
    />{/if}
</div>
<Data value={data}>
  {#if example === "matrix"}
    <Facet bind:this={facet} row="site" column="group" link="x"
      ><Plot height={240} axes2d
        ><Points
          x="x"
          y="y"
          fill="group"
          size={7}
        /></Plot
      ></Facet
    >
  {:else if example === "global"}
    <Normalize field="x" as="x"
      ><Facet bind:this={facet} column="group" wrap={3}
        ><Plot height={260} axes2d
          ><Points
            x="x"
            y="y"
            fill="group"
            size={7}
          /></Plot
        ></Facet
      ></Normalize
    >
  {:else if example === "voxel"}
    <Plot x={{ domain: [-3, 5] }} y={{ domain: [-3, 3] }} z={{ domain: [-3, 3] }}
      bind:this={plot}
      responsive
      height={440}
      type={mode}
      axes3d
      ><T.AmbientLight intensity={1.5} /><T.DirectionalLight
        position={[40, 80, 100]}
        intensity={3}
      /><Bin x="x" y="y" z="z" bins={Math.min(bins, 8)} empty={false}
        ><Rect
          x0="x0"
          x1="x1"
          y0="y0"
          y1="y1"
          z0="z0"
          z1="z1"
          fill="count"
          fillScale={continuous({ domain: [0, 8] })}
          lit={true}
        /></Bin
      ></Plot
    >
  {:else if example === "stack"}
    <Facet bind:this={facet} column="site"
      ><Plot x={{ domain: [0, 1] }} height={320} axes2d
        ><Stack y="x" series="group"
          ><Rect x0={0.1} x1={0.9} y0="y0" y1="y1" fill="group" /></Stack
        ></Plot
      ></Facet
    >
  {:else if example === "facets"}
    <Facet bind:this={facet} column="group" wrap={3}
      ><Plot height={260} axes2d
        ><Points
          x="x"
          y="y"
          fill="group"
          size={7}
        /></Plot
      ></Facet
    >
  {:else if example === "histogram"}
    <!-- Every cell's Bin reads the one Bins input. -->
    <Facet bind:this={facet} column="group" wrap={3}
      ><Plot height={260} axes2d
        ><Bin name="histogram" x="x" bins={input("bins")}
          ><Rect x0="x0" x1="x1" y0={0} y1="count" fill="#547ba2" /></Bin
        ></Plot
      ></Facet
    >
  {:else if example === "hex"}
    <Plot x={{ domain: [-3, 5] }} y={{ domain: [-3, 3] }} z={{ domain: [0, 15] }}
      bind:this={plot}
      responsive
      height={440}
      type={mode}
      axes3d
      ><T.AmbientLight intensity={1.5} /><T.DirectionalLight
        position={[40, 80, 100]}
        intensity={3}
      /><Hexbin x="x" y="y" {bins}
        ><Prism
          x="x"
          y="y"
          width="width"
          depth="depth"
          z0={0}
          z1="count"
          shape="hexagon"
          rotation="rotation"
          fill="count"
          fillScale={continuous({ domain: [0, 8] })}
          lit={true}
          onclick={(e) => (hit = \`\${e.aggregate?.count ?? 0} observations\`)}
        /></Hexbin
      ></Plot
    >
  {:else if example === "bins"}
    <Plot x={{ domain: [-3, 5] }} y={{ domain: [-3, 3] }} z={{ domain: [0, 15] }}
      bind:this={plot}
      responsive
      height={440}
      type={mode}
      axes3d
      ><T.AmbientLight intensity={1.5} /><T.DirectionalLight
        position={[40, 80, 100]}
        intensity={3}
      /><Bin x="x" y="y" {bins}
        ><Rect
          x0="x0"
          x1="x1"
          y0="y0"
          y1="y1"
          z0={0}
          z1="count"
          fill="count"
          fillScale={continuous({ domain: [0, 8] })}
          lit={true}
        /></Bin
      ></Plot
    >
  {:else if example === "swarm"}
    <Plot x={{ domain: [-3, 5] }} y={{ domain: [-1, 1] }}
      bind:this={plot}
      responsive
      height={300}
      axes2d
      ><Dodge x="x" axis="y" as="offset"
        ><Points
          x="x"
          y={0}
          dy="offset"
          bind:this={points}
          size={pointSize}
          fill="group"
        /></Dodge
      ></Plot
    >
  {:else}
    <Normalize field="x" as="normalized"
      ><Sort by="time"
        ><Window field="normalized" size={7} as="smooth"
          ><Plot x={{ domain: [0, 120] }} y={{ domain: [-2, 2] }}
            bind:this={plot}
            responsive
            height={360}
            axes2d
            ><Line
              x="time"
              y="smooth"
              color="#547ba2"
              width={2}
            /></Plot
          ></Window
        ></Sort
      ></Normalize
    >
  {/if}
</Data>
</InputContext>
{#if hit}<output aria-label="Selected bin">{hit}</output>{/if}

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 16px;
    font: 13px system-ui;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input {
    width: 60px;
  }
</style>
`;export{n as default};
