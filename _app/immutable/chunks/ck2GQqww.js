const n=`<script>
  import { Provider, InputContext, Checkbox, Plot, Points, categorical, input } from "$lib";
import { DensityContour, DensityBands } from "$lib/charts/index.js";
  import { untrack } from "svelte";
  let { onready } = $props(), plot = $state();
  const species = categorical({ domain: ["Adelie", "Chinstrap", "Gentoo"] });
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
<\/script>

<p>
  The density of penguins' bill length against depth, as filled bands, contour lines or both, computed on
  the GPU: Density, then Contour's marching squares (DensityBands and DensityContour). Data: Palmer penguins (CC0).
</p>
<InputContext>
  <Checkbox name="bands" value={true} label="Bands" />
  <Checkbox name="lines" value={false} label="Lines" />
  <Provider url="/data/penguins/penguins.csv" format="csv">
    <Plot bind:this={plot} responsive height={420} axes2d fillScale={species}
      x={{ domain: [30, 62] }} y={{ domain: [12.5, 22] }}>
      <DensityBands x="bill_length_mm" y="bill_depth_mm" thresholds={10} opacity={0.85} visible={input("bands")} />
      <DensityContour x="bill_length_mm" y="bill_depth_mm" thresholds={10} opacity={0.85} visible={input("lines")} />
      <Points x="bill_length_mm" y="bill_depth_mm" fill="species" size={2.5} />
    </Plot>
  </Provider>
</InputContext>
`;export{n as default};
