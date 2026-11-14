const n=`<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button,
    Checkbox,
    Data,
    Force,
    InputContext,
    Nodes,
    Edges,
    Plot,
    Points,
    Segments,
    input,
    GraphData,
    continuous,
  } from "$lib";
  let { onready } = $props();
  let count = $state(512),
    dimensions = $state<2 | 3>(2),
    plot = $state<any>(),
    layout = $state<any>(),
    points = $state<any>();
  const graph = $derived.by(() => {
    const source: number[] = [],
      target: number[] = [];
    let seed = 42;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < count; i++) {
      source.push(i, i, i);
      target.push(
        (i + 1) % count,
        (Math.floor(i / 32) * 32 + Math.floor(random() * 32)) % count,
        Math.floor(random() * count),
      );
    }
    return { source, target };
  });
  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    if (import.meta.env.DEV)
      (window as any).__largeGraph = {
        get plot() {
          return plot;
        },
        get force() {
          return layout;
        },
        get points() {
          return points;
        },
      };
    return () => {
      delete (window as any).__largeGraph;
    };
  });
<\/script>

<InputContext>
  <div class="toolbar">
    <label
      >Nodes <select aria-label="Nodes" bind:value={count}
        ><option value={64}>64</option><option value={128}>128</option><option
          value={256}>256</option
        ><option value={512}>512</option><option value={1024}>1,024</option
        ><option value={2048}>2,048</option><option value={10000}>10,000</option
        ><option value={100000}>100,000</option></select
      ></label
    >
    <label
      >Dimensions <select aria-label="Dimensions" bind:value={dimensions}
        ><option value={2}>2D</option><option value={3}>3D</option></select
      ></label
    >
    <Checkbox name="run" label="Run" />
    <Button name="step" label="Step" />
    <Button name="restart" label="Reset" />
    <span
      >{(count * 3).toLocaleString()} edges · seeded communities · {count >=
      4096
        ? "grid repulsion, exact nearby"
        : "exact GPU repulsion"}</span
    >
  </div>
  <Data value={graph}>
    <GraphData source="source" target="target"
      ><Force
        bind:this={layout}
        {dimensions}
        linkDistance={12}
        repulsion={50}
        running={input("run")}
        step={input("step")}
        reset={input("restart")}
      >
        <Plot
          bind:this={plot}
          responsive
          height={560}
          type={dimensions === 3 ? "3d" : "2d"}
          overview
        >
          <Edges
            ><Segments
              start="start"
              end="end"
              color="#718394"
              opacity={0.35}
              width={1}
            /></Edges
          >
          <Nodes drag
            ><Points
              bind:this={points}
              position="position"
              fill="degree"
              fillScale={continuous({ domain: [0, 14] })}
              size={7}
              outlineColor="#f4f2ed"
              outlineWidth={0.5}
            /></Nodes
          >
        </Plot>
      </Force></GraphData
    >
  </Data>
</InputContext>
<p>
  Starts paused. Drag nodes, check Run, or press Step; larger graphs advance
  more slowly. Reset returns to the starting layout.
</p>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  span,
  p {
    font-size: 12px;
    color: #697785;
  }
</style>
`;export{n as default};
