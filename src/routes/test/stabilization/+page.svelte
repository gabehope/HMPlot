<script>
 import { Plot, Points, Line, Heatmap, Minimap, Text, Segments, Area, Rect, Prism } from '$lib';
import { Arrows, ErrorBars } from '$lib/charts/index.js';
 import {tick,onDestroy} from 'svelte';
 let plot=$state(),mark=$state(),other=$state(),overview=$state(true),externals=$state(true),mode=$state('2d'),count=$state(1000),size=$state(10),phase=$state(0),width=$state(800),hidden=$state(false),mounted=$state(true),sourceB=$state(false),kind=$state('points'),diag=$state();
 const points=$derived(Array.from({length:count},(_,i)=>[Math.sin(i*12.9898+phase)*4,Math.cos(i*7.233+phase)*4]));
 const signal=$derived(Array.from({length:count},(_,i)=>[i/Math.max(1,count-1)*8-4,Math.sin(i*.03+phase)*3]));
 const xs=$derived(signal.map(p=>p[0])), ys=$derived(signal.map(p=>p[1])),lower=$derived(ys.map(v=>v-.2)),upper=$derived(ys.map(v=>v+.2)),ends=$derived(points.map(p=>[p[0]+.1,p[1]+.1])),text=$derived(points.map((_,i)=>"Label "+i%16));
 const raster=$derived(Array.from({length:Math.round(Math.sqrt(count))},(_,y)=>Array.from({length:Math.round(Math.sqrt(count))},(_,x)=>Math.sin(x*.03+phase)*Math.cos(y*.03))));
 async function settled(){await tick();await plot?.whenSettled();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
 $effect(()=>{if(plot)window.__stabilization={plot:()=>plot,mark:()=>mark,set:async(v)=>{if(v.count!==undefined)count=v.count;if(v.phase!==undefined)phase=v.phase;if(v.size!==undefined)size=v.size;if(v.mode!==undefined)mode=v.mode;if(v.overview!==undefined)overview=v.overview;if(v.externals!==undefined)externals=v.externals;if(v.width!==undefined)width=v.width;if(v.hidden!==undefined)hidden=v.hidden;if(v.mounted!==undefined)mounted=v.mounted;if(v.sourceB!==undefined)sourceB=v.sourceB;if(v.kind!==undefined)kind=v.kind;await settled();},settled,read:()=>plot?.getDiagnostics(),enable:()=>plot?.getDiagnostics({enabled:true})};});
 onDestroy(()=>{delete window.__stabilization;});
</script>
<svelte:head><title>Stabilization fixtures</title></svelte:head>
<main>
 <h1>Stabilization fixtures</h1>
 <div class="controls"><label>Mark<select bind:value={kind}><option value="points">Points</option><option value="line">Line</option><option value="heatmap">Heatmap</option>{#each ["segments","arrows","labels","errorbars","ribbon","rect","prism"] as k}<option value={k}>{k}</option>{/each}</select></label><label>Instances<input type="number" min="1" max="1000000" bind:value={count}/></label><label>Size<input type="range" min="2" max="20" bind:value={size}/></label><button onclick={()=>phase+=.2}>Update</button><button onclick={()=>mode=mode==='2d'?'3d':'2d'}>Switch view</button><label><input type="checkbox" bind:checked={overview}/>Overview</label><button onclick={()=>diag=plot.getDiagnostics({enabled:true})}>Diagnostics</button></div>
 <div style:width={width+'px'} style:max-width="100%" style:display={hidden?'none':undefined}>
 {#if mounted}<Plot bind:this={plot} responsive height={450} type={mode} {overview} axes2d x={{domain:[-5,5]}} y={{domain:[-5,5]}}>
 {#if kind==='points'}<Points bind:this={mark} position={points} {size} scaleBounds={[0,20]} scaleRange={[0,20]} fill="#b14b58"/>{:else if kind==='line'}<Line bind:this={mark} position={signal} width={1} widthBounds={[0,1]} />{:else if kind==='segments'}<Segments bind:this={mark} start={points} end={ends} width={1}/>
 {:else if kind==='arrows'}<Arrows bind:this={mark} start={points} end={ends}/>
 {:else if kind==='labels'}<Text bind:this={mark} position={points} {text}/>
 {:else if kind==='errorbars'}<ErrorBars bind:this={mark} position={signal} {lower} {upper}/>
 {:else if kind==='ribbon'}<Area opacity={0.2} bind:this={mark} x={xs} {lower} {upper}/>
 {:else if kind==='rect'}<Rect bind:this={mark} x0={xs} x1={xs.map(x=>x+.05)} y0={lower} y1={upper}/>
 {:else if kind==='prism'}<Prism bind:this={mark} x={xs} y={ys} z0={0} z1={1} width={.08} depth={.08}/>
 {:else}<Heatmap bind:this={mark} fill={raster} />{/if}
 </Plot>{/if}
 {#if externals}<div class="maps"><Minimap for={sourceB?other:plot} width={260} height={110} axes/><Minimap for={plot} width={180} height={110}/></div>{/if}
 </div>
 <div style:display={sourceB?'block':'none'}><Plot bind:this={other} width={240} height={160}><Points position={[[0,0]]} fill="orange" size={5}/></Plot></div>
 {#if diag}<pre>{JSON.stringify(diag,null,2)}</pre>{/if}
</main>
<style>main{padding:20px;font:14px system-ui}.controls,.maps{display:flex;gap:12px;flex-wrap:wrap}.controls{margin-bottom:16px}label{display:flex;gap:6px;align-items:center}pre{max-height:240px;overflow:auto}</style>
