/** One selected position, never an array readback. Preserve radial input values
 * even when a 2D projection or a zero radial scale makes them unobservable. `name` reads another
 * vector field (a segment's "start" or "end"). */
export async function sourcePosition(mark, index, name = "position") {
  const field = mark.fields?.get(name);
  if (!field) return undefined;
  if (!field.isBufferNode) {
    const v = field.uniformNode?.value;
    return v?.toArray?.() ?? v;
  }
  const attribute = field.bufferNodeSource;
  if (!attribute || index < 0 || index >= field.count) return undefined;
  const renderer = mark.renderer,
    device = renderer.backend.device,
    source = renderer.backend.get(attribute).buffer;
  if (!source) return undefined;
  const version = field.version,
    bytes = Math.min(3, attribute.itemSize) * 4,
    read = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      source,
      index * attribute.itemSize * 4,
      read,
      0,
      bytes,
    );
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    if (mark.isDisposed || field.version !== version) return undefined;
    return Array.from(new Float32Array(read.getMappedRange(), 0, bytes / 4));
  } finally {
    if (read.mapState === "mapped") read.unmap();
    read.destroy();
  }
}
