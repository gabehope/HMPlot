<script>
  // Nearby fixtures: an overplotted cluster, a single-axis band in data units, and a child frame.
  import { onMount } from "svelte";
  import { Plot, Frame, Facet, Points, where, multiply, col, selection } from "$lib/index";
  let cluster = $state(), clusterPoints = $state(), band = $state(), bandPoints = $state(), framed = $state(), framedPoints = $state();
  let feedback = $state(), feedbackPoints = $state(), explicit = $state(), explicitPoints = $state();
  let clicky = $state(), clickyPoints = $state(), faceted = $state(), facet = $state(), clicks = $state(0);
  let logband = $state(), logbandPoints = $state();
  onMount(() => {
    window.nearbyFixture = {
      get cluster() { return cluster; }, get clusterPoints() { return clusterPoints; },
      get band() { return band; }, get bandPoints() { return bandPoints; },
      get framed() { return framed; }, get framedPoints() { return framedPoints; },
      get feedback() { return feedback; }, get feedbackPoints() { return feedbackPoints; },
      get explicit() { return explicit; }, get explicitPoints() { return explicitPoints; }, pointer,
      get clicky() { return clicky; }, get clickyPoints() { return clickyPoints; }, get clicks() { return clicks; },
      get faceted() { return faceted; }, get facet() { return facet; },
      get logband() { return logband; }, get logbandPoints() { return logbandPoints; },
    };
    return () => { delete window.nearbyFixture; };
  });
  // 50 points stacked exactly at (50, 50) plus four far away.
  const stacked = { x: [...Array(50).fill(50), 5, 95, 5, 95], y: [...Array(50).fill(50), 5, 5, 95, 95] };
  // A vertical column at x = 30 and another at x = 70.
  const columns = { x: [...Array(10).fill(30), ...Array(10).fill(70)], y: [...Array(20).keys()].map((i) => (i % 10) * 10 + 5) };
  // Four large red points in a row, as in the opacity fixture, for on-screen feedback.
  const spots = { x: [10, 20, 30, 40], y: [15, 15, 15, 15] };
  // An explicit resource passed to nearby instead of the data-owned one. Its mark also takes
  // opacity from an expression, which composes feedback through the general (multi-mask) path.
  const pointer = selection(), faded = { ...spots, alpha: [1, 1, 1, 1] };
  // Two facet cells, each with 10 rows stacked at (50, 50) of its own frame.
  const cells = { g: [...Array(10).fill("a"), ...Array(10).fill("b")], x: Array(20).fill(50), y: Array(20).fill(50) };
  // Columns at x = 10 and x = 100 on a log axis; a data radius of log 2 reaches a factor of 2.
  const decades = { x: [...Array(10).fill(10), ...Array(10).fill(100)], y: [...Array(20).keys()].map((i) => (i % 10) * 10 + 5) };
</script>
<Plot bind:this={cluster} data={stacked} width={500} height={320} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points bind:this={clusterPoints} x="x" y="y" nearby size={where("@nearby", 7, 3)} />
</Plot>
<Plot bind:this={band} data={columns} width={500} height={320} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points bind:this={bandPoints} x="x" y="y" nearby={{axis: "x", units: "data", radius: 5}} />
</Plot>
<Plot bind:this={framed} data={stacked} width={500} height={320} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Frame x={{domain: [0, 100], range: [50, 100]}} y={{domain: [0, 100], range: [0, 100]}}>
    <Points bind:this={framedPoints} x="x" y="y" nearby />
  </Frame>
</Plot>
<Plot bind:this={feedback} data={spots} width={500} height={300} axes2d x={{domain: [0, 50]}} y={{domain: [0, 50]}}>
  <Points bind:this={feedbackPoints} x="x" y="y" size={20} fill="#ff0000" nearby />
</Plot>
<Plot bind:this={explicit} data={faded} width={500} height={300} axes2d x={{domain: [0, 50]}} y={{domain: [0, 50]}}>
  <Points bind:this={explicitPoints} x="x" y="y" size={20} fill="#ff0000" opacity={multiply(col("alpha"), 1)} nearby={{selection: pointer}} />
</Plot>
<Plot bind:this={clicky} data={stacked} width={500} height={320} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points bind:this={clickyPoints} x="x" y="y" nearby onclick={() => clicks++} />
</Plot>
<Plot bind:this={faceted} data={cells} width={500} height={320} axes2d y={{domain: [0, 100]}}>
  <Facet bind:this={facet} column="g" scales="shared">
    <Points x="x" y="y" nearby />
  </Facet>
</Plot>
<Plot bind:this={logband} data={decades} width={500} height={320} axes2d x={{domain: [1, 1000], transform: "log"}} y={{domain: [0, 100]}}>
  <Points bind:this={logbandPoints} x="x" y="y" nearby={{axis: "x", units: "data", radius: Math.log(2)}} />
</Plot>
