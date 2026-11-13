<script>
 import {onMount} from 'svelte';import {numpy as np} from '@hmplot/jax';import {Plot,Heatmap,initializePlot} from '$lib/index';import Probe from './Probe.svelte';
 let data=$state(),v=$state({x:.5,y:.5,zoom:1}),a=$state(),b=$state(),c=$state(),p1=$state(),p2=$state(),p3=$state();
 onMount(()=>{let alive=true;initializePlot().then(()=>{if(alive)data=np.array([[0,1],[2,3]]);});window.__linked={read:()=>[p1,p2,p3].map((p)=>p?.getDiagnostics().viewport)};return()=>{alive=false;data?.dispose();delete window.__linked;};});
</script>
{#if data}<div style="display:flex"><Plot bind:this={p1} width={200} height={200} viewport={v} onviewportchange={next=>v=next} settings={{showTrigger:false}}><Probe bind:this={a}/><Heatmap fill={data}/></Plot><Plot bind:this={p2} width={200} height={200} viewport={v} onviewportchange={next=>v=next} settings={{showTrigger:false}}><Probe bind:this={b}/><Heatmap fill={data}/></Plot><Plot bind:this={p3} width={200} height={200} viewport={{x:.5,y:.5,zoom:1}} interactive={false} settings={{showTrigger:false}}><Probe bind:this={c}/><Heatmap fill={data}/></Plot></div>{/if}
