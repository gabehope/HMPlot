// Legacy reference for template parity; not shipped by the library.
import { numpy as np } from "@hmplot/jax";
import { planProgram } from "../../../src/lib/plot/utils/programs.js";
import { numericColumn } from "../../../src/lib/plot/utils/dataView.js";
import { reduceValues } from "../../../src/lib/plot/utils/reduce.js";
import { groupReduce } from "../../../src/lib/plot/utils/transforms/statistics.js";
import { inputGroups } from "../../../src/lib/plot/utils/transforms/common.js";

const methods = ["deviation", "extent", "sum", "first", "max"];

/**
 * Normalize: the same rows, each with `field` normalized by statistics of the visible finite
 * rows (with `by`, of its group's; masks, not per-group compaction: no readback and no kernel
 * sized by a group). method: deviation (z-score), extent (0 to 1), or division by the sum, the
 * first value or the maximum.
 */
export const normalize = {
  // Props that take a column name or one number per row (runner.js alignedFields).
  fields: ["field"],
  reads: "rows",
  output: "sameRows",
  validate(config) {
    const method = config.method ?? "deviation";
    if (!methods.includes(method))
      throw Error(`Unknown normalization: ${method}`);
  },
  async run(input, config, { own, cleanup, cache }) {
    const method = config.method ?? "deviation";
    const groups = config.by
      ? await inputGroups(cache, input, config.by)
      : null;
    if (groups) cleanup(() => groups.dispose());
    const plan = {
      method,
      hidden: Boolean(input.valid),
      groups: groups ? groups.count : null,
    };
    const inputs = {
      x: numericColumn(input.scope, config.field),
      ...(input.valid ? { valid: input.valid.ref } : {}),
      ...(groups ? { codes: groups.codes.ref } : {}),
    };
    // Statistics over the visible rows: the values follow the mask.
    return {
      columns: {
        [config.as ?? "normalized"]: own(
          input.length
            ? normalizeProgram(plan)(inputs)
            : normalizeKernel(plan, inputs),
        ),
      },
      followsMask: true,
    };
  },
};

/**
 * Normalize's device work for a plan ({ method, hidden, groups: the group count or null }), one
 * compiled program per plan (TODO 33.3). Consumes `inputs` (x, valid, codes).
 */
function normalizeKernel(
  { method, groups: count },
  { x, valid: shown, codes: rowCodes },
) {
  const valid = shown
    ? np.logicalAnd(np.isfinite(x.ref), shown.greater(0))
    : np.isfinite(x.ref);
  // Each row's group statistic, every group at once (TODO 29.9).
  const codes = rowCodes
    ? np.where(valid.ref, rowCodes.ref, -1).astype(np.int32)
    : null;
  const statistic = (op) => {
    if (!rowCodes) return reduceValues(valid, x, op);
    return np.take(groupReduce(codes, x, op, count), rowCodes.ref, 0);
  };
  let result;
  if (method === "deviation") {
    const mean = statistic("mean"),
      sd = statistic("std");
    result = np.where(
      valid.ref,
      x.ref.sub(mean).div(np.where(sd.ref.greater(0), sd.ref, 1)),
      np.nan,
    );
    sd.dispose();
  } else if (method === "extent") {
    const a = statistic("min"),
      span = statistic("max").sub(a.ref);
    result = np.where(
      valid.ref,
      np.where(
        span.ref.greater(0),
        x.ref.sub(a).div(np.maximum(span.ref, 1e-30)),
        0.5,
      ),
      np.nan,
    );
    span.dispose();
  } else {
    const d = statistic(method);
    result = np.where(
      np.logicalAnd(valid.ref, d.ref.notEqual(0)),
      x.ref.div(d.ref),
      np.nan,
    );
    d.dispose();
  }
  for (const a of [x, valid, codes, rowCodes]) a?.dispose();
  return result;
}
const PROGRAMS = new Map();
/** normalizeKernel compiled once per plan (utils/programs.js). */
const normalizeProgram = (plan) => planProgram(PROGRAMS, plan, normalizeKernel);
