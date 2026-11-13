import test from "node:test";
import { Array as JaxArray } from "@hmplot/jax";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
const interpolateGrid = (scope, config, options) => runTransform("Interpolate", scope, config, options);
import { gridAxisBounds } from "../../src/lib/plot/utils/gridModel.js";
async function sample(data, config) {
  const scope = createDataScope();
  scope.update(data);
  try {
    const view = await interpolateGrid(scope, config);
    try {
      return {
        grid: view.grid,
        info: view.gridInfo,
        columns: Object.fromEntries(
          await Promise.all(
            view
              .keys()
              .map(async (k) => [
                k,
                Array.from(await (view.get(k).codes ?? view.get(k)).ref.data()),
              ]),
          ),
        ),
      };
    } finally {
      view.dispose();
    }
  } finally {
    scope.dispose();
  }
}
const near = (a, b) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-5, `${v} != ${b[i]}`));
test("linear grid combines exact duplicate samples and records endpoint coordinates", async () => {
  const r = await sample(
    { x: [0, 1, 1, 2], v: [0, 1, 3, 4] },
    { x: "x", values: ["v"], resolution: 5 },
  );
  near(r.columns.v, [0, 1, 2, 3, 4]);
  near(r.columns.x, [0, 0.5, 1, 1.5, 2]);
});
test("bilinear grid uses cell centers and preserves edge bounds and orientation", async () => {
  const r = await sample(
    { x: [0, 1, 0, 1], y: [0, 0, 1, 1], v: [0, 1, 2, 3] },
    { x: "x", y: "y", values: ["v"], resolution: [2, 2] },
  );
  near(r.columns.v, [0.75, 1.25, 1.75, 2.25]);
  assert.equal(r.info.method, "bilinear");
  // A grid table (TODO 51): y then x, the cells' centres tiling the bounds.
  assert.deepEqual(gridAxisBounds(r.grid), { x: [0, 1], y: [0, 1] });
  assert.deepEqual(r.grid.dims.map((dim) => [dim.name, Array.from(dim.coords)]), [["y", [0.25, 0.75]], ["x", [0.25, 0.75]]]);
});
test("IDW agrees with independent inverse-square reference", async () => {
  const r = await sample(
    { x: [0, 1, 0], y: [0, 0, 1], v: [1, 2, 4] },
    { x: "x", y: "y", values: ["v"], resolution: [2, 2], method: "idw" },
  );
  const reference = r.columns.x.map((x, i) => {
    const y = r.columns.y[i],
      w = [
        [0, 0],
        [1, 0],
        [0, 1],
      ].map(([a, b]) => 1 / ((x - a) ** 2 + (y - b) ** 2));
    return (
      w.reduce((s, v, j) => s + v * [1, 2, 4][j], 0) / w.reduce((a, b) => a + b)
    );
  });
  near(r.columns.v, reference);
});
test("categories use nearest valid endpoint with stable ties", async () => {
  const r = await sample(
    { x: [0, 1, 2], v: ["A", null, "B"] },
    { x: "x", values: ["v"], resolution: 3 },
  );
  assert.deepEqual(r.columns.v, [0, 0, 1]);
});
test("regular interpolation does not extrapolate and rejects incompatible methods", async () => {
  const r = await sample(
    { x: [0, 1], v: [0, 2] },
    { x: "x", values: ["v"], resolution: 4, bounds: { x: [-1, 2] } },
  );
  assert.ok(Number.isNaN(r.columns.v[0]));
  assert.ok(Number.isNaN(r.columns.v[3]));
  await assert.rejects(
    sample(
      { x: [0, 1], v: [0, 2] },
      { x: "x", values: ["v"], method: "bilinear" },
    ),
    /incompatible/,
  );
});

