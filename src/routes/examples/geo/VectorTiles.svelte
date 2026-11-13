<script>
  import { untrack } from "svelte";
  import { Plot, Theme, VectorTile, Points, Text, themes } from "$lib";
  let { onready = () => {} } = $props();
  let plot = $state();
  let tiles = $state(), placeName = $state("Stockholm"), themeName = $state("minimal"), live = $state(true), status = $state(""), picked = $state("");
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // A tile ([zoom, column, row]) and a landmark per place, in longitude/latitude.
  const places = {
    Stockholm: { tile: [14, 9014, 4818], landmark: [18.0716, 59.3268], label: "Royal Palace" },
    Amsterdam: { tile: [14, 8414, 5384], landmark: [4.8930, 52.3731], label: "Dam Square" },
    Venice: { tile: [13, 4376, 2932], landmark: [12.3397, 45.4341], label: "St Mark's Square" },
    "New York Harbor": { tile: [13, 2411, 3080], landmark: [-74.0445, 40.6892], label: "Statue of Liberty" },
  };
  const place = $derived(places[placeName]);
  // Parts to draw: a part set to false is hidden, and a source layer whose every part is hidden is
  // never decoded (a zoom-14 city tile without buildings prepares in a quarter of the time).
  const layerNames = { buildings: "Buildings", roads: "Roads", paths: "Paths", railways: "Railways", places: "Place names" };
  let layers = $state({ buildings: true, roads: true, paths: true, railways: true, places: true });
  const styles = $derived({ ...layers, majorRoads: layers.roads });
  function inspect(event) {
    const { layerName, kind, name } = event.feature.properties;
    picked = [layerName, kind, name].filter(Boolean).join(" · ");
  }
  // The live level, for the readout.
  $effect(() => {
    const timer = setInterval(() => {
      const live = tiles?.getStatus?.().live;
      status = live ? `zoom ${live.zoom}: ${live.shown} of ${live.selected} tiles` : "";
    }, 250);
    return () => clearInterval(timer);
  });
</script>

<p>
  A basemap that follows the view. <code>VectorTile</code> loads the tile named for each place at full
  detail and frames it; as you pan and zoom, the tiles the view shows load too, each drawn as soon as
  it arrives, finer tiles over coarser ones. Without a <code>url</code> the tiles come from VersaTiles
  (OpenStreetMap data, no key), with their credit in the corner. Turn Live off to keep only the named
  tile; turn a layer off to hide it (its source layers are then not decoded at all). The landmark is an ordinary <code>Points</code> in longitude and latitude.
</p>
<div class="controls">
  <label>Place
    <select bind:value={placeName} aria-label="Place">
      {#each Object.keys(places) as value}<option {value}>{value}</option>{/each}
    </select>
  </label>
  <!-- Every theme has a matching basemap scheme (its vectorTile section). -->
  <label>Theme
    <select bind:value={themeName} aria-label="Theme">
      {#each Object.keys(themes) as value}<option {value}>{themes[value].name}</option>{/each}
    </select>
  </label>
  {#each Object.entries(layerNames) as [part, name]}
    <label><input type="checkbox" bind:checked={layers[part]} /> {name}</label>
  {/each}
  <label><input type="checkbox" bind:checked={live} /> Live</label>
  <output>{status}</output>
</div>
<Theme value={themes[themeName]}>
<Plot bind:this={plot} coordinates="spherical" projection="mercator" toneMapping={0} responsive height={480}>
  <VectorTile bind:this={tiles} tile={place.tile} {live} {styles} onclick={inspect} />
  <Points position={[place.landmark]} size={6} fill="#d6453d" legend={false} />
  <Text position={[place.landmark]} text={[place.label]} dy={-16} size={13} color="#d6453d" legend={false} />
</Plot>
</Theme>
<p class="picked" aria-live="polite">{picked || "Click the map to inspect a feature."}</p>

<style>
  p { font-size: 14px; line-height: 1.5; }
  .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin: 8px 0 12px; font-size: 14px; }
  .controls output { color: #5b6470; font-size: 13px; }
  .picked { color: #3d4450; font-size: 13px; }
</style>
