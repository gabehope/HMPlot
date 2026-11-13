import { test, expect } from './fixtures.js';

test.describe('named histogram crossfilter', () => {
 test.use({ deviceScaleFactor: 2 });
 test('keeps the brush and matching rendered bins through commit and clear', async ({ page }) => {
  await page.goto('/test/crossfilter');
  await page.waitForFunction(() => window.__crossfilter?.histograms.length === 3 &&
   [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
  await page.evaluate(() => Promise.all(window.__crossfilter.plots.map(p => p.whenSettled())));
  const counts = () => page.evaluate(() => window.__crossfilter.histograms.map(h => {
   const mark = h.getMark(); let count;
   mark.view.picking.scene.current.traverse(object => {
    const binding = mark.view.marks.of(object);
    if (binding?.interaction?.brush) count = binding.rows.count;
   });
   return count;
  }));
  expect(await counts()).toEqual([120, 120, 120]);
  const box = await page.locator('canvas').first().boundingBox();
  const layout = await page.evaluate(() => window.__crossfilter.plots[0].getAxisLayout());
  const x = fraction => box.x + layout.left + fraction * (layout.right - layout.left);
  const y = box.y + (layout.top + layout.bottom) / 2;
  await page.mouse.move(x(.25), y); await page.keyboard.down('Shift'); await page.mouse.down();
  await page.mouse.move(x(.65), y, { steps: 8 });
  await expect(page.locator('.brush-region').first()).toBeVisible();
  const expected = await page.evaluate(() => {
   const { histograms, brushes, data } = window.__crossfilter;
   const mark = histograms[0].getMark(), owner = mark.view.marks.of(mark).interaction.owner;
   const [low, high] = brushes[0].getConstraints(owner)[0].bounds;
   return data.x.filter(x => x >= low && x <= high).length;
  });
  expect(expected).toBeGreaterThan(0); expect(expected).toBeLessThan(120);
  await expect.poll(counts).toEqual([120, expected, expected]);
  await page.mouse.up(); await page.keyboard.up('Shift');
  await page.evaluate(() => Promise.all(window.__crossfilter.plots.map(p => p.whenSettled())));
  await expect(page.locator('.brush-region').first()).toBeVisible();
  expect(await counts()).toEqual([120, expected, expected]);
  // Counts alone cannot establish that the bins draw: inspect the rendered blue bars too.
  const pixels = await page.evaluate(() => Promise.all(window.__crossfilter.plots.map(async plot => {
   const bitmap = await createImageBitmap(await plot.exportPNG());
   const copy = document.createElement('canvas'); copy.width = bitmap.width; copy.height = bitmap.height;
   const ctx = copy.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
   const rgba = ctx.getImageData(0, 0, copy.width, copy.height).data;
   let blue = 0; for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 2] > rgba[i] + 50 && rgba[i + 1] > rgba[i] + 20) blue++;
   return blue;
  })));
  expect(pixels).toHaveLength(3); for (const count of pixels) expect(count).toBeGreaterThan(100);
  await page.evaluate(() => window.__crossfilter.brushes[0].clear());
  await expect(page.locator('.brush-region')).toHaveCount(0);
  await expect.poll(counts).toEqual([120, 120, 120]);
 });
});
// The interaction matrix, dashboard and keyed-update tests below drive the gallery components
// these examples had (their dev hooks, data and markup), so they open them at their legacy fixture,
// /test/gallery-example?id=<id>; the public /examples/<id> draws the paired Python program
// (TODO 69.10), checked in examples.spec.js and interaction-stress-examples.spec.js.
async function plotInterior(page, canvas, source = 'matrix') {
 const b = await canvas.boundingBox();
 const l = await page.evaluate(source => {
  const plot = source === 'dashboard' ? window.__interactionDashboard.source : window.__examples.plot;
  return (plot.getPlots?.()[1]?.plot ?? plot).getAxisLayout();
 }, source);
 return {x:b.x+l.left,y:b.y+l.top,width:l.right-l.left,height:l.bottom-l.top};
}
test('matrix brush publishes live membership',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('/test/gallery-example?id=interaction-matrix');
 await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__examples?.plot);
 await page.evaluate(()=>window.__examples.settle());
 const canvas=page.locator('.facet-cell canvas').nth(1);await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox(); const interior=await plotInterior(page,canvas);
 await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);
 await page.waitForTimeout(100);
 await page.evaluate(async()=>{
  const {guideObject}=await import('/src/lib/plot/utils/guides.js');
  const plot=window.__examples.plot.getPlots()[0].plot;
  const mark=plot.getLegendSource().entries().map(guideObject).find(m=>((m) => m?.view.marks.of(m))(m)?.interaction?.brush);
  mark.view.picking.brushReadback.install({read:()=>{throw Error('pixel brush readback was used')},cancel(){}});
  mark.view.picking.context.current.frameStale=true;
  window.brushMarks=window.__examples.plot.getPlots().flatMap(({plot})=>plot.getLegendSource().entries().map(guideObject)).filter(m=>((m) => m?.view.marks.of(m))(m)?.interaction?.brush);
  window.brushPositionVersions=window.brushMarks.map(m=>m.fields.get('position').version);
 });
 await page.keyboard.down('Shift');await page.mouse.move(interior.x+interior.width*.2,interior.y+interior.height*.2);await page.mouse.down();
 await page.mouse.move(interior.x+interior.width*.8,interior.y+interior.height*.8,{steps:12});
 await expect.poll(()=>page.evaluate(()=>window.__examples.plot.getBrush().status().previewActive)).toBe(true);
 // Inspect the actual GPU attribute before pointer-up, not merely the gesture
 // flag. Match independently calculated source-row predicates in every cell.
 await expect.poll(()=>page.evaluate(async()=>{
  const constraints=window.__examples.plot.getBrush().getConstraints();
  if(constraints.length!==2)return false;
  const expected=Array.from({length:256},(_,i)=>{
   const row={x:.08+.84*((i*37)%997)/996,y:.5+.38*Math.sin(i*.71),score:.5+.4*Math.cos(i*.29),response:.5+.38*Math.sin(i*.17+1)};
   return constraints.every(c=>row[c.name]>=c.bounds[0]&&row[c.name]<=c.bounds[1])?1:.25;
  });
  if(!expected.includes(1)||!expected.includes(.25))return false;
  for(const mark of window.brushMarks){
   const field=mark.fields.get('interactionOpacity');
   if(!field?.bufferMode.value||mark.manager.pendingUpdates)return false;
   const device=mark.renderer.backend.device,source=mark.renderer.backend.get(field.buffer).buffer;
   const read=device.createBuffer({size:1024,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   try{
    const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(source,0,read,0,1024);device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    if(!Array.from(new Float32Array(read.getMappedRange())).every((v,i)=>v===expected[i]))return false;
   }finally{read.destroy();}
  }
  return true;
 })).toBe(true);
 expect(await page.evaluate(()=>window.brushMarks.map(m=>m.fields.get('position').version))).toEqual(await page.evaluate(()=>window.brushPositionVersions));
 const previewBox=await page.locator('.facet-cell').nth(1).locator('.brush-region').boundingBox();
 await page.mouse.up();await page.keyboard.up('Shift');
 await expect.poll(()=>page.evaluate(()=>window.__examples.plot.getBrush().status().committedCount)).toBeGreaterThan(0);
 const committedBox=await page.locator('.facet-cell').nth(1).locator('.brush-region').boundingBox();
 for(const key of ['x','y','width','height'])expect(committedBox[key]).toBeCloseTo(previewBox[key],0);
 const cx=committedBox.x+committedBox.width/2,cy=committedBox.y+committedBox.height/2;
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+24,cy+18,{steps:6});
 const movedPreview=await page.locator('.facet-cell').nth(1).locator('.brush-region').boundingBox();
 await page.mouse.up();
 const movedCommitted=await page.locator('.facet-cell').nth(1).locator('.brush-region').boundingBox();
 for(const key of ['x','y','width','height'])expect(movedCommitted[key]).toBeCloseTo(movedPreview[key],0);
 expect(errors).toEqual([]);
});
test('matrix constraints are shared by column and grid navigation links rows and columns',async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-matrix');await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__examples?.plot?.getPlots?.().length===16);await page.evaluate(()=>window.__examples.settle());
 const canvas=page.locator('.facet-cell canvas').nth(1),b=await canvas.boundingBox(); const interior=await plotInterior(page,canvas);
 await page.keyboard.down('Shift');await page.mouse.move(interior.x+interior.width*.25,interior.y+interior.height*.25);await page.mouse.down();await page.mouse.move(interior.x+interior.width*.65,interior.y+interior.height*.7,{steps:5});await page.mouse.up();await page.keyboard.up('Shift');
 await expect.poll(()=>page.evaluate(()=>window.__examples.plot.getBrush().getConstraints().length)).toBe(2);
 await expect(page.locator('.brush-region')).toHaveCount(12);
 await page.evaluate(()=>window.__examples.plot.getPlots()[0].plot.setViewport({x:.3,y:.7,zoomX:2,zoomY:3}));
 await page.waitForTimeout(100);
 const views=await page.evaluate(()=>window.__examples.plot.getPlots().map(({plot})=>plot.getViewport()));
 for(const index of [0,4,8,12])expect(views[index].zoomX).toBeCloseTo(2);
 for(const index of [0,1,2,3])expect(views[index].zoomY).toBeCloseTo(3);
 expect(views[1].zoomX).toBeCloseTo(1);expect(views[4].zoomY).toBeCloseTo(1);
});
test('scatterplot matrix brush does not change size on release',async({page})=>{
 await page.goto('/examples/scatterplot-matrix');await page.locator('.live-example').scrollIntoViewIfNeeded();
 // The paired program's live scene replaces its preview once drawn (TODO 69.10).
 await expect(page.locator('.live.ready')).toBeVisible({timeout:90000});
 await expect(page.locator('.live .facet-cell')).toHaveCount(9);await page.waitForTimeout(150);
 const cell=page.locator('.live .facet-cell').nth(1),canvas=cell.locator('[aria-label="Plot canvas"]'),b=await canvas.boundingBox(); const interior=await plotInterior(page,canvas);
 await page.keyboard.down('Shift');await page.mouse.move(interior.x+interior.width*.25,interior.y+interior.height*.25);await page.mouse.down();await page.mouse.move(interior.x+interior.width*.72,interior.y+interior.height*.75,{steps:8});
 const preview=await cell.locator('.brush-region').boundingBox();await page.mouse.up();await page.keyboard.up('Shift');
 await expect(cell.locator('.brush-region')).toBeVisible();const committed=await cell.locator('.brush-region').boundingBox();
 for(const key of ['x','y','width','height'])expect(committed[key]).toBeCloseTo(preview[key],0);
});
test('keyed colors stay initialized in presented frames',async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-keyed-updates');await page.locator('.live-example').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.__examples?.plot);await page.evaluate(()=>window.__examples.settle());
 await page.evaluate(async()=>{
  const {guideObject}=await import('/src/lib/plot/utils/guides.js');
  const mark=window.__examples.plot.getLegendSource().entries().map(guideObject).find(m=>m.fields.has('categoryColor'));
  window.colorSamples=[];window.colorReads=[];
  const renderer=mark.renderer,overviewFrame=mark.view.drawing.overviewFrame,original=overviewFrame.current;
  overviewFrame.install((...args)=>{
   original?.(...args);if(args[0]===false||!mark.count)return;
   const buffer=renderer.backend.get(mark.fields.get('categoryColor').buffer).buffer;
   if(!buffer)return;
   const count=mark.count,device=renderer.backend.device,read=device.createBuffer({size:count*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=device.createCommandEncoder();
   encoder.copyBufferToBuffer(buffer,0,read,0,count*16);device.queue.submit([encoder.finish()]);
   const texture=renderer.backend.getContext().getCurrentTexture();
   const w=texture.width,h=texture.height,stride=Math.ceil(w*4/256)*256;
   const pixels=device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   const copy=device.createCommandEncoder();copy.copyTextureToBuffer({texture},{buffer:pixels,bytesPerRow:stride},{width:w,height:h});device.queue.submit([copy.finish()]);
   window.colorReads.push(pixels.mapAsync(GPUMapMode.READ).then(()=>{
     const bytes=new Uint8Array(pixels.getMappedRange());let black=0;
     const l=window.__examples.plot.getAxisLayout(),scale=w/renderer.domElement.clientWidth;
     for(let y=Math.ceil(l.top*scale)+4;y<l.bottom*scale-4;y++)for(let x=Math.ceil(l.left*scale)+4;x<l.right*scale-4;x++){const k=y*stride+x*4;if(bytes[k]+bytes[k+1]+bytes[k+2]<15&&bytes[k+3]>200)black++;}
     if(black)window.colorSamples.push({pixelsBlack:black});pixels.unmap();pixels.destroy();
   }));
   window.colorReads.push(read.mapAsync(GPUMapMode.READ).then(()=>{const values=new Float32Array(read.getMappedRange());let black=0;for(let i=0;i<count;i++)if(values[i*4]+values[i*4+1]+values[i*4+2]<0.001)black++;window.colorSamples.push({count,black});read.unmap();read.destroy();}));
  });
 });
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'Advance',exact:true}).click();await page.waitForTimeout(180);}
 await page.evaluate(()=>window.__examples.finished());
 const samples=await page.evaluate(async()=>{await Promise.all(window.colorReads);return window.colorSamples;});
 expect(samples.some(s=>s.count>48)).toBe(true);expect(samples.length).toBeGreaterThan(0);expect(samples.filter(s=>s.black>0||s.pixelsBlack>0)).toEqual([]);
});

