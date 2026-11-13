/** Prime each new pipeline/target combination once before publishing it.
 * Source values and camera motion deliberately do not identify pipelines. */
export class SurfaceFrameGate {
  constructor() { this.key = null; }
  accept(key) {
    if (this.key === key) return true;
    this.key = key;
    return false;
  }
}
export function surfacePipelineKey(objects, resolution, samples, pixelRatio) {
  return JSON.stringify([
    resolution, samples, pixelRatio,
    objects.map(o => [o.uuid, o.material.uuid, o.material.version, o.geometry?.uuid])
  ]);
}
