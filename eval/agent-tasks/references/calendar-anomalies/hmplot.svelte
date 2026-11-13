<script>
  import {expose} from "./web-utils.js";
  $effect(()=>expose("overview",overview));
  let colorMarks=$state([]),calendars=$state([]); $effect(()=>{const stops=calendars.map((p,i)=>expose(`calendar${i}`,p));return ()=>stops.forEach(stop=>stop?.());});

  import {csvParse} from 'd3';import {Legend,Plot,Data,Rect,Text,Line,continuous,categorical} from 'hmplot';
  import {parquet,rangeBrush} from './web-utils.js';import url from './data/readings.parquet?url';import csv from './data/sensors.csv?raw';
  const meta=csvParse(csv),regions=[...new Set(meta.map(r=>r.region))].sort(),regionOf=new Map(meta.map(r=>[r.sensor,regions.indexOf(r.region)])),epoch=Date.UTC(2024,0,1);
  const dates=Array.from({length:366},(_,day)=>{const date=new Date(epoch+day*86400000);return {day,date:date.toISOString().slice(0,10),month:date.getUTCMonth(),x0:Math.floor(day/7),x1:Math.floor(day/7)+.9,y0:6-day%7,y1:6-day%7+.9};});
  const months=dates.filter(d=>d.date.endsWith('-01')).map(d=>({x:d.x0+.5,y:7.5,label:new Date(epoch+d.day*86400000).toLocaleString('en-US',{month:'short',timeZone:'UTC'})}));
  const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,i)=>({label,x:-.5,y:6-i+.45}));
  const loaded=parquet(url).then(rows=>{
    const daily=regions.map(()=>Array.from({length:366},()=>({sum:0,count:0}))),monthly=regions.map(()=>Array.from({length:12},()=>({sum:0,count:0}))),hourly=regions.map(()=>Array.from({length:366*24},()=>({sum:0,count:0})));
    for(const r of rows){const hour=Math.floor((+r.time-epoch)/3600000),day=Math.floor(hour/24),region=regionOf.get(r.sensor);for(const acc of [daily[region][day],monthly[region][dates[day].month],hourly[region][hour]]){acc.sum+=r.temp_c;acc.count++;}}
    const calendars=regions.map((region,i)=>({region,days:dates.map(d=>{const a=daily[i][d.day],baseline=monthly[i][d.month];return {...d,mean:a.count?a.sum/a.count:NaN,anomaly:a.count?a.sum/a.count-baseline.sum/baseline.count:NaN,count:a.count};})}));
    const limit=Math.max(...calendars.flatMap(c=>c.days.filter(d=>d.count).map(d=>Math.abs(d.anomaly))));
    const overview=dates.map(d=>{const sum=daily.reduce((s,r)=>s+r[d.day].sum,0),count=daily.reduce((s,r)=>s+r[d.day].count,0);return {day:d.day,mean:count?sum/count:NaN};});
    return {calendars,hourly,limit,overview};
  });
  let interval=$state([0,365]),hover=$state(null),overview=$state();
  const colors=categorical({domain:regions,range:['#357fa3','#b87835','#7762a1','#4e9769','#bc6167','#4d9e9d']});
  function profiles(source){return regions.flatMap((region,i)=>Array.from({length:24},(_,hour)=>{let sum=0,count=0;for(let day=interval[0];day<=interval[1];day++){const a=source.hourly[i][day*24+hour];sum+=a.sum;count+=a.count;}return {region,hour,mean:count?sum/count:NaN,count};}));}
