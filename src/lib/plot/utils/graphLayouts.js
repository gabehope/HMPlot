import { evaluateTransientExpression } from "./expressionPlans.js";
import { graph as makeDag, sugiyama } from 'd3-dag';
import { sankey, sankeyLeft, sankeyRight, sankeyCenter, sankeyJustify } from 'd3-sankey';
import { numpy as np } from '@hmplot/jax';
import { publishLayout } from './layoutPublication.js';
import { hostColumn, graphData } from './graphData.js';

const check = signal => { if (signal?.aborted) throw new DOMException('Canceled', 'AbortError'); };
const point = ([x, y], orientation) => orientation === 'up' ? [x, y] :
  orientation === 'left' ? [-y, x] : orientation === 'right' ? [y, x] : [x, -y];
const bounds = (x0, x1, y0, y1, orientation) => {
  const corners = [point([x0,y0],orientation),point([x1,y1],orientation)];
  return [Math.min(corners[0][0],corners[1][0]),Math.max(corners[0][0],corners[1][0]),
    Math.min(corners[0][1],corners[1][1]),Math.max(corners[0][1],corners[1][1])];
};
async function sizes(graph, width, height, evaluator) {
  const values = [];
  for (const [field, fallback] of [[width,1],[height,1]]) {
    if (field === undefined) { values.push(Array(graph.ids.length).fill(fallback)); continue; }
    const evaluated = evaluateTransientExpression(field, graph.nodeScope, { rowCount: graph.ids.length, evaluator });
    try { values.push(await hostColumn(evaluated.value)); } finally { evaluated.dispose(); }
  }
  for (const vector of values) if (vector.some(v => !Number.isFinite(v) || v <= 0))
    throw Error('DAG node sizes must be positive and finite.');
  return values;
}
function publish(scope, graph, nodeValues, edgeValues) {
  const owned = [], own = v => (owned.push(v), v);
  try {
    const nodeColumns = {};
    for (const [key, value] of Object.entries(nodeValues))
      nodeColumns[key] = own(np.array(value));
    const edgeColumns = {};
    for (const [key, value] of Object.entries(edgeValues))
      edgeColumns[key] = key === 'routePoints' ? value : own(np.array(value));
    return publishLayout(scope, graph, { nodeColumns, edgeColumns, owned,
      nodeFields: Object.keys(nodeValues).filter(field => field !== 'depth'), edgeFields: Object.keys(edgeValues) });
  } catch (error) { owned.forEach(v => v.dispose()); graph.dispose(); throw error; }
}
export async function dagLayout(scope, c, { signal, evaluator } = {}) {
  const orientation = c.orientation ?? 'down';
  if (!['down','up','left','right'].includes(orientation)) throw Error('DAG orientation must be down, up, left, or right.');
  const graph = await graphData(scope, { ...c, name: 'DAG' }, { signal });
  try {
    const [widths, heights] = await sizes(graph, c.nodeWidth, c.nodeHeight, evaluator); check(signal);
    const dag = makeDag(), vertices = graph.ids.map((_,index) => dag.node({index}));
    const links = Array.from(graph.from, (from,row) => dag.link(vertices[from],vertices[graph.to[row]],{row}));
    if (!dag.acyclic()) throw Error('DAG requires an acyclic graph.');
    const gap = [c.nodeGap ?? 1,c.layerGap ?? 1];
    if (gap.some(v => !Number.isFinite(v) || v < 0)) throw Error('DAG gaps must be finite and nonnegative.');
    sugiyama().nodeSize(node => [widths[node.data.index],heights[node.data.index]]).gap(gap)(dag);
    const p = [], x=[], y=[], x0=[], x1=[], y0=[], y1=[];
    for (let index=0; index<vertices.length; index++) {
      const vertex = vertices[index], center=point([vertex.x,vertex.y],orientation);
      const b=bounds(vertex.x-widths[index]/2,vertex.x+widths[index]/2,
        vertex.y-heights[index]/2,vertex.y+heights[index]/2,orientation);
      p.push(center);x.push(center[0]);y.push(center[1]);x0.push(b[0]);x1.push(b[1]);y0.push(b[2]);y1.push(b[3]);
    }
    const routePoints=links.map(link => link.points.map(p=>point(p,orientation)));
    const start=routePoints.map(points=>points[0]),end=routePoints.map(points=>points.at(-1));
    check(signal);
    return publish(scope,graph,{position:p,x,y,x0,x1,y0,y1},{start,end,routePoints});
  } catch (error) { graph.dispose(); throw error; }
}

