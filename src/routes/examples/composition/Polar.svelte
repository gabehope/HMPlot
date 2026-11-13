<script>
 import {Plot,Line,Points} from '$lib';
  import {untrack} from 'svelte';
  let {plot=$bindable(),onready=undefined}=$props();
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
 let phase=$state(-90);
 const data=$derived(Array.from({length:49},(_,i)=>({
  angle:i*7.5+phase,radius:2+.6*Math.cos(i*Math.PI/6)
 })));
</script>
<label>Angle origin <input aria-label="Angle origin" type="range" min={-180} max={180} step={15} bind:value={phase} /> {phase}°</label>
<Plot bind:this={plot} {data} coordinates="polar" baseRadius={0} radialScale={1}
 y={{domain:[0,3]}} responsive height={440}>
 <Line x="angle" y="radius" width={2} color="#547ba2" />
 <Points x="angle" y="radius" size={2.5} fill="#cf8955" />
</Plot>
