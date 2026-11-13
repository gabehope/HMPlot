<script>
 import {page} from '$app/state';
 import {Plot,Points,where} from '$lib';
 // ?tooltip (TODO 44): the points take a tooltip, and a sixth point sits behind the first, on the
 // camera's axis in the 3D test's view.
 const tooltip=page.url.searchParams.has('tooltip'), unified=page.url.searchParams.has('unified');
 let mounted=$state(true);
 let type=$state('2d'), plot=$state(), points=$state();
 const data=tooltip
  ?{x:[.5,.35,.55,.75,.85,.5],y:[.5,.75,.35,.65,.15,.5],z:[.5,.8,.35,.65,.9,.2]}
  :{x:[.5,.35,.55,.75,.85],y:[.5,.75,.35,.65,.15],z:[.5,.8,.35,.65,.9]};
 $effect(()=>{window.__hover3d={plot,points,data,setMounted:(value)=>mounted=value};return()=>{delete window.__hover3d;};});
</script>
<button onclick={()=>type=type==='2d'?'3d':'2d'}>Switch view</button>
{#if mounted}
<Plot tooltip={unified?{mode:"x"}:undefined} bind:this={plot} {data} {type} height={600} settings={{showTrigger:false}} x={{domain:[0,1]}} y={{domain:[0,1]}} z={{domain:[0,1]}}>
 <Points bind:this={points} x="x" y="y" z="z" brush={unified} hover select size={where('@hovered',12,8)} tooltip={tooltip?['z']:undefined} />
</Plot>
{/if}
