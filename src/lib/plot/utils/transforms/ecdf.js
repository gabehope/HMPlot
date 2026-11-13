import { numpy as np, jit } from "@hmplot/jax";
import { numericColumn } from "../dataView.js";
import { inputGroups } from "./common.js";

/**
 * ECDF (TODO 47.3): the same rows in `x` order within each group of `by`, with a column `ecdf`,
 * the fraction (or count) of the group's shown rows at or below the row's value: ties take the
 * last rank, so each distinct value is one step. Output "reordered", so selections and brushes
 * follow the points; a Line with curve="step-after" and series=by draws the steps. Hidden rows
 * and missing values come last, with ecdf NaN (the visible rows first, as the runner orders
 * them, so the column lines up with its order).
 */
/**
 * Inclusive sums of `values` ([m, d]) over runs of rows whose `keys` (arrays, sorted together)
 * are all equal, in log2(m) shifted passes (segmentedScan with several keys: rows `step` apart
 * with equal keys have equal keys between them, since the rows are sorted). Consumes all.
 */
function runScan(values, keys) {
  const [m, d] = values.shape;
  let sums = values;
  for (let step = 1; step < m; step *= 2) {
    const shifted = np.concatenate([np.zeros([step, d]), sums.ref.slice([0, m - step])]);
    let same = null;
    for (const key of keys) {
      const earlier = np.concatenate([np.full([step], NaN), key.ref.slice([0, m - step]).astype(np.float32)]);
      const equal = earlier.equal(key.ref.astype(np.float32));
      same = same ? np.logicalAnd(same, equal) : equal;
    }
    sums = sums.add(np.where(same.reshape([m, 1]), shifted, 0));
  }
  keys.forEach((key) => key.dispose());
  return sums;
}
const PROGRAMS = new Map();
function ecdfProgram(complementary, count) {
  const key = `${complementary}:${count}`;
  let program = PROGRAMS.get(key);
  if (program) return program;
  program = jit((value, codes, shown) => {
    const n = value.shape[0];
    const ok = np.logicalAnd(shown, np.isfinite(value.ref));
    // Stable sorts from the last key to the first: value, then group, then shown-and-finite.
    let order = np.argsort(np.where(ok.ref, value.ref, Infinity)).astype(np.int32);
    const byGroup = np.argsort(np.take(codes.ref, order.ref, 0));
    order = np.take(order, byGroup, 0);
    const byShown = np.argsort(np.take(ok.ref, order.ref, 0).equal(false).astype(np.int32));
    order = np.take(order, byShown, 0);
    const sorted = np.take(value, order.ref, 0), kept = np.take(ok, order.ref, 0);
    const group = np.where(kept.ref, np.take(codes, order.ref, 0), -1);
    // Each position's rank in its group, the rows after it there, and the rows after it with its
    // value (ties take the run's last rank): inclusive scans over runs of equal keys, forward and
    // reversed. (The fork's cumsum compiles one program per length; these shifted passes do not.)
    const ones = np.ones([n, 1]);
    const reversed = (a) => np.flip(a, 0);
    const rank = runScan(ones.ref, [group.ref]).reshape([n]);
    const after = reversed(runScan(ones.ref, [reversed(group.ref)]).reshape([n])).sub(1);
    const tied = reversed(runScan(ones, [reversed(group), reversed(sorted)]).reshape([n])).sub(1);
    const size = rank.ref.add(after), below = rank.add(tied);
    let measure;
    if (count) measure = complementary ? size.sub(below) : (size.dispose(), below);
    else {
      const fraction = below.div(size);
      measure = complementary ? np.ones([n]).sub(fraction) : fraction;
    }
    return [order, np.where(kept, measure, NaN)];
  });
  if (PROGRAMS.size >= 16) PROGRAMS.delete(PROGRAMS.keys().next().value);
  PROGRAMS.set(key, program);
  return program;
}

export const ecdf = {
  // Props that take a column name or one number per row (runner.js alignedFields).
  fields: ["x"],
  reads: "rows",
  output: "reordered",
  validate(config) {
    if ((typeof config.x !== "string" || !config.x) && (typeof config.x !== "object" || config.x === null))
      throw Error("ECDF needs x, a column name or one number per row.");
    if (!["fraction", "count"].includes(config.normalize ?? "fraction"))
      throw Error('ECDF normalize must be "fraction" or "count".');
  },
  // The steps are the field's values; the ecdf column is a fraction (or count) of rows.
  names: (config, source) => ({ ecdf: (config.complementary ? "1 − ECDF" : "ECDF") + ((config.normalize ?? "fraction") === "count" ? " (count)" : "") }),
  async run(input, config, { own, cache, cleanup }) {
    const n = input.length;
    const value = numericColumn(input.scope, config.x);
    const groups = config.by ? await inputGroups(cache, input, config.by) : null;
    if (groups) cleanup(() => groups.dispose());
    const codes = groups ? groups.codes.ref : np.zeros([n], { dtype: np.int32 });
    const shown = input.valid ? input.valid.ref.greater(0) : np.ones([n], { dtype: np.bool });
    if (!n) {
      value.dispose(); codes.dispose(); shown.dispose();
      return { order: own(np.zeros([0], { dtype: np.int32 })), columns: { ecdf: own(np.zeros([0])) } };
    }
    const [order, measure] = ecdfProgram(Boolean(config.complementary), (config.normalize ?? "fraction") === "count")(value, codes, shown).map(own);
    return { order, columns: { ecdf: measure } };
  },
};
