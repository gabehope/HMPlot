import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-webgpu']}),results=[];
const base=process.env.HEATMAP_TEST_URL??'http://[::1]:5184';
try{
for(const kind of (process.env.FORCE_ONLY?[]:process.env.MARKS_ONLY?['segments','arrows','labels','errorbars','ribbon','rect','prism']:['points','line','heatmap'])){
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.goto(base+'/test/stabilization');await p.waitForFunction(()=>window.__stabilization?.read()?.completedFrame>0);await p.evaluate(()=>window.__stabilization.enable());
 for(const count of kind==='heatmap'?[256**2,1024**2,2048**2]:process.env.MARKS_ONLY?[100,1000,10000]:[1000,10000,100000,1000000]){
  const item=await p.evaluate(async({kind,count})=>{const s=window.__stabilization,t=performance.now();await s.set({kind,count,externals:false,overview:false});const cold=performance.now()-t,times=[];for(let i=0;i<3;i++){const t=performance.now();await s.set({phase:i*.2});times.push(performance.now()-t);}const noOverview=s.read();await s.set({overview:true});const overview=s.read();return{kind,count,cold,times,noOverview,overview};},{kind,count});
  item.errors=[...errors];item.stop=errors.length?'gpu-or-browser-error':item.times.filter(v=>v>1000).length>=2?'sustained-latency':'';results.push(item);console.log(kind,count,item.cold,item.times,item.stop);if(item.stop)break;
 }
 await p.close();if(results.at(-1).errors.length)break;
}
if(!process.env.MARKS_ONLY){const p=await browser.newPage();await p.goto(base+'/test/gallery-example?id=large-graph');await p.waitForFunction(()=>window.__largeGraph?.force);
for(const count of [64,256,512,2048]){
 await p.getByLabel('Nodes',{exact:true}).selectOption(String(count));await p.waitForTimeout(50);await p.waitForFunction(()=>window.__largeGraph?.plot?.getDiagnostics()?.completedFrame>0);
 const item=await p.evaluate(async()=>{const {force:f,plot}=window.__largeGraph;await f.whenSettled();plot.getDiagnostics({enabled:true});let s;const stop=f.subscribe(v=>s=v);const times=[];for(let i=0;i<20;i++){const t=performance.now();await f.action('step');times.push(performance.now()-t);if(s.error||times.slice(-2).filter(v=>v>1000).length===2)break;}stop();return{kind:'force',count:s.selection.count,times,error:s.error,diagnostics:plot.getDiagnostics()};});results.push(item);console.log('force',count,item.times,item.error);if(item.error||item.times.slice(-2).every(v=>v>1000))break;
}await p.close();}
}finally{await writeFile(`/tmp/heatmap-stabilization/${process.env.FORCE_ONLY?'force-scale':process.env.MARKS_ONLY?'marks-scale':'scale'}.json`,JSON.stringify({browser:browser.version(),results},null,2));await browser.close();}
