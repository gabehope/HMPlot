/**
 * GPU reductions over a masked column. Shared by the aggregating transforms and by the
 * reduction operations in expressions, which is why they live here rather than in
 * transforms.js (expressions.js cannot import that module).
 *
 * Every reduction returns a rank-0 array and reads nothing back: values that are not finite
 * (or, for categorical codes, negative) are skipped, an empty input is NaN, and count and sum
 * of nothing are 0. Population statistics use ddof = 0, as numpy does by default.
 */
import { numpy as np, jit, lax } from "@hmplot/jax";

/**
 * Reduce over axis 0 (rows). `op` is "sum", "min" or "max". Consumes `values`.
 *
 * The bundled jax-js reduces an axis into few outputs with a workgroup of 256 threads per output,
 * striding over a length read at run time (vendor/jax-js/PATCHES.md, patch 2): one program for any
 * row count. One output is then one GPU core's work, so a single column of 65,536 rows or more is
 * reduced in 256 blocks first, then the blocks: 500,000 rows take 0.04 ms instead of 0.24 (2M
 * rows: 0.04 against 0.88). The block length is read at run time too. (Until Stage 23 this split
 * into blocks of about sqrt(n) rows, whose count compiled a new program per row count.)
 */
const SPLIT_ROWS = 65536, BLOCKS = 256;
export function reduceRows(values, op = "sum") {
  const [n, ...rest] = values.shape;
  if (rest.length || n < SPLIT_ROWS) return np[op](values, 0);
  const length = Math.ceil(n / BLOCKS), padded = length * BLOCKS;
  const fill = op === "sum" ? 0 : op === "max" ? -Infinity : Infinity;
  const whole = padded === n ? values
    : np.concatenate([values, np.full([padded - n], fill, { dtype: values.dtype })]);
  return np[op](np[op](whole.reshape([BLOCKS, length]), 1), 0);
}

/**
 * Jitted totals for the eager call sites (a Filter's kept count, an axis extent): each is one
 * cached program instead of a handful of eager operations, each hashed to find its kernel.
 * Arguments are consumed.
 */
export const countRows = jit((mask) => reduceRows(mask.astype(np.float32)));
/** [min, max] of the finite values (valid > 0 where `valid` is given), or [Inf, -Inf] if none. */
export const finiteRange = jit((values) => {
  const keep = np.isfinite(values.ref);
  return np.stack([reduceRows(np.where(keep.ref, values.ref, Infinity), "min"), reduceRows(np.where(keep, values, -Infinity), "max")]);
});
export const finiteRangeWhere = jit((values, valid) => {
  const keep = np.logicalAnd(np.isfinite(values.ref), valid.greater(0));
  return np.stack([reduceRows(np.where(keep.ref, values.ref, Infinity), "min"), reduceRows(np.where(keep, values, -Infinity), "max")]);
});

// The paired row/group/skew measurements in scatter-crossover.json favor one-hot below
// this boundary. Stripe sums to bound CAS contention, including a group containing every row.
const SCATTER_GROUPS = 512, SCATTER_ROWS = 16384, SCATTER_CELLS = 8_000_000;
const useScatter = (rows, groups) => rows >= SCATTER_ROWS && groups >= SCATTER_GROUPS;

/** Borrows inputs; bounded scratch and update batches also cover highly skewed groups. */
function scatterByCode(code, values, total, op) {
  const maxStripes = Math.min(256, Math.max(1, Math.floor(SCATTER_CELLS / total)));
  const perChunk = op === "sum" ? maxStripes * 1024 : 262144;
  let result = null;
  for (let start = 0; start < code.shape[0]; start += perChunk) {
    const end = Math.min(code.shape[0], start + perChunk), rows = end - start;
    const stripes = op === "sum" ? Math.min(maxStripes, Math.ceil(rows / 256)) : 1;
    let indices = code.ref.slice([start, end]);
    if (op === "sum") {
      const valid = np.logicalAnd(indices.ref.greaterEqual(0), indices.ref.less(total));
      const offsets = np.arange(rows).astype(np.int32).mod(stripes).mul(total);
      indices = np.where(valid, indices.add(offsets), -1).astype(np.int32);
    }
    let reduced = lax.scatter(values.ref.slice([start, end]), indices, [stripes * total], {
      mode: op === "sum" ? "add" : op,
    });
    if (op === "sum") reduced = np.sum(reduced.reshape([stripes, total]), 0);
    result = !result ? reduced : op === "sum" ? result.add(reduced)
      : np[op === "min" ? "minimum" : "maximum"](result, reduced);
  }
  return result;
}

