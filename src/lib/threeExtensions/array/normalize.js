import { numpy as np } from "@hmplot/jax";
/**
 * Borrow input; the result belongs to the caller. All reductions stay on device. A scalar
 * raster of two channels is a value and its validity (a grid table's, TODO 51): the value is
 * normalized over the valid cells, and the validity kept.
 */
export function normalizeTexture(array, mode = "auto") {
  if (mode === "none") return array.ref;
  if (array.shape.length === 3 && array.shape[2] === 2) return normalizeMasked(array, mode);
  if (mode === "symmetric") return array.ref.div(np.maximum(np.abs(array.ref).max(), 1e-8));
  if (mode !== "auto") throw new Error(`Unknown texture normalization: ${mode}`);
  const min = array.ref.min();
  const range = array.ref.max().sub(min.ref).add(1e-8);
  return np.clip(array.ref.sub(min).div(range), 0, 1);
}

function normalizeMasked(array, mode) {
  if (mode !== "auto" && mode !== "symmetric") throw new Error(`Unknown texture normalization: ${mode}`);
  const value = array.ref.slice([], [], [0, 1]), valid = array.ref.slice([], [], [1, 2]), ok = valid.ref.greater(0.5);
  let scaled;
  if (mode === "symmetric") {
    const peak = np.max(np.where(ok.ref, np.abs(value.ref), 0));
    scaled = value.div(np.maximum(peak, 1e-8));
  } else {
    // No valid cell: every value is hidden, so any range does.
    const lo = np.min(np.where(ok.ref, value.ref, Infinity)), hi = np.max(np.where(ok.ref, value.ref, -Infinity));
    const low = np.where(np.isfinite(lo.ref), lo, 0);
    const range = np.where(np.isfinite(hi.ref), hi, 1).sub(low.ref).add(1e-8);
    scaled = np.clip(value.sub(low).div(range), 0, 1);
  }
  return np.concatenate([np.where(ok, scaled, 0), valid], 2);
}
