import { runningMax, suffixMin } from "./numeric/scans.js";
/**
 * Window reducers over runs of rows, on the device (TODO 26.7). A run is a group of rows in their
 * order (Window `by`, or a padded input's kept rows); every window is clipped to its row's run.
 * count, sum and mean come from prefix sums (compiled around the scan, TODO 33.3); variance and
 * std from a sparse table of (count, mean, sum of squared deviations) per block, merged with
 * Chan's formula over the disjoint power-of-two blocks of each window's width (stable: prefix
 * sums of squares cancel when the values vary much more overall than within a window); min and
 * max from a sparse table of log2(size) levels; first and last from each position's nearest
 * finite row. Nothing loops over rows or groups, and nothing is read back. Before, a grouped window compacted each group (a readback
 * each) and reran the whole Window on it, and min, max, first, last, variance and std reduced
 * one window per dispatch: a dispatch per row.
 */
import { numpy as np, jit } from "@hmplot/jax";
import { deviceArray, deviceScalar } from "./deviceParams.js";


/**
 * Chan et al.'s merge of two (count, mean, M2) summaries: M2 is the sum of squared deviations
 * from the mean. Stable for any offset and spread.
 */
function merge([na, ma, qa], [nb, mb, qb]) {
  const count = na.ref.add(nb.ref), safe = np.maximum(count.ref, 1);
  const delta = mb.sub(ma.ref);
  const mean = ma.add(delta.ref.mul(nb.ref).div(safe.ref));
  const m2 = qa.add(qb).add(np.square(delta).mul(na).mul(nb).div(safe));
  return [count, mean, m2];
}
/**
 * Population variance of every window: levels 0 .. depth of block summaries (block [i, i + 2^k)),
 * and each window [lo, lo + width) merged from the blocks of width's set bits, largest first.
 * One jitted program per depth. Consumes its arguments.
 */
const VARIANCE = new Map();
function windowVariance(depth) {
  let program = VARIANCE.get(depth);
  if (!program) VARIANCE.set(depth, (program = jit((values, lo, width) => {
    const n = values.shape[0];
    const finite = np.isfinite(values.ref);
    let level = [finite.ref.astype(np.float32), np.where(finite, values, 0), np.zeros([n])];
    const levels = [level.map((a) => a.ref)];
    const shifted = (a, step, fill) => np.concatenate([a.slice([step, n]), np.full([step], fill)]);
    for (let k = 0; k < depth; k++) {
      const step = 2 ** k;
      const next = step < n
        ? merge(level.map((a) => a.ref), [shifted(level[0].ref, step, 0), shifted(level[1].ref, step, 0), shifted(level[2].ref, step, 0)])
        : level.map((a) => a.ref);
      level.forEach((a) => a.dispose());
      level = next;
      levels.push(level.map((a) => a.ref));
    }
    level.forEach((a) => a.dispose());
    let summary = [np.zeros([n]), np.zeros([n]), np.zeros([n])], at = lo;
    for (let k = depth; k >= 0; k--) {
      const size = 2 ** k, bit = np.remainder(np.floor(width.ref.div(size)), 2).greater(0);
      const index = np.clip(at.ref, 0, n - 1).astype(np.int32);
      const block = levels[k].map((a) => np.where(bit.ref, np.take(a, index.ref, 0), 0));
      index.dispose();
      summary = merge(summary, block);
      at = at.add(bit.astype(np.float32).mul(size));
    }
    at.dispose(); width.dispose();
    const [count, , m2] = summary;
    summary[1].dispose();
    return np.where(count.ref.greater(0), m2.div(np.maximum(count, 1)), NaN);
  })));
  return program;
}

/**
 * Each sorted position's run as [start, end) (float32 [n]): the positions of `sorted` (int32 [n],
 * borrowed) holding its value, and with `also` (borrowed, same order) its value too. Two scans
 * over the positions where the value changes, so the cost does not depend on how many runs
 * there are (a histogram of the keys did, one pass per chunk of keys: TODO 137.2).
 */
