import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCoordinateOperations, inverseCoordinateOperations, buildCoordinateOperations,
} from "../../src/lib/plot/utils/coordinateOperations.js";
import { framePoint, framePointInverse, placementMatrix, sphericalTangentBasis } from "../../src/lib/plot/utils/framePlacement.js";
import { angleInChildRange } from "../../src/lib/plot/utils/coordinateOperations.js";
import { placedExtent } from "../../src/lib/plot/utils/coordinates.js";
import { Matrix4, OrthographicCamera, Vector3 } from "three/webgpu";

const near = (actual, expected, tolerance = 1e-9) => {
  assert.equal(actual.length, expected.length);
  for (let axis = 0; axis < expected.length; axis++)
    assert.ok(Math.abs(actual[axis] - expected[axis]) < tolerance,
      `axis ${axis}: ${actual[axis]} differs from ${expected[axis]}`);
};

test("ordered sqrt/log, polar, fit, spherical chain has a hand-computed result", () => {
  const operations = [
    { kind: "scale", axes: {
      x: { domain: [0, 12], range: [0, 12], transform: "sqrt" },
      y: { domain: [1, 9], range: [1, 9], transform: "log" },
    } },
    { kind: "polar", options: { angleUnit: "custom", anglePeriod: 24,
      baseRadius: 1, radialScale: 2 } },
    { kind: "fit", canonicalBounds: [[-11, 11], [-11, 11], [0, 6]],
      parentRanges: [[-22, 22], [-22, 22], [0, 12]] },
    { kind: "spherical-globe", options: { baseRadius: 1, radialScale: 1 } },
  ];
  // sqrt(3) maps to 6; log(3) maps to 5; polar 6/24 turn gives
  // (0, 11, 3); fit doubles it to (0, 22, 6); the sphere radius is 7.
  near(applyCoordinateOperations([3, 3, 3], operations),
    [0, 7 * Math.sin(22 * Math.PI / 180), 7 * Math.cos(22 * Math.PI / 180)]);
  near(inverseCoordinateOperations(
    applyCoordinateOperations([3, 3, 3], operations), operations), [3, 3, 3]);
});

test("polar singularities and rotated orthographic visibility survive the same path", () => {
  const polar = [{ kind: "polar", options: { angleUnit: "custom", anglePeriod: 24 } }];
  near(applyCoordinateOperations([6, 0, 2], polar), [0, 0, 2]);
  assert.equal(inverseCoordinateOperations([0, 0, 2], polar)[0], undefined);
  assert.equal(applyCoordinateOperations([6, -1, 2], polar), null);
  const map = [{ kind: "spherical-map2d", options: {
    projection: "orthographic", projectionCenter: [90, 0], baseRadius: 1,
  } }];
  near(applyCoordinateOperations([90, 0, 0], map), [0, 0, 0]);
  assert.equal(applyCoordinateOperations([-90, 0, 0], map), null);
  const inverse = inverseCoordinateOperations([0, 0, 0], map);
  near(inverse.slice(0, 2), [90, 0]);
  assert.equal(inverse[2], undefined);
});

test("a reversed fit and rigid placement remain invertible", () => {
  const operations = [
    { kind: "fit", canonicalBounds: [[-1, 1], [-1, 1]],
      parentRanges: [[10, 0], [0, 20]] },
    { kind: "matrix", elements: [1, 0, 0, 0, 0, 1, 0, 0,
      0, 0, 1, 0, 3, -2, 0, 1], inverse: [1, 0, 0, 0, 0, 1, 0, 0,
        0, 0, 1, 0, -3, 2, 0, 1] },
  ];
  near(applyCoordinateOperations([1, 1], operations), [3, 13, 0]);
  near(inverseCoordinateOperations([3, 13, 0], operations), [1, 1, 0]);
  assert.throws(() => applyCoordinateOperations([0, 0], Array.from({ length: 17 }, () => ({ kind: "scale" }))), {
    code: "limit.coordinateStages",
    message: "Frame: a coordinate mapping needs 17 stages; the limit is 16 stages. Nest fewer Frames.",
  });
});

