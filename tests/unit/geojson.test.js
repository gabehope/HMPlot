import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { geoTable } from "../../src/lib/plot/utils/geoData.js";
const fixture = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "A",
      properties: { rate: 2 },
      geometry: { type: "Point", coordinates: [0, 0] },
    },
    { type: "Feature", id: "B", properties: { rate: 4 }, geometry: null },
  ],
};
test("GeoJSON data exposes properties and structured geometry with stable identities", async () => {
  const s = createDataScope();
  s.update(fixture);
  assert.equal(s.length, 2);
  assert.deepEqual(s.get("rate"), [2, 4]);
  const version = s.version;
  s.update(fixture);
  assert.equal(s.version, version);
  const ids = np.array([1, 0], { dtype: np.int32 }),
    v = createDataView(s, { indices: ids });
  try {
    const g = v.get("geometry");
    assert.equal(g.features, fixture.features);
    assert.deepEqual(Array.from(await g.indices.ref.data()), [1, 0]);
  } finally {
    v.dispose();
    ids.dispose();
    s.dispose();
  }
});
test("GeoJSON reserved geometry property rejects without replacing data", () => {
  const s = createDataScope();
  s.update(fixture);
  assert.throws(
    () =>
      s.update({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { geometry: 3 }, geometry: null },
        ],
      }),
    /reserved/,
  );
  assert.equal(s.length, 2);
  s.dispose();
  assert.equal(
    geoTable({ type: "Point", coordinates: [1, 2] }).geometry.length,
    1,
  );
});
import { geoGeometry } from "../../src/lib/plot/utils/geoGeometry.js";
import { createGeoGeometryWorker } from "../../src/lib/plot/utils/geoWorker.js";
test("GeoJSON workers reuse source geometry, replace changed geometry and release canceled jobs", async (t) => {
  const workers = [];
  class WorkerFixture {
    constructor() { workers.push(this); this.messages = []; }
    postMessage(message) {
      this.messages.push(message);
      if (message.input) this.input = message.input;
    }
    finish(options) { this.onmessage({ data: { result: geoGeometry(this.input, options) } }); }
    terminate() { this.stopped = true; }
  }
  const previousWorker = globalThis.Worker;
  globalThis.Worker = WorkerFixture;
  t.after(() => { if (previousWorker) globalThis.Worker = previousWorker; else delete globalThis.Worker; });
  const owner = createGeoGeometryWorker();
  const source = { type: "FeatureCollection", features: [{ type: "Feature", properties: { callback() {} },
    geometry: { type: "Point", coordinates: [1, 2] } }] };
  const first = owner.prepare(source, {});
  workers[0].finish();
  assert.deepEqual(Array.from((await first).points.position), [1, 2, 0]);
  const again = owner.prepare(source, { seamLongitude: 5 });
  assert.equal(workers.length, 1);
  assert.equal("input" in workers[0].messages[1], false);
  workers[0].finish(); await again;
  source.features[0].geometry = { type: "Point", coordinates: [3, 4] };
  const changed = owner.prepare(source, {});
  workers[0].finish();
  assert.deepEqual(Array.from((await changed).points.position), [3, 4, 0]);
  const abort = new AbortController(), canceled = owner.prepare(source, {}, abort.signal);
  abort.abort();
  await assert.rejects(canceled, { name: "AbortError" });
  assert.equal(workers[0].stopped, true);
  const restarted = owner.prepare(source, {});
  assert.ok(workers[1].messages[0].input);
  workers[1].finish(); await restarted;
  owner.dispose();
  assert.equal(workers[1].stopped, true);
  await assert.rejects(owner.prepare(source, {}), { name: "AbortError" });
});

