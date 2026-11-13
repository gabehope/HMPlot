<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), disk = $state();
  $effect(() => {
    window.stage14MixedChain = { get plot() { return plot; },
      get disk() { return disk; } };
    return () => { delete window.stage14MixedChain; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame coordinates="spherical" projection="orthographic" projectionCenter={[0, 0]}
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Points position={[[45, 0]]} size={11} fill="#168b47" />
    <Points position={[[0, 30]]} size={11} fill="#178c9b" />
    <Frame coordinates="cartesian"
      x={{ domain: [-1, 1], range: [-45, 45], visible: false }}
      y={{ domain: [-1, 1], range: [-30, 30], visible: false }}>
      <Frame bind:this={disk} coordinates="polar" angleUnit="custom" anglePeriod={24}
        x={{ domain: [0, 24], range: [-1, 1], visible: false }}
        y={{ domain: [0, 1], range: [-1, 1], visible: false }}>
        <Points position={[[0, 1]]} size={4.5} fill="#d43735" />
        <Points position={[[6, 1]]} size={4.5} fill="#e69024" />
      </Frame>
    </Frame>
  </Frame>
</Plot>
