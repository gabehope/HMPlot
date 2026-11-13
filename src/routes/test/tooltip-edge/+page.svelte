<script>
  import { Plot, Points } from "$lib";
  // A narrow plot with a long tooltip on a point near its right edge (TODO 135.11): the box's
  // shrink-to-fit width depended on the side placement chose, which flipped every frame.
  const data = { x: [0.1, 0.5, 0.92], y: [0.5, 0.5, 0.5],
    name: ["left", "middle", "a sensor named Highlands-06 in the north-east of the region"] };
  let plot = $state();
  $effect(() => { window.tooltipEdge = { get plot() { return plot; } }; });
</script>

<div style="width: 200px">
  <Plot bind:this={plot} {data} width={200} height={160} axes2d={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Points x="x" y="y" size={28} tooltip={["name"]} />
  </Plot>
</div>
