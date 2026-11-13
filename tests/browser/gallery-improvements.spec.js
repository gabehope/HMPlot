import { test, expect } from "./fixtures.js";

// Examples mount through src/lib/docs/Example.svelte on /examples/<id>: the plot sits in
// [aria-label="Live example"], window.__examples exposes {plot, settle, finished, diagnostics},
// and each plot's settings and export buttons (revealed on hover) open the settings pane and the export panel.
function errors(page) {
  const messages = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /GPU|WGSL|shader|validation/i.test(m.text()))
      messages.push(m.text());
  });
  return messages;
}
async function choose(page, id, title) {
  await page.goto(id === "timeseries" ? `/test/gallery-example?id=${id}` : `/examples/${id}`);
  await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__examples?.plot), undefined, { timeout: 30000 });
  await expect(page.locator(".live-example canvas").first()).toBeVisible();
}
async function openSettings(page) {
  await page.locator(".live-example canvas").first().hover();
  await page.locator(".live-example").getByRole("button", { name: /^Settings for / }).first().click();
  const pane = page.getByRole("dialog", { name: /^Settings · / });
  await expect(pane).toBeVisible();
  return pane;
}
async function decodePixels(page, base64) {
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + base64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let opaque = 0, gadgetRed = 0,
      colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 100) opaque++;
      if (Math.abs(data[i]-189)<5 && Math.abs(data[i+1]-82)<5 && Math.abs(data[i+2]-96)<5 && data[i+3]>200) gadgetRed++;
      if (data[i + 1] > data[i] * 1.2 && data[i + 3] > 100) colored++;
    }
    return { width: c.width, height: c.height, opaque, colored, gadgetRed };
  }, base64);
}
// PNG through the plot handle (the example's primary plot).
async function exportedPixels(page) {
  const base64 = await page.evaluate(async () => {
    const blob = await window.__examples.plot.exportPNG();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  });
  return decodePixels(page, base64);
}
// PNG through the plot's export button (TODO 60) and its Download.
async function downloadedPixels(page, button) {
  const pending = page.waitForEvent("download");
  await button.click();
  const download = await pending;
  const stream = await download.createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return decodePixels(page, Buffer.concat(chunks).toString("base64"));
}
test("first texture frame, child click, closed settings and GPU PNG pixels", async ({
  page,
}) => {
  const issues = errors(page);
  await choose(page, "texture", "Interactive textures");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__examples?.diagnostics().surfaceTextures[0]?.version,
      ),
    )
    .toBeGreaterThan(0);
  // No pointer input has entered the plot before the completed texture check.
  const canvas = page.locator(".live-example canvas").first(),
    box = await canvas.boundingBox();
  const layout=await page.evaluate(()=>window.__examples.plot.getAxisLayout());
  const x = layout.left + (layout.right-layout.left) * ((2.7 * Math.sqrt(0.5 / 240) + 3) / 6),
    y = (layout.top+layout.bottom)/2;
  await canvas.click({ position: { x, y } });
  // The example's own controls (the Example shell around it has a .controls row too).
  await expect(page.locator(".live-example .controls")).toContainText("Point 1");
  const png = await exportedPixels(page);
  expect(png.colored).toBeGreaterThan(png.width * png.height * 0.2);
  const pane = await openSettings(page);
  await expect(pane.locator("details[open]")).toHaveCount(0);
  await expect(pane.getByRole("searchbox")).toHaveCount(0);
  await pane
    .getByRole("button", { name: "Search settings", exact: true })
    .click();
  await expect(pane.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pane.getByRole("searchbox")).toHaveCount(0);
  await pane.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.locator(".live-example canvas").first().hover();
  await page.locator(".live-example").getByRole("button", { name: /^Export / }).first().click();
  const png2 = await downloadedPixels(page,
    page.getByRole("dialog", { name: /^Export · / }).getByRole("button", { name: "Download", exact: true }));
  expect(png2.colored / (png2.width * png2.height)).toBeCloseTo(
    png.colored / (png.width * png.height),
    1,
  );
  await page.keyboard.press("Escape");
  await choose(page, "sphere", "Spherical coordinates");
  await page.getByLabel("View", { exact: true }).selectOption("3d");
  await expect(
    page.getByRole("button", { name: "View from positive X" }),
  ).toBeVisible();
  const axis = await page
    .getByRole("button", { name: "View from positive X" })
    .boundingBox();
  expect(axis.width).toBeLessThanOrEqual(26);
  await page.getByLabel("View", { exact: true }).selectOption("2d");
  await expect
    .poll(() =>
      page.evaluate(() => window.__examples?.diagnostics().overview.targets),
    )
    .toBeGreaterThan(0);
  await choose(page, "surface", "Density & surfaces");
  await page.getByLabel("View", { exact: true }).selectOption("3d");
  await page.evaluate(() => window.__examples.settle());
  // The 3D axes overlay is drawn while the pointer is over the plot.
  await page.locator(".live-example canvas").first().hover();
  const boxAxes = page.getByLabel("3D coordinate axes");
  await expect(boxAxes).toBeVisible();
  await expect(boxAxes.locator(".box-edge")).toHaveCount(12);
  // The box takes the frame's titles (TODO 21): this example labels x and y explicitly, and its
  // height axis, which no column names, has no title (it read "Height" before).
  await expect(boxAxes.locator(".box-title")).toHaveText(["X", "Y"]);
  await expect(boxAxes).not.toContainText("Height");
  expect(issues).toEqual([]);
});
test("long series supports both detail modes and rectangular minimap navigation", async ({
  page,
}) => {
  const issues = errors(page);
  await choose(page, "timeseries", "Long time series");
  await expect
    .poll(() =>
      page.evaluate(() => window.__examples?.diagnostics().overview.draws),
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".mini-axes")).toBeVisible();
  for (const n of ["100000", "1000000"]) {
    await page.getByLabel("Time series length presets").selectOption(n);
    await expect(
      page.getByRole("status").filter({ hasText: "Preparing" }),
    ).toHaveCount(0, { timeout: 30000 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__examples?.diagnostics().marks[0]?.fields.start.count,
          ),
        { timeout: 30000 },
      )
      .toBe(Number(n) - 1);
  }
  await page.getByLabel("Detail", { exact: true }).selectOption("random");
  await page.evaluate(() => window.__examples?.settle());
  await page.getByLabel("Detail", { exact: true }).selectOption("uniform-x");
  const canvas = page.locator(".live-example canvas").first(),
    box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(200);
  const r = await page.locator(".minimap rect").first().boundingBox();
  expect(r.width).toBeLessThan(box.width * 0.8);
  const mini = page.locator(".minimap");
  await mini.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.getByRole("region", { name: "Example", exact: true }).locator("pre code")).toContainText(
    "sampling={detail}",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  expect(issues).toEqual([]);
});
test("GPU reductions retain path boundaries and ordered extrema", async ({
  page,
}) => {
  await page.goto("/examples");
  const result = await page.evaluate(() =>
    import("/tests/browser/reduction-fixtures.js").then((m) => m.reductions()),
  );
  expect(result.error).toBeNull();
  expect(result.metadata).toEqual([
    3, 598, 0, 200, 0, 0, 201, 401, 200, 0, 402, 600, 400, 0,
  ]);
  const vertices = result.rows.slice(0, 17);
  expect(vertices).toContain(300);
  expect(vertices).toContain(301);
  expect(vertices).toEqual([...vertices].sort((a, b) => a - b));
  expect(result.rows[17 * 2 + 16]).toBe(1023);
});


