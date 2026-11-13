import { test, expect } from "./fixtures.js";
import { subdivisionProgress } from "./subdivision-progress.js";
import { existsSync, readFileSync } from "node:fs";
import { installGpuCounters, installGpuErrors, gpuCounters, countersDelta } from "./gpu-counters.js";
import { encodeVectorTile } from "../unit/vectorTileEncoder.js";
import { pixelReader } from "./png.js";

// The gallery is served by src/lib/docs/DocsPage.svelte: /examples lists cards and
// "Additional examples" links, /examples/<id> mounts one example through Preview.svelte
// (aria-label "Live example", window.__examples = {plot, settle, finished, diagnostics})
// with its source under the "Example source" section.
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const source = (page) => page.getByRole("region", { name: "Example source" }).locator("pre");

test.describe("ridgeline temperatures", () => {
  test.use({ deviceScaleFactor: 2 });
  test("draws all twelve months with cold and warm fills", async ({ page }, testInfo) => {
    await page.goto("/examples/ridgeline");
    await page.waitForFunction(() => Boolean(window.__examples?.plot));
    await page.waitForFunction(() => [...document.querySelectorAll(".canvas")]
      .every((canvas) => canvas.getAttribute("aria-busy") === "false"));
    await page.evaluate(() => window.__examples.settle());
    const canvas = page.locator('[aria-label="Live example"] canvas');
    await expect(canvas).toHaveCount(1);
    const png = await canvas.screenshot({ path: testInfo.outputPath("ridgeline.png") });
    const pixel = pixelReader(png), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let cold = 0, warm = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      if (b > r + 25 && g > r + 15) cold++;
      if (r > b + 40 && r > g + 15) warm++;
    }
    expect(cold).toBeGreaterThan(1000);
    expect(warm).toBeGreaterThan(1000);

    const labels = await page.evaluate(async () => {
      const exported = await window.__examples.plot.exportSVG({ mode: "vector" });
      const svg = new DOMParser().parseFromString(await exported.blob.text(), "image/svg+xml");
      return [...svg.querySelectorAll('text[dominant-baseline="central"]')]
        .map((text) => ({ text: text.textContent, y: Number(text.getAttribute("y")) }));
    });
    expect(labels.map((label) => label.text)).toEqual(["January", "February", "March", "April",
      "May", "June", "July", "August", "September", "October", "November", "December"]);
    expect(labels.every((label, i) => !i || label.y > labels[i - 1].y)).toBe(true);
    await expect(source(page)).toContainText('<Density x="temperature"');
  });
});

test.describe("zoomable sunburst", () => {
  test.use({ deviceScaleFactor: 2 });
  for (const [language, url] of [["Python scene", "/examples/sunburst"], ["Svelte", "/test/gallery-example?id=sunburst"]]) {
    test(`${language} drills into branches with GPU layout animation and resets`, async ({ page }, testInfo) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
      await page.goto(url);
      await page.waitForFunction(() => Boolean(window.__examples?.plot));
      await page.waitForFunction(() => [...document.querySelectorAll(".canvas")]
        .every((canvas) => canvas.getAttribute("aria-busy") === "false"));
      await page.evaluate(async () => {
        await window.__examples.settle();
        await window.__examples.plot.whenAnimationsFinished();
        await window.__examples.plot.setAnimationTime(1000);
      });
      const canvas = page.locator('.example canvas').first();
      await canvas.scrollIntoViewIfNeeded();
      const snapshot = (time) => page.evaluate(async (time) => {
        const plot = window.__examples.plot;
        await plot.setAnimationTime(time);
        await plot.whenSettled();
        const { blob, report } = await plot.exportSVG({ mode: "vector" });
        const svg = new DOMParser().parseFromString(await blob.text(), "image/svg+xml");
        const opacity = (node) => {
          let value = 1;
          for (let at = node; at && at !== svg; at = at.parentElement)
            value *= Number(at.getAttribute("opacity") ?? 1);
          return value;
        };
        const mark = plot.getLegendSource().entries()
          .find(handle => handle.entry()?.label === 'Studio workload')?.guideMark();
        const { keyValues } = await import('/src/lib/plot/utils/tableJoin.js');
        const { liveRows, element } = await import('/src/lib/plot/utils/vectorExport/capture.js');
        // A lifecycle union keeps incoming keyed rows first, then departing rows. Match
        // drawn alpha to the current node identity instead of assuming a stable row index.
        const ids = (await keyValues(((m) => m?.view.marks.of(m))(mark)?.interaction.scope, 'id', { atRows: true })).values;
        const alpha = await liveRows(mark, 'interactionOpacity', 1);
        const labelMark = plot.getLegendSource().entries().map(handle => handle.guideMark())
          .find(mark => mark?.exportKind === 'labels' && mark.count > 2);
        const names = (await keyValues(((m) => m?.view.marks.of(m))(labelMark)?.interaction.scope, 'name', { atRows: true })).values;
        const currentX = (await keyValues(((m) => m?.view.marks.of(m))(labelMark)?.interaction.scope, 'x', { atRows: true })).values;
        const currentY = (await keyValues(((m) => m?.view.marks.of(m))(labelMark)?.interaction.scope, 'y', { atRows: true })).values;
        const labelPosition = await liveRows(labelMark, 'position', 3);
        const labelAlpha = await liveRows(labelMark, 'interactionOpacity', 1);
        return {
          labels: [...svg.querySelectorAll('text[dominant-baseline="central"]')].map((t) => ({ text: t.textContent,
            x: Number(t.getAttribute("x")), y: Number(t.getAttribute("y")), opacity: opacity(t) }))
            // Static label membership deliberately retains hidden rows, whose drawn alpha
            // is zero. The selector takes chart labels, excluding the DOM legend at any size.
            .filter((t) => t.opacity > 1e-6),
          sectors: [...svg.querySelectorAll('path[fill]')].filter(path => path.getAttribute('fill') !== 'none')
            .map(path => ({ fill: path.getAttribute('fill'), opacity: opacity(path) })),
          nodeOpacity: Object.fromEntries(ids.map((id, index) => [id, Number(element(alpha, index))])),
          labelRows: names.map((name, index) => ({ name, current: [currentX[index], currentY[index]],
            drawn: element(labelPosition, index, 3), opacity: Number(element(labelAlpha, index)) })),
          geometry: [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder()
            .encode(JSON.stringify([...svg.querySelectorAll("path")]
              .map((p) => [p.getAttribute("d"), p.getAttribute("transform")])))))].join(","),
          rasters: report.rasterLayers.length,
        };
      }, time);
      const root = await snapshot(1000);
      expect(root.rasters).toBe(0);
      const center = root.labels.find((t) => t.text === "Studio");
      const box = await canvas.boundingBox();
      const clickCanvas = async (x, y, selectedRows) => {
        // Screenshots and page layout may scroll the canvas between gestures.
        await canvas.scrollIntoViewIfNeeded();
        const bounds = await canvas.boundingBox();
        await page.mouse.click(bounds.x + x, bounds.y + y);
        // Picking reads asynchronously. A settled plot can still have a pending pointer pick;
        // wait for the sectors' node identity before advancing the frozen animation clock.
        await expect.poll(() => page.evaluate(() => {
          const mark = window.__examples.plot.getLegendSource().entries()
            .find(handle => handle.entry()?.label === 'Studio workload')?.guideMark();
          const binding = ((m) => m?.view.marks.of(m))(mark)?.interaction;
          return binding?.owner ? [...binding.selection.rows(binding.owner)] : null;
        })).toEqual(selectedRows);
        await page.evaluate(() => window.__examples.settle());
      };
      const clickLabel = async (state, name) => {
        const label = state.labels.find((t) => t.text === name);
        expect(label, `visible ${name} label`).toBeTruthy();
        await clickCanvas(label.x, label.y, [{ Design: 1, Brand: 2, Identity: 3 }[name]]);
      };
      await clickLabel(root, "Design");
      const start = await snapshot(1000), halfway = await snapshot(1325);
      const midwayPNG = await canvas.screenshot({ path: testInfo.outputPath('sunburst-midway.png') });
      // A dependent Filter removes zero-area rows when Tree publishes its final layout.
      // Step at that endpoint so their exit fade can finish before inspecting the final frame.
      await snapshot(1650);
      const design = await snapshot(2400);
      expect(halfway.geometry).not.toEqual(start.geometry);
      expect(halfway.geometry).not.toEqual(design.geometry);
      // The focused group's visible color blends into white through its animated alpha.
      // Reading exported drawn fields checks the intermediate frame, not just descriptors.
      expect(root.sectors[0].opacity).toBe(1);
      expect(halfway.sectors[0].opacity).toBeGreaterThan(0.05);
      expect(halfway.sectors[0].opacity).toBeLessThan(0.95);
      expect(design.sectors[0].opacity).toBe(0);
      const outgoingTitle = halfway.labels.find(label => label.text === 'Studio');
      const incomingTitle = halfway.labels.find(label => label.text === 'Design' &&
        Math.hypot(label.x - center.x, label.y - center.y) < 1);
      expect(outgoingTitle?.opacity).toBeGreaterThan(0.05);
      expect(outgoingTitle?.opacity).toBeLessThan(0.95);
      expect(incomingTitle?.opacity).toBeGreaterThan(0.05);
      expect(incomingTitle?.opacity).toBeLessThan(0.95);
      // Hidden/fading labels remain in the layout table. Their GPU positions follow the
      // current Tree geometry even while the polar extent and their opacity change.
      for (const row of halfway.labelRows) {
        expect(row.drawn[0]).toBeCloseTo(row.current[0], 4);
        expect(row.drawn[1]).toBeCloseTo(row.current[1], 4);
      }
      const fadingLabel = halfway.labelRows.find(row => row.name === 'Experience');
      expect(fadingLabel.opacity).toBeGreaterThan(0.05);
      expect(fadingLabel.opacity).toBeLessThan(0.95);
      expect(fadingLabel.drawn[0]).not.toBe(root.labelRows.find(row => row.name === 'Experience').drawn[0]);
      const midwayPixel = pixelReader(midwayPNG), midwayRatio = midwayPNG.readUInt32BE(16) / box.width;
      const midwayColor = midwayPixel(Math.round((center.x + 45) * midwayRatio), Math.round((center.y - 45) * midwayRatio));
      // The actual polar mesh must blend the focused sector into white, not merely report
      // fractional opacity in an export while drawing an opaque sector until the endpoint.
      expect(Math.min(...midwayColor)).toBeGreaterThan(145);
      expect(Math.min(...midwayColor)).toBeLessThan(235);
      expect(design.labels.map((t) => t.text)).toContain("Type");
      expect(design.labels.map((t) => t.text)).not.toContain("Engineering");
      await page.mouse.move(0, 0);
      const png = await canvas.screenshot({ path: testInfo.outputPath("sunburst-design.png") });
      const pixels = pixelReader(png), ratio = png.readUInt32BE(16) / box.width;
      const centerColor = pixels(Math.round((center.x + 20) * ratio), Math.round((center.y + 46) * ratio));
      expect(Math.min(...centerColor)).toBeGreaterThan(180);
      expect(Math.max(...centerColor) - Math.min(...centerColor)).toBeLessThan(30);
      await clickLabel(design, "Brand");
      await snapshot(3050);
      const brand = await snapshot(3800);
      expect(brand.labels.map((t) => t.text)).toEqual(expect.arrayContaining(["Brand", "Identity", "Type"]));
      expect(brand.labels.map((t) => t.text)).not.toContain("Digital");
      // The center is unselectable, so clicking it deselects and resets to the original root.
      await clickCanvas(center.x, center.y, []);
      const returning = await snapshot(4125);
      await snapshot(4450);
      const restored = await snapshot(5200);
      expect(returning.nodeOpacity[2]).toBeGreaterThan(0.05); // The formerly focused Brand node.
      expect(returning.nodeOpacity[2]).toBeLessThan(0.95);
      expect(restored.sectors[0].opacity).toBe(1);
      expect(restored.geometry).toEqual(root.geometry);
      // A leaf focuses its parent rather than leaving an empty view; a missed click resets.
      await clickLabel(root, "Identity");
      await snapshot(5850);
      expect((await snapshot(6600)).labels.map((t) => t.text)).toContain("Brand");
      await clickCanvas(8, 8, []);
      await snapshot(7250);
      expect((await snapshot(8000)).geometry).toEqual(root.geometry);
      const arithmetic = await page.evaluate(() => window.__examples.plot.getDiagnostics().expressionPlans
        .filter(entry => entry.consumer === "mark channels" && entry.compiled > 0));
      expect(arithmetic.some(entry => entry.mark === "Text")).toBe(true);
      for (const entry of arithmetic) expect(entry.fallback, `${language} ${entry.mark} arithmetic`).toBe(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.__examples.settle());
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('expandable tree',()=>{
  test.use({deviceScaleFactor:2});
  for(const [language,url] of [['Python scene','/examples/expandable-tree'],['Svelte','/test/gallery-example?id=expandable-tree']]){
    test(`${language} collapses independent branches and animates branch contributions`,async({page},testInfo)=>{
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);
      await page.waitForFunction(()=>window.__examples?.plot&&[...document.querySelectorAll('.canvas')]
        .every(c=>c.getAttribute('aria-busy')==='false'));
      await page.evaluate(async()=>{await window.__examples.settle();await window.__examples.plot.whenAnimationsFinished();
        await window.__examples.plot.setAnimationTime(1000);});
      const canvas=page.locator('.example canvas').first();await canvas.scrollIntoViewIfNeeded();
      const snapshot=time=>page.evaluate(async time=>{
        const plot=window.__examples.plot;await plot.setAnimationTime(time);await plot.whenSettled();
        const {blob,report}=await plot.exportSVG({mode:'vector'});
        const svg=new DOMParser().parseFromString(await blob.text(),'image/svg+xml');
        return {labels:[...svg.querySelectorAll('text')].map(t=>({name:t.textContent,x:Number(t.getAttribute('x')),y:Number(t.getAttribute('y'))})),
          geometry:[...svg.querySelectorAll('path,circle')].map(p=>p.outerHTML).join(''),rasters:report.rasterLayers.length};
      },time);
      const names=state=>state.labels.map(t=>t.name);
      const click=async(state,name,shift=true)=>{
        const label=state.labels.find(t=>t.name===name);expect(label).toBeTruthy();
        await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
        if(shift)await page.keyboard.down('Shift');
        await page.mouse.click(box.x+label.x,box.y+label.y+21);
        if(shift)await page.keyboard.up('Shift');
        // Picking finishes asynchronously. Wait for its transition before moving a frozen clock.
        await page.waitForFunction(()=>window.__examples.plot.getDiagnostics().animation.active>0);
        await page.evaluate(()=>window.__examples.settle());
      };
      const root=await snapshot(1000);expect(root.labels).toHaveLength(9);expect(root.rasters).toBe(0);
      await click(root,'Design');
      const halfway=await snapshot(1300),collapsed=await snapshot(2400);
      expect(halfway.geometry).not.toEqual(collapsed.geometry);
      expect(names(collapsed)).toEqual(expect.arrayContaining(['Studio','Design','Engineering','Platform','Experience']));
      expect(names(collapsed)).not.toContain('Brand');
      await canvas.screenshot({path:testInfo.outputPath('tree-collapsed.png')});
      await click(collapsed,'Engineering');const both=await snapshot(3800);expect(names(both)).toEqual(['Studio','Design','Engineering']);
      await click(both,'Design');const reopened=await snapshot(5200);
      expect(names(reopened)).toContain('Identity');expect(names(reopened)).not.toContain('Platform');
      // Reset all collapse state via the background, then use the shared depth filter.
      await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.mouse.click(box.x+8,box.y+8);
      await page.evaluate(()=>window.__examples.settle());expect((await snapshot(6600)).labels).toHaveLength(9);
      const depth=page.getByRole('slider',{name:'Visible depth'});await depth.focus();await depth.press('Home');await depth.press('ArrowRight');
      await page.evaluate(()=>window.__examples.settle());const shallow=await snapshot(8000);
      expect(names(shallow)).toEqual(['Studio','Design','Engineering']);expect(errors).toEqual([]);
    });
  }
});

test.describe('GPU tree layout progress',()=>{
  test.use({deviceScaleFactor:2});
  for(const [id,label,offset] of [['sunburst','Design',0],['expandable-tree','Design',21]]){
    test(`${id} draws intermediate geometry during warmed layout animation`,async({page},testInfo)=>{
      await page.addInitScript(installGpuCounters);await page.addInitScript(installGpuErrors);
      await page.goto(`/test/gallery-example?id=${id}`);
      await page.waitForFunction(()=>window.__examples?.plot&&[...document.querySelectorAll('.canvas')].every(c=>c.getAttribute('aria-busy')==='false'));
      await page.evaluate(()=>window.__examples.settle());
      await page.evaluate(()=>window.__examples.plot.getDiagnostics({enabled:true}));
      const canvas=page.locator('.example canvas').first();await canvas.scrollIntoViewIfNeeded();
      const click=async()=>{
        const point=await page.evaluate(async label=>{const {blob}=await window.__examples.plot.exportSVG({mode:'vector'});
          const doc=new DOMParser().parseFromString(await blob.text(),'image/svg+xml');const t=[...doc.querySelectorAll('text')].find(t=>t.textContent===label);
          return{x:+t.getAttribute('x'),y:+t.getAttribute('y')};},label);
        const box=await canvas.boundingBox();await page.mouse.click(box.x+point.x,box.y+point.y+offset);
        await page.waitForFunction(()=>window.__examples.plot.getDiagnostics().animation.active>0);
        // Leaving the canvas cancels pending picks: move only after the click dispatched.
        await page.mouse.move(0,0);
      };
      await click();await page.evaluate(async()=>{
        const plot=window.__examples.plot;
        // Exports overlap each other and layout publication; none may strand the live clock.
        await Promise.all([plot.exportPNG(),plot.exportSVG({mode:'vector'})]);
        await plot.whenAnimationsFinished();
      });
      const box=await canvas.boundingBox();await page.mouse.click(box.x+8,box.y+8);
      await page.waitForFunction(()=>window.__examples.plot.getDiagnostics().animation.active>0);
      await page.evaluate(()=>window.__examples.plot.whenAnimationsFinished());
      const before=await gpuCounters(page);
      const shaderBefore=await page.evaluate(()=>window.__examples.plot.getDiagnostics().instrumentation.shaders);
      await page.evaluate(()=>{const p=window.__examples.plot;window.__treeTrace=[];window.__treeTraceStop=false;
        let prior=-1;const trace=()=>{const d=p.getDiagnostics();if(d.completedFrame!==prior){prior=d.completedFrame;
          window.__treeTrace.push({frame:prior,time:performance.now(),bounds:p.getFrames()[0].getFrameOptions().get('xbounds')});}
          if(!window.__treeTraceStop)requestAnimationFrame(trace);};requestAnimationFrame(trace);});
      await click();await page.waitForTimeout(1600);
      const trace=await page.evaluate(()=>{window.__treeTraceStop=true;return window.__treeTrace;});
      const work=await countersDelta(page,before,await gpuCounters(page));
      const shaderAfter=await page.evaluate(()=>window.__examples.plot.getDiagnostics().instrumentation.shaders);
      expect(shaderAfter.builds).toBe(shaderBefore.builds);
      expect(shaderAfter.events.some(e=>e.kind==='picking-material'&&e.mark==='Rect')).toBe(id==='sunburst');
      expect(trace.length).toBeGreaterThan(12);expect(new Set(trace.map(r=>JSON.stringify(r.bounds))).size).toBeGreaterThan(10);
      expect(work.compute).toBe(0);expect(work.render).toBe(0);expect(await page.evaluate(()=>window.__gpuErrors)).toEqual([]);
      const png=await canvas.screenshot({path:testInfo.outputPath(`${id}-gpu-live.png`)}),pixel=pixelReader(png);
      let colored=0;for(let y=0;y<png.readUInt32BE(20);y+=4)for(let x=0;x<png.readUInt32BE(16);x+=4){const [r,g,b]=pixel(x,y);if(b>r+15)colored++;}
      expect(colored).toBeGreaterThan(100);
      await testInfo.attach('layout-progress.json',{body:Buffer.from(JSON.stringify({trace,work,shaders:shaderAfter})),contentType:'application/json'});
    });
  }
});

async function openExample(page, id, title) {
  await page.goto(`/examples/${id}`);
  await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__examples?.plot), undefined, { timeout: 30000 });
  await page.evaluate(() => window.__examples.settle());
  await expect(page.locator(".live-example canvas").first()).toBeVisible();
}