/**
 * Weighted counts per code (a histogram): for each weight array, the sum of the weights of the
 * rows whose `code` (int32 [n]; -1 for none) is c, for c in 0 .. total - 1. Small groups use
 * a fused one-hot comparison in bounded chunks; large groups use striped scatter sums.
 * Borrows its arguments.
 */
export function histogramRows(code, weights, total) {
  if (useScatter(code.shape[0], total)) return weights.map(weight => scatterByCode(code, weight, total, "sum"));
  const n = code.shape[0], index = np.arange(total).astype(np.int32).reshape([1, total]);
  if (!n) { index.dispose(); return weights.map(() => np.zeros([total], { dtype: np.float32 })); }
  const perChunk = Math.max(1, Math.floor(8_000_000 / total));
  const totals = weights.map(() => null);
  for (let start = 0; start < n; start += perChunk) {
    const end = Math.min(n, start + perChunk), rows = end - start;
    // One expression per weight (comparison, weight, reduction): a one-hot shared between the
    // weights would be stored whole.
    weights.forEach((w, i) => {
      const part = np.where(code.ref.slice([start, end]).reshape([rows, 1]).equal(index.ref),
        w.ref.slice([start, end]).reshape([rows, 1]), 0);
      const sum = reduceRows(part);
      totals[i] = totals[i] ? totals[i].add(sum) : sum;
    });
  }
  index.dispose();
  return totals;
}

/**
 * `op` ("sum", "min" or "max") of `values` (float32 [n]) per code: for c in 0 .. total - 1, over
 * the rows whose `code` (int32 [n]; -1 for none) is c; a code with no row is 0 (sum) or +-Inf.
 * Small groups use a fused one-hot reduction; large groups use bounded scatter batches.
 * Borrows
 * its arguments (TODO 29.7).
 */
export function reduceByCode(code, values, total, op = "sum") {
  if (useScatter(code.shape[0], total)) return scatterByCode(code, values, total, op);
  const fill = op === "sum" ? 0 : op === "min" ? Infinity : -Infinity;
  const n = code.shape[0];
  if (!total) return np.zeros([0], { dtype: np.float32 });
  if (!n) return np.full([total], fill, { dtype: np.float32 });
  const index = np.arange(total).astype(np.int32).reshape([1, total]);
  const perChunk = Math.max(1, Math.floor(8_000_000 / total));
  let result = null;
  for (let start = 0; start < n; start += perChunk) {
    const end = Math.min(n, start + perChunk), rows = end - start;
    const part = np.where(code.ref.slice([start, end]).reshape([rows, 1]).equal(index.ref),
      values.ref.slice([start, end]).reshape([rows, 1]), fill);
    const reduced = reduceRows(part, op);
    result = !result ? reduced : op === "sum" ? result.add(reduced) : np[op === "min" ? "minimum" : "maximum"](result, reduced);
  }
  index.dispose();
  return result;
}

/**
 * Inclusive sums of `values` ([m, d]) over runs of equal `keys` ([m], sorted), in log2(m)
 * shifted passes: position k ends up with the sum of its run up to k. Consumes `values`;
 * borrows `keys`.
 */
export function segmentedScan(values, keys) {
  const [m, d] = values.shape;
  let sums = values;
  for (let step = 1; step < m; step *= 2) {
    const shifted = np.concatenate([np.zeros([step, d]), sums.ref.slice([0, m - step])]);
    const earlier = np.concatenate([np.full([step], -1), keys.ref.slice([0, m - step])]);
    const same = earlier.equal(keys.ref).reshape([m, 1]);
    sums = sums.add(np.where(same, shifted, 0));
  }
  return sums;
}

/** Inclusive prefix maximum, in log2(n) shifted passes (jax 0.1.24 has no running maximum). */
function runningMax(values) {
  const n = values.shape[0];
  let result = values.ref;
  for (let step = 1; step < n; step *= 2) {
    const shifted = np.concatenate([
      np.full([Math.min(step, n)], -Infinity),
      result.ref.slice([0, Math.max(0, n - step)]),
    ]);
    const next = np.maximum(result.ref, shifted.ref);
    shifted.dispose();
    result.dispose();
    result = next;
  }
  return result;
}