test("solar inset contract: a spherical planet translates to its polar orbit without a second polar conversion", () => {
  const orbit = [{ kind: "polar", options: { angleUnit: "custom", anglePeriod: 24 } }];
  const anchor = applyCoordinateOperations([6, 2, 0], orbit);
  near(anchor, [0, 2, 0]);
  const planet = [
    { kind: "spherical-map2d", options: {
      projection: "orthographic", projectionCenter: [0, 0], baseRadius: 0.2,
    } },
    { kind: "matrix", elements: [1, 0, 0, 0, 0, 1, 0, 0,
      0, 0, 1, 0, ...anchor, 1], inverse: [1, 0, 0, 0, 0, 1, 0, 0,
        0, 0, 1, 0, ...anchor.map((value) => -value), 1] },
  ];
  near(applyCoordinateOperations([0, 0, 0], planet), anchor);
  near(applyCoordinateOperations([90, 0, 0], planet), [0.2, 2, 0]);
  near(inverseCoordinateOperations(anchor, planet).slice(0, 2), [0, 0]);
});

test("live polar root CPU placement and inverse use the same angle/radius channels", () => {
  const settings = { coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    baseRadius: 0, radialScale: 1, polarAxis: "Z", xbounds: [0, 24] };
  const options = { get: (key) => settings[key] };
  near(framePoint(options, [6, 2, 3]), [0, 2, 3]);
  near(framePointInverse(options, [0, 2, 3]), [6, 2, 3]);
  near(framePointInverse(options, framePoint(options, [16.5, 0.35, 0])), [16.5, 0.35, 0]);
  const matrix = new Matrix4().makeTranslation(2, 3, 0).scale(new Vector3(0.5, 0.5, 1));
  const placed = { ...options, frameDefinition: { parent: options,
    placement: { anchor: [0, 0], size: [1, 1] }, matrix, inverse: matrix.clone().invert() } };
  near(framePointInverse(placed, framePoint(placed, [16.5, 0.35, 0])), [16.5, 0.35, 0]);
  near(framePointInverse(options, framePoint(options, [0, 0, 0])).slice(1), [0, 0]);
  assert.equal(framePointInverse(options, [0, 0, 0])[0], undefined);
});

test("live warped Cartesian child scales precede its polar parent's projection", () => {
  const parentValues = { coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    baseRadius: 0, radialScale: 1, polarAxis: "Z" };
  const parent = { get: (key) => parentValues[key] };
  const childValues = { coordinates: "cartesian", xbounds: [0, 4], ybounds: [1, 100],
    _frameXRange: [0, 6], _frameYRange: [1, 2],
    xTransform: "sqrt", yTransform: "log" };
  const child = { get: (key) => childValues[key], frameDefinition: {
    parent, placement: null, mode: () => "2d", ranges: new Set(["x", "y"]),
  } };
  const world = framePoint(child, [1, 10, 0]);
  near(world, [1.5 / Math.SQRT2, 1.5 / Math.SQRT2, 0]);
  near(framePointInverse(child, world), [1, 10, 0]);
  assert.equal(framePointInverse(child, [0, 0, 0])[0], undefined);
  childValues._frameXRange = [12, 18];
  const wrapped = framePoint(child, [1, 10, 0]);
  near(wrapped, [-1.5 / Math.SQRT2, -1.5 / Math.SQRT2, 0]);
  near(framePointInverse(child, wrapped), [1, 10, 0]);
  assert.equal(angleInChildRange(0, [0, 24], 24), 0);
});

