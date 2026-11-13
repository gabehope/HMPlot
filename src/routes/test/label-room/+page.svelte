<script>
  // Label room as pixels, not domain (TODO 136.15): long labels at the data's ends get room inside
  // the plot area, and the domain stays the data's.
  import { onMount } from "svelte";
  import { Plot, Points, Text } from "$lib/index";
  const rows = { x: [0, 5, 7.5, 10], y: [0, 5, 2, 10], label: ["start", "middle", "", "a much longer label at the end"] };
  // TODO 136.17: an automatic scatter's axes round out to ticks past its data.
  const scatter = { x: [2.1, 15, 33, 47.3], y: [-3.2, 1, 6, 8.7] };
  let plot = $state(), nice = $state();
  onMount(() => {
    window.labelRoom = { get plot() { return plot; }, get nice() { return nice; } };
    return () => { delete window.labelRoom; };
  });
</script>

<div data-fixture="labels"><Plot bind:this={plot} data={rows} width={400} height={300} axes2d>
  <Points x="x" y="y" hover size={10} />
  <Text x="x" y="y" text="label" dx={70} />
</Plot></div>
<div data-fixture="nice"><Plot bind:this={nice} data={scatter} width={400} height={300} axes2d>
  <Points x="x" y="y" />
</Plot></div>
