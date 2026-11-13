<script>
  // TODO 145.5: which drag brushes. interactive="brush": a plain drag brushes and Shift-drag
  // pans; the default: a plain drag pans and Shift-drag brushes; false: a plain drag brushes.
  import { onMount } from "svelte";
  import { Plot, Points } from "$lib/index";
  const data = { x: Array.from({ length: 40 }, (_, i) => (i % 10) + 0.5), y: Array.from({ length: 40 }, (_, i) => Math.floor(i / 10) + 0.5) };
  const plots = $state({});
  onMount(() => {
    window.brushDefault = plots;
    return () => { delete window.brushDefault; };
  });
</script>

{#each [["brush", "brush"], ["pan", true], ["still", false]] as [key, interactive]}
  <Plot bind:this={plots[key]} {data} {interactive} width={480} height={240} axes2d animation={false}
    x={{ domain: [0, 10] }} y={{ domain: [0, 4] }}>
    <Points x="x" y="y" size={6} fill="#4a6f8f" brush respond="brushed" />
  </Plot>
{/each}
