import { chromium } from 'playwright-core';
import { installGpuCounters, installGpuErrors, countMarkBuilds } from '../../browser/gpu-counters.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.BENCH_URL ?? 'http://127.0.0.1:5483';
const label = process.env.BENCH_LABEL ?? 'baseline';
const selected = process.env.BENCH_CASE ? new RegExp(process.env.BENCH_CASE) : null;
const instrument = process.env.BENCH_INSTRUMENT === '1';
const reps = Number(process.env.BENCH_REPS ?? 3);
const out = process.env.BENCH_OUT ?? join(tmpdir(),'hmplot-stages100-105','results');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu']});
const context = await browser.newContext({viewport:{width:1300,height:1100},deviceScaleFactor:2});
const pct = (a,p) => [...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))] ?? null;
const cases = [
 {name:'scale-filter-small',url:'/test/investigation-scales?filter=1&rows=5000&marks=4',kind:'filter'},
 {name:'scale-filter-50k',url:'/test/investigation-scales?filter=1&rows=50000&marks=4',kind:'filter'},
 {name:'scale-filter-million',url:'/test/investigation-scales?filter=1&rows=1000000&marks=2',kind:'filter'},
 {name:'scale-palette-50k',url:'/test/investigation-scales?rows=50000&marks=4',kind:'palette'},
 {name:'scale-range-50k',url:'/test/investigation-scales?filter=1&rows=50000&marks=4',kind:'range'},
 {name:'bounds-style-50k',url:'/test/investigation-scales?bounds=auto&rows=50000&marks=4',kind:'style'},
 {name:'bounds-filter-50k',url:'/test/investigation-scales?bounds=auto&filter=1&rows=50000&marks=4',kind:'filter'},
 {name:'hover-exact-50k',url:'/test/investigation-scales?hover=1&rows=50000&marks=1',kind:'hover'},
 {name:'hover-nearest-50k',url:'/test/investigation-scales?nearest=1&rows=50000&marks=1',kind:'hover'},
 {name:'hover-tooltip-50k',url:'/test/investigation-scales?tooltip=1&rows=50000&marks=1',kind:'hover'},
 {name:'hover-disabled-50k',url:'/test/investigation-scales?rows=50000&marks=1',kind:'hover'},
 {name:'sunburst-stationary',url:'/examples/sunburst',kind:'sunburst'},
 {name:'sunburst-hover',url:'/examples/sunburst',kind:'sunburst-hover'},
 {name:'expandable-tree',url:'/examples/expandable-tree',kind:'tree'},
];
const results = [];
for (const scenario of cases) {
 if(selected && !selected.test(scenario.name)) continue;
 const page = await context.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(installGpuErrors);
 if(instrument) await page.addInitScript(installGpuCounters);
 await page.goto(base+scenario.url);
 await page.waitForFunction(()=>Boolean(window.investigation?.plot() ?? window.__examples?.plot),null,{timeout:120000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.canvas')].every(c=>c.getAttribute('aria-busy')==='false'),null,{timeout:120000});
 await page.evaluate(async()=>{await (window.investigation?.settle() ?? window.__examples?.settle());});
 if(!scenario.kind.startsWith('sunburst') && scenario.kind!=='tree') await page.waitForFunction(()=>window.investigation?.marks().every(h=>h?.getMark?.()));
 await page.waitForTimeout(800);
 if(instrument) await countMarkBuilds(page);
 const b=await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
 const replay=async()=>{
  if(scenario.kind==='hover') {
   for(let i=0;i<40;i++){await page.mouse.move(b.x+b.width*(0.1+0.8*i/39),b.y+b.height*(0.4+0.12*Math.sin(i*.3)));await page.waitForTimeout(12);}
  } else if(scenario.kind.startsWith('sunburst')) {
   await page.mouse.click(b.x+b.width*.52,b.y+b.height*.23);
   if(scenario.kind==='sunburst-hover')for(let i=0;i<35;i++){await page.mouse.move(b.x+b.width*(.2+.6*i/34),b.y+b.height*.45);await page.waitForTimeout(15);}
   else await page.mouse.move(2,2);
   await page.waitForTimeout(750);await page.mouse.click(b.x+b.width*.5,b.y+b.height*.5);await page.waitForTimeout(750);
  } else if(scenario.kind==='tree') {
   const slider=page.getByRole('slider',{name:'Visible depth',exact:true});
   for(const value of ['1','3','2','3']){await slider.fill(value);await page.waitForTimeout(700);}
  } else {
   const values=scenario.kind==='filter'?[100,400,0,996,30,800]:scenario.kind==='palette'?['Inferno','Viridis','Magma','Viridis','Plasma','Viridis']:scenario.kind==='range'?[[2,8],[2,5],[1,6],[2,5],[3,10],[2,5]]:[4,3,5,3,6,3];
   for(const value of values) {
    await page.evaluate(async({kind,value})=>{const p=window.investigation.plot(),first=p.getDiagnostics().completedFrame,start=performance.now();
     const method=kind==='filter'?'setThreshold':kind==='palette'?'setColormap':kind==='range'?'setRange':'setSize';window.investigation[method](value);
     let acceptedAt=first;
     if(kind==='filter') {
      while(performance.now()-start<10000) {
       const state=window.investigation.read();
       if(state.every(mark=>mark.color?.[1]===Math.floor(value)))break;
       await new Promise(requestAnimationFrame);
      }
      acceptedAt=p.getDiagnostics().completedFrame;
     }
     await window.investigation.settle();
     if(kind!=='filter')while(p.getDiagnostics().completedFrame===first && performance.now()-start<10000)await new Promise(requestAnimationFrame);
     window.__measurement.feedback.push(performance.now()-start);
    },{kind:scenario.kind,value});
   }
  }
  await page.evaluate(async()=>{await(window.investigation?.settle() ?? window.__examples?.settle());});
 };
 await page.evaluate(()=>{window.__measurement={feedback:[]};});
 await replay();await page.waitForTimeout(300);
 const samples=[];
 for(let repetition=0;repetition<reps;repetition++) {
  await page.evaluate(()=>{
   const p=window.investigation?.plot() ?? window.__examples?.plot;
   window.__measurement={feedback:[],frames:[],last:p.getDiagnostics().completedFrame,start:performance.now(),active:true};
   const watch=()=>{const s=window.__measurement;if(!s.active)return;const now=performance.now(),n=p.getDiagnostics().completedFrame;
    if(n!==s.last){s.frames.push(now);s.last=n;}if(window.__gpuCounters)s.peakBytes=Math.max(s.peakBytes??0,window.__gpuCounters.state.liveBytes);requestAnimationFrame(watch);
   };requestAnimationFrame(watch);
  });
  const before=instrument?await page.evaluate(()=>window.__gpuCounters.snapshot()):null;
  await replay();
  const data=await page.evaluate(()=>{const s=window.__measurement;s.active=false;return {...s,end:performance.now(),state:window.investigation?.read(),gpuErrors:window.__gpuErrors};});
  const after=instrument?await page.evaluate(()=>window.__gpuCounters.snapshot()):null;
  const gaps=data.frames.slice(1).map((t,i)=>t-data.frames[i]);
  const sample={repetition:repetition+1,wallMs:data.end-data.start,completedFrames:data.frames.length,frameP50:pct(gaps,.5),frameP95:pct(gaps,.95),feedbackP50:pct(data.feedback,.5),feedbackP95:pct(data.feedback,.95),state:data.state,errors:[...errors,...data.gpuErrors]};
  if(instrument){for(const key of ['compute','render','shaders','buffers','bufferBytes','readbacks','submits','fences','builds'])sample[key]=after[key]-before[key];sample.liveBytes=after.liveBytes;sample.peakBytes=data.peakBytes;sample.readbackKinds=Object.fromEntries(Object.keys(after.readbackKinds).map(k=>[k,after.readbackKinds[k]-before.readbackKinds[k]]));}
  samples.push(sample);console.log(JSON.stringify({label,instrument,case:scenario.name,...sample}));
 }
 await page.screenshot({path:`${out}/${label}-${scenario.name}${instrument?'-instrumented':''}.png`,fullPage:false});
 results.push({label,instrument,name:scenario.name,url:scenario.url,samples});await page.close();
 await writeFile(`${out}/${label}${instrument?'-instrumented':''}${process.env.BENCH_CASE?'-'+process.env.BENCH_CASE.replace(/[^a-z0-9]+/gi,'_'):''}.json`,JSON.stringify(results,null,2));
}
await browser.close();
