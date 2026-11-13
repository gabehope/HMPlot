<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  // The aggregation stays in HMPlot (TODO 145.6): a plain drag brushes the hour histogram
  // (interactive="brush"), its whole hours filter the 200,000 flights on the GPU, two Groups
  // count them by route and by airport, a Join gives the routes their statistics, and
  // TableViews list them. Hovering an airport writes an input the routes read.
  import {csvParse,autoType} from 'd3';
  import {Plot,Data,Filter,Group,Join,Sort,Calculate,Segments,Points,TableView,InputContext,continuous,count,mean,greater_equal,less_equal,subtract,multiply,where,logical_or,equal,is_missing,input} from 'hmplot';
  import {Histogram} from 'hmplot/charts';
  import {parquet} from './web-utils.js';import url from './data/flights.parquet?url';import csv from './data/airports.csv?raw';
  const airports=csvParse(csv,autoType),lookup=new Map(airports.map(a=>[a.code,a]));
  const airportTable={code:airports.map(a=>a.code),name:airports.map(a=>a.name),lon:airports.map(a=>a.lon),lat:airports.map(a=>a.lat)};
  // The flights as columns, with each route's key ("A → B") and its alphabetical rank (ties in
  // the top ten go by key); the routes' geometry, once.
  const loaded=parquet(url).then(rows=>{
    const key=rows.map(r=>`${r.origin} → ${r.dest}`),keys=[...new Set(key)].sort((a,b)=>a.localeCompare(b)),rank=new Map(keys.map((k,i)=>[k,i]));
    const ends=keys.map(k=>k.split(' → ').map(code=>lookup.get(code)));
    return {
      flights:{origin:rows.map(r=>r.origin),key,key_rank:Float64Array.from(key,k=>rank.get(k)),
        dep_hour:Float64Array.from(rows,r=>Number(r.dep_hour)),delay_min:Float64Array.from(rows,r=>Number(r.delay_min))},
      routes:{key:keys,origin:ends.map(([a])=>a.code),dest:ends.map(([,b])=>b.code),x0:ends.map(([a])=>a.lon),y0:ends.map(([a])=>a.lat),x1:ends.map(([,b])=>b.lon),y1:ends.map(([,b])=>b.lat)},
      maxRoute:Math.max(...[...key.reduce((m,k)=>m.set(k,(m.get(k)??0)+1),new Map()).values()]),
    };
  });
  let interval=$state([0,23]),overview=$state(),matching=$state(),routeStats=$state(),originStats=$state(),selected=$state(0);
  const filter=$derived([greater_equal("dep_hour",interval[0]),less_equal("dep_hour",interval[1])]);
  // The brush's bounds, as the whole hours whose bars they reach, set the interval.
  $effect(()=>{const brush=overview?.getBrush?.();if(!brush)return;return brush.subscribe(()=>{const c=brush.getConstraints()[0];if(!c?.bounds)return;
    const lo=Math.max(0,Math.min(23,Math.floor(c.bounds[0]))),hi=Math.max(0,Math.min(23,Math.floor(c.bounds[1])));if(lo!==interval[0]||hi!==interval[1])interval=[lo,hi];});});
  // The flights in the interval, read back as a count (no rows) when the Filter's output changes.
  $effect(()=>{if(matching)return matching.subscribe(async s=>{if(s.pending||s.error)return;selected=(await matching.read({columns:['key'],limit:0})).length;});});
  function typed(index,value){const next=[...interval];next[index]=Math.max(0,Math.min(23,Math.round(+value)));interval=[Math.min(...next),Math.max(...next)];overview?.clearBrush?.();}
  // Hovering an airport (an input the routes read): its routes stand out, the others fade.
  const airport=input("airport");
  const routeOpacity=where(is_missing(airport),.5,where(logical_or(equal('origin',airport),equal('dest',airport)),.9,.035));
