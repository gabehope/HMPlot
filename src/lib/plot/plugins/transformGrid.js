import { numpy as np } from "@hmplot/jax";
import { numericColumn } from "../utils/dataView.js";
import { gridTable, gridSpecOf } from "../utils/gridTable.js";
import { normalizeGrid } from "../utils/gridModel.js";

/** The same dimension validation as Data's gridTable, without materializing coordinates. */
export function pluginGrid({ dims, edges } = {}) {
  return normalizeGrid(gridSpecOf(gridTable({ dims, edges })));
}

/** Metadata is available while planning; fields are borrowed only during a run. */
export function transformGrid(scope, own) {
  const rows = scope.padded?.() ?? scope;
  const grid = rows.grid;
  if (!grid || rows.length !== grid.size) return null;
  const drawn = (n) => {
    if (!Number.isInteger(n) || n < 1 || n > grid.dims.length || grid.coords2d)
      return null;
    const active = grid.dims.filter((dim) => dim.size > 1);
    if (active.length > n) return null;
    const chosen = new Set(active);
    for (const dim of [...grid.dims].reverse()) {
      if (chosen.size === n) break;
      chosen.add(dim);
    }
    const dims = grid.dims.filter((dim) => chosen.has(dim));
    return dims.every((dim) => dim.coords instanceof Float64Array)
      ? dims
      : null;
  };
  const fields = new Map();
  return {
    dims: grid.dims,
    drawn,
    drawable: (n) => drawn(n) !== null,
    field(name) {
      if (!own)
        throw Error(
          "Transform: grid.field() is available inside run(), not while planning output.",
        );
      if (!fields.has(name)) {
        let value = numericColumn(rows, name);
        if (rows.valid) value = np.where(rows.valid.ref.greater(0), value, NaN);
        fields.set(name, own(value.reshape([...grid.shape])));
      }
      return fields.get(name);
    },
  };
}
