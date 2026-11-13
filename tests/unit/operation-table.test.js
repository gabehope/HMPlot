import test from "node:test";
import assert from "node:assert/strict";
import { resolveCoordinateOperations, repeatingRootMap, pathOperationFlags } from "../../src/lib/plot/utils/coordinateOperations.js";
import { framePoint } from "../../src/lib/plot/utils/framePlacement.js";
import { operationSampler, MAP_FLAGS } from "../../src/lib/plot/utils/operationTable.js";
import { MERCATOR_LIMIT } from "../../src/lib/plot/utils/coordinates.js";
import { chainPolyline } from "../../src/lib/plot/utils/vectorExport.js";

const near = (actual, expected, tolerance = 1e-5) => {
  assert.equal(actual.length, expected.length);
  expected.forEach((value, axis) => assert.ok(Math.abs(actual[axis] - value) < tolerance,
    `axis ${axis}: ${actual[axis]} differs from ${value}`));
};
const frame = (values, parent = null, ranges = []) => ({
  get: (key) => values[key] ?? parent?.get(key),
  frameDefinition: { parent, placement: null, ranges: new Set(ranges), owns: () => true },
});

function mixedChain(center = [0, 0]) {
  const globe = frame({ coordinates: "spherical",
    projection: "orthographic", projectionCenter: center,
    _projectionCenterLongitude: center[0], _projectionCenterLatitude: center[1],
    angleUnit: "degrees", baseRadius: 1, radialScale: 1,
    xbounds: [-180, 180], ybounds: [-90, 90] });
  const chart = frame({ coordinates: "cartesian", xbounds: [-1, 1], ybounds: [-1, 1],
    _frameXRange: [-45, 45], _frameYRange: [-30, 30] }, globe, ["x", "y"]);
  return frame({ coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    baseRadius: 0, radialScale: 1, polarAxis: "Z", xbounds: [0, 24], ybounds: [0, 1],
    _frameXRange: [-1, 1], _frameYRange: [-1, 1] }, chart, ["x", "y"]);
}

test("the packed table evaluates a mixed chain like framePoint", () => {
  for (const center of [[0, 0], [30, 10]]) {
    const disk = mixedChain(center), operations = resolveCoordinateOperations(disk);
    const sample = operationSampler(operations, pathOperationFlags(operations));
    for (const source of [[0, 1, 0], [6, 1, 0], [12, 0.5, 0], [21, 0.25, 0]]) {
      const packed = sample(source);
      assert.equal(packed.valid, true);
      near(packed.point, framePoint(disk, source));
      assert.equal(packed.seam, 0);
    }
  }
  // Rotated far enough, the disk's west side is behind the globe.
  const turned = resolveCoordinateOperations(mixedChain([130, 0]));
  assert.equal(operationSampler(turned)([12, 1, 0]).valid, false);
});

test("a nested flat map reports its seam tile; a repeating root unwraps", () => {
  const map = { kind: "spherical-map2d", factor: Math.PI / 180, origin: 0, base: 1,
    radial: 1, projection: "equirectangular", centerLongitude: 0, centerLatitude: 0 };
  assert.equal(repeatingRootMap([map]), true);
  assert.equal(repeatingRootMap([map, { kind: "fit", sx: 1, sy: 1, tx: 0, ty: 0 }]), false);
  const nested = operationSampler([map, { kind: "fit", sx: 1, sy: 1, tx: 0, ty: 0 }],
    pathOperationFlags([map, {}]));
  const east = nested([179, 0, 0]), west = nested([181, 0, 0]);
  assert.ok(east.valid && west.valid);
  assert.equal(east.seam, 0);
  assert.equal(west.seam, 1);
  near([west.point[0]], [(181 - 360) * Math.PI / 180]);
  const root = operationSampler([map], pathOperationFlags([map]))([181, 0, 0]);
  assert.equal(root.seam, 0);
  near([root.point[0]], [181 * Math.PI / 180]);
});

