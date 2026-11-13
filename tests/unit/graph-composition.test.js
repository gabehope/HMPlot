import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataScope} from '../../src/lib/plot/utils/categorical.js';
import {numpy as np} from '@hmplot/jax';
import {graphData as graphDataImpl,hostColumn,createGraphData,graphScope,graphTable,graphPositions,requireGraph} from '../../src/lib/plot/utils/graphData.js';
import {treeLayout as treeLayoutImpl} from '../../src/lib/plot/utils/tree.js';
import {dagLayout as dagLayoutImpl,sankeyLayout as sankeyLayoutImpl} from '../../src/lib/plot/utils/graphLayouts.js';
import {packLayout as packLayoutImpl,treemapLayout as treemapLayoutImpl} from '../../src/lib/plot/utils/hierarchyLayouts.js';
import {forceTopology as forceTopologyImpl} from '../../src/lib/plot/utils/force.js';
import {hierarchy,cluster} from 'd3';
import {createDataView} from '../../src/lib/plot/utils/dataView.js';
import {col,view,where,min,sum,tween} from '../../src/lib/plot/utils/expressions.js';
import {runTransform,disposeTransformCache} from '../../src/lib/plot/utils/transforms.js';
import {graphHierarchy} from '../../src/lib/plot/utils/graphHierarchy.js';
import {asArray} from '../../src/lib/plot/utils/data.js';

const table=data=>{const scope=createDataScope();scope.update(data);return scope;};
const values=async(view,field)=>asArray(view.get(field)).js();

// Fixture-only conversion keeps old algorithm cases concise while exercising strict graph inputs.
// Production layouts accept GraphData; they have no legacy construction adapter.
const fixtureNodes = new WeakMap();
async function graphFixture(scope, config, options = {}) {
  const { nodes, nodeKey = 'id', source = 'source', target = 'target', ...settings } = config;
  let nodeScope = fixtureNodes.get(scope);
  if (!nodeScope) {
    nodeScope = createDataScope(); fixtureNodes.set(scope, nodeScope);
    const dispose = scope.dispose.bind(scope); scope.dispose = () => { nodeScope.dispose(); dispose(); };
  }
  nodeScope.setKey(nodeKey);
  if (nodes !== undefined) nodeScope.update(nodes);
  else {
    const ids = [...new Set([...(await hostColumn(scope.get(source))), ...(await hostColumn(scope.get(target)))])];
    const previous = nodeScope.has('id') ? nodeScope.get('id') : undefined;
    nodeScope.update({ id: previous && ids.length === previous.length && ids.every((id, i) => id === previous[i]) ? previous : ids });
  }
  const graph = createGraphData({ nodes: nodeScope, edges: scope, nodeKey, source, target }), input = graphScope(graph);
  graph.dispose();
  return { input, settings, options };
}
function graphCase(implementation) {
  return async (scope, config, options = {}) => {
    const { input, settings } = await graphFixture(scope, config, options);
    try { return await implementation(input, settings, options); }
    finally { input.dispose(); }
  };
}
const treeLayout = graphCase(treeLayoutImpl), dagLayout = graphCase(dagLayoutImpl), sankeyLayout = graphCase(sankeyLayoutImpl),
  packLayout = graphCase(packLayoutImpl), treemapLayout = graphCase(treemapLayoutImpl), forceTopology = graphCase(forceTopologyImpl), graphData = graphCase(graphDataImpl);

test('undirected layout exits retain edges stored toward the root',async()=>{
  const scope=table({source:[1,0],target:[0,2],length:[4,6]}),nodeScope=createDataScope(),cache=new Map(),frames=[];
  const c={source:'source',target:'target',root:0,mode:'tidy-approx',nodes:{id:[0,1,2]},nodeKey:'id',edgeLength:'length',exit:{edgeLength:0},animationDuration:100,animationEasing:'linear'};
  const run=async t=>{const f=await treeLayout(scope,c,{cache,nodeScope,time:t});frames.push(f);return f;};
  try{
    await run(0);scope.update({source:[0],target:[2],length:[6]});c.nodes={id:[0,2]};await run(0);
    const half=await run(50);assert.deepEqual(await values(half.nodes,'id'),[0,2,1]);assert.deepEqual(await values(half.nodes,'y'),[0,-6,-2]);
    assert.deepEqual(await values((await run(100)).nodes,'id'),[0,2]);
    await assert.rejects(treeLayout(scope,{...c,source:'missing'}),/missing.*column/);
  }finally{frames.forEach(f=>f.dispose());cache.forEach(s=>s.dispose());nodeScope.dispose();scope.dispose();}
});

test('Tree consumes upstream tween columns with their own timing through layout membership',async()=>{
  const scope=table({source:[0,0],target:[1,2],length:[2,4]}),nodeScope=createDataScope(),cache=new Map(),tweens={},frames=[],views=[];
  const calculate=async(time=0)=>{const v=await runTransform('Calculate',scope,{columns:{moving:tween('length',{duration:200,easing:'linear'})},__viewState:{time}},{cache:tweens});views.push(v);return v;};
  const config={source:'source',target:'target',root:0,directed:true,nodes:{id:[0,1,2]},nodeKey:'id',edgeLength:'moving',where:true,enter:{edgeLength:0},exit:{edgeLength:0},animationDuration:100};
  try{
    const initial=await calculate();for(const mode of ['tidy','tidy-approx']){config.mode=mode;frames.push(await treeLayout(initial,config,{nodeScope,cache,time:0}));}
    scope.update({source:scope.get('source'),target:scope.get('target'),length:[6,8]});await calculate();const next=await calculate(100);
    for(const mode of ['tidy','tidy-approx']){config.mode=mode;const f=await treeLayout(next,config,{nodeScope,cache,time:100});frames.push(f);
      assert.deepEqual(await values(f.nodes,'y'),[0,-4,-6]);assert.equal(f.liveUntil,-Infinity);assert.equal(f.edges.liveUntil,200);
      assert.equal(f.nodes.live,true);assert.ok(f.nodes.liveColumns.has("position"));
      assert.ok(f.edges.liveColumns.has("start"));}
  }finally{frames.forEach(f=>f.dispose());views.forEach(v=>v.dispose());cache.forEach(s=>s.dispose());disposeTransformCache(tweens);nodeScope.dispose();scope.dispose();}
});