test("orthographic spherical parent ranges invert GPU-style typed world positions", () => {
  const parentValues = { coordinates: "spherical", projection: "orthographic",
    projectionCenter: [30, 0], angleUnit: "degrees", baseRadius: 1, radialScale: 1 };
  const parent = { get: (key) => parentValues[key] };
  const childValues = { coordinates: "cartesian", xbounds: [0, 1], ybounds: [0, 1],
    _frameXRange: [0, 60], _frameYRange: [-20, 20] };
  const child = { get: (key) => childValues[key], frameDefinition: {
    parent, placement: null, mode: () => "2d", ranges: new Set(["x", "y"]),
  } };
  const world = framePoint(child, [1, 1, 0]);
  near(world, [Math.cos(20 * Math.PI / 180) * 0.5,
    Math.sin(20 * Math.PI / 180), 0]);
  near(framePointInverse(child, new Float32Array([...world, 1])), [1, 1, 0], 1e-6);
  assert.deepEqual(framePointInverse(child, new Float32Array([1.2, 0, 0, 1])),
    [undefined, undefined, undefined]);
  parentValues.projectionCenter = [0, 0];
  near(framePoint(child, [0.5, 0.5, 0]), [0.5, 0, 0]);
});

test("spherical tangent placement has a deterministic globe pole basis", () => {
  const values = { coordinates: "spherical",
    sphericalView: "globe", angleUnit: "degrees", baseRadius: 1, radialScale: 1 };
  const parent = { get: (key) => values[key], viewContext: { mode: "3d" } };
  const placement = { anchor: [90, 0, 0], size: [2, 2, 2] };
  const matrix = placementMatrix(placement, parent, "3d");
  near(new Vector3(0, 0, 0).applyMatrix4(matrix).toArray(), [1, 0, 0]);
  near(new Vector3(1, 0, 0).applyMatrix4(matrix).toArray(), [1, 0, -1]);
  near(new Vector3(0, 1, 0).applyMatrix4(matrix).toArray(), [1, 1, 0]);
  const pole = sphericalTangentBasis([90, 90], parent);
  near(pole.east, [0, 0, -1]);
  near(pole.north, [-1, 0, 0]);
  near(pole.outward, [0, 1, 0]);
});

test("a polar frame placed in 3D fits its outer radius to its size, as in 2D", () => {
  // A planet's ring: radius 0 to 2.27 of a polar Frame whose placement is 5 across.
  const ring = { get: (key) => ({ coordinates: "polar", ybounds: [0, 2.27], baseRadius: 0, radialScale: 1 })[key] };
  near(placedExtent(ring, "3d"), [2.27, 2.27]);
  near(placedExtent(ring, "2d"), [2.27, 2.27]);
  assert.equal(placedExtent({ get: (key) => ({ coordinates: "spherical" })[key] }, "3d"), null);
  assert.equal(placedExtent({ get: (key) => ({ coordinates: "cartesian" })[key] }, "3d"), null);
  const values = { coordinates: "spherical",
    sphericalView: "globe", angleUnit: "degrees", baseRadius: 1, radialScale: 1 };
  const parent = { get: (key) => values[key], viewContext: { mode: "3d" } };
  const matrix = placementMatrix({ anchor: [0, 0, 0], size: [5, 5, 5], orientation: "parent" },
    parent, "3d", null, 0, 0, null, placedExtent(ring, "3d"));
  const center = new Vector3().applyMatrix4(matrix);
  near(new Vector3(2.27, 0, 0).applyMatrix4(matrix).sub(center).toArray(), [2.5, 0, 0]);
  near(new Vector3(0, 2.27, 0).applyMatrix4(matrix).sub(center).toArray(), [0, 2.5, 0]);
});

