<script>
  // TODO 28 Part B fixtures: tween() as a column. A Filter and a Bin read a tweened column while
  // it moves; a nested tween moves its Calculate's column.
  import { onMount } from "svelte";
  import { Plot, Calculate, Filter, Points, Tree, Nodes, Rect, tween, multiply, greater, add, col, GraphData } from "$lib/index";
import { Bin } from "$lib/stats/index.js";
  import Probe from "../view-state/Probe.svelte";
  const low = { x: [0, 10, 20, 30], y: [0, 1, 2, 3] },
    high = { x: [100, 110, 120, 130], y: [0, 1, 2, 3] };
  let rows = $state(low);
  const probes = {};
  let plot = $state(),
    filtered = $state(),
    markPlot = $state(),
    nestedPoints = $state(),
    operatorPoints = $state(),
    followPoints = $state();
  let marks = $state({ i: [0, 1, 2], v: [0, 0, 0] });
  let fast = $state({ i: [0, 1, 2], v: [0, 0, 0] }),
    fastPlot = $state(),
    fastPoints = $state(), fastOtherPoints = $state();
  const timing = { duration: 1000, easing: "linear" };
  let treePlot = $state(),
    treeRect = $state();
  let treeNodes = $state({ id: [0, 1, 2], weight: [1, 1, 1] });
  onMount(() => {
    window.tweenPipeline = {
      probes,
      get plot() {
        return plot;
      },
      get filtered() {
        return filtered;
      },
      raise: () => {
        rows = high;
      },
      lower: () => {
        rows = low;
      },
      get markPlot() {
        return markPlot;
      },
      get nestedPoints() {
        return nestedPoints;
      },
      get operatorPoints() {
        return operatorPoints;
      },
      get followPoints() {
        return followPoints;
      },
      raiseMarks: () => {
        marks = { i: [0, 1, 2], v: [10, 10, 10] };
      },
      get fastPlot() {
        return fastPlot;
      },
      get fastPoints() {
        return fastPoints;
      },
      get fastOtherPoints() { return fastOtherPoints; },
      raiseFast: () => {
        fast = { i: [0, 1, 2], v: [10, 10, 10] };
      },
      lowerFast: () => { fast = { i: [0, 1, 2], v: [0, 0, 0] }; },
      get treePlot() {
        return treePlot;
      },
      get treeRect() {
        return treeRect;
      },
      raiseTree: () => {
        treeNodes = { id: [0, 1, 2], weight: [1, 1, 3] };
      },
    };
    return () => {
      delete window.tweenPipeline;
    };
  });
</script>

<Plot
  bind:this={plot}
  data={rows}
  width={320}
  height={200}
  axes2d
  x={{ domain: [-10, 300] }}
  y={{ domain: [-1, 4] }}
>
  <Calculate
    columns={{ h: tween("x", timing), g: multiply(tween("x", timing), 2) }}
  >
    <Probe name="calc" {probes} column="g" />
    <Filter bind:this={filtered} where={[greater("h", 60)]}>
      <Probe name="filter" {probes} />
      <Points x="h" y="y" size={4} />
    </Filter>
    <Bin x="h" bins={[0, 50, 100, 150]} mode="aggregate">
      <Probe name="bins" {probes} column="count" />
    </Bin>
  </Calculate>
</Plot>

<!-- Discrete layout targets; Calculate supplies explicit interval-channel motion. -->
<Plot
  bind:this={treePlot}
  data={{ source: [0, 0], target: [1, 2] }}
  coordinates="polar"
  angleUnit="extent"
  width={320}
  height={240}
  x={{ padding: 0 }}
>
  <GraphData
    nodes={treeNodes}
    edges={{ source: [0, 0], target: [1, 2] }}
    nodeKey="id"
    source="source"
    target="target"
    ><Tree
      root={0}
      directed
      mode="partition"
      orientation="up"
      nodeWidth="weight"
    >
      <Nodes
        ><Filter where={greater(col.depth, 0)}>
          <Calculate
            columns={{
              x0: tween("x0", timing),
              x1: tween("x1", timing),
              y0: tween("y0", timing),
              y1: tween("y1", timing),
            }}
          >
            <Rect
              bind:this={treeRect}
              x0="x0"
              x1="x1"
              y0="y0"
              y1="y1"
              fill="#4368ca"
            />
          </Calculate>
        </Filter></Nodes
      >
    </Tree></GraphData
  >
</Plot>

<Plot
  bind:this={markPlot}
  data={marks}
  width={320}
  height={200}
  axes2d
  x={{ domain: [-1, 5000] }}
  y={{ domain: [-1, 25] }}
>
  <!-- A nested tween on a channel, and a tween column read inside an operator: both exact. -->
  <Points
    bind:this={nestedPoints}
    x="i"
    y={multiply(tween("v", timing), 2)}
    size={4}
  />
  <Calculate columns={{ h: tween("v", timing) }}>
    <Points bind:this={operatorPoints} x="i" y={add("h", "h")} size={4} />
  </Calculate>
  <!-- A tween over @time trails the clock (it was an error before Stage 28). -->
  <Points bind:this={followPoints} x={tween("@time", timing)} y="i" size={4} />
</Plot>

<!-- The producer publishes current columns once; both marks write retained fields. -->
<Plot
  bind:this={fastPlot}
  data={fast}
  width={320}
  height={200}
  axes2d
  x={{ domain: [-1, 3] }}
  y={{ domain: [-1, 22] }}
>
  <Calculate columns={{ h: tween("v", timing) }}>
    <Probe name="fast" {probes} />
    <Points bind:this={fastPoints} x="i" y="h" size={4} />
    <Points bind:this={fastOtherPoints} x="i" y={multiply("h", 2)} size={3} fill="#cc4538" />
  </Calculate>
</Plot>
