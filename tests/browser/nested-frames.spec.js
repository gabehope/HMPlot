import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

test.describe("animated frame scales", () => {
  test.use({ deviceScaleFactor: 2 });
  test("numeric domains and parent ranges share the displayed mapping through interruptions and exports", async ({ page }) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(installGpuCounters);
    await page.goto("/test/frame-animation");
    await page.waitForFunction(() => window.frameAnimation?.inherited);
    await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
    const read = time => page.evaluate(async time => {
      const f = window.frameAnimation;
      await f.plot.setAnimationTime(time); await f.plot.whenSettled();
      const result = await f.plot.exportSVG({ mode: "vector" });
      const doc = new DOMParser().parseFromString(await result.blob.text(), "image/svg+xml");
      const circle = doc.querySelector('circle[fill="#2358ca"]');
      const point = [+circle.getAttribute("cx"), +circle.getAttribute("cy")];
      const bitmap = await createImageBitmap(await f.plot.exportPNG());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixel = [...ctx.getImageData(Math.round(point[0] * canvas.width / 600), Math.round(point[1] * canvas.height / 420), 1, 1).data];
      let authored;
      const stop = f.frame.subscribeSettings(value => authored = value); stop();
      return { point, pixel, x: f.frame.getFrameOptions().get("xbounds"),
        y: f.frame.getFrameOptions().get("ybounds"), inherited: f.inherited.getFrameOptions().get("ybounds"),
        range: f.frame.getFrameOptions().get("_frameXRange"), authored, error: f.plot.getRenderError(),
        markAnimation: f.points.getMark().options.get("animation"),
        markDuration: f.points.getMark().options.get("animationDuration") };
    }, time);
    const before = await read(1000);
    expect(before.markAnimation).toBe(false);
    expect(before.markDuration).toBe(300);
    await page.evaluate(() => frameAnimation.change({ maximum: 10000, range: [60, 90], yMaximum: 20 }));
    await page.evaluate(() => frameAnimation.plot.whenSettled());
    expect((await read(1000)).point).toEqual(before.point);
    const warm = await gpuCounters(page);
    await page.evaluate(async () => { await frameAnimation.plot.setAnimationTime(1350); await frameAnimation.plot.whenSettled(); });
    const work = await countersDelta(page, warm, await gpuCounters(page));
    expect(work.shaders).toBe(0);
    expect(work.readbacks).toBe(0);
    const middle = await read(1350);
    expect(middle.x).toEqual([1, 5050]);
    expect(middle.y).toEqual([0, 15]);
    expect(middle.inherited).toEqual(middle.y);
    expect(middle.range).toEqual([35, 65]);
    // Settings are the viewer's edits (TODO 136.7): an authored animation's values, its target or
    // an intermediate one, are not.
    expect(middle.authored).toEqual({});
    expect(middle.point).not.toEqual(before.point);
    expect(middle.pixel).toEqual(before.pixel);
    expect(middle.pixel[2]).toBeGreaterThan(middle.pixel[0] * 3);
    await page.evaluate(() => frameAnimation.change({ maximum: 1000, range: [20, 50], yMaximum: 30 }));
    await page.evaluate(() => frameAnimation.plot.whenSettled());
    expect((await read(1350)).point).toEqual(middle.point);
    const end = await read(2050);
    expect(end.x).toEqual([1, 1000]);
    expect(end.y).toEqual([0, 30]);
    expect(end.range).toEqual([20, 50]);
    // Picking uses the same intermediate/final frame that the vector and PNG exporters use.
    const box = await page.locator(".canvas canvas").boundingBox();
    const picked = await page.evaluate(async ([x, y]) => {
      const mark = frameAnimation.points.getMark();
      const hit = await mark.view.picking.context.current.pickAt(x, y);
      return { same: hit?.object === mark, row: hit?.instanceId };
    }, [box.x + end.point[0], box.y + end.point[1]]);
    expect(picked).toEqual({ same: true, row: 0 });
    const pdf = await page.evaluate(async () => (await frameAnimation.plot.exportPDF({ mode: "vector" })).blob.size);
    expect(pdf).toBeGreaterThan(1000);
    await page.evaluate(async () => { frameAnimation.enable(false); frameAnimation.change({ yMaximum: 10 }); await frameAnimation.plot.whenSettled(); });
    expect((await read(2050)).y).toEqual([0, 10]);
    await page.evaluate(async () => { frameAnimation.enable(true); await frameAnimation.plot.setAnimationTime(null); frameAnimation.change({ yMaximum: 20 }); await frameAnimation.plot.whenSettled(); });
    const frames = await page.evaluate(async () => {
      const f = frameAnimation, before = f.plot.getDiagnostics().completedFrame;
      await f.plot.whenAnimationsFinished();
      return f.plot.getDiagnostics().completedFrame - before;
    });
    expect(frames).toBeGreaterThan(2);
    await page.evaluate(() => frameAnimation.show(false));
    await expect.poll(() => page.evaluate(() => frameAnimation.plot.getFrames().length)).toBe(1);
    expect(errors).toEqual([]);
  });
});

