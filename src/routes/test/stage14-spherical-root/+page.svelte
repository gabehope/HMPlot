<script>
  import { Plot, Frame, Points, Minimap } from "$lib/index";
  const data = { longitude: [-170, 0, 170], latitude: [0, 20, -20] };
  let plot = $state(), root = $state(), projection = $state("equirectangular");
  $effect(() => {
    window.stage14Sphere = { get plot() { return plot; }, get root() { return root; },
      setProjection(value) { projection = value; } };
    return () => { delete window.stage14Sphere; };
  });
</script>

<Plot bind:this={plot} {data} type="2d" width={600} height={400}>
  <Frame bind:this={root} coordinates="spherical" {projection}
    x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }}>
    <Points x="longitude" y="latitude" size={5} fill="#2468a0" />
  </Frame>
</Plot>
<Minimap for={plot} width={300} height={150} />
