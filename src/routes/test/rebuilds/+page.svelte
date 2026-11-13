<script>
  // TODO 17.5 fixture: marks whose options and scales a test changes, to count rebuilds.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Line, Surface } from "$lib/index";
  const n = 40;
  const table = {
    x: Float32Array.from({ length: n }, (_, i) => i / (n - 1)),
    y: Float32Array.from({ length: n }, (_, i) => 0.5 + 0.4 * Math.sin(i * 0.4)),
    v: Float32Array.from({ length: n }, (_, i) => 1 + i),
  };
  const grid = Array.from({ length: 12 }, (_, i) => Array.from({ length: 12 }, (_, j) => Math.sin(i * 0.5) * Math.cos(j * 0.5)));
  const plots = $state({}), marks = $state({});
  onMount(() => {
    window.rebuilds = {
      plots, marks,
      async settle() { await Promise.all(Object.values(plots).map((plot) => plot?.whenSettled?.())); },
    };
    return () => { delete window.rebuilds; };
  });
</script>

<Data value={table}>
  <Plot bind:this={plots.flat} width={360} height={260} axes2d toneMapping={0} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Points bind:this={marks.points} x="x" y="y" fill="v" size={4} />
    <Line bind:this={marks.line} x="x" y="y" curve="catmull-rom" width={2} color="#333333" />
  </Plot>
</Data>
<Plot bind:this={plots.surface} type="3d" width={300} height={300} toneMapping={0}>
  <Surface bind:this={marks.surface} height={grid} />
</Plot>
