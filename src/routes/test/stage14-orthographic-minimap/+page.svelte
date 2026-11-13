<script>
  import { Plot, Minimap, Points, Text } from "$lib/index";
  let plot = $state(), minimap = $state();
  $effect(() => {
    window.stage14OrthographicMinimap = {
      get plot() { return plot; }, get minimap() { return minimap; },
    };
    return () => { delete window.stage14OrthographicMinimap; };
  });
</script>

<!-- A background the minimap takes, and a label it leaves out (TODO 61). -->
<Plot bind:this={plot} coordinates="spherical" projection="orthographic"
  width={400} height={400} background="#f1e8d0">
  <Points position={[[0, 0]]} size={18} fill="#2468a0" />
  <Points position={[[180, 0]]} size={18} fill="#c73b2b" />
  <Text position={[[0, 30]]} text={["Text"]} size={40} color="#1fbf3f" />
</Plot>
<Minimap bind:this={minimap} for={plot} width={200} height={200} displayScale={0.6} />
