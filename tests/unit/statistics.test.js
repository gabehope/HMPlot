import { transformHostColumn, transformGeometry } from "../../src/lib/plot/plugins/transformGeometry.js";
import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
// Stage 47: statistics transforms against host references (fits, ECDF).
import test from "node:test";
import * as jax from "@hmplot/jax";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { studentTQuantile } from "../../src/lib/plot/utils/transforms/statistics.js";
import { greater } from "../../src/lib/plot/utils/expressions.js";
import { gridTable } from "../../src/lib/plot/utils/gridTable.js";
import { contours, Delaunay, polygonHull, polygonArea } from "d3";

const values = async (column) => Array.from(await (column.codes ?? column).ref.data(), Number);
const close = (actual, expected, tolerance, label) => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= tolerance * Math.max(1, Math.abs(expected[i])),
    `${label} [${i}]: ${value} vs ${expected[i]}`));
};

/** A float64 least-squares fit of v on powers of u (normal equations), its band at u0. */
function hostFit(u, v, degree, u0, level) {
  const m = degree + 1, n = u.length;
  const X = u.map((t) => Array.from({ length: m }, (_, j) => t ** j));
  const A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)));
  const b = Array.from({ length: m }, (_, i) => X.reduce((s, row, k) => s + row[i] * v[k], 0));
  // Gauss-Jordan inverse.
  const aug = A.map((row, i) => [...row, ...Array.from({ length: m }, (_, j) => (i === j ? 1 : 0))]);
  for (let p = 0; p < m; p++) {
    const pivot = aug[p][p];
    aug[p] = aug[p].map((x) => x / pivot);
    for (let r = 0; r < m; r++) if (r !== p) { const f = aug[r][p]; aug[r] = aug[r].map((x, c) => x - f * aug[p][c]); }
  }
  const inv = aug.map((row) => row.slice(m));
  const beta = inv.map((row) => row.reduce((s, x, j) => s + x * b[j], 0));
  const fitted = X.map((row) => row.reduce((s, x, j) => s + x * beta[j], 0));
  const rss = fitted.reduce((s, f, k) => s + (v[k] - f) ** 2, 0), df = n - m, s2 = rss / df;
  const t = studentTQuantile((1 + level) / 2, df);
  return u0.map((x) => {
    const row = Array.from({ length: m }, (_, j) => x ** j);
    const estimate = row.reduce((s, r, j) => s + r * beta[j], 0);
    const q = row.reduce((s, ri, i) => s + ri * row.reduce((ss, rj, j) => ss + inv[i][j] * rj, 0), 0);
    const half = t * Math.sqrt(s2 * q);
    return [estimate, estimate - half, estimate + half];
  });
}

test("Regression fits linear, poly, log, exp and pow with bands, as a float64 host fit does", async () => {
  const n = 60, x = Array.from({ length: n }, (_, i) => 0.2 + i / 7);
  const noise = (i) => Math.sin(i * 2.7) * 0.3 + Math.cos(i * 1.3) * 0.2;
  const scope = createDataScope();
  scope.update({ x, y: x.map((v, i) => 1 + 0.8 * v - 0.05 * v * v + noise(i)), e: x.map((v, i) => 2 * Math.exp(0.3 * v) * Math.exp(noise(i) * 0.2)) });
  try {
    for (const [method, y, degree, logX, logY] of [["linear", "y", 1], ["poly", "y", 3], ["log", "y", 1, true], ["exp", "e", 1, false, true], ["pow", "e", 1, true, true]]) {
      const out = await runTransform("Regression", scope, { x: "x", y, method, order: degree, samples: 7, band: 0.9 });
      const xs = await values(out.get("x"));
      const u = x.map((v) => (logX ? Math.log(v) : v)), v = scope.hostColumn(y) ? Array.from(scope.hostColumn(y)).map((w) => (logY ? Math.log(w) : w)) : null;
      const host = hostFit(u, v, degree, xs.map((w) => (logX ? Math.log(w) : w)), 0.9).map((row) => row.map((w) => (logY ? Math.exp(w) : w)));
      close(xs, Array.from({ length: 7 }, (_, i) => x[0] + ((x[n - 1] - x[0]) * i) / 6), 1e-5, `${method} x`);
      close(await values(out.get("y")), host.map((r) => r[0]), 2e-4, `${method} y`);
      close(await values(out.get("lower")), host.map((r) => r[1]), 2e-3, `${method} lower`);
      close(await values(out.get("upper")), host.map((r) => r[2]), 2e-3, `${method} upper`);
      const fit = await out.inspect();
      assert.equal(fit.n, n, method);
      out.dispose();
    }
    // The coefficients read back in x's units; a Filter's hidden rows are left out of the fit.
    const line = await runTransform("Regression", scope, { x: "x", y: "y", method: "poly", order: 2 });
    const fit = await line.inspect();
    close(fit.coefficients, [1, 0.8, -0.05], 0.1, "coefficients");
    line.dispose();
    const filtered = await runTransform("Filter", scope, { where: greater("x", 4) });
    const partial = await runTransform("Regression", filtered, { x: "x", y: "y" });
    assert.equal((await partial.inspect()).n, x.filter((v) => v > 4).length);
    assert.ok((await values(partial.get("x")))[0] > 4);
    partial.dispose(); filtered.dispose();
    // band={false}: lower and upper are there, missing (TODO 130.1).
    const bandless = await runTransform("Regression", scope, { x: "x", y: "y", samples: 4, band: false });
    for (const key of ["lower", "upper"]) assert.ok((await values(bandless.get(key))).every(Number.isNaN), key);
    bandless.dispose();
    await assert.rejects(runTransform("Regression", scope, { x: "x", y: "y", method: "loess" }), /method is one of/);
  } finally {
    scope.dispose();
  }
});

