import test from 'node:test';
import assert from 'node:assert/strict';
import { numpy as np } from '@hmplot/jax';
import { normalizeTexture } from '../../src/lib/threeExtensions/array/normalize.js';
test('fixed and symmetric maps retain sign and do not consume caller inputs', () => {
  const a = np.array([[-2, 0, 1]]);
  assert.deepEqual(normalizeTexture(a, 'none').js(), [[-2,0,1]]);
  assert.deepEqual(normalizeTexture(a, 'symmetric').js(), [[-1,0,0.5]]);
  assert.equal(a.refCount, 1);
  a.dispose();
});
test('constant maps normalize without NaN', () => {
  const a = np.ones([2,2]);
  assert.deepEqual(normalizeTexture(a).js(), [[0,0],[0,0]]);
  a.dispose();
});
