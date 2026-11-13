import {_electron} from '@playwright/test';
const env={...process.env,VSCODE_CLI:"1"};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({env,executablePath:(process.env.VSCODE_EXECUTABLE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code'),args:['--user-data-dir=/tmp/heatmap-vscode-profile','--extensions-dir='+process.env.HOME+'/.vscode/extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--enable-unsafe-webgpu','/tmp/heatmap-notebook-validation','/tmp/heatmap-notebook-validation/frames-vscode.ipynb'],timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForTimeout(10000);await page.keyboard.press('Escape');
 await page.keyboard.press('Meta+p');await page.keyboard.type('/tmp/heatmap-notebook-validation/frames-vscode.ipynb');await page.keyboard.press('Enter');await page.waitForTimeout(2000);
 console.log('START',(await page.locator('body').innerText()).slice(-2500));
 if(await page.getByText('Select Kernel',{exact:true}).isVisible()){
  await page.getByText('Select Kernel',{exact:true}).click();await page.waitForTimeout(800);
  console.log('KERNEL MENU',(await page.locator('body').innerText()).slice(-1800));
  if(await page.getByText((process.env.NOTEBOOK_KERNEL_LABEL ?? 'heatmap-python-venv (Python 3.13.5)'),{exact:false}).count())await page.getByText((process.env.NOTEBOOK_KERNEL_LABEL ?? 'heatmap-python-venv (Python 3.13.5)'),{exact:false}).first().click();
  else {
    const another=page.getByText('Select Another Kernel...', {exact:false});if(await another.count())await another.first().click();
    await page.getByText('Python Environments...', {exact:true}).click();
    await page.getByText((process.env.NOTEBOOK_KERNEL_LABEL ?? 'heatmap-python-venv (Python 3.13.5)'),{exact:false}).first().click();
  }
  await page.waitForTimeout(2000);
 }
 await page.keyboard.press('Escape');
 const run=page.getByText('Run All',{exact:true});
 if(await run.isVisible())await run.click();else {await page.keyboard.press('Meta+Shift+P');await page.keyboard.type('Notebook: Run All');await page.waitForTimeout(500);await page.keyboard.press('Enter');}
 await page.waitForTimeout(18000);
 for(const f of page.frames()){try{console.log('FRAME',f.url().slice(0,140),(await f.locator('body').innerText()).slice(-3000),'CANVAS',await f.locator('canvas').count());}catch{}}
 const good=await Promise.all(page.frames().map(async f=>{try{return (await f.locator('canvas').count())>=2&&(await f.locator('body').innerText()).includes('Temperature');}catch{return false;}}));if(!good.some(Boolean))throw Error('New frame notebook did not render both plots');console.log('VS Code frame notebook passed');await page.screenshot({path:'/tmp/frames-vscode.png'});
}finally{await app.close();}
