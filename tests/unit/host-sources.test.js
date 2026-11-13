import test from "node:test";
import assert from "node:assert/strict";
import {
  rememberHostSource,
  existingHostSource,
} from "../../src/lib/plot/utils/hostSources.js";
test("immutable transport sources reshape once without a device readback", () => {
  const handle = {},
    data = new Float32Array([1, 2, 3, 4, 5, 6]);
  rememberHostSource(handle, data, [2, 3]);
  const first = existingHostSource(handle);
  assert.deepEqual(first, [
    [1, 2, 3],
    [4, 5, 6],
  ]);
  assert.equal(existingHostSource(handle), first);
  assert.equal(existingHostSource({}), undefined);
});
