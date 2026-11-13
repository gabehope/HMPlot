<script>
  import { Plot, Frame, Points, Line, Text, Rect, Data } from "$lib/index";
  const data = { angle: [0, 6, 12, 18], radius: [0.7, 0.7, 0.7, 0.7] };
  let plot = $state(), inset = $state();
  $effect(() => {
    window.stage14PolarInset = {
      get plot() { return plot; }, get inset() { return inset; },
      get lastPick() { return window.stage14PolarInsetPick; },
      get sectorPick() { return window.stage14PolarInsetSectorPick; },
    };
    return () => { delete window.stage14PolarInset; };
  });
</script>

<Plot bind:this={plot} type="2d" width={400} height={400}
  x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Frame bind:this={inset} coordinates="polar" angleUnit="custom" anglePeriod={24}
    placement={{ anchor: [0.5, 0.5], size: [120, 120] }}
    x={{ domain: [0, 24] }} y={{ domain: [0, 1] }}>
    <Line position={[[0, 0.7], [6, 0.7], [12, 0.7]]} color="#13bd4e" width={5} />
    <Rect x0={15} x1={18} y0={0.2} y1={0.5} fill="#b42ca0"
      onclick={(event) => window.stage14PolarInsetSectorPick = {
        axisValue: event.axisValue, instanceId: event.instanceId,
      }} />
    <Text position={[[3, 0.4]]} text={["Dial"]} size={10} color="#4b5563" />
    <Data value={data}>
      <Points x="angle" y="radius" size={9} fill="#2468a0"
        onclick={(event) => window.stage14PolarInsetPick = {
          axisValue: event.axisValue, instanceId: event.instanceId,
        }} />
    </Data>
  </Frame>
</Plot>
