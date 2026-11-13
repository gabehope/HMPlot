<script>
  // TODO 145.2: inputs a click or a hover writes. A treemap drills on click (select writes
  // "root", which a Select of that name also shows and edits); a hover writes "focus", which
  // another plot reads; a hover writing an input a Filter above it reads is refused; writers of
  // one input from columns of different kinds are refused.
  import { onMount } from "svelte";
  import { Plot, Data, Filter, GraphData, Treemap, Nodes, Rect, Points, GeoJSON, InputContext, Select, input, equal, where } from "$lib/index";
  const edges = { source: ["root", "root", "a", "a", "a", "b", "b"], target: ["a", "b", "a1", "a2", "a3", "b1", "b2"] };
  const nodes = { id: ["root", "a", "b", "a1", "a2", "a3", "b1", "b2"], weight: [0, 0, 0, 1, 2, 3, 4, 4] };
  const points = { x: [1, 2, 3, 4, 5, 6], y: [1, 2, 1, 2, 1, 2], series: ["p", "p", "q", "q", "r", "r"], code: [1, 1, 2, 2, 3, 3] };
  const square = (name, x) => ({ type: "Feature", properties: { name }, geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  const districts = { type: "FeatureCollection", features: [square("west", 0), square("east", 2)] };
  let context = $state(), select = $state(), drill = $state(), level = $state(), hover = $state(), echo = $state(), loop = $state(), clash = $state(), map = $state();
  onMount(() => {
    window.inputWriters = {
      get context() { return context; }, get select() { return select; }, get drill() { return drill; },
      get level() { return level; }, get hover() { return hover; }, get echo() { return echo; },
      get loop() { return loop; }, get clash() { return clash; }, get map() { return map; },
    };
    return () => { delete window.inputWriters; };
  });
</script>

<InputContext bind:this={context}>
  <Select bind:this={select} name="root" options={["root", "a", "b"]} />
  <Plot bind:this={drill} width={360} height={220} animation={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <GraphData {nodes} {edges} source="source" target="target">
      <Treemap root={input("root")} value="weight" levels={1} padding={0.02}>
        <Nodes bind:this={level}>
          <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#4a6f8f" select={{ input: "root", column: "id", default: "root" }} />
        </Nodes>
      </Treemap>
    </GraphData>
  </Plot>
  <Plot bind:this={hover} data={points} width={360} height={220} animation={false} x={{ domain: [0, 7] }} y={{ domain: [0, 3] }}>
    <Points x="x" y="y" size={14} fill="#8f6f4a" hover={{ input: "focus", column: "series" }} />
  </Plot>
  <Plot bind:this={echo} data={points} width={360} height={220} animation={false} x={{ domain: [0, 7] }} y={{ domain: [0, 3] }}>
    <Points x="x" y="y" size={10} fill="#444444" opacity={where(equal("series", input("focus")), 1, 0.2)} />
  </Plot>
  <Plot bind:this={map} width={360} height={160} animation={false} x={{ domain: [0, 3] }} y={{ domain: [0, 1] }}>
    <GeoJSON data={districts} fill="#6a8f4a" select={{ input: "district", column: "name" }} />
  </Plot>
  <Select name="chosen" options={["p", "q", "r"]} />
  <Data value={points}>
    <Filter where={equal("series", input("chosen"))} inactive="all">
      <Plot bind:this={loop} width={360} height={160} animation={false}>
        <Points x="x" y="y" hover={{ input: "chosen", column: "series" }} />
      </Plot>
    </Filter>
  </Data>
  <Plot bind:this={clash} data={points} width={360} height={160} animation={false}>
    <Points x="x" y="y" select={{ input: "pick", column: "series" }} />
    <Points x="x" y="y" select={{ input: "pick", column: "code" }} />
  </Plot>
</InputContext>