test("GeoJSON triangulation preserves holes, feature identities and extrusion walls", () => {
  const g = geoGeometry({
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      [
        [1, 1],
        [1, 3],
        [3, 3],
        [3, 1],
        [1, 1],
      ],
    ],
  });
  let area = 0;
  for (let i = 0; i < g.faces.feature.length; i++) {
    const a = g.faces.a.slice(i * 3, i * 3 + 3),
      b = g.faces.b.slice(i * 3, i * 3 + 3),
      c = g.faces.c.slice(i * 3, i * 3 + 3);
    if (a[2] === 1 && b[2] === 1 && c[2] === 1)
      area +=
        Math.abs(
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        ) / 2;
  }
  assert.equal(area, 12);
  assert.equal(g.lines.feature.length, 8);
  assert.ok(g.faces.feature.every((f) => f === 0));
});
test("GeoJSON line-only mode emits polygon rings and paths without faces", () => {
  const g = geoGeometry({ type: "FeatureCollection", features: [
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [3, 0], [3, 2], [0, 2], [0, 0]]] } },
    { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1], [2, 1]] } },
  ] }, { linesOnly: true });
  assert.equal(g.faces.feature.length, 0);
  assert.equal(g.points.feature.length, 0);
  assert.deepEqual(Array.from(g.lines.feature).sort(), [0, 0, 0, 0, 1, 1]);
});
test("GeoJSON mixed collections and malformed coordinates", () => {
  const g = geoGeometry({
    type: "GeometryCollection",
    geometries: [
      {
        type: "MultiPoint",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      {
        type: "LineString",
        coordinates: [
          [0, 0],
          [2, 1],
        ],
      },
    ],
  });
  assert.equal(g.points.feature.length, 2);
  assert.equal(g.lines.feature.length, 1);
  assert.throws(
    () => geoGeometry({ type: "Point", coordinates: [NaN, 0] }),
    /feature 0/,
  );
  assert.throws(
    () =>
      geoGeometry(
        { type: "Point", coordinates: [0, 91] },
        { geographic: true },
      ),
    /latitude/,
  );
});
test("geographic faces are bounded, curved detail is budgeted and polar rings produce area", () => {
  const g = geoGeometry(
    {
      type: "Polygon",
      coordinates: [
        [
          [-180, -80],
          [-90, -80],
          [0, -80],
          [90, -80],
          [180, -80],
          [-180, -80],
        ],
      ],
    },
    { geographic: true, angularStep: 10 },
  );
  assert.ok(g.faces.feature.length > 0);
  for (const key of ["a", "b", "c"])
    for (let i = 0; i < g.faces[key].length; i += 3) {
      assert.ok(Math.abs(g.faces[key][i]) <= 180);
      assert.ok(Math.abs(g.faces[key][i + 1]) <= 90);
    }
  assert.throws(
    () =>
      geoGeometry(
        {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [5, 0],
              [5, 5],
              [0, 5],
              [0, 0],
            ],
          ],
        },
        { maxBytes: 1 },
      ),
    {
      code: "limit.storage",
      message:
        /^GeoJSON: its geometry needs \d+ bytes; the limit is 1 bytes on this device\./,
    },
  );
});
import { geoRows, geoScope } from "../../src/lib/plot/utils/geoAttributes.js";
test("exact joins retain feature order, missing values, and GPU measurements", async () => {
  const s = createDataScope(),
    values = np.array([4, 2]);
  s.update({ key: ["B", "A"], rate: values });
  const rows = await geoRows(
    [...fixture.features, { type: "Feature", id: "C", properties: {} }],
    s,
    null,
    "$id",
    "key",
  );
  const view = geoScope(
    [...fixture.features, { type: "Feature", id: "C", properties: {} }],
    s,
    rows,
    true,
    false,
  );
  try {
    assert.deepEqual(Array.from(await rows.ref.data()), [1, 0, -1]);
    assert.equal(view.identity, s.identity);
    const source = view.sourceIndices();
    assert.deepEqual(Array.from(await source.ref.data()), [1, 0, -1]);
    source.dispose();
    const v = Array.from(await view.get("rate").ref.data());
    assert.deepEqual(v.slice(0, 2), [2, 4]);
    assert.ok(Number.isNaN(v[2]));
  } finally {
    view.dispose();
    rows.dispose();
    s.dispose();
    values.dispose();
  }
});
test("duplicate measurement keys fail, including keys not present in geometry", async () => {
  const s = createDataScope();
  s.update({ key: ["X", "X"] });
  await assert.rejects(
    geoRows(fixture.features, s, null, "$id", "key"),
    /Duplicate/,
  );
  const keys = np.array([3, 3]);
  s.update({ key: keys });
  await assert.rejects(
    geoRows(fixture.features, s, null, "$id", "key"),
    /Duplicate/,
  );
  s.dispose();
  keys.dispose();
});
test("dictionary GPU identifiers map without reading identifier arrays", async () => {
  const s = createDataScope(),
    codes = np.array([1, 0], { dtype: np.int32 });
  s.update({ key: { codes, categories: ["A", "B"] } });
  const rows = await geoRows(fixture.features, s, null, "$id", "key");
  assert.deepEqual(Array.from(await rows.ref.data()), [1, 0]);
  rows.dispose();
  s.dispose();
  codes.dispose();
});
test("indexed geometry scopes preserve original features and map filtered properties", async () => {
  const s = createDataScope();
  s.update(fixture);
  const idx = np.array([1], { dtype: np.int32 }),
    v = createDataView(s, { indices: idx }),
    column = v.get("geometry");
  const rows = await geoRows(fixture.features, v, column);
  const mapped = geoScope(fixture.features, v, rows, false, true);
  assert.deepEqual(Array.from(await rows.ref.data()), [-1, 0]);
  assert.equal((await mapped.get("rate").ref.data())[1], 4);
  assert.equal(mapped.identity, s.identity);
  const release = mapped.retain();
  mapped.dispose();
  rows.dispose();
  v.dispose();
  idx.dispose();
  s.dispose();
  // A published mark binding keeps feature values and the parent row map alive.
  const source = mapped.sourceIndices();
  assert.deepEqual(Array.from(await source.ref.data()), [-1, 1]);
  source.dispose();
  assert.equal((await mapped.get("rate").ref.data())[1], 4);
  release();
});