test("gallery includes code and works when WebGPU is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    }),
  );
  const titles = [
    "Point symbols",
    "Lines & vector fields",
    "Density & surfaces",
    "Images",
    "Linked views & minimap",
    "Axes & datetime",
    "Interactive textures",
    "Spherical coordinates",
  ];
  for (const title of titles) {
    await page.goto("/examples");
    // The first visit compiles the gallery on a fresh dev server (over 5 s under load).
    await expect(
      page.getByRole("heading", { name: "Examples", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("link", { name: new RegExp(`^${escape(title)}`) })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByLabel("Live example")).toContainText("This example needs WebGPU");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(source(page)).not.toBeEmpty();
  }
  await page.goto("/examples/linked");
  await expect(source(page)).toContainText("<Plot");
  // The prerendered page shows its source before it hydrates, and a click before then does
  // nothing (DOCS_REVIEW, Stage 68): click until the page answers (it failed once under load).
  await expect(async () => {
    await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "Python", exact: true }).click();
    await expect(source(page)).toContainText("hm.", { timeout: 1000 });
  }).toPass({ timeout: 30000 });
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "Svelte", exact: true }).click();
  await expect(source(page)).toContainText("<Plot");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(391);
});

test("documentation routes expose the guide and both API references", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "HMPlot", exact: true, level: 1 })).toBeVisible();
  // The guide opens on the maintainer's introduction (R2.0b.6); the installation page and the
  // others follow in the section navigation.
  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "User guide" }).click();
  await expect(page).toHaveURL(/\/docs\/introduction$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Introduction");
  const sections = page.getByRole("complementary", { name: "Section navigation" });
  await sections.getByRole("link", { name: "Installation and first plot", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/start$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Installation and first plot");
  await sections.getByRole("link", { name: "Scales", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Scales");
  await expect(page.locator("article")).toContainText("axes (x, y and z) determine where values fall in space");

  // /svelte and /python open the Plot reference in that language: its example's source.
  for (const [route, language, text] of [["/svelte", "Svelte", "<Plot"], ["/python", "Python", "hm."]]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Plot", exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole("group", { name: "Code language" }).getByRole("button", { name: language, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(source(page)).toContainText(text);
  }
});

test("small GPU examples render and cleanly switch with source visible", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /GPU|WGSL|shader|validation/i.test(m.text()))
      errors.push(m.text());
  });
  await openExample(page, "symbols", "Point symbols");
  await expect(source(page)).toContainText("Points");
  await page.getByLabel("Shape", { exact: true }).selectOption("diamond");
  await page.evaluate(() => window.__examples.settle());
  for (const [id, title] of [
    ["paths", "Lines & vector fields"],
    ["linked", "Linked views & minimap"],
    ["axes", "Axes & datetime"],
    ["texture", "Interactive textures"],
  ]) {
    await openExample(page, id, title);
  }
  await expect(page.getByRole("application", { name: "Plot overview" })).toHaveCount(0);
  await openExample(page, "surface", "Density & surfaces");
  await page.getByLabel("View", { exact: true }).selectOption("3d");
  await page.evaluate(() => window.__examples.settle());
  await openExample(page, "image", "Images");
  await openExample(page, "sphere", "Spherical coordinates");
  await page.getByLabel("View", { exact: true }).selectOption("3d");
  await expect(
    page.getByRole("application", { name: "3D navigation" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByLabel("View", { exact: true }).selectOption("2d");
  await expect(
    page.getByRole("application", { name: "Plot overview" }),
  ).toBeVisible({ timeout: 15000 });
  await openExample(page, "symbols", "Point symbols");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__examples.settle());
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(391);
  expect(errors).toEqual([]);
});

test("statistical transforms, staple marks, and polar sectors publish complete frames", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const id of ["density", "pivot-fold", "quantile-aggregate", "violin", "box-plot", "swarm", "bar", "stacked-percent", "lollipop", "sunburst", "facet-fields", "pie", "donut", "pie-facet", "drag-matrix", "drag-map",
    // TODO 47: fits, ECDFs, density contours, and Voronoi cells, hulls and a Delaunay triangulation.
    "smooth", "ecdf", "density-contours", "voronoi", "calendar", "market-hours", "weekdays"]) {
    await page.goto(`/examples/${id}`);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll(".canvas")].length > 0 && [...document.querySelectorAll(".canvas")].every((element) => element.getAttribute("aria-busy") === "false"),
      undefined,
      { timeout: 30000 },
    );
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

