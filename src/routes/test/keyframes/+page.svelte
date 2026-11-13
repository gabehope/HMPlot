<script>
  // TODO 136.14b: keyframes over the view clock, read at frozen times: a size that grows, a
  // staggered per-row opacity, and an x from a looping list of positions.
  import { onMount } from "svelte";
  import { Plot, Points, keyframes, view, row, subtract, multiply } from "$lib/index";
  const data = { x: [1, 2, 3], y: [1, 1, 1] };
  let plot = $state();
  onMount(() => {
    window.keyframesPage = { get plot() { return plot; } };
    return () => { delete window.keyframesPage; };
  });
</script>

<Plot bind:this={plot} {data} width={360} height={160} animation={false} x={{ domain: [0, 4] }} y={{ domain: [0, 2] }}>
  <Points x="x" y="y" fill="#2a6f97"
    size={keyframes({ 0: 4, 1000: 20 })}
    opacity={keyframes({ 0: 0.2, 400: 1 }, { time: subtract(view.time, multiply(row(), 200)) })} />
</Plot>
