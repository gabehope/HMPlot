<script>
  // A Calculate of @brushed inside a Facet: each cell's run follows the brush (Stage 116.4).
  // The Filter after it shows the rows whose calculated column is set.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Facet, Calculate, Filter, multiply, greater } from "$lib/index";
  const n = 40;
  const table = {
    x: Array.from({ length: n }, (_, i) => i % 10),
    y: Array.from({ length: n }, (_, i) => Math.floor(i / 10)),
    g: Array.from({ length: n }, (_, i) => (i % 2 ? "b" : "a")),
  };
  let data = $state(), shown = $state();
  onMount(() => {
    window.facetCalculate = { get data() { return data; }, get shown() { return shown; } };
    return () => { delete window.facetCalculate; };
  });
</script>

<Data bind:this={data} value={table}>
  <Plot width={520} height={240} axes2d>
    <Facet column="g" layout="grid">
      <Calculate columns={{ hit: multiply("@brushed", 1) }}>
        <Filter where={greater("hit", 0)}>
          <Points bind:this={shown} x="x" y="y" size={4} />
        </Filter>
      </Calculate>
    </Facet>
  </Plot>
</Data>
