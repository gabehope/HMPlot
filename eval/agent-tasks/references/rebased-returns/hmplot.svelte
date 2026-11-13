<script>
  import {expose} from "./web-utils.js";
  $effect(()=>expose("primary",top));

  import {csvParse,autoType,group,bisectCenter} from 'd3';
  import {Panels,Plot,Data,Line,Text,Rect,categorical} from 'hmplot';
  import {RuleX} from 'hmplot/charts';
  import csv from './data/stocks.csv?raw';
  const epoch=Date.UTC(2023,0,2),ms=86400000;
  const rows=csvParse(csv,autoType).map(r=>({...r,day:(+r.date-epoch)/ms}));
  const byTicker=[...group(rows,r=>r.ticker)].map(([ticker,values])=>({ticker,values:values.sort((a,b)=>a.day-b.day)}));
  const days=byTicker[0].values.map(r=>r.day),last=days.at(-1),tickers=byTicker.map(r=>r.ticker);
  const colors=categorical({domain:tickers,range:['#287caa','#b86c37','#7d63a6','#4d936d']});
  let base=$state(0),top=$state();
  const rebased=$derived(byTicker.flatMap(({values})=>values.map(r=>({...r,value:100*r.close/values[base].close}))));
  const endpoints=$derived(rebased.filter(r=>r.day===last).map(r=>({...r,label:`${r.ticker} ${r.value.toFixed(2)}`})));
  const volume=days.flatMap((day,i)=>{let sum=0;return byTicker.map(({ticker,values})=>{const bottom=sum;sum+=values[i].volume;return {ticker,x0:day-.4,x1:day+.4,y0:bottom,y1:sum};});});
  function pointer(event){const canvas=event.currentTarget.querySelector('.canvas'),m=top?.getScreenMapping();if(!canvas||!m)return;const box=canvas.getBoundingClientRect(),p=m.unproject({x:event.clientX-box.left,y:event.clientY-box.top});if(p&&event.clientY>=box.top&&event.clientY<=box.bottom)base=bisectCenter(days,p.x);}
  const date=day=>new Date(epoch+day*ms).toISOString().slice(0,10);
</script>
<svelte:head><title>Growth of 100</title></svelte:head>
<main><h1>Growth of 100</h1><p>Move over the upper chart to rebase all four series. Pan or zoom either panel to navigate both.</p><label>Base trading date <select aria-label="Base trading date" bind:value={base}>{#each days as day,i}<option value={i}>{date(day)}</option>{/each}</select></label><output data-testid="base-date">{date(days[base])}</output>
<div onpointermove={pointer} role="group" aria-label="Rebased returns">
<Panels x={{domain:[0,last+90],label:'Days since 2023-01-02'}}>
  <Plot autoBounds bind:this={top} title="Growth of 100" height={420} width={1150} responsive y={{label:'Index (base = 100)'}}>
    <Data value={rebased}><Line x="day" y="value" series="ticker" color="ticker" colorScale={colors} width={2}/></Data>
    <Data value={endpoints}><Text x="day" y="value" text="label" dx={10} align="left" color="ticker" colorScale={colors}/></Data>
    <RuleX x={days[base]} color="#526578"/>
  </Plot>
  <Plot autoBounds title="Daily volume" height={240} width={1150} responsive y={{label:'Shares'}} legend={false}>
    <Data value={volume}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="ticker" fillScale={colors}/></Data><RuleX x={days[base]} color="#526578"/>
  </Plot>
</Panels></div>
<table><caption>Last trading date: {date(last)}</caption><thead><tr><th>Ticker</th><th>Endpoint index</th></tr></thead><tbody>{#each endpoints as r}<tr><td>{r.ticker}</td><td>{r.value.toFixed(2)}</td></tr>{/each}</tbody></table>
</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1200px;margin:auto;padding:24px}output{margin-left:24px;font-weight:bold}select{padding:6px;margin-bottom:15px}table{border-collapse:collapse;width:400px}td,th{padding:5px;text-align:left;border-bottom:1px solid #cbd8e5}h1{margin:0}</style>
