import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMappings} from '../../src/lib/plot/utils/mapping.js';
import {orthographicPoint} from '../../src/lib/plot/utils/coordinates.js';
import {createDataScope} from '../../src/lib/plot/utils/categorical.js';
import {runTransform} from '../../src/lib/plot/utils/transforms.js';
import {treeLayout} from '../../src/lib/plot/utils/tree.js';
import {curveControls} from '../../src/lib/plot/utils/curves.js';
import {disposeArrays} from '../../src/lib/plot/utils/data.js';
test('mapping precedence, position families, and metadata exclusion',()=>{
 assert.deepEqual(mergeMappings('Text',[{position:'p',fill:'group',name:'ignored',onclick:()=>{}},{size:14}],{x:'x',y:'y',color:'black'}),{size:14,x:'x',y:'y',color:'black'});
 assert.deepEqual(mergeMappings('Line',[{text:'ignored',curve:'basis',x:'a',y:'b'}],{position:[[0,0]]}),{curve:'basis',position:[[0,0]]});
});
test('orthographic defaults to a centered visible hemisphere and projects radius',()=>{
 const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8));
 near(orthographicPoint([90,0,3],{baseRadius:0}),[3,0]);
 near(orthographicPoint([0,0,2],{baseRadius:0}),[0,0]);
 near(orthographicPoint([0,0,2],{baseRadius:0,projectionCenter:[0,-90]}),[0,2]);
 assert.equal(orthographicPoint([0,25,0],{baseRadius:0}),null);
 assert.equal(orthographicPoint([123,25,0],{baseRadius:0}),null);
 near(orthographicPoint([0,-20,2]),[0,-3*Math.sin(20*Math.PI/180)]);
 assert.equal(orthographicPoint([180,0,2]),null);assert.equal(orthographicPoint([0,20,-2],{baseRadius:0}),null);
});
test('tree drops disconnected nodes and resolves cycles deterministically',async()=>{
 const s=createDataScope();s.update({source:['a','a','b','c','x'],target:['b','c','d','d','y']});
 const g=await runTransform('GraphData',s,{});
 const t=await treeLayout(g,{root:'a'});
 try{assert.equal(t.nodes.length,4);assert.equal(t.edges.length,3);assert.deepEqual(await t.nodes.get('depth').ref.js(),[0,1,1,2]);assert.deepEqual(await t.nodes.get('position').ref.js(),[[0,0],[-.5,-1],[.5,-1],[-.5,-2]]);assert.deepEqual(await t.nodes.get('order').ref.js(),[NaN,NaN,1,0]);}finally{t.dispose();}
 await assert.rejects(treeLayout(g,{root:'absent'}),/root/);g.dispose();s.dispose();
});
test('quadratic controls agree with degree elevation',async()=>{
 const c=curveControls({start:[[0,0]],end:[[3,0]],control1:[[1.5,3]]},'Segments','quadratic');
 assert.deepEqual(await c.control1.ref.js(),[[1,2]]);assert.deepEqual(await c.control2.ref.js(),[[2,2]]);disposeArrays(c);
});
import {curveBasis,curveCatmullRom,curveMonotoneX} from 'd3';
import {basisPath,validateCurveInput} from '../../src/lib/plot/utils/curves.js';
import {lineArrays} from '../../src/lib/plot/utils/data.js';
function referenceCurve(factory,points){const result=[];let current;const context={moveTo(x,y){current=[x,y]},lineTo(x,y){const end=[x,y];result.push({start:current,end,c1:current.map((v,i)=>v+(end[i]-v)/3),c2:current.map((v,i)=>v+2*(end[i]-v)/3)});current=end;},bezierCurveTo(x1,y1,x2,y2,x,y){result.push({start:current,end:[x,y],c1:[x1,y1],c2:[x2,y2]});current=[x,y];},closePath(){}};const curve=factory(context);curve.lineStart();points.forEach(p=>curve.point(...p));curve.lineEnd();return result;}
const curveOptions={get:k=>k.endsWith('Transform')?'linear':k.endsWith('bounds')?[0,5]:[0,5]};
test('empty and singleton Lines need no curve controls and still validate curve settings',()=>{
 for(const points of [[],[[0,0]]]){
  const arrays=lineArrays(points,curveOptions,true);
  for(const curve of ['basis','catmull-rom','monotone-x','monotone-y'])
   assert.deepEqual(curveControls(arrays,'Line',curve),{});
  assert.throws(()=>curveControls(arrays,'Line','unknown'),/not supported/);
  assert.throws(()=>curveControls(arrays,'Line','basis',2),/curveAlpha/);
 }
});
test('GPU curve coefficients agree with independent D3 fixtures',async()=>{
 const points=[[0,0],[1,2],[2,1],[3,3],[4,2]];
 for(const [name,factory] of [['basis',curveBasis],['catmull-rom',curveCatmullRom.alpha(.5)],['monotone-x',curveMonotoneX]]){
  const a=lineArrays(points,curveOptions,true),c=name==='basis'?basisPath(a):curveControls(a,'Line',name),ref=referenceCurve(factory,points);
  try{for(const [key,expected] of [['control1','c1'],['control2','c2']]){const actual=(await c[key].ref.js()).filter(row=>row.every(Number.isFinite));assert.equal(actual.length,ref.length,name);actual.forEach((row,i)=>row.forEach((v,j)=>assert.ok(Math.abs(v-ref[i][expected][j])<1e-5,`${name} ${key} ${i},${j}: ${v} != ${ref[i][expected][j]}`)));}}finally{disposeArrays(a);disposeArrays(c);}
 }
});
test('monotone validation rejects repeated or unordered coordinates and accepts breaks',async()=>{
 await assert.rejects(validateCurveInput('Line',{position:[[0,0],[0,1]],curve:'monotone-x'}),/monotonic/);
 await assert.rejects(validateCurveInput('Line',{position:[[0,0],[2,1],[1,2]],curve:'monotone-x'}),/monotonic/);
 await validateCurveInput('Line',{position:[[0,0],[2,1],[NaN,NaN],[1,1],[0,0]],curve:'monotone-x'});
});

test('basis gaps retain each finite run including endpoint pieces',async()=>{
 const points=[[0,0],[1,2],[2,0],[NaN,NaN],[4,1],[5,3],[6,1]];
 const a=lineArrays(points,curveOptions,true),c=basisPath(a);
 try{
  const actual=(await c.control1.ref.js()).filter(row=>row.every(Number.isFinite));
  const expected=[...referenceCurve(curveBasis,points.slice(0,3)),...referenceCurve(curveBasis,points.slice(4))];
  assert.equal(actual.length,expected.length);
  actual.forEach((row,i)=>row.forEach((v,j)=>assert.ok(Math.abs(v-expected[i].c1[j])<1e-5)));
 }finally{disposeArrays(a);disposeArrays(c);}
});
