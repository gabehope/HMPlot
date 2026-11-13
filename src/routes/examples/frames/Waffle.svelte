<script>
  import { untrack } from "svelte";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  import { Plot, Dodge, Points } from "$lib";
  const data = { category: ["A", "B", "C"], count: [23, 35, 42] };
</script>
<Plot bind:this={plot} {data} responsive height={420} x={{domain:[0,10]}} y={{domain:[0,10]}}>
  <Dodge mode="grid" columns={10} count="count">
    <Points x="x" y="y" fill="category" shape="square" size={12} />
  </Dodge>
</Plot>
