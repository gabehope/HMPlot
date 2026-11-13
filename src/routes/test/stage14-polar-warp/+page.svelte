<script>
  import { Plot, Frame, Points, Data } from "$lib/index";
  const data = { x: [0, 1, 1, 0], y: [0, 0, 1, 1] };
  let plot = $state(), orbit = $state(), inset = $state(), badge = $state(), nonlinear = $state();
  let angleEnd = $state(6);
  let showGuides = $state(false), brushEnabled = $state(false);
  $effect(() => {
    window.stage14PolarWarp = {
      get plot() { return plot; }, get orbit() { return orbit; },
      get inset() { return inset; }, get badge() { return badge; },
      get nonlinear() { return nonlinear; },
      get lastPick() { return window.stage14PolarWarpPick; },
      get lastNonlinearPick() { return window.stage14PolarNonlinearPick; },
      angleEnd(value) { angleEnd = value; },
      guides(value) { showGuides = value; },
      brush(value) { brushEnabled = value; },
    };
    return () => { delete window.stage14PolarWarp; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame bind:this={orbit} coordinates="polar" angleUnit="custom" anglePeriod={24}
    x={{ domain: [0, 24] }} y={{ domain: [0, 3] }}>
    <Frame bind:this={inset} coordinates="cartesian"
      x={{ domain: [0, 1], range: [0, angleEnd], visible: false }}
      y={{ domain: [0, 1], range: [1, 2], visible: false }}>
      <Data value={data}>
        <Points x="x" y="y" size={9} fill="#2468a0"
          onclick={(event) => window.stage14PolarWarpPick = {
            axisValue: event.axisValue, instanceId: event.instanceId,
          }} />
      </Data>
      <Frame bind:this={badge} placement={{ anchor: [0.5, 0.5], size: [28, 28] }}>
        <Points position={[[0, 0]]} size={12} fill="#d07030" />
      </Frame>
    </Frame>
    <Frame bind:this={nonlinear} coordinates="cartesian"
      x={{ domain: [0, 4], range: [12, 18], transform: "sqrt", visible: showGuides }}
      y={{ domain: [1, 100], range: [1, 2], transform: "log", visible: showGuides }}>
      <Data value={{ x: [1], y: [10] }}>
        <Points x="x" y="y" size={11} fill="#2a8753" brush={brushEnabled}
          onclick={(event) => window.stage14PolarNonlinearPick = {
            axisValue: event.axisValue, instanceId: event.instanceId,
          }} />
      </Data>
    </Frame>
  </Frame>
</Plot>
