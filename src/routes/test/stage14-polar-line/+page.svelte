<script>
  import { Plot, Line } from "$lib/index";
  let plot = $state(), period = $state(24);
  $effect(() => {
    window.stage14PolarLine = { get plot() { return plot; }, setPeriod(value) { period = value; } };
    return () => { delete window.stage14PolarLine; };
  });
</script>

<Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={period}
  baseRadius={0} radialScale={1} width={400} height={400}>
  <Line position={[[0, 1], [6, 1], [12, 1]]} color="#13bd4e" width={8} />
</Plot>