test("paired antimeridian chart cuts do not create false walls or outlines", () => {
  const g = geoGeometry(
    {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [170, -10],
            [180, -10],
            [180, 10],
            [170, 10],
            [170, -10],
          ],
        ],
        [
          [
            [-180, -10],
            [-170, -10],
            [-170, 10],
            [-180, 10],
            [-180, -10],
          ],
        ],
      ],
    },
    { geographic: true },
  );
  for (let i = 0; i < g.lines.feature.length; i++) {
    const a = g.lines.start.slice(i * 3, i * 3 + 3),
      b = g.lines.end.slice(i * 3, i * 3 + 3);
    assert.ok(!(Math.abs(a[0]) === 180 && a[0] === b[0]));
  }
});
import {
  coordinateValue,
  projectionY,
} from "../../src/lib/plot/utils/coordinates.js";
test("projected 3D inverse agrees with longitude/latitude and radial height units", () => {
  for (const projection of ["equirectangular", "mercator", "equal-area"])
    for (const angleUnit of ["degrees", "radians"]) {
      const values = {
        coordinates: "spherical",
        sphericalView: "projected",
        projection,
        angleUnit,
        baseRadius: 2,
        radialScale: 0.7,
      };
      const options = { get: (k) => values[k], viewContext: { mode: "3d" } };
      const lon = 0.5,
        lat = 0.4,
        height = 0.2;
      const result = coordinateValue(options, [
        lon * 2,
        height * 0.7,
        -projectionY(lat, projection) * 2,
      ]);
      assert.ok(
        Math.abs(
          result[0] - (angleUnit === "degrees" ? (lon * 180) / Math.PI : lon),
        ) < 1e-10,
      );
      assert.ok(
        Math.abs(
          result[1] - (angleUnit === "degrees" ? (lat * 180) / Math.PI : lat),
        ) < 1e-10,
      );
      assert.ok(Math.abs(result[2] - height) < 1e-10);
    }
});
test("missing numerical properties remain missing instead of zero", () => {
  const s = createDataScope();
  s.update({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { value: 2 }, geometry: null },
      { type: "Feature", properties: { value: null }, geometry: null },
    ],
  });
  assert.equal(s.get("value")[0], 2);
  assert.ok(Number.isNaN(s.get("value")[1]));
  s.dispose();
});

test("GPU join cancellation releases bounded work before publishing rows", async () => {
  const scope = createDataScope(),
    ids = np.arange(300).astype(np.int32);
  scope.update({ id: ids });
  const controller = new AbortController();
  const work = geoRows(
    Array.from({ length: 300 }, (_, id) => ({
      type: "Feature",
      id,
      properties: {},
      geometry: null,
    })),
    scope,
    null,
    "$id",
    "id",
    controller.signal,
  );
  controller.abort();
  await assert.rejects(work, (e) => e.name === "AbortError");
  scope.dispose();
  ids.dispose();
});

import { prepareGeoStyles } from "../../src/lib/plot/utils/geoStyles.js";
import { categorical } from "../../src/lib/plot/utils/categorical.js";
test("feature fill and line color mappings remain independent", async () => {
  const scope = createDataScope();
  scope.update({ group: ["A", "B"], route: ["X", "Y"] });
  const palette = categorical({ domain: ["A", "B"], range: ["red", "blue"] }),
    stroke = categorical({ domain: ["X", "Y"], range: ["black", "white"] });
  // Each mark's state keeps its channels' last category values (categoryValues); the mark releases them.
  const states = [{ auto: {}, hidden: {} }, { auto: {}, hidden: {} }];
  const p = prepareGeoStyles(
    {
      position: [
        [0, 0],
        [0, 0],
      ],
      fill: "group",
      fillScale: palette,
      color: "route",
      colorScale: stroke,
    },
    scope,
    { get: () => undefined },
    states[0],
  );
  assert.deepEqual(
    Array.from(await p.props.categoryColor.ref.data()),
    [1, 0, 0, 0, 0, 1],
  );
  assert.deepEqual(
    Array.from(await p.stroke.categoryColor.ref.data()),
    [0, 0, 0, 1, 1, 1],
  );
  assert.equal(p.metadata.fill.scale, palette);
  p.dispose();
  const q = prepareGeoStyles(
    {
      position: [
        [0, 0],
        [0, 0],
      ],
      fill: "group",
      fillScale: palette,
    },
    scope,
    { get: () => undefined },
    states[1],
  );
  assert.equal(q.stroke.categoryColor, q.props.categoryColor);
  q.dispose();
  for (const state of states)
    for (const entry of state.categoryValues?.values() ?? []) entry.values.dispose();
  scope.dispose();
});

