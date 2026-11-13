<script>
  // TODO 141: a reference rule drawn over a Line along the same meridian. The GPU guides and the
  // mark project through the same live center, so the rule covers the line in every view.
  import { Plot, Line } from "$lib/index";
  let plot = $state();
  const meridian = Array.from({ length: 37 }, (_, i) => [45, -90 + i * 5]);
  $effect(() => {
    window.globeGuideSync = { get plot() { return plot; } };
    return () => { delete window.globeGuideSync; };
  });
</script>

<Plot bind:this={plot} coordinates="spherical" projection="orthographic" axes2d width={400} height={400}
  rules={[{ axis: "x", value: 45, color: "#1030e0", width: 6 }]}>
  <Line position={meridian} color="#e01010" width={1.5} />
</Plot>
