import { test, expect } from './fixtures.js';
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from './gpu-counters.js';

test.use({ deviceScaleFactor: 2 });
async function open(page, query = '') {
  await page.goto('/test/aspect-3d' + query);
  await page.waitForFunction(() => {
    const fixture = window.aspect3dFixture, error = fixture?.plot?.getRenderError?.();
    if (error) throw Error(error);
    return fixture?.points?.getMark()?.view.navigation.controls.current;
  });
  await expect.poll(() => page.locator('.canvas').getAttribute('aria-busy')).toBe('false');
  await page.evaluate(() => window.aspect3dFixture.plot.whenSettled());
}
const projections = page => page.evaluate(() => [[50, 25, 5], [60, 25, 5], [50, 35, 5]].map(window.aspect3dFixture.project));
const redAt = (page, points) => page.evaluate(async points => {
  const bitmap = await createImageBitmap(await window.aspect3dFixture.plot.exportPNG());
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
  const sx = canvas.width / 600, sy = canvas.height / 420;
  return points.map(point => {
    const colors = context.getImageData(Math.round(point.x * sx) - 2, Math.round(point.y * sy) - 2, 5, 5).data;
    return Array.from({ length: 25 }, (_, index) => index * 4).some(index =>
      colors[index] > 150 && colors[index + 1] < 100 && colors[index + 2] < 100);
  });
}, points);

test('equal 3D data units render and pick at the same projected positions', async ({ page }) => {
  await open(page);
  const p = await projections(page);
  expect(Math.abs(p[1].x - p[0].x)).toBeCloseTo(Math.abs(p[2].y - p[0].y), 4);
  expect(await redAt(page, p)).toEqual([true, true, true]);
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(box.x + p[1].x, box.y + p[1].y);
  await expect.poll(() => page.evaluate(() => window.aspect3dFixture.picked)).toBe(1);
  const svg = await page.evaluate(async () => (await window.aspect3dFixture.plot.exportSVG()).blob.text());
  expect(svg).toContain('box-grid');
  expect(svg).toContain('data-plane="xy"');
  expect(svg).toContain('box-title');
});

test('changing aspect and domains updates geometry without resetting the camera', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => window.aspect3dFixture.plot.getCamera());
  await page.evaluate(() => window.aspect3dFixture.setAspect('auto'));
  await page.evaluate(() => window.aspect3dFixture.plot.whenSettled());
  const auto = await projections(page);
  expect(Math.abs(auto[2].y - auto[0].y) / Math.abs(auto[1].x - auto[0].x)).toBeCloseTo(2, 4);
  expect(await redAt(page, auto)).toEqual([true, true, true]);
  await page.evaluate(() => { window.aspect3dFixture.setAspect('equal'); window.aspect3dFixture.setY([0, 100]); });
  await page.evaluate(() => window.aspect3dFixture.plot.whenSettled());
  const equal = await projections(page);
  expect(Math.abs(equal[1].x - equal[0].x)).toBeCloseTo(Math.abs(equal[2].y - equal[0].y), 4);
  expect(await redAt(page, equal)).toEqual([true, true, true]);
  expect(await page.evaluate(() => window.aspect3dFixture.plot.getCamera())).toEqual(before);
});

test('box, triad and plane selections update the visible guides', async ({ page }) => {
  await open(page);
  await expect(page.locator('.box-edge')).toHaveCount(12);
  await expect(page.locator('.box-title')).toHaveCount(3);
  await page.evaluate(() => window.aspect3dFixture.setGuides({ style: 'triad', gridPlanes: ['yz'] }));
  await expect(page.locator('.box-edge')).toHaveCount(3);
  await expect(page.locator('.box-grid[data-plane="xy"]')).toHaveCount(0);
  await expect.poll(() => page.locator('.box-grid[data-plane="yz"]').count()).toBeGreaterThan(0);
  const grids = await page.locator('.box-grid').count();
  await page.evaluate(() => window.aspect3dFixture.setAxis('y', { grid: 'off' }));
  await expect.poll(() => page.locator('.box-grid').count()).toBeLessThan(grids);
  await expect.poll(() => page.locator('.box-grid').count()).toBeGreaterThan(0);
  await page.evaluate(() => window.aspect3dFixture.setAxis('z', { grid: 'off' }));
  await expect(page.locator('.box-grid')).toHaveCount(0);
  await page.evaluate(() => window.aspect3dFixture.plot.setCamera({ position: [-90, 60, -120] }));
  await expect(page.locator('.box-title')).toHaveCount(3);
  expect(await page.evaluate(() => window.aspect3dFixture.plot.getRenderError())).toBe('');
  await page.evaluate(() => window.aspect3dFixture.setGuides(false));
  await expect(page.locator('[aria-label="3D coordinate axes"]')).toHaveCount(0);
});

