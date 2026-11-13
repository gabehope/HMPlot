<script>
  import { onMount, untrack } from "svelte";
  import { Theme, themes, Data, Plot, GeoJSON, Points, Rect, Calculate, multiply, continuous } from "$lib";
import { Bin } from "$lib/stats/index.js";
  import { loadCountries } from "./load.js";
  let { onready = () => {} } = $props();
  let plot = $state(), quakes = $state.raw(), countries = $state.raw(), error = $state("");
  // Depths are exaggerated so the slabs show: at 4x, a 700 km deep quake sits 44% of the way
  // to the center instead of 11%.
  let exaggeration = $state(4);
  // The radius is computed on the GPU by a Calculate on the globe, with the exaggeration as a
  // constant: a new value compiles nothing and reruns only the globe. (A new radius column in
  // the table would be a data replacement that every plot reruns for; radialScale is compiled
  // into the globe's shaders.)
  const radius = $derived({ radius: multiply("depth", -exaggeration / 6371) });
  $effect(() => { if (plot) untrack(() => onready(plot)); });

  onMount(() => {
    const abort = new AbortController();
    const csv = fetch("/data/earthquakes/usgs-m45-2015-2024.csv", { signal: abort.signal })
      .then((r) => { if (!r.ok) throw Error(`Could not load the earthquake catalog (${r.status}).`); return r.text(); });
    Promise.all([csv, loadCountries(abort.signal)]).then(([text, geo]) => {
      // year, lat, lon, depth (km), mag: one row per earthquake, sorted by time.
      const lines = text.trim().split("\n").slice(1), n = lines.length;
      const table = { year: new Float32Array(n), lat: new Float32Array(n), lon: new Float32Array(n),
        depth: new Float32Array(n), mag: new Float32Array(n), jittered: new Float32Array(n) };
      lines.forEach((line, i) => {
        const [year, lat, lon, depth, mag] = line.split(",").map(Number);
        table.year[i] = year; table.lat[i] = lat; table.lon[i] = lon; table.depth[i] = depth; table.mag[i] = mag;
        // Magnitudes come rounded to 0.1, which draws the timeline as stripes; spread each one
        // by a fixed pseudo-random amount within +-0.05 for display only.
        const noise = Math.sin(i * 12.9898) * 43758.5453;
        table.jittered[i] = mag + 0.1 * (noise - Math.floor(noise) - 0.5);
      });
      quakes = table;
      countries = geo;
    }).catch((e) => { if (!abort.signal.aborted) error = e.message; });
    return () => abort.abort();
  });

  // Shallow quakes are hot yellow; the deepest, 700 km down in sinking slabs, are violet.
  const depthColors = continuous({ domain: [0, 700], colormap: ["#ffe066", "#ff7b39", "#e0245e", "#8e2de2", "#4361ee"] });
  const magnitudeEdges = Array.from({ length: 41 }, (_, i) => +(4.5 + i * 0.1).toFixed(1));
</script>

<p>Every magnitude 4.5+ earthquake from 2015 to 2024 (72,956 of them, from the USGS catalog), placed at its true depth inside a see-through Earth. Orbit the globe and look under the western Pacific: the deep quakes trace slabs of ocean floor sinking into the mantle. Shift-drag on the map or the timeline to brush; the brushes combine, the globe keeps only the matching quakes lit, and the histogram counts them. On its log scale, counts fall on the Gutenberg–Richter line: every step of one magnitude is about ten times rarer.</p>
{#if error}<p role="alert">{error}</p>{:else if !quakes}<p>Loading the earthquake catalog…</p>{:else}
  <label class="control">Depth exaggeration ×{exaggeration.toFixed(1)}
    <input type="range" min="1" max="6" step="0.1" bind:value={exaggeration} aria-label="Depth exaggeration" /></label>
  <Theme value={themes.dark}>
    <Data value={quakes}>
      <div class="layout">
        <!-- Spherical positions are [longitude, latitude, offset]; radius = 1 + offset. A fixed
             offset domain keeps the slider from changing the globe's compiled extent. The
             camera looks at the Pacific (160°E), where the Ring of Fire and the deep slabs are. -->
        <Plot bind:this={plot} coordinates="spherical" type="3d-y-up" responsive height={560}
          globeBackground={false} z={{ domain: [-0.7, 0] }} cameraPosition={[1.1, 0.9, -3.0]}>
          <GeoJSON data={countries} color="#5b6b82" width={1}  fill={null} />
          <Calculate columns={radius}>
            <Points x="lon" y="lat" z="radius" fill="depth" fillScale={depthColors} size={1.5}
              respond="brushed" label="Earthquakes" legend={false} />
          </Calculate>
        </Plot>
        <div class="side">
          <Plot responsive height={230} axes2d x={{ domain: [-180, 180], label: "longitude" }}
            y={{ domain: [-90, 90], label: "latitude" }}>
            <Points x="lon" y="lat" fill="depth" fillScale={depthColors} size={1}
              brush respond="brushed" label="Map" legend={false} />
          </Plot>
          <Plot responsive height={170} axes2d x={{ domain: [2015, 2025], label: "year" }}
            y={{ domain: [4.4, 8.5], label: "magnitude (jittered)" }}>
            <Points x="year" y="jittered" fill="depth" fillScale={depthColors} size={1}
              brush respond="brushed" label="Timeline" legend={false} />
          </Plot>
          <Plot responsive height={170} axes2d x={{ domain: [4.5, 8.5], label: "magnitude" }}
            y={{ domain: [0.8, 30000], transform: "log", label: "earthquakes" }}>
            <!-- Dim: every quake. Bright: the brushed ones (all of them with no brush). -->
            <Bin x="mag" bins={magnitudeEdges}>
              <Rect x0="x0" x1="x1" y0={0.8} y1="count" fill="#3b3363" legend={false} />
            </Bin>
            <Bin x="mag" bins={magnitudeEdges} weight="@brushed">
              <Rect x0="x0" x1="x1" y0={0.8} y1="count" fill="#ff7b39" legend={false} />
            </Bin>
          </Plot>
        </div>
      </div>
    </Data>
  </Theme>
{/if}
<small>Data: U.S. Geological Survey earthquake catalog (public domain). Borders: Natural Earth (public domain).</small>

<style>
  p { font-size: 14px; line-height: 1.5; }
  .control { display: flex; gap: 10px; align-items: center; margin: 8px 0 12px; font-size: 14px; }
  .control input { width: 200px; }
  .layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 12px; }
  .side { display: grid; gap: 12px; align-content: start; }
  @media (max-width: 760px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
