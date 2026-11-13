import { test, expect } from "./fixtures.js";
import { installGpuCounters, installGpuErrors } from "./gpu-counters.js";

test.use({ deviceScaleFactor: 2 });
test.afterEach(async ({page}) => { expect(await page.evaluate(() => window.__gpuErrors ?? [])).toEqual([]); });

async function open(page, channels = false) {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if(m.type()==="error") errors.push(m.text()); });
  await page.addInitScript(installGpuErrors);
  await page.goto("/test/outlines" + (channels ? "?channels" : ""));
  await expect(page.locator('.canvas[aria-busy="false"]')).toHaveCount(channels ? 14 : 8, {timeout:30000});
  await page.evaluate(() => Promise.all(Object.values(window.outlines.plots).map(p => p.whenSettled())));
  return errors;
}

async function pixels(page, key, vector = false) {
  return page.evaluate(async ({key, vector}) => {
    const plot = window.outlines.plots[key];
    await plot.whenSettled();
    const blob = vector ? (await plot.exportSVG()).blob : await plot.exportPNG();
    const url = URL.createObjectURL(blob), img = new Image(); img.src = url; await img.decode();
    const scale = vector ? devicePixelRatio : 1;
    const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth * scale; canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext("2d"); ctx.drawImage(img,0,0,canvas.width,canvas.height); URL.revokeObjectURL(url);
    const {data} = ctx.getImageData(0,0,canvas.width,canvas.height);
    let red = 0, left = 0, right = 0, gray = 0, colored = 0;
    const bounds = [Infinity,Infinity,-Infinity,-Infinity];
    for (let p=0;p<data.length;p+=4) {
      if (Math.max(...data.slice(p,p+3))-Math.min(...data.slice(p,p+3))>25) colored++;
      if (data[p] > 140 && data[p+1] < 80 && data[p+2] < 80) {
        red++; if (p/4%canvas.width < canvas.width/2) {
          left++;
          const x = p/4%canvas.width, y = Math.floor(p/4/canvas.width);
          bounds[0]=Math.min(bounds[0],x); bounds[1]=Math.min(bounds[1],y);
          bounds[2]=Math.max(bounds[2],x); bounds[3]=Math.max(bounds[3],y);
        } else right++;
      }
      if (data[p] > 185 && data[p] < 225 && Math.abs(data[p]-data[p+1]) < 5) gray++;
    }
    return {red: red/(canvas.width*canvas.height), colored:colored/(canvas.width*canvas.height), left, right, gray, bounds, width:canvas.width, height:canvas.height};
  }, {key,vector});
}

test("filled marks draw borders, with no polygon diagonal or band interval joins; SVG retains them", async ({page}) => {
  const errors = await open(page);
  for (const key of ["rect","polygon","area","ribbon","polar","geo"]) {
    const raster = await pixels(page,key), vector = await pixels(page,key,true);
    expect(raster.red,key).toBeGreaterThan(0.002);
    expect(raster.gray,key).toBeGreaterThan(1000);
    expect(vector.red/raster.red,key).toBeGreaterThan(0.65);
    expect(vector.red/raster.red,key).toBeLessThan(1.35);
  }
  // Triangulation has no diagonal border; the square retains the same border area as Rect.
  expect((await pixels(page,"polygon")).red/(await pixels(page,"rect")).red).toBeCloseTo(0.5,1);
  expect((await pixels(page,"area")).red).toBeCloseTo((await pixels(page,"ribbon")).red,3);
  expect(errors).toEqual([]);
});

