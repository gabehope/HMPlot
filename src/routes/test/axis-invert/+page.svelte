<script>
  // Stage 18.2: an inverted y axis draws the smallest value at the top; ticks, brushing,
  // and nearby follow the same reversed mapping.
  import { onMount } from "svelte";
  import { Plot, Points } from "$lib/index";
  let plot = $state(), points = $state();
  onMount(() => {
    window.invertFixture = { get plot() { return plot; }, get points() { return points; } };
    return () => { delete window.invertFixture; };
  });
  // A low point at y = 10 (should sit near the top) and a high one at y = 90.
  const data = { x: [30, 70], y: [10, 90] };
</script>
<Plot bind:this={plot} data={data} width={500} height={320} axes2d toneMapping={0}
  x={{ domain: [0, 100] }} y={{ domain: [0, 100], invert: true }}>
  <Points bind:this={points} x="x" y="y" size={8} fill="#e0301e" nearby brush />
</Plot>
