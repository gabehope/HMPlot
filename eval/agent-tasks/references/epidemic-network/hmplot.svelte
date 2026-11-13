<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  import { onMount } from 'svelte';
  import { csvParse } from 'd3';
  import { Data, Plot, Points, Segments, Line, Area, categorical } from 'hmplot';
  import peopleCsv from './data/people.csv?raw';
  import contactsCsv from './data/contacts.csv?raw';
  const people = csvParse(peopleCsv, r => ({ ...r, x:+r.x, y:+r.y,
    infection:r.infected_day === '' ? Infinity : +r.infected_day }));
  const byId = new Map(people.map(p => [p.person,p]));
  const endpoints = (a,b) => ({x0:a.x,y0:a.y,x1:b.x,y1:b.y});
  const contacts = csvParse(contactsCsv, r => endpoints(byId.get(r.source),byId.get(r.target)));
  const transmissions = people.filter(p => byId.has(p.infected_by)).map(p => ({...endpoints(byId.get(p.infected_by),p),day:p.infection}));
  const last = Math.max(...people.filter(p => Number.isFinite(p.infection)).map(p => p.infection))+8;
  const curve = Array.from({length:last+1},(_,day) => ({day,
    incident:people.filter(p => p.infection===day).length,
    active:people.filter(p => p.infection<=day && p.infection>day-7).length}));
  const colors = categorical({domain:['Susceptible','Infectious','Recovered'],range:['#a7b5c8','#dc4438','#394957']});
  let day=$state(0), playing=$state(false);
  const nodes=$derived(people.map(p => ({...p,state:p.infection>day?'Susceptible':p.infection>day-7?'Infectious':'Recovered'})));
  const arrows=$derived(transmissions.filter(p => p.day<=day));
  const arrowColumns=$derived(Object.fromEntries(["x0","y0","x1","y1"].map(key=>[key,arrows.map(row=>row[key])])));
  const counts=$derived(['Susceptible','Infectious','Recovered'].map(state => ({state,count:nodes.filter(p=>p.state===state).length})));
  onMount(() => { const timer=setInterval(()=>{if(playing){day=Math.min(last,day+0.2);if(day===last)playing=false;}},100);return ()=>clearInterval(timer); });
</script>
<svelte:head><title>Epidemic network</title></svelte:head>
<main>
  <h1>Spread through a contact network</h1>
  <p>Infection lasts seven days. Arrows appear when transmission occurs.</p>
  <div class="controls"><button onclick={()=>playing=!playing}>{playing?'Pause':'Play'}</button>
    <label>Day <input aria-label="Day" type="range" min="0" max={last} step="0.1" bind:value={day}/></label>
    <output data-testid="day">{day.toFixed(1)}</output>
    <button onclick={()=>{playing=false;day=0;}}>Reset</button>
  </div>
  <div class="counts">{#each counts as c}<span data-state={c.state}>{c.state}: <b>{c.count}</b></span>{/each}
    <span>Transmissions: <b data-testid="transmissions">{arrows.length}</b></span></div>
  <div class="views">
    <Plot autoBounds bind:this={primary} title="Contact network" height={520} aspect="equal" axes2d={false}>
      <Data value={contacts}><Segments start={["x0","y0"]} end={["x1","y1"]} color="#b2bac4" width={0.6} opacity={0.4}/></Data>
      <Data value={arrowColumns} schema={{x0:"numeric",y0:"numeric",x1:"numeric",y1:"numeric"}}><Segments start={["x0","y0"]} end={["x1","y1"]} color="#bc3b35" width={1} cap="arrow" headLength={5} headWidth={4}/></Data>
      <Data value={nodes}><Points x="x" y="y" fill="state" fillScale={colors} size={5.5} tooltip={['person','community','state']}/></Data>
    </Plot>
    <Plot autoBounds data={curve} title="Infected per day" height={520} x={{domain:[0,last],label:'Day'}} y={{label:'People'}}>
      <Area x="day" upper="active" fill="#df433d" opacity={0.2}/>
      <Line x="day" y="incident" color="#c03c37" width={2.5}/>
      <Segments start={[day,0]} end={[day,Math.max(...curve.map(p=>p.active))]} color="#26384a" width={1.5}/>
    </Plot>
  </div>
  <p>Grey: susceptible; red: infectious; dark: recovered. Area: currently infectious; line: new infections.</p>
</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:15px system-ui}main{max-width:1280px;margin:auto;padding:24px}.controls,.counts{display:flex;gap:24px;align-items:center;margin:18px 0}.views{display:grid;grid-template-columns:1.2fr 1fr;gap:20px}input{width:320px}button{padding:7px 15px}h1{margin:0}p{color:#526477}</style>