export async function sankeyLayout(scope, c, { signal } = {}) {
  const orientation = c.orientation ?? 'right';
  if (!['down','up','left','right'].includes(orientation)) throw Error('Sankey orientation must be down, up, left, or right.');
  if (!c.value || !scope.has(c.value)) throw Error('Sankey requires a value column.');
  const graph = await graphData(scope, { ...c, name: 'Sankey' }, { signal });
  try {
    const values = await hostColumn(graph.edgeScope.get(c.value));
    if (values.some(v => !Number.isFinite(v) || v < 0)) throw Error('Sankey values must be finite and nonnegative.');
    for (let i=0;i<graph.from.length;i++) if(graph.from[i]===graph.to[i]) throw Error('Sankey cannot draw a link from a node to itself (a self-loop); filter those rows out, where source differs from target.');
    const nodeWidth=c.nodeWidth??.025,nodePadding=c.nodePadding??.02,iterations=c.iterations??8;
    if (![nodeWidth,nodePadding].every(v=>Number.isFinite(v)&&v>=0)||!Number.isInteger(iterations)||iterations<0)
      throw Error('Sankey nodeWidth and nodePadding must be nonnegative and iterations an integer.');
    const sourceNodes=graph.ids.map((id,index)=>({id,index}));
    const sourceLinks=Array.from(graph.from,(from,row)=>({source:from,target:graph.to[row],value:values[row],row}));
    const align={left:sankeyLeft,right:sankeyRight,center:sankeyCenter,justify:sankeyJustify}[c.align??'justify'];
    if(!align)throw Error('Sankey align must be left, right, center, or justify.');
    let laid;
    try{laid=sankey().nodeId(node=>node.index).nodeWidth(nodeWidth).nodePadding(nodePadding)
      .iterations(iterations).nodeAlign(align).extent([[0,0],[1,1]])({nodes:sourceNodes,links:sourceLinks});}
    catch(error){throw Error(`Sankey layout failed: ${error.message}`);}
    const layers=new Map();
    for(const node of laid.nodes)layers.set(node.depth,(layers.get(node.depth)??0)+1);
    if([...layers.values()].some(count=>(count-1)*nodePadding>1))
      throw Error('Sankey nodePadding leaves no room for the nodes of its fullest layer: lower nodePadding (a fraction of the plot, 0.02 by default).');
    const p=[],x=[],y=[],x0=[],x1=[],y0=[],y1=[],depth=[],throughput=[];
    for(const node of laid.nodes){
      const b=bounds(node.y0,node.y1,node.x0,node.x1,orientation);
      const center=[(b[0]+b[1])/2,(b[2]+b[3])/2];
      p.push(center);x.push(center[0]);y.push(center[1]);x0.push(b[0]);x1.push(b[1]);y0.push(b[2]);y1.push(b[3]);
      depth.push(node.depth);throughput.push(node.value);
    }
    const start=[],end=[],startLower=[],startUpper=[],endLower=[],endUpper=[];
    for(const link of laid.links){
      const a=link.source.x1,b=link.target.x0,half=link.width/2;
      start[link.row]=point([link.y0,a],orientation);end[link.row]=point([link.y1,b],orientation);
      startLower[link.row]=point([link.y0-half,a],orientation);
      startUpper[link.row]=point([link.y0+half,a],orientation);
      endLower[link.row]=point([link.y1-half,b],orientation);
      endUpper[link.row]=point([link.y1+half,b],orientation);
    }
    check(signal);
    return publish(scope,graph,{position:p,x,y,x0,x1,y0,y1,depth,throughput},
      {start,end,startLower,startUpper,endLower,endUpper});
  } catch (error) { graph.dispose(); throw error; }
}
