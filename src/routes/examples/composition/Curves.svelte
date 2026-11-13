<script>
 import { Plot, Line, Points } from '$lib';
import { Arrows } from '$lib/charts/index.js';
  import {untrack} from 'svelte';
  let {plot=$bindable(),onready=undefined}=$props();
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
 let curve=$state('catmull-rom');
 const points=[[0,0],[1,2],[2,1],[3,3],[4,1],[5,2]];
</script>
<label>Curve <select aria-label="Curve" bind:value={curve}>{#each ['linear','step','step-before','step-after','monotone-x','catmull-rom','basis'] as c}<option>{c}</option>{/each}</select></label>
<Plot bind:this={plot} responsive height={440} axes2d x={{domain:[-.5,5.5]}} y={{domain:[-1,4]}}>
 <Line position={points} {curve} color="#547ba2" width={2}/>
 <Points position={points} size={3} fill="#cf8955"/>
 <Arrows start={[[0,-.5]]} end={[[4,-.5]]} curve="cubic" control1={[[1,.7]]} control2={[[3,.7]]} color="#30343b"/>
</Plot>
