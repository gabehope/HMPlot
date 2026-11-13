import { numpy as np } from "@hmplot/jax";
import { animationClock } from "./animation.js";
import { markBinding } from "./markBinding.js";
export async function guideBounds(mark, field) {
  await mark.manager.chain;
  await animationClock(mark.renderer).busy;
  const buffer = field.buffer,
    normalizer = buffer?.normalizer;
  if (buffer?.animationRaw && normalizer?.levels?.length) {
    // Snapshot only the displayed raw minimum and maximum. The source data and
    // interpolated field never leave the GPU.
    const device = mark.renderer.backend.device;
    const read = device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(normalizer.levels.at(-1).out, 0, read, 0, 8);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      return Array.from(new Float32Array(read.getMappedRange()).slice());
    } finally {
      read.destroy();
    }
  }
  const data = buffer?.rawArray?.ref ?? field.data.ref;
  // A mark drawing a padded view's physical rows (TODO 17.3b) shows only its valid rows; a
  // line's per-segment values show where both of a segment's rows are valid.
  const valid = markBinding(mark)?.rows.valid, count = valid?.shape?.[0];
  const shown = count === data.shape[0] ? valid.ref.greater(0)
    : count === data.shape[0] + 1 ? np.logicalAnd(valid.ref.slice([0, count - 1]).greater(0), valid.ref.slice([1]).greater(0))
    : null;
  const low = shown ? np.where(shown.ref, data.ref, Infinity) : data.ref;
  const high = shown ? np.where(shown, data.ref, -Infinity) : data.ref;
  const stats = np.stack([low.min(), high.max()]);
  data.dispose();
  try {
    return Array.from(await stats.ref.data());
  } finally {
    stats.dispose();
  }
}
