import { test, expect } from './fixtures.js';
test('point hover identities survive 2D/3D switching',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/test/hover3d');await page.waitForFunction(()=>window.__hover3d?.points);
 for(let mode=0;mode<3;mode++){
  if(mode)await page.getByRole('button',{name:'Switch view',exact:true}).click();
  await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(()=>window.__hover3d.plot.whenSettled());
  await page.evaluate(()=>window.__hover3d.plot.getHover().cancelPreview());
  if(mode===1) {
   await page.evaluate(async()=>{
    const {guideObject}=await import('/src/lib/plot/utils/guides.js');
    const m=guideObject(window.__hover3d.points.getLegendSource()),r=m.renderer;
    const controls=m.view.navigation.controls.current;controls.enableDamping=false;
    m.view.picking.camera.current().position.set(0,0,140);
    controls.target.set(0,0,0);controls.update();m.invalidate();
   });
   await page.evaluate(()=>window.__hover3d.plot.whenSettled());
   await page.waitForTimeout(250);
  }
  for(let i=0;i<5;i++){
   const point=await page.evaluate(async i=>{
    const {guideObject}=await import('/src/lib/plot/utils/guides.js');
    const {points,data}=window.__hover3d,m=guideObject(points.getLegendSource()),r=m.renderer,c=m.view.picking.camera.current();
    const xyz=['x','y','z'].map(a=>{const b=m.options.get(a+'bounds'),v=m.options.get(a+'range');return v[0]+(data[a][i]-b[0])/(b[1]-b[0])*(v[1]-v[0]);});
    const pos=c.position.clone().set(...xyz).applyMatrix4(m.matrixWorld).project(c),rect=r.domElement.getBoundingClientRect();
    return {blankX:rect.left+5,blankY:rect.bottom-5,x:rect.left+(pos.x+1)*rect.width/2,y:rect.top+(1-pos.y)*rect.height/2};
   },i);
   await page.mouse.move(point.blankX,point.blankY);
   await expect.poll(()=>page.evaluate(()=>window.__hover3d.plot.getHover().status().previewCount)).toBe(0);
   await page.evaluate(()=>window.__hover3d.plot.whenSettled());
   // A 16px circle has an 8px radius. Empty space must not pick a
   // perspective-enlarged invisible copy of the displayed symbol.
   await page.mouse.move(point.x+11,point.y);
   await page.waitForTimeout(60);
   expect(await page.evaluate(()=>window.__hover3d.plot.getHover().status().previewCount),`mode ${mode}, point ${i}, outside glyph`).toBe(0);
   await page.mouse.move(point.x,point.y);
   await expect.poll(()=>page.evaluate(()=>Array.from(window.__hover3d.plot.getHover().rows(undefined,'preview')))).toEqual([i]);
  }
 }
 expect(errors).toEqual([]);
});

test('context menu opens settings when the trigger is disabled',async({page})=>{
 await page.goto('/test/hover3d');
 await page.waitForFunction(()=>window.__hover3d?.plot);
 await page.evaluate(()=>window.__hover3d.plot.whenSettled());
 const canvas=page.getByRole('application',{name:'Plot canvas'});
 await expect(page.getByRole('button',{name:/Settings for/})).toHaveCount(0);
 await canvas.click({button:'right',position:{x:100,y:100}});
 await page.getByRole('menuitem',{name:'Open settings'}).click();
 await expect(page.getByRole('dialog',{name:/Settings/})).toHaveCount(1);
 await page.keyboard.press('Escape');
 await canvas.focus();await page.keyboard.press('Shift+F10');
 await expect(page.getByRole('menuitem',{name:'Open settings'})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('menuitem',{name:'Open settings'})).not.toBeVisible();
});

