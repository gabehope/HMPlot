import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {pixelReader} from './browser/png.js';
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-webgpu']});
const report={date:new Date().toISOString(),browser:browser.version(),results:[]};
const base=process.env.HEATMAP_TEST_URL??'http://[::1]:5184';
try{
 for(const dpr of [1,2]){
 const page=await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:dpr}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(base+'/test/stabilization');await page.waitForFunction(()=>window.__stabilization?.read()?.completedFrame>0);await page.evaluate(()=>window.__stabilization.settled());
 const canv=page.locator('canvas').first();
 const painted=async()=>{const bytes=await canv.screenshot(),read=pixelReader(bytes),w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);let red=0;for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const c=read(x,y);if(c[0]>c[1]*1.3&&c[0]>c[2]*1.15)red++;}return red;};
 const heldFrame=await canv.screenshot();
 await page.evaluate(()=>{const s=window.__stabilization;s.mark().getMark().manager.enqueue(()=>new Promise(r=>setTimeout(r,400)),null);void s.set({phase:.1});});
 await page.waitForTimeout(40);const pendingFrame=await canv.screenshot();assert.ok(heldFrame.equals(pendingFrame),'pending upload preserves complete pixels');
 await page.evaluate(()=>window.__stabilization.settled());
 const before=await painted();assert.ok(before>50,'cold plot is populated');
 await canv.hover();const after=await painted();assert.ok(Math.abs(after-before)/before<.02,'first interaction preserves point size');
 await page.evaluate(()=>window.__stabilization.enable());
 const start=await page.evaluate(()=>window.__stabilization.read());assert.equal(start.overview.clients,3);
 for(const v of [{phase:.2},{count:1400},{size:14},{mode:'3d'},{mode:'2d'},{externals:false},{externals:true},{sourceB:true},{sourceB:false},{hidden:true},{hidden:false},{width:500},{width:800}]){
 await page.evaluate(v=>window.__stabilization.set(v),v);
 if(!v.hidden){const d=await page.evaluate(()=>window.__stabilization.read());assert.ok(d.overview.frames.every(f=>!f.error));}
 }
 await page.evaluate(()=>window.__stabilization.set({mode:'2d',sourceB:false}));
 const changed=await page.evaluate(()=>window.__stabilization.read());assert.equal(changed.overview.clients,3);assert.equal(changed.overview.targets,6);
 const draws=changed.overview.draws;await page.evaluate(()=>window.__stabilization.plot().setViewport({zoomX:2,zoomY:2}));await page.evaluate(()=>window.__stabilization.settled());
 const camera=await page.evaluate(()=>window.__stabilization.read());assert.equal(camera.overview.draws,draws,'camera-only gesture reuses overview pixels');
 for(let i=0;i<10;i++){await page.evaluate(()=>window.__stabilization.set({overview:false,externals:false}));await page.evaluate(()=>window.__stabilization.set({overview:true,externals:true}));}
 const end=await page.evaluate(()=>window.__stabilization.read());assert.equal(end.overview.clients,3);assert.equal(end.overview.targets,6);assert.equal(end.managers,start.managers);assert.deepEqual(errors,[]);assert.deepEqual(end.instrumentation.errors,[]);
 await page.screenshot({path:`/tmp/heatmap-stabilization/lifecycle-${dpr}.png`});report.results.push({fixture:'minimap-lifecycle',dpr,before,after,diagnostics:end});await page.close();
 }
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.goto(base+'/test/gallery-example?id=transform-force');await p.waitForFunction(()=>window.__transformExample?.force);
 const force=await p.evaluate(async()=>{const f=window.__transformExample.force;await f.whenSettled();let status;const stop=f.subscribe(v=>status=v);for(let i=0;i<200;i++)await f.update({selected:i%3,selectedPosition:[Math.sin(i)*10,Math.cos(i)*10]});const times=[];for(let i=0;i<60;i++){const t=performance.now();await f.action('step');times.push(performance.now()-t);if(status.error)break;}stop();return{times,error:status.error,iteration:status.iteration};});
 assert.equal(force.error,'');assert.equal(force.iteration,60);assert.deepEqual(errors,[]);report.results.push({fixture:'force-constraints-and-steps',...force});await p.close();
 console.log('Stabilization lifecycle and force checks passed');
}finally{await writeFile('/tmp/heatmap-stabilization/results.json',JSON.stringify(report,null,2));await browser.close();}
