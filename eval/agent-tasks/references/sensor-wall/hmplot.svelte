<script>
  import {expose} from "./web-utils.js";
  $effect(()=>expose("overview",overview));

  import {csvParse} from 'd3';import {Plot,Data,Line,Points,Rect} from 'hmplot';
  import {parquet,rangeBrush} from './web-utils.js';import url from './data/readings.parquet?url';import csv from './data/sensors.csv?raw';
  const sensors=csvParse(csv).sort((a,b)=>a.region.localeCompare(b.region)||a.sensor.localeCompare(b.sensor)),epoch=Date.UTC(2024,0,1),hours=366*24;
  const loaded=parquet(url).then(rows=>{
    const tables=new Map(sensors.map(s=>[s.sensor,Array.from({length:hours},(_,hour)=>({sensor:s.sensor,region:s.region,day:hour/24,temp:NaN,mean:NaN,sd:NaN}))]));
    const sum=new Float64Array(366),count=new Uint32Array(366);let low=Infinity,high=-Infinity;
    for(const r of rows){const h=Math.round((+r.time-epoch)/3600000);tables.get(r.sensor)[h].temp=r.temp_c;sum[Math.floor(h/24)]+=r.temp_c;count[Math.floor(h/24)]++;low=Math.min(low,r.temp_c);high=Math.max(high,r.temp_c);}
    const panels=sensors.map(s=>{const values=tables.get(s.sensor);let sum=0,squares=0,n=0;for(let i=0;i<hours;i++){const v=values[i].temp;if(Number.isFinite(v)){sum+=v;squares+=v*v;n++;}if(i>=168&&Number.isFinite(values[i-168].temp)){const old=values[i-168].temp;sum-=old;squares-=old*old;n--;}if(Number.isFinite(v)&&n>=24){values[i].mean=sum/n;values[i].sd=Math.sqrt(Math.max(0,(squares-sum*sum/n)/(n-1)));}}return {...s,values,outliers:values.filter(v=>Number.isFinite(v.mean)&&Math.abs(v.temp-v.mean)>4*v.sd),missing:values.filter(v=>!Number.isFinite(v.temp)).length};});
    return {panels,low:low-1,high:high+1,daily:Array.from(sum,(v,day)=>({day,mean:count[day]?v/count[day]:NaN})),count:rows.length};
  });
  let interval=$state([0,365]),overview=$state();
</script>
<svelte:head><title>Sensor temperatures 2024</title></svelte:head>
<main><h1>Sensor temperatures 2024</h1><p>Blue: hourly readings; amber: trailing seven-day mean. Red: more than four sample standard deviations from that mean (at least 24 available readings). Gaps remain missing.</p>
<label>Start day <input aria-label="Start day" type="number" min="0" max="365" value={interval[0]} onchange={e=>interval=[+e.currentTarget.value,interval[1]]}/></label><label>End day <input aria-label="End day" type="number" min="0" max="365" value={interval[1]} onchange={e=>interval=[interval[0],+e.currentTarget.value]}/></label><button onclick={()=>interval=[0,365]}>Clear range</button>
{#await loaded}<p>Loading sensor readings…</p>{:then source}
<div class="wall">{#each source.panels as panel (panel.sensor)}<Plot autoBounds title={`${panel.region} · ${panel.sensor}`} width={188} height={165} x={{domain:[interval[0],interval[1]+1],label:'Day',tickCount:3}} y={{domain:[source.low,source.high],label:'°C',tickCount:3}}>
<Data value={panel.values}><Line x="day" y="temp" tooltip={["sensor","region","day","temp"]} color="#4d819e" width={1}/><Line x="day" y="mean" color="#bf8c3c" width={1.2}/></Data>
{#if panel.outliers.length}<Data value={panel.outliers}><Points x="day" y="temp" size={3.5} fill="#d7473c" tooltip={['day','temp','mean','sd']}/></Data>{/if}
</Plot>{/each}</div>
<div use:rangeBrush={{plot:()=>overview,min:0,max:365,change:value=>interval=value}}><Plot autoBounds bind:this={overview} title="Sensor temperatures 2024" width={1170} height={190} responsive interactive={false} x={{domain:[0,366],label:'Drag to choose the detail interval'}} y={{domain:[source.low,source.high],label:'Daily mean (°C)'}}><Data value={source.daily}><Line x="day" y="mean" color="#315f7b" width={2}/></Data><Rect x0={interval[0]} x1={interval[1]+1} y0={source.low} y1={source.high} fill="#3c8caf" opacity={.15}/></Plot></div>
<details><summary>Missing readings and detected outliers</summary><table><thead><tr><th>Sensor</th><th>Missing hours</th><th>Outliers</th></tr></thead><tbody>{#each source.panels as p}<tr><td>{p.sensor}</td><td>{p.missing}</td><td>{p.outliers.length}</td></tr>{/each}</tbody></table></details>
{:catch error}<p role="alert">{error.message}</p>{/await}</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:13px system-ui}main{max-width:1200px;margin:auto;padding:20px}.wall{display:grid;grid-template-columns:repeat(6,188px);gap:8px;margin:15px 0}h1{margin:0}input{width:70px;margin:0 15px 0 5px}button{padding:5px 12px}td,th{padding:3px 15px;text-align:left}</style>
