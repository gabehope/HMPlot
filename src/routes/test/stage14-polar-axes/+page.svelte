<script>
  import { Plot, Points } from "$lib/index";
  const orientations = ["Z", "X", "Y"];
  let plots = $state({});
  $effect(() => {
    window.stage14PolarAxes = { get plots() { return plots; } };
    return () => { delete window.stage14PolarAxes; };
  });
</script>

{#each orientations as axis}
  <Plot bind:this={plots[axis]} type="3d" width={320} height={320}
    coordinates="polar" polarAxis={axis} angleUnit="custom" anglePeriod={24}
    cameraPosition={[0, 0, 15]} cameraTarget={[0, 0, 0]} cameraUp={[0, 1, 0]}
    background="#ffffff" axes3d={false}>
    <Points position={[[6, 2, 1]]} size={11} fill="#2468a0" />
  </Plot>
{/each}
