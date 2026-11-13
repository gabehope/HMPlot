<script>
  // TODO 136.17: one stacked and one grouped bar scene, each drawn three times and remounted on
  // demand. Their legend strip takes height from the canvas after the first solve; every draw
  // of a scene must land on the same gutters (one came out 2 or 6 px wider).
  import { onMount } from "svelte";
  import { Plot } from "$lib/index";
  import { Bar } from "$lib/charts/index.js";
  const data = {
    region: ["North", "North", "South", "South", "West", "West"],
    year: ["2024", "2025", "2024", "2025", "2024", "2025"],
    sales: [12, 18, 9, 15, 21, 25],
  };
  const COUNT = 6;
  let plots = $state([]), generation = $state(0);
  onMount(() => {
    window.barGutters = {
      get plots() { return plots.slice(0, COUNT); },
      remount() { generation++; },
    };
    return () => { delete window.barGutters; };
  });
</script>

{#key generation}
  {#each Array.from({ length: COUNT }, (_, i) => i) as i (i)}
    <Plot bind:this={plots[i]} {data} width={480} height={320} animation={false}>
      <Bar x="region" y="sales" fill="year" arrange={i % 2 ? "group" : undefined} />
    </Plot>
  {/each}
{/key}
