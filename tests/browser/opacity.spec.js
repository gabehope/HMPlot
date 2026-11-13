import { test, expect } from "./fixtures.js";
import { pixelReader } from "./png.js";
import { installGpuCounters } from "./gpu-counters.js";

test.describe("scalar channels and allocated filter capacity", () => {
  test.use({ deviceScaleFactor: 2 });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installGpuCounters);
    await page.goto("/test/opacity?section=scalar");
    await page.waitForFunction(() => window.opacityFixture?.marks.scalarFields?.getMark());
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every((c) => c.getAttribute('aria-busy') === 'false'));
    await page.evaluate(() => Promise.all(Object.values(window.opacityFixture.plots).map((plot) => plot.setAnimationTime(0))));
    await page.evaluate(() => Promise.all(Object.values(window.opacityFixture.plots).map((plot) => plot.whenSettled())));
  });

  test("scalar opacity changes no row fields, and normal growth enables mask swaps", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const f = window.opacityFixture, plot = f.plots.scalar, mark = f.marks.scalar.getMark();
      const position = () => mark.fields.get('position'), fill = () => mark.fields.get('fill');
      const settle = async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await plot.whenSettled();
      };
      await plot.setAnimationTime(1000);
      const initial = mark.manager.maxElements;
      const versions = [position().version, fill().version], buffers = [position().buffer, fill().buffer];
      const bytes = __gpuCounters.snapshot().bufferBytes;
      for (const t of [0, 200, 400, 600]) await plot.setAnimationTime(t);
      const opacity = mark.options.get('opacity');
      const unchanged = position().version === versions[0] && fill().version === versions[1] &&
        position().buffer === buffers[0] && fill().buffer === buffers[1];
      const zoomBytes = __gpuCounters.snapshot().bufferBytes - bytes;
      const svg = await (await plot.exportSVG()).blob.text();
      const circle = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('circle');
      const rect = mark.renderer.domElement.getBoundingClientRect();
      const pick = () => mark.view.picking.context.current.pickAt(rect.left + Number(circle.getAttribute('cx')),
        rect.top + Number(circle.getAttribute('cy')));
      const compactPick = (await pick())?.instanceId;
      f.setLimit(1536); await settle();
      const grown = mark.manager.maxElements;
      const physical = position().count;
      const warm = [position().version, fill().version], warmBuffers = [position().buffer, fill().buffer];
      const counts = [];
      for (const n of [100, 0, 64, 2048]) {
        f.setLimit(n); await settle(); counts.push(mark.view.marks.of(mark)?.rows.count ?? mark.count);
      }
      const reused = position().version === warm[0] && fill().version === warm[1] &&
        position().buffer === warmBuffers[0] && fill().buffer === warmBuffers[1];
      f.setLimit(8); await settle();
      const physicalPick = (await pick())?.instanceId;
      const physicalSvg = await (await plot.exportSVG()).blob.text();
      await plot.setAnimationTime(0);
      const invisiblePick = (await pick())?.instanceId ?? null;
      // A burst lands on the final scalar without publishing one of the queued values later.
      await Promise.all([200, 400, 600].map((time) => plot.setAnimationTime(time)));
      await settle();
      const finalOpacity = mark.options.get('opacity');
      const submits = __gpuCounters.snapshot().submits;
      await new Promise((r) => setTimeout(r, 400));
      return { initial, opacity, unchanged, zoomBytes, svg, grown, physical, counts, reused,
        compactPick, physicalPick, physicalSvg, invisiblePick, finalOpacity, idle: __gpuCounters.snapshot().submits - submits };
    });
    expect(result.initial).toBeLessThan(2048);
    expect(result.opacity).toBeCloseTo(0.6);
    expect(result.unchanged).toBe(true);
    expect(result.zoomBytes).toBeLessThan(2048);
    expect(result.svg).toContain('opacity="0.6"');
    expect(result.grown).toBeGreaterThanOrEqual(2048);
    expect(result.physical).toBe(2048);
    expect(result.counts).toEqual([100, 0, 64, 2048]);
    expect(result.reused).toBe(true);
    expect(result.compactPick).toBe(0);
    expect(result.physicalPick).toBe(2040);
    expect(result.physicalSvg).toBe(result.svg);
    expect(result.invisiblePick).toBeNull();
    expect(result.finalOpacity).toBeCloseTo(0.6);
    expect(result.idle).toBe(0);
  });

  test("numeric color, size, width and device scalar opacity retain their rendering meanings", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const f = window.opacityFixture, plot = f.plots.scalarFields;
      await plot.setAnimationTime(250);
      const mark = f.marks.scalarFields.getMark(), line = f.marks.scalarLine.getMark();
      const before = await (await plot.exportSVG()).blob.text();
      const positions = mark.fields.get('position').buffer;
      for (const time of [350, 500, 750]) await plot.setAnimationTime(time);
      const after = await (await plot.exportSVG()).blob.text();
      return { before, after, count: mark.count, sizeCount: mark.fields.get('size').count,
        size: mark.fields.get('size').uniformNode.value.x,
        color: mark.valueNode.value, width: line.widthNode.value,
        opacityStorage: mark.fields.get('_channelOpacity').scalarBuffer.maxElements,
        unchanged: positions === mark.fields.get('position').buffer };
    });
    expect(result.count).toBe(3);
    expect(result.sizeCount).toBe(1);
    expect(result.size).toBeCloseTo(7.5);
    expect(result.color).toBeCloseTo(0.75);
    expect(result.width).toBeCloseTo(3);
    expect(result.opacityStorage).toBe(1);
    expect(result.unchanged).toBe(true);
    expect(result.before).not.toBe(result.after);
    expect(result.after).toContain('opacity="0.75"');
  });
});

