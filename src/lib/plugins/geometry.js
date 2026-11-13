import { Delaunay } from "d3";

// These algorithms use only the public transform input and publication contracts.
const pointParameters = { x: { type: "field" }, y: { type: "field" } };

/** Polygon triangle columns: one row per triangle; edge bits mark its outer outline. */
function triangleColumns(corners, edges, array) {
  const count = edges.length,
    columns = {};
  for (let k = 0; k < 3; k++) {
    const values = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      values[2 * i] = corners[6 * i + 2 * k];
      values[2 * i + 1] = corners[6 * i + 2 * k + 1];
    }
    columns[`__corner${k}`] = array(values, { shape: [count, 2] });
  }
  columns.__edges = array(Float32Array.from(edges));
  return columns;
}

/** The rows with a finite x and y: their indices and positions ([n * 2], interleaved). */
async function finitePoints(hostColumn, valid, config) {
  const [xs, ys, visible] = await Promise.all([
    hostColumn(config.x),
    hostColumn(config.y),
    valid.ref.data(),
  ]);
  const rows = [],
    flat = [];
  for (let row = 0; row < xs.length; row++)
    if (visible[row] && Number.isFinite(xs[row]) && Number.isFinite(ys[row])) {
      rows.push(row);
      flat.push(xs[row], ys[row]);
    }
  return { rows, flat: Float64Array.from(flat) };
}
const pointConfig = (kind) => (config) => {
  for (const key of ["x", "y"])
    if (typeof config[key] !== "string" || !config[key])
      throw Error(`${kind} needs ${key}, a column name.`);
};
/** Fan triangles of a convex polygon ([x, y] corners in order), with their outline flags. */
function fan(polygon, corners, edges) {
  const m = polygon.length;
  for (let k = 1; k + 1 < m; k++) {
    for (const p of [polygon[0], polygon[k], polygon[k + 1]])
      corners.push(p[0], p[1]);
    // b-c is always the polygon's edge; a-b only for the first triangle, c-a only for the last.
    edges.push((k === 1 ? 1 : 0) | 2 | (k + 2 === m ? 4 : 0));
  }
  return m - 2;
}

/**
 * Delaunay (TODO 47.6): the triangulation's edges, a row each, from the lower-numbered point:
 * `start` and `end` ([n, 2]), and `source` and `target`, the two points' row numbers among the
 * rows read. Output "newRows" of the first point's row, so an edge carries its columns. On the
 * host (d3-delaunay), per data change.
 */
export const delaunay = {
  reads: "rows",
  output: "newRows",
  parameters: pointParameters,
  async run({ params: config, hostColumn, valid, array }) {
    pointConfig("Delaunay")(config);
    const { rows, flat } = await finitePoints(hostColumn, valid, config);
    const order = [],
      start = [],
      end = [],
      source = [],
      target = [];
    if (rows.length >= 2) {
      const d = new Delaunay(flat),
        { halfedges, triangles } = d;
      const add = (i, j) => {
        order.push(rows[i]);
        source.push(rows[i]);
        target.push(rows[j]);
        start.push(flat[2 * i], flat[2 * i + 1]);
        end.push(flat[2 * j], flat[2 * j + 1]);
      };
      for (let e = 0; e < triangles.length; e++) {
        // Each edge once: from the half-edge whose twin is later (or which has none).
        if (halfedges[e] > e) continue;
        const i = triangles[e],
          j = triangles[e % 3 === 2 ? e - 2 : e + 1];
        add(Math.min(i, j), Math.max(i, j));
      }
      // Collinear points have no triangles: their hull is the path through them.
      if (!triangles.length)
        for (let k = 0; k + 1 < d.hull.length; k++)
          add(
            Math.min(d.hull[k], d.hull[k + 1]),
            Math.max(d.hull[k], d.hull[k + 1]),
          );
    }
    const n = order.length;
    return {
      provenance: { rows: Int32Array.from(order) },
      columns: {
        start: array(Float32Array.from(start), { shape: [n, 2] }),
        end: array(Float32Array.from(end), { shape: [n, 2] }),
        source: array(Float32Array.from(source)),
        target: array(Float32Array.from(target)),
      },
    };
  },
};

