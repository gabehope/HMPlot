import { test, expect } from './fixtures.js';
// The public pages draw each example's paired Python program (TODO 69.10): its scene goes live
// over the preview, and its inputs are the scene's.
for (const id of ['interaction-dashboard','interaction-matrix','interaction-keyed-updates','calculate-large','calculate-matrix']) {
  test(`${id} renders its interactive example`, async ({page}) => {
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
    // The dashboard's four views fit in the viewport, so screenshots of them scroll nothing.
    if(id==='interaction-dashboard') await page.setViewportSize({width:1300,height:1400});
    await page.goto(`/examples/${id}`);
    // The Example (src/lib/docs/Example.svelte) mounts its program once it is near the viewport.
    await page.locator('section.example').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.live.ready')).toBeVisible({timeout:90000});
    const settle=async()=>{
      await page.waitForFunction(()=>[...document.querySelectorAll('.live .canvas')].every(c=>c.getAttribute('aria-busy')==='false'));
      await page.evaluate(()=>window.__examples?.settle());
    };
    await settle();
    const live=page.locator('.live');
    expect(await live.locator('canvas').count()).toBeGreaterThan(0);
    if(id==='interaction-dashboard') {
      // Hover and click the first row (x 0.08, y 0.5) in the first view, "Shared rows: position":
      // the same row grows, then the selection shows, in the other shared view ("another
      // projection"); the independent table's view does not react. (The four views have the same
      // size and axes: any one's layout places the row.)
      const canvases=live.locator('.canvas'),shot=i=>canvases.nth(i).screenshot();
      const [other,independent]=[await shot(1),await shot(3)];
      const point = await page.evaluate(() => {
        const layout = window.__examples.plot.getAxisLayout();
        const fraction = (axis, value) => {
          const ticks=layout[axis].major, a=ticks[0], b=ticks.at(-1);
          return a.fraction+(value-a.value)/(b.value-a.value)*(b.fraction-a.fraction);
        };
        const box=document.querySelector('.live canvas').getBoundingClientRect();
        return {x:box.left+box.width*fraction('x',0.08),y:box.top+box.height*(1-fraction('y',0.5))};
      });
      await page.mouse.move(point.x,point.y);
      await expect.poll(async()=>(await shot(1)).equals(other)).toBe(false);
      // The click selects once its pick has read back: settle before the pointer leaves.
      await page.mouse.click(point.x,point.y);
      await settle();
      await page.mouse.move(1,1);
      await settle();
      expect((await shot(1)).equals(other)).toBe(false);
      expect((await shot(3)).equals(independent)).toBe(true);
    }
    if(id==='interaction-keyed-updates') {
      // The data steps are inputs in a scene: the frame slider and the row order.
      await live.getByRole('slider',{name:'Frame'}).fill('1');
      await live.getByRole('checkbox',{name:'Reverse row order'}).check();
      await settle();
    }
    if(id.startsWith('calculate-')) {
      await live.getByRole('slider',{name:'Gain'}).fill('1.5');
      await settle();
    }
    expect(errors).toEqual([]);
  });
}