test("fixed spatial Slice reuses Interpolate neighbors and weights while values change", async () => {
  const interpolateSlice = (scope, config, options) => runTransform("Slice", scope, config, options);
  const source = createDataScope();
  source.update({
    x: [0, 1, 0, 1, 0, 1, 0, 1],
    y: [0, 0, 1, 1, 0, 0, 1, 1],
    time: [0, 0, 0, 0, 1, 1, 1, 1],
    v: [0, 1, 2, 3, 10, 11, 12, 13],
  });
  const sliceCache = {},
    gridCache = {};
  let a, b, ga, gb;
  try {
    a = await interpolateSlice(
      source,
      { field: "time", by: ["x", "y"], at: 0 },
      { cache: sliceCache },
    );
    ga = await interpolateGrid(
      a,
      { x: "x", y: "y", values: ["v"], resolution: [2, 2] },
      { cache: gridCache },
    );
    const old = gridCache.grid;
    b = await interpolateSlice(
      source,
      { field: "time", by: ["x", "y"], at: 0.5 },
      { cache: sliceCache },
    );
    gb = await interpolateGrid(
      b,
      { x: "x", y: "y", values: ["v"], resolution: [2, 2] },
      { cache: gridCache },
    );
    assert.equal(gb.gridInfo.geometryReused, true);
    assert.equal(gridCache.grid, old);
    near(Array.from(await gb.get("v").ref.data()), [5.75, 6.25, 6.75, 7.25]);
  } finally {
    ga?.dispose();
    gb?.dispose();
    a?.dispose();
    b?.dispose();
    gridCache.grid?.dispose();
    sliceCache.slice?.dispose();
    source.dispose();
  }
});

test("invalid coordinate pairs do not expand inferred grid bounds", async () => {
  const r = await sample(
    { x: [0, 1, 0, 1, 100], y: [0, 0, 1, 1, NaN], v: [0, 1, 2, 3, 100] },
    { x: "x", y: "y", values: ["v"], resolution: [2, 2], method: "idw" },
  );
  assert.deepEqual(gridAxisBounds(r.grid), { x: [0, 1], y: [0, 1] });
});

test("cached interpolation agrees with a fresh search after values become missing", async () => {
  for (const method of ["linear", "nearest", "idw"]) {
    for (const categorical of [false, true]) {
      const source = createDataScope();
      const x = [0, 1, 2];
      const config = { x: "x", values: ["v"], resolution: 7, method };
      const cache = {};
      let first, cached, fresh;
      try {
        source.update({ x, v: categorical ? ["a", "b", "c"] : [0, 10, 20] });
        first = await interpolateGrid(source, config, { cache });
        first.dispose();
        first = null;
        source.update({ x, v: categorical ? ["a", null, "c"] : [0, NaN, 20] });
        cached = await interpolateGrid(source, config, { cache });
        fresh = await interpolateGrid(source, config);
        const read = async (view) => {
          const column = view.get("v");
          return {
            values: Array.from(await (column.codes ?? column).ref.data()),
            categories: column.categories,
          };
        };
        assert.deepEqual(await read(cached), await read(fresh));
      } finally {
        first?.dispose();
        cached?.dispose();
        fresh?.dispose();
        cache.grid?.dispose();
        source.dispose();
      }
    }
  }
});

// TODO 51: grid tables. A grid table is a long table of every combination of its dimensions'
// coordinates (C order); grid-aware nodes read its model. Each check compares against the same
// rows as a plain table (the coordinates materialized on the host).
import { gridTable } from "../../src/lib/plot/utils/gridTable.js";
import { normalizeGrid, remapTable, cellAt, dropDimension, rotationOf, evenlySpaced, descriptorCodes, coordinateDescriptor, drawnDims } from "../../src/lib/plot/utils/gridModel.js";

import { keyCodes } from "../../src/lib/plot/utils/partition.js";
import { createJoinTable } from "../../src/lib/plot/utils/tableJoin.js";
import { add, multiply, subtract, mean } from "../../src/lib/plot/utils/expressions.js";

