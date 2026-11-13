<script>
  // TODO 145.6: skills/hmplot/svelte.md's linked-views program, as written there, with data.
  import { onMount } from "svelte";
  import { Data, Filter, Group, Join, Plot, Segments, Title, TableView, Sort, count, mean } from "$lib/index";
  import { Histogram } from "$lib/charts/index";
  const names = ["a", "b", "c", "d"];
  const n = 400;
  const flights = {
    route: Array.from({ length: n }, (_, i) => names[i % 4]),
    dep_hour: Array.from({ length: n }, (_, i) => (i * 7) % 24),
    delay: Array.from({ length: n }, (_, i) => ((i * 13) % 50) - 10),
  };
  const routes = { route: names, start: names.map((_, i) => [i, 0]), end: names.map((_, i) => [i, 1]) };
  let stats = $state(), hours = $state(), map = $state();
  onMount(() => {
    window.linkedViews = { get stats() { return stats; }, get hours() { return hours; }, get map() { return map; } };
    return () => { delete window.linkedViews; };
  });
</script>

<Data value={flights}>
  <!-- A plain drag brushes (interactive="brush"); the Filter keeps the brushed rows. -->
  <Plot bind:this={hours} interactive="brush" width={480} height={220} animation={false}><Histogram x="dep_hour" bins={24} brush={{ axis: "x" }} /></Plot>
  <Filter where="@brushed" inactive="all">
    <!-- Its kept rows: every row until a brush, then the brushed ones. -->
    <Title text={["Flights: ", count()]} name="flights-count" />
    <!-- Statistics of the brushed rows, for marks anywhere (bind:this, then a reference). -->
    <Group bind:this={stats} by="route" columns={{ flights: count(), delay: mean("delay") }}>
      <Sort by="flights" order="desc"><TableView name="routes" columns={["route", "flights"]} limit={10} /></Sort>
    </Group>
  </Filter>
</Data>
{#if stats}
  <Plot bind:this={map} data={routes} width={480} height={220} animation={false} x={{ domain: [-1, 4] }} y={{ domain: [-0.5, 1.5] }}>
    <Join data={stats} on="route" fields={["flights", "delay"]}>
      <Segments start="start" end="end" width="flights" color="delay" />
    </Join>
  </Plot>
{/if}
