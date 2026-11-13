<script>
  // TODO 145.3: a drillable Treemap. root reads an input a Select sets; levels={1} shows the
  // root's children only; depth counts from root and total is each node's summed value.
  import { onMount } from "svelte";
  import { Plot, GraphData, Treemap, Nodes, Rect, InputContext, Select, input } from "$lib/index";
  import { inspect } from "$lib/check";
  // 2026-10-22: a read with a default resolves before any writer mounts (the Rects inside the
  // Treemap are its only writers), and a layout's error reaches the checker from inside a Plot.
  const inner = input("inner", { default: "a" });
  const data = { source: ["root", "root", "a", "a", "a", "b", "b"], target: ["a", "b", "a1", "a2", "a3", "b1", "b2"] };
  const nodes = { id: ["root", "a", "b", "a1", "a2", "a3", "b1", "b2"], weight: [0, 0, 0, 1, 2, 3, 4, 4] };
  let drill = $state(), whole = $state(), level = $state(), all = $state(), select = $state(), self = $state(), selfNodes = $state(), broken = $state(), brokenRoot = $state("root");
  onMount(() => {
    window.treemapDrill = {
      get drill() { return drill; }, get whole() { return whole; },
      get level() { return level; }, get all() { return all; }, get select() { return select; },
      get self() { return self; }, get selfNodes() { return selfNodes; }, get broken() { return broken; }, inspect,
      breakRoot: () => (brokenRoot = "nowhere"),
    };
    return () => { delete window.treemapDrill; };
  });
</script>

<InputContext>
  <Select bind:this={select} name="root" options={["root", "a", "b"]} />
  <Plot bind:this={drill} width={360} height={240} animation={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <GraphData {nodes} edges={data} source="source" target="target">
      <Treemap root={input("root")} value="weight" levels={1}>
        <Nodes bind:this={level}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#4a6f8f" /></Nodes>
      </Treemap>
    </GraphData>
  </Plot>
  <Plot bind:this={whole} width={360} height={240} animation={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <GraphData {nodes} edges={data} source="source" target="target">
      <Treemap root="root" value="weight">
        <Nodes bind:this={all}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#8f6f4a" /></Nodes>
      </Treemap>
    </GraphData>
  </Plot>
  <Plot bind:this={self} width={360} height={240} animation={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <GraphData {nodes} edges={data} source="source" target="target">
      <Treemap root={inner} value="weight" levels={1}>
        <Nodes bind:this={selfNodes}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#4a6f8f" select={inner.set("id")} /></Nodes>
      </Treemap>
    </GraphData>
  </Plot>
  <Plot bind:this={broken} width={360} height={240} animation={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <GraphData {nodes} edges={data} source="source" target="target">
      <Treemap root={brokenRoot} value="weight">
        <Nodes><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#4a6f8f" /></Nodes>
      </Treemap>
    </GraphData>
  </Plot>
</InputContext>
