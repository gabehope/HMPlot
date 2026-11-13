<script>
  import { Plot, Points, Line, Segments, Arrows3D, Text, GeoJSON } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const projection = params.get("projection") ?? "equirectangular";
  const zoom = Number(params.get("zoom") ?? 1);
  // scene=world (TODO 39.5-39.6): the countries on a joint projection (equal-earth, albers-usa,
  // ...), centered on `center` degrees of longitude.
  const scene = params.get("scene");
  const center = Number(params.get("center") ?? 0);
  let plot = $state(), countries = $state(), picked = $state(null);
  $effect(() => {
    window.stage14RootMap = { get plot() { return plot; }, projection, get picked() { return picked; } };
    return () => { delete window.stage14RootMap; };
  });
  $effect(() => {
    if (scene !== "world") return;
    fetch("/data/geo/countries.json").then((r) => r.json()).then((data) => (countries = data));
  });
  // A square polygon of half-width h degrees around (lon, lat).
  const box = (lon, lat, h) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon",
    coordinates: [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]] } });
  // A square outline that crosses the antimeridian, from 165 to 195 degrees.
  const square = { type: "Feature", properties: {}, geometry: { type: "Polygon",
    coordinates: [[[165, 40], [195, 40], [195, 55], [165, 55], [165, 40]]] } };
</script>

<!-- A root flat map centered on the antimeridian: the world repeats across it
     (twice over when zoomed out), and a Line from 150 to 210 degrees, a
     Segment and a GeoJSON outline cross the seam. -->
{#if scene === "world"}
  <Plot bind:this={plot} type="2d" width={640} height={360} coordinates="spherical" {projection}
    projectionCenter={[center, projection === "albers" ? 38.7 : 0]} axes2d>
    {#if countries}
      <GeoJSON data={countries} fill="#9fb8cf" onclick={(event) => (picked = {
        name: event.feature?.properties?.name, geographic: event.geographicCoordinates })} />
    {/if}
    <!-- Across the seam (the center + 180°): cut there, one piece at each edge. A vertex
         exactly on the seam (red) is the hard case; the geometry worker cuts the polygon. -->
    <Line position={[[center + 150, -35], [center + 180, -35], [center + 210, -35]]} color="#d02030" width={4} />
    <Line position={[[center + 150, -15], [center + 210, -15]]} color="#20a040" width={4} />
    <GeoJSON data={box(center + 180, -58, 8)} fill="#2040d0" />
  </Plot>
{:else if scene === "insets"}
  <!-- albers-usa: a square each in Alaska (red), Hawaii (green) and Kansas (blue). -->
  <Plot bind:this={plot} type="2d" width={640} height={360} coordinates="spherical" projection="albers-usa">
    <GeoJSON data={box(-156, 62, 6)} fill="#d02030" />
    <GeoJSON data={box(-157.5, 20.5, 1.5)} fill="#20a040" />
    <GeoJSON data={box(-98.5, 38.5, 2)} fill="#2040d0" />
  </Plot>
{:else}
<Plot bind:this={plot} type="2d" width={500} height={300} coordinates="spherical" {projection}
  viewport={{ x: 1, y: 0.5, zoom }}
  x={{ domain: [-180, 180], visible: false }} y={{ domain: [-60, 60], visible: false }}>
  <Line position={[[150, -30], [180, -30], [210, -30]]} color="#d02030" width={3} />
  <Segments start={[[160, 20]]} end={[[200, 30]]} color="#2c8b53" width={3} />
  <GeoJSON data={square} color="#e0a000" width={2}  fill={null} />
  <!-- Arrows3D sizes are world units: a flat map is 2π across (about 80 px each at zoom 1). -->
  <Arrows3D start={[[165, -15]]} end={[[195, -15]]} color="#8a2be2" width={0.1} headLength={0.2} headWidth={0.2} />
  <Segments start={[[150, -50]]} end={[[190, -50]]} color="#8a2be2" width={2} />
  <Points position={[[170, 0], [-170, 0]]} size={5} fill="#2468c0" />
  <Text position={[[175, -45]]} text={["seam"]} size={12} />
</Plot>
{/if}
