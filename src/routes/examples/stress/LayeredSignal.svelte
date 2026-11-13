<script lang="ts">
  import { Plot, Data, Area, Line, Points, Legend, Minimap } from "$lib";
import { ErrorBars } from "$lib/charts/index.js";
  let { onready } = $props();
  let overviewWidth = $state(600);
  let plot = $state<any>(), phase = $state(0), animated = $state(true);
  const rows = $derived(Array.from({length: 512}, (_, i) => {
    const x = i / 16, y = Math.sin(x + phase) + 0.3 * Math.cos(x * 2.7 - phase), band = 0.12 + 0.25 * Math.pow(Math.sin(x * .35), 2);
    return { x, y, lower: y-band, upper:y+band };
  }));
  const measurements = $derived(rows.filter((_,i)=> i%16 === 0).map((r,i)=>({...r, y:r.y+0.08*Math.sin(i*7), lower:r.y-.18, upper:r.y+.18})));
  $effect(() => {if(plot) onready?.(plot)});
</script>
<div class="toolbar"><button onclick={()=>phase+=.8}>New target</button><label><input type="checkbox" bind:checked={animated}/> Animate</label></div>
<Plot x={{ domain: [0,32] }} y={{ domain: [-2,2] }} bind:this={plot} responsive height={420} axes2d animation={animated} animationDuration={700} zoomAxis="x" legend>
  <Data value={rows}>
    <Area opacity={0.2} x="x" lower="lower" upper="upper" fill="#577eac" label="Interval"/>
    <Line x="x" y="y" width={1.5} color="#325b83" label="Estimate"/>
  </Data>
  <Data value={measurements}>
    <ErrorBars x="x" y="y" lower="lower" upper="upper" color="#754331" capSize={5}/>
    <Points x="x" y="y" fill="#b77450" size={7} outlineColor="#fffaf0" outlineWidth={0.7} label="Observations"/>
  </Data>
</Plot>
<div bind:clientWidth={overviewWidth}><Minimap for={plot} width={overviewWidth} height={100} axes={{x:true,y:false}}/></div>
<p>Brush the view with the overview, zoom along X, toggle series, and interrupt animated updates.</p>
<style>.toolbar {display:flex;gap:16px;margin-bottom:12px} p{font-size:12px;color:#697785}</style>
