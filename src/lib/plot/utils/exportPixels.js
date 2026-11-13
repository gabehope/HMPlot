/** Explicit export readback. WebGPU rows are top-down and padded to 256 bytes. */
export async function exportPixels(renderer, texture, width, height) {
  const device = renderer.backend.device,
    row = width * 4,
    pitch = Math.ceil(row / 256) * 256;
  const buffer = device.createBuffer({
    size: pitch * (height - 1) + row,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: renderer.backend.get(texture).texture },
      { buffer, bytesPerRow: pitch },
      { width, height, depthOrArrayLayers: 1 },
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buffer.getMappedRange()),
      result = new Uint8ClampedArray(row * height);
    for (let y = 0; y < height; y++)
      result.set(mapped.subarray(y * pitch, y * pitch + row), y * row);
    return result;
  } finally {
    if (buffer.mapState === "mapped") buffer.unmap();
    buffer.destroy();
  }
}