</script>
<svelte:head><title>Flight network</title></svelte:head>
<main><h1>Flight network</h1><p>Drag across departure hours to aggregate routes and airport departures. Hover an airport to emphasize incoming and outgoing routes.</p>
<label>First hour <input aria-label="First hour" type="number" min="0" max="23" value={interval[0]} onchange={e=>typed(0,e.currentTarget.value)}/></label><label>Last hour <input aria-label="Last hour" type="number" min="0" max="23" value={interval[1]} onchange={e=>typed(1,e.currentTarget.value)}/></label><button onclick={()=>{interval=[0,23];overview?.clearBrush?.();}}>Clear hour brush</button>
<InputContext>
{#await loaded}<p>Loading flights…</p>{:then source}
<p><output data-testid="flight-count">{selected}</output> flights · {interval[0]}:00 through {interval[1]}:59</p>
<div class="views">
{#if routeStats && originStats}
<Plot autoBounds legend bind:this={primary} title="Flight network" width={800} height={560} responsive coordinates="spherical" projection="albers-usa" axes2d={false} x={{domain:[-130,-65]}} y={{domain:[20,55]}}>
  <Data value={source.routes}><Join data={routeStats} on="key" fields={["flights","mean_delay"]} how="inner">
    <Segments start={['x0','y0']} end={['x1','y1']} interpolation="great-circle" width="flights" widthScale={continuous({domain:[0,source.maxRoute],range:[.5,4]})} color="mean_delay" colorScale={continuous({domain:[-30,30],colormap:'RdBu'})} opacity={routeOpacity} tooltip={['key','flights','mean_delay']}/>
  </Join></Data>
  <Data value={airportTable}><Join data={originStats} leftOn="code" rightOn="origin" fields={["departures"]}>
    <Points x="lon" y="lat" size="departures" sizeScale={continuous({domain:[0,source.maxRoute*12],range:[5,16]})} fill="#214a64" outlineColor="white" outlineWidth={.8} tooltip={['code','name','departures']} hover={airport.set("code")}/>
  </Join></Data>
</Plot>
{/if}
<Data value={source.flights}>
  <Plot autoBounds bind:this={overview} interactive="brush" title="Departure hour" width={370} height={560} responsive x={{domain:[0,24],label:'Departure hour'}} y={{label:'Flights'}}
    bands={[{axis:'x',from:interval[0],to:interval[1]+1,color:'#d99c43',opacity:.2}]}>
    <Histogram x="dep_hour" bins={Array.from({length:25},(_,i)=>i)} brush={{axis:'x'}} fill="#4384ad"/>
  </Plot>
  <Filter bind:this={matching} where={filter}>
    <Group bind:this={originStats} by="origin" columns={{departures:count()}}>
      <details><summary>Airport departure totals</summary><TableView columns={[{field:'origin',label:'Airport'},{field:'departures',label:'Departures',format:'d'}]} limit={100}/></details>
    </Group>
    <Group bind:this={routeStats} by={["key","key_rank"]} columns={{flights:count(),mean_delay:mean("delay_min")}}>
      <!-- Most flights first, ties by route key: an integer key, exact in float32 (under 2^24). -->
      <Calculate columns={{ranked:subtract(multiply("flights",2048),"key_rank")}}><Sort by="ranked" order="desc">
        <details><summary>Top routes in the selected hours</summary><TableView columns={[{field:'key',label:'Route'},{field:'flights',label:'Flights',format:'d'},{field:'mean_delay',label:'Mean delay',format:'.6f'}]} limit={10}/></details>
      </Sort></Calculate>
    </Group>
  </Filter>
</Data>
</div>
{:catch error}<p role="alert">{error.message}</p>{/await}
</InputContext>
</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.views{display:grid;grid-template-columns:2.2fr 1fr;gap:20px}input{width:65px;margin:0 15px 0 5px}button{padding:6px 12px}td{padding:4px 15px}</style>
