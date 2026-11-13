import earcut from "earcut3";
import { transformHostColumn } from "../../plugins/transformGeometry.js";
import { deviceArray } from "../deviceParams.js";
import { inputGroups } from "./common.js";

/**
 * Geometry on the host (TODO 47.4, 47.6): the triangles Polygon draws. Their outputs share one
 * form, triangle rows: `__corner0`, `__corner1` and `__corner2` ([n, 2]: a triangle's corners in
 * data units) and `__edges` (which of its edges, a-b, b-c and c-a as bits 0 to 2, are its
 * polygon's own, where an outline is drawn). Their views say `triangles: true`, so a Polygon
 * inside draws them as they are.
 */
/** Triangle rows from host triangles ({ corners: Float64Array [t * 6], edges: [t] }). */
export function triangleColumns({ corners, edges }, own) {
  const t = edges.length, columns = {};
  for (let k = 0; k < 3; k++) {
    const corner = new Float32Array(t * 2);
    for (let i = 0; i < t; i++) {
      corner[2 * i] = corners[6 * i + 2 * k];
      corner[2 * i + 1] = corners[6 * i + 2 * k + 1];
    }
    columns[`__corner${k}`] = own(deviceArray(corner).reshape([t, 2]));
  }
  columns.__edges = own(deviceArray(Float32Array.from(edges)));
  return columns;
}

/**
 * Triangulate (internal, Polygon's vertex rows): each group of `series` (all rows without one)
 * is a polygon, its rows its vertices in order; earcut triangulates it on the host. Output
 * "newRows": a row per triangle, the polygon's first row repeated, so each triangle carries its
 * polygon's columns and identity (hovering one highlights the whole polygon). Rows without a
 * finite x and y are left out. Its visible rows only: a hidden vertex leaves its polygon out.
 */
export const triangulate = {
  reads: "compacted",
  output: "newRows",
  repeatsRows: true,
  validate(config) {
    for (const key of ["x", "y"])
      if (typeof config[key] !== "string" || !config[key]) throw Error(`Polygon needs ${key}, a column name.`);
  },
  async run(input, config, { own, cache, cleanup }) {
    const scope = input.scope, n = input.length;
    const [xs, ys] = await Promise.all([transformHostColumn("Polygon", scope, config.x), transformHostColumn("Polygon", scope, config.y)]);
    let codes = null;
    if (config.series !== undefined && n) {
      const groups = await inputGroups(cache, input, config.series);
      cleanup(() => groups.dispose());
      codes = Int32Array.from(await groups.codes.ref.data());
    }
    // The polygons' rows, in the order their series first appear.
    const polygons = new Map();
    for (let row = 0; row < n; row++) {
      if (!Number.isFinite(xs[row]) || !Number.isFinite(ys[row])) continue;
      const key = codes ? codes[row] : 0;
      let rows = polygons.get(key);
      if (!rows) polygons.set(key, (rows = []));
      rows.push(row);
    }
    const order = [], corners = [], edges = [];
    for (const rows of polygons.values()) {
      if (rows.length < 3) continue;
      const flat = new Float64Array(rows.length * 2);
      rows.forEach((row, i) => { flat[2 * i] = xs[row]; flat[2 * i + 1] = ys[row]; });
      const triangles = earcut(flat), m = rows.length;
      // An edge is the polygon's own when its corners are neighbors around the ring.
      const outer = (i, j) => (Math.abs(i - j) === 1 || Math.abs(i - j) === m - 1 ? 1 : 0);
      // Zero-area triangles (collinear vertices) cover nothing, but their outline would draw.
      let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      for (let v = 0; v < m; v++) for (const d of [0, 1]) { lo[d] = Math.min(lo[d], flat[2 * v + d]); hi[d] = Math.max(hi[d], flat[2 * v + d]); }
      const tiny = 1e-9 * (hi[0] - lo[0]) * (hi[1] - lo[1]);
      for (let t = 0; t < triangles.length; t += 3) {
        const [i, j, k] = [triangles[t], triangles[t + 1], triangles[t + 2]];
        const area = (flat[2 * j] - flat[2 * i]) * (flat[2 * k + 1] - flat[2 * i + 1]) - (flat[2 * k] - flat[2 * i]) * (flat[2 * j + 1] - flat[2 * i + 1]);
        if (Math.abs(area) <= tiny) continue;
        order.push(rows[0]);
        for (const v of [i, j, k]) corners.push(flat[2 * v], flat[2 * v + 1]);
        edges.push(outer(i, j) | (outer(j, k) << 1) | (outer(k, i) << 2));
      }
    }
    return {
      order: own(deviceArray(Int32Array.from(order), { dtype: "int32" })),
      columns: triangleColumns({ corners: Float64Array.from(corners), edges }, own),
      view: { triangles: true },
    };
  },
};