test('Tree input tweens follow animation groups across changed node keys and reset schemes',async()=>{
  const scope=table({source:['r0','r0'],target:['a0','b0']}),nodeScope=createDataScope(),cache=new Map(),frames=[];
  const config={source:'source',target:'target',root:'r0',directed:true,nodeKey:'id',mode:'partition',orientation:'up',
    nodes:{id:['r0','a0','b0'],group:['root','a','b'],band:[1,2,4]},
    __animationGroup:'group',layerHeight:tween('band',{duration:1000,easing:'linear'})};
  const run=async time=>{const f=await treeLayout(scope,config,{cache,nodeScope,time});frames.push(f);return f;};
  try{
    await run(0);
    scope.update({source:['r1','r1'],target:['b1','a1']});
    config.root='r1';config.nodes={id:['r1','b1','a1'],group:['root','b','a'],band:[1,8,6]};
    await run(0);
    const half=await run(500);
    assert.deepEqual(await hostColumn(half.nodes.get('id')),['r1','b1','a1']);
    assert.deepEqual(await values(half.nodes,'y1'),[1,7,5]);
    assert.equal(half.liveUntil,1000);
    config.__animationGroup='id';
    const reset=await run(500);
    assert.deepEqual(await values(reset.nodes,'y1'),[1,9,7]);
    assert.equal(reset.liveUntil,-Infinity);
  }finally{frames.forEach(f=>f.dispose());cache.forEach(s=>s.dispose());nodeScope.dispose();scope.dispose();}
});

test('cached GPU tree plans rebuild when the root changes',async()=>{
  const scope=table({source:[0,0,1],target:[1,2,3]}),nodeScope=createDataScope(),cache=new Map(),frames=[];
  try{
    for(const mode of ['partition','tidy-approx'])for(const root of [0,1,0]){
      const f=await treeLayout(scope,{source:'source',target:'target',root,mode,directed:true},{nodeScope,cache});frames.push(f);
      assert.deepEqual(await values(f.nodes,'id'),root===0?[0,1,2,3]:[1,3]);
      assert.equal((await values(f.nodes,'depth'))[0],0);
      assert.ok((await values(f.nodes,'position')).flat().every(Number.isFinite));
    }
  }finally{frames.forEach(f=>f.dispose());cache.forEach(s=>s.dispose());nodeScope.dispose();scope.dispose();}
});

test('layout endpoints support distinct enter/exit values and retired branches consume no space',async()=>{
  const scope=table({source:[0,0],target:[1,2],length:[4,6]}),nodeScope=createDataScope(),cache=new Map(),frames=[];
  const config={source:'source',target:'target',root:0,directed:true,nodes:{id:[0,1,2],show:[1,1,1]},nodeKey:'id',mode:'tidy-approx',where:col.show,
    edgeLength:'length',enter:{edgeLength:1,nodeWidth:1},exit:{edgeLength:2,nodeWidth:2},animationDuration:100,animationEasing:'linear'};
  const run=async(time)=>{const f=await treeLayout(scope,config,{nodeScope,cache,time});frames.push(f);return f;};
  try{
    await run(0);config.nodes={id:[0,1,2],show:[1,0,1]};await run(0);
    assert.deepEqual(await values((await run(50)).nodes,'y'),[0,-3,-6]);
    const end=await run(100);assert.deepEqual(await values(end.nodes,'id'),[0,2]);
    assert.deepEqual(await values(end.nodes,'x'),[0,0]);
    config.nodes={id:[0,1,2],show:[1,1,1]};
    assert.deepEqual(await values((await run(100)).nodes,'y'),[0,-1,-6]);
    assert.deepEqual(await values((await run(150)).nodes,'y'),[0,-2.5,-6]);
    assert.deepEqual(await values((await run(200)).nodes,'y'),[0,-4,-6]);
    await assert.rejects(treeLayout(scope,{...config,enter:true},{nodeScope,cache}),/Tree enter: pass an object/);
    for(const mode of ['tidy','tidy-approx']){
      config.mode=mode;config.nodes={id:[0,1,2],show:[1,0,1]};await run(200);
      assert.deepEqual(await values((await run(300)).nodes,'x'),[0,0]);
    }
  }finally{frames.forEach(f=>f.dispose());cache.forEach(s=>s.dispose());nodeScope.dispose();scope.dispose();}
});