test("projected tangent stays rigid and hides beyond the horizon", () => {
  const values = { coordinates: "spherical",
    projection: "orthographic", projectionCenter: [0, 30], angleUnit: "degrees",
    baseRadius: 1, radialScale: 1 };
  const parent = { get: (key) => values[key] };
  const basis = sphericalTangentBasis([60, 30], parent);
  near([Math.hypot(...basis.east), Math.hypot(...basis.north)], [1, 1]);
  near([basis.east[0] * basis.north[0] + basis.east[1] * basis.north[1]], [0]);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.updateProjectionMatrix();
  const placement = { anchor: [60, 30], size: [100, 60] };
  const matrix = placementMatrix(placement, parent, "2d", null, 400, 400, camera);
  near(new Vector3().applyMatrix4(matrix).toArray(), framePoint(parent, [60, 30, 0]));
  const dx = new Vector3(1, 0, 0).applyMatrix4(matrix).sub(new Vector3().applyMatrix4(matrix));
  const dy = new Vector3(0, 1, 0).applyMatrix4(matrix).sub(new Vector3().applyMatrix4(matrix));
  near([dx.length(), dy.length(), dx.dot(dy)], [0.25, 0.15, 0]);
  assert.equal(sphericalTangentBasis([90, 0], parent), null);
  assert.equal(sphericalTangentBasis([180, 0], parent), null);
  const hidden = placementMatrix({ anchor: [180, 0], size: [100, 60] },
    parent, "2d", null, 400, 400, camera);
  assert.ok(hidden.elements[12] > 1e10);
});

test("a live polar child fits uniformly into unequal Cartesian parent ranges", () => {
  const parentValues = { coordinates: "cartesian", xbounds: [-4, 4], ybounds: [-4, 4],
    zbounds: [-1, 1], xrange: [-1, 1], yrange: [-1, 1], zrange: [-1, 1] };
  const parent = { get: (key) => parentValues[key], frameDefinition: {
    parent: null, placement: null, mode: () => "2d", owns: () => true, ranges: new Set(),
  } };
  const childValues = { coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    polarAxis: "Z", baseRadius: 0, radialScale: 1,
    xbounds: [0, 24], ybounds: [0, 1],
    _frameXRange: [-3, 3], _frameYRange: [-2, 2] };
  const child = { get: (key) => childValues[key], frameDefinition: {
    parent, placement: null, mode: () => "2d", ranges: new Set(["x", "y"]),
  } };
  near(framePoint(child, [0, 1, 0]), [0.5, 0, 0]);
  const inner = { defaults: child, get: key => child.get(key), frameDefinition: {
    parent: child, placement: null, mode: () => "2d", owns: () => false,
    ranges: new Set(),
  } };
  assert.deepEqual(buildCoordinateOperations(inner).map(operation => operation.kind),
    ["polar", "fit", "scale"]);
  near(framePoint(inner, [0, 1, 0]), framePoint(child, [0, 1, 0]));
  near(framePointInverse(inner, framePoint(inner, [6, 1, 0])), [6, 1, 0]);
  near(framePoint(child, [6, 1, 0]), [0, 0.5, 0]);
  near(framePointInverse(child, new Float32Array([0, 0.5, 0])), [6, 1, 0], 1e-6);
  childValues._frameXRange = [-1, 1];
  near(framePoint(child, [6, 1, 0]), [0, 0.25, 0]);
  assert.equal(framePointInverse(child, [0, 0, 0])[0], undefined);
});

test("a flat orthographic child fits its disk and preserves hemisphere inversion", () => {
  const parentValues = { coordinates: "cartesian", xbounds: [-4, 4], ybounds: [-4, 4],
    zbounds: [-1, 1], xrange: [-1, 1], yrange: [-1, 1], zrange: [-1, 1] };
  const parent = { get: (key) => parentValues[key], frameDefinition: {
    parent: null, placement: null, mode: () => "2d", owns: () => true, ranges: new Set(),
  } };
  const childValues = { coordinates: "spherical", projection: "orthographic",
    projectionCenter: [0, 0], angleUnit: "degrees",
    baseRadius: 1, radialScale: 0, xbounds: [-90, 90], ybounds: [-90, 90],
    _frameXRange: [-3, 3], _frameYRange: [-2, 2] };
  const child = { get: (key) => childValues[key], frameDefinition: {
    parent, placement: null, mode: () => "2d", ranges: new Set(["x", "y"]),
  } };
  near(framePoint(child, [90, 0, 0]), [0.5, 0, 0]);
  near(framePoint(child, [0, 90, 0]), [0, 0.5, 0]);
  near(framePointInverse(child, new Float32Array([0.5, 0, 0])).slice(0, 2), [90, 0], 1e-6);
  assert.equal(framePointInverse(child, [0.75, 0, 0])[0], undefined);
  assert.ok(framePoint(child, [180, 0, 0]).every(Number.isNaN));
  childValues.projectionCenter = [30, 0];
  near(framePoint(child, [30, 0, 0]), [0, 0, 0]);
});

