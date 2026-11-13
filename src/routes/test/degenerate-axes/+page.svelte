<script>
  import { Plot, Points } from "$lib/index";
  let plot = $state();
  $effect(() => {
    if (plot) window.degenerateAxes = { plot };
    return () => { delete window.degenerateAxes; };
  });
</script>
<!-- A log axis whose domain touches zero has no valid mapping: it draws no ticks. -->
<Plot bind:this={plot} width={600} height={400} axes2d
  x={{ domain: [0, 10], transform: "log" }} y={{ domain: [0, 10] }}>
  <Points position={[[1, 1], [5, 5], [10, 9]]} size={6} fill="#547ba2" />
</Plot>