// Count pixels by color class in a PNG export of the fixture plot.
async function census(page) {
  return page.evaluate(async () => {
    const plot = window.opacityFixture.plot;
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let blue = 0, darkBlue = 0, green = 0, darkRed = 0, lightRed = 0, redEdge = 0, greenEdge = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (b > r + 25 && b > g + 25) { blue++; if (r < 120 && g < 120) darkBlue++; }
      if (g > r + 60 && g > b + 60) green++;
      if (r > 150 && g < 90 && b < 90) darkRed++;
      else if (r > 225 && g > 120 && g < 235 && Math.abs(g - b) < 25 && r > g + 15) lightRed++;
      // Antialiased rims: the fill partly mixed with the white background.
      if (r > 240 && g > 40 && g < 225 && Math.abs(g - b) < 15) redEdge++;
      if (g > r + 20 && r > 45 && r < 225 && Math.abs(r - b) < 25) greenEdge++;
    }
    return { blue, darkBlue, green, darkRed, lightRed, redEdge, greenEdge };
  });
}

test("points with opacity below 1 blend instead of rendering opaque", async ({ page }) => {
  await page.goto("/test/opacity");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.opacityFixture?.brushed?.getMark())?.interaction);
  await expect.poll(async () => (await census(page)).green).toBeGreaterThan(100);
  const counts = await census(page);
  // Opacity 0.2 on white is a pale blue: plenty of blue pixels, none of them dark.
  expect(counts.blue).toBeGreaterThan(100);
  expect(counts.darkBlue).toBe(0);
  // The opaque green reference renders as usual.
  expect(counts.green).toBeGreaterThan(100);
});

test("brush feedback fades unbrushed points on screen", async ({ page }) => {
  await page.goto("/test/opacity");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.opacityFixture?.brushed?.getMark())?.interaction);
  await expect.poll(async () => (await census(page)).darkRed).toBeGreaterThan(200);
  const before = await census(page);
  // The 2D plot is the first on the page, above the two 3D clouds.
  const canvas = page.locator('[aria-label="Plot canvas"]').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const interior=await page.evaluate(()=>window.opacityFixture.plot.getAxisLayout());
  // Brush around x = 10 only (the first of four red points).
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + interior.left + (interior.right-interior.left)*.05, box.y + interior.top + (interior.bottom-interior.top)*.35); await page.mouse.down();
  await page.mouse.move(box.x + interior.left + (interior.right-interior.left)*.3, box.y + interior.top + (interior.bottom-interior.top)*.85, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await census(page)).darkRed).toBeLessThan(before.darkRed * 0.45);
  const after = await census(page);
  expect(after.darkRed).toBeGreaterThan(before.darkRed * 0.1); // the brushed point stays opaque
  expect(after.lightRed).toBeGreaterThan(before.lightRed + 200); // the other three fade
});

