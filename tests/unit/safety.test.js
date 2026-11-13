import test from 'node:test';
import assert from 'node:assert/strict';
import { pathBudget, wrapTiles, MAX_TOTAL_SUBDIVISIONS } from '../../src/lib/plot/utils/sphericalBudget.js';
import { curvedPathShader } from '../../src/lib/plot/utils/curvedPathShader.js';
test('path work is bounded independently of device allocation limits', () => {
 for (let n=1; n<=1024; n++) {
  const subdivisions=pathBudget(n,1024,512,0.5);
  assert.ok(subdivisions<=256);
  assert.ok(n*subdivisions<=MAX_TOTAL_SUBDIVISIONS);
  assert.equal(Math.log2(subdivisions)%1,0);
 }
 for (const n of [0,-1,Infinity,NaN]) assert.throws(()=>pathBudget(n,1024,512,0.5),/positive whole number/);
 // Past one batch, paths refine in batches (TODO 136.11): a path's budget stops shrinking.
 for (const n of [1025,1560,1_000_000]) assert.equal(pathBudget(n,1024,512,0.5),pathBudget(1024,1024,512,0.5));
 for (const tolerance of [0,-1,Infinity,NaN]) assert.throws(()=>pathBudget(1,1024,512,tolerance));
});
test('shader has a finite bailout for a discontinuity that cannot converge', () => {
 assert.ok(curvedPathShader.includes('if(n>=min(p.source.z,256u))'));
 // Model the doubling guard with an error that never converges.
 for (const budget of [64,128,256,2**24]) {
  let n=1,iterations=0,total=0;
  while (true) {
   iterations++; total+=n;
   if(n>=Math.min(budget,256)) break;
   n*=2;
  }
  assert.ok(iterations<=9);
  assert.ok(total<=511);
 }
 assert.ok(curvedPathShader.includes('let n=min(256u,u32(max(0.,counts[i*2u+1u].x)))'));
});
test('wrap draws reject invalid and excessive extents before rendering', () => {
 assert.deepEqual(wrapTiles(-Math.PI,Math.PI),[-1,2]);
 for(const args of [[NaN,1],[0,Infinity],[2,1],[-1e12,1e12],[1e30,1e30]]) assert.throws(()=>wrapTiles(...args));
});
