const n=`<script>
  import {
    Data,
    Plot,
    Nodes,
    Edges,
    Points,
    Text,
    Segments,
    multiply,
    add,
    GraphData,
    Calculate,
  } from "$lib";
  import { untrack } from "svelte";
  let { plot = $bindable(), onready = undefined } = $props();
  const edges = { source: ["A", "A", "B", "C"], target: ["B", "C", "D", "D"] };
  const nodes = {
    id: ["A", "B", "C", "D", "Solo"],
    column: [0, 1, 1, 2, 2],
    lane: [1, 0, 2, 1, 2.7],
    kind: ["root", "branch", "branch", "leaf", "isolated"],
  };
  $effect(() => {
    const p = plot;
    untrack(() => onready?.(p));
  });
<\/script>

<Data value={edges}
  ><GraphData {nodes} {edges} nodeKey="id" source="source" target="target"
    ><Nodes
      ><Calculate columns={{ x: multiply("column", 2), y: add("lane", 0.2) }}>
        <Plot
          bind:this={plot}
          responsive
          height={400}
          x={{ domain: [-0.5, 5] }}
          y={{ domain: [-0.5, 3.5] }}
        >
          <Edges
            ><Segments
              start="start"
              end="end"
              color="#7b9865"
              width={2}
            /></Edges
          >
          <Nodes
            ><Points position="position" fill="kind" size={6} /><Text
              x="x"
              y="y"
              text="id"
              dy={-16}
            /></Nodes
          >
        </Plot>
      </Calculate></Nodes
    ></GraphData
  ></Data
>
`;export{n as default};
