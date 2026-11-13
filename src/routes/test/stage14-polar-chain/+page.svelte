<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), chart = $state(), disk = $state(), outerXEnd = $state(16);
  $effect(() => {
    window.stage14PolarChain = {
      get plot() { return plot; }, get chart() { return chart; }, get disk() { return disk; },
      get lastPick() { return window.stage14PolarChainPick; },
      move(value) { outerXEnd = value; },
    };
    return () => { delete window.stage14PolarChain; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame coordinates="cartesian"
    x={{ domain: [0, 16], visible: false }} y={{ domain: [1, 100], visible: false }}>
    <Frame bind:this={chart} coordinates="cartesian"
      x={{ domain: [0, 4], range: [0, outerXEnd], transform: "sqrt", visible: false }}
      y={{ domain: [1, 100], range: [1, 100], transform: "log", visible: false }}>
      <Frame bind:this={disk} coordinates="polar" angleUnit="custom" anglePeriod={24}
        x={{ domain: [0, 24], range: [0, 4], visible: false }}
        y={{ domain: [0, 1], range: [1, 5], visible: false }}>
        <Points position={[[6, 1]]} size={12} fill="#2468a0"
          onclick={(event) => window.stage14PolarChainPick = { axisValue: event.axisValue }} />
      </Frame>
    </Frame>
  </Frame>
</Plot>
