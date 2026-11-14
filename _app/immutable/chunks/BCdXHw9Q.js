const n=`<script>
  import {
    Data,
    Pack,
    Plot,
    Nodes,
    Points,
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
    weight: [1, 1, 1, 3, 2, 2, 1],
    label: ["", "", "", "A1", "A2", "B1", "B2"],
  };
  $effect(() => {
    const p = plot;
    untrack(() => onready?.(p));
  });
<\/script>

<Data value={edges}
  ><GraphData {nodes} {edges} nodeKey="id" source="source" target="target"
    ><Pack root="Root" value="weight" padding={0.015}>
      <Plot
        bind:this={plot}
        width={450}
        height={450}
        x={{ domain: [0, 1] }}
        y={{ domain: [0, 1] }}
      >
        <Nodes
          ><Points
            x="x"
            y="y"
            size={multiply("r", 2)}
            sizeUnits="data"
            fill="depth"
          /><Text x="x" y="y" text="label" size={11} /></Nodes
        >
      </Plot>
    </Pack></GraphData
  ></Data
>
`;export{n as default};
