import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaneGeometry, RingGeometry } from 'three/webgpu';
import { surfaceAllocation, createSurfaceGeometry } from '../../src/lib/plot/utils/surfaceGeometry.js';
test('surface grid preserves Three orientation and triangle topology', () => {
  for (const detail of [3, 16, 256]) {
    const actual = createSurfaceGeometry(detail), expected = new PlaneGeometry(2, 2, detail, detail);
    for (const name of ['position','normal','uv']) assert.deepEqual(actual.getAttribute(name).array, expected.getAttribute(name).array);
    assert.deepEqual(actual.index.array, expected.index.array);
    actual.dispose(); expected.dispose();
  }
});
test('2048 detail is preflighted without allocating a maximum-size mesh', () => {
  const allocation = surfaceAllocation(2048);
  assert.equal(allocation.cells, 2048);
  assert.equal(allocation.vertices, 2049 ** 2);
  assert.equal(allocation.indexBytes, 4);
  assert.throws(() => surfaceAllocation(2048, {maxBufferSize: 1024}), {code: "limit.storage",
    message: /^Heatmap: its mesh at detail 2048 needs .*; the limit is 1,024 bytes on this device\. Lower detail\.$/});
});

test('circular surfaces preserve ring topology with typed allocations', () => {
  const actual = createSurfaceGeometry(16, {}, 'circle'), expected = new RingGeometry(0, 1, 48, 16);
  for (const name of ['position','normal','uv']) {
    const a = actual.getAttribute(name).array, b = expected.getAttribute(name).array;
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-7);
  }
  assert.deepEqual(actual.index.array, expected.index.array);
  actual.dispose(); expected.dispose();
});
