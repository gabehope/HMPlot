// @ts-check
/**
 * The pixel a fraction of a target's size falls in, clamped to the target. A pointer on a pixel's
 * edge comes back as a fraction a rounding error short of it (416/720*2-1 maps back to
 * 415.99999999999994): the tolerance keeps it in the pixel it is on, not its left or upper
 * neighbour (TODO 136.1: the flyover picked the building beside the one under the pointer).
 * @param {number} fraction 0 at the target's left (top) edge, 1 at its right (bottom) edge
 * @param {number} size the target's size in pixels
 */
export function pixelAt(fraction, size) {
  return Math.min(size - 1, Math.max(0, Math.floor(fraction * size + 1e-6)));
}
