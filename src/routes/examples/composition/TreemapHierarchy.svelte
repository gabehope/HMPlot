<script>
  import { Data, Treemap, Plot, Nodes, Rect, Text, GraphData } from "$lib";
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
</script>

<Data value={edges}
  ><GraphData {nodes} {edges} nodeKey="id" source="source" target="target"
    ><Treemap
      root="Root"
      value="weight"
      paddingInner={0.01}
      paddingOuter={0.025}
    >
      <Plot
        bind:this={plot}
        responsive
        height={420}
        x={{ domain: [0, 1] }}
        y={{ domain: [0, 1] }}
      >
        <Nodes
          ><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="depth" /><Text
            x="x"
            y="y"
            text="label"
            size={11}
          /></Nodes
        >
      </Plot>
    </Treemap></GraphData
  ></Data
>
