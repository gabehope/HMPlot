// Heatmap and Image on grid tables (TODO 51 decisions 8 and 9): a field of a grid table drawn as
// the raster of the two dimensions it spans, placed by their coordinates. Evenly spaced
// coordinates place it by its extent, as bounds do; uneven ones (Gaussian latitudes), descending
// ones and rotated ones map through a remap table per axis (a position to a fractional cell
// index), which the texture's resampling reads, so every mode that samples the field by uv
// (flat, surface, maps and the globe) draws them; a curvilinear grid draws on a mesh of its own
// cells, each corner placed by its positions.
import { numpy as np, jit } from "@hmplot/jax";
import { drawnDims, dimExtent, evenlySpaced, remapTable, describeShape } from "./gridModel.js";
import { broadcastOver } from "./gridTable.js";
import { deviceArray } from "./deviceParams.js";
import { asArray } from "./data.js";

/** Entries in a remap table: its values are linear between knots, sampled with interpolation. */
export const REMAP_SIZE = 2048;

/**
 * Which dimensions a grid mark draws: `{ rows, columns, curvilinear, x, y }` (dimension indices
 * and the coordinate names on the axes). Every other dimension must be sliced away first; one of
 * a single coordinate already is.
 */
export function gridLayout(grid, props, kind) {
  const drawn = drawnDims(grid, props.x, props.y);
  const others = grid.dims.filter((dim, k) => k !== drawn.rows && k !== drawn.columns && dim.size > 1);
  if (grid.dims.length < 2)
    throw Error(`${kind} draws a grid of two dimensions; this one has one (${describeShape(grid)}).`);
  if (others.length)
    throw Error(`${kind} draws two dimensions of a grid; this one is ${describeShape(grid)}. Slice the others first (Slice field="${others[0].name}").`);
  for (const k of [drawn.rows, drawn.columns])
    if (!(grid.dims[k].coords instanceof Float64Array))
      throw Error(`${kind}: ${grid.dims[k].name} is a categorical dimension; draw it with a numeric one on each axis.`);
  return drawn;
}

/** The remap table of a dimension that needs one (uneven, descending or rotated), else null. */
export function axisRemap(dim) {
  if (evenlySpaced(dim)) return null;
  const [lo, hi] = dimExtent(dim);
  return remapTable(dim, lo, hi, REMAP_SIZE);
}

const RASTERS = new Map();
/**
 * A grid field as a raster over the drawn dimensions, transposed when the x dimension comes
 * first in the grid: a scalar ([n]) as [rows, columns, 2], its value (0 where missing) and its
 * validity (1 where finite and shown); colors ([n, 3 or 4]) as [rows, columns, 4], the alpha
 * times their validity. `valid` (a padded view's shown rows, or null) hides cells. One compiled
 * program per layout. Consumes `values` and `valid`.
 */
export function gridRaster(grid, layout, values, valid) {
  const { rows, columns } = layout, transposed = columns < rows;
  const shape = [grid.dims[rows].size, grid.dims[columns].size];
  const channels = values.shape.length > 1 ? values.shape[1] : 1, hidden = Boolean(valid);
  const key = JSON.stringify([shape, transposed, channels, hidden]);
  let program = RASTERS.get(key);
  if (!program) {
    if (RASTERS.size >= 64) RASTERS.delete(RASTERS.keys().next().value);
    program = jit((v, shown) => {
      // In C order the grid is [first, second]: x first means [columns, rows].
      const stored = transposed ? [shape[1], shape[0]] : shape;
      const orient = (a) => (transposed ? np.transpose(a, [1, 0, 2]) : a);
      const raster = orient(v.astype(np.float32).reshape([...stored, channels]));
      let ok = np.min(np.isfinite(raster.ref).astype(np.float32), 2, { keepdims: true });
      if (hidden) ok = ok.mul(orient(shown.greater(0).astype(np.float32).reshape([...stored, 1])));
      else shown.dispose();
      const clean = np.where(ok.ref.greater(0), raster, 0);
      if (channels === 1) return np.concatenate([clean, ok], 2);
      const alpha = channels === 4 ? clean.ref.slice([], [], [3, 4]).mul(ok) : ok;
      return np.concatenate([clean.slice([], [], [0, 3]), alpha], 2);
    });
    RASTERS.set(key, program);
  }
  return program(values, valid ?? np.zeros([0]));
}

const CORNERS = new Map();
/**
 * A curvilinear grid's cell corners, [(rows + 1) * (columns + 1), 2] (x then y), from its
 * positions at the cells' centres: the centres extended by a linear step past each edge, then
 * each corner the mean of the four centres around it. Consumes `x` and `y` ([rows * columns]).
 */
export function curvilinearCorners(x, y, rows, columns) {
  const key = `${rows}x${columns}`;
  let program = CORNERS.get(key);
  if (!program) {
    if (CORNERS.size >= 16) CORNERS.delete(CORNERS.keys().next().value);
    const extend = (a, axis, n) => {
      const first = a.ref.slice(...(axis === 0 ? [[0, 1]] : [[], [0, 1]]));
      const second = a.ref.slice(...(axis === 0 ? [[1, 2]] : [[], [1, 2]]));
      const last = a.ref.slice(...(axis === 0 ? [[n - 1, n]] : [[], [n - 1, n]]));
      const before = a.ref.slice(...(axis === 0 ? [[n - 2, n - 1]] : [[], [n - 2, n - 1]]));
      return np.concatenate([first.mul(2).sub(second), a, last.mul(2).sub(before)], axis);
    };
    const corners = (a) => {
      // A single row or column extends by a unit step, as a lone coordinate's edges do.
      let p = a.reshape([rows, columns]);
      p = rows > 1 ? extend(p, 0, rows) : np.concatenate([p.ref.sub(0.5), p.ref, p.add(0.5)], 0);
      p = columns > 1 ? extend(p, 1, columns) : np.concatenate([p.ref.sub(0.5), p.ref, p.add(0.5)], 1);
      const r = rows + 2, c = columns + 2;
      const at = (i, j) => p.ref.slice([i, i + r - 1], [j, j + c - 1]);
      const mean = at(0, 0).add(at(1, 0)).add(at(0, 1)).add(at(1, 1)).mul(0.25);
      p.dispose();
      return mean.reshape([(rows + 1) * (columns + 1), 1]);
    };
    program = jit((px, py) => np.concatenate([corners(px), corners(py)], 1));
    CORNERS.set(key, program);
  }
  return program(x, y);
}

/**
 * A coordinate's values over the curvilinear pair of dimensions ([rows * columns], C order):
 * a position as it is, a dimension's coordinates repeated. The caller owns the result.
 */
export function pairValues(grid, name) {
  const [a, b] = grid.coords2d.dims;
  const position = grid.coords2d.columns[name];
  if (position) return asArray(position).astype(np.float32);
  const k = grid.dims.findIndex((dim) => dim.name === name);
  if (k !== a && k !== b) throw Error(`${name} is not a coordinate over the grid's positions.`);
  return broadcastOver({ shape: [grid.dims[a].size, grid.dims[b].size] }, deviceArray(Float32Array.from(grid.dims[k].coords)), [k === a ? 0 : 1]);
}