test("nested scales inherit parent updates and local axes follow placed extents", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/test/nested-frames");
  await page.waitForFunction(() => window.nestedFrames?.inset?.getAxisLayout());
  const read = () => page.evaluate(async () => {
    const { plot, inner, inset } = window.nestedFrames;
    await plot.whenSettled();
    const root = plot.getAxes()[0].getAxisLayout();
    const layout = inset.getAxisLayout();
    const overlay = [...document.querySelectorAll('svg[aria-label="2D coordinate axes"]')].at(-1);
    const baseline = overlay.querySelector("path.axis-lines");
    const start = baseline.getPointAtLength(0);
    const end = baseline.getPointAtLength(baseline.getTotalLength());
    const drawn = { left: start.x, right: end.x,
      ticks: [...overlay.querySelectorAll(".x-tick")].map(t => ({
        x: t.transform.baseVal.consolidate().matrix.e,
        value: Number(t.dataset.value),
      })) };
    return { drawn, error: plot.getRenderError(), count: plot.getFrames().length,
      inherited: inner.getFrameOptions().get("xbounds"),
      local: inner.getFrameOptions().get("ybounds"),
      root, layout, canvases: document.querySelectorAll("canvas").length };
  });
  const expectDrawnExtent = (state) => {
    expect(state.drawn.left).toBeCloseTo(state.layout.left, 3);
    expect(state.drawn.right).toBeCloseTo(state.layout.right, 3);
    for (const tick of state.drawn.ticks) {
      expect(tick.x).toBeGreaterThanOrEqual(state.layout.left - .01);
      expect(tick.x).toBeLessThanOrEqual(state.layout.right + .01);
      expect(tick.value).toBeGreaterThanOrEqual(0);
      expect(tick.value).toBeLessThanOrEqual(100);
    }
  };
  const before = await read();
  expectDrawnExtent(before);
  expect(before.error).toBe("");
  expect(before.count).toBe(3);
  expect(before.inherited).toEqual([0,100]);
  expect(before.local).toEqual([0,1]);
  expect(before.layout.left).toBeGreaterThan(before.root.left);
  expect(before.layout.right).toBeLessThan(before.root.right);
  const width = before.layout.right-before.layout.left;
  await page.evaluate(() => nestedFrames.setX(200));
  await expect.poll(async () => (await read()).inherited).toEqual([0,200]);
  const after = await read();
  expectDrawnExtent(after);
  expect(after.layout.right-after.layout.left).toBeCloseTo(width/2, 4);
  expect(after.canvases).toBe(before.canvases);
  await page.evaluate(() => nestedFrames.plot.setViewport({zoomX:2,zoomY:2,x:.5,y:.5}));
  await expect.poll(async () => (await read()).layout.right-(await read()).layout.left).toBeGreaterThan(width*.8);
  expectDrawnExtent(await read());
  const exported = await page.evaluate(async () => {
    await nestedFrames.plot.whenSettled();
    return (await nestedFrames.plot.exportPNG()).size;
  });
  expect(exported).toBeGreaterThan(1000);
  await page.evaluate(() => nestedFrames.showInset(false));
  await expect.poll(() => page.evaluate(() => nestedFrames.plot.getFrames().length)).toBe(2);
  expect(errors).toEqual([]);
});

