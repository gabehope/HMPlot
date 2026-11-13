<script>
  import {expose} from "./web-utils.js";
  $effect(()=>expose("primary",plot));

  // One table, one selection (TODO 145.6): every mark draws the cars table (three Segments per
  // car join its four axis positions), the four brush intervals pick the matching cars into the
  // table's selection, and the marks respond to it on the GPU; only the top ten's Filter re-runs.
  // Nothing rebuilds a table while a brush moves.
  import { csvParse, autoType } from 'd3';
  import { Data, Plot, Points, Segments, Text, Html, Filter, Sort, Calculate, TableView, categorical, subtract, multiply, round } from 'hmplot';
  import source from './data/cars.csv?raw';
  const cars=csvParse(source,autoType);
  const axes=[{key:'mpg',label:'Fuel economy (mpg)'},{key:'horsepower',label:'Power (hp)'},{key:'weight_kg',label:'Weight (kg)'},{key:'year',label:'Model year'}].map(a=>({...a,min:Math.min(...cars.map(c=>c[a.key])),max:Math.max(...cars.map(c=>c[a.key]))}));
  const colors=categorical({domain:['USA','Europe','Japan'],range:['#257ca6','#c47136','#7b5ca5']});
  // Each car's alphabetical rank breaks mpg ties in the ranking (model ascending), and its
  // position on each axis (0 to 1).
  const rank=new Map([...cars.map(c=>c.model)].sort((a,b)=>a.localeCompare(b)).map((m,i)=>[m,i]));
  const table={...Object.fromEntries(['model','origin',...axes.map(a=>a.key)].map(k=>[k,cars.map(c=>c[k])])),model_rank:cars.map(c=>rank.get(c.model)),
    ...Object.fromEntries(axes.map((a,i)=>[`y${i}`,cars.map(c=>(c[a.key]-a.min)/(a.max-a.min))]))};
  let brushes=$state([null,null,null,null]), plot=$state(), mapping=$state(null), drag=$state(null), data=$state(), selectedCount=$state(cars.length);
  // The intervals, as the table's selection: no interval selects nothing in particular (every
  // car shows), any interval selects the cars inside all of them (none, when they are disjoint).
  $effect(()=>{
    const selection=data?.getSelection(), active=brushes.map((b,i)=>b&&[axes[i].key,b]).filter(Boolean);
    if(!selection)return;
    if(!active.length){selection.clear();selectedCount=cars.length;return;}
    const rows=[];for(let r=0;r<cars.length;r++)if(active.every(([k,[lo,hi]])=>cars[r][k]>=lo&&cars[r][k]<=hi))rows.push(r);
    selection.replace(rows);selectedCount=rows.length;
  });
  const ticks=axes.flatMap((a,x)=>Array.from({length:5},(_,j)=>({x,y:j/4,label:(a.min+(a.max-a.min)*j/4).toFixed(a.key==='mpg'?1:0)})));
  const axisLines=axes.map((a,x)=>({x}));
  const height=$derived(mapping ? Math.abs(mapping.project({x:0,y:0}).y-mapping.project({x:0,y:1}).y):0);
  $effect(()=>{if(plot)return plot.subscribeScreenMapping(m=>mapping=m);});
  function value(event,i){const rect=event.currentTarget.closest('.canvas').getBoundingClientRect();const p=mapping?.unproject({x:event.clientX-rect.left,y:event.clientY-rect.top});return p?axes[i].min+Math.max(0,Math.min(1,p.y))*(axes[i].max-axes[i].min):axes[i].min;}
  function start(e,i){if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);const v=value(e,i);drag={i,start:v};brushes[i]=[v,v];}
  function move(e,i){if(drag?.i!==i)return;const v=value(e,i);brushes[i]=[Math.min(v,drag.start),Math.max(v,drag.start)];}
