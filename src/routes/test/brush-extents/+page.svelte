<script>
  import { onMount } from "svelte";
  import { Plot, Points, Calculate, col } from "$lib/index";
  let plot = $state(), points = $state(), lower = $state(), upper = $state();
  const data = { x: [1, 4, 7, 9], y: [1, 2, 2, 1] };
  onMount(() => {
    window.brushExtents = {
      get plot() { return plot; }, get points() { return points; },
      get lower() { return lower; }, get upper() { return upper; },
    };
    return () => { delete window.brushExtents; };
  });
</script>

<Plot bind:this={plot} data={data} width={640} height={360} axes2d
  x={{ domain: [0, 10] }} y={{ domain: [0, 5] }}>
  <Points bind:this={points} x="x" y="y" brush={{ axis: "x" }} size={8} fill="#444444" />
  <Calculate columns={{ weight: col.x }}>
    <Points bind:this={lower} x="@brush_min:weight" y={4} fill="#e00000" size={16} respond={false} />
    <Points bind:this={upper} x={col("@brush_max:weight")} y={4} fill="#0000e0" size={16} respond={false} />
  </Calculate>
</Plot>
