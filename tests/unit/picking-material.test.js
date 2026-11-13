import test from 'node:test';
import assert from 'node:assert/strict';
import {PointsNodeMaterial,SpriteNodeMaterial} from 'three/webgpu';
import {uniform} from 'three/tsl';
import {copyPickingMaterial} from '../../src/lib/picking/copyPickingMaterial.js';
import {Scatter} from '../../src/lib/plot/objects/scatter.js';
import {MeshStandardNodeMaterial} from 'three/webgpu';

test('point depth writes follow normal blending and restore without changing depth testing', () => {
 for (const [componentName, Material] of [['Points', PointsNodeMaterial], ['Points3D', MeshStandardNodeMaterial]]) {
  const material = new Material(), options = new Map([['blend', 'normal']]);
  const point = { constructor: {componentName}, options, material };
  for (const [blend, depthWrite, expected] of [
   ['normal', undefined, true], ['normal', false, false], ['normal', true, true],
   ['additive', true, false], ['screen', true, false], ['normal', true, true],
   ['normal', false, false], ['additive', false, false], ['normal', false, false],
  ]) {
   options.set('blend', blend); options.set('depthWrite', depthWrite);
   Scatter.prototype.applyBlend.call(point, false);
   assert.equal(material.depthWrite, expected, `${componentName}: ${blend}/${depthWrite}`);
   assert.equal(material.depthTest, true);
   const picked = new Material();
   copyPickingMaterial(picked, material, {depthWrite: true});
   assert.equal(picked.depthWrite, true);
   assert.equal(picked.depthTest, true);
   assert.equal(material.depthWrite, expected, 'picking never mutates the visible material');
   picked.dispose();
  }
  material.dispose();
 }
 // Other Scatter subclasses retain their existing material policy.
 const material = new PointsNodeMaterial(); material.depthWrite = false;
 Scatter.prototype.applyBlend.call({constructor:{componentName:'Text'}, material,
  options:new Map([['blend','normal'],['depthWrite',true]])}, false);
 assert.equal(material.depthWrite, false);
 material.dispose();
});
for(const Material of [PointsNodeMaterial,SpriteNodeMaterial]) {
 test(`${Material.name} picking preserves attenuation on initial copy and updates`,()=>{
  const source=new Material(),target=new Material();
  source.positionNode=uniform(0);source.scaleNode=uniform(2);source.rotationNode=uniform(.3);
  if(source.isPointsNodeMaterial)source.sizeNode=uniform(16);
  for(const enabled of [false,true,false]) {
   source.sizeAttenuation=enabled;
   copyPickingMaterial(target,source);
   assert.equal(target.sizeAttenuation,enabled);
   for(const key of ['positionNode','scaleNode','rotationNode','sizeNode'])assert.equal(target[key],source[key]);
  }
  source.dispose();target.dispose();
 });
}

test('picking copies a custom shape signed distance, so custom symbols pick by their outline', async () => {
  const {symbolDistance} = await import('../../src/lib/plot/utils/symbols.js');
  const {registerShape} = await import('../../src/lib/plot/utils/shapes.js');
  const {uv, float, smoothstep} = await import('three/tsl');
  registerShape('picking-pentagon', [[0, 1], [0.95, 0.31], [0.59, -0.81], [-0.59, -0.81], [-0.95, 0.31]]);
  const source = new PointsNodeMaterial(), target = new PointsNodeMaterial();
  const distance = symbolDistance('picking-pentagon', uv().sub(0.5).mul(2), float(0));
  source.opacityNode = smoothstep(float(-0.01), float(0.01), distance).oneMinus();
  source.sizeNode = uniform(12);
  copyPickingMaterial(target, source);
  assert.equal(target.opacityNode, source.opacityNode);
  assert.equal(target.sizeNode, source.sizeNode);
  source.dispose(); target.dispose();
});
