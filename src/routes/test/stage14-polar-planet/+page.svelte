<script>
  import { Plot, Frame, Points, Data, Line } from "$lib/index";
  const orbitPath = Array.from({ length: 97 }, (_, index) => [index / 4, 2]);
  let plot = $state(), orbit = $state(), planet = $state();
  let angle = $state(6);
  $effect(() => {
    window.stage14Planet = {
      get plot() { return plot; }, get orbit() { return orbit; },
      get planet() { return planet; }, angle(value) { angle = value; },
      get lastPick() { return window.stage14PlanetPick; },
    };
    return () => { delete window.stage14Planet; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame bind:this={orbit} coordinates="polar" angleUnit="custom" anglePeriod={24}
    x={{ domain: [0, 24] }} y={{ domain: [0, 3] }}>
    <Line position={orbitPath} color="#66758b" width={1.5} />
    <Frame bind:this={planet} coordinates="spherical" projection="orthographic"
      projectionCenter={[0, 0]} placement={{ anchor: [angle, 2], size: [60, 60] }}>
      <Data value={{ longitude: [0], latitude: [0] }}>
        <Points x="longitude" y="latitude" size={10} fill="#d07030"
          onclick={(event) => window.stage14PlanetPick = {
            axisValue: event.axisValue, instanceId: event.instanceId,
          }} />
      </Data>
    </Frame>
  </Frame>
</Plot>