test('GPU tidy uses unequal edge lengths and layout-owned collapse/expand with cached topology',async()=>{
  const scope=table({source:[0,0,1,1],target:[1,2,3,4],length:[2,4,1,3]}),nodeScope=createDataScope(),cache=new Map();
  const nodes={id:[0,1,2,3,4],show:[1,1,1,1,1],group:[0,0,1,0,1]};
  const config={source:'source',target:'target',root:0,directed:true,nodes,nodeKey:'id',mode:'tidy-approx',
    where:col.show,edgeLength:'length',enter:{edgeLength:0},exit:{edgeLength:0},animationDuration:100,animationEasing:'linear'};
  const frames=[],run=async(time)=>{const f=await treeLayout(scope,config,{nodeScope,cache,time});frames.push(f);return f;};
  try{
    const initial=await run(0),plan=cache.get('__treeTopology').kernel;
    assert.deepEqual(await values(initial.nodes,'y'),[0,-2,-4,-3,-5]);
    config.nodes={...nodes,show:[1,1,1,0,0]};
    await run(0);const halfway=await run(50);
    assert.deepEqual(await values(halfway.nodes,'y'),[0,-2,-4,-2.5,-3.5]);
    assert.equal(halfway.nodes.get('depth'), initial.nodes.get('depth'), 'numeric ticks share structural output columns');
    assert.equal(halfway.nodes.identityRows, true, 'complete layouts preserve the source row order');
    assert.deepEqual(halfway.nodes.get('group'),[0,0,1,0,1]);
    assert.equal(cache.get('__treeTopology').kernel,plan);
    const collapsed=await run(100);assert.deepEqual(await values(collapsed.nodes,'id'),[0,1,2]);
    assert.deepEqual(await values(collapsed.nodes,'group'),[0,0,1]);
    assert.deepEqual(await values(initial.nodes,'id'),[0,1,2,3,4], 'replacing the output plan preserves retained frames');
    assert.deepEqual(await values(collapsed.nodes,'x'),[0,-.5,.5]);
    config.nodes=nodes;await run(100);const entering=await run(150);
    assert.deepEqual(await values(entering.nodes,'y'),await values(halfway.nodes,'y'));
    // Retarget an unfinished expansion from its current contribution.
    config.nodes={...nodes,show:[1,1,1,0,0]};const reverse=await run(150);
    assert.deepEqual(await values(reverse.nodes,'position'),await values(entering.nodes,'position'));
    await run(200);const end=await run(250);assert.deepEqual(await values(end.nodes,'id'),[0,1,2]);
  }finally{frames.forEach(f=>f.dispose());cache.forEach(s=>s.dispose());nodeScope.dispose();scope.dispose();}
});

test('layout exit retains removed data and enter initializes newly added branch contributions',async()=>{
  const scope=table({source:[0,0,1],target:[1,2,3],length:[2,4,3]}),nodeScope=createDataScope(),cache=new Map();
  const config={source:'source',target:'target',root:0,directed:true,mode:'tidy-approx',edgeLength:'length',
    nodes:{id:[0,1,2,3],name:['root','a','b','leaf']},nodeKey:'id',enter:{edgeLength:0},exit:{edgeLength:0},animationDuration:100,animationEasing:'linear'};
  const frames=[],run=async(time)=>{const f=await treeLayout(scope,config,{nodeScope,cache,time});frames.push(f);return f;};
  try{
    await run(0);scope.update({source:[0,0],target:[1,2],length:[2,4]});config.nodes={id:[0,1,2],name:['root','a','b']};
    await run(0);const leaving=await run(50);assert.deepEqual(await values(leaving.nodes,'id'),[0,1,2,3]);
    assert.deepEqual(await values(leaving.nodes,'y'),[0,-2,-4,-3.5]);
    scope.update({source:scope.get('source'),target:scope.get('target'),length:[5,7]});
    config.nodes={id:[0,1,2],name:['root','updated','b']};
    const updated=await run(50);assert.deepEqual(await values(updated.nodes,'y'),[0,-5,-7,-6.5]);
    const removed=await run(100);assert.deepEqual(await values(removed.nodes,'id'),[0,1,2]);
    assert.deepEqual(await values(removed.nodes,'y'),[0,-5,-7]);
    scope.update({source:[0,0,1],target:[1,2,4],length:[2,4,6]});config.nodes={id:[0,1,2,4],name:['root','a','b','new']};
    const start=await run(100),half=await run(150),end=await run(200);
    assert.deepEqual(await values(start.nodes,'y'),[0,-2,-4,-2]);assert.deepEqual(await values(half.nodes,'y'),[0,-2,-4,-5]);
    assert.deepEqual(await values(end.nodes,'y'),[0,-2,-4,-8]);
  }finally{frames.forEach(f=>f.dispose());cache.forEach(s=>s.dispose());nodeScope.dispose();scope.dispose();}
});

test('partition tweens widths and per-node heights before layout, in both directions',async()=>{
  const scope=table({source:[0,0,1,1],target:[1,2,3,4]}),nodeScope=createDataScope(),cache=new Map();
  const nodes={id:[0,1,2,3,4],weight:[1,1,8,2,4],band:[1,1,1,1,1]};
  const config={source:'source',target:'target',root:0,directed:true,nodes,nodeKey:'id',mode:'partition',orientation:'up',
    nodeWidth:tween(col.weight,{duration:100,easing:'linear'}),layerHeight:tween(col.band,{duration:100,easing:'linear'})};
  const frames=[];
  const run=async(time)=>{const frame=await treeLayout(scope,config,{nodeScope,cache,time});frames.push(frame);return frame;};
  try{
    await run(0);
    nodes.weight=[1,1,0,2,4];nodes.band=[0,1,1,1,1];
    // A new table version carries the new numeric targets; node keys retain tween state.
    config.nodes={...nodes};
    const start=await run(0),half=await run(50),end=await run(100);
    assert.equal(start.liveUntil,100);assert.equal(half.liveUntil,100);assert.equal(end.liveUntil,-Infinity);
    assert.deepEqual(await values(half.nodes,'x1'),[10,6,10,2,6]);
    assert.deepEqual(await values(half.nodes,'y0'),[0,.5,.5,1.5,1.5]);
    assert.deepEqual(await values(end.nodes,'x1'),[6,6,6,2,6]);
    assert.deepEqual(await values(end.nodes,'y0'),[0,0,0,1,1]);
    for(const f of [start,half,end]){
      const x0=await values(f.nodes,'x0'),x1=await values(f.nodes,'x1');
      for(const [child,parent] of [[1,0],[2,0],[3,1],[4,1]])assert.ok(x0[child]>=x0[parent]&&x1[child]<=x1[parent]);
    }
    config.nodes={...nodes,weight:[1,1,8,2,4],band:[1,1,1,1,1]};
    await run(100);const entering=await run(150);
    assert.deepEqual(await values(entering.nodes,'x1'),await values(half.nodes,'x1'));
    assert.deepEqual(await values(entering.nodes,'y0'),await values(half.nodes,'y0'));
    // Fully collapsed partitions are valid, without divisions by zero or negative bands.
    config.nodeWidth=0;config.layerHeight=0;const zero=await run(200);
    assert.deepEqual(await values(zero.nodes,'position'),Array(5).fill([0,0]));
  }finally{frames.forEach(f=>f.dispose());cache.forEach(s=>s.dispose());nodeScope.dispose();scope.dispose();}
});

