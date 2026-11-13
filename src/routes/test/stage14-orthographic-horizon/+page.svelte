<script>
  import { Plot, Line } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "default";
  let plot = $state();
  $effect(() => {
    window.stage14OrthographicHorizon = { get plot() { return plot; } };
    return () => { delete window.stage14OrthographicHorizon; };
  });
</script>

<!-- A z domain of [-1, 1] makes the disk radius 2: the globe (radius 1) fills half the plot, with
  room past its limb to see that nothing is drawn there. No guides: only the lines' pixels. -->
{#if scene === "dyadic"}
  <!-- The limb (longitude 90) falls exactly on a refinement vertex, t = 5/8. -->
  <Plot bind:this={plot} coordinates="spherical" projection="orthographic"
    projectionCenter={[0, 0]} baseRadius={1} radialScale={1} width={400} height={400}
    z={{ domain: [-1, 1] }} axes2d={false}>
    <Line position={[[40, 30], [120, 30]]} interpolation="angular" color="#2b63da" width={8} />
  </Plot>
{:else}
<Plot bind:this={plot} coordinates="spherical" projection="orthographic"
  projectionCenter={[0, 0]} baseRadius={1} radialScale={1} width={400} height={400}
    z={{ domain: [-1, 1] }} axes2d={false}>
  <Line position={[[0, 0], [100, 0]]} color="#e35836" width={8} />
  <Line position={[[40, 30], [320, 30]]} interpolation="angular"
    color="#2b63da" width={8} />
</Plot>
{/if}
