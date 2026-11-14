const n=`<script>
  import {
    Data,
    Sankey,
    Plot,
    Nodes,
    Edges,
    Rect,
    Flow,
    Text,
    GraphData,
  } from "$lib";
  import { untrack } from "svelte";
  let { plot = $bindable(), onready = undefined } = $props();
  const edges = {
    source: ["Inputs", "Inputs", "A", "B"],
    target: ["A", "B", "Output", "Output"],
    value: [3, 2, 3, 2],
  };
  const nodes = {
    id: ["Inputs", "A", "B", "Output"],
    group: ["source", "branch", "branch", "sink"],
  };
  $effect(() => {
    const p = plot;
    untrack(() => onready?.(p));
  });
<\/script>

<Data value={edges}
  ><GraphData {nodes} {edges} nodeKey="id" source="source" target="target"
    ><Sankey value="value">
      <Plot
        bind:this={plot}
        responsive
        height={420}
        x={{ domain: [-0.05, 1.05] }}
        y={{ domain: [-0.05, 1.05] }}
      >
        <Edges
          ><Flow
            startLower="startLower"
            endLower="endLower"
            startUpper="startUpper"
            endUpper="endUpper"
            fill="#7b9865"
            opacity={0.55}
          /></Edges
        >
        <Nodes
          ><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="group" /><Text
            x="x"
            y="y"
            text="id"
            dx={8}
          /></Nodes
        >
      </Plot>
    </Sankey></GraphData
  ></Data
>
`;export{n as default};