/** The middle of the valid values, averaging the two middles for an even count. */
function medianValue(valid, values, count) {
  const n = values.shape[0];
  const sorted = np.sort(np.where(valid.ref, values.ref, Infinity));
  const last = Math.max(0, n - 1);
  const lo = np.clip(np.floor(count.ref.sub(1).mul(0.5)), 0, last).astype(np.int32);
  const hi = np.clip(np.floor(count.ref.mul(0.5)), 0, last).astype(np.int32);
  const a = np.take(sorted.ref, lo.ref, 0), b = np.take(sorted.ref, hi.ref, 0);
  const result = np.where(count.ref.greater(0), a.ref.add(b.ref).mul(0.5), np.nan);
  for (const item of [sorted, lo, hi, a, b]) item.dispose();
  return result;
}

/** The `p` quantile of the valid values, between the two nearest ranks (numpy's "linear"). */
function quantileValue(valid, values, count, p) {
  const n = values.shape[0];
  const sorted = np.sort(np.where(valid.ref, values.ref, Infinity));
  const last = Math.max(0, n - 1);
  const position = np.maximum(count.ref.sub(1), 0).mul(p);
  const below = np.floor(position.ref);
  const lo = np.clip(below.ref, 0, last).astype(np.int32);
  const hi = np.clip(np.minimum(below.ref.add(1), np.maximum(count.ref.sub(1), 0)), 0, last).astype(np.int32);
  const a = np.take(sorted.ref, lo.ref, 0), b = np.take(sorted.ref, hi.ref, 0);
  const result = np.where(count.ref.greater(0), a.ref.add(b.ref.sub(a.ref).mul(position.ref.sub(below.ref))), np.nan);
  for (const item of [sorted, position, below, lo, hi, a, b]) item.dispose();
  return result;
}

/** The most common valid value; ties take the smallest, which is what sorting gives first. */
function modeValue(valid, values, count) {
  const n = values.shape[0];
  const sorted = np.sort(np.where(valid.ref, values.ref, Infinity));
  const index = np.arange(n).astype(np.float32);
  // A run starts where the sorted value changes; its length is measured at its last element.
  const changed = (n > 1
    ? np.concatenate([np.ones([1], { dtype: np.bool }), sorted.ref.slice([1, n]).notEqual(sorted.ref.slice([0, n - 1]))])
    : np.ones([Math.min(n, 1)], { dtype: np.bool })).astype(np.bool);
  const ends = (n > 1
    ? np.concatenate([changed.ref.slice([1, n]), np.ones([1], { dtype: np.bool })])
    : changed.ref).astype(np.bool);
  const starts = runningMax(np.where(changed.ref, index.ref, -Infinity));
  const finite = np.isfinite(sorted.ref);
  const length = np.where(np.logicalAnd(ends.ref, finite.ref), index.ref.sub(starts.ref).add(1), -1);
  const at = np.argmax(length.ref).astype(np.int32);
  const result = np.where(count.ref.greater(0), np.take(sorted.ref, at.ref, 0), np.nan);
  for (const item of [sorted, index, changed, ends, starts, finite, length, at]) item.dispose();
  return result;
}

/**
 * The reducers below as one jitted function each (TODO 17.8): eager mode dispatches (and hashes)
 * one kernel per operation, a jitted reducer one fused program per call. Every input is an
 * argument, never a closure, and padded views keep the traced shapes stable. median and mode
 * sort, which stays eager.
 */