test('filtered dashboard colors stay initialized in presented frames',async({page})=>{
 await page.goto('/test/notebook?fixture=interaction-dashboard');await page.waitForFunction(()=>window.notebookReady);
 await page.waitForTimeout(300);
 await page.evaluate(async()=>{
  const {guideObject}=await import('/src/lib/plot/utils/guides.js');
  const handles=[...window.notebookRuntime.handles.values()].map(e=>e.handle);
  // The points mark under a Filter. A Filter keeps its input's rows and marks the kept ones
  // (Stage 17), so the mark holds every row from the start rather than none.
  const filtered=new Set(),walk=(node,under)=>{if(under&&node.kind==='Points')filtered.add(node.id);(node.children??[]).forEach(child=>walk(child,under||node.kind==='Filter'));};
  walk(window.notebookState.root,false);
  const mark=[...window.notebookRuntime.handles.values()].filter(e=>filtered.has(e.id)).map(e=>e.handle?.getMark?.()).find(m=>m?.fields.has('categoryColor')&&m.exportKind==='points');
  const plot=handles.find(h=>h.getAxisLayout && h.getLegendSource?.().entries().some(e=>guideObject(e)===mark));
  const binding=handles.map(h=>((m) => m?.view.marks.of(m))(h?.getMark?.())?.interaction).find(b=>b?.brush);
  window.dashboardBrush=binding.brush;window.dashboardOwner=binding.owner;
  if(!mark)throw Error('Missing filtered mark');
  window.colorSamples=[];window.colorReads=[];
  const renderer=mark.renderer,overviewFrame=mark.view.drawing.overviewFrame,original=overviewFrame.current;
  overviewFrame.install((...args)=>{
   original?.(...args);if(args[0]===false||!mark.count)return;
   const buffer=renderer.backend.get(mark.fields.get('categoryColor').buffer).buffer;
   if(!buffer)return;
   const count=mark.count,device=renderer.backend.device,read=device.createBuffer({size:count*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=device.createCommandEncoder();
   encoder.copyBufferToBuffer(buffer,0,read,0,count*16);device.queue.submit([encoder.finish()]);
   const texture=renderer.backend.getContext().getCurrentTexture();
   const w=texture.width,h=texture.height,stride=Math.ceil(w*4/256)*256;
   const pixels=device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   const copy=device.createCommandEncoder();copy.copyTextureToBuffer({texture},{buffer:pixels,bytesPerRow:stride},{width:w,height:h});device.queue.submit([copy.finish()]);
   window.colorReads.push(pixels.mapAsync(GPUMapMode.READ).then(()=>{
     const bytes=new Uint8Array(pixels.getMappedRange());let black=0;
     const l=plot.getAxisLayout(),scale=w/renderer.domElement.clientWidth;
     for(let y=Math.ceil(l.top*scale)+4;y<l.bottom*scale-4;y++)for(let x=Math.ceil(l.left*scale)+4;x<l.right*scale-4;x++){const k=y*stride+x*4;if(bytes[k]+bytes[k+1]+bytes[k+2]<15&&bytes[k+3]>200)black++;}
     if(black)window.colorSamples.push({pixelsBlack:black});pixels.unmap();pixels.destroy();
   }));
   window.colorReads.push(read.mapAsync(GPUMapMode.READ).then(()=>{const values=new Float32Array(read.getMappedRange());let black=0;for(let i=0;i<count;i++)if(values[i*4]+values[i*4+1]+values[i*4+2]<0.001)black++;window.colorSamples.push({count,black});read.unmap();read.destroy();}));
  });
 });
 for(let i=0;i<5;i++) {
  await page.evaluate(i=>window.dashboardBrush.replace(window.dashboardOwner,Array.from({length:100+i*200},(_,j)=>j),{phase:'preview'}),i);
  await page.waitForTimeout(120);
  await page.evaluate(()=>window.dashboardBrush.cancelPreview(window.dashboardOwner));
  await page.waitForTimeout(120);
 }
 const samples=await page.evaluate(async()=>{await Promise.all(window.colorReads);return window.colorSamples;});
 expect(samples.length).toBeGreaterThan(0);expect(samples.filter(s=>s.black>0||s.pixelsBlack>0)).toEqual([]);
});
test('matrix hover updates coordinated size buffers without position uploads',async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-matrix');await page.locator('.live-example').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.__examples?.plot);await page.evaluate(()=>window.__examples.settle());
 const canvas=page.locator('.facet-cell canvas').first();await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
 await page.evaluate(async()=>{const {guideObject}=await import('/src/lib/plot/utils/guides.js');window.matrixMarks=window.__examples.plot.getPlots().flatMap(({plot})=>plot.getLegendSource().entries().map(guideObject)).filter(m=>m.fields.has('size'));window.matrixPositionVersions=window.matrixMarks.map(m=>m.fields.get('position').version);});
 await page.evaluate(()=>{
  window.hoverBuilds={mark:0,render:0,compute:0};
  for(const mark of window.matrixMarks){const original=mark.build;mark.build=function(...args){window.hoverBuilds.mark++;return original.apply(this,args);};}
  for(const renderer of new Set(window.matrixMarks.map(m=>m.renderer))){
   const backend=renderer.backend, original=backend.createNodeBuilder;
   backend.createNodeBuilder=function(object,...args){window.hoverBuilds[object.isComputeNode?'compute':'render']++;return original.call(this,object,...args);};
  }
 });
 const timings=[];
 for(const row of [8,16,24,32,40,48]) {
  await page.mouse.move(1,1);await page.waitForTimeout(60);
  const point=await page.evaluate(row=>{const layout=window.__examples.plot.getPlots()[0].plot.getAxisLayout();const v=.08+.84*((row*37)%997)/996;const f=axis=>{const t=layout[axis].major,a=t[0],b=t.at(-1);return a.fraction+(v-a.value)/(b.value-a.value)*(b.fraction-a.fraction);};window.matrixStart=performance.now();window.matrixFrames=window.matrixMarks.map(m=>m.view.lifecycle.completedFrame);return {x:f('x'),y:1-f('y')};},row);
  await page.mouse.move(box.x+box.width*point.x,box.y+box.height*point.y);
  await page.waitForFunction(()=>window.__examples.plot.getHover().status().previewCount===1&&window.matrixMarks.every((m,i)=>m.view.lifecycle.completedFrame>window.matrixFrames[i]));
  timings.push(await page.evaluate(()=>performance.now()-window.matrixStart));
 }
 expect(await page.evaluate(()=>window.matrixMarks.map(m=>m.fields.get('position').version))).toEqual(await page.evaluate(()=>window.matrixPositionVersions));
 console.log('matrix hover completed frames (ms)',timings.map(Math.round));
 expect(await page.evaluate(()=>window.hoverBuilds)).toEqual({mark:0,render:0,compute:0});
 await page.evaluate(()=>window.__examples.settle());
 expect(await page.evaluate(async()=>{
  const field=window.matrixMarks[0].fields.get('interactionOpacity');
  const values=await field.data.ref.data();
  return {mode:field.bufferMode.value,bright:Array.from(values).filter(x=>x===1).length,dim:Array.from(values).filter(x=>x===.25).length};
 })).toEqual({mode:1,bright:1,dim:255});
 await page.mouse.move(1,1);
 await page.waitForFunction(()=>window.__examples.plot.getHover().status().previewCount===0);
 await page.evaluate(()=>window.__examples.settle());
 expect(await page.evaluate(()=>window.matrixMarks.every(m=>m.fields.get('interactionOpacity').bufferMode.value===0))).toBe(true);
 expect(await page.evaluate(()=>window.hoverBuilds)).toEqual({mark:0,render:0,compute:0});
});


test('matrix brush measures held-pointer feedback latency',{tag:'@timing'},async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-matrix');await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__examples?.plot);await page.evaluate(()=>window.__examples.settle());
 const canvas=page.locator('.facet-cell canvas').nth(1);const b=await canvas.boundingBox(); const interior=await plotInterior(page,canvas);
 await page.evaluate(async()=>{
  const {guideObject}=await import('/src/lib/plot/utils/guides.js');
  const marks=window.__examples.plot.getPlots().flatMap(({plot})=>plot.getLegendSource().entries().map(guideObject)).filter(m=>((m) => m?.view.marks.of(m))(m)?.interaction?.brush);
  window.brushTiming=[];const resource=window.__examples.plot.getBrush(),original=resource.setConstraints;
  resource.setConstraints=function(...args){
   const start=performance.now(),frames=marks.map(m=>m.view.lifecycle.completedFrame),versions=marks.map(m=>m.fields.get('interactionOpacity').version);
   const result=original.apply(this,args);
   requestAnimationFrame(function check(){
    if(marks.every((m,i)=>m.fields.get('interactionOpacity').version>versions[i]&&!m.manager.pendingUpdates&&m.view.lifecycle.completedFrame>frames[i]))window.brushTiming.push(performance.now()-start);
    else if(performance.now()-start<2000)requestAnimationFrame(check);
   });return result;
  };
 });
 await page.keyboard.down('Shift');await page.mouse.move(interior.x+interior.width*.25,interior.y+interior.height*.25);await page.mouse.down();
 for(let i=0;i<6;i++){
  await page.mouse.move(b.x+b.width*(.45+i*.05),b.y+b.height*(.5+i*.04));
  await page.waitForFunction(n=>window.brushTiming.length>n,i);
 }
 console.log('held-pointer brush feedback and frame latency (ms)',await page.evaluate(()=>window.brushTiming.map(Math.round)));
 await page.mouse.up();await page.keyboard.up('Shift');
});


