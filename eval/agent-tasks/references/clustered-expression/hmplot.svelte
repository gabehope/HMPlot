<script>
  import {expose} from "./web-utils.js";
  let primary=$state(); $effect(()=>expose("primary",primary));
  import {csvParse,autoType} from 'd3';
  import {Plot,Data,Rect,Segments,Points,Text,categorical,continuous} from 'hmplot';
  import {BoxPlot} from 'hmplot/charts';
  import csv from './data/expression.csv?raw';
  const rows=csvParse(csv,autoType),genes=[...new Set(rows.map(r=>r.gene))].sort(),samples=[...new Set(rows.map(r=>r.sample))].sort();
  const values=new Map(rows.map(r=>[`${r.gene}/${r.sample}`,r.log2_expression]));
  const matrix=genes.map(g=>samples.map(s=>values.get(`${g}/${s}`)));
  const z=matrix.map(row=>{const mean=row.reduce((a,b)=>a+b,0)/row.length,sd=Math.sqrt(row.reduce((s,v)=>s+(v-mean)**2,0)/row.length);return row.map(v=>(v-mean)/sd);});
  function correlation(a,b){const ma=a.reduce((s,v)=>s+v,0)/a.length,mb=b.reduce((s,v)=>s+v,0)/b.length;let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i++){ab+=(a[i]-ma)*(b[i]-mb);aa+=(a[i]-ma)**2;bb+=(b[i]-mb)**2;}return 1-ab/Math.sqrt(aa*bb);}
  function cluster(vectors){const n=vectors.length,dist=vectors.map(a=>vectors.map(b=>correlation(a,b)));let nodes=vectors.map((_,id)=>({id,leaves:[id],height:0}));while(nodes.length>1){let best=Infinity,pair;for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){let sum=0;for(const a of nodes[i].leaves)for(const b of nodes[j].leaves)sum+=dist[a][b];const d=sum/(nodes[i].leaves.length*nodes[j].leaves.length);if(d<best){best=d;pair=[i,j];}}const [i,j]=pair,a=nodes[i],b=nodes[j];nodes=nodes.filter((_,k)=>k!==i&&k!==j);nodes.push({id:n+(n-nodes.length-2),leaves:[...a.leaves,...b.leaves],height:best,left:a,right:b});}return nodes[0];}
  const rowTree=cluster(z),columnTree=cluster(samples.map((_,i)=>z.map(row=>row[i]))),R=genes.length,C=samples.length;
  const rowOrder=rowTree.leaves.map(i=>genes[i]),columnOrder=columnTree.leaves.map(i=>samples[i]);
  function dendrogram(tree,vertical){const positions=new Map(tree.leaves.map((id,i)=>[id,i+.5])),segments=[];function visit(node){if(!node.left)return {p:positions.get(node.leaves[0]),h:0};const a=visit(node.left),b=visit(node.right),h=node.height/tree.height;const points=[[a.p,a.h],[a.p,h],[b.p,h],[b.p,b.h]].map(([p,d])=>vertical?[-.4-2.4*d,R-p]:[p,R+1+4*d]);for(let i=1;i<points.length;i++)segments.push({x0:points[i-1][0],y0:points[i-1][1],x1:points[i][0],y1:points[i][1]});return {p:(a.p+b.p)/2,h};}visit(tree);return segments;}
  const branches=[...dendrogram(rowTree,true),...dendrogram(columnTree,false)];
  const cells=rows.map(r=>{const x=columnOrder.indexOf(r.sample),y=R-1-rowOrder.indexOf(r.gene);return {...r,x0:x,x1:x+1,y0:y,y1:y+1,zscore:z[genes.indexOf(r.gene)][samples.indexOf(r.sample)]};});
  const limit=Math.max(...cells.map(r=>Math.abs(r.zscore))),conditions=[...new Set(rows.map(r=>r.condition))].sort();
  const conditionColors=categorical({domain:conditions,range:['#447cad','#e5a14a']}),zColors=continuous({domain:[-limit,limit],colormap:'RdBu'});
  const strip=columnOrder.map((sample,x)=>({x0:x,x1:x+1,condition:rows.find(r=>r.sample===sample).condition}));
  let gene=$state(rowOrder[0]);
  const detail=$derived(rows.filter(r=>r.gene===gene));
  const geneLabels=rowOrder.map((gene,i)=>({gene,x:C+.1,y:R-i-.5}));
  const sampleLabels=columnOrder.map((sample,i)=>({sample,x:i+.5,y:-.6}));
</script>
<svelte:head><title>Gene expression</title></svelte:head>
<main><h1>Gene expression</h1><p>Average-linkage correlation clustering on gene z-scores. Hover a cell to inspect its gene.</p>
<div class="layout"><Plot autoBounds legend bind:this={primary} title="Gene expression" width={780} height={800} responsive axes2d={false} x={{domain:[-3,C+2]}} y={{domain:[-1.3,R+5.2]}}>
<Data value={branches}><Segments start={['x0','y0']} end={['x1','y1']} color="#536375" width={1}/></Data>
<Data value={cells}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="zscore" fillScale={zColors} tooltip={['gene','sample','condition','log2_expression','zscore']} onpointermove={e=>gene=cells[e.sourceRow??e.rowIndex].gene}/></Data>
<Data value={strip}><Rect x0="x0" x1="x1" y0={R+.2} y1={R+.7} fill="condition" fillScale={conditionColors}/></Data>
<Data value={geneLabels}><Text x="x" y="y" text="gene" align="left" size={9}/></Data>
<Data value={sampleLabels}><Text x="x" y="y" text="sample" size={9}/></Data>
</Plot><section><label>Gene <select aria-label="Gene" bind:value={gene}>{#each rowOrder as g}<option>{g}</option>{/each}</select></label>
<Plot autoBounds title="Expression by condition" width={400} height={550} responsive data={detail} x={{label:'Condition'}} y={{label:'Log2 expression'}}>
<BoxPlot x="condition" y="log2_expression" fill="condition" fillScale={conditionColors} opacity={.3}/>
<Points x="condition" y="log2_expression" fill="condition" fillScale={conditionColors} size={7} tooltip={['gene','sample','log2_expression']}/>
</Plot><h2 data-testid="gene">{gene}</h2><table><thead><tr><th>Sample</th><th>Condition</th><th>Expression</th></tr></thead><tbody>{#each detail as r}<tr><td>{r.sample}</td><td>{r.condition}</td><td>{r.log2_expression.toFixed(3)}</td></tr>{/each}</tbody></table></section></div></main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}.layout{display:grid;grid-template-columns:1.8fr 1fr;gap:22px}h1{margin:0}select{padding:6px}table{width:100%;border-collapse:collapse}td,th{padding:4px;text-align:left;border-bottom:1px solid #d4dfe8}</style>
