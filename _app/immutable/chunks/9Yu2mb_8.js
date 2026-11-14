const n=`<script>
  import {
    Data,
    DAG,
    Plot,
    Nodes,
    Edges,
    Routes,
    Points,
    Text,
    GraphData,
  } from "$lib";
  import { untrack } from "svelte";
  let { plot = $bindable(), onready = undefined } = $props();
  const edges = {
    source: ["Input", "Input", "Parse", "Validate", "Parse", "Render"],
    target: ["Parse", "Validate", "Render", "Render", "Archive", "Archive"],
  };
  const nodes = {
    id: ["Input", "Parse", "Validate", "Render", "Archive", "Solo"],
    kind: ["source", "step", "step", "step", "sink", "isolated"],
  };
  $effect(() => {
    const p = plot;
    untrack(() => onready?.(p));
  });
<\/script>

<Data value={edges}
  ><GraphData {nodes} {edges} nodeKey="id" source="source" target="target"
    ><DAG nodeWidth={1.3} nodeHeight={0.65}>
      <Plot bind:this={plot} responsive height={470}>
        <Edges><Routes color="#7b9865" width={2} /></Edges>
        <Nodes
          ><Points position="position" fill="kind" size={7.5} /><Text
            x="x"
            y="y"
            text="id"
            dy={-16}
          /></Nodes
        >
      </Plot>
    </DAG></GraphData
  ></Data
>
`;export{n as default};
