<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  import {csvParse,group} from 'd3';
  import {Plot,Data,Line,Points,Text,Rect,categorical} from 'hmplot';
  import peopleCsv from './data/people.csv?raw';import edgeCsv from './data/contacts.csv?raw';
  const people=csvParse(peopleCsv),edges=csvParse(edgeCsv),groups=[...group(people,p=>p.community)].sort(([a],[b])=>a.localeCompare(b));
  const communities=groups.map(([key])=>key),colorList=['#357fa3','#b87835','#7762a1','#4e9769','#bc6167','#4d9e9d','#a183a6','#9a9650'];
  const colors=categorical({domain:communities,range:colorList});
  const nodes=groups.flatMap(([community,values],g)=>values.sort((a,b)=>a.person.localeCompare(b.person)).map((p,i)=>{const angle=2*Math.PI*(g+(i+.5)/values.length)/groups.length-Math.PI/2;return {...p,x:Math.cos(angle),y:Math.sin(angle)};}));
  const lookup=new Map(nodes.map(p=>[p.person,p])),neighbors=new Map(nodes.map(p=>[p.person,new Set()]));
  for(const e of edges){neighbors.get(e.source).add(e.target);neighbors.get(e.target).add(e.source);}
  const labels=communities.map((community,i)=>{const angle=2*Math.PI*(i+.5)/8-Math.PI/2;return {community,x:1.15*Math.cos(angle),y:1.15*Math.sin(angle),cx:.45*Math.cos(angle),cy:.45*Math.sin(angle)};});
  const centers=new Map(labels.map(p=>[p.community,[p.cx,p.cy]]));
  let strength=$state(.85),hovered=$state(null),pinned=$state(null);
  const focus=$derived(pinned??hovered),person=$derived(lookup.get(focus)),adjacent=$derived(focus?[...neighbors.get(focus)].sort():[]);
  const paths=$derived(edges.flatMap((e,id)=>{const a=lookup.get(e.source),b=lookup.get(e.target),hierarchy=[[a.x,a.y],centers.get(a.community),[0,0],centers.get(b.community),[b.x,b.y]];const active=!focus||e.source===focus||e.target===focus;return hierarchy.map(([x,y],i)=>({edge:id,x:(1-strength)*(a.x+(b.x-a.x)*i/4)+strength*x,y:(1-strength)*(a.y+(b.y-a.y)*i/4)+strength*y,community:a.community,alpha:active?(focus?.85:.16):.015}));}));
  const shownNodes=$derived(nodes.map(p=>({...p,alpha:!focus||p.person===focus||adjacent.includes(p.person)?1:.18})));
  const matrix=communities.flatMap((a,x)=>communities.map((b,y)=>({x0:x,x1:x+1,y0:y,y1:y+1,a,b,count:edges.filter(e=>{const s=lookup.get(e.source).community,t=lookup.get(e.target).community;return s===a&&t===b||s===b&&t===a;}).length})));
  const pick=e=>nodes[e.sourceRow??e.rowIndex]?.person;
</script>
<svelte:head><title>Community connections</title></svelte:head>
<main><h1>Community connections</h1><p>Each contact appears once. Hover to explore neighbors; click a person to pin. Curves pass through the community hierarchy.</p>
<div class="controls"><label>Bundling strength <input aria-label="Bundling strength" type="range" min="0" max="1" step=".01" bind:value={strength}/></label><output>{strength.toFixed(2)}</output><button onclick={()=>{pinned=null;hovered=null;}}>Reset focus</button><label>Focus person <select aria-label="Focus person" value={focus??''} onchange={e=>pinned=e.currentTarget.value||null}><option value="">None</option>{#each nodes as p}<option value={p.person}>{p.person}</option>{/each}</select></label></div>
<div class="layout"><Plot autoBounds bind:this={primary} height={720} width={780} responsive axes2d={false} aspect="equal" x={{domain:[-1.35,1.35]}} y={{domain:[-1.35,1.35]}}>
<Data value={paths}><Line x="x" y="y" series="edge" curve="basis" color="community" colorScale={colors} opacity="alpha" width={1}/></Data>
<Data value={shownNodes}><Points x="x" y="y" fill="community" fillScale={colors} opacity="alpha" size={6} tooltip={['person','community']} onpointermove={e=>hovered=pick(e)} onpointerleave={()=>hovered=null} onclick={e=>pinned=pick(e)}/></Data>
<Data value={labels}><Text x="x" y="y" text="community" color="community" colorScale={colors} size={14}/></Data>
{#if person}<Text x={person.x} y={person.y} text={person.person} dy={-15} size={12}/>{/if}
</Plot><section>{#if person}<h2 data-testid="focused-person">{person.person}</h2><p>Community: {person.community}</p><p>Degree: <output data-testid="degree">{adjacent.length}</output></p><p>{pinned?'Pinned':'Hover focus'}</p><ol data-testid="neighbors">{#each adjacent as id}<li>{id}</li>{/each}</ol>{:else}<h2>Community contact matrix</h2><Plot autoBounds height={380} width={350} responsive axes2d={false} x={{domain:[0,8]}} y={{domain:[0,8]}}><Data value={matrix}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="count" outlineColor="white" outlineWidth={1} tooltip={['a','b','count']}/></Data></Plot><p>Rows and columns follow community order around the circle. Off-diagonal counts are shown symmetrically; each network edge is drawn once.</p>{/if}</section></div></main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.controls{display:flex;align-items:center;gap:20px;margin:18px 0}.layout{display:grid;grid-template-columns:2fr 1fr;gap:24px}input{width:200px}ol{columns:2}button,select{padding:6px}</style>
