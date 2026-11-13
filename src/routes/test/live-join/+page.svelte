<script>
  // TODO 140: route geometry joined to the live statistics of a brushed Group of flights. Brushing
  // the flights plot changes each route's count, which sizes its point on the routes plot.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Filter, Group, Join, count, mean } from "$lib/index";
  const n = 60;
  const flights = {
    route: Array.from({ length: n }, (_, i) => ["a", "b", "c", "d"][i % 4]),
    delay: Array.from({ length: n }, (_, i) => (i * 13) % 50),
    distance: Array.from({ length: n }, (_, i) => (i * 7) % 30),
  };
  const routes = { route: ["a", "b", "c", "d", "e"], x: [0, 1, 2, 3, 4], y: [0, 0, 0, 0, 0] };
  let stats = $state(), source = $state(), map = $state(), filter = $state();
  onMount(() => {
    window.liveJoin = { get stats() { return stats; }, get source() { return source; }, get map() { return map; }, get filter() { return filter; } };
    return () => { delete window.liveJoin; };
  });
</script>

<Data value={flights}>
  <Plot bind:this={source} width={360} height={240} animation={false}>
    <Points x="delay" y="distance" size={6} brush={true} />
  </Plot>
  <Filter bind:this={filter} where="@brushed" inactive="all">
    <Group bind:this={stats} by="route" columns={{ flights: count(), delay: mean("delay") }} />
  </Filter>
</Data>
<Plot bind:this={map} data={routes} width={360} height={140} animation={false} x={{ domain: [-1, 5] }} y={{ domain: [-1, 1] }}>
  <Join data={stats} on="route" fields={["flights", "delay"]}>
    <Points x="x" y="y" size="flights" fill="#2060c0" />
  </Join>
</Plot>
