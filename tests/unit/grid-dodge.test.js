import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataScope} from '../../src/lib/plot/utils/categorical.js';
import {runTransform} from '../../src/lib/plot/utils/transforms.js';
const values=async a=>Array.from(await a.ref.data());
test('grid Dodge expands counts in source order, skips zeros and retains repeated provenance',async()=>{
 const scope=createDataScope();scope.update({count:[2,0,3],value:[10,20,30]});
 const view=await runTransform('Dodge',scope,{mode:'grid',columns:3,count:'count'});
 try {
  assert.equal(view.length,5);
  assert.deepEqual(await values(view.get('x')),[.5,1.5,2.5,.5,1.5]);
  assert.deepEqual(await values(view.get('y')),[.5,.5,.5,1.5,1.5]);
  assert.deepEqual(await values(view.get('value')),[10,10,30,30,30]);
  const rows=view.sourceIndices();assert.deepEqual(Array.from(await rows.data()),[0,0,2,2,2]);
  assert.deepEqual(await values(view.get('unitIndex')),[0,1,2,3,4]);
 }finally{view.dispose();scope.dispose();}
});
test('grid Dodge defaults to one cell per row and rejects invalid or excessive expansion',async()=>{
 const scope=createDataScope();scope.update({count:[1,2,3]});
 const view=await runTransform('Dodge',scope,{mode:'grid',columns:2});
 assert.deepEqual(await values(view.get('x')),[.5,1.5,.5]);view.dispose();
 await assert.rejects(runTransform('Dodge',scope,{mode:'grid',columns:0}),/positive integer/);
 await assert.rejects(runTransform('Dodge',scope,{mode:'grid',count:'count'},{maxBytes:100}),
  {code:'limit.dodgeUnits',message:"Dodge: a grid Dodge's expansion needs 6 units; the limit is 3 units. Reduce the counts."});
 for(const count of [[-1],[.5],[NaN],[Infinity]]){
  scope.update({count},{count:"numeric"});await assert.rejects(runTransform('Dodge',scope,{mode:'grid',count:'count'}),/nonnegative integers/);
 }
 scope.update({count:[0,0]});const empty=await runTransform('Dodge',scope,{mode:'grid',count:'count'});assert.equal(empty.length,0);empty.dispose();scope.dispose();
});