test("Earth relief updates reuse textures and mark buffers", async ({ page }) => {
  const failures = errors(page);
  await choose(page, "earth", "Earth relief");
  await page.waitForFunction(() => window.__examples?.diagnostics()?.surfaceTextures?.[0]?.version > 0);
  await page.evaluate(() => window.__examples.settle());
  const slider = page.getByRole("slider", { name: "Height scale" });
  await slider.fill("0");
  await page.evaluate(() => window.__examples.settle());
  const before = await page.evaluate(() => window.__examples.diagnostics());
  const flat = await page.locator(".live-example canvas").first().screenshot();
  for (const value of ["50", "100", "150", "200"]) {
    await slider.fill(value);
    await page.evaluate(() => window.__examples.settle());
  }
  const raised = await page.locator(".live-example canvas").first().screenshot();
  const after = await page.evaluate(() => window.__examples.diagnostics());
  expect(raised.equals(flat)).toBe(false);
  expect(after.surfaceTextures).toEqual(before.surfaceTextures);
  expect(after.marks).toEqual(before.marks);
  expect(after.memory).toEqual(before.memory);
  expect(failures).toEqual([]);
});


test("GPU animation interpolation, retargeting and normalization", async ({page}) => {
  await page.goto('/examples');
  const result=await page.evaluate(async()=> (await import('/tests/browser/animation-fixtures.js')).numericalAnimations());
  expect(result.error).toBeUndefined();
  expect(result.midpoint).toEqual([1,3,5,7]);
  expect(result.retarget).toEqual([3,5,7,9]);
  result.auto.forEach((v,i)=>expect(v).toBeCloseTo(i/3,6));
  result.symmetric.forEach((v,i)=>expect(v).toBeCloseTo((3+i*2)/9,6));
  expect(result.changedMask).toEqual(['NaN',12,14,16]);
  expect(result.premultiplied).toEqual([0,0,1,.5]);
});

