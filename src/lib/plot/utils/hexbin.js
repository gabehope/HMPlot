/**
 * Hexbin over a fixed extent (TODO 17.14d). Without an extent, Hexbin groups the rows by their
 * cells and outputs the occupied ones, so its length follows the data and, after a Filter, every
 * selection compiles new kernels. With `extent`, the cells are every hexagon of a fixed axial box
 * covering it, in the order Group gives (q, then r), and a row outside the extent falls in no cell;
 * the output has a row per cell with the occupied ones valid, like Bin's bins.
 *
 * Per-cell totals come from a sort, not from a scatter (jax-js has none): the rows are sorted with
 * one marker per cell, keyed to land right after its cell's rows; a segmented running sum over the
 * sorted order leaves each cell's total at its marker, which the inverse permutation finds.
 * Totals within a cell are exact (no difference of large prefix sums).
 */
import { numpy as np, jit } from "@hmplot/jax";

/** The reducers the fixed grid computes; any other keeps Hexbin's grouped path. */
export const HEX_GRID_REDUCERS = Object.freeze(["count", "sum", "mean"]);

/** Axial coordinates (fractional) of a point for hexagons of `radius`. */
function axial(x, y, radius, orientation) {
  return orientation === "pointy"
    ? [x / (Math.sqrt(3) * radius) - y / (3 * radius), (2 * y) / (3 * radius)]
    : [(2 * x) / (3 * radius), y / (Math.sqrt(3) * radius) - x / (3 * radius)];
}

/** Validate a Hexbin's bounds: { x: [x0, x1], y: [y0, y1] }, finite and increasing. */
export function hexExtent(extent) {
  for (const axis of ["x", "y"]) {
    const range = extent?.[axis];
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[1] <= range[0])
      throw Error(`Hexbin bounds.${axis} must be two increasing finite numbers.`);
  }
  return extent;
}

/**
 * The axial box of cells that covers `extent` (with a cell of margin for rounding): cell index
 * c = (q - qMin) * rows + (r - rMin), so cells run in (q, r) order, as Group sorts them.
 */
export function hexGrid(extent, radius, orientation) {
  const corners = [extent.x[0], extent.x[1]].flatMap((x) =>
    [extent.y[0], extent.y[1]].map((y) => axial(x, y, radius, orientation)));
  const qMin = Math.floor(Math.min(...corners.map((c) => c[0]))) - 1,
    qMax = Math.ceil(Math.max(...corners.map((c) => c[0]))) + 1,
    rMin = Math.floor(Math.min(...corners.map((c) => c[1]))) - 1,
    rMax = Math.ceil(Math.max(...corners.map((c) => c[1]))) + 1;
  const columns = qMax - qMin + 1, rows = rMax - rMin + 1;
  return { qMin, rMin, columns, rows, count: columns * rows };
}

/**
 * Per sorted row, the running total of `values` within its segment (a run of equal `segment`
 * values), in log2(n) shifted passes: one program per length. Arguments are consumed.
 */
const segmentedSum = jit((values, segment) => {
  const n = values.shape[0];
  let total = values;
  for (let step = 1; step < n; step *= 2) {
    const before = np.concatenate([np.zeros([step]), total.ref.slice([0, n - step])]);
    const same = segment.ref.equal(np.concatenate([np.full([step], -1), segment.ref.slice([0, n - step])]));
    total = total.add(np.where(same, before, 0));
  }
  segment.dispose();
  return total;
});

/**
 * Per cell (0 .. count - 1), the total of each of `weights` (float32 [n]) over the rows whose
 * `cell` (float32 [n]; `count` for a row in no cell) is that cell. Borrows its arguments; returns
 * float32 [count] arrays, one per weight.
 */
export function hexTotals(cell, weights, count) {
  const n = cell.shape[0], scratch = [], tmp = (a) => (scratch.push(a), a);
  try {
    // Each cell's marker sorts right after its rows (c + 0.5); rows in no cell sort last.
    const keys = tmp(np.concatenate([cell.ref, np.arange(count).astype(np.float32).add(0.5)]));
    const order = tmp(np.argsort(keys.ref));
    // The inverse permutation: where each row and marker landed; the markers', in cell order.
    const at = tmp(np.argsort(order.ref).slice([n, n + count]).astype(np.int32));
    const segment = tmp(np.floor(np.take(keys.ref, order.ref, 0)));
    return weights.map((weight) => {
      const sorted = np.take(np.concatenate([weight.ref, np.zeros([count])]), order.ref, 0);
      return np.take(segmentedSum(sorted, segment.ref), at.ref, 0);
    });
  } finally {
    scratch.forEach((a) => a.dispose());
  }
}
