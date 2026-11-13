import { chromium } from 'playwright-core';
import { installGpuCounters, installGpuErrors } from '../../browser/gpu-counters.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const out=process.env.BENCH_OUT ?? join(tmpdir(),'hmplot-stages100-105','results');
const base=process.env.BENCH_URL ?? 'http://127.0.0.1:5483';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
const context=await browser.newContext({viewport:{width:1300,height:1100},deviceScaleFactor:2});
const all=[];
for(const rows of [50000,1000000]){
 const page=await context.newPage();await page.addInitScript(installGpuCounters);await page.addInitScript(installGpuErrors);
 await page.goto(`${base}/test/investigation-scales?rows=${rows}&marks=1`);
 await page.waitForFunction(()=>window.investigation?.marks()[0]?.getMark?.(),null,{timeout:120000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.canvas')].every(c=>c.getAttribute('aria-busy')==='false'),null,{timeout:120000});
 await page.evaluate(()=>window.investigation.settle());
 await page.evaluate(async rows=>{
  const mark=window.investigation.marks()[0].getMark(),renderer=mark.renderer,device=renderer.backend.device;
  mark.ensureInteractionOpacity();await mark.fields.get('interactionOpacity').update(new Float32Array(rows).fill(1));await mark.manager.chain;
  mark.setInteractionTranslucent(true);mark.refreshBlend();mark.invalidate();await window.investigation.settle();
  const make=(size,usage)=>device.createBuffer({size,usage});
  const values=Uint32Array.from({length:rows},(_,i)=>i%997),source=make(values.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
  device.queue.writeBuffer(source,0,values);
  const parameters=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
  const slots=Array.from({length:3},()=>({output:make(16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),
    staging:make(16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),busy:false,done:Promise.resolve()}));
  const shader=device.createShaderModule({code:`
   @group(0) @binding(0) var<uniform> p:vec4<u32>;
   @group(0) @binding(1) var<storage,read> values:array<u32>;
   @group(0) @binding(2) var<storage,read_write> opacity:array<f32>;
   @group(0) @binding(3) var<storage,read_write> summary:array<atomic<u32>>;
   @compute @workgroup_size(128) fn mask(@builtin(global_invocation_id) index:vec3<u32>){
    if(index.x>=p.x){return;}let shown=p.z==0u&&values[index.x]<=p.y;opacity[index.x]=select(0.0,1.0,shown);
    if(shown){atomicAdd(&summary[0],1);atomicAdd(&summary[1],values[index.x]);}
   }
   @compute @workgroup_size(1) fn aggregate(){
    let count=atomicLoad(&summary[0]);let sum=atomicLoad(&summary[1]);
    atomicStore(&summary[2],bitcast<u32>(select(0.0,f32(sum)/f32(max(count,1)),count>0)));
   }`});
  const mask=device.createComputePipeline({layout:'auto',compute:{module:shader,entryPoint:'mask'}});
  const aggregate=device.createComputePipeline({layout:'auto',compute:{module:shader,entryPoint:'aggregate'}});
  const bind=slot=>device.createBindGroup({layout:mask.getBindGroupLayout(0),entries:[
    {binding:0,resource:{buffer:parameters}},{binding:1,resource:{buffer:source}},
    {binding:2,resource:{buffer:renderer.backend.get(mark.fields.get('interactionOpacity').buffer).buffer}},
    {binding:3,resource:{buffer:slot.output}}]});
  const bindings=slots.map(bind);
  const aggregateBindings=slots.map(slot=>device.createBindGroup({layout:aggregate.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:slot.output}}]}));
  let revision=0,latest=0,latestCPU=null,downloadCount=0;const pending=[];
  const execute=async(mode,threshold)=>{
   const first=window.investigation.plot().getDiagnostics().completedFrame,start=performance.now();
   const id=++revision;latest=id;const slot=slots[(id-1)%slots.length],previous=slot.done;let release;slot.done=new Promise(done=>{release=done;});await previous;slot.busy=true;device.queue.writeBuffer(parameters,0,new Uint32Array([rows,threshold>>>0,threshold<0?1:0,0]));device.queue.writeBuffer(slot.output,0,new Uint32Array(4));
   const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();pass.setPipeline(mask);pass.setBindGroup(0,bindings[slots.indexOf(slot)]);pass.dispatchWorkgroups(Math.ceil(rows/128));pass.end();
   const downstream=encoder.beginComputePass();downstream.setPipeline(aggregate);downstream.setBindGroup(0,aggregateBindings[slots.indexOf(slot)]);downstream.dispatchWorkgroups(1);downstream.end();device.queue.submit([encoder.finish()]);
   let cpuWork=null;const view={capacity:rows,revision:id,gpuCount:slot.output,exactCount(){
    if(!cpuWork){downloadCount++;const copy=device.createCommandEncoder();copy.copyBufferToBuffer(slot.output,0,slot.staging,0,16);device.queue.submit([copy.finish()]);
     cpuWork=slot.staging.mapAsync(GPUMapMode.READ).then(()=>{const words=new Uint32Array(slot.staging.getMappedRange()).slice();slot.staging.unmap();
      const mean=new Float32Array(words.buffer)[2];const result={revision:id,count:words[0],sum:words[1],mean};
      if(id===latest)latestCPU=result;return result;});}
    return cpuWork;}};
   if(mode==='cpu-count'){const a=view.exactCount(),b=view.exactCount();if(a!==b)throw Error('Unshared CPU count');await a;}
   mark.invalidate();
   if(mode==='lazy-background')pending.push(view.exactCount());
   while(window.investigation.plot().getDiagnostics().completedFrame===first)await new Promise(requestAnimationFrame);
   await device.queue.onSubmittedWorkDone();
   const visibleMs=performance.now()-start;
   if(mode==='lazy-on-demand')pending.push(view.exactCount());
   const result=cpuWork?await cpuWork:null;
   await (cpuWork??device.queue.onSubmittedWorkDone());slot.busy=false;release();
   if(window.__gpuErrors.length)throw Error(window.__gpuErrors.slice(0,3).join('\n'));
   return {visibleMs,result,capacity:rows,revision:id};
  };
  window.countPrototype={execute,flush:()=>Promise.all(pending),status:()=>({latest,latestCPU,downloadCount}),
    dispose:()=>{parameters.destroy();source.destroy();for(const slot of slots){slot.output.destroy();slot.staging.destroy();}}};
 },rows);
 const parity=[];
 for(const threshold of [-1,0,30,100,400,800,996]){
  const item=await page.evaluate(threshold=>window.countPrototype.execute('lazy-on-demand',threshold),threshold);
  let count=0,sum=0;for(let i=0;i<rows;i++)if(i%997<=threshold){count++;sum+=i%997;}
  if(item.result.count!==count||item.result.sum!==sum||Math.abs(item.result.mean-(count?sum/count:0))>0.0001)throw Error('Count/reduction parity failed');
  parity.push({threshold,count,sum,mean:item.result.mean});
 }
 const coalesced=await page.evaluate(async()=>{
  const work=[100,400,30,996,-1,800].map(t=>window.countPrototype.execute('lazy-background',t));
  const results=await Promise.all(work);await window.countPrototype.flush();const state=window.countPrototype.status();
  if(state.latestCPU.revision!==state.latest||state.latestCPU.count!==results.at(-1).result.count)throw Error('Stale CPU notification published');
  return {results:results.map(r=>r.result),state};
 });
 const samples=[];
 for(const mode of ['cpu-count','gpu-only','lazy-background']){
  await page.evaluate(async mode=>{for(const t of [100,996,0,800])await window.countPrototype.execute(mode,t);await window.countPrototype.flush();},mode);
  for(let repetition=1;repetition<=3;repetition++){
   const result=await page.evaluate(async({mode,repetition,rows})=>{
    const before=window.__gpuCounters.snapshot(),start=performance.now(),latencies=[],counts=[];
    for(let i=0;i<24;i++){const item=await window.countPrototype.execute(mode,[100,400,-1,996,30,800][i%6]);latencies.push(item.visibleMs);if(item.result)counts.push(item.result.count);}
    await window.countPrototype.flush();const after=window.__gpuCounters.snapshot();const sorted=[...latencies].sort((a,b)=>a-b);
    return {rows,mode,repetition,wallMs:performance.now()-start,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],
      readbacks:after.readbacks-before.readbacks,buffers:after.buffers-before.buffers,liveBytes:after.liveBytes,shaders:after.shaders-before.shaders,
      compute:after.compute-before.compute,render:after.render-before.render,counts,errors:window.__gpuErrors};
   },{mode,repetition,rows});samples.push(result);console.log(JSON.stringify(result));
  }
  await page.evaluate(async()=>{await window.investigation.settle();await window.investigation.marks()[0].getMark().renderer.backend.device.queue.onSubmittedWorkDone();await new Promise(requestAnimationFrame);});
 await page.screenshot({path:`${out}/count-${rows}-${mode}.png`});
 }
 all.push({rows,parity,coalesced,samples});await page.evaluate(()=>window.countPrototype.dispose());await page.close();
}
await writeFile(`${out}/count-prototype.json`,JSON.stringify(all,null,2));await browser.close();
