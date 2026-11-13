// Execution budgets are independent of buffer-size limits. Failure must happen
// before submitting work, rather than relying on a driver watchdog. The values are the capacity
// registry's (limits.js, TODO 136.9).
import { LIMITS, limitError } from "./limits.js";
export const MAX_PATHS = LIMITS.curvedPaths.value;
export const MAX_SUBDIVISIONS = 256;
export const MAX_TOTAL_SUBDIVISIONS = LIMITS.curvedSubdivisions.value;
export const MAX_WRAP_TILES = LIMITS.wrapCopies.value;
// Paths refine in batches of MAX_PATHS (TODO 136.11), each its own submission: a path's
// budget is its share of one batch, so it does not shrink with the number of paths.
export function pathBudget(count, width, height, tolerance) {
  if (!Number.isInteger(count) || count < 1)
    throw Error(`Spherical path batch needs a positive whole number of paths; received ${count}.`);
  count = Math.min(count, MAX_PATHS);
  if (![width, height, tolerance].every(v => Number.isFinite(v) && v > 0))
    throw Error('Spherical subdivision requires finite positive dimensions and tolerance.');
  return 2 ** Math.floor(Math.log2(Math.min(MAX_SUBDIVISIONS, MAX_TOTAL_SUBDIVISIONS / count)));
}
export function wrapTiles(left, right) {
  if (![left, right].every(Number.isFinite) || right < left)
    throw Error('Spherical wrapping requires a finite ordered viewport.');
  const first = Math.floor((left + Math.PI) / (2 * Math.PI)) - 1;
  const last = Math.floor((right + Math.PI) / (2 * Math.PI)) + 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first + 1 > MAX_WRAP_TILES)
    throw limitError('wrapCopies', { count: Number.isSafeInteger(last - first + 1) ? last - first + 1 : undefined });
  return [first, last];
}
