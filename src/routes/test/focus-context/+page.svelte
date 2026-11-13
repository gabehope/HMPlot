<script>
  // TODO 136.16 slice 2: a focus plot whose x domain is the brush drawn on a context strip.
  import { onMount } from "svelte";
  import { Data, Plot, Line, min, max } from "$lib/index";
  import { FocusContext } from "$lib/charts/index";
  const n = 500;
  const series = { t: Array.from({ length: n }, (_, i) => i), v: Array.from({ length: n }, (_, i) => Math.sin(i / 20) * 10 + i / 25) };
  let focus = $state(), context = $state(), figure = $state();
  onMount(() => {
    window.focusContext = { get focus() { return focus; }, get context() { return context; }, get figure() { return figure; } };
    return () => { delete window.focusContext; };
  });
</script>

<Data value={series}>
  <Plot bind:this={focus} width={420} height={240} animation={false} x={{ domain: [min("@brush_min:t"), max("@brush_max:t")] }}>
    <Line x="t" y="v" respond={false} />
  </Plot>
  <Plot bind:this={context} width={420} height={80} animation={false} interactive={false}>
    <Line x="t" y="v" brush={{ axis: "x" }} respond={false} />
  </Plot>
</Data>

<div style="width: 420px">
  <FocusContext bind:this={figure} data={series} x="t" y="v" height={300} color="#2a6f97" />
</div>