test('a tooltip in 3D: the point in front wins, within the radius, and the box hides while orbiting (TODO 44)',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/test/hover3d?tooltip');await page.waitForFunction(()=>window.__hover3d?.points);
 await page.getByRole('button',{name:'Switch view',exact:true}).click();
 await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
 await page.evaluate(()=>window.__hover3d.plot.whenSettled());
 // The camera on the z axis: rows 0 (z .5) and 5 (z .2) both sit at the canvas's centre.
 const axisView=async()=>{
  const center=await page.evaluate(async()=>{
   const {guideObject}=await import('/src/lib/plot/utils/guides.js');
   const m=guideObject(window.__hover3d.points.getLegendSource()),r=m.renderer;
   const controls=m.view.navigation.controls.current;controls.enableDamping=false;
   m.view.picking.camera.current().position.set(0,0,140);
   controls.target.set(0,0,0);controls.update();m.invalidate();
   const rect=r.domElement.getBoundingClientRect();
   return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  });
  await page.evaluate(()=>window.__hover3d.plot.whenSettled());
  await page.waitForTimeout(250);
  return center;
 };
 let center=await axisView();
 const box=page.locator('.plot-tooltip');
 // 11 px from the centre, off the 16 px glyph (the exact pick missed there): the front row shows.
 await page.mouse.move(center.x+11,center.y);
 await expect(box).toContainText('z0.5');
 // A drag orbits the camera: the box hides while it moves.
 await page.mouse.down();
 await page.mouse.move(center.x+60,center.y+20,{steps:4});
 await expect(box).toHaveCount(0);
 await page.mouse.up();
 center=await axisView();
 await page.mouse.move(center.x+200,center.y+200);
 await expect(box).toHaveCount(0);
 await page.mouse.move(center.x+11,center.y);
 await expect(box).toContainText('z0.5');
 expect(errors).toEqual([]);
});