test("animated marks settle, retarget, honor reduced motion and retain resources", async ({page}) => {
  const failures=errors(page);
  for(const kind of ['points','line','surface','globe']) {
    await choose(page, 'animation-'+kind, 'Animated '+kind);
    await page.evaluate(()=>window.__examples.settle());
    await page.waitForFunction(()=>window.__examples?.diagnostics?.()?.marks?.length>0);
    await page.locator('.live-example canvas').first().screenshot();
    await page.getByRole('button',{name:'New target',exact:true}).click();
    await page.waitForFunction(()=>window.__examples.diagnostics().animation.active>0);
    await page.getByRole('button',{name:'New target',exact:true}).click();
    await page.evaluate(()=>window.__examples.finished());
    const a=await page.evaluate(()=>window.__examples.diagnostics());
    expect(a.animation.active).toBe(0);
    await page.getByRole('button',{name:'New target',exact:true}).click();
    await page.evaluate(()=>window.__examples.finished());
    const b=await page.evaluate(()=>window.__examples.diagnostics());
    expect(b.marks).toEqual(a.marks);
    expect(b.memory).toEqual(a.memory);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'New target',exact:true}).click();
  await page.evaluate(()=>window.__examples.finished());
  expect((await page.evaluate(()=>window.__examples.diagnostics())).animation.active).toBe(0);
  expect(failures).toEqual([]);
});

test('gallery props update bounds and projections; exports exclude overview axes', async ({ page }) => {
  test.setTimeout(90000);
  const issues = errors(page);
  await choose(page, 'timeseries', 'Long time series');
  await page.getByRole('combobox', { name: 'Time series length presets' }).selectOption('1000000');
  await expect.poll(() => page.evaluate(() => window.__examples?.diagnostics().marks.some(m => m.fields.start?.count === 999999))).toBe(true);
  await page.evaluate(() => window.__examples.settle());
  // The x axis covers the million rows: 800,000 is a tick at steps of 100,000 or 200,000.
  await expect(page.locator('svg[aria-label="2D coordinate axes"]')).toContainText('800,000');
  const mini = page.locator('svg[aria-label="Overview axes"]');
  const aligned = await mini.evaluate(svg => {
    const r = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('text')].every(t => { const b=t.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right; });
  });
  expect(aligned).toBe(true);
  await choose(page, 'earth', 'Earth relief');
  await expect.poll(() => page.evaluate(() => window.__examples?.diagnostics?.()?.surfaceTextures?.[0]?.version ?? 0)).toBeGreaterThan(0);
  await page.evaluate(() => window.__examples.settle());
  // The only SVG .axes in this view belongs to the overview gadget.
  // Export must not stretch that overlay across the rendered image.
  await expect(page.locator('.overview-overlay svg.axes')).toHaveCount(1);
  await expect(page.locator('svg[data-export-axes]')).toHaveCount(0);
  const pixels = await exportedPixels(page);
  expect(pixels.opaque).toBeGreaterThan(10000);
  expect(pixels.gadgetRed).toBeLessThan(10);
  // The paired program's Selects (TODO 69.10), chosen by their labels.
  await page.getByRole('combobox', { name: 'Earth view' }).selectOption({ label: '2D map' });
  const maps=[];
  for (const projection of ['Equirectangular','Mercator','Equal area']) {
    await page.getByRole('combobox', { name: 'Earth projection' }).selectOption({ label: projection });
    await page.evaluate(() => window.__examples.settle());
    await page.waitForTimeout(350);
    maps.push(await page.locator('.canvas').first().screenshot());
  }
  expect(maps[0].equals(maps[1])).toBe(false);
  expect(maps[0].equals(maps[2])).toBe(false);
  expect(maps[1].equals(maps[2])).toBe(false);
  expect(issues).toEqual([]);
});

