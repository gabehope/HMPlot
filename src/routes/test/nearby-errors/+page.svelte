<script>
  // Marks that cannot produce nearby, one per plot, for the exact error messages.
  import { onMount } from "svelte";
  import { Plot, Frame, Line, Points } from "$lib/index";
  let line = $state(), view3d = $state(), rotated = $state(), literal = $state();
  onMount(() => {
    window.nearbyErrors = {
      get line() { return line; }, get view3d() { return view3d; },
      get rotated() { return rotated; }, get literal() { return literal; },
    };
    return () => { delete window.nearbyErrors; };
  });
  const data = { x: [1, 2, 3], y: [1, 2, 3] };
</script>
<!-- A mark kind that cannot produce nearby. -->
<Plot bind:this={line} data={data} width={300} height={200} axes2d>
  <Line x="x" y="y" nearby />
</Plot>
<!-- A point mark in a 3D view. -->
<Plot bind:this={view3d} data={data} type="3d" width={300} height={200}>
  <Points x="x" y="y" nearby />
</Plot>
<!-- A point mark in a rotated Frame. -->
<Plot bind:this={rotated} data={data} width={300} height={200} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Frame placement={{anchor: [50, 50], size: [120, 80], rotation: [0, 0, 30]}} x={{domain: [0, 4]}} y={{domain: [0, 4]}}>
    <Points x="x" y="y" nearby />
  </Frame>
</Plot>
<!-- x and y given as literal arrays, not named columns. -->
<Plot bind:this={literal} width={300} height={200} axes2d>
  <Points x={[1, 2]} y={[1, 2]} nearby />
</Plot>
