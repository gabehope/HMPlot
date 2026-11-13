import {test} from 'node:test';import assert from 'node:assert/strict';import {releaseAttribute} from '../../src/lib/threeExtensions/array/attributeRelease.js';
test('attribute release clears renderer tracking and is idempotent',()=>{const a={},entries=new Map([[a,{buffer:{}}]]),tracking=new WeakMap([[a,{version:1}]]);let destroyed=0;const renderer={_attributes:{data:tracking},backend:{has:k=>entries.has(k),get:k=>entries.get(k),delete:k=>entries.delete(k),destroyAttribute:k=>{assert.ok(entries.get(k)?.buffer);destroyed++;entries.delete(k);}}};releaseAttribute(renderer,a);releaseAttribute(renderer,a);assert.equal(destroyed,1);assert.equal(tracking.has(a),false);});
test('partially initialized attributes need no GPU destroy',()=>{const a={},entries=new Map([[a,{}]]);const renderer={backend:{has:k=>entries.has(k),get:k=>entries.get(k),delete:k=>entries.delete(k),destroyAttribute:()=>assert.fail('No GPU buffer was allocated')}};releaseAttribute(renderer,a);assert.equal(entries.has(a),false);});
test('maxElements accepts positive integers and rejects everything else', async () => {
  const { normalizeMaxElements } = await import('../../src/lib/plot/utils/proputils.js');
  assert.equal(normalizeMaxElements(250000), 250000);
  assert.equal(normalizeMaxElements('4096'), 4096);
  for (const bad of [0, -1, 2.5, NaN, Infinity, 'many', null])
    assert.throws(() => normalizeMaxElements(bad), /maxElements must be a positive integer/, String(bad));
});

test('filter capacity reuses allocation, while normal growth respects field widths and device limits', async () => {
  const { markCapacity } = await import('../../src/lib/plot/utils/proputils.js');
  const fields = [{ canBeBuffer: true, channels: 3 }, { canBeBuffer: true, channels: 1 }];
  const limits = { maxStorageBufferBindingSize: 16384, maxBufferSize: 131072 };
  const initial = markCapacity({ initial: 64, fields, limits, rows: 500 });
  assert.equal(initial.current, 64, 'planning cannot grow a sparse selection to the full source');
  assert.equal(initial.next, 512, 'normal rendering may grow');
  const grown = markCapacity({ initial: 64, allocated: 512, fields, limits });
  assert.equal(grown.current, 512, 'the initial setting is not a permanent ceiling');
  assert.equal(grown.ceiling, 1024, 'vec3 storage has a four-float stride');
  assert.equal(markCapacity({ allocated: 512, fields, limits, rows: 2000 }).next, 1024);
  assert.equal(markCapacity({ initial: 64, allocated: 32, fields, limits }).current, 32);
  assert.equal(markCapacity({ allocated: 512, fields, limits, rows: 0 }).next, 512);
});
