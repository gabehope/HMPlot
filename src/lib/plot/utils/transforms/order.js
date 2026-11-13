import { numpy as np, jit } from "@hmplot/jax";
import { list, comparisonColumn, cachedArray } from "./common.js";

/**
 * Sort: the rows ordered by `by` (stable, missing values last). Over hidden rows the runner puts
 * the visible ones first.
 */
export const sort = {
  reads: "rows",
  output: "reordered",
  validate(config) {
    if (
      !list(config.by).length ||
      !["asc", "desc"].includes(config.order ?? "asc")
    )
      throw Error("Sort needs a field and asc or desc order.");
  },
  run(input, config, { own, cache }) {
    const by = list(config.by);
    const build = () => sortOrder(input.scope, by, config.order, input.length);
    // The order of the rows read does not depend on which are visible: kept across runs while
    // the key columns are the same objects (TODO 29.6; a Filter's rows are its parent's own
    // columns). Only the runner's visible-first step runs per brush move.
    if (by.some((key) => typeof key !== "string" || key.startsWith("@")))
      return { order: own(build()) };
    const identity = [
      JSON.stringify(by),
      config.order ?? "asc",
      input.length,
      input.scope.identity?.generation,
      ...by.map((key) => input.scope.get(key)),
    ];
    return { order: own(cachedArray(cache, "sort", identity, build)) };
  },
};

/**
 * The stable order of `values` (the key columns, first key first): stable sorts from the last
 * key to the first, missing values last. Consumes `values`.
 */
function orderKernel(direction, values) {
  let order = np.arange(values[0].shape[0]).astype(np.int32);
  for (const value of [...values].reverse()) {
    const ordered = np.take(value, order.ref, 0);
    const step = np.argsort(
      np.where(
        np.isfinite(ordered.ref.astype(np.float32)),
        direction === "desc" ? ordered.ref.neg() : ordered.ref,
        Infinity,
      ),
    );
    ordered.dispose();
    order = np.take(order, step, 0);
  }
  return order;
}
const PROGRAMS = new Map();
/** orderKernel compiled, one program per direction (TODO 33.3); the keys are its arguments. */
function orderProgram(direction) {
  let program = PROGRAMS.get(direction);
  if (!program)
    PROGRAMS.set(
      direction,
      (program = jit((values) => orderKernel(direction, values))),
    );
  return program;
}

/** The rows' stable order by `by` (last key first), missing values last. The caller owns it. */
export function sortOrder(scope, by, direction, n) {
  const owned = [],
    own = (a) => (owned.push(a), a);
  try {
    const values = by.map((key) => comparisonColumn(scope, key, own).array.ref);
    return n ? orderProgram(direction)(values) : orderKernel(direction, values);
  } finally {
    owned.forEach((a) => a.dispose());
  }
}
