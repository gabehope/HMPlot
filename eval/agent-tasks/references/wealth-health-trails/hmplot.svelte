<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  import {onMount} from 'svelte';
  import {csvParse,autoType,group,extent} from 'd3';
  import {Plot,Data,Points,Line,Text,categorical,continuous} from 'hmplot';
  import csv from './data/countries_years.csv?raw';
  const rows=csvParse(csv,autoType),countries=[...group(rows,r=>r.country)].map(([name,values])=>({name,values:values.sort((a,b)=>a.year-b.year)}));
  const continents=[...new Set(rows.map(r=>r.continent))].sort(),colors=categorical({domain:continents,range:['#d15c50','#d39c35','#5b96c8','#62a07c','#9579b7']});
  const featured=rows.filter(r=>r.year===2020).sort((a,b)=>b.population-a.population).slice(0,5).map(r=>r.country);
  const maxPop=Math.max(...rows.map(r=>r.population)),gx=extent(rows,r=>r.gdp_per_capita),ly=extent(rows,r=>r.life_expectancy);
  const x={domain:[gx[0]*0.8,gx[1]*1.8],transform:'log',label:'GDP per capita'},y={domain:[ly[0]-3,ly[1]+3],label:'Life expectancy (years)'};
  let year=$state(1950),playing=$state(false);
  const current=$derived(countries.map(({values})=>{const i=Math.min(values.length-2,Math.floor((year-1950)/5)),a=values[i],b=values[i+1],t=(year-a.year)/(b.year-a.year);const r={...a,year};for(const key of ['gdp_per_capita','life_expectancy','population'])r[key]=a[key]+t*(b[key]-a[key]);r.diameter=50*Math.sqrt(r.population/maxPop);return r;}));
  const labels=$derived(current.filter(r=>featured.includes(r.country)).map(r=>({...r,labelDy:featured.indexOf(r.country)===2?20:featured.indexOf(r.country)%2===0?-18:16})));
  const trails=$derived(featured.flatMap(country=>[...rows.filter(r=>r.country===country&&r.year<year),current.find(r=>r.country===country)]));
  onMount(()=>{const timer=setInterval(()=>{if(playing){year=Math.min(2020,year+0.2);if(year===2020)playing=false;}},50);return ()=>clearInterval(timer);});
</script>
<svelte:head><title>Wealth and health</title></svelte:head>
<main><h1>Wealth and health, 1950-2020</h1><p>Bubble area represents population. Trails follow the five most populous countries in 2020. Values interpolate between five-year observations.</p>
<div class="controls"><button onclick={()=>playing=!playing}>{playing?'Pause':'Play'}</button><label>Year <input aria-label="Year" type="range" min="1950" max="2020" step="0.1" bind:value={year}/></label><output>{year.toFixed(1)}</output><button onclick={()=>{playing=false;year=1950;}}>Reset</button></div>
<Plot autoBounds bind:this={primary} {x} {y} width={1150} height={620} responsive>
  <Text x={Math.sqrt(gx[0]*gx[1])} y={ly[0]+7} text={Math.floor(year)} size={70} opacity={0.14} color="#64748b"/>
  <Data value={trails}><Line x="gdp_per_capita" y="life_expectancy" series="country" color="continent" colorScale={colors} opacity={0.3} width={2}/></Data>
  <Data value={current} key="country"><Points x="gdp_per_capita" y="life_expectancy" size="diameter" sizeScale={continuous({domain:[0,50],range:[0,50]})} fill="continent" fillScale={colors} opacity={0.75} outlineColor="#ffffff" outlineWidth={0.8} tooltip={['country','population','gdp_per_capita','life_expectancy']}/></Data>
  <Data value={labels}><Text x="gdp_per_capita" y="life_expectancy" text="country" dx={10} dy="labelDy" align="left" size={11}/></Data>
</Plot>
<table><caption>Featured countries at {year.toFixed(1)}</caption><thead><tr><th>Country</th><th>GDP per capita</th><th>Life expectancy</th><th>Population</th></tr></thead><tbody>{#each labels as r}<tr><td>{r.country}</td><td>{r.gdp_per_capita.toFixed(2)}</td><td>{r.life_expectancy.toFixed(2)}</td><td>{Math.round(r.population)}</td></tr>{/each}</tbody></table>
</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1200px;margin:auto;padding:24px}.controls{display:flex;align-items:center;gap:24px;margin:20px 0}input{width:500px}button{padding:6px 12px}table{border-collapse:collapse;width:100%}td,th{padding:5px;text-align:left;border-bottom:1px solid #d4dfe9}h1{margin:0}</style>
