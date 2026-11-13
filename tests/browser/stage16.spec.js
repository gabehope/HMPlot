import { test, expect } from './fixtures.js';
import { installGpuCounters, gpuCounters, countersDelta } from './gpu-counters.js';

const settleLabels = async page => {
  await page.waitForFunction(() => document.querySelector('.canvas') && [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
  await page.evaluate(() => window.labelBounds ? window.labelBounds.settle() : window.__examples.plot.whenSettled());
};

test('Tree layout updates refit automatic bounds, retain explicit domains, and filter nodes and edges by depth',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/test/tree-layouts');
  await page.waitForFunction(()=>window.treeLayouts&&document.querySelector('.canvas')?.getAttribute('aria-busy')==='false');
  const state=()=>page.evaluate(()=>window.treeLayouts.state());
  const set=values=>page.evaluate(values=>window.treeLayouts.set(values),values);
  const whole=await state();expect(whole.labels).toHaveLength(5);
  await set({root:1});const branch=await state();expect(branch.labels.map(t=>t.name)).toEqual(['Branch','Leaf A','Leaf B']);
  expect(branch.bounds.y[0]).toBeGreaterThan(whole.bounds.y[0]);
  await set({mode:'partition'});const partition=await state();expect(partition.bounds.x[1]).toBeGreaterThan(4.9);
  await set({weight:12});const wider=await state();expect(wider.bounds.x[1]).toBeGreaterThan(partition.bounds.x[1]+9);
  await set({orientation:'right'});const right=await state();expect(right.bounds.y[1]).toBeGreaterThan(wider.bounds.y[1]+9);
  await set({explicit:true,weight:2});expect((await state()).bounds).toEqual({x:[-10,10],y:[-10,10]});
  await set({explicit:false,root:0,cutoff:1,mode:'tidy',orientation:'down'});
  const trimmed=await state();expect(trimmed.labels.map(t=>t.name)).toEqual(['Root','Branch','Other']);
  expect(trimmed.frames).toBeGreaterThan(whole.frames);expect(trimmed.error).toBeFalsy();expect(errors).toEqual([]);
});
const labelPixels = page => page.evaluate(async () => {
  const plot = window.labelBounds?.plots.root ?? window.__examples.plot;
  const bitmap = await createImageBitmap(await plot.exportPNG()), canvas = new OffscreenCanvas(bitmap.width,bitmap.height), ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap,0,0);bitmap.close();const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>80&&data[i+2]>100&&data[i+1]<100&&data[i+3]>100)count++;
  return count;
});
const labelsInside = page => page.evaluate(async () => {
  const plot = window.labelBounds?.plots.root ?? window.__examples.plot;
  const source = await (await plot.exportSVG()).blob.text(), host=document.createElement('div');
  host.style.cssText='position:absolute;left:-10000px;top:0';host.innerHTML=source;document.body.append(host);
  const svg=host.querySelector('svg'), labels=[...svg.querySelectorAll('text')].filter(t=>/^(Wide |Input$|Solo$|Parse$|Validate$|Render$|Archive$)/.test(t.textContent));
  const result=labels.map(text=>{
    let group=text.parentElement;while(group&&!group.hasAttribute('clip-path'))group=group.parentElement;
    const id=group?.getAttribute('clip-path')?.match(/#([^)]*)/)?.[1], polygon=id?svg.querySelector(`[id="${id}"] polygon`):null;
    const points=polygon?.getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number));
    const box=text.getBBox();return {text:text.textContent,box:[box.x,box.y,box.x+box.width,box.y+box.height],
      rect:points?[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]:null};
  });host.remove();return result;
});
const expectLabelsInside = async (page,count) => {
  const labels=await labelsInside(page);expect(labels).toHaveLength(count);
  for(const label of labels){expect(label.rect,label.text).not.toBeNull();
    expect(label.box[0],JSON.stringify(label)).toBeGreaterThanOrEqual(label.rect[0]-0.5);
    expect(label.box[1],JSON.stringify(label)).toBeGreaterThanOrEqual(label.rect[1]-0.5);
    expect(label.box[2],JSON.stringify(label)).toBeLessThanOrEqual(label.rect[2]+0.5);
    expect(label.box[3],JSON.stringify(label)).toBeLessThanOrEqual(label.rect[3]+0.5);}
};

