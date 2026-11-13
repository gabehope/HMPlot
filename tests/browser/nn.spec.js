import { test, expect } from './fixtures.js';
import {pixelReader} from './png.js';
test('RGB pixels, fixed scales and growing heatmaps',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/nn-fixture');await expect(page.locator('canvas')).toHaveCount(3);await page.waitForFunction(()=>window.nnFixture);await page.evaluate(()=>window.nnFixture.settle());
 // The fixture's quadrant centers are CSS coordinates; screenshots retain native DPR pixels.
 const cssPixels=async()=>{const canvas=page.locator('canvas').first(),box=await canvas.boundingBox(),png=await canvas.screenshot(),read=pixelReader(png),sx=png.readUInt32BE(16)/box.width,sy=png.readUInt32BE(20)/box.height;return(x,y)=>read(Math.round(x*sx),Math.round(y*sy));};
 await expect.poll(async()=>{const pixel=await cssPixels();return pixel(60,60)[0];}).toBeGreaterThan(245);
 const pixel=await cssPixels();for(const [x,y,rgb]of [[60,60,[255,0,0]],[180,60,[0,255,0]],[60,180,[0,0,255]],[180,180,[255,255,255]]])pixel(x,y).forEach((v,i)=>expect(Math.abs(v-rgb[i])).toBeLessThan(8));
 const before=await page.locator('canvas').nth(1).screenshot();await page.evaluate(()=>window.nnFixture.change());await page.evaluate(()=>window.nnFixture.settle());
 await expect.poll(async()=>!(await page.locator('canvas').nth(1).screenshot()).equals(before)).toBe(true);expect(errors).toEqual([]);
});

test('superseded buffer growth and remounts retain valid GPU attributes',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/nn-fixture');await expect(page.locator('canvas')).toHaveCount(3);for(let i=0;i<12;i++){await page.evaluate(()=>window.nnFixture.grow());await page.evaluate(()=>window.nnFixture.settle());await page.locator('canvas').last().screenshot();}await page.evaluate(()=>window.nnFixture.remount());await expect(page.locator('canvas')).toHaveCount(3);await page.evaluate(()=>window.nnFixture.settle());await page.locator('canvas').last().screenshot();expect(errors).toEqual([]);});
