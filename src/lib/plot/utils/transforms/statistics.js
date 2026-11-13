import { numpy as np } from "@hmplot/jax";
import { scalar } from "../dataView.js";
import { reduceValues, reduceByCode } from "../reduce.js";
import { deviceParams, deviceScalar, deviceArray } from "../deviceParams.js";

/** Statistics and bins shared by transforms (moved from transforms.js, TODO 31.3). */

export const REDUCER_OPS = new Set([
  "count",
  "sum",
  "mean",
  "min",
  "max",
  "first",
  "last",
  "variance",
  "std",
  "any",
  "all",
]);

export { normalQuantile, studentTCdf, studentTQuantile, studentTTable, studentTOnDevice } from "../../../math/distributions.js";

export const inGroup = (codes, group) =>
  codes.ref.equal(deviceScalar(group, { dtype: "int32" }));
/** Linear interpolation between the order statistics around each probability, as numpy. */
export function quantileValues(sorted, count, probabilities) {
  const lo = [],
    hi = [],
    below = [],
    above = [];
  for (const p of probabilities) {
    const at = p * (count - 1),
      floor = Math.floor(at),
      t = at - floor;
    lo.push(floor);
    hi.push(Math.ceil(at));
    below.push(1 - t);
    above.push(t);
  }
  const a = np.take(sorted.ref, deviceArray(lo, { dtype: "int32" }), 0),
    b = np.take(sorted.ref, deviceArray(hi, { dtype: "int32" }), 0);
  return a.mul(deviceArray(below)).add(b.mul(deviceArray(above)));
}
/**
 * A missing value (NaN) that kernels read from a buffer. A literal NaN (np.array(np.nan)) is folded
 * into the kernel that stacks per-group results, so every pattern of empty groups compiled its own
 * (a brush that empties a BoxPlot group: TODO 17.14c).
 */
export function missingValue() {
  const [missing, other] = deviceParams([NaN, 0]);
  other.dispose();
  return missing;
}
export function quantileValue(sorted, count, p) {
  if (!count) return missingValue();
  return quantileValues(sorted, count, [p]).reshape([]);
}
export function validateReducers(reduce = {}, boolean = false) {
  for (const [name, spec] of Object.entries(reduce)) {
    if (!spec || !REDUCER_OPS.has(spec.op))
      throw Error(`Unknown reducer for ${name}: ${spec?.op}`);
    if (!boolean && ["any", "all"].includes(spec.op))
      throw Error(`Reducer ${name}: use any/all in Group, GraphData or Window; this transform accepts numeric reducers.`);
    if (spec.op !== "count" && spec.field === undefined)
      throw Error(`Reducer ${name} needs a field.`);
  }
}
/** Bin-count rules, as numpy computes them: Sturges, Freedman-Diaconis, Scott, and
 * "auto", the finer of Sturges and a relaxed Freedman-Diaconis (numpy 2). */
export const BIN_RULES = Object.freeze(["auto", "sturges", "fd", "scott"]);

/**
 * The bin count a rule gives for `values` whose finite extent is [a, b] (numpy's
 * histogram_bin_edges, including its degenerate cases: a rule whose width comes out zero, such
 * as "fd" on a zero IQR or "scott" on a constant column, is one bin).
 */
export async function binCountFromRule(rule, values, a, b, rows = null) {
  if (!BIN_RULES.includes(rule))
    throw Error(
      `Unknown bin rule ${JSON.stringify(rule)}; use ${BIN_RULES.join(", ")}, a count, or explicit edges.`,
    );
  // `rows`: a padded input's valid mask (TODO 17.3); only those rows count.
  const mask = rows ? rows.ref.greater(0) : np.ones([values.shape[0]], { dtype: np.bool });
  const count = await scalar(reduceValues(mask, values, "count"));
  if (!(count > 1)) {
    mask.dispose();
    return 1;
  }
  const span = b - a;
  const sturges = span / (Math.log2(count) + 1);
  let width;
  if (rule === "sturges") width = sturges;
  else if (rule === "scott") {
    const deviation = await scalar(reduceValues(mask, values, "std"));
    width = Math.cbrt((24 * Math.sqrt(Math.PI)) / count) * deviation;
  } else {
    const valid = np.logicalAnd(mask.ref, np.isfinite(values.ref));
    const sorted = np.sort(np.where(valid.ref, values.ref, Infinity));
    const low = quantileValue(sorted, count, 0.25),
      high = quantileValue(sorted, count, 0.75);
    const range = await scalar(high.ref.sub(low.ref));
    low.dispose();
    high.dispose();
    sorted.dispose();
    valid.dispose();
    const fd = (2 * range) / Math.cbrt(count);
    // numpy's "auto": the finer of Sturges and Freedman-Diaconis, with the latter widened to
    // at least half the square-root rule so a small IQR cannot ask for a flood of bins.
    width =
      rule === "fd"
        ? fd
        : Math.min(Math.max(fd, span / Math.sqrt(count) / 2), sturges);
  }
  mask.dispose();
  if (!(width > 0) || !Number.isFinite(span / width)) return 1;
  // A rule on wild data can still ask for an absurd number of bins; keep it usable.
  return Math.max(1, Math.min(Math.ceil(span / width), 65536));
}