test.describe('automatic label bounds',()=>{
  test.use({deviceScaleFactor:2});
  test('Layered DAG keeps its top labels inside the exported axes',async({page})=>{
    await page.goto('/examples/layered-dag');await settleLabels(page);
    await expectLabelsInside(page,6);
  });
  test('label sizes, offsets, alignment and boxes fit after resize without disabling masks',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/test/label-bounds');await settleLabels(page);
    for(const values of [{},{width:380,height:260,size:18,align:'left',dx:18,dy:16,box:true},
      {width:600,height:420,size:32,align:'right',dx:-22,dy:-36,box:false}]){
      await page.evaluate(v=>window.labelBounds.set({...v,masked:true}),values);await settleLabels(page);
      await expectLabelsInside(page,2);const masked=await labelPixels(page);expect(masked).toBeGreaterThan(400);
      await page.evaluate(()=>window.labelBounds.set({masked:false}));await settleLabels(page);
      expect(await labelPixels(page)).toBe(masked);
    }
    expect(errors).toEqual([]);
  });
  test('inverted/log axes, nested Frames and facet cells fit their labels',async({page})=>{
    for(const scene of ['root','nested','facet','placed']){
      await page.goto(`/test/label-bounds?case=${scene}`);await settleLabels(page);
      await page.evaluate(()=>window.labelBounds.set({width:700,height:450,size:16,inverted:true,transform:'log',dy:22}));await settleLabels(page);
      await expectLabelsInside(page,scene==='facet'?4:2);
      const masked=await labelPixels(page);expect(masked).toBeGreaterThan(200);
      await page.evaluate(()=>window.labelBounds.set({masked:false}));await settleLabels(page);
      expect(await labelPixels(page)).toBe(masked);
    }
  });
  test('explicit domains clip labels; returning to auto and withdrawing Text restores fitting',async({page})=>{
    await page.goto('/test/label-bounds');await settleLabels(page);
    const domain=()=>page.evaluate(()=>window.labelBounds.plots.root.getFrames()[0].getFrameOptions().get('xbounds'));
    const auto=await domain();
    await page.evaluate(()=>window.labelBounds.plots.root.setViewport({x:0.5,y:0.5,zoom:2}));await settleLabels(page);
    expect(await domain()).toEqual(auto);await page.evaluate(()=>window.labelBounds.plots.root.fit());await settleLabels(page);
    expect(await domain()).toEqual(auto);
    await page.evaluate(()=>window.labelBounds.set({explicit:true}));await settleLabels(page);
    expect(await domain()).toEqual([1,100]);const clipped=await labelPixels(page);
    await page.evaluate(()=>window.labelBounds.set({masked:false}));await settleLabels(page);
    expect(await labelPixels(page)).toBeGreaterThan(clipped);
    await page.evaluate(()=>window.labelBounds.set({explicit:false,masked:true}));await settleLabels(page);
    expect(await domain()).toEqual(auto);await expectLabelsInside(page,2);
    await page.evaluate(()=>window.labelBounds.set({labels:false}));await settleLabels(page);
    const points=await domain();expect(points[0]).toBeCloseTo(1-99*.04,4);expect(points[1]).toBeCloseTo(100+99*.04,4);
  });
  test('resize and inspector alignment reuse cached bounds without shaders or readbacks',async({page})=>{
    await page.addInitScript(installGpuCounters);await page.goto('/test/label-bounds?case=cache');await settleLabels(page);
    const before=await gpuCounters(page);
    const frames=()=>page.evaluate(()=>window.labelBounds.marks.text.getMark().view.lifecycle.completedFrame), start=await frames();
    for(const [width,align] of [[520,'left'],[580,'right'],[480,'center']]){
      await page.evaluate(([width,align])=>{window.labelBounds.set({width});window.labelBounds.marks.text.getMark().options.set('align',align);},[width,align]);
      await settleLabels(page);
    }
    const work=await countersDelta(page,before,await gpuCounters(page));expect(work.render,JSON.stringify(work)).toBe(0);expect(work.readbacks,JSON.stringify(work)).toBe(0);
    expect((await frames())-start).toBeGreaterThanOrEqual(3);
    await expectLabelsInside(page,2);
  });
});

test('Stage 16 gallery examples render without graph errors', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  for (const id of ['positioned-graph','tree-icicle','tree-sunburst','layered-dag','sankey-flow','packed-hierarchy','treemap-hierarchy']) {
    await page.goto(`/examples/${id}`);
    await expect(page.locator('.live-example canvas').first()).toBeVisible({timeout:30000});
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].length > 0 &&
      [...document.querySelectorAll('.canvas')].every(element => element.getAttribute('aria-busy') === 'false'),
      undefined, {timeout:30000});
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await expect(page.getByRole('region',{name:'Example source'})).toContainText('<');
    const svg=await page.evaluate(async()=>{
      await window.__examples.plot.whenSettled();
      return (await window.__examples.plot.exportSVG({mode:'auto'})).blob.text();
    });
    expect(svg.length).toBeGreaterThan(500);
  }
  expect(errors).toEqual([]);
});

