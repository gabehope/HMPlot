import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { deviceParams, deviceScalar, deviceArray, uploadColumn } from "../../src/lib/plot/utils/deviceParams.js";

const values = async (array) => { try { return Array.from(await array.ref.data()).map(Number); } finally { array.dispose(); } };

test("deviceParams returns one rank-0 array per value, in order and dtype", async () => {
  const [a, b, c] = deviceParams([0.5, 0.5, -2]);
  assert.deepEqual([a.shape, b.shape, c.shape], [[], [], []]);
  assert.equal(a.dtype, "float32");
  assert.deepEqual([...(await values(a)), ...(await values(b)), ...(await values(c))], [0.5, 0.5, -2]);
  const [i, j] = deviceParams([3, 3], { dtype: "int32" });
  assert.equal(i.dtype, "int32");
  assert.deepEqual([...(await values(i)), ...(await values(j))], [3, 3]);
  assert.deepEqual(deviceParams([]), []);
});

test("deviceScalar keeps NaN, infinities and negative zero", async () => {
  assert.ok(Number.isNaN((await values(deviceScalar(NaN)))[0]));
  assert.deepEqual(await values(deviceScalar(Infinity)), [Infinity]);
  assert.ok(Object.is((await values(deviceScalar(-0)))[0], -0));
  assert.deepEqual(await values(deviceScalar(0, { dtype: "int32" })), [0]);
});

test("deviceArray gives a shape-[k] array, including k = 1 and all-equal values", async () => {
  const one = deviceArray([7]);
  assert.deepEqual(one.shape, [1]);
  assert.deepEqual(await values(one), [7]);
  assert.deepEqual(await values(deviceArray([2, 2, 2], { dtype: "int32" })), [2, 2, 2]);
  const empty = deviceArray([]);
  assert.deepEqual(empty.shape, [0]);
  empty.dispose();
});

test("parameters combine with columns like the numbers they replace", async () => {
  const x = np.array(new Float32Array([1, 2, 3, 4]));
  const [low, high] = deviceParams([2, 3]);
  assert.deepEqual(await values(np.logicalAnd(x.ref.greaterEqual(low), x.ref.lessEqual(high)).astype(np.int32)), [0, 1, 1, 0]);
  const [index] = deviceParams([2], { dtype: "int32" });
  assert.deepEqual(await values(np.take(x.ref, index, 0).reshape([1])), [3]);
  x.dispose();
});

test("uploadColumn uploads short constant columns and leaves every other column to np.array", async () => {
  assert.deepEqual(await values(uploadColumn(new Float32Array(5).fill(0.25))), [0.25, 0.25, 0.25, 0.25, 0.25]);
  const ints = uploadColumn(new Int32Array([4, 4]));
  assert.equal(ints.dtype, "int32");
  assert.deepEqual(await values(ints), [4, 4]);
  assert.deepEqual(await values(uploadColumn([1])), [1]);
  assert.equal(uploadColumn([1, 2]), undefined);
  assert.equal(uploadColumn(new Float32Array(200).fill(1)), undefined);
  assert.equal(uploadColumn([]), undefined);
  assert.equal(uploadColumn([true, true]), undefined);
  assert.equal(uploadColumn(new Uint8Array([3, 3])), undefined);
});
