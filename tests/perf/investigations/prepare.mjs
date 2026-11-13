// Read-only git archive; creates a separate snapshot and never writes repository git state.
import { spawn } from 'node:child_process';
import { access, cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const repository=fileURLToPath(new URL('../../../',import.meta.url));
const label=process.argv[2]??'baseline',reference=process.env.BENCH_REF??'a3667d1d';
if(!['baseline','prototype105'].includes(label))throw Error('Pass baseline or prototype105.');
const directory=join(process.env.INVESTIGATION_ROOT??join(tmpdir(),'hmplot-stages100-105'),label);
try{await access(directory);throw Error(`Snapshot already exists: ${directory}. Choose another INVESTIGATION_ROOT.`);}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(directory,{recursive:true});
const run=(command,args,cwd=repository)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${command} exited ${code}`)));});
await new Promise((resolve,reject)=>{
 const child=spawn('git',['archive',reference],{cwd:repository,stdio:['ignore','pipe','inherit']});
 const tar=spawn('tar',['-x','-C',directory],{stdio:['pipe','inherit','inherit']});child.stdout.pipe(tar.stdin);
 child.on('error',reject);tar.on('error',reject);child.on('exit',code=>{if(code)reject(Error(`git archive exited ${code}`));});tar.on('exit',code=>code===0?resolve():reject(Error(`tar exited ${code}`)));
});
await symlink(join(repository,'node_modules'),join(directory,'node_modules'),'dir');
for(const path of ['static/example-builds','python/hmplot/static']){
 try{await access(join(repository,path));await cp(join(repository,path),join(directory,path),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
}
const route=join(directory,'src/routes/test/investigation-scales');await mkdir(route,{recursive:true});
await cp(new URL('./scales-fixture.svelte',import.meta.url),join(route,'+page.svelte'));
try{await access(join(repository,'src/routes/test/scale-summary'));
 await cp(join(repository,'src/routes/test/scale-summary'),join(directory,'src/routes/test/scale-summary'),{recursive:true});
}catch(e){if(e.code!=='ENOENT')throw e;}
let config=await readFile(join(directory,'vite.config.js'),'utf8');
config=config.replace(/\s*examples\(\),?/g,'');
config=config.replace(/allow:\s*\[([^\]]*)\]/,(_,paths)=>`allow: [${paths}, ${JSON.stringify(join(repository,'node_modules'))}]`);
await writeFile(join(directory,'vite.config.js'),config);
if(label==='prototype105')await run('git',['apply',fileURLToPath(new URL('./stage105.patch',import.meta.url))],directory);
await writeFile(join(directory,'INVESTIGATION.json'),JSON.stringify({reference,label,repository,fixture:'test/investigation-scales',prototypePatch:label==='prototype105'?'stage105.patch':null},null,2));
console.log(directory);
console.log(`Start a fresh server in this directory: VITE_CACHE_DIR=${join(directory,'.vite-cache')} node ${join(repository,'node_modules/vite/bin/vite.js')} --host 127.0.0.1 --port ${label==='baseline'?5483:5484} --strictPort`);