test("numeric outline opacity affects only borders and row expressions work on filled marks and symbols", async ({page}) => {
  const errors = await open(page);
  for (const key of ["rows","points"]) {
    const result = await pixels(page,key);
    expect(result.left,key).toBeGreaterThan(250);
    expect(result.right,key).toBe(0);
    expect((await pixels(page,key,true)).right,key+" SVG").toBe(0);
  }
  const before = await pixels(page,"rect");
  const geoBefore = await pixels(page,"geo");
  await page.evaluate(() => window.outlines.set(0));
  await expect.poll(async () => (await pixels(page,"rect")).red).toBe(0);
  expect((await pixels(page,"rect")).gray).toBeGreaterThan(before.gray);
  await page.evaluate(() => window.outlines.set(0.5));
  expect((await pixels(page,"rect")).red).toBe(0);
  expect((await pixels(page,"geo")).red,"GeoJSON stroke alpha also fades without MSAA").toBeLessThan(geoBefore.red*0.1);
  // A half-opacity border mixes over its fill in the GPU's linear RGB space.
  // Compare fully covered pixels, avoiding renderer-specific edge antialiasing.
  const colors = await page.evaluate(async () => {
    const result = [];
    for (const [key, x] of [["rect",52],["points",71]]) {
      const plot = window.outlines.plots[key]; await plot.whenSettled();
      const pair = [];
      for (const blob of [await plot.exportPNG(), (await plot.exportSVG()).blob]) {
        const url = URL.createObjectURL(blob), img = new Image(); img.src = url; await img.decode();
        const canvas = document.createElement("canvas"); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
        const ctx=canvas.getContext("2d"); ctx.drawImage(img,0,0); URL.revokeObjectURL(url);
        pair.push([...ctx.getImageData(Math.round(x*canvas.width/400),Math.round(120*canvas.height/240),1,1).data]);
      }
      result.push({key,pair});
    }
    return result;
  });
  for (const {key,pair:[raster,vector]} of colors) {
    expect(raster[0],key).toBeGreaterThan(raster[1]+40);
    for (let c=0;c<4;c++) expect(Math.abs(raster[c]-vector[c]),key+" channel "+c).toBeLessThan(3);
  }
  await page.evaluate(() => window.outlines.set(1));
  expect((await pixels(page,"rect")).red).toBeCloseTo(before.red,3);
  expect(errors).toEqual([]);
});

test("literal border edits reuse pipelines and complete frames without readback; disposal releases buffers", async ({page}) => {
  await page.addInitScript(installGpuCounters);
  const errors = await open(page);
  const before = await page.evaluate(() => window.__gpuCounters.snapshot());
  await page.evaluate(async () => {
    for (let i=0;i<6;i++) {
      // Inside borders blend over their fill without changing material transparency.
      // GeoJSON uses separate boundary strokes, whose alpha changes its blend mode.
      window.outlines.set(i%2?1:0.4,i%2?4:6,1,1);
      await new Promise(requestAnimationFrame);
      await Promise.all(Object.values(window.outlines.plots).map(p=>p.whenSettled()));
    }
  });
  const after = await page.evaluate(() => window.__gpuCounters.snapshot());
  expect(after.render-before.render).toBe(0);
  expect(after.readbacks-before.readbacks).toBe(0);
  expect(after.submits-before.submits).toBeGreaterThan(5);
  await page.evaluate(() => window.outlines.remove());
  await expect(page.locator(".canvas")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__gpuCounters.snapshot().liveBytes)).toBeLessThan(after.liveBytes);
  expect(errors).toEqual([]);
});