test('every Tree mode roots reachable nodes consistently and gives edges child depth',async()=>{
  // a--leaf is reversed in the original table, and solo is outside the component.
  const scope=table({source:['r','r','a','a','leaf','x'],target:['a','b','a1','a2','a','y'],tag:[1,2,3,4,5,6]});
  const nodes={id:['r','a','b','a1','a2','leaf','x','y','solo']};
  try{
    for(const mode of ['tidy','tidy-approx','partition','cluster'])for(const supplied of [false,true])for(const directed of [false,true]){
      const frame=await treeLayout(scope,{source:'source',target:'target',root:'a',mode,directed,
        ...(supplied?{nodes,nodeKey:'id'}:{})});
      try{
        const ids=await (async()=>{const c=frame.nodes.get('id');return (await c.codes.ref.js()).map(i=>c.categories[i]);})();
        assert.deepEqual([...ids].sort(),directed?['a','a1','a2']:['a','a1','a2','b','leaf','r']);
        const nodeDepth=await values(frame.nodes,'depth');
        assert.deepEqual(Object.fromEntries(ids.map((id,i)=>[id,nodeDepth[i]])),directed?{a:0,a1:1,a2:1}:{r:1,a:0,b:2,a1:1,a2:1,leaf:1});
        if(mode==='tidy'||mode==='tidy-approx'||mode==='partition'){
          const along=await values(frame.nodes,'y');
          assert.deepEqual(along,nodeDepth.map(d=>-(d+(mode==='partition'?.5:0))||0));
        }
        const depth=await values(frame.edges,'depth');
        assert.deepEqual([...depth].sort(),directed?[1,1]:[1,1,1,1,2]);
        const shown=createDataView(frame.edges,{mask:frame.edges.get('depth').ref.lessEqual(1),count:depth.filter(d=>d<=1).length});
        try{assert.deepEqual((await hostColumn(shown.get('tag'))).sort(),directed?[3,4]:[1,3,4,5]);}
        finally{shown.dispose();}
      }finally{frame.dispose();}
    }
  }finally{scope.dispose();}
});

test('Tree node selections and keys survive subtree layouts and node-table reordering',async()=>{
  const scope=table({source:[0,0,1,1],target:[1,2,3,4]});
  const nodeScope=createDataScope();
  const nodes={id:[0,1,2,3,4],name:['root','a','b','a1','a2']};
  const config={source:'source',target:'target',root:0,directed:true,nodes,nodeKey:'id'};
  const whole=await treeLayout(scope,config,{nodeScope});
  let focused,reordered;
  try{
    const identity=whole.nodes.identity;
    identity.selection.replace(identity,[1]);
    assert.deepEqual(await values(whole.nodes,'@selected'),[0,1,0,0,0]);
    const root=where(sum(view.selected),min(where(view.selected,col.id,5)),0);
    focused=await treeLayout(scope,{...config,root},{nodeScope});
    assert.equal(focused.nodes.aggregate,false);
    assert.equal(focused.nodes.identity,identity);
    assert.deepEqual(await values(focused.nodes,'id'),[1,3,4]);
    assert.deepEqual(await values(focused.nodes,'@selected'),[1,0,0]);
    reordered=await treeLayout(scope,{...config,root,nodes:{id:[4,3,2,1,0],name:[...nodes.name].reverse()}},{nodeScope});
    assert.deepEqual(await values(reordered.nodes,'id'),[4,3,1]);
    assert.deepEqual(await values(reordered.nodes,'@selected'),[0,0,1]);
    await assert.rejects(treeLayout(scope,{...config,root:col.id}),/must return one node ID/);
  }finally{reordered?.dispose();focused?.dispose();whole.dispose();nodeScope.dispose();scope.dispose();}
});

test('Tree parent coordinates match the rerooted layout, including partition bounds',async()=>{
  const scope=table({source:[0,0,1,1],target:[1,2,3,4]});
  try{for(const mode of ['tidy','partition','cluster'])for(const orientation of ['down','up','left','right']){
    const frame=await treeLayout(scope,{source:'source',target:'target',root:1,mode,orientation});
    try{
      const ids=await values(frame.nodes,'id'),parents=await values(frame.nodes,'parent');
      for(const [field,parentField] of [['position','parentPosition'],['x','parentX'],['y','parentY'],
        ...(mode==='partition'?[['x0','parentX0'],['x1','parentX1'],['y0','parentY0'],['y1','parentY1']]:[])]){
        const coordinates=await values(frame.nodes,field),parentCoordinates=await values(frame.nodes,parentField);
        for(let row=0;row<ids.length;row++)assert.deepEqual(parentCoordinates[row],parents[row]<0
          ?field==='position'?[NaN,NaN]:NaN:coordinates[ids.indexOf(parents[row])]);
      }
    }finally{frame.dispose();}
  }}finally{scope.dispose();}
});

test('partition validates only the rooted hierarchy, retaining cycle and multiple-parent errors',async()=>{
  const edges=table({source:['r','a','b','x','y'],target:['a','b','a','y','x']});
  try{
    await assert.rejects(treeLayout(edges,{source:'source',target:'target',root:'a',directed:true,mode:'partition'}),/cycles/);
    const leaf=await treeLayout(edges,{source:'source',target:'target',root:'b',directed:true,mode:'tidy'});
    leaf.dispose();
  }finally{edges.dispose();}
  const multi=table({source:['r','r','a'],target:['a','b','b']});
  try{await assert.rejects(treeLayout(multi,{source:'source',target:'target',root:'r',directed:true,mode:'partition'}),/one parent/);}
  finally{multi.dispose();}
});

