import { test, expect } from './fixtures.js';
test('embedded facets share a renderer, local domains and inherited dimensions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/test/embedded-facets');await page.waitForFunction(()=>window.embeddedFacets?.facet?.getFrames()?.length===2);
 const result=await page.evaluate(async()=>{const {plot,facet}=embeddedFacets;await facet.whenSettled();await plot.whenSettled();return {error:plot.getRenderError(),frames:facet.getFrames().map(({frame})=>{const o=frame.getFrameOptions();return {domain:o.get('xbounds'),range:o.get('xrange'),y:o.get('ybounds')};}),svg:await (await plot.exportSVG()).blob.text()};});
 expect(result.error).toBe('');expect(errors).toEqual([]);expect(await page.locator('canvas').count()).toBe(1);
 expect(result.frames[0].domain).toEqual(result.frames[1].domain);
 expect(result.frames[0].range[1]).toBeLessThan(result.frames[1].range[0]);
 expect(result.frames[0].domain).toEqual([-.5,1.5]);
 expect(result.svg).toContain('<svg');
});
