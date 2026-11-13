import test from "node:test";
import assert from "node:assert/strict";
import { readPixel } from "../../src/lib/picking/readPixel.js";
test("picking readback releases staging buffers on success and map failure", async () => {
  globalThis.GPUBufferUsage = { COPY_DST: 1, MAP_READ: 2 };
  globalThis.GPUMapMode = { READ: 1 };
  for (const fail of [false, true]) {
    let destroyed = false,
      unmapped = false;
    const buffer = {
      mapState: "unmapped",
      mapAsync: async () => {
        if (fail) throw new Error("lost");
        buffer.mapState = "mapped";
      },
      getMappedRange: () => new Float32Array([1, 2, 0.5, 0.75]).buffer,
      unmap: () => (unmapped = true),
      destroy: () => (destroyed = true),
    };
    const renderer = {
      backend: {
        get: () => ({ texture: {} }),
        device: {
          createBuffer: () => buffer,
          createCommandEncoder: () => ({
            copyTextureToBuffer() {},
            finish() {},
          }),
          queue: { submit() {} },
        },
      },
    };
    if (fail) await assert.rejects(readPixel(renderer, {}, 0, 0), /lost/);
    else
      assert.deepEqual(
        Array.from(await readPixel(renderer, {}, 0, 0)),
        [1, 2, 0.5, 0.75],
      );
    assert.equal(destroyed, true);
    assert.equal(unmapped, !fail);
  }
});