test('GraphData resolves ordinary node expressions once for nodes and parallel edge endpoints',async()=>{
  const scope=table({source:['a','a','b'],target:['b','b','a'],tag:[1,2,3]});
  const nodes={id:['a','b','solo'],lane:[1,3,5],height:[2,4,6]};
  const {input}=await graphFixture(scope,{nodes});
  const nodeView=await graphTable(input,'nodes'), positions=await runTransform('Calculate',nodeView,{columns:{x:'lane',y:'height'}});
  const frame={nodes:await graphTable(positions,'nodes'),edges:await graphTable(positions,'edges')};
  try {
    assert.equal(frame.nodes.length,3);assert.equal(frame.edges.length,3);
    assert.deepEqual(await values(frame.nodes,'position'),[[1,2],[3,4],[5,6]]);
    assert.deepEqual(await values(frame.edges,'start'),[[1,2],[1,2],[3,4]]);
    assert.deepEqual(await values(frame.edges,'end'),[[3,4],[3,4],[1,2]]);
    assert.deepEqual(Array.from(frame.nodes.get('lane')),[1,3,5]);
  }finally{frame.nodes.dispose();frame.edges.dispose();positions.dispose();nodeView.dispose();input.dispose();scope.dispose();}
});

test('graph input rejects duplicate IDs and missing endpoints',async()=>{
  const scope=table({source:['a'],target:['b']});
  try{
    await assert.rejects(graphData(scope,{source:'source',target:'target',nodes:{id:['a','a']},nodeKey:'id'}),/duplicate node ID|Data keys must be unique/);
    await assert.rejects(graphData(scope,{source:'source',target:'target',nodes:{id:['a']},nodeKey:'id'}),/missing node/);
  }finally{scope.dispose();}
});

test('GraphData validates vector positions and layouts reject ordinary tables and old graph options',async()=>{
  const position=np.array([[0],[1]]), scope=table({source:['a'],target:['b']}), nodes=table({id:['a','b'],position});
  const graph=createGraphData({nodes,edges:scope}), input=graphScope(graph); graph.dispose();
  try {
    assert.throws(()=>graphPositions(requireGraph(input).nodes),/one 2D or 3D position/);
    await assert.rejects(treeLayoutImpl(scope,{root:'a'}),/requires graph data/);
    await assert.rejects(graphDataImpl(input,{source:'source'}),/no longer a layout option/);
  }finally{input.dispose();nodes.dispose();scope.dispose();position.dispose();}
});

test('Tree fixed spans expand parent and align children; every mode drops isolated nodes',async()=>{
  const scope=table({source:['r','r'],target:['a','b']});
  const nodes={id:['r','a','b','solo'],width:[5,2,1,1]};
  try{
    for(const [align,expected] of [['left',[0,2]],['center',[1,3]],['right',[2,4]]]){
      const tree=await treeLayout(scope,{source:'source',target:'target',root:'r',mode:'partition',
        nodes,nodeKey:'id',nodeWidth:'width',widthMode:'fixed',childAlign:align,orientation:'up'});
      try{assert.deepEqual((await values(tree.nodes,'x0')).slice(1),expected);
        assert.deepEqual(await values(tree.nodes,'x'),[2.5,expected[0]+1,expected[1]+.5]);}
      finally{tree.dispose();}
    }
    const tidy=await treeLayout(scope,{source:'source',target:'target',root:'r',nodes,nodeKey:'id'});
    try{assert.equal(tidy.nodes.length,3);assert.deepEqual(await values(tidy.nodes,'order'),[NaN,0,1]);}finally{tidy.dispose();}
  }finally{scope.dispose();}
});

test('Tree visualMargin insets partition bounds without moving centers or changing tidy mode',async()=>{
  const scope=table({source:['r','r'],target:['a','b']});
  const config={source:'source',target:'target',root:'r',mode:'partition',orientation:'up',
    nodes:{id:['r','a','b'],width:[5,2,1]},nodeKey:'id',nodeWidth:'width',widthMode:'fixed',childAlign:'left'};
  const plain=await treeLayout(scope,config),gapped=await treeLayout(scope,{...config,visualMargin:.2});
  try{
    const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
    const left=await values(gapped.nodes,'x0'),right=await values(gapped.nodes,'x1');
    const bottom=await values(gapped.nodes,'y0'),top=await values(gapped.nodes,'y1');
    [left[0],right[0],left[1],right[1],left[2],right[2]].forEach((value,index)=>
      near(value,[.1,4.9,.1,1.9,2.1,2.9][index]));
    [bottom[0],top[0],bottom[1],top[1]].forEach((value,index)=>
      near(value,[.1,.9,1.1,1.9][index]));
    assert.deepEqual(await values(gapped.nodes,'position'),await values(plain.nodes,'position'));
    assert.equal((await values(plain.nodes,'x1'))[1],(await values(plain.nodes,'x0'))[2]);
    await assert.rejects(treeLayout(scope,{...config,visualMargin:-1}),/visualMargin must be finite and nonnegative/);
  }finally{plain.dispose();gapped.dispose();scope.dispose();}
});