// TODO 39.7: the streamgraph's Offset control. In the exported PNG the stream is the widest run
// of columns with saturated pixels (axes and text are gray, the legend's swatches a run of their
// own); per column its top and bottom row. center puts every stack's middle on one row, wiggle
// moves the same thicknesses (up to the axis scale) up and down, off one row both at the middle
// and at the bottom, zero starts every stack on one row, and expand gives every stack one top and
// one bottom.
test("the streamgraph example places its stacks by offset", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "streamgraph", "Streamgraph");
  const profile = async (offset) => {
    await page.getByRole("combobox", { name: "Offset" }).selectOption({ label: offset });
    return page.evaluate(async () => {
      const plot = window.__examples.plot;
      await window.__examples.settle();
      await plot.whenSettled();
      await plot.whenAnimationsFinished();
      const bitmap = await createImageBitmap(await plot.exportPNG());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const columns = Array.from({ length: width }, (_, x) => {
        let top = -1, bottom = -1;
        for (let y = 0; y < height; y++) {
          const i = (y * width + x) * 4;
          if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 40) {
            if (top < 0) top = y;
            bottom = y;
          }
        }
        return top < 0 ? null : { top, bottom };
      });
      let best = [0, 0];
      for (let x = 0, start = 0; x <= width; x++)
        if (x === width || !columns[x]) { if (x - start > best[1] - best[0]) best = [start, x]; start = x + 1; }
      // The middle of the stream, clear of its ends.
      const span = best[1] - best[0];
      return { error: plot.getRenderError?.() ?? "", span, columns: columns.slice(best[0] + Math.round(span * 0.1), best[1] - Math.round(span * 0.1)) };
    });
  };
  const range = (values) => Math.max(...values) - Math.min(...values);
  const middle = (p) => p.columns.map((c) => (c.top + c.bottom) / 2);
  // Different y labels need different gutters. Compare thickness at the same relative x
  // positions, independent of the number of canvas pixels available to each stack.
  const thickness = (p) => {
    const t = p.columns.map((c) => c.bottom - c.top), most = Math.max(...t);
    return Array.from({ length: 101 }, (_, i) => t[Math.round(i * (t.length - 1) / 100)] / most);
  };
  const wiggle = await profile("wiggle"), center = await profile("center"), zero = await profile("zero"), expand = await profile("expand");
  const detail = JSON.stringify({ spans: [wiggle.span, center.span, zero.span, expand.span], middle: [range(middle(wiggle)), range(middle(center))] });
  for (const p of [wiggle, center, zero, expand]) {
    expect(p.error).toBe("");
    expect(p.span, detail).toBeGreaterThan(300);
  }
  expect(range(middle(center)), detail).toBeLessThanOrEqual(3);
  expect(range(middle(wiggle)), detail).toBeGreaterThan(10);
  expect(range(wiggle.columns.map((c) => c.bottom)), detail).toBeGreaterThan(20);
  const drift = Math.max(...thickness(wiggle).map((v, i) => Math.abs(v - thickness(center)[i])));
  expect(drift, detail).toBeLessThan(0.05);
  expect(range(zero.columns.map((c) => c.bottom)), detail).toBeLessThanOrEqual(2);
  expect(range(zero.columns.map((c) => c.top)), detail).toBeGreaterThan(20);
  expect(range(expand.columns.map((c) => c.top)), detail).toBeLessThanOrEqual(2);
  expect(range(expand.columns.map((c) => c.bottom)), detail).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test.describe("gallery controls and animated maps", () => {
  test.use({ deviceScaleFactor: 2 });
  for (const language of ["Python", "Svelte"]) test(`streamgraph HMPlot controls animate the area geometry and can disable transitions (${language})`, async ({ page }) => {
    if (language === "Python") {
      await openExample(page, "streamgraph", "Streamgraph");
      await expect(page.locator('.live.ready')).toBeVisible();
      await page.getByRole("group", { name: "Code language" }).getByRole("button", { name: "Python", exact: true }).click();
      await expect(source(page)).toContainText("with hm.Stack");
      await expect(page.getByRole("button", { name: "Edit in Python", exact: true })).toBeVisible();
    } else {
      await page.goto("/test/gallery-example?id=streamgraph");
      await page.waitForFunction(() => window.__streamgraph?.plot);
      await expect(page.locator('.canvas')).toHaveAttribute("aria-busy", "false");
      await page.evaluate(() => {
        const plot = window.__streamgraph.plot;
        window.__examples = { plot, settle: () => plot.whenSettled() };
      });
    }
    await expect(page.locator('.hm-input select')).toHaveCount(2);
    await expect(page.getByRole("checkbox", { name: "Animate", exact: true })).toBeChecked();
    await page.evaluate(async () => {
      await window.__examples.plot.whenAnimationsFinished();
      await window.__examples.plot.setAnimationTime(1000);
    });
    let clockOffset = 0;
    const snapshot = (time) => page.evaluate(async (time) => {
      const plot = window.__examples.plot;
      await plot.setAnimationTime(time);
      await plot.whenSettled();
      return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await (await plot.exportPNG()).arrayBuffer())));
    }, time + clockOffset);
    const before = await snapshot(1000);
    // Every offset can return to the original layout after completing a transition.
    // Decimal domain endpoints must not turn inferred bounds into a manual override.
    let time = 1000;
    for (const offset of ["expand", "zero", "center"]) {
      await page.getByRole("combobox", { name: "Offset" }).selectOption({ label: offset });
      await page.evaluate(async () => { await window.__streamgraph?.stack?.whenSettled(); await window.__examples.settle(); });
      time += 700;
      expect(await snapshot(time)).not.toEqual(before);
      await page.getByRole("combobox", { name: "Offset" }).selectOption({ label: "wiggle" });
      await page.evaluate(async () => { await window.__streamgraph?.stack?.whenSettled(); await window.__examples.settle(); });
      time += 700;
      expect(await snapshot(time)).toEqual(before);
    }
    // Keep GPU row-state time monotonic when continuing the interruption checks.
    clockOffset = time - 1000;
    await snapshot(1000);
    await page.getByRole("combobox", { name: "Offset" }).selectOption({ label: "zero" });
    await page.evaluate(async () => { await window.__streamgraph?.stack?.whenSettled(); await window.__examples.settle(); });
    const start = await snapshot(1000), middle = await snapshot(1350), end = await snapshot(1700);
    expect(start).toEqual(before);
    expect(middle).not.toEqual(start);
    expect(middle).not.toEqual(end);
    // Interrupt both the stack and its inferred scale: continue from what is displayed.
    const interrupted = await snapshot(1850);
    await page.getByRole("combobox", { name: "Offset" }).selectOption({ label: "expand" });
    await page.evaluate(async () => { await window.__streamgraph?.stack?.whenSettled(); await window.__examples.settle(); });
    expect(await snapshot(1850)).toEqual(interrupted);
    await snapshot(2200);
    const expanding = await snapshot(2200);
    await page.getByRole("combobox", { name: "Offset" }).selectOption({ label: "center" });
    await page.evaluate(async () => { await window.__streamgraph?.stack?.whenSettled(); await window.__examples.settle(); });
    expect(await snapshot(2200)).toEqual(expanding);
    await snapshot(2900);
    await page.getByRole("checkbox", { name: "Animate", exact: true }).uncheck();
    await page.getByRole("combobox", { name: "Offset" }).selectOption({ label: "zero" });
    await page.evaluate(async () => { await window.__streamgraph?.stack?.whenSettled(); await window.__examples.settle(); });
    expect(await snapshot(2900)).toEqual(await snapshot(3250));
    await page.evaluate(() => window.__examples.plot.setAnimationTime(null));
    await page.getByRole("checkbox", { name: "Animate", exact: true }).check();
    await page.getByRole("combobox", { name: "Order" }).selectOption({ label: "reverse" });
    const frames = await page.evaluate(async () => {
      await window.__streamgraph?.stack?.whenSettled();
      const plot = window.__examples.plot;
      await plot.whenSettled();
      const before = plot.getDiagnostics().completedFrame;
      await plot.whenAnimationsFinished();
      return plot.getDiagnostics().completedFrame - before;
    });
    expect(frames).toBeGreaterThan(2);
  });

  test("projection inputs preserve seam cuts, reuse geometry and release workers", async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(installGpuCounters);
    await page.addInitScript(installGpuErrors);
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__geoWorkers = { made: 0, live: 0 };
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); window.__geoWorkers.made++; window.__geoWorkers.live++; }
        terminate() { if (!this.stopped) { this.stopped = true; window.__geoWorkers.live--; } super.terminate(); }
      };
    });
    await openExample(page, "map-projections", "World map projections");
    const diagnostic = () => page.evaluate(() => window.__projections.mark.getDiagnostics());
    const initial = await diagnostic();
    expect(initial.faceInstances).toBeLessThan(120000);
    await expect(page.locator('.hm-input select')).toHaveCount(1);
    await expect(page.locator('.hm-input input[type="range"]')).toHaveCount(1);
    await page.getByRole("combobox", { name: "Projection", exact: true }).selectOption({ label: "natural-earth" });
    await page.evaluate(() => window.__examples.settle());
    expect((await diagnostic()).geometryPreparations).toBe(initial.geometryPreparations);
    const setCenter = (value) => page.getByRole("slider", { name: "Center longitude" }).evaluate((el, value) => {
      el.value = value; el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    const digest = () => page.evaluate(async () => {
      await window.__examples.settle();
      return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await (await window.__examples.plot.exportPNG()).arrayBuffer())));
    });
    for (const value of [5, 10, 15, 20, 25, 30]) { await setCenter(value); await page.evaluate(() => window.__examples.settle()); }
    expect(await page.evaluate(() => window.__geoWorkers.made)).toBe(1);
    // Warm the full tested longitude range: a newly larger mesh may grow storage capacity.
    for (const value of [0, 90, -120, 150, 30]) { await setCenter(value); await page.evaluate(() => window.__examples.settle()); }
    const at30 = await digest(), warm = await gpuCounters(page);
    // Settling after a gesture hid the lack of draws while each input restarted the worker.
    const recording = page.evaluate(async (measure) => {
      const slider = document.querySelector('.hm-input input[type="range"]');
      const initial = window.__projections.mark.getDiagnostics().geometryPreparations;
      let edits = 0;
      const timer = setInterval(() => {
        slider.value = String(-120 + (edits++ % 55) * 5);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      }, 8);
      try { return { ...await (0, eval)(`(${measure})`)(window.__examples.plot), edits,
        geometryPreparations: window.__projections.mark.getDiagnostics().geometryPreparations - initial }; }
      finally { clearInterval(timer); }
    }, subdivisionProgress.toString());
    await page.waitForTimeout(750);
    const live = await page.locator('.live-example canvas').first().screenshot({ path: testInfo.outputPath("projection-live.png") });
    const pixel = pixelReader(live);
    let liveColor = 0;
    for (let y = 0; y < live.readUInt32BE(20); y++) for (let x = 0; x < live.readUInt32BE(16); x++) {
      const rgb = pixel(x, y);
      if (Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) > 40) liveColor++;
    }
    expect(liveColor).toBeGreaterThan(10000);
    const progress = await recording;
    console.log("map subdivision progress", progress);
    expect(progress.edits).toBeGreaterThan(100);
    expect(progress.completedFrames).toBeGreaterThan(progress.animationFrames * 0.5);
    expect(progress.geometryPreparations).toBeGreaterThan(10);
    expect(progress.maxGap).toBeLessThan(250);
    expect(await page.evaluate(() => window.__geoWorkers.made)).toBe(1);
    await setCenter(30);
    await page.evaluate(() => window.__examples.settle());
    const work = await countersDelta(page, warm, await gpuCounters(page));
    expect(work.shaders).toBe(0);
    expect(await digest()).toEqual(at30);
    const image = await page.evaluate(async () => {
      const bitmap = await createImageBitmap(await window.__examples.plot.exportPNG());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) if (Math.max(...pixels.slice(i, i + 3)) - Math.min(...pixels.slice(i, i + 3)) > 40) colored++;
      return colored;
    });
    expect(image).toBeGreaterThan(10000);
    expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);
    await page.getByRole("link", { name: "Examples", exact: true }).first().click();
    await expect.poll(() => page.evaluate(() => window.__geoWorkers.live)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("paired Manhattan defaults to streamed tiles and changes detail without moving the camera", async ({ page }) => {
    const errors = watchErrors(page);
    const blocks = encodeVectorTile([
      { name: "land", features: [{ type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] }] },
      { name: "buildings", features: [{ type: 3, properties: { height: 150 }, geometry: [square(200, 200, 1800, 1800)] }] },
    ]);
    await serveTiles(page, path => path.startsWith("14/") ? blocks : LAND_TILE);
    await openExample(page, "manhattan-flyover", "Manhattan building flyover");
    await expect(page.locator('.live.ready')).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Buildings", exact: true })).toHaveValue("1");
    const camera = await page.evaluate(() => window.__examples.plot.getCamera());
    expect(camera.position[1]).toBeLessThan(3.3);
    const image = () => page.evaluate(async () => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await (await window.__examples.plot.exportPNG()).arrayBuffer()))));
    const before = await image();
    await page.getByRole("slider", { name: "Tile detail", exact: true }).evaluate(el => {
      el.value = "-2"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.evaluate(() => window.__examples.settle());
    expect(await image()).not.toEqual(before);
    expect(await page.evaluate(() => window.__examples.plot.getCamera())).toEqual(camera);
    expect(errors).toEqual([]);
  });
});

test("connection examples draw their connectors (Stage 15)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  for (const [id, title, minimum] of [
    ["before-after-arrows", "Before and after arrows", 1200],
    ["parallel-coordinates-connected", "Parallel coordinates from connections", 3500],
  ]) {
    await openExample(page, id, title);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    // The connectors are the only saturated marks (points, labels, and axes are gray).
    const state = await page.evaluate(async () => {
      const plot = window.__examples.plot;
      await plot.whenSettled();
      const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let saturated = 0;
      for (let i = 0; i < data.length; i += 4)
        if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 60) saturated++;
      return { error: plot.getRenderError?.() ?? "", saturated };
    });
    expect(state.error, id).toBe("");
    expect(state.saturated, id).toBeGreaterThan(minimum);
  }
  expect(errors).toEqual([]);
});

