// @ts-check
import { numpy as np } from "@hmplot/jax";

/**
 * How many entries of `sorted` (ascending, [m]) are below each query ([q]): a vectorized binary
 * search, ceil(log2(m + 1)) passes. Float32 in and out. Borrows its arguments.
 * @param {import('@hmplot/jax').Array} sorted
 * @param {import('@hmplot/jax').Array} queries
 */
export function lowerBound(sorted, queries) {
  const m = sorted.shape[0],
    q = queries.shape[0];
  let lo = np.zeros([q]),
    hi = np.full([q], m);
  for (let pass = 0, span = m; span > 0; pass++, span = Math.floor(span / 2)) {
    const mid = np.floor(lo.ref.add(hi.ref).mul(0.5));
    const value = np.take(
      sorted.ref,
      np.clip(mid.ref, 0, Math.max(0, m - 1)).astype(np.int32),
      0,
    );
    const active = lo.ref.less(hi.ref);
    const below = np.logicalAnd(active.ref, value.less(queries.ref));
    const above = np.logicalAnd(active, np.logicalNot(below.ref));
    lo = np.where(below, mid.ref.add(1), lo);
    hi = np.where(above, mid, hi);
  }
  hi.dispose();
  return lo;
}
