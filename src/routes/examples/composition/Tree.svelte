<script>
  import { Data, Tree, Plot, Nodes, Edges, Points, Text, InputContext, Select, categories, input, GraphData } from "$lib";
import { Arrows } from "$lib/charts/index.js";
  import { untrack } from "svelte";
  let { plot = $bindable(), onready = undefined } = $props();
  $effect(() => {
    const p = plot;
    untrack(() => onready?.(p));
  });
  const people = {
    nodeId: [
      "Root",
      "Left",
      "Right",
      "Leaf A",
      "Leaf B",
      "Leaf C",
      "Leaf D",
      "Isolated",
      "Other",
    ],
    name: [
      "Origin",
      "Branch A",
      "Branch B",
      "A1",
      "A2",
      "B1",
      "B2",
      "Isolated",
      "Other",
    ],
  };
  const data = {
    source: ["Root", "Root", "Left", "Left", "Right", "Right", "Isolated"],
    target: ["Left", "Right", "Leaf A", "Leaf B", "Leaf C", "Leaf D", "Other"],
  };
</script>

<InputContext
  ><Data value={data}>
    <div class="controls">
      <Select
        name="root"
        options={categories("source")}
        value="Root"
        label="Root"
      />
      <Select
        name="orientation"
        options={["down", "up", "left", "right"]}
        label="Orientation"
      />
    </div>
    <GraphData
      nodes={people}
      edges={data}
      nodeKey="nodeId"
      source="source"
      target="target"
      ><Tree root={input("root")} orientation={input("orientation")}>
        <Plot
          bind:this={plot}
          responsive
          height={440}
          x={{ domain: [-3, 3] }}
          y={{ domain: [-3, 1] }}
        >
          <Edges
            ><Arrows
              start="start"
              end="end"
              curve="link-vertical"
              width={1}
              color="#7b9865"
            /></Edges
          >
          <Nodes
            ><Points position="position" size={4} fill="#547ba2" /><Text
              x="x"
              y="y"
              text="name"
              dy={-14}
            /></Nodes
          >
        </Plot>
      </Tree></GraphData
    ></Data
  ></InputContext
>

<style>
  .controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
</style>