test('legends toggle and isolate, uncertainty picking, colorbar bounds and PNG guides', async ({page})=>{
  const issues=errors(page);await choose(page,'guides','Legends & uncertainty');
  const estimate=page.getByRole('button',{name:'Toggle Estimate'});
  await expect(estimate).toHaveCount(2);
  await expect(estimate.first()).toHaveAttribute('aria-pressed','true');
  await estimate.first().click();await expect(estimate.nth(1)).toHaveAttribute('aria-pressed','false');
  await estimate.nth(1).click();await expect(estimate.first()).toHaveAttribute('aria-pressed','true');
  await estimate.first().click({modifiers:['Shift']});await expect(page.getByRole('button',{name:'Toggle Area'})).toHaveAttribute('aria-pressed','false');
  await estimate.first().click({modifiers:['Shift']});await expect(page.getByRole('button',{name:'Toggle Area'})).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>window.__examples.settle());
  await expect.poll(()=>page.locator('svg[aria-label="Density"]').textContent()).toMatch(/9\.9/);
  const canvas=page.locator('.canvas').first(),box=await canvas.boundingBox();
  const layout=await page.evaluate(()=>window.__examples.plot.getAxisLayout());
  search: for(const dy of [0,1,-1,2,-2,3,-3]) for(const dx of [0,1,-1,2,-2,3,-3]) {
    await page.mouse.click(box.x+(layout.left+layout.right)/2+dx,box.y+(layout.top+layout.bottom)/2+dy);
    if(await page.getByLabel('Selected observation').count()) break search;
  }
  await expect(page.getByLabel('Selected observation')).toHaveText('Observation 5');
  const png=await exportedPixels(page);
  // Export includes the legend below the actual canvas, at the current pixel ratio.
  expect(png.height).toBeGreaterThan(box.height * await page.evaluate(()=>devicePixelRatio));
  expect(png.opaque).toBeGreaterThan(10000);
  await page.setViewportSize({width:500,height:1100});await page.evaluate(()=>window.__examples.settle());
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)).toBe(false);
  await page.getByLabel('Constant density').check();
  await expect.poll(()=>page.locator('svg[aria-label="Density"]').textContent()).toBe('5');
  await page.getByLabel('Constant density').uncheck();
  await expect.poll(()=>page.locator('svg[aria-label="Density"]').textContent()).toMatch(/9\.9/);
  await page.getByLabel('Error direction').selectOption('x');
  await page.getByLabel('Quantized colors').check();
  await page.getByLabel('Paint interval on surface').check();
  await page.getByLabel('Surface view').selectOption('3d');
  await page.evaluate(()=>window.__guideExample.densityPlot.whenSettled());
  await expect.poll(()=>page.evaluate(()=>window.__guideExample.densityPlot.getDiagnostics().surfaceTextures[0]?.version??0)).toBeGreaterThan(0);
  expect(issues).toEqual([]);
});

