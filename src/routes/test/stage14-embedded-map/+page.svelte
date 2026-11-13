<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), map = $state();
  $effect(() => {
    window.stage14EmbeddedMap = { get plot() { return plot; }, get map() { return map; } };
    return () => { delete window.stage14EmbeddedMap; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
  x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Frame bind:this={map} coordinates="spherical" projection="equirectangular"
    placement={{ anchor: [0.5, 0.5], size: [180, 120] }}
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Points position={[[0, 0]]} size={11} fill="#2468d0" />
  </Frame>
</Plot>