test('authored 3D axis visibility enables only those guides; an explicit false hides them', async ({ page }) => {
  await open(page, '?automatic=1');
  await expect(page.locator('[aria-label="3D coordinate axes"]')).toHaveCount(0);
  await page.evaluate(() => window.aspect3dFixture.setAxis('x', { visible: true }));
  await expect(page.locator('.box-edge')).toHaveCount(4);
  await expect(page.locator('.box-title')).toHaveText('X');
  await page.evaluate(() => window.aspect3dFixture.setAxis('y', { visible: true }));
  await expect(page.locator('.box-edge')).toHaveCount(8);
  await expect(page.locator('.box-title')).toHaveCount(2);
  await page.evaluate(() => window.aspect3dFixture.setGuides(false));
  await expect(page.locator('[aria-label="3D coordinate axes"]')).toHaveCount(0);
});

test('warm 3D aspect updates render frames without shader builds or readbacks', async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page);
  const update = async aspect => {
    await page.evaluate(value => window.aspect3dFixture.setAspect(value), aspect);
    await page.evaluate(() => window.aspect3dFixture.plot.whenSettled());
    await page.waitForTimeout(100);
  };
  await update('auto');
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  const frame = await page.evaluate(() => window.aspect3dFixture.plot.getDiagnostics().completedFrame);
  await update('equal');
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
  expect(work.readbacks, JSON.stringify(work)).toBe(0);
  expect(await page.evaluate(() => window.aspect3dFixture.plot.getDiagnostics().completedFrame)).toBeGreaterThan(frame);
});

test('generic Surface meshes share the live root display metric', async ({ page }) => {
  await open(page, '?surface=1');
  const size = () => page.evaluate(async () => {
    const bitmap = await createImageBitmap(await window.aspect3dFixture.plot.exportPNG());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = 4 * (y * canvas.width + x);
      if (data[i] > 150 && data[i + 1] < 100 && data[i + 2] < 100) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { width: right - left + 1, height: bottom - top + 1 };
  });
  const equal = await size();
  expect(equal.width).toBeGreaterThan(20);
  expect(Math.abs(equal.height - equal.width)).toBeLessThan(3);
  await page.evaluate(() => window.aspect3dFixture.setAspect('auto'));
  await page.evaluate(() => window.aspect3dFixture.plot.whenSettled());
  const auto = await size();
  expect(Math.abs(auto.height - 2 * auto.width)).toBeLessThan(4);
});

test('a height surface shares its logical domains with the root metric and axis labels', async ({ page }) => {
  await open(page, '?heatmap=1');
  const heightTicks = await page.locator('.axes3d-overlay text[data-axis="y"]:not(.box-title)').allTextContents();
  expect(heightTicks.length).toBeGreaterThan(1);
  expect(heightTicks.map(Number).every(value => value >= 0 && value <= 10)).toBe(true);
  await page.evaluate(() => window.aspect3dFixture.setAxis('z', { visible: false }));
  await expect(page.locator('.axes3d-overlay text[data-axis="y"]')).toHaveCount(0);
  await expect.poll(() => page.locator('.axes3d-overlay text[data-axis="z"]').count()).toBeGreaterThan(0);
  await page.evaluate(() => window.aspect3dFixture.setGuides(false));
  await expect(page.locator('[aria-label="3D coordinate axes"]')).toHaveCount(0);
  const ratio = () => page.evaluate(async () => {
    const bitmap = await createImageBitmap(await window.aspect3dFixture.plot.exportPNG());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (data[4 * (y * canvas.width + x) + 3] > 200) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { width: right - left + 1, height: bottom - top + 1 };
  });
  const equal = await ratio();
  expect(equal.width).toBeGreaterThan(100);
  expect(equal.height / equal.width).toBeGreaterThan(.06);
  expect(equal.height / equal.width).toBeLessThan(.12);
  await page.evaluate(() => window.aspect3dFixture.setAspect('auto'));
  await page.evaluate(() => window.aspect3dFixture.plot.whenSettled());
  const auto = await ratio();
  expect(auto.height / auto.width).toBeGreaterThan(.5);
});