test('uncertainty GPU fixtures retain ordering and invalid-value breaks',async({page})=>{
 await page.goto('/examples');
 const result=await page.evaluate(async()=>{
  const {initializePlot}=await import('/src/lib/jaxExtensions/setup.js');await initializePlot();
  const {uncertaintyArrays}=await import('/src/lib/plot/utils/uncertainty.js');
  const read=async(v)=>{const out={};try{for(const [k,a]of Object.entries(v))out[k]=Array.from(await a.ref.data()).map(x=>Number.isFinite(x)?x:null);return out;}finally{Object.values(v).forEach(a=>a.dispose());}};
  return {band:await read(uncertaintyArrays('band',[0,1,2],[1,2,3],[2,4,5])),area:await read(uncertaintyArrays('area',[0,1],0,[-1,1])),errors:await read(uncertaintyArrays('errors',[[0,1],[2,3]],[0,5],[2,4],'x'))};
 });
 expect(result.band.start).toEqual([0,1,1,2]);expect(result.band.next).toEqual([1,4,2,5]);
 expect(result.area.previous).toEqual([0,-1]);
 expect(result.errors.start).toEqual([0,1,null,3]);expect(result.errors.end).toEqual([2,1,null,3]);
});

test('guide updates reuse settled resources and read only compact scalar bounds',async({page})=>{
 const issues=errors(page);await choose(page,'guides','Legends & uncertainty');
 await expect.poll(()=>page.locator('svg[aria-label="Density"]').textContent()).toMatch(/9\.9/);
 const before=await page.evaluate(async()=>{await window.__guideExample.densityPlot.whenSettled();const audit=await import('/tests/browser/guide-audit.js');audit.beginGuideAudit();return window.__guideExample.densityPlot.getDiagnostics();});
 for(let i=0;i<3;i++){
  await page.getByLabel('Constant density').check();await expect.poll(()=>page.locator('svg[aria-label="Density"]').textContent()).toBe('5');
  await page.getByLabel('Constant density').uncheck();await expect.poll(()=>page.locator('svg[aria-label="Density"]').textContent()).toMatch(/9\.9/);
 }
 const after=await page.evaluate(async()=>{await window.__guideExample.densityPlot.whenSettled();const audit=await import('/tests/browser/guide-audit.js');return {reads:audit.finishGuideAudit(),diagnostics:window.__guideExample.densityPlot.getDiagnostics()};});
 expect(after.reads.length).toBeGreaterThan(0);expect(after.reads.every(n=>n<=2)).toBe(true);
 expect(after.diagnostics.managers).toBe(before.managers);
 expect(after.diagnostics.memory).toEqual(before.memory);
 await choose(page,'symbols','Point symbols');await page.evaluate(()=>window.__examples.settle());expect(issues).toEqual([]);
});


