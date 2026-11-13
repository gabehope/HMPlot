<script>
  import { untrack } from "svelte";
  import { Provider, Plot, Points, Rect, Button, InputContext, Select, continuous, input } from "$lib";
import { Bin } from "$lib/stats/index.js";
  let { onready = () => {} } = $props();
  let plot = $state(), status = $state("");
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  const years = Array.from({ length: 10 }, (_, i) => 2015 + i);
  const depthColors = continuous({ domain: [0, 700], colormap: ["#ffe066", "#ff7b39", "#e0245e", "#8e2de2", "#4361ee"] });
  const magnitudeEdges = Array.from({ length: 41 }, (_, i) => +(4.5 + i * 0.1).toFixed(1));
</script>

<p>
  One year of magnitude 4.5+ earthquakes (USGS) at a time: the Provider loads
  <code>/data/earthquakes/by-year/{"{year}"}.csv</code> when the year changes. The previous year stays
  on screen until the next one arrives, and going back to a year on screen loads nothing.
</p>
<InputContext>
<div class="controls">
  <Select name="year" options={years} value={2024} label="Year" />
  <!-- Each press loads the year again (Provider refreshes when refresh's value changes). -->
  <Button name="reload" label="Refresh" />
  <output>{status}</output>
</div>
<!-- A JavaScript string: in a quoted attribute, Svelte would read {year} as an expression. -->
<Provider url={"/data/earthquakes/by-year/{year}.csv"} format="csv" params={{ year: input("year") }} refresh={input("reload")}
  onload={({ rows, ms }) => (status = `${rows.toLocaleString()} earthquakes in ${Math.round(ms)} ms`)}
  onerror={({ error }) => (status = String(error?.message ?? error))}>
  <div class="layout">
    <Plot bind:this={plot} responsive height={320} axes2d x={{ domain: [-180, 180], label: "longitude" }}
      y={{ domain: [-90, 90], label: "latitude" }}>
      <Points x="lon" y="lat" fill="depth" fillScale={depthColors} size={1.5} label="Earthquakes" legend={false} />
    </Plot>
    <Plot responsive height={320} axes2d x={{ domain: [4.5, 8.5], label: "magnitude" }}
      y={{ domain: [0.8, 5000], transform: "log", label: "earthquakes" }}>
      <Bin x="mag" bins={magnitudeEdges}>
        <Rect x0="x0" x1="x1" y0={0.8} y1="count" fill="#e0245e" legend={false} />
      </Bin>
    </Plot>
  </div>
</Provider>
</InputContext>
<small>Data: U.S. Geological Survey earthquake catalog (public domain), one file per year.</small>

<style>
  p { font-size: 14px; line-height: 1.5; }
  .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 8px 0 12px; font-size: 14px; }
  .controls output { color: #5b6470; font-size: 13px; }
  .layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 12px; }
  @media (max-width: 760px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
