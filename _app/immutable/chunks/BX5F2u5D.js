const n=`<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button,
    Checkbox,
    Data,
    Edges,
    Force,
    InputContext,
    Nodes,
    Plot,
    Points,
    Segments,
    Slider,
    input,
    GraphData,
    continuous,
  } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    layout = $state<any>(),
    graphPoints = $state<any>();
  const graph = {
    source: ["A", "A", "B", "B", "C", "D", "E", "F", "G", "H"],
    target: ["B", "C", "D", "E", "F", "F", "G", "H", "H", "A"],
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
        get force() {
          return layout;
        },
        get graphPoints() {
          return graphPoints;
        },
      };
    return () => {
      delete (window as any).__transformExample;
    };
  });
<\/script>

<InputContext>
  <div class="controls">
    <Checkbox name="run" label="Run" />
    <Button name="step" label="Step" />
    <Slider
      name="linkDistance"
      min={0}
      max={200}
      step={1}
      value={30}
      label="Link distance"
    />
  </div>
  <Data value={graph}>
    <GraphData source="source" target="target"
      ><Force
        bind:this={layout}
        dimensions={3}
        running={input("run")}
        step={input("step")}
        linkDistance={input("linkDistance")}
      >
        <Plot
          x={{ domain: [-90, 90] }}
          y={{ domain: [-90, 90] }}
          z={{ domain: [-90, 90] }}
          responsive
          bind:this={plot}
          type={"3d"}
          axes2d={false}
          height={420}
        >
          <Edges
            ><Segments
              start="start"
              end="end"
              color="#8694a0"
              width={1}
            /></Edges
          >
          <Nodes drag
            ><Points
              bind:this={graphPoints}
              position="position"
              fill="degree"
              fillScale={continuous({ domain: [0, 4] })}
              size={14}
              outlineColor="#30343b"
              outlineWidth={1.05}
            /></Nodes
          >
        </Plot>
      </Force></GraphData
    >
  </Data>
</InputContext>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
</style>
`;export{n as default};
