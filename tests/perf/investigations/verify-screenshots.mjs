// Compare original DPR-2 screenshots without rendering or modifying them.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pixelReader } from '../../browser/png.js';
const directory=process.env.BENCH_SHOTS??process.env.BENCH_OUT??join(tmpdir(),'hmplot-stages100-105','results');
const baseline=process.env.BENCH_BASELINE_LABEL??'baseline-quiet';
const prototype=process.env.BENCH_PROTOTYPE_LABEL??'prototype105-quiet';
const results=[];
for(const name of ['scale-filter-small','scale-filter-50k','bounds-style-50k','bounds-filter-50k']){
 const a=pixelReader(await readFile(join(directory,`${baseline}-${name}.png`)));
 const b=pixelReader(await readFile(join(directory,`${prototype}-${name}.png`)));
 let samples=0,differences=0,nonwhite=0,maxDelta=0;
 // Includes plot marks, guides and the colorbar; excludes browser chrome.
 for(let y=20;y<900;y+=3)for(let x=20;x<1480;x+=3){
  const p=a(x,y),q=b(x,y);samples++;
  if(p.some(value=>value<245))nonwhite++;
  const delta=Math.max(...p.map((value,i)=>Math.abs(value-q[i])));
  maxDelta=Math.max(delta,maxDelta);if(delta>0)differences++;
 }
 results.push({name,samples,nonwhite,differences,maxDelta});
}
await writeFile(join(process.env.BENCH_OUT??directory,'scale105-visual-parity.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(result=>result.differences>0||result.nonwhite===0))throw Error('Scale screenshot parity failed. Inspect original screenshots.');
