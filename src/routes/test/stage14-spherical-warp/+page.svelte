<script>
  import { Plot, Frame, Points, Data } from "$lib/index";
  const data = { x: [0, 1, 1, 0], y: [0, 0, 1, 1] };
  let plot = $state(), globe = $state(), inset = $state(), badge = $state();
  $effect(() => {
    window.stage14SphericalWarp = {
      get plot() { return plot; }, get globe() { return globe; },
      get inset() { return inset; }, get badge() { return badge; },
      get lastPick() { return window.stage14SphericalWarpPick; },
    };
    return () => { delete window.stage14SphericalWarp; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame bind:this={globe} coordinates="spherical" projection="orthographic"
    projectionCenter={[30, 0]} x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }}>
    <Frame bind:this={inset} coordinates="cartesian"
      x={{ domain: [0, 1], range: [0, 60] }}
      y={{ domain: [0, 1], range: [-20, 20] }}>
      <Data value={data}>
        <Points x="x" y="y" size={8.5} fill="#2468a0"
          onclick={(event) => window.stage14SphericalWarpPick = {
            axisValue: event.axisValue, instanceId: event.instanceId,
          }} />
      </Data>
      <Frame bind:this={badge} placement={{ anchor: [0.5, 0.5], size: [30, 30] }}>
        <Points position={[[0, 0]]} size={12} fill="#d07030" />
      </Frame>
    </Frame>
    <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [170, 190] }}
      y={{ domain: [0, 1], range: [-10, 10] }}>
      <Points position={[[0.5, 0.5]]} size={12.5} fill="#cf3030" />
    </Frame>
  </Frame>
</Plot>
