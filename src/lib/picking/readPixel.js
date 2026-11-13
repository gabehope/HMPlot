import { HalfFloatType, DataUtils } from "three/webgpu";
/** Read one rgba32float pixel and always release its staging buffer. */
export async function readPixel(renderer, texture, x, y) {
  const device = renderer.backend.device;
  const buffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      {
        texture: renderer.backend.get(texture).texture,
        origin: { x, y, z: 0 },
      },
      { buffer, bytesPerRow: 256 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    return texture.type === HalfFloatType
      ? Float32Array.from(
          new Uint16Array(buffer.getMappedRange()).slice(0, 4),
          DataUtils.fromHalfFloat,
        )
      : new Float32Array(buffer.getMappedRange()).slice();
  } finally {
    if (buffer.mapState === "mapped") buffer.unmap();
    buffer.destroy();
  }
}

/** Read a bounded rgba32float region. Row padding is removed from the result. */
export async function readPixels(renderer, texture, x, y, width, height) {
  width = Math.max(1, Math.floor(width));
  height = Math.max(1, Math.floor(height));
  const device = renderer.backend.device;
  const bytesPerPixel = 16;
  const bytesPerRow = Math.ceil((width * bytesPerPixel) / 256) * 256;
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: renderer.backend.get(texture).texture, origin: { x, y, z: 0 } },
      { buffer, bytesPerRow },
      { width, height, depthOrArrayLayers: 1 },
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const source = new Float32Array(buffer.getMappedRange());
    const stride = bytesPerRow / 4, output = new Float32Array(width * height * 4);
    for (let row = 0; row < height; row++)
      output.set(source.subarray(row * stride, row * stride + width * 4), row * width * 4);
    return output;
  } finally {
    if (buffer.mapState === "mapped") buffer.unmap();
    buffer.destroy();
  }
}