test("parallel coordinates: a Frame per cell draws only the cells' y axes, and a cell's axis brushes its field", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await openExample(page, "parallel-coordinates-connected", "Parallel coordinates from connections");
  await page.locator(".live-example").scrollIntoViewIfNeeded();
  // Cells in facet order (bill_length, bill_depth, flipper, mass): each cell's frame precedes the
  // Frame inside it and both share one rect, so distinct left edges are the cells.
  const geometry = () => page.evaluate(async () => {
    const plot = window.__examples.plot;
    await plot.whenSettled();
    const host = document.querySelector('.live-example [aria-label="Plot canvas"]');
    const origin = host.getBoundingClientRect(), svgs = [...host.querySelectorAll('svg[aria-label="2D coordinate axes"]')];
    const count = (selector) => svgs.reduce((total, svg) => total + svg.querySelectorAll(selector).length, 0);
    const lefts = [...new Set(plot.getAxes().slice(1).map((axes) => axes.getAxisLayout()).filter(Boolean).map((layout) => JSON.stringify(layout && [layout.left, layout.top, layout.bottom])))]
      .map((text) => JSON.parse(text)).sort((a, b) => a[0] - b[0]);
    return { axes2d: plot.getAxes()[0].getFrameOptions().child("plot").get("axes2d"), frames: plot.getAxes().length,
      cells: lefts.map(([left, top, bottom]) => ({ left: origin.left + left, top: origin.top + top, bottom: origin.top + bottom })),
      xTicks: count(".x-tick"), xTitles: count(".x-title"), yTitles: count(".y-title"), error: plot.getRenderError(),
      yTitleTexts: svgs.flatMap((svg) => [...svg.querySelectorAll(".y-title")].map((title) => title.textContent)) };
  });
  await expect.poll(async () => (await geometry()).cells.length).toBe(4);
  const state = await geometry();
  // No root axes (axes2d={false}) and no x axis in any cell: the Frames own x.
  expect(state).toMatchObject({ axes2d: false, frames: 9, xTicks: 0, xTitles: 0, yTitles: 4, error: "" });
  // Each cell's y axis is titled by its measurement: `value` is the cell's field (TODO 21).
  expect(state.yTitleTexts).toEqual(["bill_length", "bill_depth", "flipper", "mass"]);
  const drag = async (cell, from, to) => {
    const x = cell.left - 8, h = cell.bottom - cell.top;
    await page.keyboard.down("Shift");
    await page.mouse.move(x, cell.top + from * h); await page.mouse.down();
    await page.mouse.move(x, cell.top + to * h, { steps: 8 }); await page.mouse.up();
    await page.keyboard.up("Shift");
  };
  const constraints = () => page.evaluate(() => window.__examples.plot.getBrush().getConstraints().map(({ name }) => name).sort());
  await drag(state.cells[2], 0.05, 0.45);
  await expect.poll(constraints).toEqual(["flipper"]);
  await drag(state.cells[3], 0.05, 0.6);
  await expect.poll(constraints).toEqual(["flipper", "mass"]);
  const brushed = await page.evaluate(() => window.__examples.plot.getBrush().status().committedCount);
  expect(brushed).toBeGreaterThan(0);
  expect(brushed).toBeLessThan(60);
  expect(errors).toEqual([]);
});

// TODO 17.12: the brushed filter chain example: a brush drives Filter > Bin and Filter > Group.
test("the brushed filter chain example follows a brush", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await openExample(page, "brushed-filter-chain", "Brushed filter chain");
  const state = () => page.evaluate(async () => {
    const { histogram, bars } = window.__brushedFilterChain;
    await window.__examples.settle();
    await Promise.all([histogram.whenSettled(), bars.whenSettled()]);
    return { errors: [histogram, bars].map((plot) => plot.getRenderError() ?? ""), rows: Math.max(...histogram.getAxes()[0].getAxisLayout().y.major.map((tick) => tick.value)) };
  });
  const whole = await state();
  expect(whole.errors).toEqual(["", ""]);
  const b = await primaryInterior(page);
  await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width * (0.2 + 0.03 * i), b.y + b.height * (0.2 + 0.03 * i));
  await page.mouse.up(); await page.keyboard.up("Shift");
  const brushed = await state();
  expect(brushed.errors).toEqual(["", ""]);
  // A 30% by 30% brush keeps about a tenth of the rows: the count axis (its top tick) shrinks.
  expect(brushed.rows, JSON.stringify({ whole, brushed })).toBeLessThan(whole.rows / 3);
  expect(brushed.rows, JSON.stringify({ whole, brushed })).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

// Stage 17 showcase: the running totals example (Filter > Sort > Window) follows a brush.
const primaryInterior = async page => {
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  const layout = await page.evaluate(() => window.__examples.plot.getAxisLayout());
  return {x:box.x+layout.left,y:box.y+layout.top,width:layout.right-layout.left,height:layout.bottom-layout.top};
};
const shiftDrag = async (page, from, to) => {
  const b = await primaryInterior(page);
  await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width * (from[0] + (to[0] - from[0]) * i / 10), b.y + b.height * (from[1] + (to[1] - from[1]) * i / 10));
  await page.mouse.up(); await page.keyboard.up("Shift");
};
/** How many pixels of the page's region `clip` (CSS pixels) `keep(r, g, b)` keeps, at the page's pixel ratio. */
async function regionPixels(page, clip, keep) {
  const ratio = await page.evaluate(() => devicePixelRatio);
  const read = pixelReader(await page.screenshot({ clip }));
  let n = 0;
  for (let y = 0; y < Math.floor(clip.height * ratio); y++)
    for (let x = 0; x < Math.floor(clip.width * ratio); x++) if (keep(...read(x, y))) n++;
  return n;
}
/** The plot's completed frames while `act` runs (or over `ms` without one), per second. */
async function frameRate(page, act, ms = 1000) {
  const count = () => page.evaluate(() => window.__examples.plot.getDiagnostics().completedFrame);
  const [first, start] = [await count(), Date.now()];
  if (act) await act(); else await page.waitForTimeout(ms);
  return ((await count()) - first) / ((Date.now() - start) / 1000);
}

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

test("the running totals example follows a brush", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "running-totals", "Running totals under a brush");
  const state = () => page.evaluate(async () => {
    const { totals, averages } = window.__runningTotals;
    await Promise.all([window.__examples.settle(), totals.whenSettled(), averages.whenSettled()]);
    return { errors: [totals, averages].map((p) => p.getRenderError() ?? ""), total: Math.max(...totals.getAxes()[0].getAxisLayout().y.major.map((t) => t.value)) };
  });
  const whole = await state();
  expect(whole.errors).toEqual(["", ""]);
  await shiftDrag(page, [0.3, 0.05], [0.45, 0.95]);
  const brushed = await state();
  expect(brushed.errors).toEqual(["", ""]);
  // About a sixth of the year: the cumulative total ends far below the whole year's.
  expect(brushed.total, JSON.stringify({ whole, brushed })).toBeLessThan(whole.total / 2);
  expect(brushed.total).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("twin coordinate frames draw their own axes, not the Plot's empty one", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/examples/twin-axes");
  // A paired example (TODO 69.10): its labelled static preview shows until the live plot has
  // drawn, which took over 5 s in a loaded full run; read the live plot's axes once it is shown.
  await expect(page.locator(".live-example .live.ready")).toBeVisible({ timeout: 30000 });
  const axes = page.locator(".live-example").getByRole("img", { name: "2D coordinate axes" });
  // Each Frame draws its own axes.
  await expect(page.locator(".live-example")).toContainText("Temperature · °C");
  await expect(page.locator(".live-example")).toContainText("Rainfall · mm");
  // Both Frames own x and y, so the Plot's own frame has nothing to show ([-1, 1] ticks).
  const ticks = await axes.evaluateAll((nodes) => nodes.flatMap((node) => [...node.querySelectorAll("*")].map((el) => el.textContent.trim())));
  expect(ticks).not.toContain("−0.5");
  expect(errors).toEqual([]);
});

// Parked showcase examples (TODO 17.14): register once each measures clean.
test("the brushed distributions example follows a brush", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "brushed-distributions", "Brushed distributions");
  const state = () => page.evaluate(async () => {
    const { violins, boxes } = window.__brushedDistributions;
    await Promise.all([window.__examples.settle(), violins.whenSettled(), boxes.whenSettled()]);
    return { errors: [violins, boxes].map((plot) => plot.getRenderError() ?? ""), low: Math.min(...boxes.getAxes()[0].getAxisLayout().y.major.map((t) => t.value)) };
  });
  const whole = await state();
  expect(whole.errors).toEqual(["", ""]);
  // Values grow with distance from the middle: a brush in the middle drops the high values.
  await shiftDrag(page, [0.42, 0.42], [0.58, 0.58]);
  const brushed = await state();
  expect(brushed.errors).toEqual(["", ""]);
  expect(await page.evaluate(() => window.__examples.plot.getBrush().getConstraints().length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the moving particles example plays, pauses and filters", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/examples/moving-particles");
  await page.waitForFunction(() => Boolean(window.__movingParticles && window.__examples?.plot), undefined, { timeout: 30000 });
  // It starts playing once the plot has drawn.
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 30000 });
  const time = () => page.locator(".controls span").textContent();
  const before = await time();
  await expect.poll(time).not.toBe(before);
  await page.evaluate(() => window.__movingParticles.setTime(20));
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.evaluate(() => window.__examples.settle());
  await page.evaluate(() => window.__movingParticles.setMinimum(0.6));
  await page.evaluate(() => window.__examples.settle());
  expect(await time()).toBe("time 20.0");
  expect(await page.evaluate(() => window.__examples.plot.getRenderError() ?? "")).toBe("");
  expect(errors).toEqual([]);
});

test("the inputs example reads its options and range from the data, and filters by them", async ({ page }) => {
  // TODO 41: inputs read by name; the Species options and the Minimum x range come from the data.
  const errors = watchErrors(page);
  await openExample(page, "inputs", "Inputs");
  const species = page.getByRole("combobox", { name: "Species" }), start = page.getByRole("slider", { name: "Minimum x" });
  await expect(species).toBeEnabled();
  expect(await species.locator("option").allTextContents()).toEqual(["A", "B", "C"]);
  expect(Number(await start.getAttribute("min"))).toBeCloseTo(-0.996, 2);
  expect(Number(await start.getAttribute("max"))).toBeCloseTo(2.998, 2);
  // Bar pixels left of x = 1.4, from a PNG export.
  const barsLeft = () => page.evaluate(async () => {
    const plot = window.__inputsExample.plot;
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG()), canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const layout = plot.getAxes()[0].getAxisLayout(), scale = width / document.querySelector('canvas').getBoundingClientRect().width,
      edge = scale * (layout.left + (1.4 + 1.1) / 4.2 * (layout.right - layout.left));
    let count = 0;
    for (let y = 0; y < height; y++) for (let x = Math.ceil(layout.left * scale) + 2; x < edge; x++) {
      const i = (y * width + x) * 4;
      if (data[i+2] > data[i] + 60 && data[i+2] > data[i+1] + 20) count++;
    }
    return count;
  });
  await species.selectOption({ label: "B" });
  const before = await barsLeft();
  expect(before).toBeGreaterThan(100);
  // Minimum x to about 1.5: the Filter drops every bar left of it (a few edge pixels stay).
  await start.focus();
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(barsLeft).toBeLessThan(before / 20);
  expect(errors).toEqual([]);
});

test("the inputs example's Playback plays, pauses and resets", async ({ page }) => {
  // TODO 41.4: play advances Minimum x, pause holds it, reset returns it to its first value.
  const errors = watchErrors(page);
  await openExample(page, "inputs", "Inputs");
  const start = page.getByRole("slider", { name: "Minimum x" });
  await expect(start).toBeEnabled();
  const first = Number(await start.inputValue());
  await page.getByRole("button", { name: "Play Minimum x" }).click();
  await expect.poll(async () => Number(await start.inputValue())).toBeGreaterThan(first + 0.15);
  await page.getByRole("button", { name: "Pause Minimum x" }).click();
  const held = Number(await start.inputValue());
  await page.waitForTimeout(600);
  expect(Number(await start.inputValue())).toBe(held);
  await page.getByRole("button", { name: "Reset Minimum x" }).click();
  await expect.poll(async () => Number(await start.inputValue())).toBeCloseTo(first, 5);
  expect(errors).toEqual([]);
});

test("the springs example steps, pauses, settles, wakes on a click and starts again", async ({ page }) => {
  // TODO 42: Simulate steps with the frames (every 16 ms of its clock), Run pauses it, the stop
  // rule settles it, a clicked point's selection wakes it, and Kick starts again from initial.
  const errors = watchErrors(page);
  await page.addInitScript(installGpuCounters);
  await openExample(page, "springs", "Springs");
  const status = () => page.evaluate(() => {
    const { simulation, plot } = window.__springsExample;
    let current;
    simulation.subscribe((value) => (current = value))();
    return { ...current, frame: plot.getDiagnostics().completedFrame };
  });
  // After the first steps and stop check (which compile their kernels once):
  await expect.poll(async () => (await status()).steps).toBeGreaterThan(31);
  const moving = await status(), counters = await gpuCounters(page);
  await expect.poll(async () => (await status()).steps).toBeGreaterThan(moving.steps + 40);
  const stepped = await status(), work = await countersDelta(page, counters, await gpuCounters(page));
  expect(stepped.frame, "each published step is drawn").toBeGreaterThan(moving.frame + 5);
  // A step compiles nothing, and the only read-backs are the stop checks' (one per 30 steps).
  expect({ compute: work.compute, shaders: work.shaders }).toEqual({ compute: 0, shaders: 0 });
  expect(work.readbacks).toBeLessThanOrEqual(Math.ceil((stepped.steps - moving.steps) / 30) + 1);
  await page.getByRole("checkbox", { name: "Run" }).click();
  const held = (await status()).steps;
  await page.waitForTimeout(400);
  expect((await status()).steps).toBe(held);
  await page.getByRole("checkbox", { name: "Run" }).click();
  await expect.poll(async () => (await status()).settled, { timeout: 20000 }).toBe(true);
  const settled = await status();
  await page.waitForTimeout(300);
  expect((await status()).steps, "a settled simulation takes no steps").toBe(settled.steps);
  // Click the top point, (0, 1) in data: its selection pulls it out.
  const at = await page.evaluate(() => {
    const layout = window.__springsExample.plot.getAxisLayout();
    const fraction = (ticks, value) => {
      const [a, b] = ticks;
      return a.fraction + ((value - a.value) / (b.value - a.value)) * (b.fraction - a.fraction);
    };
    return { x: fraction(layout.x.major, 0), y: fraction(layout.y.major, 1) };
  });
  const box = await page.locator(".canvas").first().boundingBox();
  await page.mouse.click(box.x + box.width * at.x, box.y + box.height * (1 - at.y));
  await expect.poll(async () => (await status()).steps).toBeGreaterThan(settled.steps);
  await page.getByRole("button", { name: "Kick" }).click();
  await expect.poll(async () => (await status()).steps).toBeLessThan(settled.steps);
  expect(errors).toEqual([]);
});

