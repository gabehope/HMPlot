<script>
  import { Plot, Line } from "$lib/index";
  let plot = $state();
  $effect(() => {
    window.stage14OrthographicCurves = { get plot() { return plot; } };
    return () => { delete window.stage14OrthographicCurves; };
  });
</script>

<Plot bind:this={plot} coordinates="spherical" projection="orthographic"
  projectionCenter={[60, 0]} width={400} height={400}>
  <Line position={[[60, -30], [60, 0], [60, 30]]} color="#13bd4e" width={8} />
</Plot>