</script>
<svelte:head><title>Fleet explorer</title></svelte:head>
<main><h1>Fleet explorer</h1><p>Drag along each axis to restrict its interval. All four intervals combine with AND; faint lines retain the full fleet.</p>
<button onclick={()=>brushes=[null,null,null,null]}>Reset all brushes</button>
<output data-testid="selected-count">{selectedCount} of {cars.length} cars</output>
<Data bind:this={data} value={table}>
<Plot autoBounds bind:this={plot} height={400} axes2d={false} x={{domain:[-0.35,3.35]}} y={{domain:[-0.15,1.2]}}>
  {#each [0,1,2] as i}<Segments start={[i,`y${i}`]} end={[i+1,`y${i+1}`]} color="origin" colorScale={colors} width={1} opacity={0.45} respond="selected" selectionOpacity={0.25}/>{/each}
  <Data value={axisLines}><Segments start={["x",0]} end={["x",1]} color="#344c63" width={1}/></Data>
  <Data value={ticks}><Text x="x" y="y" text="label" size={10} align="right" dx={-17}/></Data>
  {#each axes as a,i}
    <Text x={i} y={1.12} text={a.label} size={13}/>
    <Html x={i} y={1} dx={-13}>
      <div class="brush" style:height={`${height}px`} role="group" aria-label={`${a.label} brush`}
        onpointerdown={e=>start(e,i)} onpointermove={e=>move(e,i)} onpointerup={()=>drag=null} onpointercancel={()=>drag=null}>
        {#if brushes[i]}<div class="interval" style:top={`${100*(a.max-brushes[i][1])/(a.max-a.min)}%`} style:height={`${100*(brushes[i][1]-brushes[i][0])/(a.max-a.min)}%`}></div>{/if}
      </div>
    </Html>
  {/each}
</Plot>
<div class="controls">{#each axes as a,i}<fieldset><legend>{a.label}</legend>
<label>Minimum <input aria-label={`${a.key} minimum`} type="number" min={a.min} max={a.max} step="any" value={brushes[i]?.[0]??a.min} onchange={e=>brushes[i]=[+e.currentTarget.value,brushes[i]?.[1]??a.max]}/></label>
<label>Maximum <input aria-label={`${a.key} maximum`} type="number" min={a.min} max={a.max} step="any" value={brushes[i]?.[1]??a.max} onchange={e=>brushes[i]=[brushes[i]?.[0]??a.min,+e.currentTarget.value]}/></label>
<button onclick={()=>brushes[i]=null}>Clear {a.key}</button></fieldset>{/each}</div>
<div class="bottom"><Plot autoBounds title="Selected cars" height={330} x={{domain:[axes[2].min,axes[2].max],label:'Weight (kg)'}} y={{domain:[axes[0].min,axes[0].max],label:'Fuel economy (mpg)'}}>
<Points x="weight_kg" y="mpg" fill="origin" fillScale={colors} size={5} respond="selected" selectionOpacity={0.15} tooltip={['model','origin','mpg']}/>
</Plot><section><h2>Highest fuel economy</h2>
<Filter where="@selected" inactive="all">
  <!-- Highest mpg first, ties by model: an integer key (mpg in tenths), exact in float32. -->
  <Calculate columns={{ ranked: subtract(multiply(round(multiply("mpg", 10)), 512), "model_rank") }}>
    <Sort by="ranked" order="desc"><TableView columns={[{field:'model',label:'Model'},{field:'origin',label:'Origin'},{field:'mpg',label:'MPG'}]} limit={10}/></Sort>
  </Calculate>
</Filter>
{#if !selectedCount}<p>No matching cars. Clear an interval to broaden the selection.</p>{/if}</section></div>
</Data>
</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1200px;margin:auto;padding:24px}h1{margin:0}output{margin-left:24px;font-weight:bold}.controls{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}label{display:flex;justify-content:space-between;margin:6px 0}input{width:75px}.brush{width:26px;touch-action:none;cursor:ns-resize;position:relative;background:#719fc90c}.interval{position:absolute;left:0;right:0;background:#257ca655;border:1px solid #257ca6;box-sizing:border-box;pointer-events:none}.bottom{display:grid;grid-template-columns:1.3fr 1fr;gap:30px;margin-top:16px}button{padding:5px 9px}</style>
