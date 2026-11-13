<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), globe = $state(), inset = $state();
  $effect(() => {
    window.stage14SphericalTangent = {
      get plot() { return plot; }, get globe() { return globe; },
      get inset() { return inset; },
      get lastPick() { return window.stage14SphericalTangentPick; },
    };
    return () => { delete window.stage14SphericalTangent; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame bind:this={globe} coordinates="spherical" projection="orthographic"
    projectionCenter={[0, 30]} x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }}>
    <Frame bind:this={inset} coordinates="cartesian"
      placement={{ anchor: [40, 30], size: [80, 80] }}
      x={{ domain: [-1, 1], visible: false }} y={{ domain: [-1, 1], visible: false }}>
      <Points position={[[0, 0]]} size={11} fill="#2468a0"
        onclick={(event) => window.stage14SphericalTangentPick = { axisValue: event.axisValue }} />
      <Points position={[[1, 0]]} size={11} fill="#cb453a" />
      <Points position={[[0, 1]]} size={11} fill="#2c8b53" />
    </Frame>
  </Frame>
</Plot>
