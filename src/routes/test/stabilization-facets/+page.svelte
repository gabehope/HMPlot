<script>
 import {Data,Facet,Plot,Points} from '$lib';import {tick,onDestroy} from 'svelte';
 let count=$state(4),facet=$state();const data=$derived(Array.from({length:count*100},(_,i)=>({group:'Cell '+Math.floor(i/100),x:Math.sin(i*.1),y:Math.cos(i*.13)})));
 $effect(()=>{if(facet)window.__facetStability={set:async n=>{count=n;await tick();await facet.whenSettled();},read:()=>facet.getPlots().map(p=>p.plot.getDiagnostics())};});onDestroy(()=>delete window.__facetStability);
</script>
<main><h1>Facet lifecycle</h1><label>Cells<select bind:value={count}><option value={4}>4</option><option value={16}>16</option><option value={64}>64</option></select></label><Data value={data}><Facet bind:this={facet} column="group" wrap={4} link="xy"><Plot height={220} axes2d><Points x="x" y="y" size={2.5}/></Plot></Facet></Data></main>
<style>main{padding:16px;font:14px system-ui}</style>
