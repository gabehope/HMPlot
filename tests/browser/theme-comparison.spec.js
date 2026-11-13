import { test, expect } from "./fixtures.js";
const errors = new WeakMap();
test.beforeEach(({page})=>{ const messages=[]; errors.set(page,messages); page.on('pageerror',error=>messages.push(error.message)); });
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
const ready = async page => {
  await page.waitForFunction(() => window.themeComparison && Object.keys(window.themeComparison.plots).length===2 && [...document.querySelectorAll('.canvas')].every(c=>c.getAttribute('aria-busy')==='false'));
  await page.evaluate(async()=>Promise.all(Object.values(window.themeComparison.plots).map(p=>p.whenSettled())));
};
const set = async(page,values) => { await page.evaluate(v=>window.themeComparison.set(v),values); await ready(page); };

test("neutral presets vary title hierarchy and guides with the same palette and preserve all observations", async({page},info)=>{
  await page.goto('/test/theme-comparison'); await ready(page);
  const expected={paper:[22,'center','bottom'],journal:[18,'center','right'],presentation:[32,'left','top'],notebook:[16,'left','top'],minimal:[20,'left','bottom'],ink:[20,'left','right'],bureau:[24,'left','top'],observable:[18,'left','bottom']};
  for(const [name,[size,align,position]] of Object.entries(expected)) {
    await set(page,{left:name});
    const panel=page.locator('[data-panel="0"]');
    await expect(panel.locator('.plot-title')).toHaveCSS('font-size',`${size}px`);
    await expect(panel.locator('.plot-title')).toHaveCSS('text-align',align);
    await expect(panel.locator('[data-guide-position]')).toHaveAttribute('data-guide-position',position);
    await expect(panel.locator('[data-guide-position] button svg circle')).toHaveCount(3);
    const svg=await page.evaluate(()=>window.themeComparison.svg());
    expect((svg.match(/<circle\b/g)||[]).length).toBeGreaterThanOrEqual(36);
    expect(svg).toContain('Measurements across regions');
  }
  await set(page,{left:'paper',right:'presentation'});
  await page.locator('main').screenshot({path:info.outputPath('neutral-comparison.png')});
});

test("point partials compose on dark and light plots; explicit props and encoded bubble sizes win", async({page})=>{
  await page.goto('/test/theme-comparison'); await ready(page);
  await set(page,{scene:'sparse-points',left:'paper',right:'dark',partial:'marks/points-open'});
  const open=await page.evaluate(async()=>Promise.all([0,1].map(i=>window.themeComparison.svg(i))));
  for(const svg of open) {
    expect(svg).toContain('circle');
    expect(svg).toMatch(/fill="none"|fill="transparent"|fill-opacity="0"/);
    expect(svg).toContain('#64748b');
  }
  await set(page,{explicit:true});
  const explicit=await page.evaluate(()=>window.themeComparison.svg());
  expect(explicit).toContain('#c0262e');
  await set(page,{scene:'bubbles',explicit:false,partial:'marks/points-dense'});
  const radii=await page.evaluate(async()=>{
    const svg=new DOMParser().parseFromString(await window.themeComparison.svg(),'image/svg+xml');
    return [...new Set([...svg.querySelectorAll('circle')].map(c=>c.getAttribute('r')))];
  });
  expect(radii.length).toBeGreaterThanOrEqual(3);
});

test("all chart recipes draw at narrow width with readable matrix labels and a single colorbar", async({page},info)=>{
  await page.setViewportSize({width:420,height:1800});
  await page.goto('/test/theme-comparison'); await ready(page);
  for(const scene of ['line-interval-rule','grouped-bars','histogram-rule','dense-dates','long-legend','matrix-colorbar','callouts','controls']) {
    await set(page,{scene,left:'notebook',right:'presentation',partial:''});
    await expect(page.getByRole('alert')).toHaveCount(0);
    const svg=await page.evaluate(()=>window.themeComparison.svg());
    expect(svg.length).toBeGreaterThan(1000);
    expect(svg).toContain('Measurements across regions');
    if(scene==='matrix-colorbar') {
      await expect(page.locator('[data-panel="0"] .colorbar')).toHaveCount(1);
      const colors=await page.evaluate(async()=>{
        const doc=new DOMParser().parseFromString(await window.themeComparison.svg(),'image/svg+xml');
        return [...doc.querySelectorAll('text')].filter(t=>['-0.8','1','1.0'].includes(t.textContent)).map(t=>t.getAttribute('fill'));
      });
      expect(colors).toContain('#ffffff'); expect(colors).toContain('#000000');
      await page.locator('[data-panel="0"]').screenshot({path:info.outputPath('matrix-contrast.png')});
    }
    if(scene==='callouts') expect(svg).toContain('A readable note');
    if(scene==='controls') {
      await expect(page.locator('[data-panel="0"] .hm-playback')).toHaveCSS('font-size','12px');
      await expect(page.locator('[data-panel="1"] .hm-playback')).toHaveCSS('font-size','18px');
    }
    const fits=await page.locator('[data-panel="0"] section.plot').evaluate(e=>e.getBoundingClientRect().width<=e.parentElement.getBoundingClientRect().width+1);
    expect(fits).toBe(true);
  }
  await set(page,{scene:'long-legend',left:'paper',right:'notebook'});
  const clipped=await page.locator('[data-panel="0"] section.plot').evaluate(plot=>{
    const box=plot.getBoundingClientRect();
    return [...plot.querySelectorAll('.plot-title,.plot-subtitle,.plot-caption,[data-guide-position] button span,svg.axes text')].filter(e=>{
      const r=e.getBoundingClientRect();
      return r.width>0 && (r.left<box.left-1 || r.right>box.right+1 || r.top<box.top-1 || r.bottom>box.bottom+1);
    }).map(e=>e.textContent);
  });
  expect(clipped).toEqual([]);
  await page.locator('main').screenshot({path:info.outputPath('narrow-long-legend.png')});
});

test("the Bar opacity partial mutes bars without changing Histogram bins", async({page})=>{
  await page.goto('/test/theme-comparison'); await ready(page);
  const solidPixels=()=>page.evaluate(async()=>{
    const bitmap=await createImageBitmap(await window.themeComparison.plots[0].exportPNG());
    const canvas=Object.assign(document.createElement('canvas'),{width:bitmap.width,height:bitmap.height});
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;
    for(let i=0;i<data.length;i+=4) if(Math.abs(data[i]-65)<7 && Math.abs(data[i+1]-103)<7 && Math.abs(data[i+2]-136)<7) count++;
    return count;
  });
  await set(page,{scene:'grouped-bars',left:'paper',partial:''}); const plain=await solidPixels();
  await set(page,{partial:'marks/bars-muted'});
  expect(plain).toBeGreaterThan(100);
  expect(await solidPixels()).toBeLessThan(plain*.75);
  await set(page,{scene:'histogram-rule',partial:''}); const histogram=await solidPixels();
  await set(page,{partial:'marks/bars-muted'});
  expect(await solidPixels()).toBe(histogram);
});