test("Mercator is cut beyond its limit when nested and clamped for a repeating root", () => {
  const mercator = { kind: "spherical-map2d", factor: Math.PI / 180, origin: 0, base: 1,
    radial: 1, projection: "mercator", centerLongitude: 0, centerLatitude: 0 };
  const limit = MERCATOR_LIMIT * 180 / Math.PI;
  const cut = operationSampler([mercator], () => MAP_FLAGS.cutMercator);
  assert.equal(cut([0, limit - 0.5, 0]).valid, true);
  assert.equal(cut([0, 89, 0]).valid, false);
  const clamped = operationSampler([mercator], () => MAP_FLAGS.unwrap | MAP_FLAGS.clampMercator);
  near([clamped([0, 89, 0]).point[1]], [Math.log(Math.tan(Math.PI / 4 + MERCATOR_LIMIT / 2))], 1e-4);
});

test("negative polar radius and a hidden orthographic side are invalid, not sentinels", () => {
  const polar = { kind: "polar", factor: Math.PI / 12, origin: 0, base: 0, radial: 1, axis: "Z" };
  const sample = operationSampler([polar]);
  assert.equal(sample([6, 1, 0]).valid, true);
  assert.deepEqual(sample([6, -0.5, 0]), { point: null, valid: false, seam: 0 });
  const disk = { kind: "spherical-map2d", factor: Math.PI / 180, origin: 0, base: 1, radial: 1,
    projection: "orthographic", centerLongitude: 0, centerLatitude: 0 };
  assert.equal(operationSampler([disk])([89, 0, 0]).valid, true);
  assert.equal(operationSampler([disk])([91, 0, 0]).valid, false);
});

test("chainPolyline cuts runs at a horizon and at a seam without bridging", () => {
  const options = { get: (key) => ({ coordinates: "spherical", interpolation: "angular",
    angleUnit: "degrees", baseRadius: 1, radialScale: 1 })[key] };
  const disk = { kind: "spherical-map2d", factor: Math.PI / 180, origin: 0, base: 1, radial: 1,
    projection: "orthographic", centerLongitude: 0, centerLatitude: 0 };
  const pixels = ([x, y]) => [200 + 100 * x, 200 - 100 * y];
  const horizon = chainPolyline([-150, 0], [150, 0], options, operationSampler([disk]), pixels, 0.25, 1000);
  assert.equal(horizon.paths.length, 1);
  const xs = horizon.paths[0].map(([x]) => x);
  near([Math.min(...xs), Math.max(...xs)], [100, 300], 1e-3);
  const map = { ...disk, projection: "equirectangular" };
  const nested = operationSampler([map, { kind: "fit", sx: 1, sy: 1, tx: 0, ty: 0 }],
    pathOperationFlags([map, {}]));
  const seam = chainPolyline([120, 0], [240, 0], options, nested, pixels, 0.25, 1000);
  assert.equal(seam.paths.length, 2);
  const [right, left] = seam.paths;
  near([right[0][0], right.at(-1)[0]], [200 + 100 * 2 * Math.PI / 3, 200 + 100 * Math.PI], 1e-2);
  near([left[0][0], left.at(-1)[0]], [200 - 100 * Math.PI, 200 - 100 * 2 * Math.PI / 3], 1e-2);
  // One segment only touches the horizon: nothing visible remains.
  assert.deepEqual(chainPolyline([-150, 0], [-90, 0], options, operationSampler([disk]), pixels, 0.25, 1000).paths, []);
  assert.deepEqual(chainPolyline([0, 0], [80, 0], options, operationSampler([disk]), pixels, 0.25, 1),
    { overflow: true });
});

test("chainPolyline evaluates step and cubic curves in source space", () => {
  const scale = { kind: "scale", axes: {} }, sample = operationSampler([scale]);
  const pixels = ([x, y]) => [100 * x, -100 * y];
  const withCurve = (curve) => ({ get: (key) => ({ coordinates: "cartesian", curve })[key] });
  // A cubic from (0, 0) to (1, 0) with controls (0, 1) and (1, 1) peaks at y = 0.75.
  const cubic = chainPolyline([0, 0], [1, 0], withCurve("cubic"), sample, pixels, 0.1, 1000,
    [[0, 1, 0], [1, 1, 0]]);
  const points = cubic.paths[0], top = points.reduce((a, b) => (a[1] < b[1] ? a : b));
  near(top, [50, -75], 1e-3);
  assert.ok(points.length > 8);
  // A step-after corner lies at (1, 0) on the way to (1, 1).
  const step = chainPolyline([0, 0], [1, 1], withCurve("step-after"), sample, pixels, 0.1, 1000);
  assert.ok(step.paths[0].some(([x, y]) => Math.abs(x - 100) < 0.05 && Math.abs(y) < 0.05));
  assert.ok(step.paths[0].every(([x, y]) => Math.abs(y) < 0.05 || Math.abs(x - 100) < 0.05));
});