test("a fitted polar grandchild composes through sqrt and log Cartesian ancestors", () => {
  const rootValues = { coordinates: "cartesian", xbounds: [0, 16], ybounds: [1, 100],
    zbounds: [-1, 1], xrange: [-1, 1], yrange: [-1, 1], zrange: [-1, 1] };
  const root = { get: key => rootValues[key], frameDefinition: {
    parent: null, placement: null, mode: () => "2d", owns: () => true, ranges: new Set(),
  } };
  const chartValues = { coordinates: "cartesian", xbounds: [0, 4], ybounds: [1, 100],
    xTransform: "sqrt", yTransform: "log", _frameXRange: [0, 16], _frameYRange: [1, 100] };
  const chart = { get: key => chartValues[key] ?? root.get(key), frameDefinition: {
    parent: root, placement: null, mode: () => "2d", owns: axis => axis !== "z",
    ranges: new Set(["x", "y"]),
  } };
  const diskValues = { coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    polarAxis: "Z", baseRadius: 0, radialScale: 1,
    xbounds: [0, 24], ybounds: [0, 1], _frameXRange: [0, 4], _frameYRange: [1, 5] };
  const disk = { get: key => diskValues[key] ?? chart.get(key), frameDefinition: {
    parent: chart, placement: null, mode: () => "2d", ranges: new Set(["x", "y"]),
  } };
  const world = framePoint(disk, [6, 1, 0]);
  near(world, [Math.SQRT2 - 1, 2 * Math.log(5) / Math.log(100) - 1, 0]);
  near(framePointInverse(disk, world), [6, 1, 0]);
});

test("a polar disk crosses Cartesian ranges and a spherical ancestor once", () => {
  const globeValues = { coordinates: "spherical",
    projection: "orthographic", projectionCenter: [0, 0],
    angleUnit: "degrees", baseRadius: 1, radialScale: 1,
    xbounds: [-180, 180], ybounds: [-90, 90] };
  const globe = { get: key => globeValues[key], frameDefinition: {
    parent: null, placement: null, ranges: new Set(), owns: () => true,
  } };
  const chartValues = { coordinates: "cartesian", xbounds: [-1, 1],
    ybounds: [-1, 1], _frameXRange: [-45, 45], _frameYRange: [-30, 30] };
  const chart = { get: key => chartValues[key] ?? globe.get(key), frameDefinition: {
    parent: globe, placement: null, ranges: new Set(["x", "y"]),
    owns: () => true,
  } };
  const diskValues = { coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    baseRadius: 0, radialScale: 1, polarAxis: "Z", xbounds: [0, 24],
    ybounds: [0, 1], _frameXRange: [-1, 1], _frameYRange: [-1, 1] };
  const disk = { get: key => diskValues[key] ?? chart.get(key), frameDefinition: {
    parent: chart, placement: null, ranges: new Set(["x", "y"]),
    owns: () => true,
  } };
  assert.deepEqual(buildCoordinateOperations(disk).map(operation => operation.kind),
    ["polar", "fit", "scale", "spherical-map2d"]);
  near(framePoint(disk, [0, 1, 0]), [Math.SQRT1_2, 0, 0]);
  near(framePoint(disk, [6, 1, 0]), [0, 0.5, 0]);
  near(framePointInverse(disk, framePoint(disk, [6, 1, 0])), [6, 1, 0]);
});
