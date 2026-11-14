const t=`<script lang="ts">
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
  } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    layout = $state<any>(),
    graphPoints = $state<any>();
  const nodeFeatures = {
    nodeId: ["A", "B", "C", "D", "E", "F", "G", "H"],
    team: ["North", "North", "West", "West", "East", "East", "South", "South"],
  };
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

<!-- Run plays and pauses the layout. Step and Reset act on each press: a Button's value counts
     its presses, and Force acts when its step or reset value changes. -->
<InputContext>
  <div class="controls">
    <Checkbox name="run" label="Run" />
    <Button name="step" label="Step" />
    <Button name="restart" label="Reset" />
    <Slider
      name="repulsion"
      min={0}
      max={200}
      step={1}
      value={30}
      label="Repulsion"
    />
  </div>
  <Data value={graph}>
    <GraphData nodes={nodeFeatures} edges={graph} nodeKey="nodeId"
      ><Force
        bind:this={layout}
        dimensions={2}
        running={input("run")}
        step={input("step")}
        reset={input("restart")}
        repulsion={input("repulsion")}
      >
        <Plot
          x={{ domain: [-90, 90] }}
          y={{ domain: [-90, 90] }}
          z={{ domain: [-90, 90] }}
          responsive
          bind:this={plot}
          type={"2d"}
          axes2d={true}
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
              x="x"
              y="y"
              z={0.001}
              fill="team"
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
`;export{t as default};
