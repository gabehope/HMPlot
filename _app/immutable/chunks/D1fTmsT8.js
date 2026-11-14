const n=`<script>
  import { Data, Tree, Plot, Nodes, Rect, Text, GraphData } from "$lib";
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
<\/script>

<Data value={edges}
  ><GraphData {nodes} {edges} nodeKey="id" source="source" target="target"
    ><Tree
      root="Root"
      mode="partition"
      orientation="up"
      nodeWidth="weight"
      layerHeight={1}
      visualMargin={0.08}
    >
      <Plot
        bind:this={plot}
        responsive
        height={350}
        x={{ domain: [0, 6] }}
        y={{ domain: [0, 3] }}
      >
        <Nodes
          ><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="depth" /><Text
            x="x"
            y="y"
            text="id"
            size={11}
          /></Nodes
        >
      </Plot>
    </Tree></GraphData
  ></Data
>
`;export{n as default};
