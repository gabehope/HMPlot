<script>
  // TODO 141: the on/off navigation measurement (tests/perf/globe-guides.spec.js): the default
  // globe of /test/stage14-orthographic-default, its guides on, or off with ?guides=off.
  import { page } from "$app/state";
  import { Plot, Points } from "$lib/index";
  let plot = $state();
  const guides = page.url.searchParams.get("guides") !== "off";
  $effect(() => {
    window.globeGuidePerf = { get plot() { return plot; } };
    return () => { delete window.globeGuidePerf; };
  });
</script>

<Plot bind:this={plot} coordinates="spherical" projection="orthographic" axes2d={guides} width={400} height={400}>
  <Points position={[[0, 0]]} size={13} fill="#2468a0" />
  <Points position={[[180, 0]]} size={13} fill="#c73b2b" />
</Plot>