function runBounds(sorted, also = null) {
  const n = sorted.shape[0];
  const position = np.arange(n).astype(np.float32);
  const differs = (a) => a.ref.slice([1, n]).notEqual(a.ref.slice([0, n - 1]));
  const changed = n > 1
    ? np.concatenate([np.ones([1], { dtype: np.bool }), also ? np.logicalOr(differs(sorted), differs(also)) : differs(sorted)])
    : np.ones([n], { dtype: np.bool });
  const ends = n > 1 ? np.concatenate([changed.ref.slice([1, n]), np.ones([1], { dtype: np.bool })]) : changed.ref;
  const start = runningMax(np.where(changed, position.ref, -Infinity));
  const end = suffixMin(np.where(ends, position.add(1), Infinity));
  return { start, end };
}

/**
 * Rows ordered into runs: `key` (int32 [n]; borrowed) sorted stably, so each run keeps its rows'
 * order, or the rows of `within` (int32 [n], a permutation; borrowed) in that order inside each
 * run. `order` maps a position to its row, `inverse` a row to its position, and `start`/`end`
 * give each position's run as [start, end) (float32 [n]).
 */
export function runsOf(key, within = null) {
  const order = within ? np.take(within.ref, np.argsort(np.take(key.ref, within.ref, 0)), 0) : np.argsort(key.ref);
  const inverse = np.argsort(order.ref);
  const sortedKey = np.take(key.ref, order.ref, 0);
  let bounds;
  try { bounds = runBounds(sortedKey); }
  finally { sortedKey.dispose(); }
  const { start, end } = bounds;
  return { order, inverse, start, end, dispose() { [order, inverse, start, end].forEach((a) => a.dispose()); } };
}

/**
 * The scans' length for n rows: the length at which the fork's cumsum pads nothing (a power of
 * two up to 512; above, 256-row chunks, a power of two of them). Traced, a padding inside the
 * scan fuses into its unrolled loops, where a bound of n folds into the shader source (one
 * program per length); padded here, in a program of its own, the scan has none.
 */
const scanLength = (n) =>
  n <= 512 ? 2 ** Math.ceil(Math.log2(n)) : 256 * 2 ** Math.ceil(Math.log2(Math.ceil(n / 256)));

/** Each row's finite flag and finite value, zero-padded to `length` rows. Consumes `values`. */
const scanInputs = jit((values, length) => {
  const n = values.shape[0], finite = np.isfinite(values.ref);
  const pad = (a) => (length === n ? a : np.concatenate([a, np.zeros([length - n])]));
  return [pad(finite.ref.astype(np.float32)), pad(np.where(finite, values, 0))];
}, { staticArgnums: [1] });

/**
 * count, sum or mean of the windows at the first `n` positions, from the finite `counts` and
 * `sums` (float32, padded by scanInputs; 1D: an inner dimension of n would be a divisor in the
 * shaders, one per length): [lo, hi) is [position - shift, position - shift + size) clipped to
 * the run. `params` is [shift, size] (a buffer: a new window compiles nothing). One program per
 * op and kind of run bounds (none, an end, or a start and an end); consumes its arguments.
 */
function windowTotals(op, n, counts, sums, params, start, end) {
  const shift = params.ref.slice(0), size = params.slice(1);
  const first = np.arange(n).astype(np.float32).sub(shift);
  const lo = start ? np.maximum(first.ref, start) : np.maximum(first.ref, 0);
  const last = first.add(size);
  const hi = np.maximum(end ? np.minimum(last, end) : np.minimum(last, n), lo.ref);
  const upper = hi.astype(np.int32), lower = lo.astype(np.int32);
  // prefix[k] is the total of rows [0, k): a window's is prefix[hi] - prefix[lo].
  const total = (values) => {
    const prefix = np.concatenate([np.zeros([1]), np.cumsum(values, 0)]);
    return np.take(prefix.ref, upper.ref, 0).sub(np.take(prefix, lower.ref, 0));
  };
  const count = total(counts);
  const result = op === "count" ? (sums.dispose(), count.ref)
    : op === "sum" ? total(sums)
    : np.where(count.ref.greater(0), total(sums).div(np.maximum(count.ref, 1)), NaN);
  for (const a of [upper, lower, count]) a.dispose();
  return result;
}
const TOTALS = new Map();
function totalsProgram(op, bounds) {
  const key = `${op} ${bounds}`;
  let program = TOTALS.get(key);
  const options = { staticArgnums: [0] };
  if (!program) TOTALS.set(key, (program =
    bounds === "runs" ? jit((n, counts, sums, params, start, end) => windowTotals(op, n, counts, sums, params, start, end), options)
    : bounds === "end" ? jit((n, counts, sums, params, end) => windowTotals(op, n, counts, sums, params, null, end), options)
    : jit((n, counts, sums, params) => windowTotals(op, n, counts, sums, params, null, null), options)));
  return program;
}