test('Tree cluster matches d3.cluster in every orientation, and order ranks the leaves',async()=>{
  // Unbalanced and not binary: a leaf beside deep subtrees, and a three-way merge.
  const kids={r:['a','c','b'],a:['a1','a2'],b:['b1','b2'],b1:['b11','b12','b13']};
  const pairs=Object.entries(kids).flatMap(([parent,children])=>children.map(child=>[parent,child]));
  const scope=table({source:pairs.map(p=>p[0]),target:pairs.map(p=>p[1])});
  const reference=hierarchy('r',id=>kids[id]);cluster().nodeSize([1,1]).separation(()=>1)(reference);
  const byId=new Map(reference.descendants().map(node=>[node.data,node]));
  const leaves=reference.leaves().map(node=>node.data),top=reference.height;
  // d3 puts the root at x = 0; the Tree puts the first leaf there.
  const shift=-reference.leaves()[0].x;
  try{
    for(const [orientation,sibling,spacing] of [['down',1,1],['up',2,.5],['left',1,3],['right',1,1]]){
      const tree=await treeLayout(scope,{source:'source',target:'target',root:'r',mode:'cluster',orientation,siblingSpacing:sibling,depthSpacing:spacing});
      try{
        const id=tree.nodes.get('id'),ids=(await id.codes.ref.js()).map(code=>id.categories[code]);
        const position=await values(tree.nodes,'position'),order=await values(tree.nodes,'order');
        assert.equal(ids.length,byId.size);
        ids.forEach((name,row)=>{
          const node=byId.get(name),across=(node.x+shift)*sibling,along=(top-node.y)*spacing;
          const expected={down:[across,along],up:[across,-along],left:[along,across],right:[-along,across]}[orientation];
          assert.deepEqual(position[row].map(v=>+v.toFixed(5)),expected.map(v=>+v.toFixed(5)),`${orientation} ${name}`);
          assert.equal(order[row],node.children?NaN:leaves.indexOf(name),`${name} order`);
        });
      }finally{tree.dispose();}
    }
    await assert.rejects(treeLayout(scope,{source:'source',target:'target',root:'r',mode:'clusters'}),/^Error: Tree mode must be tidy, tidy-approx, partition, or cluster\.$/);
    for(const option of [{where:true},{enter:{}},{exit:{}},{edgeLength:2}])
      await assert.rejects(treeLayout(scope,{source:'source',target:'target',root:'r',mode:'cluster',...option}),/Tree cluster uses merge heights/);
    const disconnected=await treeLayout(scope,{source:'source',target:'target',root:'r',mode:'cluster',nodes:{id:[...byId.keys(),'solo']},nodeKey:'id'});
    try{assert.equal(disconnected.nodes.length,byId.size);}finally{disconnected.dispose();}
  }finally{scope.dispose();}
});

// The JavaScript linkage recipe, as src/routes/content/reference/tree.svx documents it: merge rows
// [a, b, height] as scipy's linkage returns them, leaves 0..n-1, merge i making node n + i.
function linkageTable(merges, labels) {
  const n = labels.length, edges = { source: [], target: [] };
  const nodes = { id: labels.map((_, i) => i), label: [...labels], height: labels.map(() => 0) };
  merges.forEach(([a, b, height], i) => {
    edges.source.push(n + i, n + i); edges.target.push(a, b);
    nodes.id.push(n + i); nodes.label.push(null); nodes.height.push(height);
  });
  // The leaves left to right, as mode="cluster" places them (its order column).
  const leaves = [], stack = [2 * n - 2];
  while (stack.length) {
    const node = stack.pop();
    if (node < n) leaves.push(node); else stack.push(merges[node - n][1], merges[node - n][0]);
  }
  return { edges, nodes, root: 2 * n - 2, leaves };
}

test('Tree cluster heights draw a scipy linkage as scipy does, and are validated',async()=>{
  // scipy.cluster.hierarchy.linkage(X, "average") of eight points (heights rounded); its
  // dendrogram(Z)["leaves"], and each merge's x from its icoord, in leaf units.
  const Z=[[2,3,.361,2],[0,1,.412,2],[5,6,.64,2],[7,8,.716,3],[4,9,2.957,3],[10,11,5.707,5],[12,13,7.577,8]];
  const scipyLeaves=[4,0,1,5,6,7,2,3],scipyMergeX=[6.5,1.5,3.5,5.75,.75,4.625,2.6875];
  const tables=linkageTable(Z,'abcdefgh'.split('')),scope=table(tables.edges);
  assert.deepEqual(tables.leaves,scipyLeaves);
  const config={source:'source',target:'target',root:tables.root,nodes:tables.nodes,nodeKey:'id',mode:'cluster',height:'height'};
  const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-5,`${message}: ${actual} != ${expected}`);
  try{
    const tree=await treeLayout(scope,config);
    try{
      const position=await values(tree.nodes,'position'),order=await values(tree.nodes,'order');
      scipyLeaves.forEach((leaf,k)=>{assert.equal(order[leaf],k);near(position[leaf][0],k,`leaf ${leaf} x`);near(position[leaf][1],0,`leaf ${leaf} y`);});
      Z.forEach(([,,height],i)=>{assert.ok(Number.isNaN(order[8+i]));near(position[8+i][0],scipyMergeX[i],`merge ${i} x`);near(position[8+i][1],height,`merge ${i} y`);});
      assert.deepEqual((await hostColumn(tree.nodes.get('label'))).slice(0,3),['a','b','c']);
      const start=await values(tree.edges,'start'),end=await values(tree.edges,'end');
      // Edge rows follow the child nodes: leaf a's link comes from merge 1 (node 9).
      assert.deepEqual(start[0],position[9]);assert.deepEqual(end[0],position[0]);
    }finally{tree.dispose();}
    const withHeights=height=>({...config,nodes:{...tables.nodes,height}});
    const heights=tables.nodes.height;
    await assert.rejects(treeLayout(scope,withHeights(heights.map((h,i)=>i===10?NaN:h))),
      /^Error: Tree height must be a finite number for every merge; node 10 has NaN\.$/);
    await assert.rejects(treeLayout(scope,withHeights(heights.map((h,i)=>i===12?0.3:h))),
      /^Error: Tree height must not decrease toward the root: node 12 \(height 0\.3\) is below its child 9 \(height 0\.412\)\. Centroid and median linkage can merge below an earlier merge; use another linkage method\.$/);
    await assert.rejects(treeLayout(scope,withHeights(heights.map((h,i)=>i===3?1:h))),
      /^Error: Tree height: leaf 3 has height 1; leaves sit at 0 in a dendrogram\. Give leaves 0 or leave them missing\.$/);
    const missingLeaves=await treeLayout(scope,withHeights(heights.map((h,i)=>i<8?NaN:h)));
    try{near((await values(missingLeaves.nodes,'position'))[0][1],0,'missing leaf height');}finally{missingLeaves.dispose();}
    await assert.rejects(treeLayout(scope,{...config,mode:'tidy'}),/^Error: Tree height places nodes at their merge heights in mode="cluster" only: set mode="cluster", or remove height\.$/);
    await assert.rejects(treeLayout(scope,{...config,nodes:undefined}),/missing field "height"/);
    await assert.rejects(treeLayout(scope,{...config,siblingSpacing:0}),/^Error: Tree siblingSpacing and depthSpacing must be positive and finite\.$/);
    const suppliedOrder=await treeLayout(scope,{...config,nodes:{...tables.nodes,order:tables.nodes.id}});
    assert.notDeepEqual(await values(suppliedOrder.nodes,'order'),tables.nodes.id);suppliedOrder.dispose();
  }finally{scope.dispose();}
});

