<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), inset = $state(), longitude = $state(0);
  $effect(() => {
    window.stage14GlobeTangent = {
      get plot() { return plot; }, get inset() { return inset; },
      move(value) { longitude = value; },
    };
    return () => { delete window.stage14GlobeTangent; };
  });
</script>

<Plot bind:this={plot} type="3d" width={400} height={400}
  coordinates="spherical" sphericalView="globe"
  cameraPosition={[0, 0, 5]} cameraTarget={[0, 0, 0]} cameraUp={[0, 1, 0]}
  axes3d={false} background="#ffffff">
  <Frame bind:this={inset} coordinates="cartesian"
    placement={{ anchor: [longitude, 0, 0], size: [1, 1, 1] }}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }} z={{ domain: [-1, 1] }}>
    <Points position={[[0, 0, 0]]} size={11} fill="#2468a0" />
    <Points position={[[1, 0, 0]]} size={11} fill="#cb453a" />
    <Points position={[[0, 1, 0]]} size={11} fill="#2c8b53" />
  </Frame>
</Plot>