test("hollow point opacity fades its border once without mixing with an invisible fill", async ({page}) => {
  const errors = await open(page);
  await page.evaluate(() => { window.outlines.hollow(); window.outlines.set(0.5); });
  const colors = await page.evaluate(async () => {
    const plot = window.outlines.plots.points; await plot.whenSettled();
    const result = [];
    for (const blob of [await plot.exportPNG(), (await plot.exportSVG()).blob]) {
      const url = URL.createObjectURL(blob), img = new Image(); img.src=url; await img.decode();
      const canvas = document.createElement("canvas"); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
      const ctx=canvas.getContext("2d"); ctx.drawImage(img,0,0); URL.revokeObjectURL(url);
      const at = x => [...ctx.getImageData(Math.round(x*canvas.width/400),Math.round(120*canvas.height/240),1,1).data];
      result.push({border:at(71),interior:at(100)});
    }
    return result;
  });
  for (const result of colors) {
    expect(result.interior).toEqual([255,255,255,255]);
    expect(result.border[0]).toBeGreaterThan(235);
    expect(result.border[1]).toBeGreaterThan(115);
    expect(result.border[1]).toBeLessThan(140);
  }
  for (let c=0;c<4;c++) expect(Math.abs(colors[0].border[c]-colors[1].border[c])).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test("numeric contour and sector fills render with per-row outline channels within GPU shader limits", async ({page}) => {
  const errors = await open(page, true);
  for (const key of ["numericPolygon", "numericPolar", "contours", "numericBand", "numericPoints"]) {
    const raster = await pixels(page,key), vector = await pixels(page,key,true);
    expect(raster.red,key).toBeGreaterThan(0.002);
    expect(vector.red/raster.red,key).toBeGreaterThan(0.6);
    expect(vector.red/raster.red,key).toBeLessThan(1.4);
  }
  const box = await pixels(page,"numericBox");
  expect(box.colored,"lit extruded Rects still render with the same numeric channels").toBeGreaterThan(0.02);
  expect(box.red,"extruded Rects have no flat footprint outline").toBe(0);
  expect(errors).toEqual([]);
});

test("borders keep their hit targets and compose border/mark opacity in SVG and PDF", async ({page}) => {
  const errors = await open(page);
  const raster = await pixels(page,"rect"), box = await page.locator('.canvas').first().boundingBox();
  const [left,top,right,bottom] = raster.bounds;
  const click = (x,y)=>page.mouse.click(box.x+x/raster.width*box.width,box.y+y/raster.height*box.height);
  await click(left+2,(top+bottom)/2);
  await expect.poll(()=>page.evaluate(()=>window.outlines.hits.length)).toBe(1);
  await page.evaluate(()=>window.outlines.set(0,12));
  await page.evaluate(()=>window.outlines.plots.rect.whenSettled());
  await click((left+right)/2,(top+bottom)/2);
  await expect.poll(()=>page.evaluate(()=>window.outlines.hits.length)).toBe(2);
  await click(left-20,(top+bottom)/2);
  expect(await page.evaluate(()=>window.outlines.hits)).toEqual([0,0]);
  await page.evaluate(()=>window.outlines.set(0.5,4,0.5));
  const output = await page.evaluate(async()=>{
    const plot=window.outlines.plots.rect; await plot.whenSettled();
    const svg=await plot.exportSVG({mode:"vector"}), pdf=await plot.exportPDF({mode:"vector"});
    const dom=new DOMParser().parseFromString(await svg.blob.text(),"image/svg+xml");
    return {groups:[...dom.querySelectorAll('g[opacity]')].map(g=>g.getAttribute('opacity')),
      alpha:[...dom.querySelectorAll('path[stroke-opacity]')].map(p=>p.getAttribute('stroke-opacity')),
      signature:new TextDecoder().decode((await pdf.blob.arrayBuffer()).slice(0,4)),
      svgCount:svg.report.vectorPrimitives,pdfCount:pdf.report.vectorPrimitives};
  });
  expect(output.groups).toContain("0.5"); expect(output.alpha).toEqual(["1","1"]);
  expect(output.signature).toBe("%PDF"); expect(output.pdfCount).toBe(output.svgCount);
  expect(errors).toEqual([]);
});

test("outline opacity animates through completed frames and retains the filled interior",async({page})=>{
  const errors=await open(page);
  await page.evaluate(async()=>{window.outlines.animate();await new Promise(requestAnimationFrame);await window.outlines.plots.rect.whenSettled();});
  const before=await page.evaluate(()=>window.outlines.plots.rect.getDiagnostics().completedFrame);
  await page.evaluate(()=>window.outlines.set(0));
  await expect.poll(()=>page.evaluate(()=>window.outlines.plots.rect.getDiagnostics().animation.active)).toBeGreaterThan(0);
  await page.evaluate(()=>window.outlines.plots.rect.whenAnimationsFinished());
  const result=await pixels(page,"rect");
  expect(result.red).toBe(0); expect(result.gray).toBeGreaterThan(1000);
  expect(await page.evaluate(()=>window.outlines.plots.rect.getDiagnostics().completedFrame)).toBeGreaterThan(before+5);
  expect(errors).toEqual([]);
});
