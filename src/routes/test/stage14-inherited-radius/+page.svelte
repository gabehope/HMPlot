<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), direct = $state(), nested = $state();
  $effect(() => {
    window.stage14InheritedRadius = {
      get plot() { return plot; }, get direct() { return direct; }, get nested() { return nested; },
    };
    return () => { delete window.stage14InheritedRadius; };
  });
</script>

<Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={24}
  baseRadius={1} radialScale={1} type="2d" width={400} height={400} axes2d={false}
  x={{ domain: [0, 24] }} y={{ domain: [0, 1] }}>
  <Points bind:this={direct} position={[[6, 0]]} size={11} fill="#208944" />
  <Frame>
    <Points bind:this={nested} position={[[6, 0]]} size={8} fill="#2468d0" />
  </Frame>
</Plot>
