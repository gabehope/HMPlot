<script>
  import {expose} from "./web-utils.js";
  $effect(()=>expose("primary",main));
  $effect(()=>expose("overview",overview));

  // The streams stay in HMPlot (TODO 145.6): Stack lays out the layers (wiggle or zero), a Filter
  // shows the date lens, a plain drag on the overview brushes (interactive="brush") and its days
  // set the lens, a Group sums each source in it for the bars and a TableView, and hovering a
  // stream writes an input whose day's values another TableView lists.
  import {csvParse,autoType} from 'd3';
  import {Plot,Data,Filter,Group,Stack,Sort,Calculate,Area,Line,Rect,Text,TableView,InputContext,categorical,sum,input,equal,greater_equal,less_equal,subtract,multiply,add,row} from 'hmplot';
  import csv from './data/channel_traffic.csv?raw';
  const epoch=Date.UTC(2022,0,1),parsed=csvParse(csv,autoType),channels=[...new Set(parsed.map(r=>r.channel))].sort();
  const rank=new Map(channels.map((c,i)=>[c,i]));
  const table={day:Float64Array.from(parsed,r=>(+r.date-epoch)/86400000),channel:parsed.map(r=>r.channel),channel_rank:Float64Array.from(parsed,r=>rank.get(r.channel)),sessions:Float64Array.from(parsed,r=>r.sessions)};
  const last=Math.max(...table.day);
  const palette=categorical({domain:channels,range:['#357fa3','#b87835','#7762a1','#4e9769','#bc6167','#4d9e9d','#a183a6','#9a9650','#366f8a','#ae794d','#655787','#7d9d60','#bf8588','#69b9ad','#ac89a5','#bab35e','#607d99','#bca18a']});
  let mode=$state('wiggle'),interval=$state([0,last]),main=$state(),overview=$state();
  const lens=$derived([greater_equal("day",interval[0]),less_equal("day",interval[1])]);
  const date=day=>new Date(epoch+day*86400000).toISOString().slice(0,10);
  const dayOf=value=>Math.max(0,Math.min(last,Math.round((Date.parse(value)-epoch)/86400000)));
  // The overview brush's days set the lens (inclusive whole days).
  $effect(()=>{const brush=overview?.getBrush?.();if(!brush)return;return brush.subscribe(()=>{const c=brush.getConstraints()[0];if(!c?.bounds)return;
    const lo=Math.max(0,Math.ceil(c.bounds[0])),hi=Math.min(last,Math.floor(c.bounds[1]));if(lo<=hi&&(lo!==interval[0]||hi!==interval[1]))interval=[lo,hi];});});
  const set=(next)=>{interval=next;overview?.clearBrush?.();};
  // Most sessions first, ties by source: an integer key, exact in float32.
  const ranked=subtract(multiply("total",32),"channel_rank");
  const hoveredDay=input("day",{default:0});
</script>
<svelte:head><title>Traffic by source</title></svelte:head>
<main><h1>Traffic by source</h1><div class="controls"><label>Baseline <select aria-label="Baseline" bind:value={mode}><option value="wiggle">Streamgraph (wiggle)</option><option value="zero">Stacked (zero)</option></select></label><label>Start date <input aria-label="Start date" type="date" min={date(0)} max={date(last)} value={date(interval[0])} onchange={e=>set([dayOf(e.currentTarget.value),interval[1]])}/></label><label>End date <input aria-label="End date" type="date" min={date(0)} max={date(last)} value={date(interval[1])} onchange={e=>set([interval[0],dayOf(e.currentTarget.value)])}/></label><button onclick={()=>set([0,last])}>Clear brush</button></div>
<InputContext>
<Data value={table}>
<div class="layout"><section>
  <Plot autoBounds bind:this={main} title="Traffic by source" width={830} height={430} responsive x={{domain:[interval[0],Math.max(interval[0]+1,interval[1])],label:'Days since 2022-01-01'}} y={{label:'Sessions'}}>
    <Stack x="day" y="sessions" series="channel" order={channels} offset={mode==='wiggle'?'wiggle':'zero'}>
      <Filter where={lens}><Area x="day" lower="y0" upper="y1" series="channel" curve="monotone-x" fill="channel" fillScale={palette} hover={hoveredDay.set("day")}/></Filter>
    </Stack>
  </Plot>
  <Group by="day" columns={{total:sum("sessions")}}>
    <Plot autoBounds bind:this={overview} interactive="brush" title="Full-period total sessions" width={830} height={160} responsive x={{domain:[0,last],label:'Drag to select inclusive dates'}}
      bands={[{axis:'x',from:interval[0],to:interval[1],color:'#4d99b7',opacity:.18}]}>
      <Line x="day" y="total" color="#3a7496" brush={{axis:'x'}}/>
    </Plot>
  </Group>
</section>
<section>
  <Filter where={lens}><Group by={["channel","channel_rank"]} columns={{total:sum("sessions")}}><Calculate columns={{ranked}}><Sort by="ranked" order="desc">
    <Calculate columns={{y0:subtract(17,row()),y1:subtract(17.8,row()),y:subtract(17.4,row())}}>
      <Plot autoBounds title="Sessions in selected range" width={350} height={590} responsive axes2d={false} legend={false} y={{domain:[-.3,18]}}>
        <Rect x0={0} x1="total" y0="y0" y1="y1" fill="channel" fillScale={palette}/><Text x={0} y="y" text="channel" align="left" dx={5} color="#ffffff" size={11}/>
      </Plot>
    </Calculate>
  </Sort></Calculate></Group></Filter>
</section></div>
<p data-testid="interval">{date(interval[0])} through {date(interval[1])}</p>
<div class="tables">
  <Filter where={equal("day",hoveredDay)}><Calculate columns={{key:subtract(multiply("sessions",32),"channel_rank")}}><Sort by="key" order="desc">
    <TableView title="Hover: the day under the pointer (day 0 until then)" columns={[{field:'channel',label:'Source'},{field:'sessions',label:'Daily sessions',format:'d'}]} limit={18}/>
  </Sort></Calculate></Filter>
  <Filter where={lens}><Group by={["channel","channel_rank"]} columns={{total:sum("sessions")}}><Calculate columns={{ranked}}><Sort by="ranked" order="desc">
    <TableView title="Inclusive range totals" columns={[{field:'channel',label:'Source'},{field:'total',label:'Total sessions',format:'d'}]} limit={18}/>
  </Sort></Calculate></Group></Filter>
</div>
</Data>
</InputContext>
</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.controls{display:flex;gap:15px;align-items:center;margin:20px 0}.layout{display:grid;grid-template-columns:2.4fr 1fr;gap:18px}.tables{display:grid;grid-template-columns:1fr 1fr;gap:40px}table{border-collapse:collapse}td,th{padding:4px;text-align:left;border-bottom:1px solid #d2dde8}input,select,button{padding:5px}</style>
