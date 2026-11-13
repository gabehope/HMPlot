<script>
  // Parallel coordinates with per-field strip brushing: Fold > embedded Facet by the key gives
  // one cell per field over the source rows (like Pairs), so a Shift-drag on a cell's y strip
  // constrains that field, a click selects the observation in every cell, and a connector over
  // the repeated Anchor matches observations without a key (and fades unbrushed ones).
  import { onMount } from "svelte";
  import { Plot, Fold, Facet, Filter, Anchor, Points, Line, connect } from "$lib/index";
  let plot = $state(), facet = $state(), points = $state(), brushed = $state(), lines = $state();
  onMount(() => {
    window.foldBrush = {
      get plot() { return plot; }, get facet() { return facet; }, get points() { return points; },
      get brushed() { return brushed; }, get lines() { return lines; }, data, fields,
    };
    return () => { delete window.foldBrush; };
  });
  const n = 24, fields = ["a", "b", "c"];
  // Three fields on different scales, so each cell has its own y domain.
  const data = {
    id: Array.from({ length: n }, (_, i) => i),
    a: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    b: Array.from({ length: n }, (_, i) => ((i * 53) % 100) * 10),
    c: Array.from({ length: n }, (_, i) => ((i * 71) % 100) / 10),
  };
</script>
<Plot bind:this={plot} {data} width={640} height={360} axes2d>
  <Fold {fields}>
    <Facet bind:this={facet} column="key" scales="free-y" layout="grid">
      <Anchor x={0} y="value" name="values" />
      <Points bind:this={points} x={0} y="value" size={3} fill="#aa5500" brush={{ axis: "y" }} select />
      <!-- Every cell shows the observations, so each cell highlights the same brushed rows. -->
      <Filter where="@brushed">
        <Points bind:this={brushed} x={0} y="value" size={4.5} fill="#00aa00" />
      </Filter>
    </Facet>
    <Line bind:this={lines} connections={connect(facet?.endpoint("values"), { order: "facet" })}
      color="#2a6fdb" width={1} opacity={0.5} respond="brushed" />
  </Fold>
</Plot>
