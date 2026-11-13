<script>
  import { untrack } from "svelte";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  import { Plot, Frame, Points, Line } from "$lib";
  const positions = [[0, 0], [50, 50], [100, 100]];
</script>
<Plot bind:this={plot} responsive height={420} axes2d
  x={{domain:[1,1000], transform:"log"}} y={{domain:[0,100]}}>
  <Frame x={{domain:[0,100], range:[10,100]}}
    y={{domain:[0,100], range:[20,80]}}>
    <Line position={positions} color="#547ba2" width={2} />
    <Points position={positions} fill="#7b9865" size={6} />
  </Frame>
</Plot>