export function validateBinEdges(edges) {
  if (
    !Array.isArray(edges) ||
    edges.length < 2 ||
    edges.some((v, i) => !Number.isFinite(v) || (i && v <= edges[i - 1]))
  )
    throw Error("Bin edges must be finite and strictly increasing.");
  return edges;
}

/**
 * `op` (a REDUCER_OPS reducer) of `values` (float32 [n], or null: count the rows) per group, for
 * every group at once (TODO 29.7): for g in 0 .. total - 1, over the rows whose `codes` (int32
 * [n]; -1 for none: hidden rows) is g and whose value is finite. The same numbers as
 * reduceValues over each group's mask (population variance; an empty group is NaN, its count
 * and sum 0), from one-hot reductions instead of a pass per group. float32 [total]; borrows its
 * arguments.
 */
export function groupReduce(codes, values, op, total) {
  if (!total) return np.zeros([0], { dtype: op === "any" || op === "all" ? np.bool : np.float32 });
  const n = codes.shape[0],
    owned = [];
  if (!n) return np.full([total], op === 'all' ? true : op === 'any' ? false : op === 'sum' || op === 'count' ? 0 : NaN, { dtype: op === 'any' || op === 'all' ? np.bool : np.float32 });
  const own = (a) => (owned.push(a), a);
  try {
    const valid = own(
      values
        ? np.logicalAnd(codes.ref.greaterEqual(0), np.isfinite(values.ref))
        : codes.ref.greaterEqual(0),
    );
    const code = own(np.where(valid.ref, codes.ref, -1).astype(np.int32));
    // Accumulate counts exactly as integers, then preserve the public float32 output type.
    const count = own(reduceByCode(code, own(np.ones([n], { dtype: np.int32 })), total).astype(np.float32));
    if (op === "any" || op === "all") {
      const contributing = own(np.where(valid.ref, op === "any" ? values.ref.notEqual(0) : values.ref.equal(0), false).astype(np.float32));
      const totals = reduceByCode(code, contributing, total);
      return op === "any" ? totals.greater(0) : totals.equal(0);
    }
    if (op === "count") return count.ref;
    const present = own(count.ref.greater(0));
    if (op === "min" || op === "max")
      return np.where(
        present.ref,
        reduceByCode(code, values, total, op),
        np.nan,
      );
    if (op === "first" || op === "last") {
      const at = own(
        reduceByCode(
          code,
          own(np.arange(n).astype(np.float32)),
          total,
          op === "first" ? "min" : "max",
        ),
      );
      return np.where(
        present.ref,
        np.take(
          values.ref,
          np.clip(at.ref, 0, Math.max(0, n - 1)).astype(np.int32),
          0,
        ),
        np.nan,
      );
    }
    const sum = own(
      reduceByCode(code, own(np.where(valid.ref, values.ref, 0)), total),
    );
    if (op === "sum") return sum.ref;
    const mean = own(sum.ref.div(np.maximum(count.ref, 1)));
    if (op === "mean") return np.where(present.ref, mean.ref, np.nan);
    const deviation = own(
      np.where(
        valid.ref,
        np.square(
          values.ref.sub(np.take(mean.ref, np.clip(code.ref, 0, total - 1), 0)),
        ),
        0,
      ),
    );
    const variance = own(
      reduceByCode(code, deviation, total).div(np.maximum(count.ref, 1)),
    );
    return np.where(
      present.ref,
      op === "std" ? np.sqrt(variance.ref) : variance.ref,
      np.nan,
    );
  } finally {
    owned.forEach((a) => a.dispose());
  }
}
