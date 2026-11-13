import {_electron} from '@playwright/test';
const env={...process.env,VSCODE_CLI:"1"};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({env,executablePath:(process.env.VSCODE_EXECUTABLE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code'),args:['--user-data-dir=/tmp/heatmap-vscode-stabilization','--extensions-dir='+process.env.HOME+'/.vscode/extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--enable-unsafe-webgpu','/tmp/heatmap-notebook-validation'],timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForTimeout(12000);await page.keyboard.press('Escape');await page.keyboard.press('Meta+Shift+P');await page.keyboard.type('browser');await page.waitForTimeout(1000);console.log('COMMANDS',(await page.locator('.quick-input-widget').innerText()));const command=page.getByText('Open Integrated Browser',{exact:false});if(await command.count())await command.first().click();else {await page.keyboard.press('Meta+a');await page.keyboard.type('>Simple Browser: Show');await page.waitForTimeout(500);await page.keyboard.press('Enter');}await page.waitForTimeout(1500);await page.keyboard.type('http://localhost:5184/test/stabilization');await page.keyboard.press('Enter');
 console.log('CONTENTS',await app.evaluate(({webContents})=>webContents.getAllWebContents().map(c=>({id:c.id,url:c.getURL(),type:c.getType()}))));
 console.log('BODY',(await page.locator('body').innerText()).slice(-2000));
 let id;
 for(let i=0;i<15;i++){id=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(c=>c.getURL().includes('5184/test/stabilization'))?.id);if(id)break;await page.waitForTimeout(1000);}
 if(!id)throw Error('Integrated browser content not found');
 const run=expression=>app.evaluate(({webContents},{id,expression})=>webContents.fromId(id).executeJavaScript(expression),{id,expression});
 for(let i=0;i<30;i++){if(await run('Boolean(window.__stabilization?.read()?.completedFrame>0)'))break;await page.waitForTimeout(1000);}
 for(const v of [{phase:.2},{mode:'3d'},{mode:'2d'},{hidden:true},{hidden:false},{externals:false},{externals:true}])await run('window.__stabilization.set('+JSON.stringify(v)+')');
 const d=await run('window.__stabilization.read()');if(d.overview.clients!==3||d.overview.frames.some(f=>f.error))throw Error('Overview lifecycle failed');console.log('VS Code browser rendering, updates, mode switches and hidden/show passed');await page.screenshot({path:'/tmp/heatmap-stabilization/vscode-browser.png'});
}finally{await app.close();}