test('dashboard filtered plot publishes during continuous brush movement',{ tag: ["@gpu", "@timing"] },async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-dashboard');await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__interactionDashboard?.filteredMark?.getMark());
 await page.evaluate(()=>Promise.all([window.__interactionDashboard.source.whenSettled(),window.__interactionDashboard.filteredPlot.whenSettled()]));
 const canvas=page.locator('.plots section').first().locator('[aria-label="Plot canvas"]');const b=await canvas.boundingBox(); const interior=await plotInterior(page,canvas,'dashboard');
 b.width=await page.locator('.plots section').first().evaluate(e=>e.getBoundingClientRect().width);
 await page.evaluate(()=>{
  window.filterFrames=[];window.filterLatencies=[];window.filterStarts=[];window.recordBrush=true;window.filterCosts=[];
  const target=window.__interactionDashboard.filteredMark.getMark();
  target.view.diagnostics.instrumentation.install({renderer:target.renderer,sample:(name,ms)=>window.filterCosts.push([name,Math.round(ms)]),pickingMaterial(){},snapshot(){},dispose(){}});
  const device=target.renderer.backend.device,compile=device.createComputePipelineAsync.bind(device);
  device.createComputePipelineAsync=async(...args)=>{const t=performance.now();try{return await compile(...args);}finally{window.filterCosts.push(['compile',Math.round(performance.now()-t)]);}};
  const brush=window.__interactionDashboard.source.getBrush(),setConstraints=brush.setConstraints.bind(brush);
  brush.setConstraints=(...args)=>{if(args[2]?.phase==='preview')window.filterStarts.push(performance.now());return setConstraints(...args);};
  const mark=window.__interactionDashboard.filteredMark.getMark();let last=-1,lastCount=-1;
  requestAnimationFrame(function sample(){
   if(mark.view.lifecycle.completedFrame!==last){
    last=mark.view.lifecycle.completedFrame;const now=performance.now(),count=((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(mark);
    window.filterFrames.push({time:now,count,pending:mark.manager.pendingUpdates});
    if(count!==lastCount&&window.filterStarts.length){window.filterLatencies.push(now-window.filterStarts.at(-1));window.filterStarts=[];lastCount=count;}
   }
   if(window.recordBrush)requestAnimationFrame(sample);
  });
 });
 await page.keyboard.down('Shift');await page.mouse.move(interior.x+interior.width*.25,interior.y+interior.height*.25);await page.mouse.down();
 for(let i=0;i<30;i++){
  await page.mouse.move(b.x+b.width*(.35+i*.012),b.y+b.height*(.4+i*.01));
  await page.waitForTimeout(16);
  if(i===4)await page.evaluate(()=>{window.filterCosts=[];window.filterLatencies=[];});
 }
 const frames=await page.evaluate(()=>{window.recordBrush=false;return window.filterFrames;});
 console.log('dashboard continuous brush', {distinctPresentedCounts:new Set(frames.filter(f=>f.count>0).map(f=>f.count)).size},await page.evaluate(()=>({compiles:window.filterCosts.filter(c=>c[0]==='compile').length,slowestCompile:Math.max(0,...window.filterCosts.filter(c=>c[0]==='compile').map(c=>c[1])),slowestUpload:Math.max(0,...window.filterCosts.filter(c=>c[0]==='uploadPreparation').map(c=>c[1]))}))); 
 expect(new Set(frames.filter(f=>f.count>0).map(f=>f.count)).size).toBeGreaterThan(3);
 const latency=await page.evaluate(()=>window.filterLatencies.slice(1).sort((a,b)=>a-b));
 console.log('dashboard warmed pointer-to-filtered-frame (ms)',latency.map(Math.round));
 expect(latency[Math.max(0,Math.ceil(latency.length*.95)-1)]).toBeLessThan(100);
 expect(await page.evaluate(()=>window.filterCosts.filter(c=>c[0]==='compile').length)).toBeLessThanOrEqual(1);
 expect(await page.evaluate(async()=>{
  const mark=window.__interactionDashboard.filteredMark.getMark(),field=mark.fields.get('interactionOpacity');
  const values=await field.data.ref.data();
  return {visible:Array.from(values).filter(value=>value>.5).length,logical:((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(mark),total:values.length};
 })).toEqual(expect.objectContaining({visible:expect.any(Number),logical:expect.any(Number),total:1024}));
 expect(await page.evaluate(async()=>{const mark=window.__interactionDashboard.filteredMark.getMark(),values=await mark.fields.get('interactionOpacity').data.ref.data();return Array.from(values).filter(value=>value>.5).length===((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(mark);})).toBe(true);
 await page.mouse.up();await page.keyboard.up('Shift');
});

test('brush wheel routing, direction, rollback, and transient controls',async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-dashboard');await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__interactionDashboard?.source);await page.evaluate(()=>window.__interactionDashboard.source.whenSettled());
 const canvas=page.locator('.plots section').first().locator('[aria-label="Plot canvas"]'),box=await canvas.boundingBox();
 await page.keyboard.down('Shift');await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.62,box.y+box.height*.67,{steps:8});
 const previewBox=await page.locator('.plots section').first().locator('.brush-region').boundingBox();
 await page.mouse.up();await page.keyboard.up('Shift');
 await expect.poll(()=>page.evaluate(()=>window.__interactionDashboard.source.getBrush().getConstraints().length)).toBe(2);
 const committedBox=await page.locator('.plots section').first().locator('.brush-region').boundingBox();
 for(const key of ['x','y','width','height'])expect(committedBox[key]).toBeCloseTo(previewBox[key],0);
 const controls=page.locator('.plots section').first().locator('[data-brush-controls]');
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await expect(controls).toBeVisible();
 await page.mouse.move(1,1);await expect(controls).toBeHidden();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await expect(controls).toBeVisible();
 const before=await page.evaluate(()=>({constraints:window.__interactionDashboard.source.getBrush().getConstraints().map(c=>c.bounds),viewport:window.__interactionDashboard.source.getViewport()}));
 // Outside the overlay, wheel remains camera navigation.
 await page.mouse.move(box.x+box.width*.85,box.y+box.height*.82);await page.mouse.wheel(0,-120);await page.waitForTimeout(80);
 const navigated=await page.evaluate(()=>({constraints:window.__interactionDashboard.source.getBrush().getConstraints().map(c=>c.bounds),viewport:window.__interactionDashboard.source.getViewport()}));
 expect(navigated.constraints).toEqual(before.constraints);expect(navigated.viewport.zoomX).not.toBe(before.viewport.zoomX);
 // Reprojected overlay owns the wheel. Plot-zoom-in direction enlarges it.
 const brush=page.locator('.plots section').first().locator('.brush-region'),brushBox=await brush.boundingBox();
 const beforeBrush=await page.evaluate(()=>({constraints:window.__interactionDashboard.source.getBrush().getConstraints().map(c=>c.bounds),viewport:window.__interactionDashboard.source.getViewport()}));
 await page.mouse.move(brushBox.x+brushBox.width/2,brushBox.y+brushBox.height/2);await page.mouse.wheel(0,-120);await page.waitForTimeout(30);
 const preview=await page.evaluate(()=>window.__interactionDashboard.source.getBrush().getConstraints().map(c=>c.bounds));
 for(let i=0;i<2;i++)expect(preview[i][1]-preview[i][0]).toBeGreaterThan(beforeBrush.constraints[i][1]-beforeBrush.constraints[i][0]);
 expect(await page.evaluate(()=>window.__interactionDashboard.source.getViewport())).toEqual(beforeBrush.viewport);
 await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>window.__interactionDashboard.source.getBrush().getConstraints().map(c=>c.bounds))).toEqual(beforeBrush.constraints);
 await controls.getByRole('button',{name:'Clear all'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__interactionDashboard.source.getBrush().getConstraints().length)).toBe(0);
 await expect(controls).toHaveCount(0);
});

// T5 guard for editing: dragging an EXISTING band (the root rectangle, then a strip band) for 120
// pointer moves issues at most one preview per animation frame.
async function countPreviews(page,brush,drag){
 await page.evaluate(brush=>{
  const resource=new Function(`return ${brush}`)(),set=resource.setConstraints.bind(resource);window.__previews=0;window.__frames=0;
  resource.setConstraints=(...args)=>{if(args[2]?.phase==='preview')window.__previews++;return set(...args);};
  const tick=()=>{window.__frames++;if(window.__counting)requestAnimationFrame(tick);};window.__counting=true;requestAnimationFrame(tick);
 },brush);
 await drag();
 return page.evaluate(()=>{window.__counting=false;return {previews:window.__previews,frames:window.__frames};});
}
test('dragging an existing band issues at most one preview per animation frame',async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-dashboard');await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__interactionDashboard?.source);await page.evaluate(()=>window.__interactionDashboard.source.whenSettled());
 const canvas=page.locator('.plots section').first().locator('[aria-label="Plot canvas"]'),box=await canvas.boundingBox();
 await page.keyboard.down('Shift');await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');
 await expect.poll(()=>page.evaluate(()=>window.__interactionDashboard.source.getBrush().getConstraints().length)).toBe(2);
 const before=await page.evaluate(()=>window.__interactionDashboard.source.getBrush().getConstraints().map(c=>c.bounds));
 const rect=await page.locator('.plots section').first().locator('.brush-region').boundingBox(),rx=rect.x+rect.width/2,ry=rect.y+rect.height/2;
 const root=await countPreviews(page,'window.__interactionDashboard.source.getBrush()',async()=>{
  await page.mouse.move(rx,ry);await page.mouse.down();
  for(let i=1;i<=120;i++)await page.mouse.move(rx+i*.4,ry+i*.25);
  await page.mouse.up();
 });
 expect(root.previews).toBeGreaterThan(0);expect(root.previews).toBeLessThanOrEqual(root.frames+2);
 await expect.poll(()=>page.evaluate(()=>window.__interactionDashboard.source.getBrush().getConstraints().map(c=>c.bounds))).not.toEqual(before);
 // An existing band on a child frame's strip.
 await page.goto('/test/frame-brush');
 await page.waitForFunction(()=>((m) => m?.view.marks.of(m))(window.frameBrush?.childPoints?.getMark())?.interaction);
 const geometry=await page.evaluate(async()=>{const plot=window.frameBrush.inset;await plot.whenSettled();
  const host=document.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect(),child=plot.getAxes()[1].getAxisLayout();
  return {left:host.left+child.left,top:host.top+child.top,height:child.bottom-child.top};});
 const x=geometry.left-8;
 await page.keyboard.down('Shift');await page.mouse.move(x,geometry.top+.2*geometry.height);await page.mouse.down();await page.mouse.move(x,geometry.top+.4*geometry.height,{steps:6});await page.mouse.up();await page.keyboard.up('Shift');
 await expect(page.locator('.brush-region.strip')).toHaveCount(1);
 const band=await page.locator('.brush-region.strip').boundingBox(),bx=band.x+band.width/2,by=band.y+band.height/2;
 const strip=await countPreviews(page,'((m) => m?.view.marks.of(m))(window.frameBrush.childPoints.getMark())?.interaction.brush',async()=>{
  await page.mouse.move(bx,by);await page.mouse.down();
  for(let i=1;i<=120;i++)await page.mouse.move(bx,by+i*.8);
  await page.mouse.up();
 });
 expect(strip.previews).toBeGreaterThan(0);expect(strip.previews).toBeLessThanOrEqual(strip.frames+2);
});