const values = async (column) => {
  const source = column?.codes ?? column;
  return Array.from(source instanceof JaxArray ? await source.ref.data() : source, Number);
};
/** A grid table and the same rows as a plain table, coordinates as host columns (C order). */
function tables(dims, columns) {
  const names = Object.keys(dims), sizes = names.map((name) => dims[name].length), n = sizes.reduce((a, b) => a * b, 1);
  const plain = { ...columns };
  names.forEach((name, k) => {
    const stride = sizes.slice(k + 1).reduce((a, b) => a * b, 1);
    plain[name] = Array.from({ length: n }, (_, row) => dims[name][Math.floor(row / stride) % sizes[k]]);
  });
  const grid = createDataScope(), long = createDataScope();
  grid.update(gridTable({ dims, columns }));
  long.update(plain);
  return { grid, long, plain, n, dispose: () => { grid.dispose(); long.dispose(); } };
}

test("the grid model: checks, C-order strides, edges, remap tables, cells, rotations and slicing", () => {
  const grid = normalizeGrid({ dims: [{ name: "time", coords: [0, 1] }, { name: "lat", coords: [60, 0, -60] }, { name: "lon", coords: [0, 10, 30] }] }, 18);
  assert.deepEqual(grid.dims.map((d) => [d.name, d.size, d.stride]), [["time", 2, 9], ["lat", 3, 3], ["lon", 3, 1]]);
  assert.deepEqual(Array.from(grid.dims[1].edges), [90, 30, -30, -90]);
  assert.deepEqual(Array.from(grid.dims[2].edges), [-5, 5, 20, 40]);
  assert.equal(evenlySpaced(grid.dims[2]), false);
  assert.equal(evenlySpaced(normalizeGrid({ dims: [{ name: "x", coords: [1, 2, 3] }] }).dims[0]), true);
  assert.throws(() => normalizeGrid({ dims: [{ name: "x", coords: [0, 1] }] }, 3), /has 2 rows; the table has 3/);
  assert.throws(() => normalizeGrid({ dims: [{ name: "x", coords: [0, 2, 1] }] }), /strictly increasing or decreasing/);
  assert.throws(() => normalizeGrid({ dims: [{ name: "x", coords: [0, 1] }, { name: "x", coords: [0] }] }), /listed twice/);
  // A position between two centres blends them; the outer half cells take the end cell;
  // descending coordinates give decreasing indices.
  assert.deepEqual(Array.from(remapTable(grid.dims[2], -5, 40, 9)), [0, 0.25, 0.75, 1.125, 1.375, 1.625, 1.875, 2, 2]);
  assert.deepEqual(Array.from(remapTable(grid.dims[1], -90, 90, 4)), [2, 1.375, 0.625, 0]);
  assert.deepEqual([cellAt(grid.dims[2], 4), cellAt(grid.dims[2], 5), cellAt(grid.dims[2], 40), cellAt(grid.dims[2], 41)], [0, 1, 2, -1]);
  assert.deepEqual([cellAt(grid.dims[1], 80), cellAt(grid.dims[1], -31)], [0, 2]);
  // A longitude wrapped once is a rotation; its cells are bounded in sorted order.
  assert.equal(rotationOf([0, 90, 180, -90]), 3);
  assert.equal(rotationOf([0, 90, -90, 45]), -1);
  const rotated = normalizeGrid({ dims: [{ name: "lon", coords: [0, 90, 180, -90], rotation: 3 }] });
  assert.deepEqual([cellAt(rotated.dims[0], -80), cellAt(rotated.dims[0], 100)], [3, 1]);
  // Slicing drops a dimension; the rest keep their coordinates and new strides.
  const sliced = dropDimension(grid, "lat");
  assert.deepEqual(sliced.dims.map((d) => [d.name, d.stride]), [["time", 3], ["lon", 1]]);
  // Keys by index code the same rows as the coordinates' own values do.
  const lat = coordinateDescriptor(grid, "lat");
  assert.deepEqual(descriptorCodes(lat, undefined, 18).order, [60, 0, -60]);
  assert.deepEqual(Array.from(descriptorCodes(lat, [0, 3, 6, -1]).codes), [0, 1, 2, 3]);
  assert.deepEqual(descriptorCodes(lat, [0, 1]).order, [60]);
  // A dimension of one coordinate (a month selected from a series) is drawn as if sliced.
  const month = normalizeGrid({ dims: [{ name: "lat", coords: [0, 1] }, { name: "lon", coords: [0, 1, 2] }, { name: "time", coords: [5] }] });
  assert.deepEqual(drawnDims(month), { rows: 0, columns: 1, curvilinear: false, x: "lon", y: "lat" });
});

