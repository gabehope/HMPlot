import { chromium } from 'playwright-core';
import { installGpuCounters, installGpuErrors } from '../../browser/gpu-counters.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const out=process.env.BENCH_OUT ?? join(tmpdir(),'hmplot-stages100-105','results');
const base=process.env.BENCH_URL ?? 'http://127.0.0.1:5483';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
const context=await browser.newContext({viewport:{width:1300,height:1100},deviceScaleFactor:2});const all=[];
for(const rows of [50000,1000000]){
 const page=await context.newPage();await page.addInitScript(installGpuCounters);await page.addInitScript(installGpuErrors);
 await page.goto(`${base}/test/investigation-scales?rows=${rows}&marks=1`);
 await page.waitForFunction(()=>window.investigation?.marks()[0]?.getMark?.(),null,{timeout:120000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.canvas')].every(c=>c.getAttribute('aria-busy')==='false'),null,{timeout:120000});await page.evaluate(()=>window.investigation.settle());
 await page.evaluate(async rows=>{
  const mark=window.investigation.marks()[0].getMark(),renderer=mark.renderer,device=renderer.backend.device;
  mark.ensureInteractionOpacity();await mark.fields.get('interactionOpacity').update(new Float32Array(rows).fill(1));await mark.manager.chain;mark.setInteractionTranslucent(true);mark.refreshBlend();mark.invalidate();await window.investigation.settle();
  const make=(size,usage)=>device.createBuffer({size:Math.max(16,size),usage});
  const source=make(rows*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(source,0,Uint32Array.from({length:rows},(_,i)=>i%997));
  const params=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),summary=make(16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC),staging=make(16,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const classifyShader=device.createShaderModule({code:`
   @group(0) @binding(0) var<uniform> p:vec4<u32>;
   @group(0) @binding(1) var<storage,read> source:array<u32>;
   @group(0) @binding(2) var<storage,read_write> opacity:array<f32>;
   @group(0) @binding(3) var<storage,read_write> summary:array<atomic<u32>>;
   @compute @workgroup_size(128) fn main(@builtin(global_invocation_id) q:vec3<u32>){if(q.x>=p.x){return;}
    let shown=p.z==0u&&source[q.x]<=p.y;opacity[q.x]=select(0.0,1.0,shown);if(shown){atomicAdd(&summary[0],1);}}
  `});
  const packShader=device.createShaderModule({code:`
   @group(0) @binding(0) var<uniform> p:vec4<u32>;
   @group(0) @binding(1) var<storage,read> source:array<u32>;
   @group(0) @binding(2) var<storage,read> opacity:array<f32>;
   @group(0) @binding(3) var<storage,read_write> summary:array<atomic<u32>>;
   @group(0) @binding(4) var<storage,read_write> payload:array<vec4<f32>>;
   @compute @workgroup_size(128) fn pack(@builtin(global_invocation_id) q:vec3<u32>){if(q.x>=p.x){return;}
    let shown=opacity[q.x]>0.0;var at=q.x;
    if(p.w>0u){if(!shown){return;}at=atomicAdd(&summary[2],1);}
    payload[at]=vec4<f32>(f32(source[q.x]),f32(q.x),0.0,select(0.0,1.0,shown));
   }
   @compute @workgroup_size(128) fn consume(@builtin(global_invocation_id) q:vec3<u32>){
    let count=select(p.x,atomicLoad(&summary[0]),p.w>0u);if(q.x>=count){return;}
    if(payload[q.x].w>0.0){atomicAdd(&summary[1],u32(payload[q.x].x));}
   }
  `});
  const classify=device.createComputePipeline({layout:'auto',compute:{module:classifyShader,entryPoint:'main'}});
  const pack=device.createComputePipeline({layout:'auto',compute:{module:packShader,entryPoint:'pack'}}),consume=device.createComputePipeline({layout:'auto',compute:{module:packShader,entryPoint:'consume'}});
  const opaque=renderer.backend.get(mark.fields.get('interactionOpacity').buffer).buffer;
  const classifyBind=device.createBindGroup({layout:classify.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:params}},{binding:1,resource:{buffer:source}},{binding:2,resource:{buffer:opaque}},{binding:3,resource:{buffer:summary}}]});
  let payload=null,capacity=0,policy=null;
  const read=async()=>{const e=device.createCommandEncoder();e.copyBufferToBuffer(summary,0,staging,0,16);device.queue.submit([e.finish()]);await staging.mapAsync(GPUMapMode.READ);const words=new Uint32Array(staging.getMappedRange()).slice();staging.unmap();return Array.from(words);};
  const dispatch=(encoder,pipeline,bindings,count)=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.dispatchWorkgroups(Math.max(1,Math.ceil(count/128)));pass.end();};
  const run=async(mode,threshold)=>{
   const first=window.investigation.plot().getDiagnostics().completedFrame,start=performance.now(),before=window.__gpuCounters.snapshot();
   device.queue.writeBuffer(params,0,new Uint32Array([rows,threshold>>>0,threshold<0?1:0,mode==='compact'?1:0]));device.queue.writeBuffer(summary,0,new Uint32Array(4));
   const classifyEncoder=device.createCommandEncoder();dispatch(classifyEncoder,classify,classifyBind,rows);device.queue.submit([classifyEncoder.finish()]);
   let count=rows;if(mode==='compact')count=(await read())[0];
   const needed=mode==='compact'?count:rows;
   if(policy!==mode||capacity!==needed){await device.queue.onSubmittedWorkDone();payload?.destroy();payload=make(needed*16,GPUBufferUsage.STORAGE);capacity=needed;policy=mode;}
   const common=[{binding:0,resource:{buffer:params}},{binding:3,resource:{buffer:summary}},{binding:4,resource:{buffer:payload}}];
   const packBind=device.createBindGroup({layout:pack.getBindGroupLayout(0),entries:[...common,{binding:1,resource:{buffer:source}},{binding:2,resource:{buffer:opaque}}]});
   const consumeBind=device.createBindGroup({layout:consume.getBindGroupLayout(0),entries:common});
   const encoder=device.createCommandEncoder();dispatch(encoder,pack,packBind,rows);dispatch(encoder,consume,consumeBind,needed);device.queue.submit([encoder.finish()]);mark.invalidate();
   while(window.investigation.plot().getDiagnostics().completedFrame===first)await new Promise(requestAnimationFrame);
   await device.queue.onSubmittedWorkDone();
   const visibleMs=performance.now()-start,accepted=window.__gpuCounters.snapshot(),value=await read();
   if(window.__gpuErrors.length)throw Error(window.__gpuErrors.slice(0,3).join('\n'));
   return {mode,threshold,rows,visibleMs,count:value[0],sum:value[1],capacity,payloadBytes:Math.max(16,capacity*16),criticalReads:accepted.readbacks-before.readbacks,
    allocations:accepted.buffers-before.buffers,liveBytes:accepted.liveBytes};
  };
  window.capacityPrototype={run,dispose(){payload?.destroy();for(const buffer of [source,params,summary,staging])buffer.destroy();}};
 },rows);
 const samples=[];for(const mode of ['source','compact']){
  for(const t of [100,-1,996,30])await page.evaluate(({mode,t})=>window.capacityPrototype.run(mode,t),{mode,t});
  for(let repetition=1;repetition<=3;repetition++){
   const results=[];for(const threshold of [100,400,-1,996,30,800]){
    const value=await page.evaluate(({mode,threshold})=>window.capacityPrototype.run(mode,threshold),{mode,threshold});let count=0,sum=0;for(let i=0;i<rows;i++)if(i%997<=threshold){count++;sum+=i%997;}
    if(value.count!==count||value.sum!==sum)throw Error('Capacity branch parity mismatch');results.push(value);
   }
   const sorted=results.map(r=>r.visibleMs).sort((a,b)=>a-b),record={rows,mode,repetition,p50:sorted[3],p95:sorted[5],results};samples.push(record);console.log(JSON.stringify(record));
  }
  await page.evaluate(async()=>{await window.investigation.settle();await window.investigation.marks()[0].getMark().renderer.backend.device.queue.onSubmittedWorkDone();await new Promise(requestAnimationFrame);});
 await page.screenshot({path:`${out}/capacity-${rows}-${mode}.png`});
 }
 all.push({rows,samples});await page.evaluate(()=>window.capacityPrototype.dispose());await page.close();
}
await writeFile(`${out}/capacity-prototype.json`,JSON.stringify(all,null,2));await browser.close();
