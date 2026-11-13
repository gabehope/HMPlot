<script>
  import { untrack } from "svelte";
  import { Data, InputContext, Slider, Plot, Slice, Heatmap, gridTable, continuous, input } from "$lib";
  let { onready = () => {} } = $props();
  let plot = $state();
  const anomalies = continuous({ colormap: ["#2166ac", "#f7f7f7", "#b2182b"], domain: [-1.3, 1.3] });
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // A made-up daily anomaly that travels east: 120 days, latitudes -30 to 30, 180 longitudes.
  const time = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)));
  const lat = Array.from({ length: 25 }, (_, i) => -30 + i * 2.5);
  const lon = Array.from({ length: 180 }, (_, i) => i * 2);
  const anomaly = new Float32Array(time.length * lat.length * lon.length);
  let at = 0;
  for (let t = 0; t < time.length; t++) for (const phi of lat) for (const lambda of lon)
    anomaly[at++] = Math.cos(((lambda - 4 * t) / 360) * 4 * Math.PI) * Math.exp(-((phi / 15) ** 2)) + 0.3 * Math.sin(t / 9);
  const field = gridTable({ dims: { time, lat, lon }, columns: { anomaly } });
</script>

<p>
  A Hovmöller diagram: Slice at one latitude leaves the time × longitude grid, which a Heatmap draws
  with time up the y axis. The anomaly's eastward drift is the diagonal banding; move the latitude
  away from the equator and it fades.
</p>
<InputContext>
  <Data value={field}>
    <Slider name="latitude" min={-30} max={30} step={0.5} value={0} label="Latitude" />
    <Slice field="lat" at={input("latitude")}>
      <Plot bind:this={plot} responsive height={420} axes2d x={{ label: "longitude" }} y={{ label: "day" }} legend>
        <Heatmap fill="anomaly" fillScale={anomalies} />
      </Plot>
    </Slice>
  </Data>
</InputContext>
