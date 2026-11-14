const t=`<script>
 import {Plot,Mapping,Points,Text} from '$lib';
  import {untrack} from 'svelte';
  let {plot=$bindable(),onready=undefined}=$props();
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
 const data=[{x:1,y:1,name:'North',group:'A'},{x:2,y:3,name:'East',group:'B'},{x:4,y:2,name:'West',group:'A'}];
<\/script>
<Plot bind:this={plot} {data} responsive height={400} axes2d x={{domain:[0,6]}} y={{domain:[0,4]}}><Mapping x="x" y="y" fill="group" opacity={.9}><Points size={4.5}/><Text text="name" dx={10} align="left" color="#30343b"/></Mapping></Plot>
`;export{t as default};
