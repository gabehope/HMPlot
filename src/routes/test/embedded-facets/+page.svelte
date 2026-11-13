<script>
 import { Plot, Facet } from '$lib';
import { Bar } from '$lib/charts/index.js';
 let plot=$state(),facet=$state(),layout=$state('bands');
 $effect(()=>{if(plot&&facet)window.embeddedFacets={plot,facet,setLayout:v=>layout=v};return()=>delete window.embeddedFacets;});
</script>
<Plot bind:this={plot} data={{group:['A','A','B','B'],year:['2024','2025','2024','2025'],total:[1,2,3,4]}} width={600} height={400} axes2d y={{domain:[0,5]}}>
 <Facet bind:this={facet} column="group" {layout} scales="shared" bandPadding={0.2}>
  <Bar x="year" y="total" fill="year"/>
 </Facet>
</Plot>
