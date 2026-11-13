<script>
  // Stage 17 fixture: the interaction dashboard's hover label on its own. Hovering a point
  // highlights it; a Filter on @hovered feeds a Label that names the hovered row.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Filter, Text, where } from "$lib/index";
  let plot = $state(), points = $state(), label = $state();
  const records = Array.from({ length: 1024 }, (_, i) => ({
    id: `row-${i}`,
    x: 0.08 + 0.84 * ((i * 37) % 997) / 996,
    y: 0.5 + 0.38 * Math.sin(i * 0.71),
  }));
  onMount(() => {
    window.labelHover = { get plot() { return plot; }, get points() { return points; }, get label() { return label; } };
    return () => { delete window.labelHover; };
  });
</script>

<Data value={records} key="id">
  <Plot bind:this={plot} width={600} height={400} axes2d toneMapping={0} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Points bind:this={points} x="x" y="y" size={where("@hovered", 11, 6)} fill="#547ba2" hover respond="hovered" />
    <Filter where="@hovered" inactive="none"><Text bind:this={label} x="x" y="y" text="id" size={12} dy={-16} /></Filter>
  </Plot>
</Data>
