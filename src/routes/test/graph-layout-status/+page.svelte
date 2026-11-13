<script>
  import { onMount, tick } from "svelte";
  import { GraphData, DAG, Nodes, Plot, Points } from "$lib/index";
  const nodes = { id: ["A", "B", "C"] };
  let edges = $state({ source: ["A", "B"], target: ["B", "C"] }),
    dag = $state(),
    plot = $state();
  onMount(() => {
    window.graphLayoutFixture = {
      get dag() {
        return dag;
      },
      get plot() {
        return plot;
      },
      async set(next) {
        edges = next;
        await tick();
      },
    };
    return () => delete window.graphLayoutFixture;
  });
</script>

<Plot bind:this={plot} width={320} height={240}>
  <GraphData {nodes} {edges} nodeKey="id" source="source" target="target">
    <DAG bind:this={dag}>
      <Nodes><Points position="position" size={8} fill="#2468a0" /></Nodes>
    </DAG>
  </GraphData>
</Plot>