/**
 * Voronoi (TODO 47.6): each point's cell, clipped to `extent` ([[x0, y0], [x1, y1]]; default:
 * the points' bounds and a tenth of their size around them), as Polygon's triangle rows (a fan
 * per cell). Output "newRows" of the point's row, so hovering a cell highlights its point.
 */
export const voronoi = {
  reads: "rows",
  output: "newRows",
  parameters: { ...pointParameters, extent: { type: "vector", shape: [2, 2] } },
  async run({ params: config, hostColumn, valid, array }) {
    pointConfig("Voronoi")(config);
    const extent = config.extent;
    if (
      extent !== undefined &&
      !(
        Array.isArray(extent) &&
        extent.length === 2 &&
        extent.every(
          (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
        ) &&
        extent[0][0] < extent[1][0] &&
        extent[0][1] < extent[1][1]
      )
    )
      throw Error(
        "Voronoi extent must be [[x0, y0], [x1, y1]] with x0 < x1 and y0 < y1.",
      );
    const { rows, flat } = await finitePoints(hostColumn, valid, config);
    const order = [],
      corners = [],
      edges = [];
    if (rows.length) {
      let [[x0, y0], [x1, y1]] = config.extent ?? [
        [Infinity, Infinity],
        [-Infinity, -Infinity],
      ];
      if (!config.extent) {
        for (let i = 0; i < rows.length; i++) {
          x0 = Math.min(x0, flat[2 * i]);
          x1 = Math.max(x1, flat[2 * i]);
          y0 = Math.min(y0, flat[2 * i + 1]);
          y1 = Math.max(y1, flat[2 * i + 1]);
        }
        const dx = (x1 - x0) * 0.1 || 1,
          dy = (y1 - y0) * 0.1 || 1;
        [x0, x1, y0, y1] = [x0 - dx, x1 + dx, y0 - dy, y1 + dy];
      }
      const cells = new Delaunay(flat).voronoi([x0, y0, x1, y1]);
      for (let i = 0; i < rows.length; i++) {
        const polygon = cells.cellPolygon(i);
        if (!polygon) continue;
        // d3 closes the ring by repeating its first corner.
        const count = fan(polygon.slice(0, -1), corners, edges);
        for (let t = 0; t < count; t++) order.push(rows[i]);
      }
    }
    return {
      provenance: { rows: Int32Array.from(order) },
      columns: triangleColumns(corners, edges, array),
      geometry: "triangles",
    };
  },
};

/**
 * Hull (TODO 47.6): the convex hull of each group of `by` (all rows without one), as Polygon's
 * triangle rows (a fan per hull). Output "newRows" of the group's first row, so a hull carries
 * the group's columns (fill="species").
 */
export const hull = {
  reads: "rows",
  output: "newRows",
  parameters: pointParameters,
  async run({ params: config, hostColumn, valid, groups, array }) {
    pointConfig("Hull")(config);
    const { rows, flat } = await finitePoints(hostColumn, valid, config);
    const codes = groups ? await groups.codes.ref.data() : null;
    const members = new Map();
    rows.forEach((row, i) => {
      const key = codes ? codes[row] : 0;
      let list = members.get(key);
      if (!list) members.set(key, (list = []));
      list.push(i);
    });
    const order = [],
      corners = [],
      edges = [];
    for (const list of members.values()) {
      if (list.length < 3) continue;
      const points = new Float64Array(list.length * 2);
      list.forEach((i, k) => {
        points[2 * k] = flat[2 * i];
        points[2 * k + 1] = flat[2 * i + 1];
      });
      // d3 closes the ring by repeating its first corner.
      const polygon = new Delaunay(points).hullPolygon()?.slice(0, -1);
      if (!polygon || polygon.length < 3) continue;
      const count = fan(polygon, corners, edges);
      for (let t = 0; t < count; t++) order.push(rows[list[0]]);
    }
    return {
      provenance: { rows: Int32Array.from(order) },
      columns: triangleColumns(corners, edges, array),
      geometry: "triangles",
    };
  },
};

export default {
  name: "hmplot.geometry",
  apiVersion: 1,
  setup(hm) {
    hm.transform("Delaunay", delaunay);
    hm.transform("Voronoi", voronoi);
    hm.transform("Hull", hull);
  },
};
