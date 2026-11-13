<script>
  import { Plot, Frame, Points } from "$lib/index";
  const data = { angle: [0, 6, 12, 18], radius: [2, 2, 2, 2] };
  const extentData = { angle: [6, 12, 18, 24], radius: [2, 2, 2, 2] };
  let shorthand = $state(), explicit = $state(), extent = $state(), root = $state(), points = $state();
  let xDomain = $state([0, 24]);
  let brushEnabled = $state(false);
  $effect(() => {
    window.stage14Polar = {
      get shorthand() { return shorthand; },
      get explicit() { return explicit; },
      get extent() { return extent; },
      get root() { return root; },
      get points() { return points; },
      get lastPick() { return window.stage14PolarPick; },
      setDomain(value) { xDomain = value; },
      brush(value) { brushEnabled = value; },
    };
    return () => { delete window.stage14Polar; };
  });
</script>

<Plot bind:this={shorthand} {data} coordinates="polar" angleUnit="custom" anglePeriod={24}
  type="2d" width={400} height={400} y={{ domain: [0, 3] }}>
  <Points x="angle" y="radius" size={9} fill="#2468a0" />
</Plot>

<Plot bind:this={explicit} {data} type="2d" width={400} height={400}>
  <Frame bind:this={root} coordinates="polar" angleUnit="custom" anglePeriod={24}
    x={{ domain: xDomain }} y={{ domain: [0, 3] }}>
    <Points bind:this={points} x="angle" y="radius" size={9} fill="#2468a0" brush={brushEnabled}
      onclick={(event) => window.stage14PolarPick = {
        axisValue: event.axisValue, instanceId: event.instanceId,
      }} />
  </Frame>
</Plot>

<Plot bind:this={extent} data={extentData} coordinates="polar" angleUnit="extent"
  type="2d" width={400} height={400} x={{ domain: [6, 30] }} y={{ domain: [0, 3] }}>
  <Points x="angle" y="radius" size={9} fill="#2468a0" />
</Plot>