test("a Regression band covers the true mean at about its confidence level", async () => {
  // 120 data sets of y = 1 + 2x + noise (a fixed pseudo-random sequence); the 90% band at x = 0.8
  // should hold the true mean in about 90% of them.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gaussian = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  const x = Array.from({ length: 30 }, (_, i) => i / 29);
  let covered = 0;
  const trials = 120;
  for (let t = 0; t < trials; t++) {
    const scope = createDataScope();
    scope.update({ x, y: x.map((v) => 1 + 2 * v + gaussian() * 0.5) });
    const out = await runTransform("Regression", scope, { x: "x", y: "y", samples: 6, band: 0.9 });
    const [lower, upper] = [await values(out.get("lower")), await values(out.get("upper"))];
    if (lower[4] <= 2.6 && 2.6 <= upper[4]) covered++;
    out.dispose(); scope.dispose();
  }
  assert.ok(Math.abs(covered / trials - 0.9) < 0.08, `coverage ${covered}/${trials}`);
});

test("ECDF: the rows in value order per group, ties at their last rank, missing values last", async () => {
  const v = [3, 1, 2, 2, NaN, 5, 1, 4, 2, 7], g = ["a", "b", "a", "a", "a", "b", "b", "a", "b", "b"];
  const scope = createDataScope();
  scope.update({ v, g });
  try {
    const host = (complementary, count) => {
      const rows = v.map((value, i) => ({ value, group: g[i], i })).filter((r) => Number.isFinite(r.value));
      rows.sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : a.value - b.value || a.i - b.i));
      return rows.map((r) => {
        const members = rows.filter((s) => s.group === r.group), below = members.filter((s) => s.value <= r.value).length;
        const measure = count ? below : below / members.length;
        return complementary ? (count ? members.length - below : 1 - measure) : measure;
      });
    };
    for (const [complementary, normalize] of [[false, "fraction"], [true, "count"]]) {
      const out = await runTransform("ECDF", scope, { x: "v", by: "g", complementary, normalize });
      const measured = await values(out.get("ecdf"));
      close(measured.slice(0, 9), host(complementary, normalize === "count"), 1e-6, `ecdf ${complementary} ${normalize}`);
      assert.ok(Number.isNaN(measured[9]));
      assert.deepEqual((await values(out.get("v"))).slice(0, 5), [2, 2, 3, 4, 1]);
      out.dispose();
    }
  } finally {
    scope.dispose();
  }
});

/** A field on a 12 x 9 grid (no value exactly at a level at a grid point). */
function field(nx = 12, ny = 9) {
  const x = Array.from({ length: nx }, (_, j) => j), y = Array.from({ length: ny }, (_, i) => i);
  const v = new Float32Array(nx * ny);
  for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) v[i * nx + j] = Math.sin(j / 2 + 0.3) * Math.cos(i / 3 + 0.2) + 0.1 * j + 0.013;
  return { nx, ny, x, y, v };
}
const triangleArea = (c0, c1, c2, i) => Math.abs((c1[2 * i] - c0[2 * i]) * (c2[2 * i + 1] - c0[2 * i + 1]) - (c2[2 * i] - c0[2 * i]) * (c1[2 * i + 1] - c0[2 * i + 1])) / 2;

