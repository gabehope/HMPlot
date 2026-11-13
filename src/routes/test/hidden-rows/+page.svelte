<script>
  // TODO 136.18: a transparent row is still a row; a hidden row is not. Rows past x = 6 are
  // transparent in the first plot (an opacity expression) and filtered out in the second.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Filter, where, greater, less_equal, col } from "$lib/index";
  const data = { x: [0, 2, 4, 6, 8, 10], y: [1, 2, 3, 4, 5, 6] };
  let transparent = $state(), hidden = $state();
  onMount(() => {
    window.hiddenRows = { get transparent() { return transparent; }, get hidden() { return hidden; } };
    return () => { delete window.hiddenRows; };
  });
</script>

<Data value={data}>
  <Plot bind:this={transparent} width={300} height={200} animation={false}>
    <Points x="x" y="y" size={8} opacity={where(greater(col.x, 6), 0, 1)} tooltip={["x"]} />
  </Plot>
  <Plot bind:this={hidden} width={300} height={200} animation={false}>
    <Filter where={less_equal(col.x, 6)}><Points x="x" y="y" size={8} tooltip={["x"]} /></Filter>
  </Plot>
</Data>
