import { test, expect } from './fixtures.js';

test.use({ deviceScaleFactor: 2 });
async function settled(page) {
  await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => window.axisControls.plot.whenSettled());
  expect(await page.evaluate(() => window.axisControls.plot.getRenderError())).toBeFalsy();
}
async function set(page, value) {
  await page.evaluate(value => window.axisControls.set(value), value);
  await page.waitForTimeout(80);
  await settled(page);
}

test('independent baselines, ticks, short filled arrows and rectangular frame export', async ({ page }, info) => {
  await page.goto('/test/axis-controls');
  await page.waitForFunction(() => window.axisControls?.plot);
  await settled(page);
  // Exercise explicit controls independently of a preset's decorative defaults.
  await set(page, { theme:'minimal',
    x:{label:'Horizontal', line:false, ticks:true, arrow:'end', arrowSize:5},
    y:{label:'Vertical', line:false, ticks:true, arrow:'end', arrowSize:5} });
  const lengths = await page.locator('path.axis-lines').evaluateAll(paths => paths.map(p => p.getTotalLength()));
  expect(lengths).toEqual([10, 10]);
  await expect(page.locator('.arrowhead')).toHaveCount(2);
  expect(await page.locator('.x-tick path').count()).toBeGreaterThan(0);
  await set(page, { x:{line:false, ticks:false, label:'Horizontal', arrow:'both'}, y:{lineWidth:0, label:'Vertical', arrow:'end'} });
  await expect(page.locator('.x-tick path')).toHaveCount(0);
  expect(await page.locator('.x-tick text').count()).toBeGreaterThan(0);
  await expect(page.locator('.axis-lines')).toHaveCount(1);
  await expect(page.locator('.arrowhead')).toHaveCount(3);
  await set(page, { theme:'hmplot', axisFrame:true,
    x:{label:'Horizontal', arrow:'none', tickDirection:'both', tickSize:8, titleFontWeight:500, gridColor:'#d02070',gridWidth:2,gridDash:[4,3]},
    y:{label:'Vertical', arrow:'none'} });
  await expect(page.locator('.axis-lines')).toHaveCount(2);
  await expect(page.locator('.frame-edge')).toHaveCount(2);
  const tick = await page.locator('.x-tick path').first().evaluate(p => p.getBBox().height);
  expect(tick).toBe(16);
  await expect(page.locator('.x-title')).toHaveAttribute('font-weight','500');
  const svg = await page.evaluate(async () => (await window.axisControls.plot.exportSVG()).blob.text());
  expect(svg).toContain('frame-edge');
  expect(svg).toMatch(/stroke-dasharray="4 3"/);
  expect(svg).toContain('#d02070');
  await set(page, {x:{line:false,arrow:'none'},y:{line:false,arrow:'none'}});
  await expect(page.locator('.frame-edge')).toHaveCount(4);
  await expect(page.locator('.axis-lines')).toHaveCount(0);
  await set(page, {axisFrame:false,x:{label:'Horizontal'},y:{label:'Vertical'}});
  await page.screenshot({ path:info.outputPath('axis-controls-dpr2.png') });
});

test('a default globe draws its outline at full size and no Cartesian grid', async ({ page }) => {
  await page.goto('/test/axis-controls');
  await page.waitForFunction(() => window.axisControls?.plot);
  await set(page, { coordinates:'spherical', projection:'orthographic' });
  const drawn = await page.evaluate(async () => {
    const plot = window.axisControls.plot, layout = plot.getAxisLayout(),
      outline = document.querySelector('ellipse.globe-outline');
    const svg = await (await plot.exportSVG({ mode:'vector' })).blob.text();
    return { radius: Number(outline.getAttribute('ry')), area: layout.bottom - layout.top,
      // The graticule is drawn on the GPU (TODO 141); the vector export samples its lines.
      graticule: [...svg.matchAll(/<path[^>]*data-globe-guide=/g)].length,
      straight: [...svg.matchAll(/ d="M[\d.-]+ [\d.-]+ ?[VH]/g)].length };
  });
  expect(drawn.radius).toBeGreaterThan(0.45 * drawn.area);
  expect(drawn.graticule).toBeGreaterThan(10);
  expect(drawn.straight).toBe(0);
  // With both axes hidden, no outline either.
  await set(page, { x:{ visible:false }, y:{ visible:false } });
  await expect(page.locator('ellipse.globe-outline')).toHaveCount(0);
});

test('automatic axes react to coordinates and mode; explicit choices survive every flat spherical projection', async ({ page }) => {
  await page.goto('/test/axis-controls');
  await page.waitForFunction(() => window.axisControls?.plot);
  await settled(page);
  const overlay = page.locator('svg[data-export-axes]');
  await expect(overlay).toHaveCount(1);
  for (const projection of ['equirectangular','mercator','equal-area','orthographic','equal-earth','natural-earth','albers','albers-usa']) {
    await set(page,{coordinates:'spherical',projection});
    // A 2D globe draws its graticule and outline by default (TODO 135.5).
    await expect(overlay).toHaveCount(projection === 'orthographic' ? 1 : 0);
  }
  await set(page,{coordinates:'polar'});
  await expect(overlay).toHaveCount(0);
  await set(page,{coordinates:'cartesian',type:'3d'});
  await expect(overlay).toHaveCount(0);
  await set(page,{type:'2d'});
  await expect(overlay).toHaveCount(1);
  await set(page,{axes:true, coordinates:'spherical',projection:'mercator',x:{grid:'major'}});
  await expect(overlay).toHaveCount(1);
  await set(page,{coordinates:'cartesian'});
  await expect(overlay).toHaveCount(1);
  await set(page,{axes:false,nested:true});
  await expect(overlay).toHaveCount(1);
  await set(page,{coordinates:'spherical'});
  await expect(overlay).toHaveCount(0);
  await set(page,{nestedVisible:true});
  await expect(overlay).toHaveCount(1);
  await set(page,{nestedVisible:null,coordinates:'polar'});
  await expect(overlay).toHaveCount(0);
  await set(page,{coordinates:'cartesian'});
  await expect(overlay).toHaveCount(1);
  // A promoted coordinate root has the same automatic policy as a Plot prop.
  await page.goto('/test/root-coordinates?case=frame');
  await page.waitForFunction(()=>window.rootCoordinates?.frame?.getFrameOptions());
  await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(()=>window.rootCoordinates.plot.whenSettled());
  await expect(overlay).toHaveCount(0);
});
