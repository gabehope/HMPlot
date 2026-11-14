const e=`<script>
  import { Provider, Plot, Legend, categorical } from "$lib";
import { Ecdf } from "$lib/charts/index.js";
  import { untrack } from "svelte";
  let { onready } = $props(), plot = $state(), chart = $state();
  const species = categorical({ domain: ["Adelie", "Chinstrap", "Gentoo"] });
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
<\/script>

<p>Each species' body mass as steps: the fraction of its penguins at or below each mass. Data: Palmer penguins (CC0).</p>
<Provider url="/data/penguins/penguins.csv" format="csv">
  <Plot bind:this={plot} responsive height={400} axes2d colorScale={species}>
    <Ecdf bind:this={chart} x="body_mass_g" by="species" />
    <Legend for={chart} channel="color" position="right" />
  </Plot>
</Provider>
`;export{e as default};
