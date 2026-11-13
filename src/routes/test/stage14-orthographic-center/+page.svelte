<script>
  import { Plot, Points } from "$lib/index";
  const data = { east: [60], west: [-60], latitude: [0] };
  let plot = $state(), center = $state([60, 0]);
  $effect(() => {
    window.stage14Orthographic = {
      get plot() { return plot; },
      center(value) { center = value; },
    };
    return () => { delete window.stage14Orthographic; };
  });
</script>

<Plot bind:this={plot} {data} coordinates="spherical" projection="orthographic"
  projectionCenter={center} width={600} height={400}>
  <Points x="east" y="latitude" size={14} fill="#2468a0" />
  <Points x="west" y="latitude" size={14} fill="#d07030" />
</Plot>