test("nonlinear parent ranges agree in glyphs, ticks, curves and vector export", async ({page}) => {
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/test/nonlinear-frames");
  await page.waitForFunction(()=>window.nonlinearFrames?.frame?.getAxisLayout());
  const inspect=()=>page.evaluate(async()=>{
    const {plot,frame}=window.nonlinearFrames;
    await plot.whenSettled();
    const svg=await plot.exportSVG({mode:"auto"});
    const text=typeof svg === "string" ? svg : await svg.blob.text();
    const doc=new DOMParser().parseFromString(text,"image/svg+xml");
    const circles=[...doc.querySelectorAll('circle')].filter(c=>c.getAttribute('fill')==='#00aa00').map(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')]);
    const png=await plot.exportPNG(),bitmap=await createImageBitmap(png);
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
    const sx=canvas.width/Number(doc.documentElement.getAttribute("width")),sy=canvas.height/Number(doc.documentElement.getAttribute("height"));
    return {error:plot.getRenderError(),positionVersion:window.nonlinearFrames.points.getMark().fields.get("position").version,circles, pixels:circles.map(([x,y])=>{
      // An axis stroke crosses the first glyph's center. Inspect a one-CSS-pixel
      // neighborhood so a DPR-2 stroke does not cover every sampled pixel.
      const radius=Math.ceil(Math.max(sx,sy));
      const data=context.getImageData(Math.round(x*sx)-radius,Math.round(y*sy)-radius,2*radius+1,2*radius+1).data;
      let best=[255,255,255,255];
      for(let i=0;i<data.length;i+=4)if(data[i+1]-data[i]>best[1]-best[0])best=[...data.slice(i,i+4)];
      return best;
    }),layout:frame.getAxisLayout()};
  });
  const before=await inspect();
  expect(before.error).toBe('');
  expect(before.circles).toHaveLength(3);
  const [a,b,c]=before.circles;
  expect((b[0]-a[0])/(c[0]-a[0])).toBeCloseTo(Math.log(55/10)/Math.log(100/10),4);
  for(const pixel of before.pixels){expect(pixel[1]).toBeGreaterThan(100);expect(pixel[0]).toBeLessThan(50);}
  await page.evaluate(()=>nonlinearFrames.setEnd(200));
  await expect.poll(async()=> (await inspect()).circles[2][0]).toBeGreaterThan(c[0]);
  expect((await inspect()).positionVersion).toBe(before.positionVersion);
  expect(errors).toEqual([]);
});

test('anchored Cartesian frames keep pixel dimensions through camera zoom and rotate without new renderers',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/test/anchored-frames');
  await page.waitForFunction(()=>window.anchoredFrames?.frame);
  const read=()=>page.evaluate(async()=>{
    await anchoredFrames.plot.whenSettled();
    const result=await anchoredFrames.plot.exportSVG({mode:'auto'});
    const doc=new DOMParser().parseFromString(await result.blob.text(),'image/svg+xml');
    const points=[...doc.querySelectorAll('circle[fill="#00aa00"]')].map(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')]);
    const bitmap=await createImageBitmap(await anchoredFrames.plot.exportPNG()), canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
    const sx=canvas.width/Number(doc.documentElement.getAttribute("width")),sy=canvas.height/Number(doc.documentElement.getAttribute("height"));
    return {error:anchoredFrames.plot.getRenderError(),points,pixels:points.map(([x,y])=>{const data=context.getImageData(Math.round((x-2)*sx),Math.round((y-2)*sy),Math.ceil(5*sx),Math.ceil(5*sy)).data;let best=[255,255,255,255];for(let i=0;i<data.length;i+=4)if(data[i+1]-data[i]>best[1]-best[0])best=[...data.slice(i,i+4)];return best;}),canvases:document.querySelectorAll('canvas').length};
  });
  const first=await read();expect(first.error).toBe('');expect(first.points).toHaveLength(3);
  expect(first.points[2][0]-first.points[0][0]).toBeCloseTo(160,2);
  expect(first.points[0][1]-first.points[2][1]).toBeCloseTo(100,2);
  await page.evaluate(()=>anchoredFrames.plot.setViewport({zoomX:2,zoomY:2,x:.5,y:.5}));
  const zoomed=await read();
  expect(zoomed.points[2][0]-zoomed.points[0][0]).toBeCloseTo(160,2);
  await page.evaluate(()=>anchoredFrames.rotate(90));
  await expect.poll(async()=>{const s=await read();return s.points[0][0]-s.points[2][0];}).toBeCloseTo(100,1);
  const final=await read();
  for (const state of [first,zoomed,final]) for(const pixel of state.pixels){expect(pixel[1]).toBeGreaterThan(100);expect(pixel[0]).toBeLessThan(50);}
  expect(final.canvases).toBe(first.canvases);expect(errors).toEqual([]);
});

test("hovering a mark in an anchored frame reports that frame and frame-local data", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/anchored-frames");
  await page.waitForFunction(() => window.anchoredFrames?.frame);
  const points = await page.evaluate(async () => {
    await anchoredFrames.plot.whenSettled();
    const result = await anchoredFrames.plot.exportSVG({ mode: "auto" });
    const doc = new DOMParser().parseFromString(await result.blob.text(), "image/svg+xml");
    return [...doc.querySelectorAll('circle[fill="#00aa00"]')].map((c) => [+c.getAttribute("cx"), +c.getAttribute("cy")]);
  });
  expect(points).toHaveLength(3);
  const box = await page.locator('[aria-label="Plot canvas"]').boundingBox();
  // The middle point is child (5, 5); approach it so the move lands on the mark.
  await page.mouse.move(box.x + points[1][0] - 20, box.y + points[1][1]);
  await page.mouse.move(box.x + points[1][0], box.y + points[1][1], { steps: 4 });
  await expect.poll(() => page.evaluate(() => window.anchoredFrames.hover)).toBeTruthy();
  const { hover, keys } = await page.evaluate(() => ({
    hover: anchoredFrames.hover,
    keys: anchoredFrames.plot.getFrames().map((f) => f.getFrameOptions().axisFrameKey),
  }));
  const anchoredKey = await page.evaluate(() => anchoredFrames.frame.getFrameOptions().axisFrameKey);
  expect(keys).toHaveLength(2);
  expect(hover.frame).toBe(anchoredKey);
  expect(hover.frame).not.toBe(keys.find((key) => key !== anchoredKey));
  expect(hover.instanceId).toBe(1);
  expect(hover.x).toBeCloseTo(5, 0);
  expect(hover.y).toBeCloseTo(5, 0);
  expect(errors).toEqual([]);
});

