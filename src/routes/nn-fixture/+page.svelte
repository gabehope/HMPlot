<script>
import { onMount, tick } from 'svelte';
import { Plot, Image, Heatmap, Line, initializePlot, continuous } from '$lib/index';
import { numpy as np } from '@hmplot/jax';
let ready=$state(false), image=$state(), fixed=$state(), plots=$state([]),count=$state(2),line=$state(),shown=$state(true);
onMount(()=>{let alive=true; initializePlot().then(()=>{if(!alive)return; image=np.array([[[1,0,0],[0,1,0]],[[0,0,1],[1,1,1]]], {dtype:np.float32}); fixed=np.full([4,4],0.25);line=np.array([[-.8,-.5],[.8,.5]]);ready=true;});
window.nnFixture={grow:async()=>{const old=line;count=count>=256?2:count*2;line=np.array(Array.from({length:count},(_,i)=>[-.8+1.6*i/(count-1),Math.sin(i)*.5]),{dtype:np.float32});old.dispose();await tick();},remount:async()=>{shown=false;await tick();shown=true;await tick();},settle:()=>Promise.all(plots.filter(Boolean).map(p=>p.whenSettled())), stats:()=>plots.map(p=>p.getDiagnostics()), change:()=>{const old=fixed;fixed=np.full([16,16],0.75);old.dispose();}};
return()=>{alive=false;image?.dispose();fixed?.dispose();line?.dispose();delete window.nnFixture;};});
</script>
{#if ready && shown}
<Plot axes2d={false} toneMapping={0} bind:this={plots[0]} width={240} height={240} settings={{showTrigger:false}} maxElements={1} resolution={64}><Image data={image} xrange={[-30,30]} yrange={[-30,30]} /></Plot>
<Plot toneMapping={0} bind:this={plots[1]} width={240} height={240} settings={{showTrigger:false}} maxElements={1} resolution={64}><Heatmap fill={fixed} fillScale={continuous({ domain: [0,1] })} xrange={[-30,30]} yrange={[-30,30]} /></Plot>
<Plot bind:this={plots[2]} width={240} height={80} settings={{showTrigger:false}}><Line position={line} maxElements={count} color="black" width={2}/></Plot>
{/if}
