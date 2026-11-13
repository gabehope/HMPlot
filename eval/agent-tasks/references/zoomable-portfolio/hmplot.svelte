<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  // The hierarchy stays in HMPlot (TODO 145.6): a Treemap lays out the subtree of the input
  // "root", which a click on a division or a department writes (select={drill.set("id")}) and
  // a Select of that name shows; levels={1} shows its children, whose summed values (total) are
  // read back for the list and the subtree total. The top ten is a Filter of the products under
  // root, sorted, in a TableView.
  import {csvParse,autoType} from 'd3';
  import {Plot,Data,GraphData,Treemap,Nodes,Filter,Sort,Rect,Text,TableView,InputContext,Select,categorical,input,equal,logical_or,greater,subtract,literal} from 'hmplot';
  import csv from './data/portfolio.csv?raw';
  const rows=csvParse(csv,autoType), divisions=[...new Set(rows.map(r=>r.division))].sort();
  const palette=categorical({domain:divisions,range:['#3686a6','#a97336','#7978ae','#5c986c','#be6964','#658e98']});
  // The hierarchy (static): all > divisions > departments > products, and each node's parent.
  const departments=[...new Map(rows.map(r=>[r.department,r.division])).entries()];
  const parentOf=new Map([...divisions.map(d=>[d,'all']),...departments,...rows.map(r=>[r.product,r.department])]);
  const nodes={id:['all',...divisions,...departments.map(([d])=>d),...rows.map(r=>r.product)],
    division:['',...divisions,...departments.map(([,v])=>v),...rows.map(r=>r.division)],
    revenue_k:[0,...divisions.map(()=>0),...departments.map(()=>0),...rows.map(r=>r.revenue_k)],
    orders:[0,...divisions.map(()=>0),...departments.map(()=>0),...rows.map(r=>r.orders)]};
  const edges={source:[...parentOf.values()],target:[...parentOf.keys()]};
  const groups=['all',...divisions,...departments.map(([d])=>d)];
  // Each product's place in the ranking by each metric (descending, ties by name), once: a Sort
  // of any subtree by it gives that subtree's ranking.
  const order=metric=>{const ranked=rows.map((r,i)=>i).sort((a,b)=>rows[b][metric]-rows[a][metric]||rows[a].product.localeCompare(rows[b].product));const at=new Float64Array(rows.length);ranked.forEach((r,i)=>at[r]=i);return at;};
  const products={product:rows.map(r=>r.product),division:rows.map(r=>r.division),department:rows.map(r=>r.department),revenue_k:rows.map(r=>r.revenue_k),orders:rows.map(r=>r.orders),order_revenue_k:order('revenue_k'),order_orders:order('orders')};
  let metric=$state('revenue_k'),context=$state(),chooser=$state(),shown=$state(),children=$state([]);
  const root=$derived(context?.getValues().root ?? 'all');
  const path=$derived.by(()=>{const chain=[];for(let at=root;at&&at!=='all';at=parentOf.get(at))chain.unshift(at);return chain;});
  const units=$derived(metric==='revenue_k'?'$ thousands':'orders'), digits=$derived(metric==='revenue_k'?2:0);
  const total=$derived(children.reduce((s,c)=>s+c.total,0));
  // The shown nodes, read back when the layout changes: the list and the total.
  $effect(()=>{if(shown)return shown.subscribe(async s=>{if(s.pending||s.error)return;const {rows}=await shown.read({rows:true,columns:['id','total','degree']});children=rows.sort((a,b)=>b.total-a.total||String(a.id).localeCompare(String(b.id)));});});
  const go=id=>chooser?.setValue(id);
  const drill=input("root",{default:"all"});
  const under=$derived(root==='all'?greater('order_revenue_k',-1):logical_or(equal('division',literal(root)),equal('department',literal(root))));
</script>
<svelte:head><title>Portfolio explorer</title></svelte:head>
<main><h1>Portfolio explorer</h1>
<InputContext bind:this={context}>
<div class="controls"><label>Area metric <select aria-label="Area metric" bind:value={metric}><option value="revenue_k">Revenue ($ thousands)</option><option value="orders">Orders</option></select></label>
<Select bind:this={chooser} name="root" label="Subtree" options={groups}/>
<button disabled={!path.length} onclick={()=>go(parentOf.get(root))}>Up</button><nav aria-label="Breadcrumb"><button onclick={()=>go('all')}>All divisions</button>{#each path as name}<span> / </span><button onclick={()=>go(name)}>{name}</button>{/each}</nav></div>
<p>Subtree total: <output data-testid="total">{total.toFixed(digits)}</output> {units}</p>
<div class="layout"><Plot autoBounds bind:this={primary} height={570} axes2d={false} x={{domain:[0,100]}} y={{domain:[0,70]}} description="Treemap. Each rectangle's area is its share of the selected metric. Use the hierarchy list for keyboard navigation.">
<GraphData {nodes} {edges} source="source" target="target">
  <Treemap root={drill} value={metric} levels={1} width={100} height={70}>
    <Nodes bind:this={shown}>
      <!-- Divisions and departments drill on click (they have children: degree above 1). -->
      <Filter where={greater("degree",1)}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="division" fillScale={palette} outlineColor="#ffffff" outlineWidth={1} tooltip={['id','total']} select={drill.set("id")}/></Filter>
      <Filter where={equal("degree",1)}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="division" fillScale={palette} outlineColor="#ffffff" outlineWidth={1} tooltip={['id','total']}/></Filter>
      <Filter where={[greater(subtract("x1","x0"),12),greater(subtract("y1","y0"),7)]}><Text x="x" y="y" text="id" color="#ffffff" size={12}/></Filter>
    </Nodes>
  </Treemap>
</GraphData>
</Plot><section><h2>Top products in this subtree</h2>
<Data value={products}><Filter where={under}><Sort by={`order_${metric}`}>
  <TableView columns={[{field:'product',label:'Product'},{field:metric,label:units,format:metric==='revenue_k'?'.2f':'.0f'}]} limit={10}/>
</Sort></Filter></Data>
<h2>Current hierarchy</h2><ul>{#each children as c (c.id)}<li>{#if c.degree>1}<button onclick={()=>go(c.id)}>{c.id}</button>{:else}{c.id}{/if} <span>{c.total.toFixed(digits)}</span></li>{/each}</ul></section></div>
</InputContext>
</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.controls{display:flex;gap:24px;align-items:center;margin:20px 0}.layout{display:grid;grid-template-columns:2fr 1fr;gap:24px}button,select{padding:6px 10px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px;border-bottom:1px solid #d6dfe8}li{padding:4px}li span{float:right}h2{font-size:17px}</style>
