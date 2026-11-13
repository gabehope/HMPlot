<script>
  import { Plot, Rect } from "$lib/index";
  let plot = $state();
  $effect(() => {
    window.stage14LegacyPolarRect = { get plot() { return plot; } };
    return () => { delete window.stage14LegacyPolarRect; };
  });
</script>

<Plot bind:this={plot} coordinates="spherical" projection="orthographic" width={360} height={360}>
  <Rect x0={0} x1={90} y0={0} y1={0} z0={0} z1={1} fill="#d22b2b" />
</Plot>
