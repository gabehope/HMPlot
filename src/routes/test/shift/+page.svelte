<script>
  import { onMount } from "svelte";
  import { Plot, Shift, Line } from "$lib";
  let plot, shift;
  const data = { day: [1, 2, 3, 4], value: [1, 3, 2, 4] };
  onMount(() => { window.shiftTest = { get plot() { return plot; }, get shift() { return shift; } }; });
</script>
<Plot bind:this={plot} {data} width={500} height={350} x={{domain:[0,6]}} y={{domain:[0,5]}}>
  <Shift bind:this={shift} field="day" interval={1}>
    <Line x="original" y="value" color="#2468a0" />
    <Line x="shifted" y="value" color="#d34b37" />
  </Shift>
</Plot>