// TODO 70.4: a basis Line's rows are its B-spline's cubic Béziers (basisPath), which the export
// refines like any curve: every exported point lies on d3's curveBasis through the vertices.
test("a basis curve exports as its B-spline", async () => {
  const { basisPath } = await import("../../src/lib/plot/utils/curves.js");
  const { lineArrays, disposeArrays } = await import("../../src/lib/plot/utils/data.js");
  const { curveBasis } = await import("d3");
  const { numpy: np } = await import("@hmplot/jax");
  const vertices = [[0, 0, 0], [1, 2, 0], [2, 0, 0], [3, 2, 0], [4, 1, 0]];
  const options = { get: (key) => ({ coordinates: "cartesian", curve: "basis" })[key] };
  const position = np.array(vertices), arrays = lineArrays(position, options, true, true), rows = basisPath(arrays);
  const read = async (name) => { const data = await rows[name].ref.data(); return Array.from({ length: data.length / 3 }, (_, i) => [...data.slice(i * 3, i * 3 + 3)]); };
  const [starts, ends, first, second] = await Promise.all(["start", "end", "control1", "control2"].map(read));
  // d3's Béziers, sampled densely.
  const reference = [];
  let at = null;
  const curve = curveBasis({ moveTo: (x, y) => { at = [x, y]; }, lineTo: (x, y) => { reference.push(at, [x, y]); at = [x, y]; },
    bezierCurveTo: (x1, y1, x2, y2, x, y) => {
      for (let k = 0; k <= 400; k++) {
        const t = k / 400, u = 1 - t;
        reference.push([0, 1].map((c) => u ** 3 * at[c] + 3 * u * u * t * [x1, y1][c] + 3 * u * t * t * [x2, y2][c] + t ** 3 * [x, y][c]));
      }
      at = [x, y];
    }, closePath() {} });
  curve.lineStart(); vertices.forEach(([x, y]) => curve.point(x, y)); curve.lineEnd();
  const sample = operationSampler([{ kind: "scale", axes: {} }]), pixels = ([x, y]) => [100 * x, -100 * y];
  let exported = 0;
  starts.forEach((from, i) => {
    if (!from.every(Number.isFinite)) return;
    const path = chainPolyline(from, ends[i], options, sample, pixels, 0.1, 1000, [first[i], second[i]]);
    for (const [x, y] of path.paths.flat()) {
      exported++;
      const gap = Math.min(...reference.map(([u, v]) => Math.hypot(100 * u - x, -100 * v - y)));
      assert.ok(gap < 0.5, `(${x}, ${y}) is ${gap} px off the B-spline`);
    }
  });
  assert.ok(exported > 20);
  disposeArrays(rows); disposeArrays(arrays); position.dispose();
});

