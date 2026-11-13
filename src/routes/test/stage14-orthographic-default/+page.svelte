<script>
  import { Plot, Points } from "$lib/index";
  let plot = $state();
  $effect(() => {
    window.stage14OrthographicDefault = { get plot() { return plot; },
      get pick() { return window.stage14OrthographicDefaultPick; } };
    return () => { delete window.stage14OrthographicDefault; };
  });
</script>

<Plot bind:this={plot} coordinates="spherical" projection="orthographic" axes2d width={400} height={400}>
  <Points position={[[0, 0]]} size={13} fill="#2468a0"
    onclick={(event) => window.stage14OrthographicDefaultPick = event.axisValue} />
  <Points position={[[180, 0]]} size={13} fill="#c73b2b" />
</Plot>
