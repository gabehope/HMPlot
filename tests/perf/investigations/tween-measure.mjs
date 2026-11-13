import { chromium } from '@playwright/test';
import { installGpuCounters, installGpuErrors } from '../../browser/gpu-counters.js';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.TWEEN_URL??'http://127.0.0.1:5491', label=process.env.TWEEN_LABEL??'current', instrument=process.env.TWEEN_INSTRUMENT==='1';
const output=process.env.TWEEN_OUT??'tests/perf/investigations/results';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
const results=[];
for(const kind of ['numeric','tree']) {
 const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(installGpuErrors);if(instrument)await page.addInitScript(installGpuCounters);
 await page.goto(base+'/test/tween-current?case='+kind);
 await page.waitForFunction(()=>window.tweenCurrent?.marks.length && [...document.querySelectorAll('.canvas')].every(c=>c.getAttribute('aria-busy')==='false'),null,{timeout:90000});
 await page.evaluate(async()=>{const h=window.tweenCurrent;await h.plot.whenSettled();await h.plot.setAnimationTime(1000);h.raise();await h.plot.whenSettled();await h.plot.setAnimationTime(1500);await h.plot.setAnimationTime(2000);h.lower();await h.plot.whenSettled();await h.plot.setAnimationTime(3000);});
 const samples=[];
 for(let rep=0;rep<3;rep++) {
  const measured=await page.evaluate(async(rep)=>{const h=window.tweenCurrent,p=h.plot,r=h.marks[0].getMark().view.diagnostics.counters;await p.whenSettled();
   const counters=window.__gpuCounters?.snapshot(), start=performance.now(), first=p.getDiagnostics().completedFrame;
   const frames=[], startWrites=r.liveFieldUpdates;let alive=true,last=first;
   const watch=()=>{if(!alive)return;const n=p.getDiagnostics().completedFrame;if(n!==last){frames.push(performance.now());last=n;}requestAnimationFrame(watch);};requestAnimationFrame(watch);
   rep%2?h.lower():h.raise();await p.whenSettled();await p.setAnimationTime(null);await p.whenAnimationsFinished();await p.whenSettled();
   const wallMs=performance.now()-start,completedFrames=p.getDiagnostics().completedFrame-first,after=window.__gpuCounters?.snapshot();alive=false;
   const gaps=frames.slice(1).map((v,i)=>v-frames[i]).sort((a,b)=>a-b), pct=p=>gaps[Math.min(gaps.length-1,Math.floor(gaps.length*p))]??null;
   const out={rep:rep+1,wallMs,completedFrames,frameP50:pct(.5),frameP95:pct(.95),maxGap:gaps.at(-1),writes:r.liveFieldUpdates-startWrites,error:p.getRenderError(),gpuErrors:window.__gpuErrors};
   if(counters)for(const k of ['shaders','compute','render','readbacks','submits','fences','buffers','bufferBytes'])out[k]=after[k]-counters[k];
   return out;},rep);
  samples.push({...measured,errors:[...errors,...measured.gpuErrors]});console.log(JSON.stringify({label,instrument,kind,...measured}));
 }
 await page.screenshot({path:output+'/tween-'+label+'-'+kind+(instrument?'-instrumented':'')+'.png'});results.push({label,instrument,kind,samples});await page.close();
}
await writeFile(output+'/tween-'+label+(instrument?'-instrumented':'')+'.json',JSON.stringify(results,null,2));await browser.close();
