<script>
  import { Plot, Frame, Points, Data } from "$lib/index";
  let plot = $state(), globe = $state(), xHalf = $state(3), center = $state(0);
  $effect(() => {
    window.stage14SphericalFit = {
      get plot() { return plot; }, get globe() { return globe; },
      get lastPick() { return window.stage14SphericalFitPick; },
      setXHalf(value) { xHalf = value; }, setCenter(value) { center = value; },
    };
    return () => { delete window.stage14SphericalFit; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame coordinates="cartesian"
    x={{ domain: [-4, 4], visible: false }} y={{ domain: [-4, 4], visible: false }}>
    <Frame bind:this={globe} coordinates="spherical" projection="orthographic"
      projectionCenter={[center, 0]} radialScale={0}
      x={{ domain: [-180, 180], range: [-xHalf, xHalf], visible: false }}
      y={{ domain: [-90, 90], range: [-2, 2], visible: false }}>
      <Data value={{ x: [45, 0, -45, 0], y: [0, 45, 0, -45] }}>
        <Points x="x" y="y" size={11} fill="#2468a0"
          onclick={(event) => window.stage14SphericalFitPick = {
            axisValue: event.axisValue, instanceId: event.instanceId,
          }} />
      </Data>
      <Points position={[[180, 0]]} size={11} fill="#cb453a" />
    </Frame>
  </Frame>
</Plot>
