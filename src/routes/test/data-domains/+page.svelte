<script>
  // TODO 136.14 slice 4: domains read from the data, extent(column, {where}).
  import { onMount, tick } from "svelte";
  import { Plot, Points, Line, extent, greater, table } from "$lib/index";
  // 40 rows on a 40 x 40 square, shared by the overview (which brushes) and the detail.
  const rows = table({
    x: Array.from({ length: 40 }, (_, i) => i),
    y: Array.from({ length: 40 }, (_, i) => (i * 17) % 40),
  });
  // The same rows by date (a day each from 2024-01-01), for a datetime extent.
  const day = 86400000, start = Date.UTC(2024, 0, 1);
  const dated = { t: rows.x.map((i) => new Date(start + i * day)), y: rows.y };
  let overview = $state(), detail = $state(), matching = $state(), single = $state(), times = $state();
  let seriesPlot = $state(), seriesOffset = $state(0);
  const seriesRows = $derived({
    x: [0, 0, 1, 1, 2, 2, 100],
    y: [seriesOffset, 10, seriesOffset, 10, seriesOffset, 10, 100],
    group: ["a", "b", "a", "b", "a", "b", null],
  });
  onMount(() => {
    window.dataDomains = {
      get overview() { return overview; }, get detail() { return detail; }, get matching() { return matching; },
      get single() { return single; }, get times() { return times; }, day, start,
      get seriesPlot() { return seriesPlot; },
      updateSeries: async () => { seriesOffset = 1; await tick(); },
    };
    return () => { delete window.dataDomains; };
  });
</script>

<div data-fixture="matching">
  <Plot bind:this={matching} data={rows} width={360} height={240} axes2d
    x={{ domain: extent("x", { where: greater("y", 30) }) }}>
    <Points x="x" y="y" size={4} />
  </Plot>
</div>
<div data-fixture="series">
  <Plot bind:this={seriesPlot} data={seriesRows} width={360} height={240} axes2d>
    <Line x="x" y="y" series="group" curve="catmull-rom" color="#cc2222" />
  </Plot>
</div>
<div data-fixture="single">
  <!-- One row has y > 38: a domain of no width, so the axis is automatic. -->
  <Plot bind:this={single} data={rows} width={360} height={240} axes2d
    x={{ domain: extent("x", { where: greater("y", 38) }) }}>
    <Points x="x" y="y" size={4} />
  </Plot>
</div>
<div data-fixture="times">
  <Plot bind:this={times} data={dated} width={360} height={240} axes2d
    x={{ domain: extent("t", { where: greater("y", 30) }) }}>
    <Points x="t" y="y" size={4} />
  </Plot>
</div>
<div data-fixture="overview">
  <Plot bind:this={overview} data={rows} width={360} height={240} axes2d
    x={{ domain: [0, 40] }} y={{ domain: [0, 40] }}>
    <Points x="x" y="y" size={4} brush />
  </Plot>
</div>
<div data-fixture="detail">
  <Plot bind:this={detail} data={rows} width={360} height={240} axes2d
    x={{ domain: extent("x", { where: "@brushed" }) }}>
    <Points x="x" y="y" size={4} />
  </Plot>
</div>
