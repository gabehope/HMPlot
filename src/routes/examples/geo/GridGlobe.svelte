<script>
  import { untrack } from "svelte";
  import { Data, InputContext, Playback, Plot, Slice, Heatmap, gridTable, continuous, input, min, max } from "$lib";
  let { onready = () => {} } = $props();
  let plot = $state();
  const temperature = continuous({ colormap: ["#2166ac", "#f7f7f7", "#b2182b"], domain: [240, 310] });
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // A made-up monthly surface temperature (K) on a model's grid: 24 months, 48 uneven latitudes
  // (closer together toward the poles) and 144 longitudes, 0 to 357.5.
  const time = Array.from({ length: 24 }, (_, i) => i);
  const lat = Array.from({ length: 48 }, (_, i) => {
    const t = (2 * i + 1) / 48 - 1;
    return Math.round(90 * Math.sign(t) * Math.abs(t) ** 0.75 * 100) / 100;
  });
  const lon = Array.from({ length: 144 }, (_, i) => i * 2.5);
  const tas = new Float32Array(time.length * lat.length * lon.length);
  let at = 0;
  for (const t of time) for (const phi of lat) for (const lambda of lon) {
    const s = Math.sin(phi * Math.PI / 180), season = Math.cos((t / 12) * 2 * Math.PI);
    tas[at++] = 300 - 45 * s * s - 12 * season * s + 3 * Math.sin((lambda / 60 + t / 6) * Math.PI) * Math.cos(phi * Math.PI / 90);
  }
  const field = gridTable({ dims: { time, lat, lon }, columns: { tas } });
</script>

<p>
  A grid table holds one row per cell of its dimensions (month, latitude, longitude); only the
  temperatures are stored, and each coordinate column is made when read. Slice through time blends
  the two months around the Playback's value on the GPU, and the Heatmap places the uneven
  latitudes by their coordinates.
</p>
<InputContext>
  <Data value={field}>
    <Playback name="month" min={min("time")} max={max("time")} rate={2} loop label="Month" />
    <Slice field="time" at={input("month")}>
      <Plot bind:this={plot} responsive height={420} type="2d" coordinates="spherical" projection="orthographic"
        projectionCenter={[-30, 20]} legend>
        <Heatmap fill="tas" fillScale={temperature} tooltip />
      </Plot>
    </Slice>
  </Data>
</InputContext>
