import * as THREE from "three/webgpu";
import { numpy as np, getWebGPUDevice } from "@hmplot/jax";
import { initializePlot } from "../../src/lib/jaxExtensions/setup.js";
import { ArrayTexture } from "../../src/lib/threeExtensions/array/arraytexture.js";
import { readPixel } from "../../src/lib/picking/readPixel.js";
import { bicubicInterpolation } from "../../src/lib/threeExtensions/tsl/tsl.js";
import { Fn, instanceIndex, textureStore, uvec2, vec4 } from "three/tsl";
export async function checkInterpolation() {
  await initializePlot();
  const device = getWebGPUDevice();
  device.pushErrorScope("validation");
  const renderer = new THREE.WebGPURenderer({
    canvas: document.createElement("canvas"),
    device,
  });
  await renderer.init();
  const data = np.array([
    [0, 1],
    [2, 3],
  ]);
  const texture = new ArrayTexture(renderer, 4, undefined, 2, 2, 1);
  texture.type = THREE.FloatType;
  try {
    await texture.write(data);
    const bilinear = Array.from(await readPixel(renderer, texture, 1, 1));
    texture.computeNode = Fn(() => {
      const result = bicubicInterpolation({
        index: instanceIndex,
        bufferNode: texture.bufferNode,
        sourceWidth: texture.sourceWidth,
        sourceHeight: texture.sourceHeight,
        sourceChannels: texture.sourceChannels,
        texWidth: texture.texResolution,
        texHeight: texture.texResolution,
      });
      textureStore(
        texture,
        uvec2(instanceIndex.mod(4), instanceIndex.div(4)),
        vec4(result, 1),
      ).toWriteOnly();
    })().compute(16);
    await renderer.computeAsync(texture.computeNode);
    const cubicCorner = Array.from(await readPixel(renderer, texture, 0, 0));
    return {
      bilinear,
      cubicCorner,
      error: (await device.popErrorScope())?.message ?? null,
    };
  } finally {
    data.dispose();
    texture.dispose();
    renderer.dispose();
  }
}
