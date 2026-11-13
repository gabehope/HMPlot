<script>
  import { Provider, InputContext, Select, Plot, Points, Filter, categorical, input } from "$lib";
import { Smooth } from "$lib/charts/index.js";
  import { onMount, untrack } from "svelte";
  let { onready } = $props(), plot = $state(), smooth = $state();
  const species = categorical({ domain: ["Adelie", "Chinstrap", "Gentoo"] });
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = { get smooth() { return smooth; } };
    window.__smoothExample = exposed;
    return () => { if (window.__smoothExample === exposed) delete window.__smoothExample; };
  });
</script>

<p>
  Shift-drag to brush some penguins: the fit and its 95% band are refitted to the brushed ones on
  the GPU as the brush moves. Clear the brush to fit them all. Data: Palmer penguins (CC0).
</p>
<InputContext>
  <Select name="method" options={["linear", "poly", "log", "exp", "pow"]} value="linear" label="Fit" />
  <Provider url="/data/penguins/penguins.csv" format="csv">
    <!-- Fixed domains: with few brushed penguins the band is wide (or empty), and the axes stay put. -->
    <Plot bind:this={plot} responsive height={420} axes2d legend fillScale={species}
      x={{ domain: [170, 235] }} y={{ domain: [2500, 6500] }}>
      <Points x="flipper_length_mm" y="body_mass_g" fill="species" size={3.5} brush respond="brushed" />
      <Filter where="@brushed" inactive="all">
        <Smooth bind:this={smooth} x="flipper_length_mm" y="body_mass_g" method={input("method")} />
      </Filter>
    </Plot>
  </Provider>
</InputContext>
