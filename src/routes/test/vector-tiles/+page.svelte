<script>
  // TODO 24: a VectorTile in a 2D Mercator map, for the browser specs (tiles routed per test)
  // and by hand (?tile=z/x/y&url=... ; default: the bundled tiles). ?theme=<preset name or JSON>
  // wraps the plot in a Theme (TODO 36); setTheme() changes it. Fixed tiles unless ?live=1
  // (TODO 35); ?attribution=... credits the tiles; ?cartesian=1 draws them in a Cartesian plot;
  // ?width= and ?height= size it (720 x 480); ?click=0 leaves out onclick (no picking);
  // ?background= colors the plot. ?flyover=1 (TODO 66): a 3D flyover plot, the tiles in a local
  // plane around the requested tile's center (?upm= scene units per meter, default 0.01) on the
  // xz plane, axes from -50 to 50 (z 0 to 30); ?extrude=0 draws the buildings flat; setExtrude()
  // changes it. setSize(width, height) resizes the plot. ?marker=x,y,z draws a green point there.
  import { page } from "$app/state";
  import { tileBounds } from "$lib/plot/utils/vectorTiles.js";
  import { Plot, Theme, VectorTile, Points, themes } from "$lib";
  const query = page.url.searchParams;
  const tile = (query.get("tile") ?? "14/9014/4818").split("/").map(Number);
  const url = query.get("url") ?? "/data/vector-tiles/{z}/{x}/{y}.mvt";
  let projection = $state(query.get("projection") ?? "mercator");
  let projectionCenter = $state((query.get("center") ?? "0,0").split(",").map(Number));
  const toneMapping = query.get("toneMapping") === null ? 0 : Number(query.get("toneMapping"));
  let plot = $state(), tiles = $state(), loads = $state([]), errors = $state([]), clicked = $state(null);
  const styles = query.get("styles") ? JSON.parse(query.get("styles")) : undefined;
  let width = $state(Number(query.get("width") ?? 720)), height = $state(Number(query.get("height") ?? 480));
  const background = query.get("background") ?? undefined;
  const live = query.get("live") === "1", click = query.get("click") !== "0", attribution = query.get("attribution") ?? undefined, cartesian = query.get("cartesian") === "1";
  let current = $state({ tile, styles });
  const themeParam = query.get("theme");
  let theme = $state(themeParam === null ? undefined : themeParam.startsWith("{") ? JSON.parse(themeParam) : themes[themeParam]);
  const flyover = query.get("flyover") === "1", upm = Number(query.get("upm") ?? 0.01);
  const [west, south, east, north] = tileBounds(tile), origin = [(west + east) / 2, (south + north) / 2];
  let extrude = $state(query.get("extrude") !== "0");
  const marker = query.get("marker")?.split(",").map(Number);
  $effect(() => {
    window.vectorTiles = { plot, tiles, loads, errors, clicked, origin, set: (next) => (current = next), setTheme: (next) => (theme = next),
      setProjection: (next, center = projectionCenter) => { projection = next; projectionCenter = center; },
      setExtrude: (next) => (extrude = next), setSize: (w, h) => { width = w; height = h; } };
  });
  const plotProps = $derived(flyover
    ? { type: "3d-y-up", cameraMode: "flyover", x: { domain: [-50, 50], range: [-50, 50] }, y: { domain: [-50, 50], range: [-50, 50] }, z: { domain: [0, 30], range: [0, 30] },
      cameraPosition: [0, 12, 18], cameraTarget: [0, 0, 0] }
    : cartesian ? { autoBounds: true, aspect: "equal" } : { coordinates: "spherical", projection, projectionCenter });
</script>

{#snippet map()}
  <Plot bind:this={plot} {...plotProps} {toneMapping} {height} {width} {background}>
    <VectorTile bind:this={tiles} {url} {live} {attribution} {...current} fit={query.get("fit") !== "0"} maxZoom={Number(query.get("maxZoom") ?? 14)} {...(flyover ? { origin, unitsPerMeter: upm, plane: "xz", extrudeBuildings: extrude } : {})}
      onload={(event) => (loads = [...loads, event])} onerror={({ error }) => (errors = [...errors, error.message])}
      onclick={click ? (event) => (clicked = event.feature.properties) : undefined} />
    {#if marker}<Points position={[marker]} size={8} fill="#00ff00" />{/if}
  </Plot>
{/snippet}
{#if themeParam === null}{@render map()}{:else}<Theme value={theme}>{@render map()}</Theme>{/if}
