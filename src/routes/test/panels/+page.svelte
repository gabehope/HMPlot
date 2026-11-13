<script>
  // TODO 136.16 slice 3: two Plots in Panels share x (one union domain, panned together), draw
  // the x axis once, and line up their plot areas although their y labels differ in width.
  import { onMount } from "svelte";
  import { Data, Panels, Plot, Line, Points } from "$lib/index";
  const top = { day: [0, 10, 20, 30, 40], price: [1, 3, 2, 5, 4] };
  const bottom = { day: [5, 15, 25, 35, 60], volume: [120000, 340000, 90000, 250000, 410000] };
  let upper = $state(), lower = $state();
  onMount(() => {
    window.panels = { get upper() { return upper; }, get lower() { return lower; } };
    return () => { delete window.panels; };
  });
</script>

<div style="width: 420px">
  <Panels x={{ label: "Day" }}>
    <Plot bind:this={upper} data={top} height={160} animation={false} y={{ label: "Price" }}><Line x="day" y="price" /></Plot>
    <Plot bind:this={lower} data={bottom} height={120} animation={false} y={{ label: "Volume" }}><Points x="day" y="volume" /></Plot>
  </Panels>
</div>