test("the half-million threshold example follows its slider", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "half-million-threshold", "Half a million points, one slider");
  const state = () => page.evaluate(async () => {
    const { plot, histogram } = window.__halfMillion;
    await Promise.all([plot.whenSettled(), histogram.whenSettled()]);
    return { errors: [plot, histogram].map((p) => p.getRenderError() ?? ""), rows: Math.max(...histogram.getAxes()[0].getAxisLayout().y.major.map((t) => t.value)) };
  });
  const wide = await state();
  expect(wide.errors).toEqual(["", ""]);
  await page.evaluate(() => window.__halfMillion.setMinimum(4));
  await expect(page.getByText(/^Minimum magnitude .*4\.00: [\d,]+ of 500,000 points$/)).toBeVisible();
  const narrow = await state();
  expect(narrow.errors).toEqual(["", ""]);
  expect(narrow.rows, JSON.stringify({ wide, narrow })).toBeLessThan(wide.rows);
  expect(errors).toEqual([]);
});

// R2.11's flagship 10M-point demo, a gallery program: ten million stars generated on the GPU, two
// age sliders that filter them as they move, a linked H–R diagram; the galaxy and the
// H–R diagram side by side, stacked on a phone. @gpu: SwiftShader draws ten million points too slowly.
test.describe("the ten million stars example", () => {
test.use({ deviceScaleFactor: 2 });
test("filters all ten million on the GPU as its sliders move, and keeps drawing", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  await page.addInitScript(installGpuCounters);
  await page.setViewportSize({ width: 1300, height: 1000 });
  // Exercise the paired native Svelte source; /examples/ten-million-stars mounts its
  // matching Python scene through the full Example component (covered in docs-site).
  await page.goto("/test/gallery-example?id=ten-million-stars");
  await expect(page.getByRole("heading", { name: "Ten million stars, filtered live", exact: true, level: 1 })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__examples?.plot));
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".program .canvas")];
    return canvases.length === 2 && canvases.every(c => c.getAttribute("aria-busy") === "false");
  });
  await page.evaluate(async () => { await __galaxyExample.plot.whenSettled(); await __galaxyExample.hr.whenSettled(); });
  const rowCounts = () => page.evaluate(() => [__galaxyExample.plot, __galaxyExample.hr].map(plot =>
    plot.getDiagnostics().marks.find(mark => mark.fields.position)?.fields.position.count));
  expect(await rowCounts()).toEqual([10_000_000, 100_000]);
  const generated = await page.evaluate(() => __gpuCounters.snapshot());
  console.log(`ten-million-stars initial GPU allocations: ${JSON.stringify(generated)}`);
  await expect(page.locator(".program")).toContainText("fixed sample of 100,000 stars");
  const panels = () => page.locator(".program .canvas").evaluateAll((list) => list.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const [galaxy, hr] = await panels();
  // Three fifths and two fifths, 12 px apart.
  expect(near(hr.x - galaxy.x - galaxy.w, 12) && near(galaxy.y, hr.y), JSON.stringify({ galaxy, hr })).toBe(true);
  expect(Math.abs(galaxy.w / hr.w - 1.5)).toBeLessThan(0.05);
  // Count rendered stars and the temperature-colored H–R sequences.
  const lit = (r, g, b) => Math.max(r, g, b) > 90, colored = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) > 60 || Math.min(r, g, b) > 150;
  const clip = ({ x, y, w, h }) => ({ x, y, width: w, height: h });
  const counts = async () => ({ stars: await regionPixels(page, clip(galaxy), lit), hr: await regionPixels(page, clip(hr), colored) });
  // The canvases' first frames can lag the plots' settling: wait for the galaxy to show.
  await expect.poll(async () => (await counts()).stars, { timeout: 20000 }).toBeGreaterThan(1000);
  const all = await counts();
  expect(all.hr).toBeGreaterThan(1000);
  // The slider moves every frame for two seconds; the plot keeps completing frames meanwhile.
  const oldest = page.getByRole("slider", { name: "Oldest (billion years)" });
  await oldest.fill("9");
  await page.evaluate(() => window.__examples.settle());
  const warm = await page.evaluate(() => __gpuCounters.snapshot());
  const fps = await frameRate(page, () => oldest.evaluate((el) => new Promise((done) => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 2000);
      el.value = String(10 - 9 * t);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (t < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  })));
  console.log(`ten-million-stars: ${fps.toFixed(1)} completed frames a second while filtering`);
  expect(fps).toBeGreaterThan(0);
  await page.evaluate(() => window.__examples.settle());
  expect((await page.evaluate(() => __gpuCounters.snapshot())).shaders).toBe(warm.shaders);
  expect((await counts()).stars).toBeLessThan(all.stars);
  await oldest.fill("10");
  await page.evaluate(async () => { await __examples.settle(); await __galaxyExample.hr.whenSettled(); });
  expect(await rowCounts()).toEqual([10_000_000, 100_000]);
  await page.screenshot({ path: "/tmp/hmplot-stage87-galaxy.png" });
  const cameraBefore = await page.evaluate(() => __galaxyExample.plot.getDiagnostics().completedFrame);
  await page.mouse.move(galaxy.x + galaxy.w * 0.4, galaxy.y + galaxy.h * 0.5);
  await page.mouse.down();
  await page.mouse.move(galaxy.x + galaxy.w * 0.65, galaxy.y + galaxy.h * 0.65, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => __galaxyExample.plot.getDiagnostics().completedFrame)).toBeGreaterThan(cameraBefore);
  await page.evaluate(() => __galaxyExample.plot.whenSettled());
  const beforeBrush = await counts();
  // Select the hot, luminous part of the H–R diagram using the actual pointer gesture.
  await page.keyboard.down("Shift");
  await page.mouse.move(hr.x + hr.w * 0.22, hr.y + hr.h * 0.15);
  await page.mouse.down();
  await page.mouse.move(hr.x + hr.w * 0.6, hr.y + hr.h * 0.55, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => __galaxyExample.hr.getBrush().status().committedCount), { timeout: 30000 }).toBeGreaterThan(0);
  const selected = await page.evaluate(() => __galaxyExample.hr.getBrush().status().committedCount);
  expect(selected).toBeLessThan(10_000_000);
  await expect.poll(async () => (await counts()).stars, { timeout: 30000 }).toBeLessThan(beforeBrush.stars * 0.9);
  await page.evaluate(async () => { __galaxyExample.hr.getBrush().clear(); await __examples.settle(); await __galaxyExample.hr.whenSettled(); });
  await expect.poll(async () => (await counts()).stars).toBeGreaterThan(beforeBrush.stars * 0.95);
  const idle = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 500));
    const a = __gpuCounters.snapshot();
    await new Promise(r => setTimeout(r, 500));
    const b = __gpuCounters.snapshot();
    return { submits: b.submits - a.submits, buffers: b.buffers - a.buffers };
  });
  expect(idle).toEqual({ submits: 0, buffers: 0 });
  await page.setViewportSize({ width: 600, height: 1000 });
  await page.evaluate(() => window.__examples.settle());
  const [top, below] = await panels();
  expect(below.y, "stacked on a phone").toBeGreaterThan(top.y + top.h);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
});

// TODO 47.1: Smooth fits the brushed penguins, on the GPU, as the brush moves.
test("the Smooth example refits to a brush", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "smooth", "A fitted curve that refits under a brush");
  const fit = () => page.evaluate(async () => {
    await window.__examples.settle();
    return window.__smoothExample.smooth.fit();
  });
  const whole = await fit();
  expect(whole.n).toBe(342);
  await shiftDrag(page, [0.05, 0.05], [0.45, 0.95]);
  await expect.poll(async () => (await fit()).n).toBeLessThan(200);
  const brushed = await fit();
  expect(brushed.n).toBeGreaterThan(10);
  expect(brushed.coefficients[1]).not.toBeCloseTo(whole.coefficients[1], 3);
  expect(errors).toEqual([]);
});

// TODO 53: an axis without weekends and nights, with a second row of labels; a brush across a
// break keeps every point between its ends.
test("the market-hours axis leaves out weekends and nights, and a brush spans a break", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "market-hours", "Market hours: an axis that skips weekends and nights");
  const axis = page.locator("svg.axes").first();
  await expect(axis.locator(".x-context")).toContainText(["Mar 2026"]);
  // Day ticks at each session's open: no Saturday or Sunday of March 2026 among them.
  const labels = (await axis.locator(".x-tick text").allTextContents()).map(Number);
  expect(labels.length).toBeGreaterThan(5);
  expect(labels.filter((day) => [7, 8, 14, 15, 21, 22, 28, 29].includes(day))).toEqual([]);
  await shiftDrag(page, [0.12, 0.05], [0.42, 0.95]);
  await expect.poll(() => page.evaluate(() => window.__examples.plot.getBrush()?.status().committedCount ?? 0)).toBeGreaterThan(20);
  // The brush's bounds are times; it holds exactly the points inside them, across the breaks.
  const { count, inside, span } = await page.evaluate(() => {
    const brush = window.__examples.plot.getBrush(), { t, price } = window.__marketHours;
    const [x, y] = ["t", "price"].map((name) => brush.getConstraints().find((c) => c.name === name).bounds);
    const inside = t.filter((time, i) => time >= x[0] && time <= x[1] && price[i] >= y[0] && price[i] <= y[1]).length;
    return { count: brush.status().committedCount, inside, span: x[1] - x[0] };
  });
  expect(count).toBe(inside);
  expect(span).toBeGreaterThan(2 * 86400000);
  expect(errors).toEqual([]);
});

// TODO 53: a Playback over a column's dates shows dates and plays through them.
test("the calendar example's Playback shows dates and plays by the month", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "calendar", "Calendar functions and a Playback over dates");
  const output = page.locator(".hm-playback output");
  await expect(output).toHaveText(/^Mar 1958$/);
  await page.getByRole("button", { name: "Play Until" }).click();
  await expect.poll(async () => Number((await output.textContent()).slice(-4)), { timeout: 15000 }).toBeGreaterThan(1959);
  await page.getByRole("button", { name: "Pause Until" }).click();
  await expect(output).toHaveText(/^[A-Z][a-z]{2} \d{4}$/);
  // The seasonal cycle by month_name: January to December in order.
  const months = await page.locator("svg.axes").nth(1).locator(".x-tick text").allTextContents();
  expect(months.filter(Boolean)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].filter((m) => months.includes(m)));
  expect(months).toContain("Jan");
  expect(errors).toEqual([]);
});

// TODO 47.6: a Voronoi cell carries its point's identity: hovering it highlights that penguin, the
// nearest one to the pointer in the data's units.
test("hovering a Voronoi cell highlights its penguin", async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, "voronoi", "Voronoi cells, hulls and a Delaunay triangulation");
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  const at = [0.37, 0.55];
  await page.mouse.move(box.x + box.width * at[0], box.y + box.height * at[1]);
  await expect.poll(() => page.evaluate(() => Array.from(window.__examples.plot.getHover().rows(undefined, "preview")).length)).toBe(1);
  const { hovered, nearest } = await page.evaluate(async ([fx, fy]) => {
    const layout = window.__examples.plot.getAxisLayout();
    // Tick fractions are across the canvas (y up): the pointer's data from two ticks per axis.
    const value = (axis, fraction) => {
      const [a, b] = [axis.major[0], axis.major.at(-1)];
      return a.value + ((fraction - a.fraction) / (b.fraction - a.fraction)) * (b.value - a.value);
    };
    const [x, y] = [value(layout.x, fx), value(layout.y, 1 - fy)];
    const rows = (await (await fetch("/data/penguins/penguins.csv")).text()).trim().split("\n").slice(1).map((line) => line.split(","));
    let nearest = -1, best = Infinity;
    rows.forEach((row, i) => {
      const d = (Number(row[2]) - x) ** 2 + (Number(row[3]) - y) ** 2;
      if (row[2] !== "" && row[3] !== "" && d < best) { best = d; nearest = i; }
    });
    return { hovered: Array.from(window.__examples.plot.getHover().rows(undefined, "preview"))[0], nearest };
  }, at);
  expect(hovered).toBe(nearest);
  expect(errors).toEqual([]);
});

