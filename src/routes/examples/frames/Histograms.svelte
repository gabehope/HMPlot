<script>
  import { Plot, InputContext, Slider, input } from "$lib";
import { Histogram } from "$lib/charts/index.js";
  let { plot = $bindable() } = $props();
  const data = {
    value: Array.from(
      { length: 240 },
      (_, i) => Math.sin(i * 1.618) + 0.5 * Math.cos(i * 2.13),
    ),
  };
</script>

<InputContext>
  <Slider name="bins" min={1} max={64} step={1} value={24} label="Bins" />
  <Plot bind:this={plot} {data} responsive height={400} axes2d>
    <Histogram
      x="value"
      bins={input("bins")}
      normalization="density"
      fill="#547ba2"
    />
  </Plot>
</InputContext>