/**
 * The window reduction at every position of `values` (float32 [n], in run order; borrowed):
 * rows [position - shift, position - shift + size), clipped to [start, end) (float32 [n], or a
 * scalar that broadcasts; borrowed; null for a single run of every row). Non-finite values are skipped; a window with
 * no finite value is NaN (count and sum: 0). Returns float32 [n] in run order.
 */
export function windowReduce(values, op, size, shift, start = null, end = null) {
  const n = values.shape[0];
  const maxSize = typeof size === "number" ? size : n;
  if (!n) return np.zeros([0], { dtype: op === "any" || op === "all" ? np.bool : np.float32 });
  if (op === "any" || op === "all") {
    const finite = np.isfinite(values.ref);
    const contributing = np.logicalAnd(finite, op === "any" ? values.ref.notEqual(0) : values.ref.equal(0)).astype(np.float32);
    const sums = windowReduce(contributing, "sum", size, shift, start, end);
    contributing.dispose();
    return op === "any" ? sums.greater(0) : sums.equal(0);
  }
  if (op === "count" || op === "sum" || op === "mean") {
    // Two programs (TODO 33.3): the inputs padded for the scan, then the scans and totals.
    const [counts, sums] = scanInputs(values.ref, scanLength(n));
    const params = typeof shift === "number" && typeof size === "number"
      ? deviceArray([shift, size])
      : np.stack([shift?.shape ? shift.ref : deviceScalar(shift), size?.shape ? size.ref : deviceScalar(size)]);
    const bounds = start ? "runs" : end ? "end" : "rows";
    const program = totalsProgram(op, bounds);
    return bounds === "runs" ? program(n, counts, sums, params, start.ref, end.ref)
      : bounds === "end" ? program(n, counts, sums, params, end.ref)
      : program(n, counts, sums, params);
  }
  const position = np.arange(n).astype(np.float32);
  const shiftParam = shift?.shape ? shift.ref : deviceScalar(shift), sizeParam = size?.shape ? size.ref : deviceScalar(size);
  const lo = start ? np.maximum(position.ref.sub(shiftParam.ref), start.ref) : np.maximum(position.ref.sub(shiftParam.ref), 0);
  const hi = end ? np.minimum(position.ref.sub(shiftParam.ref).add(sizeParam.ref), end.ref) : np.minimum(position.ref.sub(shiftParam.ref).add(sizeParam.ref), n);
  shiftParam.dispose(); sizeParam.dispose();
  const width = np.maximum(hi.ref.sub(lo.ref), 0);
  const finite = np.isfinite(values.ref);
  let result;
  if (op === "variance" || op === "std") {
    let depth = 0;
    while (2 ** (depth + 1) <= maxSize) depth++;
    const variance = windowVariance(depth)(values.ref, lo.ref, width.ref);
    result = op === "std" ? np.sqrt(variance) : variance;
  } else if (op === "min" || op === "max") {
    // Sparse table: level k holds the extreme of [i, i + 2^k). A window of width w reads level
    // floor(log2 w) at lo and at hi - 2^k: two blocks inside the window that cover it.
    const fill = op === "min" ? Infinity : -Infinity, pick = op === "min" ? np.minimum : np.maximum;
    let level = np.where(finite.ref, values.ref, fill);
    const levels = [level.ref];
    for (let step = 1; 2 * step <= maxSize && step < n; step *= 2) {
      level = pick(level.ref, np.concatenate([level.slice([step, n]), np.full([step], fill)]));
      levels.push(level.ref);
    }
    level.dispose();
    const table = np.concatenate(levels.map((l) => l.reshape([1, n])), 0).reshape([-1]); // consumes the levels
    // k = the number of levels 2^j (j >= 1) the width reaches: exact, no logarithm.
    let k = np.zeros([n]);
    for (let j = 1; j < levels.length; j++) k = k.add(width.ref.greaterEqual(2 ** j).astype(np.float32));
    const span = np.power(2, k.ref);
    const a = np.take(table.ref, np.clip(k.ref.mul(n).add(lo.ref), 0, levels.length * n - 1).astype(np.int32), 0);
    const b = np.take(table, np.clip(k.mul(n).add(hi.ref.sub(span)), 0, levels.length * n - 1).astype(np.int32), 0);
    const extreme = pick(a, b);
    result = np.where(np.logicalAnd(width.ref.greater(0), np.isfinite(extreme.ref)), extreme, NaN);
  } else if (op === "first" || op === "last") {
    // The nearest finite row at or after lo (first), at or before hi - 1 (last): one scan each.
    const index = op === "first"
      ? suffixMin(np.where(finite.ref, position.ref, Infinity))
      : runningMax(np.where(finite.ref, position.ref, -Infinity));
    const probe = op === "first" ? lo.ref : np.maximum(hi.ref.sub(1), 0);
    const found = np.take(index, np.clip(probe, 0, n - 1).astype(np.int32), 0);
    const inside = np.logicalAnd(width.ref.greater(0), op === "first" ? found.ref.less(hi.ref) : found.ref.greaterEqual(lo.ref));
    result = np.where(inside, np.take(values.ref, np.clip(found, 0, n - 1).astype(np.int32), 0), NaN);
  } else throw Error(`Unknown window reducer: ${op}`);
  for (const a of [position, lo, hi, width, finite]) a.dispose();
  return result;
}

