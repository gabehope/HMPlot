import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-webgpu']});
try{
 for(const [mode,path] of [['JupyterLab','lab/tree/frames-lab.ipynb'],['Notebook 7','notebooks/frames-notebook.ipynb']]){
 const page=await browser.newPage({viewport:{width:1400,height:1050}});
 await page.goto((process.env.NOTEBOOK_URL ?? 'http://localhost:8894')+'/'+path+'?token='+(process.env.NOTEBOOK_TOKEN ?? 'heatmap-local-test'));
 await page.locator('.jp-CodeCell:visible .cm-content').first().waitFor({timeout:30000});
 await page.waitForTimeout(1500);await page.locator('.jp-CodeCell:visible .cm-content').first().click();await page.keyboard.press('Shift+Enter');
 await page.waitForFunction(()=>document.querySelectorAll('canvas').length>=2,{},{timeout:40000});
 assert.match(await page.locator('body').innerText(),/HEATMAP_VERSION 0.3.1/);
 const code="await scene.when_settled()\nwith scene.batch_update():\n    table.update_columns(temperature=np.cos(x))\n    histogram.update(bins=12, normalization='density')\nawait scene.when_settled()\nprint('FRAMES_UPDATED', scene.error)\nblob=await scene.export_png()\nprint('FRAMES_PNG',len(blob),blob[:8])";
 await page.locator('.jp-CodeCell:visible .cm-content').last().click();await page.keyboard.insertText(code);await page.keyboard.press('Shift+Enter');
 await page.waitForFunction(()=>[...document.querySelectorAll('.jp-OutputArea-output')].some(e=>e.textContent.includes('FRAMES_PNG')),{},{timeout:40000});
 const text=await page.locator('body').innerText();assert.match(text,/FRAMES_UPDATED None/);assert.match(text,/FRAMES_PNG \d+ b'\\x89PNG/);
 console.log(mode,'fresh wheel: rendering, binary updates, histogram updates, settlement and PNG passed');
 await page.screenshot({path:'/tmp/frames-'+mode.replaceAll(' ','-')+'.png'});await page.close();
 }
}finally{await browser.close();}