test('named data categorical symbols, axes, legends, updates and dictionary columns',async({page})=>{
 const messages=errors(page);await choose(page,'categories','Named data & categories');
 const color=page.getByRole('group',{name:'Group colors',exact:true}),symbols=page.getByRole('group',{name:'Group symbols',exact:true});
 await expect(color.getByRole('button',{name:'Toggle Control',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(symbols.getByRole('button',{name:'Toggle B',exact:true}).locator('path')).toHaveCount(1);
 await color.getByRole('button',{name:'Toggle A',exact:true}).click();await expect(color.getByRole('button',{name:'Toggle A',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(page.getByRole('group',{name:'Shared mapping',exact:true}).getByRole('button',{name:'Toggle A',exact:true})).toHaveAttribute('aria-pressed','true');
 await color.getByRole('button',{name:'Toggle B',exact:true}).click({modifiers:['Shift']});await expect(color.getByRole('button',{name:'Toggle Control',exact:true})).toHaveAttribute('aria-pressed','false');
 await color.getByRole('button',{name:'Toggle B',exact:true}).click({modifiers:['Shift']});await expect(color.getByRole('button',{name:'Toggle Control',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Update values',exact:true}).click();await page.getByRole('button',{name:'Reverse rows',exact:true}).click();await page.getByLabel('Column table',{exact:true}).check();
 await expect(color.getByRole('button',{name:'Toggle A',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.evaluate(async()=>await window.__categoryExample.plot.whenSettled());
 expect(await page.evaluate(()=>window.__categoryExample.plot.getAxisLayout().x.major.map(t=>t.label))).toEqual(['Control','A','B']);
 const before=await page.evaluate(()=>window.__categoryExample.plot.getDiagnostics().marks.map(m=>m.fields.position?.count));
 await page.getByLabel('Invalid replacement',{exact:true}).check();await expect(page.getByRole("alert").filter({hasText:/references missing field "missing"|Missing or nonnumeric data column: missing|requires a categorical axis scale or a numeric column/}).first()).toBeVisible();
 expect(await page.evaluate(()=>window.__categoryExample.plot.getDiagnostics().marks.map(m=>m.fields.position?.count))).toEqual(before);
 await page.getByLabel('Invalid replacement',{exact:true}).uncheck();
 await page.getByLabel('View',{exact:true}).selectOption('3d');await page.evaluate(async()=>await window.__categoryExample.plot.whenSettled());
 await page.getByLabel('View',{exact:true}).selectOption('2d');
 const pixels=await exportedPixels(page);expect(pixels.opaque).toBeGreaterThan(0);
 expect(messages).toEqual([]);
});
test('categorical GPU fixtures preserve unknowns, row identities, and mask complete observations',async({page})=>{
 await choose(page,'categories','Named data & categories');await expect.poll(()=>page.evaluate(()=>Boolean(window.__categoryExample?.gpuPoints))).toBe(true);
 const result=await page.evaluate(async()=>{const {fixtures}=await import('/tests/browser/category-fixtures.js');return fixtures();});
 expect(result.positions).toEqual([[0,1],[null,null],[null,3],[0,4]]);
 expect(result.rgb[0]).toEqual([1,0,0]);expect(result.rgb[1]).toEqual([0,0,1]);expect(result.rgb[2]).toEqual(result.rgb[3]);
});


test('category updates read only series counts and retain settled resources; surface children resolve data',async({page})=>{
 const messages=errors(page);await choose(page,'categories','Named data & categories');await expect.poll(()=>page.evaluate(()=>Boolean(window.__categoryExample?.gpuPoints))).toBe(true);
 await page.evaluate(async()=>{await window.__categoryExample.plot.whenSettled();await window.__categoryExample.gpuPlot.whenSettled();const audit=await import('/tests/browser/guide-audit.js');audit.beginGuideAudit();});
 // Exercise both visibility states before measuring steady-state allocations.
 const warm=page.getByRole('group',{name:'Group colors',exact:true}).getByRole('button',{name:'Toggle A',exact:true});
 await warm.click();await expect(warm).toHaveAttribute('aria-pressed','false');await warm.click();await expect(warm).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>window.__categoryExample.plot.getDiagnostics().overview.draws)).toBeGreaterThan(0);
 await page.evaluate(async()=>await window.__categoryExample.plot.whenSettled());
 const before=await page.evaluate(()=>window.__categoryExample.plot.getDiagnostics());
 for(let i=0;i<3;i++){
  await page.getByRole('button',{name:'Update values',exact:true}).click();
  const button=page.getByRole('group',{name:'Group colors',exact:true}).getByRole('button',{name:'Toggle A',exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','false');await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
  await page.evaluate(async()=>await window.__categoryExample.plot.whenSettled());
 }
 const after=await page.evaluate(()=>window.__categoryExample.plot.getDiagnostics());expect(after.managers).toBe(before.managers);expect(after.memory).toEqual(before.memory);
 // Replacing the table regroups the example's paths: one scalar series count per update.
 // Category guides must not read back any column or add another scalar read.
 const reads=await page.evaluate(async()=>{const audit=await import('/tests/browser/guide-audit.js');return audit.finishGuideAudit();});expect(reads).toEqual([1,1,1]);
 await page.getByLabel('Painted categories',{exact:true}).check();await expect.poll(()=>page.evaluate(()=>window.__categoryExample.texturePlot?.getDiagnostics().surfaceTextures[0]?.version??0)).toBeGreaterThan(0);
 await page.getByLabel('Painted categories',{exact:true}).uncheck();await page.setViewportSize({width:520,height:900});await expect(page.getByRole('group',{name:'Group colors',exact:true})).toBeVisible();
 expect(messages).toEqual([]);
});
