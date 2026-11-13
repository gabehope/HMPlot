<script>
  // Stage 100: matched current-column workloads, with no probe readbacks in the flight.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Plot, Calculate, Points, GraphData, Tree, Nodes, Rect, tween, multiply } from "$lib/index";
  const tree = page.url.searchParams.get("case") === "tree";
  const count = tree ? 127 : 10000;
  const id = Array.from({ length: count }, (_, i) => i);
  const low = { id, value: id.map(() => tree ? 1 : 0) };
  const high = { id, value: id.map(i => tree ? (i % 2 ? 3 : 1) : 10) };
  const edges = { source: id.slice(1).map(i => Math.floor((i - 1) / 2)), target: id.slice(1) };
  let rows = $state.raw(low), plot = $state(), first = $state(), second = $state();
  const timing = { duration: 1000, easing: "linear" };
  onMount(() => {
    window.tweenCurrent = {
      get plot() { return plot; }, get marks() { return [first, second].filter(Boolean); },
      raise: () => { rows = high; }, lower: () => { rows = low; },
      count, tree,
    };
    return () => { delete window.tweenCurrent; };
  });
</script>

{#if tree}
  <Plot bind:this={plot} width={680} height={440} x={{ domain: [0, 130] }} y={{ domain: [0, 8] }}>
    <GraphData nodes={rows} {edges} nodeKey="id" source="source" target="target">
      <Nodes>
        <Calculate columns={{ weight: tween("value", timing) }}>
          <Tree root={0} directed mode="partition" orientation="up" nodeWidth="weight">
            <Nodes><Rect bind:this={first} x0="x0" x1="x1" y0="y0" y1="y1" fill="#4368ca" /></Nodes>
          </Tree>
        </Calculate>
      </Nodes>
    </GraphData>
  </Plot>
{:else}
  <Plot bind:this={plot} data={rows} width={680} height={440} x={{ domain: [-1, count] }} y={{ domain: [-1, 22] }}>
    <Calculate columns={{ moving: tween("value", timing) }}>
      <Points bind:this={first} x="id" y="moving" size={2} fill="#4368ca" />
      <Points bind:this={second} x="id" y={multiply("moving", 2)} size={2} fill="#cc4538" />
    </Calculate>
  </Plot>
{/if}
