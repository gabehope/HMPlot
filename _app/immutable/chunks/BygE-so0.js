const t=`<script>
 import {Plot,Facet,Data,Points} from '$lib';
  import {untrack} from 'svelte';
  let {plot=$bindable(),onready=undefined}=$props();
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
 const data=Array.from({length:40},(_,i)=>({length:i/10,width:Math.sin(i*.4),height:Math.cos(i*.23)+i*.04,group:i%2?'A':'B'}));
<\/script>
<Data value={data}><Facet pairs={['length','width','height']} link="grid"><Plot height={240} axes2d><Points x="x" y="y" fill="group" size={4} brush respond="brushed"/></Plot></Facet></Data>
`;export{t as default};
