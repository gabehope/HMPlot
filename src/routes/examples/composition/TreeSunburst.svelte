<script>
  import {
    Data,
    Tree,
    Plot,
    Nodes,
    Rect,
    Text,
    multiply,
    GraphData,
  } from "$lib";
  import { untrack } from "svelte";
  let { plot = $bindable(), onready = undefined } = $props();
  const edges = {
    source: ["Root", "Root", "A", "A", "B", "B"],
    target: ["A", "B", "A1", "A2", "B1", "B2"],
  };
  const nodes = {
    id: ["Root", "A", "B", "A1", "A2", "B1", "B2"],
    weight: [1, 1, 1, 2, 1, 1, 2],
  };
  $effect(() => {
    const p = plot;
    untrack(() => onready?.(p));
  });
</script>

<Data value={edges}
  ><GraphData {nodes} {edges} nodeKey="id" source="source" target="target"
    ><Tree
      root="Root"
      mode="partition"
      orientation="up"
      nodeWidth="weight"
      layerHeight={0.33}
    >
      <Plot
        bind:this={plot}
        coordinates="polar"
        type="2d"
        baseRadius={0}
        radialScale={1}
        y={{ domain: [0, 1.05] }}
        responsive
        height={470}
      >
        <Nodes
          ><Rect
            x0={multiply("x0", 60)}
            x1={multiply("x1", 60)}
            y0="y0"
            y1="y1"
            fill="depth"
          /></Nodes
        >
      </Plot>
    </Tree></GraphData
  ></Data
>
