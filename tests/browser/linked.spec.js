import { test, expect } from './fixtures.js';
test('normalized viewport links independent cameras; fixed camera rejects interaction',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/linked-fixture');await expect(page.locator('canvas')).toHaveCount(3);await expect.poll(()=>page.evaluate(()=>window.__linked.read().every(Boolean))).toBe(true);await page.locator('canvas').first().hover();await page.mouse.wheel(0,-300);
 await expect.poll(()=>page.evaluate(()=>window.__linked.read()[0].zoom)).toBeGreaterThan(1);const state=await page.evaluate(()=>window.__linked.read());expect(state[1].zoom).toBeCloseTo(state[0].zoom,5);expect(state[1].x).toBeCloseTo(state[0].x,5);expect(state[2].zoom).toBe(1);
 await page.locator('canvas').nth(2).hover();await page.mouse.wheel(0,-300);await page.waitForTimeout(300);expect((await page.evaluate(()=>window.__linked.read()))[2].zoom).toBe(1);expect(errors).toEqual([]);
});