// A 2D brushable mark blends from the start (it carries interactionOpacity), so a brush never
// rebuilds its material; the opaque green reference uses alpha-to-coverage. Both paths
// antialias: the shader's smooth coverage alpha softens the rims.
test("blended points keep antialiased edges like coverage points", async ({ page }) => {
  await page.goto("/test/opacity");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.opacityFixture?.brushed?.getMark())?.interaction);
  await expect.poll(async () => (await census(page)).darkRed).toBeGreaterThan(200);
  const material = () => page.evaluate(() => {
    const m = window.opacityFixture.brushed.getMark().material;
    return { transparent: m.transparent, alphaToCoverage: m.alphaToCoverage };
  });
  expect(await material()).toEqual({ transparent: true, alphaToCoverage: false });
  const counts = await census(page);
  // Four red points of about 36 px: a hard edge would leave almost no rim pixels (~0.03).
  // A one-device-pixel rim grows with perimeter; the filled area grows with DPR squared.
  const dpr = await page.evaluate(() => devicePixelRatio);
  expect(dpr * counts.redEdge / counts.darkRed).toBeGreaterThan(0.2);
  // The opaque green reference uses alpha-to-coverage and also has a rim.
  expect(counts.greenEdge).toBeGreaterThan(20);
  // A brush that fades three points, then a clear: the material never changes.
  const canvas = page.locator('[aria-label="Plot canvas"]').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const interior=await page.evaluate(()=>window.opacityFixture.plot.getAxisLayout());
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + interior.left + (interior.right-interior.left)*.05, box.y + interior.top + (interior.bottom-interior.top)*.35); await page.mouse.down();
  await page.mouse.move(box.x + interior.left + (interior.right-interior.left)*.3, box.y + interior.top + (interior.bottom-interior.top)*.85, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await census(page)).lightRed).toBeGreaterThan(counts.lightRed + 200);
  expect(await material()).toEqual({ transparent: true, alphaToCoverage: false });
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await census(page)).lightRed).toBeLessThan(counts.lightRed + 50);
  expect(await material()).toEqual({ transparent: true, alphaToCoverage: false });
});

// Path marks below opacity 1 blend like points. Unblended, a Line's alpha-to-coverage kept its
// alpha in every covered sample (opacity 0.5 drew at 0.25) and Arrows3D drew opaque.
test("translucent lines, segments and arrows composite at their opacity", async ({ page }) => {
  await page.goto("/test/opacity");
  await page.waitForFunction(() => window.opacityFixture?.plots?.paths);
  // Per mark (red Line, green Segments, blue Arrows3D over white): the most common value of the
  // two other channels among its pixels; 0.5 opacity gives about 128.
  const tints = () => page.evaluate(async () => {
    const plot = window.opacityFixture.plots.paths;
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return [0, 1, 2].map((k) => {
      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const [a, b] = [0, 1, 2].filter((c) => c !== k).map((c) => data[i + c]);
        if (data[i + k] > 245 && Math.abs(a - b) < 6 && a < 240) counts.set(a, (counts.get(a) ?? 0) + 1);
      }
      return [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    });
  });
  await expect.poll(async () => (await tints()).every((value) => value !== null)).toBe(true);
  for (const value of await tints()) expect(Math.abs(value - 128)).toBeLessThan(8);
});

// 6.11 A5: hover on a 3D cloud must not switch the sprites to depth-writing blending, which
// cut light halos into the points behind every antialiased fringe. The mark fades by hover
// (respond="hovered"), so it has the row-opacity field; hover alone has none (TODO 62.2).
async function darkPixels(page, key) {
  return page.evaluate(async (key) => {
    const plot = window.opacityFixture.plots[key];
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 80 && data[i + 1] < 100 && data[i + 2] > 100) dark++;
    return dark;
  }, key);
}

