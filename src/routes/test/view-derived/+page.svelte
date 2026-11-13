<script>
  // TODO 136.8: transforms that read the view (a Hexbin radius from the visible span, a Filter to
  // the visible window) take their marks' axis domains from their input, so an idle plot settles.
  import { Plot, Data, Filter, Points, view, divide, subtract, col, greater_equal, less_equal, logical_and } from "$lib/index";
import { Hexbin } from "$lib/stats/index.js";
  const n = 4000;
  const data = {
    x: Float32Array.from({ length: n }, (_, i) => Math.cos(i * 0.37) * (5 + (i % 97) / 10)),
    y: Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.53) * (3 + (i % 89) / 12)),
  };
  let hexbin = $state(), filter = $state(), binned = $state(), windowed = $state();
  const radius = divide(subtract(view.view_x_max, view.view_x_min), 30);
  const inside = logical_and(greater_equal(col.x, view.view_x_min), less_equal(col.x, view.view_x_max));
  $effect(() => {
    window.viewDerived = { hexbin, filter, binned, windowed };
    return () => delete window.viewDerived;
  });
</script>

<Data value={data}>
  <Plot bind:this={binned} height={300}>
    <Hexbin bind:this={hexbin} x="x" y="y" {radius}>
      <Points x="x" y="y" size="count" />
    </Hexbin>
  </Plot>
  <Plot bind:this={windowed} height={300}>
    <Filter bind:this={filter} where={inside}>
      <Points x="x" y="y" size={2} />
    </Filter>
  </Plot>
</Data>