/**
 * Inclusive scans within runs of equal `keys` (sorted; borrowed): position k gets `combine` ("sum",
 * "min" or "max") of its run's values up to k, in log2(n) shifted passes. Each run is scanned on
 * its own, so a small run's sum is not the difference of two large prefix sums. Consumes `values`.
 */
function runScan(values, keys, combine) {
  const n = values.shape[0];
  const fill = combine === "sum" ? 0 : combine === "min" ? Infinity : -Infinity;
  const pick = combine === "sum" ? (a, b) => a.add(b) : combine === "min" ? np.minimum : np.maximum;
  let result = values;
  for (let step = 1; step < n; step *= 2) {
    const earlier = np.concatenate([np.full([step], fill), result.ref.slice([0, n - step])]);
    const same = np.concatenate([np.full([step], -1, { dtype: np.int32 }), keys.ref.slice([0, n - step])]).equal(keys.ref);
    result = pick(result, np.where(same, earlier, fill));
  }
  return result;
}

/**
 * Each row's `op` over the rows of its group (TODO 137.2): the rows with its `key` (int32 [n];
 * borrowed), over the finite `values` (float32 [n]; borrowed; a hidden row is NaN), in row
 * order. A REDUCER_OPS reducer, median, quantile (at `p`) or mode, with reduceValues' numbers per group (a group
 * with no finite value is NaN; its count and sum 0). The rows are sorted into runs of equal key
 * and every run scanned on its own (runScan), the total read at its last position; median,
 * quantile and mode read the run sorted by value. The cost does not depend on the number of groups: no pass
 * per group and no one-hot of the keys.
 */
