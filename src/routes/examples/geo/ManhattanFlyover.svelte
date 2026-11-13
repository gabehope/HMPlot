<script lang="ts">
  import { onMount, tick } from "svelte";
  import { T } from "@threlte/core";
  import { Plot, GeoJSON, VectorTile, Legend, InputContext, Slider, continuous } from "$lib";
  // The buildings live with the paired example (src/examples/manhattan-flyover, TODO 69.10).
  import buildingsURL from "../../../examples/manhattan-flyover/manhattan-buildings.json?url";

  let { onready = () => {} } = $props();
  let plot = $state<any>();
  let mark = $state<any>();
  let basemap = $state<any>();
  // The streets, water and parks under the buildings: the twelve zoom-12 vector tiles over the
  // scene, drawn in the buildings' own plane (0.004 scene units per meter around -73.95, 40.72).
  const SCENE_BOUNDS: [number, number, number, number] = [-74.068, 40.669, -73.885, 40.895];
  let exaggeration = $state(10);
  // Distance fog over the city, toward the plot's background (TODO 37.4).
  let fogOn = $state(false);
  // Where the buildings come from (TODO 66): NYC Open Data's footprints over the twelve bundled
  // zoom-12 tiles, or the map tiles themselves, streamed around the camera from VersaTiles, whose
  // zoom-14 tiles carry building heights ("3D buildings" stands them up; off, flat footprints).
  let source = $state<"nyc" | "tiles">("tiles");
  let tileDetail = $state(0);
  const cameraPosition: [number, number, number] | undefined = $derived(source === "tiles" ? [-9, 3.2, -15] : undefined);
  const cameraTarget: [number, number, number] | undefined = $derived(source === "tiles" ? [-9, 0, -27] : undefined);
  let tileBuildings = $state(true);
  // A released drag glides on for a moment (the Plot's flyoverMomentum, on by default).
  let momentum = $state(true);
  async function chooseSource(next: "nyc" | "tiles") {
    source = next;
    await tick();
    if (next === "nyc") plot?.fit();
  }
  let buildingSource = $state<any>(null);
  let loadError = $state("");
  let draftLimit = $state(10000);
  let buildingLimit = $state(10000);
  let visibleBuildings = $derived(buildingSource && {
    type: "FeatureCollection",
    features: buildingSource.features.slice(0, buildingLimit),
  });
  let selected = $state("Click a building to inspect it");
  onMount(() => {
    const abort = new AbortController();
    fetch(buildingsURL, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw Error(`Building data: HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => { buildingSource = data; })
      .catch((error) => { if (!abort.signal.aborted) loadError = error.message; });
    return () => abort.abort();
  });
  function applyLimit() {
    const count = Number(draftLimit);
    if (!Number.isFinite(count)) return;
    buildingLimit = Math.min(buildingSource?.features.length ?? 100000, Math.max(100, Math.round(count)));
    draftLimit = buildingLimit;
  }
  function showAll() {
    if (!buildingSource) return;
    buildingLimit = buildingSource.features.length;
    draftLimit = buildingLimit;
  }
  $effect(() => { if (plot) onready(plot); });
  $effect(() => {
    if (!import.meta.env.DEV || !plot) return;
    (window as any).__manhattanFlyover = { plot, mark, basemap };
    return () => { delete (window as any).__manhattanFlyover; };
  });
</script>

<InputContext>
<div class="flyover-example">
  <div class="intro">
    <p>Fly over Manhattan. Drag to move the map (the street you grab stays under the pointer; let go while moving and it glides on), scroll to zoom toward the pointer, right-drag to look around, W/A/S/D to fly, and Q/E to change altitude. Click a building to inspect it.</p>
    <label class="switch"><input type="checkbox" bind:checked={momentum} /> Momentum</label>
  </div>
  <div class="controls">
    <label for="manhattan-source">Buildings</label>
    <select id="manhattan-source" value={source} onchange={(event) => chooseSource((event.currentTarget as HTMLSelectElement).value as "nyc" | "tiles")}>
      <option value="nyc">NYC Open Data footprints</option>
      <option value="tiles">Map tiles, streamed (VersaTiles)</option>
    </select>
    {#if source === "nyc"}
      <form onsubmit={(event) => { event.preventDefault(); applyLimit(); }}>
        <label for="manhattan-building-limit">Maximum buildings</label>
        <input id="manhattan-building-limit" type="number" min="100" max={buildingSource?.features.length ?? 100000} step="1" bind:value={draftLimit} />
        <button type="submit">Apply</button>
        <button type="button" onclick={showAll} disabled={!buildingSource}>All buildings</button>
        <span>of {buildingSource?.features.length.toLocaleString() ?? "10,000"} Manhattan buildings</span>
      </form>
      <label for="manhattan-height-scale">Height exaggeration</label>
      <input id="manhattan-height-scale" type="range" min="1" max="15" step="0.5" bind:value={exaggeration} />
      <span>{Number(exaggeration).toFixed(1)}×</span>
    {:else}
      <Slider name="tileDetail" label="Tile detail" min={-2} max={2} step={0.25} format="+.2f" bind:value={tileDetail} />
      <label class="switch"><input type="checkbox" bind:checked={tileBuildings} /> 3D buildings</label>
    {/if}
    <label class="switch"><input type="checkbox" bind:checked={fogOn} /> Fog</label>
  </div>
  {#if loadError}
    <p role="alert">Could not load the Manhattan buildings: {loadError}</p>
  {:else if !visibleBuildings}
    <p role="status">Loading building footprints…</p>
  {:else}
  <Plot bind:this={plot} type="3d-y-up" cameraMode="flyover" height={520} responsive flyoverMomentum={momentum} {cameraPosition} {cameraTarget}
    x={{ domain: [-40, 22], range: [-40, 22] }}
    y={{ domain: [-23, 78], range: [-23, 78] }}
    z={{ domain: [0, 30], range: [0, 30] }}
    effects={[
      // A pale sky over the light basemap, seen when the view tilts toward the horizon.
      { kind: "sky", zenith: "#7fa8d6", horizon: "#eef3f8", ground: "#e4e9ee" },
      ...(fogOn ? [{ kind: "fog", near: source === "tiles" ? 6 : 150, far: source === "tiles" ? 40 : 450, color: "#eef3f8" }] : []),
    ]}>
    <T.AmbientLight intensity={1.2} />
    <T.DirectionalLight position={[-35, 95, 20]} intensity={2.2} />
    {#if source === "nyc"}
      <!-- The bundled tiles as they are (live={false}), without the tiles' own buildings. -->
      <VectorTile bind:this={basemap} url={"/data/vector-tiles/{z}/{x}/{y}.mvt"} bounds={SCENE_BOUNDS} zoom={12} live={false}
        origin={[-73.95, 40.72]} unitsPerMeter={0.004} plane="xz" extrudeBuildings={false} styles={{ places: false, buildings: false }} />
      <GeoJSON bind:this={mark} data={visibleBuildings} plane="xz" fill="height" fillScale={continuous({ domain: [0, 1.3] })}
        height="height" heightScale={continuous({ domain: [0, 2], range: [0, 2 * Number(exaggeration)] })}
        outlineColor="#425669" outlineWidth={0} lit
        onclick={(event) => selected = `${event.feature?.properties?.name ?? "Building"} · ${event.feature?.properties?.roofFeet ?? "?"} ft roof height`} />
      <Legend for={mark} channel="fill" label="Roof height" position="right" />
    {:else}
      <!-- The default tiles (VersaTiles), live: the tiles around the camera load as it flies, and
        their buildings stand from their heights (meters, 5 where a building has none). -->
      <VectorTile bind:this={basemap} bounds={SCENE_BOUNDS} zoom={12}
        origin={[-73.95, 40.72]} unitsPerMeter={0.004} plane="xz" zoomBias={tileDetail} extrudeBuildings={tileBuildings} styles={{ places: false }}
        onclick={(event) => selected = event.feature?.properties?.layerName === "buildings"
          ? `Map tile building · ${event.feature.properties.height === undefined ? "no height tag (drawn 5 m tall)" : `${event.feature.properties.height} m tall`}`
          : `Map tile ${event.feature?.properties?.layerName ?? "feature"}`} />
    {/if}
  </Plot>
  {/if}
  <p class="selection">{selected}</p>
  <p class="credit">{buildingSource?.features.length.toLocaleString() ?? "10,000"} of the 45,194 Manhattan building footprints from NYC Open Data BUILDING, over streets, water and parks from twelve zoom-12 vector tiles (map data © OpenStreetMap contributors, ODbL, and ESA WorldCover 2021, CC BY 4.0, via VersaTiles). Buildings without a usable roof height render flat. With map tile buildings, the basemap streams from VersaTiles around the camera and its zoom-14 tiles' buildings stand at true scale from their OpenStreetMap heights (fly below about 1.5 km to see them). The scene uses the explicit Y-up camera preset; the buildings and the tiles use <code>plane="xz"</code>, and the tiles are drawn in the buildings' local plane (<code>origin</code>, <code>unitsPerMeter</code>). <a href={buildingsURL} download="manhattan-buildings.json">Download buildings</a>.</p>
</div>
</InputContext>

<style>
  .flyover-example { max-width: 100%; }
  p { margin: 0 0 10px; color: #536273; line-height: 1.45; }
  .controls, form, .intro { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; color: #303d4b; }
  .intro { align-items: flex-start; flex-wrap: nowrap; }
  .intro p { margin: 0; flex: 1; }
  form { margin: 0 16px 0 0; }
  input[type="number"] { width: 90px; }
  input[type="range"] { width: min(180px, 42vw); }
  .switch { display: flex; align-items: center; gap: 6px; margin-left: 8px; }
  button { border: 1px solid #cbd5e1; background: white; border-radius: 4px; padding: 5px 10px; cursor: pointer; }
  .selection { margin: 10px 0 4px; }
  .credit { font-size: 0.82rem; }
</style>