test('stationary Z-up guides settle and navigation still updates their projection', async ({ page }) => {
  await open(page, '?z-up=1');
  // Exercise viewTelemetry's orientation overlay as well as the 3D box axes.
  await page.locator('canvas').first().hover();
  await page.evaluate(() => window.aspect3dFixture.plot.whenSettled());
  const idle = await page.evaluate(async () => {
    const plot = window.aspect3dFixture.plot;
    const before = plot.getDiagnostics().completedFrame;
    let changes = 0;
    const observer = new MutationObserver(records => changes += records.length);
    observer.observe(document.querySelector('[aria-label="3D coordinate axes"]'), { attributes: true, childList: true, subtree: true });
    for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
    observer.disconnect();
    return { changes, frames: plot.getDiagnostics().completedFrame - before, pending: plot.getDiagnostics().pendingPreparations };
  });
  expect(idle.changes).toBe(0);
  expect(idle.pending).toBe(0);
  expect(idle.frames).toBeLessThanOrEqual(2);
  const before = await page.locator('[aria-label="3D coordinate axes"]').innerHTML();
  await page.evaluate(async () => {
    const plot = window.aspect3dFixture.plot, state = plot.getCamera();
    await plot.setCamera({ position: state.position.map((value, axis) => value + (axis === 0 ? 10 : 0)) });
    await plot.whenSettled();
  });
  await expect.poll(() => page.locator('[aria-label="3D coordinate axes"]').innerHTML()).not.toBe(before);
  const svg = await page.evaluate(async () => (await window.aspect3dFixture.plot.exportSVG()).blob.text());
  expect(svg).toContain('box-title');
  expect(await page.evaluate(() => window.aspect3dFixture.plot.getRenderError())).toBe('');
});


test('view presets default to Z-up, switch to Y-up, and respect explicit up', async ({ page }) => {
  await open(page, '?presets=1');
  const up = () => page.evaluate(() => window.aspect3dFixture.plot.getCamera().up);
  const change = async (type, override) => {
    await page.evaluate(async ({ type, override }) => {
      const fixture = window.aspect3dFixture;
      fixture.setType(type);
      fixture.setUp(override ?? undefined);
      await new Promise(requestAnimationFrame);
      await fixture.plot.whenSettled();
    }, { type, override });
  };
  expect(await up()).toEqual([0, 0, 1]);
  await change('3d-y-up');
  expect(await up()).toEqual([0, 1, 0]);
  await change('3d-y-up', [1, 0, 0]);
  expect(await up()).toEqual([1, 0, 0]);
  await change('3d', [1, 0, 0]);
  expect(await up()).toEqual([1, 0, 0]);
  await change('3d');
  expect(await up()).toEqual([0, 0, 1]);
  await change('2d');
  await change('3d-y-up');
  expect(await up()).toEqual([0, 1, 0]);
  await page.evaluate(() => window.aspect3dFixture.plot.openSettings());
  const panel = page.getByRole('dialog');
  const section = panel.locator("summary").filter({ hasText: /^View/ });
  if (await section.getAttribute("aria-expanded") !== "true") await section.click();
  const viewMode = panel.getByLabel("View mode", { exact: true });
  await viewMode.selectOption('3d');
  await expect.poll(up).toEqual([0, 0, 1]);
  await viewMode.selectOption('3d-y-up');
  await expect.poll(up).toEqual([0, 1, 0]);
  const svg = await page.evaluate(async () => (await window.aspect3dFixture.plot.exportSVG()).blob.text());
  expect(svg).toContain('box-title');
  expect(svg).toContain('<circle');
  expect(await page.evaluate(() => window.aspect3dFixture.plot.getRenderError())).toBe('');
});
