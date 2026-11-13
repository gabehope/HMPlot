<script>
  import { untrack } from "svelte";
  let {onready=()=>{}}=$props();
  let plot=$state();
  $effect(()=>{if(plot)untrack(()=>onready(plot));});
  import { Plot, Facet } from "$lib";
import { Bar } from "$lib/charts/index.js";
  const data = {
    region: ["North", "North", "South", "South", "West", "West"],
    year: ["2024", "2025", "2024", "2025", "2024", "2025"],
    total: [12, 18, 9, 15, 21, 25],
  };
</script>
<Plot bind:this={plot} {data} responsive height={420} axes2d y={{domain:[0,30]}}>
  <Facet column="region" bandPadding={0.2}>
    <Bar x="year" y="total" fill="year" />
  </Facet>
</Plot>