// TODO 70.5: a fill across a map's seam exports its piece on each side, as the GPU cuts it.
test("a fill across a nested map's seam splits into a piece on each side", async () => {
  const { chainedOutline } = await import("../../src/lib/plot/utils/vectorExport.js");
  const options = { get: (key) => ({ coordinates: "spherical", interpolation: "angular", angleUnit: "degrees" })[key] };
  const map = { kind: "spherical-map2d", factor: Math.PI / 180, origin: 0, base: 1, radial: 1,
    projection: "equirectangular", centerLongitude: 0, centerLatitude: 0 };
  const sampler = operationSampler([map, { kind: "fit", sx: 1, sy: 1, tx: 0, ty: 0 }], pathOperationFlags([map, {}]));
  const pixels = ([x, y]) => [200 + 100 * x, 200 - 100 * y];
  // Longitudes 150..210 (210 is -150 past the seam), latitudes 10..40.
  const shape = chainedOutline([[150, 10, 0], [210, 10, 0], [210, 40, 0], [150, 40, 0]], options, sampler, pixels, 0.1, 1000);
  assert.equal(shape?.outlines?.length, 2, JSON.stringify(shape));
  const spans = shape.outlines.map((outline) => [Math.min(...outline.map(([x]) => x)), Math.max(...outline.map(([x]) => x))])
    .sort((a, b) => a[0] - b[0]);
  const x = (lon) => 200 + 100 * lon * Math.PI / 180;
  spans.flat().forEach((value, k) => assert.ok(Math.abs(value - [x(-180), x(-150), x(150), x(180)][k]) < 1e-3, `${spans}`));
  // Twice across the seam is not split: a raster reason.
  const wide = chainedOutline([[150, 10, 0], [570, 10, 0], [570, 40, 0], [150, 40, 0]], options, sampler, pixels, 0.1, 10000);
  assert.ok(wide?.raster, JSON.stringify(wide));
});

test("repeatingRootMap reads a built operation's projection from its options", () => {
  const options = (projection) => ({ get: (key) => ({ projection })[key] });
  assert.equal(repeatingRootMap([{ kind: "spherical-map2d", options: options("orthographic") }]), false);
  assert.equal(repeatingRootMap([{ kind: "spherical-map2d", options: options("mercator") }]), true);
  assert.equal(repeatingRootMap([{ kind: "spherical-map2d", projection: "orthographic" }]), false);
});

test("a fill cut by an orthographic horizon closes along the limb", async () => {
  const { chainedOutline } = await import("../../src/lib/plot/utils/vectorExport.js");
  const { buildCoordinateOperations } = await import("../../src/lib/plot/utils/coordinateOperations.js");
  const globe = frame({ coordinates: "spherical", projection: "orthographic",
    projectionCenter: [0, 0], _projectionCenterLongitude: 0, _projectionCenterLatitude: 0,
    angleUnit: "degrees", baseRadius: 1, radialScale: 0, interpolation: "angular",
    xbounds: [-180, 180], ybounds: [-90, 90] });
  const operations = resolveCoordinateOperations(globe);
  const sampler = operationSampler(operations, pathOperationFlags(operations));
  const pixels = ([x, y]) => [200 + 100 * x, 200 - 100 * y];
  // Longitudes 60..120, latitudes -20..20: visible up to the limb at 90.
  const corners = [[60, -20, 0], [120, -20, 0], [120, 20, 0], [60, 20, 0]];
  const shape = chainedOutline(corners, globe, sampler, pixels, 0.1, 10000, buildCoordinateOperations(globe));
  assert.equal(shape?.outlines?.length, 1, JSON.stringify(shape));
  const outline = shape.outlines[0], radius = ([x, y]) => Math.hypot(x - 200, y - 200);
  for (const point of outline) assert.ok(radius(point) <= 100 + 1e-6, JSON.stringify(point));
  // The limb arc spans latitudes -20..20 on the right edge of the disk; at a
  // 0.1-pixel tolerance its 40 degrees take at least 8 chords.
  const limb = outline.filter((point) => Math.abs(radius(point) - 100) < 1e-3);
  assert.ok(limb.length >= 7, `${limb.length}`);
  for (const [x, y] of limb) {
    assert.ok(x > 200 + 100 * Math.cos(20 * Math.PI / 180) - 1e-3);
    assert.ok(Math.abs(y - 200) <= 100 * Math.sin(20 * Math.PI / 180) + 1e-3);
  }
  const extreme = limb.map(([, y]) => y);
  assert.ok(Math.abs(Math.max(...extreme) - Math.min(...extreme) - 200 * Math.sin(20 * Math.PI / 180)) < 1e-2);
  // The visible west edge is longitude 60: 100 sin 60 cos φ right of center.
  const west = outline.filter(([x, y]) =>
    Math.abs(x - (200 + 100 * Math.sin(Math.PI / 3) * Math.sqrt(1 - ((200 - y) / 100) ** 2))) < 1e-3);
  assert.ok(west.length >= 2);
});