test('Pack and Treemap publish hierarchy geometry, retain rows, and use leaf values',async()=>{
  const scope=table({source:['root','root','a'],target:['a','b','a1'],tag:[10,20,30]});
  const nodes={id:['root','a','b','a1'],weight:[999,4,1,3],group:[0,1,2,3]};
  const config={source:'source',target:'target',root:'root',nodes,nodeKey:'id',value:'weight',padding:.01};
  try{
    for(const [kind,run] of [['Pack',packLayout],['Treemap',treemapLayout]]){
      const derived=await run(scope,{source:'source',target:'target',root:'root'});
      try{assert.equal(derived.nodes.length,4);assert.equal(derived.edges.length,3);}
      finally{derived.dispose();}
      const frame=await run(scope,config);
      try{
        assert.equal(frame.nodes.length,4); assert.equal(frame.edges.length,3);
        assert.deepEqual(Array.from(frame.nodes.get('group')),[0,1,2,3]);
        assert.deepEqual(Array.from(frame.edges.get('tag')),[10,20,30]);
        assert.deepEqual(await values(frame.nodes,'depth'),[0,1,1,2]);
        const xs=await values(frame.nodes,'x'),ys=await values(frame.nodes,'y');
        assert.deepEqual(await values(frame.edges,'start'),[[xs[0],ys[0]],[xs[0],ys[0]],[xs[1],ys[1]]]);
        assert.deepEqual(await values(frame.edges,'end'),[[xs[1],ys[1]],[xs[2],ys[2]],[xs[3],ys[3]]]);
        const x0=await values(frame.nodes,'x0'),x1=await values(frame.nodes,'x1');
        assert.ok(x0.every((value,index)=>value<=xs[index]&&xs[index]<=x1[index]));
        if(kind==='Pack'){
          const radius=await values(frame.nodes,'r');
          assert.ok(radius[3]>radius[2]);
          assert.ok(radius[0]>radius[1]);
        }else{
          const y0=await values(frame.nodes,'y0'),y1=await values(frame.nodes,'y1');
          assert.ok((x1[3]-x0[3])*(y1[3]-y0[3])>(x1[2]-x0[2])*(y1[2]-y0[2]));
          assert.ok(x0[1]>=x0[0]&&x1[1]<=x1[0]);
        }
      }finally{frame.dispose();}
    }
  }finally{scope.dispose();}
});

// TODO 67.3: Pack's circles nest: each child inside its parent, siblings apart (or tangent), the
// root filling the unit square; with padding, unequal leaf values and three levels.
test('Pack nests every child inside its parent and keeps siblings apart',async()=>{
  const scope=table({source:['root','root','a','a','a','b','b','b1','b1'],target:['a','b','a1','a2','a3','b1','b2','c1','c2']});
  const nodes={id:['root','a','b','a1','a2','a3','b1','b2','c1','c2'],weight:[0,0,0,1,2,3,0,4,1,5]};
  try{
    for(const padding of [0,0.02]){
      const frame=await packLayout(scope,{source:'source',target:'target',root:'root',nodes,nodeKey:'id',value:'weight',padding});
      try{
        const [x,y,r]=await Promise.all(['x','y','r'].map(field=>values(frame.nodes,field)));
        const parent={a:'root',b:'root',a1:'a',a2:'a',a3:'a',b1:'b',b2:'b',c1:'b1',c2:'b1'},at=Object.fromEntries(nodes.id.map((id,i)=>[id,i]));
        assert.ok(Math.abs(r[0]-0.5)<1e-6&&Math.abs(x[0]-0.5)<1e-6&&Math.abs(y[0]-0.5)<1e-6);
        for(const [child,up] of Object.entries(parent)){
          const i=at[child],j=at[up];
          // Padding leaves a gap (in the layout's units, before it is scaled to the square).
          const slack=r[j]-Math.hypot(x[i]-x[j],y[i]-y[j])-r[i];
          assert.ok(padding?slack>padding/2:slack>=-1e-6,`${child} inside ${up}`);
        }
        for(const [i,a] of nodes.id.entries())for(const [j,b] of nodes.id.entries())
          if(i<j&&parent[a]&&parent[a]===parent[b])assert.ok(Math.hypot(x[i]-x[j],y[i]-y[j])>=r[i]+r[j]+padding/2-1e-6,`${a} and ${b} apart`);
      }finally{frame.dispose();}
    }
  }finally{scope.dispose();}
});

test('Pack and Treemap reject non-hierarchies and invalid layout values',async()=>{
  const scope=table({source:['root','root'],target:['a','b']});
  try{
    const config={source:'source',target:'target',root:'root'};
    await assert.rejects(packLayout(scope,{...config,nodes:{id:['root','a','b','solo']},nodeKey:'id'}),/connected hierarchy/);
    await assert.rejects(treemapLayout(scope,{...config,value:-1}),/nonnegative/);
    await assert.rejects(treemapLayout(scope,{...config,tile:'invalid'}),/tile must be/);
    const multi=table({source:['root','root','a'],target:['a','b','b']});
    try{await assert.rejects(packLayout(multi,config),/one parent/);}finally{multi.dispose();}
    const cycle=table({source:['root','a'],target:['a','root']});
    try{await assert.rejects(treemapLayout(cycle,config),/acyclic hierarchy/);}finally{cycle.dispose();}
  }finally{scope.dispose();}
});

