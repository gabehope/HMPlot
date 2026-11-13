<script>
  // ?case=frame: a Plot whose root Frame is polar; its settings' Coordinates rows are the
  //   Frame's. ?case=globe: an orthographic globe centered at latitude 60 for drag checks.
  import { onMount } from "svelte";
  import { Plot, Frame, Points, Line } from "$lib/index";
  const scene = typeof location === "undefined" ? "frame" : new URLSearchParams(location.search).get("case") ?? "frame";
  let plot = $state(), frame = $state();
  onMount(() => {
    window.rootCoordinates = { scene, get plot() { return plot; }, get frame() { return frame; } };
    return () => { delete window.rootCoordinates; };
  });
</script>
{#if scene === "frame"}
  <Plot bind:this={plot} type="2d" width={420} height={420}>
    <Frame bind:this={frame} name="Dial" coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24] }} y={{ domain: [0, 2] }}>
      <Line position={[[0, 1], [6, 1.5], [12, 1]]} width={2} />
      <Points position={[[3, 1.2]]} size={5} />
    </Frame>
  </Plot>
{:else}
  <Plot bind:this={plot} type="2d" width={420} height={420} coordinates="spherical" projection="orthographic"
    projectionCenter={[0, 60]} x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Line position={[[-60, 60], [0, 60], [60, 60]]} width={3} color="#d43735" />
  </Plot>
{/if}