const COMPILED = new Map();
function compiledReducer(op) {
  let reducer = COMPILED.get(op);
  if (reducer) return reducer;
  reducer = op === "count-mask"
    ? jit((mask) => reduceRows(mask.astype(np.float32)))
    : jit((mask, values) => {
      const n = values.shape[0];
      const valid = np.logicalAnd(mask, np.isfinite(values.ref));
      const count = reduceRows(valid.ref.astype(np.float32));
      if (op === "any" || op === "all") {
        const truth = values.notEqual(0);
        count.dispose();
        return op === "any" ? np.any(np.logicalAnd(valid, truth)) : np.all(np.logicalOr(np.logicalNot(valid), truth));
      }
      if (op === "count") { values.dispose(); valid.dispose(); return count; }
      if (op === "min" || op === "max") {
        const extreme = reduceRows(np.where(valid, values, op === "min" ? Infinity : -Infinity), op);
        return np.where(count.greater(0), extreme, np.nan);
      }
      if (op === "first" || op === "last") {
        const index = np.arange(n).astype(np.int32);
        const at = (op === "first" ? np.min : np.max)(np.where(valid, index, op === "first" ? n : -1));
        return np.where(count.greater(0), np.take(values, np.clip(at, 0, Math.max(0, n - 1)), 0), np.nan);
      }
      const sum = reduceRows(np.where(valid.ref, values.ref, 0));
      if (op === "sum") { values.dispose(); valid.dispose(); count.dispose(); return sum; }
      const mean = sum.div(np.maximum(count.ref, 1));
      if (op === "mean") { values.dispose(); valid.dispose(); return np.where(count.greater(0), mean, np.nan); }
      const variance = reduceRows(np.where(valid, np.square(values.sub(mean)), 0)).div(np.maximum(count.ref, 1));
      return np.where(count.greater(0), op === "std" ? np.sqrt(variance) : variance, np.nan);
    });
  COMPILED.set(op, reducer);
  return reducer;
}
const JITTED = new Set(["count", "sum", "mean", "min", "max", "first", "last", "variance", "std", "any", "all"]);

/** Reduction is bounded to one row vector at a time; inputs are never read back. `p`: a
 * quantile's probability. */
export function reduceValues(mask, values, op, p) {
  if (!mask.shape[0])
    return np.array(op === "all" ? true : op === "any" ? false : op === "count" || op === "sum" ? 0 : np.nan);
  // The jitted reducers consume their arguments; this function borrows them.
  if (JITTED.has(op))
    return values ? compiledReducer(op)(mask.ref, values.ref) : op === "count" ? compiledReducer("count-mask")(mask.ref) : eagerReduce(mask, values, op);
  return eagerReduce(mask, values, op, p);
}

/** The reference (and median/mode) path: one eager operation at a time. */
export function eagerReduce(mask, values, op, p) {
  const valid = values
    ? np.logicalAnd(mask.ref, np.isfinite(values.ref))
    : mask.ref;
  const count = np.sum(valid.ref.astype(np.float32));
  let result;
  if (op === "any" || op === "all") {
    const truth = values.ref.notEqual(0);
    result = op === "any" ? np.any(np.logicalAnd(valid.ref, truth)) : np.all(np.logicalOr(np.logicalNot(valid.ref), truth));
  }
  else if (op === "count") result = count.ref;
  else if (op === "median") result = medianValue(valid, values, count);
  else if (op === "quantile") result = quantileValue(valid, values, count, p);
  else if (op === "mode") result = modeValue(valid, values, count);
  else {
    const sum = np.sum(np.where(valid.ref, values.ref, 0));
    if (op === "sum") result = sum.ref;
    else if (op === "mean")
      result = np.where(
        count.ref.greater(0),
        sum.ref.div(np.maximum(count.ref, 1)),
        np.nan,
      );
    else if (op === "min" || op === "max")
      result = np.where(
        count.ref.greater(0),
        (op === "min" ? np.min : np.max)(
          np.where(valid.ref, values.ref, op === "min" ? Infinity : -Infinity),
        ),
        np.nan,
      );
    else if (op === "first" || op === "last") {
      const index = np.arange(values.shape[0]).astype(np.int32);
      const at = (op === "first" ? np.min : np.max)(
        np.where(valid.ref, index, op === "first" ? values.shape[0] : -1),
      );
      result = np.where(
        count.ref.greater(0),
        np.take(
          values.ref,
          np.clip(at, 0, Math.max(0, values.shape[0] - 1)),
          0,
        ),
        np.nan,
      );
    } else {
      const mean = sum.ref.div(np.maximum(count.ref, 1));
      const variance = np
        .sum(np.where(valid.ref, np.square(values.ref.sub(mean)), 0))
        .div(np.maximum(count.ref, 1));
      result = np.where(
        count.ref.greater(0),
        op === "std" ? np.sqrt(variance) : variance,
        np.nan,
      );
    }
    sum.dispose();
  }
  valid.dispose();
  count.dispose();
  return result;
}
