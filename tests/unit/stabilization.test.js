import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeForceState} from '../../src/lib/plot/utils/force.js';
import {enableDiagnostics,observeDevice} from '../../src/lib/plot/utils/diagnostics.js';
import {observeShaderBuilds} from '../../src/lib/plot/utils/shaderBuilds.js';
import {createViewServices} from '../../src/lib/plot/utils/viewServices.ts';
test('persistent force arrays are realized before readiness without readbacks',async()=>{
 const order=[];const value={device:'webgpu',get ref(){return{gpuBuffer:async()=>order.push('realize')};},blockUntilReady:async()=>order.push('ready')};
 assert.equal(await materializeForceState(value),value);assert.deepEqual(order,['realize','ready']);
});
test('GPU diagnostics count allocations once and restore shared hooks',()=>{
 const noop=()=>{},device={queue:{writeBuffer:noop,submit:noop},createBuffer:()=>({destroy:noop}),createTexture:()=>({destroy:noop}),createShaderModule:noop,createRenderPipeline:noop,createRenderPipelineAsync:noop,createComputePipeline:noop,createComputePipelineAsync:noop,addEventListener:noop,removeEventListener:noop,lost:new Promise(()=>{})};
 const original=device.createBuffer,a=observeDevice(device),b=observeDevice(device);assert.equal(a,b);
 const buffer=device.createBuffer({size:128});assert.equal(a.counters.bufferBytes,128);buffer.destroy();buffer.destroy();assert.equal(a.counters.bufferBytes,0);a.release();assert.notEqual(device.createBuffer,original);b.release();assert.equal(device.createBuffer,original);
});

test('renderer diagnostics release once and preserve a replacement owner',()=>{
 const noop=()=>{},device={queue:{writeBuffer:noop,submit:noop},createBuffer:()=>({destroy:noop}),createTexture:()=>({destroy:noop}),createShaderModule:noop,createRenderPipeline:noop,createRenderPipelineAsync:noop,createComputePipeline:noop,createComputePipelineAsync:noop,addEventListener:noop,removeEventListener:noop,lost:new Promise(()=>{})};
 const original=device.createBuffer,renderer={backend:{device}},other={backend:{device}};
 const view=createViewServices().diagnostics,otherView=createViewServices().diagnostics;
 const first=enableDiagnostics(renderer,view),second=enableDiagnostics(other,otherView);
 assert.equal(enableDiagnostics(renderer,view),first);
 first.sample('frame',2);first.sample('frame',4);
 assert.deepEqual(first.snapshot().timing.frame,{count:2,p50:4,p95:4,max:4});
 // Another owner's instrumentation replaces it: the first's release must leave that in place.
 view.instrumentation.install(second);
 first.dispose();first.dispose();
 assert.equal(view.instrumentation.current,second);
 assert.notEqual(device.createBuffer,original);
 second.dispose();
 assert.equal(device.createBuffer,original);
 assert.equal(otherView.instrumentation.current,undefined);
 // A view's replacement renderer gets its own instrumentation; the old one's release leaves it.
 const fresh=createViewServices().diagnostics,a=enableDiagnostics(renderer,fresh),b=enableDiagnostics(other,fresh);
 assert.notEqual(a,b);assert.equal(fresh.instrumentation.current,b);
 a.dispose();assert.equal(fresh.instrumentation.current,b);
 b.dispose();assert.equal(fresh.instrumentation.current,undefined);assert.equal(device.createBuffer,original);
});

test('shader diagnostics attribute actual builds, bound events and restore the backend',()=>{
 const source={id:12,version:3},material={id:18,version:1};
 const object={uuid:'row',constructor:{componentName:'Rect'},options:{get:()=> 'sectors'}};
 const original=(target=object)=>({object:target,material:target===object?material:undefined,build(){return 'built';}});
 const renderer={info:{frame:42},backend:{createNodeBuilder:original}};
 const observed=observeShaderBuilds(renderer);
 observed.picking(object,source,material,7,'first use');
 const builder=renderer.backend.createNodeBuilder(object);
 assert.equal(builder.build(),'built');assert.equal(builder.build(),'built');
 const snapshot=observed.snapshot();
 assert.deepEqual([snapshot.builds,snapshot.firstBuilds,snapshot.rebuilds],[2,1,1]);
 const event=snapshot.events.at(-1);
 assert.equal(event.mark,'Rect');assert.equal(event.label,'sectors');assert.equal(event.pass,'picking');
 assert.equal(event.reason,'first use');assert.equal(event.sourceVersion,3);assert.equal(event.frame,42);
 assert.ok(event.milliseconds>=0);
 const compute={type:'ComputeNode'};
 const computeBuilder=renderer.backend.createNodeBuilder(compute);
 assert.equal(computeBuilder.build(),'built');assert.equal(computeBuilder.build(),'built');
 assert.deepEqual([observed.snapshot().builds,observed.snapshot().rebuilds],[4,2]);
 assert.equal(observed.snapshot().events.at(-1).mark,'ComputeNode');
 for(let i=0;i<300;i++)observed.picking(object,source,material,7,'source material version changed');
 assert.equal(observed.snapshot().events.length,256);
 observed.dispose();assert.equal(renderer.backend.createNodeBuilder,original);
 builder.build();assert.equal(observed.snapshot().builds,4);
});
