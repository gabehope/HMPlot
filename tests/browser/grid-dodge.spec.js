import { test, expect } from './fixtures.js';
test('grid Dodge shares one expanded scope across points and labels and updates columns',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/test/grid-dodge');await page.waitForFunction(()=>window.gridDodge?.points?.getMark());
 const read=()=>page.evaluate(async()=>{
  const {plot,grid,points,labels}=gridDodge;await grid.whenSettled();await plot.whenSettled();
  const field=points.getMark().fields.get('position').data;
  return {error:plot.getRenderError(),points:points.getMark().count,positions:Array.from(await field.ref.data()),labels:labels.getMark().fields.get('position').data.shape[0]};
 });
 const before=await read();expect(before.error).toBe('');expect(before.points).toBe(5);expect(before.labels).toBe(5);
 await page.evaluate(()=>gridDodge.grid.update({columns:2}));
 const after=await read();expect(after.error).toBe('');expect(after.points).toBe(5);expect(after.positions).not.toEqual(before.positions);
 expect(errors).toEqual([]);
});

test('a mark under Dodge > Interaction is dodged as one directly under Dodge',async({page})=>{
 await page.goto('/test/dodge-interaction');await page.waitForFunction(()=>window.dodgeInteraction?.inner);
 const drawn=await page.evaluate(async()=>{
  const result={};
  for(const [name,plot] of Object.entries(dodgeInteraction)){
   await plot.whenSettled();
   const svg=new DOMParser().parseFromString(await (await plot.exportSVG({mode:'vector'})).blob.text(),'image/svg+xml');
   result[name]={error:plot.getRenderError(),circles:[...svg.querySelectorAll('circle')].map(c=>[c.getAttribute('cx'),c.getAttribute('cy')])};
  }
  return result;
 });
 expect(drawn.dodge.circles).toHaveLength(3);
 expect(drawn.inner).toEqual(drawn.dodge);
});
