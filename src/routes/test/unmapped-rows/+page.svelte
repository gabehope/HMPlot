<script>
  // TODO 136.11: rows a log axis cannot map (y <= 0) draw nothing, on the left; the rows it
  // can, on the right. Rect's analytic edges ("off") and multisampled corners ("msaa"); a turned
  // Rect is a solid on both.
  // `window.unmappedRows` for unmapped-rows.spec.js.
  import { Plot, Rect, Points, Text } from "$lib/index";
  let plots = $state({});
  $effect(() => {
    window.unmappedRows = { get plots() { return plots; } };
    return () => { delete window.unmappedRows; };
  });
  const data = { x0: [0.5, 2, 5], x1: [1.5, 3, 6], y0: [0, -1, 0.5], y1: [5, 3, 2],
    px: [1, 2.5, 6.5], py: [-1, 0, 4], label: ["A", "B", "C"] };
</script>

{#each ["msaa", "off"] as antialias}
  <Plot bind:this={plots[antialias]} {data} {antialias} width={300} height={200} responsive={false}
    axes2d={false} background="white" toneMapping={0} x={{ domain: [0, 7] }} y={{ domain: [0.1, 10], transform: "log" }}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#d02b27" />
    <!-- Turned: its lowest corner is below 0, though y0 and y1 are not. -->
    <Rect x0={2} x1={3.5} y0={0.15} y1={0.6} rotation={45} fill="#d02b27" />
    <Points x="px" y="py" color="#2a6fdb" size={14} />
    <Text x="px" y="py" text="label" color="#13bd4e" size={28} dy={-20} />
  </Plot>
{/each}