// TODO 145.3: root may be any node (a drill-down): the layout divides its subtree, depth counts
// from it, total is each node's summed value, levels keeps that many levels below it (root left
// out), and the other nodes stay rows of the table, hidden.
test('Treemap and Pack drill into a subtree with levels, relative depth and totals',async()=>{
  const scope=table({source:['root','root','a','a','b'],target:['a','b','a1','a2','b1']});
  const nodes={id:['root','a','b','a1','a2','b1'],w:[0,0,0,1,3,4]};
  const config={source:'source',target:'target',nodes,nodeKey:'id',value:'w'};
  try{
    for(const layout of [treemapLayout,packLayout]){
      const frame=await layout(scope,{...config,root:'a'});
      try{
        assert.equal(frame.nodes.length,3);
        assert.deepEqual(await values(frame.nodes,'depth'),[0,1,1]);
        assert.deepEqual(await values(frame.nodes,'total'),[4,1,3]);
        assert.equal(frame.edges.length,2);
      }finally{frame.dispose();}
      const level=await layout(scope,{...config,root:'root',levels:1});
      try{
        assert.equal(level.nodes.length,2);
        assert.deepEqual(await values(level.nodes,'total'),[4,4]);
        assert.equal(level.edges.length,0);
      }finally{level.dispose();}
    }
    const level=await treemapLayout(scope,{...config,root:'root',levels:1});
    try{
      const [x0,x1,y0,y1]=await Promise.all(['x0','x1','y0','y1'].map(key=>values(level.nodes,key)));
      assert.ok(Math.abs(x0.reduce((sum,_,i)=>sum+(x1[i]-x0[i])*(y1[i]-y0[i]),0)-1)<1e-6);
    }finally{level.dispose();}
    await assert.rejects(treemapLayout(scope,{...config,root:'a',levels:0}),/levels must be a whole number/);
    await assert.rejects(treemapLayout(scope,{...config,root:'zz'}),/root is not present/);
    await assert.rejects(treemapLayout(scope,{...config,nodes:{...nodes,total:[1,1,1,1,1,1]},root:'root'}),/rename the node table's column total/);
  }finally{scope.dispose();}
});

test('DAG publishes ordered routes and rejects cycles',async()=>{
  const scope=table({source:['a','a','b'],target:['b','c','c']});
  const frame=await dagLayout(scope,{source:'source',target:'target',nodes:{id:['a','b','c','solo']},nodeKey:'id'});
  try{assert.equal(frame.nodes.length,4);assert.equal(frame.edges.length,3);
    assert.equal(frame.edges.get('routePoints').length,3);
    assert.ok(frame.edges.get('routePoints').some(route=>route.length>2));}
  finally{frame.dispose();scope.dispose();}
  const cyclic=table({source:['a','b'],target:['b','a']});
  try{await assert.rejects(dagLayout(cyclic,{source:'source',target:'target'}),/acyclic/);}finally{cyclic.dispose();}
});

test('Sankey links keep value-sized attachment intervals and reject invalid input',async()=>{
  const scope=table({source:['a','a'],target:['b','c'],value:[2,3]});
  const frame=await sankeyLayout(scope,{source:'source',target:'target',value:'value'});
  try{assert.equal(frame.edges.length,2);
    const lower=await values(frame.edges,'startLower'),upper=await values(frame.edges,'startUpper');
    assert.ok(upper[1][1]-lower[1][1]>upper[0][1]-lower[0][1]);
    assert.deepEqual(await values(frame.nodes,'throughput'),[5,2,3]);}
  finally{frame.dispose();scope.dispose();}
  const bad=table({source:['a'],target:['a'],value:[-1]});
  try{await assert.rejects(sankeyLayout(bad,{source:'source',target:'target',value:'value'}),/nonnegative/);}finally{bad.dispose();}
  const crowded=table({source:['a','a'],target:['b','c'],value:[1,1]});
  try{await assert.rejects(sankeyLayout(crowded,{source:'source',target:'target',value:'value',nodePadding:2}),/nodePadding leaves no room for the nodes of its fullest layer: lower nodePadding/);}
  finally{crowded.dispose();}
});

test('Force includes isolated nodes supplied by a node table',async()=>{
  const scope=table({source:['a'],target:['b']});
  const topology=await forceTopology(scope,{source:'source',target:'target',nodes:{id:['a','b','solo'],group:[0,1,2]},nodeKey:'id'});
  try{assert.equal(topology.n,3);assert.equal(topology.nodeFields.group.length,3);}
  finally{topology.dispose();scope.dispose();}
});


test('layout hierarchy inference handles deep trees and diagnoses invalid graphs', () => {
  const n = 100_000;
  const graph = { ids: Array.from({length:n}, (_,i)=>i),
    from: Array.from({length:n-1}, (_,i)=>i), to: Array.from({length:n-1}, (_,i)=>i+1) };
  const result = graphHierarchy(graph);
  assert.equal(result.root, 0);
  assert.equal(result.depth[n-1], n-1);
  assert.equal(result.parent[n-1], n-2);
  assert.deepEqual(result.children[0], [1]);
  assert.deepEqual([result.degree[0],result.degree[1],result.degree[n-1]], [1,2,1]);
  assert.throws(()=>graphHierarchy({ids:[0,1],from:[0,1],to:[1,0]}, {owner:'demo.tree'}), /demo.tree requires an acyclic hierarchy/);
  assert.throws(()=>graphHierarchy({ids:[0,1],from:[],to:[]}), /connected hierarchy/);
  assert.throws(()=>graphHierarchy({ids:[0,1,2],from:[0,1],to:[2,2]}), /one parent/);
  assert.throws(()=>graphHierarchy(graph,{signal:AbortSignal.abort()}), {name:'AbortError'});
});