export function reduceRuns(values, key, op, p) {
  const n = values.shape[0];
  if (!n) return np.zeros([0], { dtype: op === "any" || op === "all" ? np.bool : np.float32 });
  const ordered = op === "median" || op === "quantile" || op === "mode";
  // Inside a run: row order (first, last), or ascending finite values, NaN last (median,
  // quantile, mode).
  const byValue = ordered ? np.argsort(np.where(np.isfinite(values.ref), values.ref, Infinity)) : null;
  const runs = runsOf(key, byValue);
  byValue?.dispose();
  const keys = np.take(key.ref, runs.order.ref, 0);
  const sorted = np.take(values.ref, runs.order.ref, 0);
  const finite = np.isfinite(sorted.ref);
  const last = np.clip(runs.end.ref.sub(1), 0, n - 1).astype(np.int32);
  // The scan of `array` (consumed) within the runs, read at each position's run end.
  const total = (array, combine) => np.take(runScan(array, keys, combine), last.ref, 0);
  const count = total(finite.ref.astype(np.float32), "sum");
  const present = count.ref.greater(0);
  let result;
  if (op === "count") result = count.ref;
  else if (op === "any" || op === "all") {
    const hits = total(np.logicalAnd(finite.ref, op === "any" ? sorted.ref.notEqual(0) : sorted.ref.equal(0)).astype(np.float32), "sum");
    result = op === "any" ? hits.greater(0) : hits.equal(0);
  } else if (op === "sum" || op === "mean" || op === "variance" || op === "std") {
    const sum = total(np.where(finite.ref, sorted.ref, 0), "sum");
    if (op === "sum") result = sum;
    else {
      const mean = sum.div(np.maximum(count.ref, 1));
      if (op === "mean") result = np.where(present.ref, mean, NaN);
      else {
        const variance = total(np.where(finite.ref, np.square(sorted.ref.sub(mean)), 0), "sum").div(np.maximum(count.ref, 1));
        result = np.where(present.ref, op === "std" ? np.sqrt(variance) : variance, NaN);
      }
    }
  } else if (op === "min" || op === "max") {
    const fill = op === "min" ? Infinity : -Infinity;
    result = np.where(present.ref, total(np.where(finite.ref, sorted.ref, fill), op), NaN);
  } else if (op === "first" || op === "last") {
    const position = np.arange(n).astype(np.float32);
    const at = total(np.where(finite.ref, position, op === "first" ? Infinity : -Infinity), op === "first" ? "min" : "max");
    result = np.where(present.ref, np.take(sorted.ref, np.clip(at, 0, n - 1).astype(np.int32), 0), NaN);
  } else if (op === "median") {
    // The finite values come first in each run, ascending.
    const middle = (at) => np.take(sorted.ref, np.clip(runs.start.ref.add(np.floor(at)), 0, n - 1).astype(np.int32), 0);
    const lo = middle(count.ref.sub(1).mul(0.5)), hi = middle(count.ref.mul(0.5));
    result = np.where(present.ref, lo.add(hi).mul(0.5), NaN);
  } else if (op === "quantile") {
    // Between the two nearest ranks of the run's finite values (numpy's "linear").
    const rank = (at) => np.take(sorted.ref, np.clip(runs.start.ref.add(at), 0, n - 1).astype(np.int32), 0);
    const position = np.maximum(count.ref.sub(1), 0).mul(p);
    const below = np.floor(position.ref);
    const lo = rank(below.ref), hi = rank(np.minimum(below.ref.add(1), np.maximum(count.ref.sub(1), 0)));
    result = np.where(present.ref, lo.ref.add(hi.sub(lo).mul(position.sub(below))), NaN);
  } else if (op === "mode") {
    // Stretches of equal values within a run, each one's length at its end; the longest wins,
    // the smallest value among ties (as reduceValues' sort gives first).
    const stretches = runBounds(keys, sorted);
    const position = np.arange(n).astype(np.float32);
    const atEnd = position.ref.add(1).equal(stretches.end);
    const length = np.where(np.logicalAnd(atEnd, finite.ref), position.sub(stretches.start).add(1), -1);
    const longest = total(length.ref, "max");
    const candidate = np.where(np.logicalAnd(length.ref.equal(longest), length.greater(0)), sorted.ref, Infinity);
    result = np.where(present.ref, total(candidate, "min"), NaN);
  } else throw Error(`Unknown reducer: ${op}`);
  for (const a of [keys, sorted, finite, last, count, present]) a.dispose();
  const restored = np.take(result, runs.inverse.ref, 0);
  runs.dispose();
  return restored;
}