test("a boundary crossing the antimeridian splits there, and seamLongitude moves the extent", () => {
  const line = { type: "LineString", coordinates: [[170, 0], [190, 0]] };
  const pieces = (options) => {
    const g = geoGeometry(line, { geographic: true, ...options }), out = [];
    for (let i = 0; i < g.lines.feature.length; i++)
      out.push([g.lines.start[i * 3], g.lines.end[i * 3]]);
    return out;
  };
  // Each piece stays in one extent; none is zero-length or bridges the map.
  const root = pieces({});
  for (const [a, b] of root) {
    assert.ok(Math.abs(b - a) <= 5 + 1e-9, `${a} ${b}`);
    assert.ok(a !== b);
    assert.ok(a >= -180 && a <= 180 && b >= -180 && b <= 180);
  }
  assert.ok(root.some(([, b]) => b === 180) && root.some(([a]) => a === -180));
  // Centered at 180, the same line is one run inside [0, 360].
  const shifted = pieces({ seamLongitude: 180 });
  for (const [a, b] of shifted) assert.ok(a >= 170 && b <= 190, `${a} ${b}`);
  // A face straddling 180 splits at the seam, or not at all when centered there.
  const square = { type: "Polygon", coordinates: [[[170, -5], [190, -5], [190, 5], [170, 5], [170, -5]]] };
  const extent = (options) => {
    const { faces } = geoGeometry(square, { geographic: true, ...options }), x = [];
    for (const key of ["a", "b", "c"]) for (let i = 0; i < faces[key].length; i += 3) x.push(faces[key][i]);
    return [Math.min(...x), Math.max(...x)];
  };
  assert.deepEqual(extent({}), [-180, 180]);
  assert.deepEqual(extent({ seamLongitude: 180 }), [170, 190]);
});

// TODO 64.9: GeoJSON's numeric fill and line color map through their domain: <channel>Domain,
// a continuous scale's, else the values' extent (they read the default [0, 1]); a line color left
// unset follows the fill.
test("GeoJSON's numeric colors take a scale's domain, or the values' extent", async () => {
  const { geoColorOptions } = await import("../../src/lib/plot/utils/geoStyles.js");
  const { continuous } = await import("../../src/lib/plot/utils/scaleResources.js");
  const values = np.array([1, 2, 3]), lines = np.array([10, -40, 20]);
  const prepared = { props: { fill: values }, stroke: { color: lines }, metadata: {}, rgb: {} };
  let options = await geoColorOptions({ fill: "value" }, prepared);
  assert.deepEqual(options.fill, { valueBounds: [1, 3], valueTransform: "linear" });
  assert.equal(options.color, options.fill);
  options = await geoColorOptions({ fill: "value", colormap: "Magma" }, prepared);
  assert.deepEqual(options.fill, { valueBounds: [1, 3], valueTransform: "linear", cmapIndex: "Magma" });
  options = await geoColorOptions({ fill: "value", color: "rank", colorScale: continuous({ domain: "symmetric" }) }, prepared);
  assert.deepEqual(options.color.valueBounds, [-40, 40]);
  options = await geoColorOptions({ fill: "value", fillScale: continuous({ domain: [2, 4], transform: "log" }) }, prepared);
  assert.deepEqual([options.fill.valueBounds, options.fill.valueTransform], [[2, 4], "log"]);
  // Categories and CSS colors are not numbers.
  assert.deepEqual(await geoColorOptions({ fill: "#f00" }, { props: { fill: "#f00" }, stroke: { color: "#f00" }, metadata: {}, rgb: {} }), { fill: null, color: null });
  values.dispose(); lines.dispose();
});


test("GeoJSON joins to grouped rows keep all source contributors and feedback membership", async () => {
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const { count } = await import("../../src/lib/plot/utils/expressions.js");
  const { interactionRows, selectionMask } = await import("../../src/lib/plot/utils/interaction.js");
  const source = createDataScope(); source.update({ key: ["A", "B", "B"] });
  const grouped = await runTransform("Group", source, { by: "key", columns: { total: count() } });
  const rows = await geoRows(fixture.features, grouped, null, "$id", "key");
  const mapped = geoScope(fixture.features, grouped, rows, true, false);
  try {
    assert.deepEqual(await interactionRows(mapped, [1]), [1, 2]);
    source.identity.hover.replace(source.identity, [2], { phase: "preview" });
    const mask = selectionMask(mapped, source.identity.hover);
    assert.deepEqual(Array.from(await mask.ref.data()), [0, 1]); mask.dispose();
  } finally { mapped.dispose(); rows.dispose(); grouped.dispose(); source.dispose(); }
});