// TODO 69.16: the paired gallery examples (src/examples/<id>/, the public /examples/<id>) keep the
// panel layout, guidance and controls of the gallery components they replaced, in the preview,
// the live scene and an edited Python Run. Panels are the scene's plot sections (Markdown, Titles
// and Minimaps aside), measured against each program's Row, Column and Scene gaps and shares.
async function pairedLayout(page, composed = false) {
  return page.evaluate((composed) => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const live = document.querySelector(".live.ready");
    // (A Legend inside a Plot has a section of its own that lays out nothing: no box.)
    const sections = [...live.querySelectorAll("section.hm-plot")].filter(e => !e.parentElement.closest("section.hm-plot")).map(box).filter((b) => b.w > 0 && b.h > 0);
    return {
      scene: box(live.querySelector('.hm-layout[data-kind="Scene"]') ?? live),
      panels: [...live.querySelectorAll("section.hm-plot:not(.hm-text):not(.hm-mini)")].filter((e) => !e.parentElement.closest("section.hm-plot")).map(box),
      // What an export of the scene spans: its plots, texts and minimaps (input controls are left out).
      exported: Math.max(...sections.map((b) => b.y + b.h)) - Math.min(...sections.map((b) => b.y)),
      exportedWidth: composed ? Math.max(...sections.map(b=>b.x+b.w))-Math.min(...sections.map(b=>b.x)) : Math.max(...[...live.querySelectorAll('[data-export-host], section.hm-mini, section.hm-text')].map(box).map(b=>b.x+b.w))-Math.min(...sections.map(b=>b.x)),
      text: live.innerText,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  }, composed);
}
// Checks on panel boxes; each returns its failures, so a lost layout says which relation broke.
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const beside = (a, b, gap, share) => [
  ...(near(a.y, b.y) ? [] : [`tops ${a.y} and ${b.y} differ`]),
  ...(near(b.x - a.x - a.w, gap) ? [] : [`gap ${b.x - a.x - a.w}, not ${gap}`]),
  ...(share === undefined || Math.abs(a.w / b.w - share) < 0.01 ? [] : [`widths ${a.w}:${b.w}, not ${share}:1`]),
];
const below = (a, b, gap) => [
  ...(near(a.x, b.x) && near(a.w, b.w) ? [] : [`columns ${a.x}+${a.w} and ${b.x}+${b.w} differ`]),
  ...(near(b.y - a.y - a.h, gap) ? [] : [`gap ${b.y - a.y - a.h} below, not ${gap}`]),
];
const fills = (a, scene) => near(a.x, scene.x) && near(a.w, scene.w) ? [] : [`${a.x}+${a.w} does not fill ${scene.x}+${scene.w}`];
const endsRow = (a, scene) => near(a.x + a.w, scene.x + scene.w) ? [] : [`ends at ${a.x + a.w}, not ${scene.x + scene.w}`];
// b on a later line than a (headings between them: no set gap).
const under = (a, b) => b.y > a.y + a.h ? [] : [`${b.y} is not below ${a.y + a.h}`];
const PAIRED = {
  "lorenz-attractor": { text: "Slide ρ below about 24.7", control: ["slider", "Rayleigh number ρ"],
    desktop: (p, s) => [...beside(p[0], p[1], 12, 1.5), ...below(p[1], p[2], 12), ...endsRow(p[1], s)],
    phone: (p, s) => [...fills(p[0], s), ...below(p[0], p[1], 12), ...below(p[1], p[2], 12)] },
  "earthquakes": { text: "Gutenberg–Richter", control: ["slider", "Depth exaggeration"],
    desktop: (p, s) => [...beside(p[0], p[1], 12, 1.5), ...below(p[1], p[2], 12), ...below(p[2], p[3], 12), ...endsRow(p[1], s)],
    phone: (p, s) => [...fills(p[0], s), ...below(p[0], p[1], 12), ...below(p[1], p[2], 12), ...below(p[2], p[3], 12)] },
  "coordinated-explorer": { text: "Shift-drag to brush",
    desktop: (p, s) => [...beside(p[0], p[1], 16, 1.9375), ...below(p[1], p[2], 14), ...endsRow(p[1], s)],
    phone: (p, s) => [...fills(p[0], s), ...(near(p[1].y - p[0].y - p[0].h, 16) ? [] : ["details not 16 px below"]),
      ...beside(p[1], p[2], 14, 1), ...endsRow(p[2], s)] },
  "timeseries": { text: "drag the window on the minimap", control: ["combobox", "Detail"],
    desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "histograms": { control: ["slider", "Bins"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  // Three Facets (matrix, histograms, normalized), then the three extruded-bin plots in a Row.
  "facets": { text: "One Bins slider bins every cell", control: ["slider", "Columns"],
    desktop: (p, s) => [...p.slice(0, 3).flatMap((f) => fills(f, s)), ...beside(p[3], p[4], 12, 1), ...beside(p[4], p[5], 12, 1), ...endsRow(p[5], s)],
    phone: (p, s) => [...beside(p[3], p[4], 12, 1), ...fills(p[5], s), ...(near(p[5].y - p[3].y - p[3].h, 12) ? [] : ["third not 12 px below"])] },
  // TODO 69.10 (second group). One plot each, filling the column, unless said otherwise.
  "data-shortcut": { desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  // Three headed panels at least 360 px wide, 20 px apart: two to a line and the third below at
  // the docs' width, one to a line on a phone.
  "scale-resources": { text: "Its automatic scale remains independent",
    desktop: (p, s) => [...beside(p[0], p[1], 20, 1), ...endsRow(p[1], s), ...fills(p[2], s), ...under(p[0], p[2])],
    phone: (p, s) => [...p.flatMap((f) => fills(f, s)), ...under(p[0], p[1]), ...under(p[1], p[2])] },
  "layered-signal": { text: "interrupt animated updates", control: ["button", "New target"],
    desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "violin": { desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "twin-axes": { desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "strip-brushing": { text: "Shift-drag on the inset's left tick strip", desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "sunburst": { desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "themes": { control: ["combobox", "Theme preset"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  // TODO 69.10's pairs: one Facet or Plot under their guidance and controls, and the dashboard's
  // four views two by two (one column on a phone), 16 px apart.
  "calculate-matrix": { text: "Counts are per cell", control: ["combobox", "Rows"],
    desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "calculate-large": { text: "No sampling limit is applied", control: ["slider", "Gain"],
    desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "interaction-dashboard": { text: "The independent table must not react", control: ["combobox", "Rows"],
    desktop: (p, s) => [...beside(p[0], p[1], 16, 1), ...beside(p[2], p[3], 16, 1), ...below(p[0], p[2], 16), ...endsRow(p[1], s)],
    phone: (p, s) => [...fills(p[0], s), ...below(p[0], p[1], 16), ...below(p[1], p[2], 16), ...below(p[2], p[3], 16)] },
  "interaction-matrix": { text: "with an offscreen cache of 0", control: ["combobox", "Offscreen cache"],
    desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "interaction-keyed-updates": { text: "Surviving IDs retain selection", control: ["slider", "Frame"],
    desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "scatterplot-matrix": { desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "enter-exit": { text: "Press the button for the next keyed update", control: ["button", "Next keyed update"],
    desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  // TODO 69.10: one plot each, the width of the scene, with its guidance and controls.
  "transform-force": { text: "Drag a node to move it", control: ["slider", "Repulsion"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "large-graph": { text: "seeded communities of 32", control: ["combobox", "Nodes"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "polar-radius": { text: "explicit polar chart", control: ["slider", "Angle origin"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "polar-inset": { text: "custom 24-unit turn", control: ["slider", "Globe center"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "solar-system": { text: "Solar System Scope", control: ["slider", "Days per second"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "earth": { text: "GEBCO elevation", control: ["slider", "Height scale"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "manhattan-flyover": { text: "Fly over Manhattan", control: ["combobox", "Buildings"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  // R2.11's flagship pairs: one plot each, the width of the scene.
  "double-gyre": { text: "Shift-drag a box to drop dye", control: ["slider", "Wobble ε"], desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
  "globe-tiles": { text: "streams in as you move it", desktop: (p, s) => fills(p[0], s), phone: (p, s) => fills(p[0], s) },
};

// VersaTiles' tiles served here, so no gallery test reaches the network: the bundled tiles
// (static/data/vector-tiles), else land, or `fallback(path)`. Returns the tile paths requested.
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const LAND_TILE = encodeVectorTile([{ name: "land", features: [{ type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] }] }]);
async function serveTiles(page, fallback = () => LAND_TILE) {
  const requested = [];
  await page.route("https://tiles.versatiles.org/tiles/osm/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/tiles/osm/", ""), local = `static/data/vector-tiles/${path}.mvt`;
    requested.push(path);
    const body = existsSync(local) ? readFileSync(local) : Buffer.from(fallback(path));
    return route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body }).catch(() => {});
  });
  return requested;
}

test.describe("paired gallery examples (TODO 69.16)", () => {
  test.use({ deviceScaleFactor: 2 });

  test("signal uncertainty stays translucent while outlined observations stay readable", async ({ page }) => {
    await page.goto('/examples/layered-signal');
    await expect(page.locator('.live.ready')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.live .canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
    await page.evaluate(() => window.__examples.plot.whenSettled());
    const png = await page.locator('.live canvas').first().screenshot(), pixels = pixelReader(png);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let lightBand = 0, darkBlue = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels(x, y);
      if (r > 190 && g > r + 3 && b > r + 10) lightBand++;
      if (r < 120 && b > r + 20 && b > g + 10) darkBlue++;
    }
    expect(lightBand).toBeGreaterThan(5000);
    expect(lightBand).toBeGreaterThan(darkBlue * 3);
    const svg = await page.evaluate(async () => (await window.__examples.plot.exportSVG({ mode: 'vector' })).blob.text());
    expect(svg).toMatch(/fill="#577eac"[^>]*opacity="0.2"/);
  });

  test("keep their panel layout, guidance and controls at desktop and phone widths, in the preview and live", async ({ page }) => {
    test.setTimeout(Math.max(300000, 45000 * Object.keys(PAIRED).length));
    const errors = watchErrors(page);
    await serveTiles(page);
    for (const [width, kind] of [[1300, "desktop"], [600, "phone"]]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [id, expected] of Object.entries(PAIRED)) {
        await page.goto(`/examples/${id}`);
        // The preview first: the Python build's scene, laid out at the docs' column width.
        const preview = await page.locator('[aria-label="Snapshot"] img').first().evaluate((img) => {
          const r = img.getBoundingClientRect(); return { w: r.width, h: r.height, natural: [Number(img.getAttribute("width")), Number(img.getAttribute("height"))] };
        });
        await expect(page.locator(".live.ready")).toBeVisible({ timeout: 90000 });
        await page.waitForFunction(() => [...document.querySelectorAll(".live .canvas")].every((c) => c.getAttribute("aria-busy") === "false"));
        await page.evaluate(() => window.__examples?.settle());
        const builds = JSON.parse(readFileSync("static/example-builds/manifest.json", "utf8"));
        const payload = JSON.parse(readFileSync(`static/example-builds/${builds[id].views.plot.payload}`, "utf8"));
        const live = await pairedLayout(page, payload.state.root.children.length !== 1 || payload.state.root.children[0].kind !== "Plot");
        const where = `${id} at ${width} px`;
        expect(live.overflow, where).toBeLessThanOrEqual(0);
        expect(expected[kind](live.panels, live.scene), where).toEqual([]);
        if (expected.text) expect(live.text, where).toContain(expected.text);
        if (expected.control) await expect(page.locator(".live").getByRole(expected.control[0], { name: expected.control[1] }), where).toBeVisible();
        if (kind === "desktop") {
          // At the column's width the preview is the live scene's picture: as wide, as tall (the
          // controls aside, text within its font's differences).
          expect(near(preview.w, live.exportedWidth, 2), `${where}: preview ${preview.w} wide, export ${live.exportedWidth}`).toBe(true);
          expect(Math.abs(preview.h - live.exported), `${where}: preview ${preview.h} tall, scene ${live.exported}`).toBeLessThan(Math.max(30, live.exported * 0.03));
        } else expect(preview.w, where).toBeLessThanOrEqual(width - 32);
      }
    }
    expect(errors).toEqual([]);
  });

  // Pixels of one panel's canvas: those `test` keeps ([r, g, b] => boolean, as source text).
  const pixels = (page, locator, test) => locator.screenshot().then((png) => page.evaluate(async ({ b64, test }) => {
    const image = new Image();
    image.src = "data:image/png;base64," + b64;
    await image.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data, keep = eval(test);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (keep(data[i], data[i + 1], data[i + 2])) n++;
    return n;
  }, { b64: png.toString("base64"), test }));
  const open = async (page, id) => {
    await page.goto(`/examples/${id}`);
    await expect(page.locator(".live.ready")).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => [...document.querySelectorAll(".live .canvas")].every((c) => c.getAttribute("aria-busy") === "false"));
    await page.evaluate(() => window.__examples?.settle());
    return page.locator(".live .canvas");
  };

  test("Lorenz continuously simulates all sixty thousand points without temporary-buffer churn", { tag: "@gpu" }, async ({ page }, testInfo) => {
    await page.addInitScript(installGpuCounters);
    await page.addInitScript(installGpuErrors);
    const errors = watchErrors(page), canvases = await open(page, "lorenz-attractor");
    // A slider edit must reuse the compiled update, with its new value passed in a buffer.
    const before = await gpuCounters(page);
    await page.getByRole("slider", { name: "Rayleigh number ρ" }).fill("30");
    await page.waitForTimeout(250);
    const progress = await page.evaluate(async () => {
      const plot = window.__examples.plot, before = plot.getDiagnostics();
      const start = performance.now();
      while (performance.now() - start < 1500) await new Promise(requestAnimationFrame);
      const after = plot.getDiagnostics();
      return { frames: after.completedFrame - before.completedFrame,
        milliseconds: performance.now() - start, rows: after.marks.map(mark => mark.fields.position.count) };
    });
    const work = await countersDelta(page, before, await gpuCounters(page));
    expect(progress.rows).toEqual([60000, 60000]);
    expect(progress.frames * 1000 / progress.milliseconds).toBeGreaterThan(20);
    // Before this fix: ~1,300 allocations and ~250 MB per drawn frame, with ~6 fps.
    expect(work.buffers / progress.frames).toBeLessThan(100);
    expect(work.bufferKB / progress.frames).toBeLessThan(2048);
    expect({ compute: work.compute, render: work.render, shaders: work.shaders }).toEqual({ compute: 0, render: 0, shaders: 0 });
    // Inspect actual output, frozen together through the scene's shared clock.
    await page.evaluate(() => window.__examples.plot.setAnimationTime(0));
    const png = await canvases.nth(1).locator("canvas").screenshot({ path: testInfo.outputPath("lorenz-projection.png") });
    const pixel = pixelReader(png), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let lit = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const rgb = pixel(x, y).slice(0, 3);
      if (Math.max(...rgb) > 110 && Math.max(...rgb) - Math.min(...rgb) > 45) lit++;
    }
    expect(lit).toBeGreaterThan(20000);
    expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the Lorenz attractor's rho slider recomputes the orbit, brushing links its views, and an edited Python Run keeps the layout", async ({ page }) => {
    // Pyodide and its packages come from its CDN; the program integrates 60,000 steps in Python.
    test.setTimeout(300000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1300, height: 1000 });
    const canvases = await open(page, "lorenz-attractor");
    const [orbit, projection, histogram] = [0, 1, 2].map((i) => canvases.nth(i));
    // Lit: the glow on the dark theme's background. Bright bars: the brushed steps' (#ffb347).
    const lit = "(r, g, b) => Math.max(r, g, b) > 110 && Math.max(r,g,b)-Math.min(r,g,b)>45", bright = "(r, g, b) => r > 220 && g > 140 && g < 215 && b < 120";
    const butterfly = await pixels(page, projection, lit);
    expect(butterfly).toBeGreaterThan(20000);
    // Below about 24.7 every point spirals into one of two fixed points (and, at rest, leaves
    // the view): the projection goes almost dark.
    const rho = page.getByRole("slider", { name: "Rayleigh number ρ" });
    await rho.fill("15");
    await expect.poll(() => pixels(page, projection, lit), { timeout: 20000 }).toBeLessThan(butterfly * 0.2);
    // Back above it, every point starts again from the butterfly.
    await rho.fill("28");
    await expect.poll(() => pixels(page, projection, lit), { timeout: 20000 }).toBeGreaterThan(butterfly * 0.5);
    // A brush on the projection: the histogram's bright bars count only the brushed points, and
    // the 3D orbit keeps only those lit.
    const [barsBefore, orbitBefore] = [await pixels(page, histogram, bright), await pixels(page, orbit, lit)];
    const box = await projection.evaluate(host => {
      const origin = host.getBoundingClientRect();
      const rules = [...host.querySelectorAll('svg[aria-label="2D coordinate axes"] .axis-lines')].map(p => p.getBBox());
      const left = Math.min(...rules.map(r => r.x)), top = Math.min(...rules.map(r => r.y));
      return { x: origin.x + left, y: origin.y + top,
        width: Math.max(...rules.map(r => r.x + r.width)) - left,
        height: Math.max(...rules.map(r => r.y + r.height)) - top };
    });
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.15);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.6, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect.poll(() => pixels(page, histogram, bright), { timeout: 20000 }).toBeLessThan(barsBefore * 0.7);
    await expect.poll(() => pixels(page, orbit, lit), { timeout: 20000 }).toBeLessThan(orbitBefore * 0.8);
    // Edit in Python: the edited program's scene keeps the 3:2 row, with the edits (a wider gap,
    // rho starting at 30).
    const section = page.locator("section.example").first();
    await section.getByRole("button", { name: "Edit in Python" }).click();
    const editor = section.getByRole("textbox", { name: "Python source" });
    // The program from its file: the editor draws only the lines in view.
    const source = readFileSync("src/examples/lorenz-attractor/lorenz-attractor.py", "utf8");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(source.replace("min_width=286, gap=12", "min_width=286, gap=24").replace("step=0.1, value=28", "step=0.1, value=30"));
    await section.getByRole("button", { name: "Run" }).click();
    await expect(section.locator(".status")).toHaveText("ready", { timeout: 240000 });
    await expect(page.locator(".live").getByRole("slider", { name: "Rayleigh number ρ" })).toHaveValue("30");
    const edited = await pairedLayout(page);
    expect([...beside(edited.panels[0], edited.panels[1], 24, 1.5), ...below(edited.panels[1], edited.panels[2], 12)]).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the other paired examples' controls change what they draw", async ({ page }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1300, height: 1000 });
    const shot = (locator) => locator.screenshot();
    const settle = () => page.evaluate(async () => { await window.__examples?.settle(); await new Promise((r) => setTimeout(r, 300)); });
    const set = (locator, value) => locator.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, value);
    // Earthquakes: the depth slider moves the globe's quakes; the flat map stays as it is.
    let canvases = await open(page, "earthquakes");
    const depth = page.getByRole("slider", { name: "Depth exaggeration" });
    await set(depth, 1); await settle();
    const [globe1, map1] = [await shot(canvases.nth(0)), await shot(canvases.nth(1))];
    await set(depth, 6); await settle();
    expect((await shot(canvases.nth(0))).equals(globe1)).toBe(false);
    expect((await shot(canvases.nth(1))).equals(map1)).toBe(true);
    // The time series: every point draws another line than the adaptive extremes.
    canvases = await open(page, "timeseries");
    const adaptive = await shot(canvases.nth(0));
    await page.getByRole("combobox", { name: "Detail" }).selectOption({ label: "Every point" });
    await settle();
    expect((await shot(canvases.nth(0))).equals(adaptive)).toBe(false);
    // Histogram bins: five bins draw other bars than thirty.
    canvases = await open(page, "histograms");
    const thirty = await shot(canvases.nth(0));
    await page.getByRole("slider", { name: "Bins" }).fill("5");
    await settle();
    expect((await shot(canvases.nth(0))).equals(thirty)).toBe(false);
    // Facets: one Bins slider re-bins every histogram cell; View and Columns change the
    // extruded bins.
    canvases = await open(page, "facets");
    const cells = page.locator(".live .facet-cell");
    const histogramCell = cells.nth(6), columns = canvases.last();
    await histogramCell.scrollIntoViewIfNeeded();
    const eight = await shot(histogramCell);
    await page.getByRole("slider", { name: "Bins", exact: true }).fill("3");
    await settle();
    expect((await shot(histogramCell)).equals(eight)).toBe(false);
    await columns.scrollIntoViewIfNeeded();
    const tall = await shot(columns);
    await page.getByRole("combobox", { name: "View" }).selectOption("2d");
    await settle();
    const flat = await shot(columns);
    expect(flat.equals(tall)).toBe(false);
    await page.getByRole("slider", { name: "Columns" }).fill("4");
    await settle();
    expect((await shot(columns)).equals(flat)).toBe(false);
    // TODO 69.10 (second group). Signal and uncertainty: "New target" moves the signal, animated
    // while Animate is on and at once without it.
    canvases = await open(page, "layered-signal");
    const signal = await shot(canvases.nth(0));
    await page.getByRole("button", { name: "New target" }).click();
    await page.waitForFunction(() => window.__examples.diagnostics().animation.active > 0);
    await page.evaluate(() => window.__examples.finished());
    await settle();
    const moved = await shot(canvases.nth(0));
    expect(moved.equals(signal)).toBe(false);
    await page.getByRole("checkbox", { name: "Animate" }).uncheck();
    await page.getByRole("button", { name: "New target" }).click();
    await settle();
    expect(await page.evaluate(() => window.__examples.diagnostics().animation.active)).toBe(0);
    expect((await shot(canvases.nth(0))).equals(moved)).toBe(false);
    // Theme presets: the select re-themes the plot.
    canvases = await open(page, "themes");
    const minimal = await shot(canvases.nth(0));
    await page.getByRole("combobox", { name: "Theme preset" }).selectOption({ label: "Dark" });
    await settle();
    expect((await shot(canvases.nth(0))).equals(minimal)).toBe(false);
    // Brushing frame strips: a Shift-drag on the inset's left tick strip brushes its score axis,
    // and the brushed rows grow.
    canvases = await open(page, "strip-brushing");
    const unbrushed = await shot(canvases.nth(0));
    const strip = await page.evaluate(() => {
      const host = document.querySelector('.live [aria-label="Plot canvas"]').getBoundingClientRect();
      const inset = window.__examples.plot.getAxes()[1].getAxisLayout();
      return { x: host.left + inset.left - 8, top: host.top + inset.top, height: inset.bottom - inset.top };
    });
    await page.keyboard.down("Shift");
    await page.mouse.move(strip.x, strip.top + 0.3 * strip.height);
    await page.mouse.down();
    await page.mouse.move(strip.x, strip.top + 0.6 * strip.height, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.mouse.move(0, 0);
    await settle();
    await expect(page.locator(".live .brush-region.strip")).toHaveCount(1);
    expect(await page.evaluate(() => window.__examples.plot.getBrush().status().committedCount)).toBeGreaterThan(0);
    expect((await shot(canvases.nth(0))).equals(unbrushed)).toBe(false);
    // Twin coordinate frames: zooming the plot narrows the minimap's window, and both frames
    // keep one hour axis.
    canvases = await open(page, "twin-axes");
    const view = () => page.locator(".live .minimap rect.viewport").first().evaluate((rect) => rect.getBoundingClientRect().width);
    const whole = await view();
    const box = await canvases.nth(0).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await settle();
    await expect.poll(view).toBeLessThan(whole * 0.9);
    // The plot's last two frames: Temperature's and Rainfall's.
    const hours = await page.evaluate(() => window.__examples.plot.getAxes().slice(-2).map((frame) => frame.getAxisLayout().x.major.map((tick) => tick.value)));
    expect(hours[1]).toEqual(hours[0]);
    expect(hours[0].length).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });

  // TODO 69.10: a scene has no host code, so the data steps of these examples' gallery components
  // (a row count select, Advance and Reverse buttons) are inputs read by a Filter, a Calculate and
  // a Sort over rows the program ships.
  test("the calculated, dashboard, matrix and keyed examples' controls change what they draw", async ({ page }) => {
    test.setTimeout(240000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1300, height: 1000 });
    const shot = (locator) => locator.screenshot();
    const settle = () => page.evaluate(async () => {
      await window.__examples?.settle();
      for (let i = 0; i < 100 && ![...document.querySelectorAll(".live .canvas")].every((c) => c.getAttribute("aria-busy") === "false"); i++)
        await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300));
    });
    const set = (locator, value) => locator.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, value);
    const changes = async (target, act) => { const before = await shot(target); await act(); await settle(); expect((await shot(target)).equals(before)).toBe(false); };
    // The calculated matrix: Rows draws more points. (Gain scales every score, and each field's own
    // scale, scales="field", fits it again: the cells look the same, as they did before.)
    await open(page, "calculate-matrix");
    await changes(page.locator(".live .facet-cell").nth(2), () => page.getByRole("combobox", { name: "Rows" }).selectOption({ label: "25,000" }));
    // The large point cloud, likewise.
    let canvases = await open(page, "calculate-large");
    await changes(canvases.nth(0), () => set(page.getByRole("slider", { name: "Gain" }), 2));
    await changes(canvases.nth(0), () => page.getByRole("combobox", { name: "Rows" }).selectOption({ label: "100,000" }));
    // The dashboard: 256 rows instead of 1,024, in the shared and the independent views.
    canvases = await open(page, "interaction-dashboard");
    const [shared, independent] = [await shot(canvases.nth(0)), await shot(canvases.nth(3))];
    await page.getByRole("combobox", { name: "Rows" }).selectOption({ label: "256" });
    await settle();
    expect((await shot(canvases.nth(0))).equals(shared)).toBe(false);
    expect((await shot(canvases.nth(3))).equals(independent)).toBe(false);
    // The interaction matrix: with an offscreen cache of 0 its first cell, scrolled away, unmounts,
    // and mounts and draws again on the way back; with 64 it stays.
    await open(page, "interaction-matrix");
    const first = () => page.locator(".live .facet-cell").first().locator("canvas").count();
    const away = async () => { await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(800); };
    const back = async () => { await page.locator(".live .facet-cell").first().scrollIntoViewIfNeeded(); await page.waitForTimeout(800); await settle(); };
    expect(await first()).toBe(1);
    await page.getByRole("combobox", { name: "Offscreen cache" }).selectOption({ label: "0 (remount)" });
    await away();
    expect(await first()).toBe(0);
    await back();
    expect(await first()).toBe(1);
    await page.getByRole("combobox", { name: "Offscreen cache" }).selectOption({ label: "64 (retain)" });
    await away();
    expect(await first()).toBe(1);
    // Keyed updates: a selected row that survives a frame stays selected as it moves, and as the
    // rows reverse. Row 20 is at (0.346, 0.318) in frame 0; frame 1 keeps it (rows 8 to 55).
    canvases = await open(page, "interaction-keyed-updates");
    const point = await page.evaluate(() => {
      const layout = window.__examples.plot.getAxisLayout(), box = document.querySelector(".live canvas").getBoundingClientRect();
      const fraction = (axis, value) => { const t = layout[axis].major, a = t[0], b = t.at(-1); return a.fraction + (value - a.value) / (b.value - a.value) * (b.fraction - a.fraction); };
      return { x: box.left + box.width * fraction("x", 0.1 + 0.8 * 24 / 78), y: box.top + box.height * (1 - fraction("y", 0.5 + 0.34 * Math.sin(12))) };
    });
    await page.mouse.click(point.x, point.y);
    const selected = () => page.evaluate(() => window.__examples.plot.getSelection().status().count);
    await expect.poll(selected).toBe(1);
    await changes(canvases.nth(0), () => set(page.getByRole("slider", { name: "Frame" }), 1));
    expect(await selected()).toBe(1);
    await page.getByRole("checkbox", { name: "Reverse row order" }).check();
    await settle();
    expect(await selected()).toBe(1);
    expect(errors).toEqual([]);
  });

  // TODO 69.10: every control of the force layout, large graph, polar, solar system, Earth and
  // flyover pairs changes what their scene draws (a control reaching a Frame's placement, a
  // Force's dimensions, a camera or the fog through an expression of inputs too).
  test("the force, graph, polar, solar system, Earth and flyover examples' controls change what they draw", { tag: "@timing" }, async ({ page }) => {
    test.setTimeout(420000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1300, height: 1000 });
    const shot = (locator) => locator.screenshot();
    const settle = () => page.evaluate(async () => { await window.__examples?.settle(); await new Promise((r) => setTimeout(r, 300)); });
    const set = (locator, value) => locator.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, value);
    /** Whether `act` changes the canvas's picture. */
    const changes = async (canvas, act) => {
      const before = await shot(canvas);
      await act();
      await settle();
      return !(await shot(canvas)).equals(before);
    };
    const pick = (name) => (option) => page.getByRole("combobox", { name, exact: true }).selectOption({ label: option });
    const toggle = (name) => () => page.getByRole("checkbox", { name, exact: true }).click();
    const camera = () => page.evaluate(() => window.__examples.plot.getCamera());

    // Force layout: Step moves the nodes; Reset returns them to the seeded start; Run plays.
    let canvas = (await open(page, "transform-force")).first();
    const seeded = await shot(canvas);
    expect(await changes(canvas, () => page.getByRole("button", { name: "Step", exact: true }).click())).toBe(true);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await settle();
    expect((await shot(canvas)).equals(seeded)).toBe(true);
    expect(await changes(canvas, async () => { await toggle("Run")(); await page.waitForTimeout(500); })).toBe(true);
    // Large graph: another graph from the Nodes select; a 3D layout from Dimensions.
    canvas = (await open(page, "large-graph")).first();
    expect(await changes(canvas, () => pick("Nodes")("64"))).toBe(true);
    expect(await changes(canvas, () => pick("Dimensions")("3D"))).toBe(true);
    // Polar radius: the angle origin turns the curve (by 45 degrees: it repeats every 90).
    canvas = (await open(page, "polar-radius")).first();
    expect(await changes(canvas, () => set(page.getByRole("slider", { name: "Angle origin" }), -45))).toBe(true);
    // Polar insets: the globe center turns the sphere; at 60 degrees the tangent inset (orange)
    // is behind it.
    canvas = (await open(page, "polar-inset")).first();
    const orange = "(r, g, b) => r > 150 && r > g * 1.25 && r > b * 1.25";
    expect(await pixels(page, canvas, orange)).toBeGreaterThan(20);
    expect(await changes(canvas, () => set(page.getByRole("slider", { name: "Globe center" }), 25))).toBe(true);
    await set(page.getByRole("slider", { name: "Globe center" }), 60);
    await settle();
    expect(await pixels(page, canvas, orange)).toBe(0);
    // Solar system: the Date plays at the slider's days per second; each switch changes the
    // scene (paused, so only the switch does).
    canvas = (await open(page, "solar-system")).first();
    const date = () => page.getByRole("slider", { name: "Date", exact: true }).inputValue().then(Number);
    const played = async (speed) => {
      await set(page.getByRole("slider", { name: "Days per second" }), speed);
      const from = await date();
      await page.waitForTimeout(600);
      return ((await date()) - from) / 86400000;
    };
    expect(await played(200)).toBeGreaterThan(40);
    expect(await played(1)).toBeLessThan(5);
    await page.getByRole("button", { name: "Pause Date" }).click();
    for (const name of ["Orbits", "Labels", "Stars", "Glow"]) expect(await changes(canvas, toggle(name)), name).toBe(true);
    // Earth relief: the relief, the lighting, the 2D map and its projection.
    canvas = (await open(page, "earth")).first();
    expect(await changes(canvas, () => set(page.getByRole("slider", { name: "Height scale" }), 200))).toBe(true);
    expect(await changes(canvas, toggle("Lit mode"))).toBe(true);
    expect(await changes(canvas, () => pick("Earth view")("2D map"))).toBe(true);
    expect(await changes(canvas, () => pick("Earth projection")("Mercator"))).toBe(true);
    // Manhattan flyover, the map tiles served here (the bundled zoom-12 tiles, a block of towers
    // at every zoom-14 tile, land elsewhere; no network).
    const land = { name: "land", features: [{ type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] }] };
    const towers = { name: "buildings", features: Array.from({ length: 36 }, (_, i) => ({ id: i + 1, type: 3,
      properties: { height: 60 + (i % 5) * 40 }, geometry: [square(200 + (i % 6) * 650, 200 + Math.floor(i / 6) * 650, 600 + (i % 6) * 650, 600 + Math.floor(i / 6) * 650)] })) };
    const BLOCKS = encodeVectorTile([land, towers]);
    await serveTiles(page, (path) => (path.startsWith("14/") ? BLOCKS : LAND_TILE));
    canvas = (await open(page, "manhattan-flyover")).first();
    await expect(page.getByRole("combobox", { name: "Buildings" })).toHaveValue("1");
    await pick("Buildings")("NYC Open Data footprints");
    expect(await changes(canvas, () => set(page.getByRole("slider", { name: "Height exaggeration" }), 2))).toBe(true);
    expect(await changes(canvas, toggle("Fog"))).toBe(true);
    await toggle("Fog")();
    // Streamed tiles: the camera flies down over Midtown, and their towers stand until 3D
    // buildings lays them flat.
    expect(await changes(canvas, () => pick("Buildings")("Map tiles, streamed (VersaTiles)"))).toBe(true);
    await expect.poll(async () => (await camera()).position[1]).toBeLessThan(3.3);
    expect(await changes(canvas, toggle("3D buildings"))).toBe(true);
    // Momentum: a flick glides on after the release; with Momentum off it stops. The release
    // follows the last move at once: a frame's wait before it can pass Momentum's 40 ms pause
    // (flyover.spec.js, TODO 69.15).
    const box = await canvas.boundingBox();
    const flick = async () => {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(box.x + box.width / 2 + 30 * i, box.y + box.height * 0.7);
        if (i < 8) await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await page.mouse.up();
      const released = (await camera()).position;
      await page.waitForTimeout(400);
      return Math.hypot(...(await camera()).position.map((v, i) => v - released[i]));
    };
    expect(await flick()).toBeGreaterThan(0.01);
    await toggle("Momentum")();
    expect(await flick()).toBe(0);
    expect(errors).toEqual([]);
  });

  // R2.11's flagship pairs, live: the double gyre keeps stepping at the display's rate, its brush
  // dyes the particles that pass through it and its wobble mixes the eddies; the globe's tiles
  // stream in as it zooms, under their credit line. @gpu: frames counted, and mixing that takes
  // many steps.
  test("the double gyre's brush drops dye into the running simulation and its wobble mixes the eddies; the globe streams tiles as it zooms", { tag: ["@gpu", "@timing"] }, async ({ page }, testInfo) => {
    test.setTimeout(240000);
    await page.addInitScript(installGpuCounters);
    await page.addInitScript(installGpuErrors);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1300, height: 1000 });
    const set = (locator, value) => locator.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, value);
    let canvas = (await open(page, "double-gyre")).first();
    const fps = await frameRate(page);
    console.log(`double-gyre: ${fps.toFixed(1)} completed frames a second`);
    expect(fps).toBeGreaterThan(30);
    const box = await canvas.boundingBox();
    const gold = (r, g, b) => r > 200 && g > 140 && b < 120, violet = (r, g, b) => r > g + 10 && b > 150 && r < 200;
    const left = { x: box.x, y: box.y, width: box.width * 0.4, height: box.height };
    expect(await regionPixels(page, box, gold)).toBe(0);
    // Shift-drag in the left eddy: the particles passing through the box turn gold, and carry it out.
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.6, { steps: 6 });
    // Warm the first constrained mask, then count completed draws while previews keep changing.
    // An xy constraint yields bool membership; it must retain the compiled simulation update.
    await page.waitForTimeout(250);
    const beforeDrag = await gpuCounters(page);
    const dragging = await frameRate(page, async () => {
      const start = Date.now();
      while (Date.now() - start < 1500) {
        const t = (Date.now() - start) / 1000;
        await page.mouse.move(box.x + box.width * (0.25 + 0.025 * Math.sin(t * 4)),
          box.y + box.height * (0.6 + 0.04 * Math.cos(t * 3)));
        await page.waitForTimeout(16);
      }
    });
    const work = await countersDelta(page, beforeDrag, await gpuCounters(page));
    console.log(`double-gyre while brushing: ${dragging.toFixed(1)} completed frames a second`);
    expect(dragging).toBeGreaterThan(30);
    expect(work.bufferKB).toBeLessThan(1024); // Previously several GB over this gesture.
    expect({ compute: work.compute, render: work.render, shaders: work.shaders, readbacks: work.readbacks })
      .toEqual({ compute: 0, render: 0, shaders: 0, readbacks: 0 });
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.6);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.waitForTimeout(250);
    const committed = await frameRate(page);
    console.log(`double-gyre with committed brush: ${committed.toFixed(1)} completed frames a second`);
    expect(committed).toBeGreaterThan(30);
    const inBox = { x: box.x + box.width * 0.15, y: box.y + box.height * 0.35, width: box.width * 0.1, height: box.height * 0.25 };
    await expect.poll(() => regionPixels(page, box, gold), { timeout: 20000 }).toBeGreaterThan(2000);
    const outside = { x: box.x + box.width * 0.3, y: box.y, width: box.width * 0.7, height: box.height };
    await expect.poll(() => regionPixels(page, outside, gold), { timeout: 30000 }).toBeGreaterThan(500);
    expect(await regionPixels(page, inBox, gold)).toBeGreaterThan(0);
    await canvas.screenshot({ path: testInfo.outputPath("double-gyre-brushed.png") });
    // Escape clears the box, Start again the dye. Without wobble the eddies keep apart: no violet
    // (a particle from the right eddy) reaches the left one; with it, they mix.
    await page.keyboard.press("Escape");
    await set(page.getByRole("slider", { name: "Wobble ε" }), 0);
    await page.getByRole("button", { name: "Start again" }).click();
    await expect.poll(() => regionPixels(page, box, gold), { timeout: 20000 }).toBe(0);
    await page.waitForTimeout(3000);
    expect(await regionPixels(page, left, violet)).toBeLessThan(50);
    await set(page.getByRole("slider", { name: "Wobble ε" }), 0.5);
    await page.getByRole("button", { name: "Start again" }).click();
    await expect.poll(() => regionPixels(page, left, violet), { timeout: 30000 }).toBeGreaterThan(500);
    expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);

    // The globe: tiles served here (water everywhere but the bundled ones). Zooming in toward
    // Tokyo loads finer tiles, and the plot keeps completing frames meanwhile.
    const WATER = encodeVectorTile([{ name: "water_polygons", features: [{ type: 3, properties: { kind: "water" }, geometry: [square(0, 0, 4096, 4096)] }] }]);
    const requested = await serveTiles(page, () => WATER);
    canvas = (await open(page, "globe-tiles")).first();
    await expect(page.locator(".live").getByRole("note", { name: "Credits" })).toContainText("OpenStreetMap contributors");
    const zoomOf = (path) => Number(path.split("/")[0]);
    const coarse = Math.max(...requested.map(zoomOf));
    const before = await canvas.screenshot();
    const zoomed = await frameRate(page, () => page.evaluate(() => new Promise((done) => {
      const plot = window.__examples.plot, from = plot.getViewport(), start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 1500), zoom = from.zoom * 2 ** (6 * t);
        plot.setViewport({ ...from, zoom, zoomX: zoom, zoomY: zoom, center: [139.76, 35.68] });
        if (t < 1) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    })));
    expect(zoomed).toBeGreaterThan(5);
    await page.evaluate(() => window.__examples.settle());
    expect(Math.max(...requested.map(zoomOf))).toBeGreaterThanOrEqual(coarse + 4);
    expect((await canvas.screenshot()).equals(before)).toBe(false);
    expect(errors).toEqual([]);
  });
});