test('Clustered heatmap: the dendrograms\' leaves line up with the heatmap\'s rows and columns', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/clustermap');
  await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].length > 0 &&
    [...document.querySelectorAll('.canvas')].every(element => element.getAttribute('aria-busy') === 'false'),
    undefined, {timeout:30000});
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  const svg=await page.evaluate(async()=>{
    await window.__examples.plot.whenSettled();
    return (await window.__examples.plot.exportSVG({mode:'auto'})).blob.text();
  });
  // Labels come from each Tree's `order` column; the elbows are vector paths (the row tree's go
  // vertical first, the column tree's horizontal first); the Rect cells are vector too, each filled
  // with its value's color (TODO 70.1).
  const labels=Object.fromEntries([...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([SG]\d+)<\/text>/g)].map(m=>[m[3],[+m[1],+m[2]]]));
  const paths=[...svg.matchAll(/<path d="M([^"]+)" fill="none"/g)].map(m=>m[1].split(' L').map(p=>p.trim().split(/\s+/).map(Number)));
  const rowPaths=paths.filter(p=>Math.abs(p[0][0]-p[1][0])<1e-3),columnPaths=paths.filter(p=>Math.abs(p[0][1]-p[1][1])<1e-3);
  expect([rowPaths.length,columnPaths.length]).toEqual([22,14]);
  const rowEnd=Math.max(...rowPaths.map(p=>p.at(-1)[0])),columnEnd=Math.max(...columnPaths.map(p=>p.at(-1)[1]));
  const rowLeaves=rowPaths.map(p=>p.at(-1)).filter(p=>Math.abs(p[0]-rowEnd)<0.5).map(p=>p[1]).sort((a,b)=>b-a);
  const columnLeaves=columnPaths.map(p=>p.at(-1)).filter(p=>Math.abs(p[1]-columnEnd)<0.5).map(p=>p[0]).sort((a,b)=>a-b);
  // Bottom to top and left to right: scipy's leaves_list order (python/examples/71_clustermap.py).
  const samples=['S5','S3','S9','S12','S8','S10','S1','S4','S11','S6','S2','S7'],genes=['G4','G7','G1','G3','G2','G6','G5','G8'];
  expect(rowLeaves).toHaveLength(12);expect(columnLeaves).toHaveLength(8);
  samples.forEach((name,k)=>expect(Math.abs(labels[name][1]-rowLeaves[k]),name).toBeLessThan(0.5));
  genes.forEach((name,k)=>expect(Math.abs(labels[name][0]-columnLeaves[k]),name).toBeLessThan(0.5));
  // Each labeled cell shows its own sample and gene: blue for high values, red for low.
  const cells=[...svg.matchAll(/<path d="M([^"]+) Z" fill="(#[0-9a-f]{6})"/g)].map(m=>{
    const p=m[1].split(' L').map(q=>q.trim().split(/\s+/).map(Number)),xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);
    return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys),rgb:[1,3,5].map(k=>parseInt(m[2].slice(k,k+2),16))};});
  expect(cells).toHaveLength(96);
  const cell=(x,y)=>cells.find(c=>x>=c.x0&&x<=c.x1&&y>=c.y0&&y<=c.y1);
  const pattern=[[2,-1],[-1.2,1.6],[0.4,-0.2]],sampleGroup=[0,2,1,0,1,2,2,0,1,0,2,1],geneGroup=[1,0,1,1,0,0,1,0];
  let checked=0;
  for(const sample of samples)for(const gene of genes){
    const i=+sample.slice(1)-1,j=+gene.slice(1)-1,value=pattern[sampleGroup[i]][geneGroup[j]]+0.35*Math.sin(3.1*i+1.7*j+i*j);
    if(Math.abs(value)<0.8)continue;
    const [r,,b]=cell(labels[gene][0],labels[sample][1]).rgb;
    expect(value>0?b-r:r-b,`${sample} ${gene} ${value}`).toBeGreaterThan(40);checked++;
  }
  expect(checked).toBeGreaterThan(50);
  // Rows and columns are centered on the leaves: the block edges fall halfway between them.
  const edge=(a,b,low,high)=>Math.abs(a[low]-b[high])<Math.abs(a[high]-b[low])?(a[low]+b[high])/2:(a[high]+b[low])/2;
  expect(Math.abs(edge(cell(labels.G4[0],labels.S12[1]),cell(labels.G4[0],labels.S8[1]),'y0','y1')-(labels.S12[1]+labels.S8[1])/2)).toBeLessThan(1);
  expect(Math.abs(edge(cell(labels.G3[0],labels.S5[1]),cell(labels.G2[0],labels.S5[1]),'x0','x1')-(labels.G3[0]+labels.G2[0])/2)).toBeLessThan(1);
  expect(errors).toEqual([]);
});
