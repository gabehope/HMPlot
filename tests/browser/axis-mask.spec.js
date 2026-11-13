import { test, expect } from "./fixtures.js";
import { inflateSync } from "node:zlib";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

test.use({ deviceScaleFactor: 2 });

async function open(page, scene) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/test/axis-mask?case=${scene}`);
  await page.waitForFunction(() => window.axisMaskTest?.plot);
  await expect.poll(() => page.locator(".canvas").getAttribute("aria-busy")).toBe("false");
  await page.evaluate(() => window.axisMaskTest.plot.whenSettled());
  expect(await page.evaluate(() => window.axisMaskTest.plot.getRenderError())).toBe("");
  return errors;
}

// Verify the actual colored fragments against the exported mask boundaries, rather than
// simply checking that a clipping option or shader node was set.
const fragments = (page, screen = null) => page.evaluate(async screen => {
  const plot = window.axisMaskTest.plot;
  const svgResult = await plot.exportSVG({ mode: "vector" }), svg = await svgResult.blob.text();
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml"), root = doc.documentElement;
  const width = Number(root.getAttribute("viewBox").split(" ")[2]);
  const height = Number(root.getAttribute("viewBox").split(" ")[3]);
  const polygons = new Map([...doc.querySelectorAll("clipPath")].map(clip => [clip.id,
    clip.querySelector("polygon").getAttribute("points").trim().split(/\s+/).map(pair => pair.split(",").map(Number))]));
  const regions = [...doc.querySelectorAll('g[clip-path]')].filter(group =>
    !group.querySelector('g[clip-path]')).map(group => {
    const result = [];
    for (let node = group; node; node = node.parentElement) {
      const id = node.getAttribute("clip-path")?.match(/^url\(#(.+)\)$/)?.[1];
      if (id) result.push(polygons.get(id));
    }
    return result;
  });
  const inside = (x, y, polygon) => {
    const center = polygon.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    return polygon.every((a, k) => {
      const b = polygon[(k + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const sign = -dy * (center[0] - a[0]) + dx * (center[1] - a[1]) >= 0 ? 1 : -1;
      return sign * (-dy * (x - a[0]) + dx * (y - a[1])) >= -Math.hypot(dx, dy) * 1.1;
    });
  };
  const count = async blob => {
    const image = new Image(), url = URL.createObjectURL(blob);
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0, outside = 0, transparent = 0, softRed = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] === 0) transparent++;
        if (data[i] > data[i + 1] + 15 && data[i + 1] > 70 && data[i + 1] < 230 && data[i + 3] > 180) softRed++;
        if (data[i] < 155 || data[i + 1] > 95 || data[i + 2] > 100 || data[i + 3] < 180) continue;
        red++;
        if (regions.length && !regions.some(region => region.every(polygon => inside((x + .5) / canvas.width * width, (y + .5) / canvas.height * height, polygon)))) outside++;
      }
      return { red, outside, transparent, softRed };
    } finally { URL.revokeObjectURL(url); }
  };
  return { png: await count(await plot.exportPNG()), svg: await count(svgResult.blob),
    ...(screen ? { screen: await count(await (await fetch(`data:image/png;base64,${screen}`)).blob()) } : {}),
    ...(window.axisMaskTest.scene === "hidden" ? { scaled: await count(await plot.exportPNG({ scale: 0.5 })) } : {}), masks: polygons.size,
    regions: regions.length, maxDepth: Math.max(0, ...regions.map(region => region.length)) };
}, screen);

for (const scene of ["points", "line", "fill", "text", "nested", "facet", "placed", "hidden"]) {
  test(`axis masks clip ${scene} fragments in PNG and SVG, retaining transparent margins`, async ({ page }) => {
    const errors = await open(page, scene);
    const result = await fragments(page);
    expect(result.masks).toBeGreaterThan(0);
    for (const kind of ["png", "svg", ...(scene === "hidden" ? ["scaled"] : [])]) {
      expect(result[kind].red).toBeGreaterThan(50);
      expect(result[kind].outside).toBe(0);
      expect(result[kind].transparent).toBeGreaterThan(50);
    }
    if (scene === "nested") expect(result.maxDepth).toBeGreaterThanOrEqual(3);
    if (scene === "facet") expect(result.regions).toBeGreaterThanOrEqual(2);
    if (scene === "hidden") await expect(page.locator("svg[data-export-axes]")).toHaveCount(0);
    if (scene === "placed") {
      await expect(page.locator(".box-edge")).toHaveCount(4);
      expect(await page.locator(".box-edge").evaluateAll(paths => paths.reduce((sum, path) => sum + path.getTotalLength(), 0))).toBeCloseTo(760, 0);
      await page.evaluate(async () => { window.axisMaskTest.lines(false); await window.axisMaskTest.plot.whenSettled(); });
      await expect(page.locator(".box-edge")).toHaveCount(4);
    }
    expect(errors).toEqual([]);
  });
}

test("masked point fragments cannot be picked; mask toggles reuse shader pipelines", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "points");
  const box = await page.locator(".canvas canvas").boundingBox();
  const layout = await page.evaluate(() => window.axisMaskTest.plot.getAxisLayout());
  const y = box.y + (layout.top + layout.bottom) / 2;
  await page.mouse.click(box.x + layout.left - 10, y);
  expect(await page.evaluate(() => window.axisMaskTest.clicks)).toEqual([]);
  await page.mouse.click(box.x + layout.left + 10, y);
  await expect.poll(() => page.evaluate(() => window.axisMaskTest.clicks.length)).toBe(1);
  const before = await gpuCounters(page);
  const frames = await page.evaluate(() => window.axisMaskTest.plot.getDiagnostics().completedFrame);
  await page.evaluate(async () => { window.axisMaskTest.mask(false); await window.axisMaskTest.plot.whenSettled(); });
  const delta = await countersDelta(page, before, await gpuCounters(page));
  expect(delta.shaders).toBe(0);
  expect(delta.render).toBe(0);
  expect(delta.compute).toBe(0);
  expect(delta.readbacks).toBe(0);
  await page.mouse.click(box.x + layout.left - 10, y);
  await expect.poll(() => page.evaluate(() => window.axisMaskTest.clicks.length)).toBe(2);
  expect(await page.evaluate(() => window.axisMaskTest.plot.getDiagnostics().completedFrame)).toBeGreaterThan(frames);
  const pdfs = await page.evaluate(async () => {
    const bytes = async () => Array.from(new Uint8Array(await (await window.axisMaskTest.plot.exportPDF({ mode: "vector" })).blob.arrayBuffer()));
    const unmasked = await bytes();
    window.axisMaskTest.mask(true); await window.axisMaskTest.plot.whenSettled();
    return { unmasked, masked: await bytes() };
  });
  const clips = bytes => {
    const pdf = Buffer.from(bytes).toString("latin1");
    expect(pdf.startsWith("%PDF")).toBe(true);
    let count = 0;
    for (const match of pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      let data = Buffer.from(match[1], "latin1");
      try { data = inflateSync(data); } catch { /* An uncompressed content stream. */ }
      // A real PDF clipping operation followed by end-path, not metadata mentioning clips.
      count += [...data.toString("latin1").matchAll(/(?:^|\s)W\*?\s+n(?:\s|$)/g)].length;
    }
    return count;
  };
  expect(clips(pdfs.masked)).toBeGreaterThan(clips(pdfs.unmasked));
});

test("hybrid sampling increases scene resolution without changing marks, placed masks, picking or exports", async ({ page }) => {
  await page.addInitScript(() => {
    const textures = new Map(), create = GPUDevice.prototype.createTexture, destroy = GPUTexture.prototype.destroy;
    GPUDevice.prototype.createTexture = function(descriptor) {
      const texture = create.call(this, descriptor), size = descriptor.size;
      textures.set(texture, { width: size.width ?? size[0], height: size.height ?? size[1], samples: descriptor.sampleCount ?? 1 });
      return texture;
    };
    GPUTexture.prototype.destroy = function() { textures.delete(this); return destroy.call(this); };
    window.__aaTextures = () => [...textures.values()];
  });
  for (const scene of ["points", "placed"]) {
    const errors = await open(page, scene), canvas = page.locator('.canvas canvas');
    if (scene === "points") {
      // Picking allocates its separate attachments lazily; include them in the baseline.
      const box = await canvas.boundingBox(), layout = await page.evaluate(() => window.axisMaskTest.plot.getAxisLayout());
      await page.evaluate(async point => {
        await window.axisMaskTest.points.getMark().view.picking.context.current.pickAt(point.x, point.y);
      }, { x: box.x + layout.left + 10, y: box.y + (layout.top + layout.bottom) / 2 });
    }
    const baseline = await fragments(page, (await canvas.screenshot()).toString('base64'));
    const liveTextures = await page.evaluate(() => window.__aaTextures().length);
    let eightEdges = 0;
    for (const [mode, scale] of [["ssaa8", Math.SQRT2], ["ssaa16", 2], ["msaa", 1]]) {
      await page.evaluate(async mode => {
        window.axisMaskTest.sampling(mode);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await window.axisMaskTest.plot.whenSettled();
      }, mode);
      const textures = await page.evaluate(() => window.__aaTextures());
      expect(textures.some(t => t.width === Math.floor(960 * scale) && t.height === Math.floor(720 * scale) && t.samples === 4)).toBe(true);
      expect(textures.every(t => t.samples === 1 || t.samples === 4)).toBe(true);
      const result = await fragments(page, (await canvas.screenshot()).toString('base64'));
      expect(result.screen.outside).toBe(0);
      expect(Math.abs(result.screen.red - baseline.screen.red) / baseline.screen.red).toBeLessThan(0.03);
      expect(result.png).toEqual(baseline.png);
      expect(result.svg).toEqual(baseline.svg);
      if (scene === "points") {
        if (mode === "ssaa8") eightEdges = result.screen.softRed;
        // The integer 2x grid must retain smooth rims, rather than stepping more sharply
        // than the fractional grid (the 16x regression reported during implementation).
        if (mode === "ssaa16") expect(result.screen.softRed).toBeGreaterThan(eightEdges * 0.9);
      }
      if (scene === "points") {
        const box = await canvas.boundingBox(), layout = await page.evaluate(() => window.axisMaskTest.plot.getAxisLayout());
        const before = await page.evaluate(() => window.axisMaskTest.clicks.length), y = box.y + (layout.top + layout.bottom) / 2;
        await page.mouse.click(box.x + layout.left - 10, y);
        expect(await page.evaluate(() => window.axisMaskTest.clicks.length)).toBe(before);
        await page.mouse.click(box.x + layout.left + 10, y);
        await expect.poll(() => page.evaluate(() => window.axisMaskTest.clicks.length)).toBe(before + 1);
      }
    }
    // Replaced high-resolution attachments are disposed when returning to the default.
    expect(await page.evaluate(() => window.__aaTextures().length)).toBe(liveTextures);
    expect(errors).toEqual([]);
  }
});

test("brushing masked data keeps visible handles and selects only the dragged data interval", async ({ page }) => {
  await open(page, "brush");
  const box = await page.locator(".canvas canvas").boundingBox();
  const layout = await page.evaluate(() => window.axisMaskTest.plot.getAxisLayout());
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + layout.left + 2, box.y + layout.bottom - 2);
  await page.mouse.down();
  await page.mouse.move(box.x + layout.right - 2, box.y + layout.top + 2, { steps: 8 });
  await expect(page.getByRole("group", { name: "Brush constraints", exact: true })).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => window.axisMaskTest.plot.getBrush().status().committedCount)).toBe(3);
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.axisMaskTest.plot.getBrush().status().committedCount)).toBe(0);
  expect(await page.evaluate(() => window.axisMaskTest.plot.getRenderError())).toBe("");
});
