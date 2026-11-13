<script>
  import { onMount } from "svelte";
  import { Data, Plot, Points, selection, count } from "$lib/index";
  import Transform from "$lib/plot/transform.svelte";
  import { Histogram } from "$lib/charts";
  const n = 200000;
  const data = {
    origin: Int32Array.from({ length: n }, (_, i) => i % 40),
    lon: Float32Array.from({ length: n }, (_, i) => (i % 8) * 6),
    lat: Float32Array.from(
      { length: n },
      (_, i) => Math.floor((i % 40) / 8) * 5,
    ),
    delay: Float32Array.from({ length: n }, (_, i) => (i % 40) * 2),
  };
  const airports = selection(),
    delays = selection();
  let map = $state(),
    histogram = $state(),
    points = $state(),
    group = $state(),
    filter = $state();
  onMount(() => {
    window.groupedLocations = {
      airports,
      delays,
      get map() {
        return map;
      },
      get histogram() {
        return histogram;
      },
      get points() {
        return points;
      },
      get group() {
        return group;
      },
      get filter() {
        return filter;
      },
    };
    return () => {
      delete window.groupedLocations;
    };
  });
</script>

<Data value={data}>
  <Plot
    bind:this={map}
    width={640}
    height={340}
    animation={false}
    x={{ domain: [-3, 45], padding: 0 }}
    y={{ domain: [-3, 23], padding: 0 }}
  >
    <Transform
      kind="Group"
      bind:this={group}
      by={["origin", "lon", "lat"]}
      columns={{ flights: count() }}
    >
      <Points
        bind:this={points}
        x="lon"
        y="lat"
        size={12}
        fill="#c00000"
        brush={{ selection: airports }}
        respond={[airports, delays]}
        tooltip={["origin", "flights"]}
      />
    </Transform>
  </Plot>
  <Plot bind:this={histogram} width={640} height={260} animation={false}>
    <Transform
      kind="Filter"
      bind:this={filter}
      where={[airports]}
      inactive="all"
    >
      <Histogram x="delay" bins={20} brush={{ selection: delays }} />
    </Transform>
  </Plot>
</Data>
