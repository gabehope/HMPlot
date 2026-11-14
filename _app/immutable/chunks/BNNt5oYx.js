const t=`<script>
  import { Facet, Plot } from "$lib";
import { Histogram } from "$lib/charts/index.js";
  let { plot = $bindable() } = $props();
  const data = {
    value: Array.from({ length: 120 }, (_, i) => Math.sin(i * 1.7) + (i % 3)),
    group: Array.from({ length: 120 }, (_, i) => ["A", "B", "C"][i % 3]),
  };
<\/script>

<Facet bind:this={plot} {data} column="group" wrap={3} link="x">
  <Plot height={260} axes2d
    ><Histogram x="value" bins={12} fill="#547ba2" /></Plot
  >
</Facet>
`;export{t as default};