</script>
<svelte:head><title>Temperature anomaly calendar</title></svelte:head>
<main><h1>Temperature anomaly calendar</h1><p>Daily available-reading means relative to each region's fixed monthly mean. Grey means missing; white is a zero anomaly. Monday starts each calendar week.</p>
<label>Start date <input aria-label="Start date" type="date" min="2024-01-01" max="2024-12-31" value={dates[interval[0]].date} onchange={e=>interval=[Math.round((Date.parse(e.currentTarget.value)-epoch)/86400000),interval[1]]}/></label><label>End date <input aria-label="End date" type="date" min="2024-01-01" max="2024-12-31" value={dates[interval[1]].date} onchange={e=>interval=[interval[0],Math.round((Date.parse(e.currentTarget.value)-epoch)/86400000)]}/></label><button onclick={()=>interval=[0,365]}>Clear range</button>
{#await loaded}<p>Loading calendar…</p>{:then source}
{@const profile=profiles(source)}
<div class="calendars">{#each source.calendars as calendar,i}<Plot autoBounds bind:this={calendars[i]} title={calendar.region} width={570} height={220} axes2d={false} legend={false} x={{domain:[-4,53]}} y={{domain:[-.2,8]}}>
<Data value={calendar.days}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#bcc4ce"/></Data>
<Data value={calendar.days.filter(d=>d.count).map(d=>({...d,alpha:d.day>=interval[0]&&d.day<=interval[1]?1:.2,border:d.day===hover?2:0}))}><Rect bind:this={colorMarks[i]} x0="x0" x1="x1" y0="y0" y1="y1" fill="anomaly" fillScale={continuous({domain:[-source.limit,source.limit],colormap:'RdBu'})} opacity="alpha" outlineColor="#192f42" outlineWidth="border" tooltip={['date','mean','anomaly','count']} onpointermove={e=>hover=calendar.days.filter(d=>d.count)[e.sourceRow??e.rowIndex].day}/></Data>
<Data value={months}><Text x="x" y="y" text="label" size={10}/></Data><Data value={weekdays}><Text x="x" y="y" text="label" size={8} align="right"/></Data>
{#if colorMarks[i]}<Legend target={colorMarks[i]} channel="fill" label="Anomaly (°C)"/>{/if}</Plot>{/each}</div>
<div use:rangeBrush={{plot:()=>overview,min:0,max:365,change:value=>interval=value}}><Plot autoBounds bind:this={overview} title="Full-year daily mean" width={1160} height={170} responsive interactive={false} x={{domain:[0,366],label:'Day of 2024 · drag a date interval'}} y={{domain:[-10,40]}}><Data value={source.overview}><Line x="day" y="mean" color="#3b789c"/></Data><Rect x0={interval[0]} x1={interval[1]+1} y0={-10} y1={40} fill="#3c8caf" opacity={.15}/></Plot></div>
<p data-testid="interval">{dates[interval[0]].date} through {dates[interval[1]].date} · <output data-testid="reading-count">{profile.reduce((s,r)=>s+r.count,0)}</output> contributing readings</p>
<Plot autoBounds title="Hourly temperature profile" width={1160} height={270} responsive x={{domain:[0,23],label:'Hour (UTC)'}} y={{label:'Temperature (°C)'}}><Data value={profile}><Line x="hour" y="mean" series="region" color="region" colorScale={colors} width={2} tooltip={['region','hour','mean','count']}/></Data></Plot>
{#if hover!==null}<table><caption>{dates[hover].date}</caption><thead><tr><th>Region</th><th>Mean</th><th>Anomaly</th><th>Readings</th></tr></thead><tbody>{#each source.calendars as c}<tr><td>{c.region}</td><td>{c.days[hover].mean.toFixed(4)}</td><td>{c.days[hover].anomaly.toFixed(4)}</td><td>{c.days[hover].count}</td></tr>{/each}</tbody></table>{/if}
{:catch error}<p role="alert">{error.message}</p>{/await}</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:13px system-ui}main{max-width:1200px;margin:auto;padding:20px}.calendars{display:grid;grid-template-columns:repeat(2,570px);gap:12px;margin-top:20px}h1{margin:0}input{margin:0 16px 0 6px}button{padding:5px 10px}td,th{padding:4px 15px;text-align:left}</style>