test('dashboard 4096-row warmed filtered-frame capability',{tag:'@gpu'},async({page})=>{
 await page.goto('/test/gallery-example?id=interaction-dashboard');await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.locator('label.controls select').selectOption('4096');
 await page.waitForFunction(()=>window.__interactionDashboard?.filteredMark?.getMark()?.count===4096);
 await page.evaluate(()=>Promise.all([window.__interactionDashboard.source.whenSettled(),window.__interactionDashboard.filteredPlot.whenSettled()]));
 const canvas=page.locator('.plots section').first().locator('[aria-label="Plot canvas"]'),b=await canvas.boundingBox(),interior=await plotInterior(page,canvas,'dashboard');
 await page.evaluate(()=>{
  const mark=window.__interactionDashboard.filteredMark.getMark(),brush=window.__interactionDashboard.source.getBrush(),set=brush.setConstraints.bind(brush);
  window.largeFilterStarts=[];window.largeFilterLatencies=[];window.largeFilterRun=true;const shown=((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count));let frame=mark.view.lifecycle.completedFrame,count=shown(mark);
  brush.setConstraints=(...args)=>{if(args[2]?.phase==='preview')window.largeFilterStarts.push(performance.now());return set(...args);};
  requestAnimationFrame(function sample(){const next=mark.view.lifecycle.completedFrame;if(next!==frame){frame=next;if(shown(mark)!==count&&window.largeFilterStarts.length){count=shown(mark);window.largeFilterLatencies.push(performance.now()-window.largeFilterStarts.at(-1));window.largeFilterStarts=[];}}if(window.largeFilterRun)requestAnimationFrame(sample);});
 });
 await page.keyboard.down('Shift');await page.mouse.move(interior.x+interior.width*.2,interior.y+interior.height*.2);await page.mouse.down();
 for(let i=0;i<20;i++){await page.mouse.move(b.x+b.width*(.35+i*.018),b.y+b.height*(.4+i*.012));await page.waitForTimeout(16);if(i===3)await page.evaluate(()=>window.largeFilterLatencies=[]);}
 await page.mouse.up();await page.keyboard.up('Shift');
 const latency=await page.evaluate(()=>{window.largeFilterRun=false;return window.largeFilterLatencies.sort((a,b)=>a-b);});
 console.log('dashboard 4096-row warmed pointer-to-filtered-frame (ms)',latency.map(Math.round));
 expect(latency.length).toBeGreaterThan(5);
 expect(latency[Math.ceil(latency.length*.95)-1]).toBeLessThan(250);
});

test('continuous transform sliders keep one in-flight and one latest update',async({page})=>{
 await page.goto('/examples/transform-slice');await page.locator('.live-example').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__transformExample?.slice);const slider=page.locator('.live-example').getByRole('slider',{name:'Time'});await expect(slider).toBeEnabled();
 // The Slice's completed runs: pending ends once the newest run publishes (a superseded run leaves it set).
 await page.evaluate(()=>{
  window.sliceRuns=0;let pending=false;window.stopSliderStatus=window.__transformExample.slice.subscribe(status=>{if(pending&&!status.pending)window.sliceRuns++;pending=status.pending;});
 });
 await slider.evaluate(element=>{for(let i=0;i<30;i++){element.value=String(i/29*5);element.dispatchEvent(new Event('input',{bubbles:true}));}});
 await expect(slider).toHaveValue('5');
 await expect.poll(()=>page.evaluate(()=>window.sliceRuns)).toBeGreaterThan(0);
 await page.evaluate(()=>window.__transformExample.plot.whenSettled());
 const runs=await page.evaluate(()=>{window.stopSliderStatus();return window.sliceRuns;});
 expect(runs).toBeLessThanOrEqual(4);
});
