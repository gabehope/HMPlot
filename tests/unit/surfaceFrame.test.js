import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceFrameGate, surfacePipelineKey } from '../../src/lib/plot/utils/surfaceFrameGate.js';
const mark = () => ({uuid:'mark',material:{uuid:'color',version:1},geometry:{uuid:'quad'}});
test('new pipelines prime once; resize and material replacement require a new complete pair', () => {
 const gate = new SurfaceFrameGate(), o=mark();
 const key=()=>surfacePipelineKey([o],[1024,512],4,2);
 assert.equal(gate.accept(key()),false);
 assert.equal(gate.accept(key()),true);
 o.material.version++;
 assert.equal(gate.accept(key()),false);
 assert.equal(gate.accept(key()),true);
 assert.equal(gate.accept(surfacePipelineKey([o],[2048,1024],4,2)),false);
 assert.equal(gate.accept(surfacePipelineKey([o],[2048,1024],4,2)),true);
 assert.equal(gate.accept(surfacePipelineKey([o],[2048,1024],4,1)),false);
});
test('ordinary data changes and camera movement do not repeatedly prime cached pipelines', () => {
 const gate=new SurfaceFrameGate(), o=mark();
 const key=()=>surfacePipelineKey([o],[1024,512],4,2);
 gate.accept(key());
 for(let i=0;i<100;i++) {
  o.dataVersion=i; o.cameraVersion=i;
  assert.equal(gate.accept(key()),true);
 }
});
