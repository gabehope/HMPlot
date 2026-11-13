<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  import {csvParse,autoType,quantileSorted} from 'd3';
  import {Plot,Data,GeoJSON,Points,Line,Text,categorical,where,logical_or,equal,literal} from 'hmplot';
  import csv from './data/district_rents.csv?raw';import geography from './data/districts.geojson?raw';
  const raw=csvParse(csv,autoType),geo=JSON.parse(geography),sorted=raw.map(r=>r.median_rent_eur).sort((a,b)=>a-b),edges=Array.from({length:6},(_,i)=>quantileSorted(sorted,i/5));
  const labels=edges.slice(0,-1).map((v,i)=>`€${v.toFixed(0)}–€${edges[i+1].toFixed(0)}`),palette=categorical({domain:labels,range:['#e3eef5','#b6d4e3','#79b2c8','#3b8ca5','#15566f']});
  function vertices(value){return typeof value[0]==='number'?[value]:value.flatMap(vertices);}
  const centers=new Map(geo.features.map(f=>{const v=vertices(f.geometry.coordinates);return [f.properties.district,[(Math.min(...v.map(p=>p[0]))+Math.max(...v.map(p=>p[0])))/2,(Math.min(...v.map(p=>p[1]))+Math.max(...v.map(p=>p[1])))/2]];}));
  const records=raw.map(r=>({...r,rent_class:labels[Math.min(4,edges.slice(1,-1).filter(v=>r.median_rent_eur>=v).length)],lon:centers.get(r.district)[0],lat:centers.get(r.district)[1]}));
  const top=[...records].sort((a,b)=>b.median_rent_eur-a.median_rent_eur).slice(0,3);
  const mx=records.reduce((s,r)=>s+r.population,0)/records.length,my=records.reduce((s,r)=>s+r.median_rent_eur,0)/records.length;
  const slope=records.reduce((s,r)=>s+(r.population-mx)*(r.median_rent_eur-my),0)/records.reduce((s,r)=>s+(r.population-mx)**2,0),intercept=my-slope*mx;
  const regression=[Math.min(...records.map(r=>r.population)),Math.max(...records.map(r=>r.population))].map(x=>({x,y:intercept+slope*x}));
  let hovered=$state(null);
  const emphasized=$derived(logical_or("@hovered",equal("district",literal(hovered??""))));
  const active=$derived(records.find(r=>r.district===hovered));
</script>
<svelte:head><title>Median rent by district</title></svelte:head>
<main><h1>Median rent by district</h1><p>Five quantile classes. Hover a district or a scatter point to identify it in both views.</p><label>District <select aria-label="District" bind:value={hovered}><option value={null}>None</option>{#each records as r}<option value={r.district}>{r.district}</option>{/each}</select></label>
<Data value={records} key="district"><div class="views"><Plot autoBounds bind:this={primary} title="Median rent by district" coordinates="spherical" projection="mercator" width={650} height={540} responsive axes2d={false}>
<GeoJSON data={geo} featureKey="district" dataKey="district" fill="rent_class" fillScale={palette} outlineColor="#213c4c" outlineWidth={where(emphasized,3,.7)} hover tooltip={['district','median_rent_eur','population']}/>
<Data value={top}><Text x="lon" y="lat" text="district" size={11} dy={-6} color="#152d3a" box={{fill:'white',opacity:.85,padding:2}}/></Data>
</Plot><Plot autoBounds title="Rent against population" width={500} height={540} responsive x={{label:'Population'}} y={{label:'Median rent (€)'}}>
<Points x="population" y="median_rent_eur" fill="rent_class" fillScale={palette} size={where(emphasized,13,7)} outlineColor="#213c4c" outlineWidth={where(emphasized,3,.7)} tooltip={['district','median_rent_eur','population']} hover onpointermove={e=>hovered=records[e.sourceRow??e.rowIndex].district}/>
<Data value={regression}><Line x="x" y="y" color="#c06c45" width={2}/></Data></Plot></div></Data>
{#if active}<p data-testid="district-detail">{active.district}: €{active.median_rent_eur.toFixed(2)} · population {active.population} · {active.rent_class}</p>{/if}
<p>Least-squares line: rent = <output data-testid="intercept">{intercept.toFixed(6)}</output> + <output data-testid="slope">{slope.toFixed(6)}</output> × population.</p>
<table><caption>Quantile boundaries</caption><tbody>{#each labels as label,i}<tr><td>{label}</td><td>{records.filter(r=>r.rent_class===label).length} districts</td></tr>{/each}</tbody></table></main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.views{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;margin-top:15px}select{padding:6px}td{padding:4px 15px}</style>