test("3D points with hover rasterize like points without it", async ({ page }) => {
  await page.goto("/test/opacity");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.opacityFixture?.marks?.hover?.getMark())?.interaction);
  await page.evaluate(() => Promise.all(Object.values(window.opacityFixture.plots).map((p) => p.whenSettled())));
  const plain = await darkPixels(page, "plain");
  expect(plain).toBeGreaterThan(5000);
  await expect.poll(() => darkPixels(page, "hover")).toBeGreaterThan(plain * 0.97);
  const hover = await darkPixels(page, "hover");
  expect(hover).toBeLessThan(plain * 1.03);
  // Nothing is dimmed, so the hover mark keeps alpha-to-coverage (no blending).
  const state = await page.evaluate(() => {
    const mark = window.opacityFixture.marks.hover.getMark();
    return { transparent: mark.material.transparent, coverage: mark.material.alphaToCoverage, field: mark.fields.has("interactionOpacity") };
  });
  expect(state).toEqual({ transparent: false, coverage: true, field: true });
});

// TODO 59: with antialiasing off, Rect edges are computed in the shader. On screen a turned Rect
// and two Rects side by side look as they do under 4x MSAA: soft edges, about the same ink, and
// no seam where the two meet (their shared edge crosses pixels off center). Exports stay 4x MSAA.
test("Rect edges antialias in the shader with antialiasing off, as under MSAA", async ({ page }) => {
  await page.goto("/test/opacity");
  await page.waitForFunction(() => window.opacityFixture?.plots?.edgesOff && window.opacityFixture.plots.edgesMsaa);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((c) => c.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => Promise.all(["edgesOff", "edgesMsaa"].map((key) => window.opacityFixture.plots[key].whenSettled())));
  const fills = [[255, 255, 255], [31, 58, 147], [176, 58, 46]];
  const measure = async (name) => {
    const png = await page.getByRole("region", { name, exact: true }).locator("canvas").screenshot();
    const read = pixelReader(png), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let edge = 0, ink = 0, seam = 0;
    for (let y = 0; y < height; y++) {
      const row = Array.from({ length: width }, (_, x) => read(x, y));
      for (const pixel of row) {
        ink += 765 - pixel[0] - pixel[1] - pixel[2];
        if (!fills.some((fill) => fill.every((value, i) => Math.abs(value - pixel[i]) <= 3))) edge++;
      }
      // Rows through both red Rects: any pixel off the fill between their outer edges is a seam.
      const red = (p, tolerance = 3) => p.every((value, i) => Math.abs(value - fills[2][i]) <= tolerance);
      const reds = row.map((p) => red(p, 40)), first = reds.indexOf(true) + 2, last = reds.lastIndexOf(true) - 2;
      if (last - first > width * 0.3 && red(row[first]) && red(row[last]))
        for (let x = first; x <= last; x++) if (!red(row[x], 8)) seam++;
    }
    return { edge, ink, seam };
  };
  const off = await measure("Rect edges, antialiasing off"), msaa = await measure("Rect edges, 4x MSAA");
  // Aliased, nearly every pixel would be white or a fill.
  expect(msaa.edge).toBeGreaterThan(300);
  expect(off.edge).toBeGreaterThan(msaa.edge * 0.6);
  expect(off.ink / msaa.ink).toBeGreaterThan(0.98);
  expect(off.ink / msaa.ink).toBeLessThan(1.05);
  expect(off.seam).toBe(0);
  const exported = (key) => page.evaluate(async (key) => {
    const bytes = new Uint8Array(await (await window.opacityFixture.plots[key].exportPNG()).arrayBuffer());
    let hash = 2166136261; for (const b of bytes) hash = Math.imul(hash ^ b, 16777619) >>> 0;
    return hash;
  }, key);
  expect(await exported("edgesOff")).toBe(await exported("edgesMsaa"));
});
