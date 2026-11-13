import { test, expect } from "./fixtures.js";

// The overlap of a half-transparent red and green rect, sampled from a PNG export.
const overlap = (page, mode) => page.evaluate(async (mode) => {
  const plot = window.blendFixture.plots[mode];
  await plot.whenSettled();
  const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const at = (fx, fy) => { const x = Math.round(width * fx), y = Math.round(height * fy); return [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)]; };
  return { left: at(0.2, 0.5), middle: at(0.5, 0.5), right: at(0.8, 0.5) };
}, mode);

test("additive and screen overlaps add up; normal and multiply do not", async ({ page }) => {
  await page.goto("/test/blend");
  await page.waitForFunction(() => window.blendFixture?.plots?.multiply);
  await page.evaluate(() => Promise.all(Object.values(window.blendFixture.plots).map((plot) => plot.whenSettled())));
  await page.waitForTimeout(500);
  const normal = await overlap(page, "normal"), additive = await overlap(page, "additive");
  const screen = await overlap(page, "screen"), multiply = await overlap(page, "multiply");
  // Normal: green over red over white at 50% each keeps some background blue.
  expect(normal.middle[2]).toBeGreaterThan(40);
  // Additive: the two contributions add to yellow with no background left in the blue channel.
  expect(additive.middle[2]).toBeLessThan(20);
  expect(additive.middle[0]).toBeGreaterThan(150);
  expect(Math.abs(additive.middle[0] - additive.middle[1])).toBeLessThan(20);
  // Screen saturates red and green; multiply darkens red below the normal composite.
  expect(screen.middle[0]).toBeGreaterThan(240);
  expect(screen.middle[1]).toBeGreaterThan(240);
  expect(multiply.middle[0]).toBeLessThan(normal.middle[0] - 30);
});

test("vector export carries mix-blend-mode where SVG has one and rasterizes the rest", async ({ page }) => {
  await page.goto("/test/blend");
  await page.waitForFunction(() => window.blendFixture?.plots?.multiply);
  await page.evaluate(() => Promise.all(Object.values(window.blendFixture.plots).map((plot) => plot.whenSettled())));
  await page.waitForTimeout(500);
  const result = await page.evaluate(async () => {
    const out = {};
    for (const mode of ["multiply", "additive"]) {
      const plot = window.blendFixture.plots[mode];
      await plot.whenSettled();
      const exported = await plot.exportSVG();
      out[mode] = { svg: await exported.blob.text(), warnings: exported.report?.warnings ?? [] };
    }
    return out;
  });
  expect(result.multiply.svg).toContain("mix-blend-mode: multiply");
  expect(result.additive.svg).not.toContain("mix-blend-mode");
  expect(result.additive.warnings.join(" ")).toMatch(/additive blending has no vector equivalent/);
  expect(result.additive.svg).toContain("<image");
});

