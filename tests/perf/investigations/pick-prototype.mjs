import { chromium } from 'playwright-core';
import { installGpuCounters, installGpuErrors } from '../../browser/gpu-counters.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const out=process.env.BENCH_OUT ?? join(tmpdir(),'hmplot-stages100-105','results');
const base=process.env.BENCH_URL ?? 'http://127.0.0.1:5483';
await mkdir(out,{recursive:true});
import { pixelReader } from '../../browser/png.js';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
const context=await browser.newContext({viewport:{width:1300,height:1100},deviceScaleFactor:2});
const page=await context.newPage();await page.addInitScript(installGpuErrors);await page.addInitScript(installGpuCounters);
await page.goto(base+'/test/investigation-scales?nearest=1&rows=50000&marks=1');
await page.waitForFunction(()=>window.investigation?.marks()[0]?.getMark?.());
await page.waitForFunction(()=>[...document.querySelectorAll('.canvas')].every(c=>c.getAttribute('aria-busy')==='false'));
await page.evaluate(()=>window.investigation.settle());
await page.evaluate(async()=>{
 const mark=window.investigation.marks()[0].getMark(),renderer=mark.renderer,device=renderer.backend.device,context=mark.view.picking.context.current,pass=context.scenePass;
 const {readPixel,readPixels}=await import('/src/lib/picking/readPixel.js');
 const {nearestHit,pickWindow}=await import('/src/lib/picking/tolerantPick.js');
 mark.ensureInteractionOpacity();await mark.fields.get('interactionOpacity').update(new Float32Array(50000).fill(1));await mark.manager.chain;
 mark.setInteractionTranslucent(true);mark.refreshBlend();mark.invalidate();await window.investigation.settle();
 context.requestPick();await window.investigation.settle();context.enabled.current=false;
 const markId=[...context.objectIdMap].find(([,object])=>object===mark)[0],width=pass.renderTarget.width,height=pass.renderTarget.height;
 const make=(size,usage)=>device.createBuffer({size,usage});
 const parameters=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
 const hit=make(32,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
 const info=new Float32Array((Math.max(...context.objectIdMap.keys())+1)*2);
 for(const [id,object] of context.objectIdMap){const binding=object.view?.marks.of(object);info[id*2]=binding?.pickArea?3:binding?.nearest?2:1;info[id*2+1]=(binding?.nearest?.radius??16)*2;}
 const objectInfo=make(info.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(objectInfo,0,info);
 const queryShader=device.createShaderModule({code:`
 @group(0) @binding(0) var picks:texture_2d<f32>;
 @group(0) @binding(1) var world:texture_2d<f32>;
 @group(0) @binding(2) var<uniform> p:array<vec4<i32>,2>;
 @group(0) @binding(3) var<storage,read_write> hit:array<i32>;
 @group(0) @binding(4) var<storage,read> info:array<vec2<f32>>;
 @compute @workgroup_size(1) fn main(){
  let center=p[0].xy;let size=p[0].zw;let radius=p[1].x;
  let own=textureLoad(picks,center,0);let id=i32(round(own.x));
  let kind=select(0,i32(info[u32(max(0,id))].x),id>0);
  var nearest=center;var best=radius*radius;var found=false;
  if(kind!=1&&kind!=2){
   for(var y=max(0,center.y-radius);y<min(size.y,center.y+radius+1);y++){
    for(var x=max(0,center.x-radius);x<min(size.x,center.x+radius+1);x++){
     let d=(x-center.x)*(x-center.x)+(y-center.y)*(y-center.y);
     if(d>best||(found&&d==best)){continue;}
     let row=textureLoad(picks,vec2<i32>(x,y),0);let object=i32(round(row.x));
     if(object>0&&i32(info[u32(object)].x)==2&&f32(d)<=info[u32(object)].y*info[u32(object)].y){found=true;best=d;nearest=vec2<i32>(x,y);}
    }
   }
  }
  let near=textureLoad(picks,nearest,0);let wp=textureLoad(world,nearest,0);
  hit[0]=select(0,id,textureLoad(world,center,0).w>0.0);hit[1]=i32(round(own.y));hit[2]=center.x;hit[3]=center.y;
  hit[4]=select(0,i32(round(near.x)),wp.w>0.0);hit[5]=i32(round(near.y));hit[6]=nearest.x;hit[7]=nearest.y;
 }`});
 const queryLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'unfilterable-float'}},
  {binding:1,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'unfilterable-float'}},
  {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
  {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
  {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}}]});
 const query=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[queryLayout]}),compute:{module:queryShader,entryPoint:'main'}});
 const queryBind=device.createBindGroup({layout:queryLayout,entries:[
  {binding:0,resource:renderer.backend.get(pass.getTexture('output')).texture.createView()},
  {binding:1,resource:renderer.backend.get(pass.getTexture('world')).texture.createView()},
  {binding:2,resource:{buffer:parameters}},{binding:3,resource:{buffer:hit}},{binding:4,resource:{buffer:objectInfo}}]});
 const feedbackShader=device.createShaderModule({code:`
 @group(0) @binding(0) var<uniform> p:array<vec4<i32>,2>;
 @group(0) @binding(1) var<storage,read> hit:array<i32>;
 @group(0) @binding(2) var<storage,read_write> opacity:array<f32>;
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) index:vec3<u32>){
  if(index.x>=u32(p[1].z)){return;}
  let selected=hit[4]==p[1].y&&hit[5]>=0;
  opacity[index.x]=select(1.0,select(0.25,1.0,i32(index.x)==hit[5]),selected);
 }`});
 const feedback=device.createComputePipeline({layout:'auto',compute:{module:feedbackShader,entryPoint:'main'}});
 const feedbackBind=device.createBindGroup({layout:feedback.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:parameters}},{binding:1,resource:{buffer:hit}},{binding:2,resource:{buffer:renderer.backend.get(mark.fields.get('interactionOpacity').buffer).buffer}}]});
 const readPool=Array.from({length:2},()=>make(32,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ));let index=0,pendingNotifications=[],notify=[];
 const download=async()=>{const staging=readPool[index++%2];if(staging.mapState!=='unmapped')return null;const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(hit,0,staging,0,32);device.queue.submit([encoder.finish()]);await staging.mapAsync(GPUMapMode.READ);const result=new Int32Array(staging.getMappedRange()).slice();staging.unmap();return Array.from(result);};
 const run=async(mode,x,y,radius=32,notification=false)=>{
  device.queue.writeBuffer(parameters,0,new Int32Array([x,y,width,height,radius,markId,50000,0]));
  const start=performance.now(),first=window.investigation.plot().getDiagnostics().completedFrame;
  let expected;
  if(mode==='cpu'){
   const area=pickWindow(x,y,radius,width,height);
   const [pixels,world]=await Promise.all([readPixels(renderer,pass.getTexture('output'),area.left,area.top,area.width,area.height),readPixel(renderer,pass.getTexture('world'),x,y)]);
   const kind=id=>info[id*2]===3?'area':info[id*2]===2?'nearest':info[id*2]===1?'row':null;
   const nearest=nearestHit(pixels,area.width,area.height,area.center,radius,kind,id=>info[id*2+1]);
   const own=(area.center[1]*area.width+area.center[0])*4,at=(nearest.y*area.width+nearest.x)*4;
   const px=area.left+nearest.x,py=area.top+nearest.y;
   const nearWorld=px===x&&py===y?world:await readPixel(renderer,pass.getTexture('world'),px,py);
   expected=[world[3]?Math.round(pixels[own]):0,Math.round(pixels[own+1]),x,y,nearWorld[3]?Math.round(pixels[at]):0,Math.round(pixels[at+1]),px,py];
   device.queue.writeBuffer(hit,0,new Int32Array(expected));
  }
  const encoder=device.createCommandEncoder();
  if(mode!=='cpu'){const pass=encoder.beginComputePass();pass.setPipeline(query);pass.setBindGroup(0,queryBind);pass.dispatchWorkgroups(1);pass.end();}
  const feedbackPass=encoder.beginComputePass();feedbackPass.setPipeline(feedback);feedbackPass.setBindGroup(0,feedbackBind);feedbackPass.dispatchWorkgroups(Math.ceil(50000/64));feedbackPass.end();device.queue.submit([encoder.finish()]);
  mark.invalidate();
  if(notification){const pending=download().then(result=>{notify.push({result,ms:performance.now()-start});});pendingNotifications.push(pending);}
  while(window.investigation.plot().getDiagnostics().completedFrame===first)await new Promise(requestAnimationFrame);
   await device.queue.onSubmittedWorkDone();
  if(window.__gpuErrors.length)throw Error(window.__gpuErrors.slice(0,3).join('\n'));return {ms:performance.now()-start,expected};
 };
 if(window.__gpuErrors.length)throw Error(window.__gpuErrors.slice(0,3).join('\n'));
 window.pickPrototype={run,download,notify,width,height,flush:()=>Promise.all(pendingNotifications),dispose:()=>{for(const b of [parameters,hit,objectInfo,...readPool])b.destroy();}};
});
const result={parity:[],samples:[]};
for(let i=0;i<10;i++){
 const point=[Math.floor(220+i*88),Math.floor(420+70*Math.sin(i))];
 const expected=await page.evaluate(async p=>(await window.pickPrototype.run('cpu',...p)).expected,point);
 const actual=await page.evaluate(async p=>{await window.pickPrototype.run('gpu',...p);return window.pickPrototype.download();},point);
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error(`Picking parity failed ${JSON.stringify({point,expected,actual})}`);
 result.parity.push({point,expected,actual});
}
const captures=[];
for(const mode of ['cpu','gpu']){
 await page.evaluate(async mode=>{await window.pickPrototype.run(mode,660,420);await window.investigation.settle();await window.investigation.marks()[0].getMark().renderer.backend.device.queue.onSubmittedWorkDone();await new Promise(requestAnimationFrame);},mode);
 const shot=await page.locator('[aria-label="Plot canvas"]').first().screenshot();
 captures.push({mode,pixel:pixelReader(shot),width:shot.readUInt32BE(16),height:shot.readUInt32BE(20)});
 await writeFile(`${out}/picking-parity-${mode}.png`,shot);
}
let differences=0,nonWhite=0,sampled=0;
for(let y=1;y<40;y++)for(let x=1;x<60;x++){
 const [cpu,gpu]=captures.map(shot=>shot.pixel(Math.floor(shot.width*x/60),Math.floor(shot.height*y/40)));
 if(Math.min(...gpu)<245)nonWhite++;if(cpu.some((value,i)=>Math.abs(value-gpu[i])>3))differences++;sampled++;
}
result.visualParity={sampled,nonWhite,differences};
if(nonWhite<100||differences/sampled>0.05)throw Error(`Beauty pixel parity failed ${JSON.stringify(result.visualParity)}`);
for(const mode of ['cpu','gpu','gpu-notify']){
 await page.evaluate(async mode=>{for(let i=0;i<8;i++)await window.pickPrototype.run(mode==='cpu'?'cpu':'gpu',220+i*88,420,32,mode==='gpu-notify');await window.pickPrototype.flush();},mode);
 for(let repetition=1;repetition<=3;repetition++){
  const sample=await page.evaluate(async({mode,repetition})=>{
   const before=window.__gpuCounters.snapshot(),latencies=[];
   for(let i=0;i<40;i++)latencies.push((await window.pickPrototype.run(mode==='cpu'?'cpu':'gpu',Math.floor(160+1100*i/39),Math.floor(420+70*Math.sin(i*.3)),32,mode==='gpu-notify')).ms);
   await window.pickPrototype.flush();const after=window.__gpuCounters.snapshot();
   const sorted=[...latencies].sort((a,b)=>a-b);
   return {mode,repetition,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],readbacks:after.readbacks-before.readbacks,buffers:after.buffers-before.buffers,shaders:after.shaders-before.shaders,compute:after.compute-before.compute,render:after.render-before.render,liveBytes:after.liveBytes,errors:window.__gpuErrors};
  },{mode,repetition});result.samples.push(sample);console.log(JSON.stringify(sample));
 }
 await page.evaluate(async()=>{await window.investigation.settle();await window.investigation.marks()[0].getMark().renderer.backend.device.queue.onSubmittedWorkDone();await new Promise(requestAnimationFrame);});
 await page.screenshot({path:`${out}/picking-${mode}.png`});
}
await writeFile(`${out}/picking-prototype.json`,JSON.stringify(result,null,2));
await page.evaluate(()=>window.pickPrototype.dispose());await browser.close();
