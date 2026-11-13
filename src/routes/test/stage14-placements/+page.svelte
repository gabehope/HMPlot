<script>
  import { Plot, Frame, Points } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "nested-rotation";
  let plot = $state(), overview = $state(false);
  $effect(() => {
    window.stage14Placements = { get plot() { return plot; }, scene, setOverview(value) { overview = value; } };
    return () => { delete window.stage14Placements; };
  });
</script>

{#if scene === "nested-rotation"}
  <!-- A 60 x 40 px inset turned 20 degrees inside a 200 x 150 px inset turned
       30 degrees, in a non-square plot. Its corners are colored markers. -->
  <Plot axisMask={false} bind:this={plot} type="2d" width={600} height={400} axes2d={false} {overview}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame placement={{ anchor: [0.5, 0.5], size: [200, 150], rotation: [0, 0, 30] }}
      x={{ domain: [0, 1], visible: false }} y={{ domain: [0, 1], visible: false }}>
      <Frame placement={{ anchor: [0.75, 0.5], size: [60, 40], rotation: [0, 0, 20] }}
        x={{ domain: [0, 1], visible: false }} y={{ domain: [0, 1], visible: false }}>
        <Points position={[[0, 0]]} size={3} fill="#ff0000" />
        <Points position={[[1, 0]]} size={3} fill="#00c000" />
        <Points position={[[0, 1]]} size={3} fill="#0000ff" />
      </Frame>
    </Frame>
  </Plot>
{/if}
