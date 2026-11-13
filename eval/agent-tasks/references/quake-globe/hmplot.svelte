<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  import {onMount} from 'svelte';import {csvParse} from 'd3';
  import {Plot,Data,Points,Rect,continuous} from 'hmplot';
  import csv from './data/earthquakes.csv?raw';
  const epoch=Date.UTC(2024,0,1),rows=csvParse(csv,r=>({...r,lon:+r.lon,lat:+r.lat,magnitude:+r.magnitude,depth_km:+r.depth_km,day:(Date.parse(r.time+"Z")-epoch)/86400000}));
  let day=$state(180),playing=$state(false);
  const current=$derived(rows.filter(r=>r.day>day-30&&r.day<=day).map(r=>({...r,alpha:.15+.85*(r.day-day+30)/30})));
  const bins=$derived(Array.from({length:36},(_,i)=>({x0:i*20,x1:(i+1)*20,count:current.filter(r=>r.depth_km>=i*20&&r.depth_km<(i+1)*20).length})));
  onMount(()=>{const timer=setInterval(()=>{if(playing)day=day>=366?30:Math.min(366,day+.6);},50);return ()=>clearInterval(timer);});
  const date=d=>new Date(epoch+d*86400000).toISOString().slice(0,10);
</script>
<svelte:head><title>Earthquakes by depth</title></svelte:head>
<main><h1>Earthquakes by depth</h1><p>Drag the orthographic globe to rotate. Brighter points are newer within the rolling 30-day window; color encodes depth.</p>
<div class="controls"><button onclick={()=>playing=!playing}>{playing?'Pause':'Play'}</button><label>Window end · day of 2024 <input aria-label="Window end" type="range" min="30" max="366" step=".25" bind:value={day}/></label><output>{date(day-30)} – {date(day)}</output><span data-testid="count">{current.length} earthquakes</span></div>
<div class="views"><Plot autoBounds legend bind:this={primary} title="Earthquakes by depth" coordinates="spherical" projection="orthographic" projectionCenter={[135,15]} width={650} height={540} responsive>
<Data value={current}><Points x="lon" y="lat" size="magnitude" sizeScale={continuous({domain:[2,9],range:[1.5,8]})} fill="depth_km" fillScale={continuous({domain:[0,700],colormap:'Viridis'})} opacity="alpha" tooltip={['time','magnitude','depth_km']}/></Data>
</Plot><Plot autoBounds title="Depth (km)" width={500} height={540} responsive x={{domain:[0,720],label:'Depth (km)'}} y={{label:'Earthquakes'}}><Data value={bins}><Rect x0="x0" x1="x1" y0={0} y1="count" fill="#3983be"/></Data></Plot></div>
<details><summary>Depth counts in the current window</summary><table><thead><tr><th>Depth (km)</th><th>Count</th></tr></thead><tbody>{#each bins as b}<tr><td>{b.x0}–{b.x1}</td><td>{b.count}</td></tr>{/each}</tbody></table></details></main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.controls{display:flex;align-items:center;gap:16px;margin:20px 0}.views{display:grid;grid-template-columns:1.3fr 1fr;gap:22px}input{width:300px}button{padding:6px 12px}td,th{padding:4px;text-align:left}</style>