test.describe("view controller teardown", () => {
 test.use({deviceScaleFactor:2});
 // Pause a real per-row GPU read, after mapping but before the mark can publish @tooltip.
 async function delayTooltipRead(page) {
  await page.evaluate(()=>{
   const mark=window.__hover3d.points.getMark(),device=mark.renderer.backend.device;
   const binding=mark.view.marks.of(mark),createBuffer=device.createBuffer.bind(device),seriesAt=binding.tooltip.series;
   window.delayedTooltip={done:false,resource:binding.interaction.owner.tooltip};
   let held=false;
   // The mark's accepted binding, with a series that holds its row read.
   mark.view.marks.publish(mark,{...binding,tooltip:{...binding.tooltip,series:async(...args)=>{
    device.createBuffer=descriptor=>{
     const buffer=createBuffer(descriptor);
     if(!held && descriptor.size===16 && (descriptor.usage & GPUBufferUsage.MAP_READ)) {
      held=true;
      const map=buffer.mapAsync.bind(buffer);
      buffer.mapAsync=async(...args)=>{
       await map(...args);
       await new Promise(resolve=>{window.delayedTooltip.release=resolve;});
      };
     }
     return buffer;
    };
    let pending;
    try{pending=seriesAt(...args);}
    finally{device.createBuffer=createBuffer;}
    try{return await pending;}
    finally{window.delayedTooltip.done=true;}
   }}});
  });
 }
 test("unmount cancels a brush preview and a delayed unified tooltip before remount", async ({page}) => {
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/test/hover3d?tooltip&unified");
  const ready=async()=>{
   await page.waitForFunction(()=>{const mark=window.__hover3d?.points?.getMark();return mark?.view.marks.of(mark)?.interaction;});
   await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
   await page.evaluate(()=>window.__hover3d.plot.whenSettled());
  };
  await ready();
  await page.evaluate(()=>{
   const mark=window.__hover3d.points.getMark();
   window.retiredView={renderer:mark.renderer,controls:mark.view.navigation.controls.current,brush:mark.view.marks.of(mark).interaction.brush};
  });
  let canvas=await page.getByRole("application",{name:"Plot canvas"}).boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(canvas.x+canvas.width*.2,canvas.y+canvas.height*.2);await page.mouse.down();
  await page.mouse.move(canvas.x+canvas.width*.7,canvas.y+canvas.height*.7,{steps:5});
  await expect(page.locator(".brush-region")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.retiredView.brush.status().previewActive)).toBe(true);
  await page.evaluate(()=>window.__hover3d.setMounted(false));
  await expect(page.getByRole("application",{name:"Plot canvas"})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.retiredView.brush.status().previewActive)).toBe(false);
  expect(await page.evaluate(()=>window.retiredView.controls.enabled)).toBe(true);
  await page.mouse.up();await page.keyboard.up("Shift");
  await page.evaluate(()=>window.__hover3d.setMounted(true));await ready();
  canvas=await page.getByRole("application",{name:"Plot canvas"}).boundingBox();
  await page.mouse.move(...(await page.evaluate(()=>{const l=window.__hover3d.plot.getAxisLayout(),r=document.querySelector("canvas").getBoundingClientRect();return [r.left+(l.left+l.right)/2,r.top+(l.top+l.bottom)/2];})));
  await expect(page.locator(".plot-tooltip")).toBeVisible();
  await page.mouse.move(canvas.x-5,canvas.y-5);
  await expect(page.locator(".plot-tooltip")).toHaveCount(0);
  await delayTooltipRead(page);
  await page.evaluate(()=>{const mark=window.__hover3d.points.getMark();window.retiredView={renderer:mark.renderer,view:mark.view};});
  await page.mouse.move(...(await page.evaluate(()=>{const l=window.__hover3d.plot.getAxisLayout(),r=document.querySelector("canvas").getBoundingClientRect();return [r.left+(l.left+l.right)/2,r.top+(l.top+l.bottom)/2];})));
  await page.waitForFunction(()=>window.delayedTooltip.release);
  await page.evaluate(()=>window.__hover3d.setMounted(false));
  await expect(page.getByRole("application",{name:"Plot canvas"})).toHaveCount(0);
  await page.evaluate(()=>window.delayedTooltip.release());
  await expect.poll(()=>page.evaluate(()=>window.retiredView.view.lifecycle.preparations.size)).toBe(0);
  expect(await page.evaluate(()=>window.delayedTooltip.resource.previewActive)).toBe(false);
  expect(await page.evaluate(()=>{
   const {navigation,picking}=window.retiredView.view;
   return [picking.context.current,picking.brushReadback.current,navigation.tooltip.current,navigation.pointer.current,navigation.rootFrame.current].every(value=>value===undefined);
  })).toBe(true);
  await expect(page.locator(".plot-tooltip")).toHaveCount(0);
  await page.evaluate(()=>window.__hover3d.setMounted(true));await ready();
  canvas=await page.getByRole("application",{name:"Plot canvas"}).boundingBox();
  await page.mouse.move(canvas.x-5,canvas.y-5);
  await page.mouse.move(...(await page.evaluate(()=>{const l=window.__hover3d.plot.getAxisLayout(),r=document.querySelector("canvas").getBoundingClientRect();return [r.left+(l.left+l.right)/2,r.top+(l.top+l.bottom)/2];})));
  await expect(page.locator(".plot-tooltip")).toBeVisible();
  expect(errors).toEqual([]);
 });
 test("leaving a unified tooltip cancels pending row membership",async({page})=>{
  await page.goto("/test/hover3d?tooltip&unified");
  await page.waitForFunction(()=>((m) => m?.view.marks.of(m))(window.__hover3d?.points?.getMark())?.interaction);
  await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(()=>window.__hover3d.plot.whenSettled());
  const canvas=await page.getByRole("application",{name:"Plot canvas"}).boundingBox();
  await delayTooltipRead(page);
  await page.mouse.move(...(await page.evaluate(()=>{const l=window.__hover3d.plot.getAxisLayout(),r=document.querySelector("canvas").getBoundingClientRect();return [r.left+(l.left+l.right)/2,r.top+(l.top+l.bottom)/2];})));
  await page.waitForFunction(()=>window.delayedTooltip.release);
  await page.mouse.move(canvas.x-5,canvas.y-5);
  await page.evaluate(()=>window.delayedTooltip.release());
  await expect.poll(()=>page.evaluate(()=>window.delayedTooltip.done)).toBe(true);
  expect(await page.evaluate(()=>window.delayedTooltip.resource.previewActive)).toBe(false);
  await expect(page.locator(".plot-tooltip")).toHaveCount(0);
  await page.mouse.move(...(await page.evaluate(()=>{const l=window.__hover3d.plot.getAxisLayout(),r=document.querySelector("canvas").getBoundingClientRect();return [r.left+(l.left+l.right)/2,r.top+(l.top+l.bottom)/2];})));
  await expect(page.locator(".plot-tooltip")).toBeVisible();
  expect(await page.evaluate(()=>window.delayedTooltip.resource.previewActive)).toBe(true);
 });

});