test("grid tables: coordinates computed when read equal the plain table's, keys by index and joins agree", async () => {
  const times = [new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z")];
  const t = tables({ time: times, lat: [30, 0, -30], lon: [0, 90] }, { tas: Float32Array.from({ length: 12 }, (_, i) => i * 1.5) });
  try {
    assert.deepEqual(t.grid.keys(), ["tas", "time", "lat", "lon"]);
    assert.equal(t.grid.length, 12);
    for (const name of ["lat", "lon", "tas"]) assert.deepEqual(await values(t.grid.get(name)), await values(t.long.get(name)), name);
    // A datetime coordinate counts from its first time, as a datetime column does.
    assert.equal(t.grid.metadata("time").type, "datetime");
    assert.deepEqual(await values(t.grid.get("time")), [0, 0, 0, 0, 0, 0, 864e5, 864e5, 864e5, 864e5, 864e5, 864e5]);
    for (const name of ["time", "lat", "lon"]) {
      const [a, b] = await Promise.all([keyCodes(t.grid, name), keyCodes(t.long, name)]);
      assert.deepEqual([a.order, Array.from(a.codes)], [b.order, Array.from(b.codes)], name);
    }
    // A Join on a coordinate: each row's joined value by index, as on the plain table.
    const joined = createJoinTable(), right = { lat: [-30, 0, 30], band: ["south", "equator", "north"] };
    const [a, b] = await Promise.all([t.grid, t.long].map((scope) => runTransform("Join", scope, { data: joined.table(right), on: "lat" })));
    assert.deepEqual(await values(a.get("band")), await values(b.get("band")));
    assert.ok(a.grid, "a Join keeps the rows, and the grid");
    a.dispose(); b.dispose();
  } finally {
    t.dispose();
  }
});

test("a Python grid table (TODO 48.6) decodes to gridTable()'s grid: host coordinates, time edges on their origin, labels", async () => {
  const { SceneResources } = await import("../../src/lib/scene/resources.js");
  const us = (iso) => BigInt(Date.parse(iso)) * 1000n;
  const payloads = {
    "c-time": new BigInt64Array([us("2026-01-01T00:00:00Z"), us("2026-01-02T00:00:00Z")]),
    "c-time-edges": new BigInt64Array(["2025-12-31T12:00:00Z", "2026-01-01T12:00:00Z", "2026-01-02T12:00:00Z"].map(us)),
    "c-lat": new Float32Array([30, 0, -30]),
    "c-model": new Int32Array([0, 1]),
  };
  const time = { dtype: "int64", byte_order: "little", logical_type: "datetime", unit: "us", timezone: "UTC" };
  const columns = {
    "c-time": { id: "c-time", shape: [2], ...time }, "c-time-edges": { id: "c-time-edges", shape: [3], ...time },
    "c-lat": { id: "c-lat", shape: [3], dtype: "float32", byte_order: "little", logical_type: "numeric", label: "latitude (degrees_north)" },
    "c-model": { id: "c-model", shape: [2], dtype: "int32", byte_order: "little", logical_type: "categorical", categories: ["b", "a"] },
    "c-tas": { id: "c-tas", shape: [12], dtype: "float32", byte_order: "little", logical_type: "numeric" },
  };
  const resources = new SceneResources();
  // The variable is already held (nothing uploads in Node); the coordinates load on the host.
  resources.columns.set("c-tas", { __hmplotColumn: true, values: Float32Array.from({ length: 12 }, (_, i) => i),
    metadata: { type: "numeric", label: "Near-surface air temperature (K)" } });
  const grid = { dims: [{ name: "time", coords: { $column: "c-time" }, edges: { $column: "c-time-edges" } },
    { name: "lat", coords: { $column: "c-lat" } }, { name: "model", coords: { $column: "c-model" } }] };
  const state = { columns, tables: { t: { version: 1, key: null, columns: { tas: { $column: "c-tas" } }, grid } },
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {} };
  resources.commit(await resources.prepare(state, async (id) => new Uint8Array(payloads[id].buffer)));
  const scope = createDataScope(), reference = createDataScope();
  scope.update(resources.tables.get("t").value);
  reference.update(gridTable({ dims: { time: [new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z")],
    lat: [30, 0, -30], model: ["b", "a"] }, columns: { tas: Float32Array.from({ length: 12 }, (_, i) => i) } }));
  try {
    assert.deepEqual(scope.grid.shape, [2, 3, 2]);
    const [t, lat, model] = scope.grid.dims;
    assert.equal(t.metadata.origin, Date.parse("2026-01-01T00:00:00Z"));
    assert.deepEqual(Array.from(t.edges), [-432e5, 432e5, 1296e5]);
    assert.deepEqual(Array.from(lat.edges), [45, 15, -15, -45]);
    assert.deepEqual([...model.coords], ["b", "a"]);
    for (const name of ["time", "lat", "model", "tas"])
      assert.deepEqual(await values(scope.get(name)), await values(reference.get(name)), name);
    // Display names from the labels (axis titles, legends, tooltips), else the key.
    assert.deepEqual(["tas", "lat", "model"].map((name) => scope.columnName(name)),
      ["Near-surface air temperature (K)", "latitude (degrees_north)", "model"]);
  } finally {
    scope.dispose(); reference.dispose(); resources.dispose();
  }
});

test("views keep or drop the grid: a Filter's padded form keeps it, Group and Sort drop it", async () => {
  const t = tables({ lat: [0, 10], lon: [0, 10, 20] }, { tas: [1, 2, 3, 4, 5, 6] });
  try {
    const filtered = await runTransform("Filter", t.grid, { where: { field: "tas", op: "gt", value: 2.5 } });
    assert.equal(filtered.grid, undefined, "the compacted rows are a plain table");
    assert.equal(filtered.padded().grid, t.grid.grid);
    const calculated = await runTransform("Calculate", filtered, { columns: { anomaly: subtract("tas", mean("tas")) } });
    assert.equal(calculated.padded().grid, t.grid.grid, "a Calculate over it keeps the padded grid");
    const sorted = await runTransform("Sort", t.grid, { by: "tas", order: "desc" });
    const grouped = await runTransform("Group", t.grid, { by: "lat", columns: { tas: mean("tas") } });
    assert.equal(sorted.grid, undefined);
    assert.equal(grouped.grid, undefined);
    [filtered, calculated, sorted, grouped].forEach((view) => view.dispose());
  } finally {
    t.dispose();
  }
});

test("Calculate keeps, rewrites or drops the grid per column, and computes what the plain table does", async () => {
  const t = tables({ lat: [-60, 0, 60], lon: [0, 120, 240] }, { tas: Float32Array.from({ length: 9 }, (_, i) => 280 + i) });
  const warnings = [], warn = console.warn;
  console.warn = (message) => warnings.push(message);
  const run = async (columns) => {
    const [a, b] = await Promise.all([t.grid, t.long].map((scope) => runTransform("Calculate", scope, { columns })));
    for (const name of Object.keys(columns)) assert.deepEqual(await values(a.get(name)), await values(b.get(name)), name);
    return { view: a, dispose: () => { a.dispose(); b.dispose(); } };
  };
  try {
    // A new column is a field: the grid is kept.
    let r = await run({ celsius: subtract("tas", 273.15) });
    assert.equal(r.view.grid, t.grid.grid);
    r.dispose();
    // A reduction by grid dimensions reduces over the others, however many groups there are.
    const anomaly = await runTransform("Calculate", t.grid, { columns: { anomaly: subtract("tas", mean("tas", { by: "lon" })) } });
    const tas = await values(t.grid.get("tas"));
    assert.deepEqual((await values(anomaly.get("anomaly"))).map((v) => +v.toFixed(3)),
      tas.map((v, row) => +(v - (tas[row % 3] + tas[3 + row % 3] + tas[6 + row % 3]) / 3).toFixed(3)));
    assert.equal(anomaly.grid, t.grid.grid);
    anomaly.dispose();
    // A coordinate from itself: the new coordinates replace the dimension's.
    r = await run({ lat: multiply("lat", 2) });
    assert.deepEqual(Array.from(r.view.grid.dims[0].coords), [-120, 0, 120]);
    r.dispose();
    // Wrapped once (0, 120, 240 to 0, 120, -120): a rotation, recorded.
    r = await run({ lon: subtract("lon", multiply(360, { __hmplotExpression: true, op: "greater", args: ["lon", 180] })) });
    assert.deepEqual([Array.from(r.view.grid.dims[1].coords), r.view.grid.dims[1].rotation], [[0, 120, -120], 2]);
    r.dispose();
    // A coordinate from two coordinates: curvilinear positions over those dimensions.
    r = await run({ lon: add("lon", "lat") });
    assert.deepEqual(r.view.grid.coords2d.dims, [0, 1]);
    assert.deepEqual(await values(r.view.grid.coords2d.columns.lon), [-60, 60, 180, 0, 120, 240, 60, 180, 300]);
    r.dispose();
    // A coordinate from a variable: the grid is dropped, once, naming the column.
    r = await run({ lat: add("lat", "tas") });
    assert.equal(r.view.grid, undefined);
    assert.match(r.view.gridDropped, /lat now depends on tas/);
    r.dispose();
    assert.equal(warnings.filter((message) => /lat now depends on tas/.test(message)).length, 1);
  } finally {
    console.warn = warn;
    t.dispose();
  }
});

test("Slice's grid path equals its general path: between steps, outer and inner dimensions, outside, and a padded input", async () => {
  const t = tables({ time: [0, 10, 20], lat: [10, 0, -10], lon: [0, 90] }, { tas: Float32Array.from({ length: 18 }, (_, i) => (i * 7) % 11) });
  try {
    for (const [field, at] of [["time", 4], ["time", 10], ["lat", -2.5], ["lon", 30]]) {
      const others = ["time", "lat", "lon"].filter((name) => name !== field);
      const gridded = await runTransform("Slice", t.grid, { field, at });
      const general = await runTransform("Slice", t.long, { field, at, by: others, values: ["tas"] });
      assert.deepEqual(gridded.grid.dims.map((d) => d.name), others);
      // The general path keeps its entities in their first row's order: the grid's.
      assert.deepEqual((await values(gridded.get("tas"))).map((v) => +v.toFixed(4)), (await values(general.get("tas"))).map((v) => +v.toFixed(4)), `${field} ${at}`);
      gridded.dispose(); general.dispose();
    }
    // Outside the coordinates every cell is hidden.
    const outside = await runTransform("Slice", t.grid, { field: "time", at: 25 });
    assert.deepEqual([outside.length, outside.padded().grid.size], [0, 6]);
    outside.dispose();
    // A padded input: a cell hidden at either step is hidden.
    const filtered = await runTransform("Filter", t.grid, { where: { field: "tas", op: "gt", value: 3 } });
    const sliced = await runTransform("Slice", filtered, { field: "time", at: 5 });
    const tas = await values(t.grid.get("tas"));
    assert.deepEqual(await values(sliced.padded().valid), Array.from({ length: 6 }, (_, i) => Number(tas[i] > 3 && tas[i + 6] > 3)));
    sliced.dispose(); filtered.dispose();
  } finally {
    t.dispose();
  }
});
