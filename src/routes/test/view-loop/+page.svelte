<script>
  // TODO 136.8: a cycle the domain-from-input rule cannot break: a column computed from the view
  // sets the domain that moves the view. Settling names it instead of waiting forever.
  import { Plot, Data, Calculate, Points, view, add, col } from "$lib/index";
  const n = 200;
  const data = { x: Float32Array.from({ length: n }, (_, i) => i / 10), y: Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7)) };
  let plot = $state(), calculate = $state();
  $effect(() => {
    window.viewLoop = { plot, calculate };
    return () => delete window.viewLoop;
  });
</script>

<Data value={data}>
  <Plot bind:this={plot} height={300}>
    <Calculate bind:this={calculate} columns={{ shifted: add(col.x, view.view_x_max) }}>
      <Points x="shifted" y="y" size={3} />
    </Calculate>
  </Plot>
</Data>