test("Contour: lines are d3-contour's segments; bands cover d3's regions within a percent; hidden cells draw nothing", async () => {
  const { nx, ny, x, y, v } = field();
  const scope = createDataScope();
  scope.update(gridTable({ dims: { y, x }, columns: { v } }));
  try {
    const levels = [0, 0.5];
    const lines = await runTransform("Contour", scope, { field: "v", thresholds: levels });
    const [s, e, l] = await Promise.all(["start", "end", "level"].map((k) => values(lines.get(k))));
    const key = (level, p, q) => `${level}:${[p, q].map((pt) => pt.map((w) => w.toFixed(3)).join(",")).sort().join(" ")}`;
    const ours = new Set(l.map((level, i) => key(level, [s[2 * i], s[2 * i + 1]], [e[2 * i], e[2 * i + 1]])));
    // d3 samples at pixel centres (x + 0.5) and closes its rings along the border, outside the grid.
    const theirs = new Set();
    for (const contour of contours().size([nx, ny]).thresholds(levels)(Array.from(v)))
      for (const polygon of contour.coordinates) for (const ring of polygon)
        for (let k = 0; k + 1 < ring.length; k++) {
          const [p, q] = [ring[k], ring[k + 1]].map(([a, b]) => [a - 0.5, b - 0.5]);
          const outside = (pt) => pt[0] < 0 || pt[0] > nx - 1 || pt[1] < 0 || pt[1] > ny - 1;
          if (!outside(p) && !outside(q)) theirs.add(key(contour.value, p, q));
        }
    assert.deepEqual([...ours].sort(), [...theirs].sort());
    assert.equal(lines.columnName("level"), "v");
    assert.equal((await lines.aggregateInfo(0)).kind, "contour");
    assert.equal((await lines.aggregateInfo(0)).level, l[0]);
    lines.dispose();
    // Bands: the area of each band against d3's regions clipped to the grid (region k minus region k + 1).
    const bands = await runTransform("Contour", scope, { field: "v", thresholds: levels, mode: "bands" });
    const [c0, c1, c2, band] = await Promise.all(["__corner0", "__corner1", "__corner2", "band"].map((k) => values(bands.get(k))));
    const area = [0, 0];
    band.forEach((b, i) => { area[b] += triangleArea(c0, c1, c2, i); });
    const clip = (ring) => {
      let out = ring.map(([a, b]) => [a - 0.5, b - 0.5]);
      for (const [axis, bound, above] of [[0, 0, true], [0, nx - 1, false], [1, 0, true], [1, ny - 1, false]]) {
        const inside = (pt) => (above ? pt[axis] >= bound : pt[axis] <= bound), next = [];
        out.forEach((a, k) => {
          const b = out[(k + 1) % out.length];
          if (inside(a)) next.push(a);
          if (inside(a) !== inside(b)) { const t = (bound - a[axis]) / (b[axis] - a[axis]); next.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
        });
        out = next;
      }
      return out;
    };
    const region = contours().size([nx, ny]).thresholds(levels)(Array.from(v)).map((contour) => contour.coordinates.reduce((sum, polygon) =>
      sum + polygon.reduce((acc, ring, r) => acc + (r ? -1 : 1) * Math.abs(polygonArea(clip(ring.slice(0, -1)))), 0), 0));
    close(area, [region[0] - region[1], region[1]], 0.01, "band areas");
    bands.dispose();
    // A Filter's hidden cells: no line through them.
    const kept = await runTransform("Filter", scope, { where: greater("x", 5) });
    const part = await runTransform("Contour", kept, { field: "v", thresholds: levels });
    assert.ok((await values(part.get("start"))).every((w, i) => i % 2 || w >= 6 - 1e-6));
    part.dispose(); kept.dispose();
  } finally {
    scope.dispose();
  }
});

test("Contour bands flag level boundaries without internal cell or fan edges", async () => {
  const scope = createDataScope();
  scope.update(gridTable({dims:{y:[0,1,2],x:[0,1,2]},columns:{v:[0,1,2,0,1,2,0,1,2]}}));
  const bands = await runTransform("Contour",scope,{field:"v",thresholds:[0,0.5,1.5],mode:"bands"});
  try {
    const [a,b,c,edges] = await Promise.all(["__corner0","__corner1","__corner2","__edges"].map(k=>values(bands.get(k))));
    let count = 0;
    edges.forEach((flags,i)=>{
      const corners = [a,b,c];
      for(let k=0;k<3;k++) if(Math.floor(flags/2**k)%2) {
        const x = corners[k][2*i], end = corners[(k+1)%3][2*i];
        assert.ok(Math.abs(x-end)<1e-6,"only vertical level boundaries, no fan diagonals or cell edges");
        assert.ok([0,0.5,1.5,2].some(level=>Math.abs(level-x)<1e-6),"edge lies on a contour level or final band maximum");
        count++;
      }
    });
    assert.ok(count>0,"enabled boundaries exist");
  } finally { bands.dispose(); scope.dispose(); }
});

test("Delaunay, Voronoi and Hull match d3-delaunay, each output row keeping its point's row", async () => {
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 40, xs = Array.from({ length: n }, random), ys = Array.from({ length: n }, random), g = xs.map((_, i) => ["a", "b"][i % 2]);
  const scope = createDataScope();
  scope.update({ x: xs, y: ys, g, id: xs.map((_, i) => i) });
  try {
    const d = new Delaunay(Float64Array.from(xs.flatMap((x, i) => [x, ys[i]])));
    const expected = new Set();
    for (let e = 0; e < d.triangles.length; e++) {
      const i = d.triangles[e], j = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
      expected.add(`${Math.min(i, j)}-${Math.max(i, j)}`);
    }
    const edges = await runTransform("Delaunay", scope, { x: "x", y: "y" });
    const [source, target, id] = await Promise.all(["source", "target", "id"].map((k) => values(edges.get(k))));
    assert.deepEqual(new Set(source.map((s, i) => `${s}-${target[i]}`)), expected);
    assert.deepEqual(id, source, "an edge carries its first point's row");
    edges.dispose();
    const cells = await runTransform("Voronoi", scope, { x: "x", y: "y", extent: [[0, 0], [1, 1]] });
    const [c0, c1, c2, owner] = await Promise.all(["__corner0", "__corner1", "__corner2", "id"].map((k) => values(cells.get(k))));
    const byPoint = new Map();
    owner.forEach((row, i) => byPoint.set(row, (byPoint.get(row) ?? 0) + triangleArea(c0, c1, c2, i)));
    const voronoi = d.voronoi([0, 0, 1, 1]);
    for (let i = 0; i < n; i++) close([byPoint.get(i)], [Math.abs(polygonArea(voronoi.cellPolygon(i)))], 1e-4, `cell ${i}`);
    cells.dispose();
    const hulls = await runTransform("Hull", scope, { x: "x", y: "y", by: "g" });
    const [h0, h1, h2, group] = await Promise.all(["__corner0", "__corner1", "__corner2", "g"].map((k) => values(hulls.get(k))));
    const byGroup = [0, 0];
    group.forEach((code, i) => { byGroup[code] += triangleArea(h0, h1, h2, i); });
    const expectedHull = ["a", "b"].map((name) => Math.abs(polygonArea(polygonHull(xs.map((x, i) => [x, ys[i]]).filter((_, i) => g[i] === name)))));
    close(byGroup, expectedHull, 1e-4, "hull areas");
    hulls.dispose();
  } finally {
    scope.dispose();
  }
});

test("Polygon's vertex rows triangulate to their polygon's area, outlining only its own edges", async () => {
  // An L of six vertices and a triangle; a row without a finite x is left out.
  const L = [[0, 0], [2, 0], [2, 0.5], [0.5, 0.5], [0.5, 2], [0, 2]], T = [[3, 0], [4, 0], [3, 1]];
  const rows = [...L.map(([x, y]) => ({ x, y, s: "L" })), ...T.map(([x, y]) => ({ x, y, s: "T" })), { x: NaN, y: 1, s: "T" }];
  const scope = createDataScope();
  scope.update({ x: rows.map((r) => r.x), y: rows.map((r) => r.y), s: rows.map((r) => r.s) });
  try {
    const out = await runTransform("Triangulate", scope, { x: "x", y: "y", series: "s" });
    const [c0, c1, c2, edges, series] = await Promise.all(["__corner0", "__corner1", "__corner2", "__edges", "s"].map((k) => values(out.get(k))));
    const area = { 0: 0, 1: 0 }, outlined = { 0: 0, 1: 0 };
    series.forEach((code, i) => {
      area[code] += triangleArea(c0, c1, c2, i);
      outlined[code] += [0, 1, 2].filter((k) => Math.floor(edges[i] / 2 ** k) % 2).length;
    });
    close([area[0], area[1]], [1.75, 0.5], 1e-6, "areas");
    assert.deepEqual([outlined[0], outlined[1]], [6, 3], "each ring's edges, once");
    out.dispose();
  } finally {
    scope.dispose();
  }
});


test("plugin host columns preserve authored precision and triangle outputs validate their shape", async () => {
  const scope = createDataScope();
  const x = Float64Array.of(1e10, 1e10 + 1, 1e10 + 2);
  scope.update({ x, y: [0, 1, 0] });
  try {
    const host = await transformHostColumn("Geometry", scope, "x");
    assert.deepEqual(host, x);
    host[0] = 0;
    assert.equal(x[0], 1e10, "the plugin cannot mutate the authored table");
    const triangles = {
      __corner0: [[0, 0]], __corner1: [[1, 0]], __corner2: [[0, 1]], __edges: [7],
    };
    assert.deepEqual(transformGeometry("Geometry", "triangles", triangles, 1), { triangles: true });
    assert.throws(() => transformGeometry("Geometry", "triangles", { ...triangles, __corner2: [0, 1] }, 1), /Geometry: triangle geometry needs __corner2/);
    assert.throws(() => transformGeometry("Geometry", "mesh", triangles, 1), /geometry must be "triangles"/);
  } finally {
    scope.dispose();
  }
});

test("geometry plugins publish empty triangle and edge tables for insufficient points", async () => {
  const scope = createDataScope();
  try {
    for (const count of [0, 1]) {
      scope.update({ x: new Float32Array(count), y: new Float32Array(count) }, { x: "numeric", y: "numeric" });
      for (const kind of ["Delaunay", "Hull", ...(count ? [] : ["Voronoi"])]) {
        const view = await runTransform(kind, scope, { x: "x", y: "y" });
        try {
          assert.equal(view.length, 0, `${kind} with ${count} points`);
          assert.deepEqual(view.get(kind === "Delaunay" ? "start" : "__corner0").shape, [0, 2]);
        } finally {
          view.dispose();
        }
      }
    }
  } finally {
    scope.dispose();
  }
});

test("Contour rejects excessive geometry before allocating output rows and validates grid axes", async () => {
  const scope = createDataScope();
  scope.update(gridTable({ dims: { y: [0, 1], x: [0, 1] }, columns: { v: [0, 1, 1, 0] } }));
  try {
    await assert.rejects(runTransform("Contour", scope, { field: "v", thresholds: Array.from({ length: 20 }, (_, i) => (i + 1) / 21) }, { maxBytes: 128 }), /storage-buffer limit/);
    await assert.rejects(runTransform("Contour", scope, { field: "v", x: "missing" }), /Contour:.*grid dimension/);
    await assert.rejects(runTransform("Contour", scope, { field: "v", x: "x", y: "x" }), /different x and y/);
    for (const mode of ["lines", "bands"]) {
      const empty = await runTransform("Contour", scope, { field: "v", thresholds: [2], mode });
      assert.equal(empty.length, 0);
      empty.dispose();
    }
  } finally { scope.dispose(); }
});

test("Regression's cached padded fields refresh after a same-length source update", async () => {
  const { disposeTransformCache } = await import("../../src/lib/plot/utils/transforms.js");
  const x = Float32Array.of(0,1,2), y = Float32Array.of(0,2,4);
  const scope = createDataScope(), cache = {};
  scope.update({x,y});
  try {
    const first = await runTransform("Regression",scope,{x:"x",y:"y",samples:2,band:false},{cache});
    close(await values(first.get("y")),[0,4],1e-5,"before source update"); first.dispose();
    y[1]=3; y[2]=6; scope.update({x,y:Float32Array.from(y)});
    const next = await runTransform("Regression",scope,{x:"x",y:"y",samples:2,band:false},{cache});
    close(await values(next.get("y")),[0,6],1e-5,"after source update"); next.dispose();
  } finally {disposeTransformCache(cache);scope.dispose();}
});
