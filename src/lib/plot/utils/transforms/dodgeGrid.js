import { numpy as np, jit } from "@hmplot/jax";
import { numericColumn } from "../dataView.js";
import { deviceScalar } from "../deviceParams.js";
import { LIMITS, limitError } from "../limits.js";

/** [the invalid counts, their total] (float32 [2]): one readback. Consumes `counts`. */
const countCheck = jit((counts) => {
  const invalid = np.logicalOr(
    np.logicalNot(np.isfinite(counts.ref)),
    np.logicalOr(counts.ref.less(0), counts.ref.notEqual(np.floor(counts.ref))),
  );
  return np.stack([np.sum(invalid.astype(np.float32)), np.sum(counts.astype(np.float32))]);
});

/** Each unit's row: the first row whose cumulative count exceeds it. Consumes its arguments. */
const unitRows = jit((cumulative, units) => {
  const n = cumulative.shape[0];
  let lo = np.zeros(units.shape, { dtype: np.int32 }),
    hi = np.full(units.shape, n, { dtype: np.int32 });
  for (let pass = 0; pass < Math.ceil(Math.log2(n + 1)); pass++) {
    const mid = np.floor(lo.ref.add(hi.ref).div(2)).astype(np.int32);
    const before = np.take(cumulative.ref, np.minimum(mid.ref, n - 1), 0).lessEqual(units.ref);
    lo = np.where(before.ref, mid.ref.add(1), lo);
    hi = np.where(before, hi, mid);
  }
  for (const a of [cumulative, units, hi]) a.dispose();
  return lo;
});

/** Each unit's cell in rows of `width` (a float from a buffer): x, y, position, x0, x1, y0, y1. */
const gridCells = jit((units, width) => {
  const u = units.astype(np.float32);
  const x = np.remainder(u.ref, width.ref).add(0.5),
    y = np.floor(u.div(width)).add(0.5);
  return [x.ref, y.ref, np.stack([x.ref, y.ref], 1), x.ref.sub(0.5), x.add(0.5), y.ref.sub(0.5), y.add(0.5)];
});

/**
 * Dodge with mode "grid": a unit per row (or `count` units), laid out left to right in rows of
 * `columns` cells: each unit's x, y, cell bounds and position, and its source row. Dodge's other
 * modes are marks' offsets (utils/dodge.js), not a transform.
 */
export const dodgeGrid = {
  // Its expression parameters, evaluated before it runs (TODO 138.2).
  parameters: { columns: { type: "expression", integer: true } },
  reads: "compacted",
  output: "newRows",
  repeatsRows: true,
  // A unit's cell is a place in the grid, not a column's value: unnamed.
  names: () => Object.fromEntries(["x", "y", "position", "unitIndex", "x0", "x1", "y0", "y1"].map((name) => [name, null])),
  validate(config) {
    if (config.mode !== "grid") throw Error("Unknown transform: Dodge");
    const width = config.columns ?? 10;
    if (!Number.isInteger(width) || width <= 0)
      throw Error("Grid Dodge columns must be a positive integer.");
  },
  async run(input, config, { own, maxBytes }) {
    const n = input.length,
      width = config.columns ?? 10;
    let counts = null,
      total = n;
    if (config.count !== undefined) {
      counts = own(numericColumn(input.scope, config.count));
      // The validation and the unit total in one readback (TODO 30.12).
      const [invalid, sum] = n
        ? Array.from(await countCheck(counts.ref).data(), Number)
        : [0, 0];
      if (invalid)
        throw Error("Grid Dodge count must contain finite nonnegative integers.");
      total = sum;
    }
    const limit = Math.min(LIMITS.dodgeUnits.value, Math.floor(maxBytes / 32));
    if (!Number.isSafeInteger(total) || total > limit)
      throw limitError("dodgeUnits", {
        count: Number.isSafeInteger(total) ? total : undefined,
        limit,
      });
    const units = own(np.arange(total).astype(np.int32));
    // Each unit's row: an upper-bound search over the cumulative counts (zero-count rows
    // included), as one compiled program (30.12; it was log2(n) passes with a wait each).
    const order =
      counts === null
        ? own(units.ref)
        : total
          ? own(unitRows(np.cumsum(counts.ref, 0), units.ref))
          : own(np.zeros([0], { dtype: np.int32 }));
    // The column count reaches the program as a float from a buffer, so the program is traced
    // once for every count. Exact below 2^24 units (the limit above).
    const [x, y, position, x0, x1, y0, y1] = total
      ? gridCells(units.ref, deviceScalar(width)).map(own)
      : Array.from({ length: 7 }, (_, k) => own(np.zeros(k === 2 ? [0, 2] : [0])));
    const columns = { x, y, position, unitIndex: units, x0, x1, y0, y1 };
    const columnMetadata = Object.fromEntries(
      Object.keys(columns).map((key) => [key, { type: "numeric" }]),
    );
    const provenance = {
      kind: "dodge-grid",
      extent: {
        x: [0, Math.min(total, width)],
        y: [0, Math.ceil(total / width)],
      },
    };
    return { order, columns, columnMetadata, provenance };
  },
};
