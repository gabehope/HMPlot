<script>
  import {expose} from "./web-utils.js";
  $effect(()=>expose("scatter",scatter));
  $effect(()=>expose("counter",counter));
  $effect(()=>expose("primary",density));

  import {Plot,Data,Filter,Points,Prism,Text,Group,continuous,equal,logical_or,logical_and,greater_equal,less_equal,subtract,divide} from 'hmplot';
  import {Hexbin} from 'hmplot/stats';
  import {parquet,columns} from './web-utils.js';import url from './data/pickups.parquet?url';
  const loaded=parquet(url).then(rows=>({table:columns(rows),x:[rows.reduce((m,r)=>Math.min(m,r.x_km),Infinity),rows.reduce((m,r)=>Math.max(m,r.x_km),-Infinity)],y:[rows.reduce((m,r)=>Math.min(m,r.y_km),Infinity),rows.reduce((m,r)=>Math.max(m,r.y_km),-Infinity)]}));
  let hour=$state(24),scatter=$state(),counter=$state(),density=$state();
  const hourFilter=$derived(logical_or(equal(hour,24),equal('hour',hour)));
  const visible=logical_and(logical_and(greater_equal('x_km','@view_x_min'),less_equal('x_km','@view_x_max')),logical_and(greater_equal('y_km','@view_y_min'),less_equal('y_km','@view_y_max')));
</script>
<svelte:head><title>Taxi explorer</title></svelte:head>
<main><h1>Taxi explorer</h1><p>All one million pickups. Brush fare against distance to filter the map. Zoom the map to refine the hexagonal bins.</p>
<label>Hour · 24 means all hours <input aria-label="Hour" type="range" min="0" max="24" step="1" bind:value={hour}/></label><output>{hour===24?'All hours':`${hour}:00`}</output><button onclick={()=>scatter?.clearBrush()}>Clear brush</button>
{#await loaded}<p>Loading one million pickups…</p>{:then source}
<Data value={source.table}><div class="views">
<Plot autoBounds legend bind:this={density} title="Pickup density" width={600} height={530} responsive aspect="equal" x={{domain:source.x,label:'East (km)'}} y={{domain:source.y,label:'North (km)'}}>
<Filter where="@brushed" inactive="all"><Filter where={logical_and(hourFilter,visible)}><Hexbin x="x_km" y="y_km" bounds={{x:source.x,y:source.y}} radius={divide(subtract('@view_x_max','@view_x_min'),70)}>
<Prism x="x" y="y" width="width" depth="depth" rotation="rotation" shape="hexagon" z0={0} z1={0} fill="count" fillScale={continuous({transform:'log',colormap:'Viridis'})} tooltip={['count']}/>
</Hexbin></Filter></Filter></Plot>
<Plot autoBounds bind:this={scatter} title="Fare against distance" width={600} height={530} responsive x={{label:'Distance (km)'}} y={{label:'Fare (USD)'}}><Filter where={hourFilter}><Points x="distance_km" y="fare_usd" size={1.1} fill="#3978a8" opacity={.045} brush respond="brushed" selectionOpacity={.08}/></Filter></Plot>
</div><Plot autoBounds bind:this={counter} height={75} axes2d={false} interactive={false} x={{domain:[0,1]}} y={{domain:[0,1]}}><Text x={.02} y={.5} text="Selected pickups:" align="left" size={16}/><Filter where="@brushed" inactive="all"><Filter where={hourFilter}><Group><Text x={.3} y={.5} text="count" format="," align="left" size={20} color="#21667f"/></Group></Filter></Filter></Plot>
</Data>{:catch error}<p role="alert">{error.message}</p>{/await}</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.views{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px}input{width:400px}output{margin:0 20px}button{padding:6px 12px}</style>