// static/test/notebook-legacy-frame.json is a Python snapshot of a Plot with an anchored
// Frame whose placement had its `version` removed, as scenes saved before versioning were.
test("a legacy scene whose frame placement has no version still loads and places the frame", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/notebook?fixture=legacy-frame");
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 20_000 });
  const state = await page.evaluate(async () => {
    const plot = [...window.notebookRuntime.handles.values()].map(({ handle }) => handle)
      .find((handle) => handle?.getRenderError && handle?.exportPNG);
    await plot.whenSettled();
    const frame = plot.getFrames().map((f) => f.getFrameOptions()).find((o) => o.frameDefinition?.placement);
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    const xs = [];
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 1] > data[i] + 60 && data[i + 1] > data[i + 2] + 60) xs.push((i / 4) % width);
    return { error: plot.getRenderError(), version: frame?.frameDefinition.placement.version ?? null,
      size: frame?.frameDefinition.placement.size, span: xs.length ? (Math.max(...xs) - Math.min(...xs)) * document.querySelector(".canvas canvas").clientWidth / width : 0,
      runtimeError: window.notebookRuntime.error || null };
  });
  expect(state.runtimeError).toBeNull();
  expect(state.error).toBe("");
  expect(state.version).toBeNull();
  expect(state.size).toEqual([120, 120]);
  // Points at child x 2 and 8 of 10 in a 120 px frame are 72 px apart, plus the glyph;
  // without the placement they would spread over most of the 400 px plot.
  expect(state.span).toBeGreaterThan(72);
  expect(state.span).toBeLessThan(90);
  expect(errors).toEqual([]);
});