test.describe('mesh row opacity', () => {
  test.use({ deviceScaleFactor: 2 });
  test('rectangles, prisms and GeoJSON faces draw fractional row alpha', async ({ page }) => {
    await page.goto('/test/blend');
    await page.waitForFunction(() => window.blendFixture?.plots?.polar);
    await page.waitForFunction(() => {
      const canvases = [...document.querySelectorAll('.canvas')];
      return canvases.length > 0 && canvases.every(node => node.getAttribute('aria-busy') === 'false');
    });
    const time = value => page.evaluate(async value => {
      await Promise.all(['cartesian', 'polar', 'prism', 'geo'].map(async kind => {
        const plot = window.blendFixture.plots[kind];
        await plot.setAnimationTime(value); await plot.whenSettled();
      }));
    }, value);
    await time(1000);
    await page.evaluate(() => window.blendFixture.setGeoRowOpacity(1));
    await page.evaluate(() => window.blendFixture.setRowOpacity(0));
    // Data publishes asynchronously; a barrier requested before that effect runs can still
    // cover the old frame. Confirm the new alpha target reached each mark before advancing
    // its frozen clock, otherwise a late publication starts the transition at the midpoint.
    await expect.poll(() => page.evaluate(async () => {
      for (const kind of ['cartesian', 'polar', 'prism']) {
        const mark = window.blendFixture.plots[kind].getLegendSource().entries()
          .map(handle => handle.guideMark()).find(Boolean);
        const data = mark?.fields.get('interactionOpacity')?.data;
        const values = typeof data === 'number' ? [data] : data?.ref ? [...await data.ref.data()] : [];
        if (!values.length || values.some(value => value !== 0)) return false;
      }
      return true;
    })).toBe(true);
    await page.evaluate(() => Promise.all(['cartesian', 'polar', 'prism'].map(kind => window.blendFixture.plots[kind].whenSettled())));
    await time(1500);
    await page.evaluate(() => window.blendFixture.setGeoRowOpacity(0.5));
    for (const kind of ['cartesian', 'polar', 'geo']) {
      const pixel = (await overlap(page, kind)).middle;
      expect(pixel[0], kind).toBeGreaterThan(240);
      expect(pixel[1], kind).toBeGreaterThan(100);
      expect(pixel[1], kind).toBeLessThan(210);
      expect(Math.abs(pixel[1] - pixel[2]), kind).toBeLessThan(5);
    }
    // A lit prism can composite multiple faces. Its drawn midpoint must still be
    // visibly translucent, preserving red instead of remaining opaque or disappearing.
    const prism = (await overlap(page, 'prism')).middle;
    expect(prism[0]).toBeGreaterThan(prism[1] + 25);
    expect(prism[1]).toBeGreaterThan(20);
    expect(prism[1]).toBeLessThan(240);
    await time(2000);
    await page.evaluate(() => window.blendFixture.setGeoRowOpacity(0));
    for (const kind of ['cartesian', 'polar', 'prism', 'geo']) expect(Math.min(...(await overlap(page, kind)).middle)).toBeGreaterThan(240);
  });
});

test.describe('point depth writes', () => {
  test.use({ deviceScaleFactor: 2 });
  test('point depth writes change drawn overlap while picking the nearest row', async ({ page }) => {
    await page.goto('/test/point-depth');
    await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.pointDepth?.marks?.Points3D?.getMark())?.interaction);
    const settle = async () => {
      await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
      await page.evaluate(() => Promise.all(Object.values(window.pointDepth.plots).map(async plot => {
        await plot.whenSettled(); await plot.whenAnimationsFinished();
        if (plot.getRenderError()) throw new Error(plot.getRenderError());
      })));
    };
    const center = kind => page.evaluate(async kind => {
      const blob = await window.pointDepth.plots[kind].exportPNG(), bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
      const pixel = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
      return [...pixel];
    }, kind);
    const red = pixel => { expect(pixel[0]).toBeGreaterThan(200); expect(pixel[2]).toBeLessThan(40); };
    const blue = pixel => { expect(pixel[2]).toBeGreaterThan(200); expect(pixel[0]).toBeLessThan(40); };
    await settle();
    for (const kind of ['Points', 'Points3D']) red(await center(kind));
    await page.evaluate(() => window.pointDepth.set(false));
    await settle();
    for (const kind of ['Points', 'Points3D']) {
      blue(await center(kind));
      const box = await page.locator(`[data-point-kind="${kind}"] canvas`).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(kind => {
        const binding = ((m) => m?.view.marks.of(m))(window.pointDepth.marks[kind].getMark())?.interaction;
        return [...binding.selection.rows(binding.owner)][0] === 0;
      }, kind);
    }
    const svg = await page.evaluate(async () => {
      const result = await window.pointDepth.plots.Points.exportSVG();
      let refusal = '';
      try { await window.pointDepth.plots.Points.exportSVG({ mode: 'vector' }); }
      catch (error) { refusal = error.message; }
      return {text: await result.blob.text(), refusal};
    });
    expect(svg.text).toContain('<image');
    expect(svg.refusal).toContain('disables depth writes');
    await page.evaluate(() => window.pointDepth.set(true));
    await settle();
    for (const kind of ['Points', 'Points3D']) red(await center(kind));
  });
});
