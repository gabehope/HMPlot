<script>
  import { Plot, Frame, Points, Data } from "$lib/index";
  let plot = $state(), root = $state(), disk = $state(), xHalf = $state(3);
  $effect(() => {
    window.stage14PolarFit = {
      get plot() { return plot; }, get root() { return root; }, get disk() { return disk; },
      get lastPick() { return window.stage14PolarFitPick; },
      setXHalf(value) { xHalf = value; },
    };
    return () => { delete window.stage14PolarFit; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}>
  <Frame bind:this={root} coordinates="cartesian"
    x={{ domain: [-4, 4], visible: false }} y={{ domain: [-4, 4], visible: false }}>
    <Frame bind:this={disk} coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], range: [-xHalf, xHalf], visible: false }}
      y={{ domain: [0, 1], range: [-2, 2], visible: false }}>
      <Data value={{ x: [0, 6, 12, 18], y: [1, 1, 1, 1] }}>
        <Points x="x" y="y" size={11} fill="#2468a0"
          onclick={(event) => window.stage14PolarFitPick = {
            axisValue: event.axisValue, instanceId: event.instanceId,
          }} />
      </Data>
      <Frame name="inherited polar frame">
        <Points position={[[0, 0.7], [6, 0.7], [12, 0.7], [18, 0.7]]}
          size={7} fill="#23a750" />
      </Frame>
    </Frame>
  </Frame>
</Plot>
