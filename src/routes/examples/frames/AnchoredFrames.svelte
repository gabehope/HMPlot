<script>
  import { untrack } from "svelte";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  import { Plot, Frame, Points } from "$lib";
</script>
<Plot bind:this={plot} responsive height={420} axes2d x={{domain:[0,100]}} y={{domain:[0,100]}}>
  <Frame placement={{anchor:[35,65], size:[160,100], rotation:[0,0,20]}}
    x={{domain:[0,10]}} y={{domain:[0,10]}}>
    <Points position={[[0,0],[5,5],[10,10]]} size={6} fill="#7b9865" />
  </Frame>
</Plot>
