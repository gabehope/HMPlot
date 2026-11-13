import test from "node:test";
import assert from "node:assert/strict";
import { createFrameDimension } from "../../src/lib/plot/utils/frameMapping.js";
import { angularPeriod, sphericalPoint, polarAngleRadians, polarPoint, inversePolarPoint,
  orthographicBasis, orthographicAtCenter, inverseOrthographicAtCenter,
  normalizeProjectionCenter, draggedProjectionCenter, grabbedProjectionCenter } from "../../src/lib/plot/utils/coordinates.js";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("Stage 14 control: three Cartesian levels compose in parent data space", () => {
  const root = createFrameDimension({ domain: [0, 100], range: [-1, 1], transform: "sqrt" });
  const middle = createFrameDimension({ domain: [1, 100], range: [25, 100], transform: "log" }, root);
  const child = createFrameDimension({ domain: [0, 10], range: [1, 100] }, middle);
  // Child midpoint maps to 50.5 in middle data; middle maps that into
  // [25, 100] in root data, then root applies sqrt once.
  const middleData = 1 + (100 - 1) * 0.5;
  const rootData = 25 + Math.log(middleData) / Math.log(100) * 75;
  const expected = -1 + 2 * Math.sqrt(rootData) / 10;
  near(child.forward(5), expected);
  near(child.inverse(expected), 5);
});

test("Stage 14 control: custom spherical period does not follow domain changes", () => {
  const settings = { angleUnit: "custom", anglePeriod: 24, xbounds: [0, 24], baseRadius: 1 };
  for (const bounds of [[0, 24], [6, 12], [-100, 100]]) {
    settings.xbounds = bounds;
    assert.equal(angularPeriod(settings), 24);
    const point = sphericalPoint([6, 0, 0], settings);
    near(point[0], 1);
    near(point[1], 0);
    near(point[2], 0);
  }
});

test("polar contract: a 24-unit turn and axial height have known positions on every 3D axis", () => {
  const settings = { angleUnit: "custom", anglePeriod: 24, baseRadius: 1, radialScale: 2 };
  for (const [angle, expected] of [[0, [5, 0, 3]], [6, [0, 5, 3]],
    [12, [-5, 0, 3]], [24, [5, 0, 3]], [-6, [0, -5, 3]]]) {
    const actual = polarPoint([angle, 2, 3], settings);
    actual.forEach((value, index) => near(value, expected[index]));
  }
  const quarter = [0, 5, 3];
  for (const [axis, expected] of [["Z", quarter], ["X", [3, 0, 5]], ["Y", [5, 3, 0]]]) {
    const config = { ...settings, polarAxis: axis };
    polarPoint([6, 2, 3], config).forEach((value, index) => near(value, expected[index]));
    const inverse = inversePolarPoint(expected, config);
    [6, 2, 3].forEach((value, index) => near(inverse[index], value));
    // The three local basis vectors retain handedness under each axis choice.
    const origin = polarPoint([0, 0, 0], { ...config, baseRadius: 0, radialScale: 1 });
    const east = polarPoint([0, 1, 0], { ...config, baseRadius: 0, radialScale: 1 }).map((v, i) => v - origin[i]);
    const north = polarPoint([6, 1, 0], { ...config, baseRadius: 0, radialScale: 1 }).map((v, i) => v - origin[i]);
    const up = polarPoint([0, 0, 1], { ...config, baseRadius: 0, radialScale: 1 }).map((v, i) => v - origin[i]);
    const cross = [east[1] * north[2] - east[2] * north[1],
      east[2] * north[0] - east[0] * north[2], east[0] * north[1] - east[1] * north[0]];
    near(cross.reduce((sum, v, i) => sum + v * up[i], 0), 1);
  }
});

test("polar radians and custom periods keep their meaning when the angular domain changes", () => {
  const radians = { angleUnit: "radians", xbounds: [-Math.PI, Math.PI], baseRadius: 0 };
  for (const bounds of [[-Math.PI, Math.PI], [0, Math.PI / 2], [10, 20]]) {
    radians.xbounds = bounds;
    near(angularPeriod(radians), 2 * Math.PI);
    polarPoint([Math.PI / 2, 2, 0], radians).forEach((value, axis) => near(value, [0, 2, 0][axis]));
  }
  const custom = { angleUnit: "custom", anglePeriod: 24, xbounds: [0, 24] };
  for (const bounds of [[0, 24], [6, 12], [-100, 100]]) {
    custom.xbounds = bounds;
    near(angularPeriod(custom), 24);
    polarPoint([6, 2, 0], custom).forEach((value, axis) => near(value, [0, 2, 0][axis]));
  }
});

test("polar contract: extent origin, singular radius, invalid values and period", () => {
  const extent = { angleUnit: "extent", xbounds: [6, 30] };
  near(polarAngleRadians(6, extent), 0);
  near(polarAngleRadians(12, extent), Math.PI / 2);
  polarPoint([6, 2, 0], extent).forEach((value, index) => near(value, [2, 0, 0][index]));
  assert.deepEqual(polarPoint([17, 0, 0]), [0, 0, 0]);
  assert.equal(inversePolarPoint([0, 0, 0])[0], undefined);
  assert.equal(polarPoint([0, -2, 0]), null);
  assert.equal(polarPoint([NaN, 2, 0]), null);
  assert.equal(polarPoint([0, Infinity, 0]), null);
  assert.throws(() => polarPoint([0, 1, 0], { polarAxis: "Q" }),
    { message: "Polar axis must be X, Y or Z." });
  assert.throws(() => polarPoint([0, 1, 0], { angleUnit: "custom", anglePeriod: 0 }),
    { message: "Polar custom angle period must be finite and positive." });
  assert.throws(() => polarPoint([0, 1, 0], { angleUnit: "extent", xbounds: [4, 4] }),
    { message: "Polar extent angle units require a finite, nonconstant X domain." });
});

test("orthographic contract: centers rotate the visible hemisphere without roll", () => {
  const center = { projectionCenter: [30, 20] };
  orthographicAtCenter([30, 20, 0], center).forEach((value) => near(value, 0));
  assert.equal(orthographicAtCenter([210, -20, 0], center), null);
  const east = orthographicAtCenter([120, 0, 0], { projectionCenter: [30, 0] });
  near(east[0], 1);
  near(east[1], 0);
  const northPole = { projectionCenter: [40, 90] };
  const basis = orthographicBasis(northPole);
  near(basis.north[1], 0);
  near(basis.outward[1], 1);
  const atPole = orthographicAtCenter([40, 80, 0], northPole);
  near(atPole[0], 0);
  assert.ok(atPole[1] < 0);
  for (const point of [[30, 20], [40, 35], [-10, 0]]) {
    const projected = orthographicAtCenter(point, center);
    const inverse = inverseOrthographicAtCenter(projected, center);
    point.forEach((value, index) => near(inverse[index], value));
  }
  assert.equal(inverseOrthographicAtCenter([1.1, 0], center), null);
  assert.throws(() => orthographicAtCenter([0, 0], { projectionCenter: [0, 91] }),
    { message: "Orthographic projectionCenter latitude must lie between the poles." });
});

test("projection center normalizes a custom period and clamps only interactive latitude", () => {
  const options = { angleUnit: "custom", anglePeriod: 24 };
  assert.deepEqual(normalizeProjectionCenter([30, 5], options), [6, 5]);
  assert.deepEqual(normalizeProjectionCenter([30, 7], options, { clampLatitude: true }), [6, 6]);
  assert.throws(() => normalizeProjectionCenter([30, 7], options), /between the poles/);
  assert.throws(() => normalizeProjectionCenter([NaN, 0], options), /two finite angular values/);
  const extent = { angleUnit: "extent", xbounds: [6, 30] };
  assert.deepEqual(normalizeProjectionCenter([42, 0], extent), [18, 0]);
});

test("orthographic drags rotate the center through known quarter turns without roll", () => {
  const right = draggedProjectionCenter([0, 0], Math.PI / 2, 0, 1);
  near(right[0], -90); near(right[1], 0);
  const down = draggedProjectionCenter([0, 0], 0, -Math.PI / 2, 1);
  near(down[0], 0); near(down[1], 90);
  const custom = draggedProjectionCenter([0, 0], Math.PI / 2, 0, 1,
    { angleUnit: "custom", anglePeriod: 24 });
  near(custom[0], -6); near(custom[1], 0);
  assert.deepEqual(draggedProjectionCenter([40, 90], 0, 0, 1), [40, 90]);
  const north = draggedProjectionCenter([0, 80], 0, -15 * Math.PI / 180, 1);
  near(north[0], 0); near(north[1], 90);
  const south = draggedProjectionCenter([35, -80], 0, 15 * Math.PI / 180, 1);
  near(south[0], 35); near(south[1], -90);
  const diagonal = draggedProjectionCenter([0, 80], -0.01, -15 * Math.PI / 180, 1);
  assert.ok(diagonal[1] >= 80 && diagonal[1] <= 90);
  assert.ok(Math.abs(diagonal[0]) < 90, `longitude flipped near the pole: ${diagonal[0]}`);
});

test("grabbing the globe: the solved center puts the grabbed point under the pointer, north up", () => {
  for (const [grab, point] of [[[18, 59], [0.2, -0.1]], [[-74, 40.7], [-0.5, 0.3]], [[0, 0], [0, 0.5]], [[150, -30], [0.6, 0.6]]]) {
    const center = grabbedProjectionCenter(grab, point, 1);
    const at = orthographicAtCenter(grab, { projectionCenter: center });
    near(at[0], point[0]); near(at[1], point[1]);
  }
  // A point at 85 degrees cannot be carried half the disk sideways without rolling the globe.
  assert.equal(grabbedProjectionCenter([0, 85], [0.5, 0], 1), null);
  // Far-side longitudes can still face a tilted camera. A stationary grab must keep
  // the existing center, and a small motion must stay on that solution branch.
  for (const [grab, center] of [[[170, 75], [0, 60]], [[-170, -75], [0, -60]], [[145, 70], [25, 55]]]) {
    const options = { projectionCenter: center }, point = orthographicAtCenter(grab, options);
    grabbedProjectionCenter(grab, point, 1, options).forEach((value, i) => near(value, center[i]));
    const moved = [point[0] + 0.01, point[1] - 0.01], next = grabbedProjectionCenter(grab, moved, 1, options);
    assert.ok(Math.abs(next[0] - center[0]) < 5);
    orthographicAtCenter(grab, { projectionCenter: next }).forEach((value, i) => near(value, moved[i]));
  }
  for (const [point, center] of [[[0, 0.5], [73, 60]], [[0, -0.5], [-42, -60]], [[1, 0], [0, 47]]]) {
    const options = { projectionCenter: center }, grab = inverseOrthographicAtCenter(point, options);
    grabbedProjectionCenter(grab, point, 1, options).forEach((value, i) => near(value, center[i]));
  }
});

test("a nearly horizontal drag near a pole moves steadily, whichever way it tilts", () => {
  // Horizontal motion turns longitude and vertical motion latitude, independently: jitter
  // across the drag changes the center by the jitter only (a great-circle drag stopped at its
  // latitude extremum stalled and reversed here when the drag tilted poleward).
  for (const tilt of [0.02, 0, -0.02]) {
    const path = [0.1, 0.2, 0.3].map((dx) => draggedProjectionCenter([0, 60], dx, tilt, 1));
    path.forEach(([longitude], i) => near(longitude, -(i + 1) * 0.1 * 180 / Math.PI));
    for (const [, latitude] of path) near(latitude, 60 - tilt * 180 / Math.PI);
  }
  // Dragging on past a pole stays at the pole with the same longitude, then comes back.
  const over = draggedProjectionCenter([30, 70], 0, -Math.PI / 2, 1);
  near(over[0], 30); near(over[1], 90);
  const back = draggedProjectionCenter([30, 70], 0, 0.1, 1);
  near(back[1], 70 - 0.1 * 180 / Math.PI);
});

test("spherical contract: a zero or invalid angle period is a configuration error, not a point", async () => {
  const { resolveCoordinateOperations } = await import("../../src/lib/plot/utils/coordinateOperations.js");
  const root = (values) => ({ get: (key) => values[key], has: (key) => key in values });
  for (const [projection, angles] of [
    ["orthographic", { angleUnit: "extent", xbounds: [5, 5] }],
    ["equirectangular", { angleUnit: "custom", anglePeriod: 0 }],
    ["mercator", { angleUnit: "custom", anglePeriod: NaN }],
  ]) {
    const values = { coordinates: "spherical", projection, ybounds: [-90, 90],
      xbounds: [-180, 180], ...angles };
    // The chain refuses to resolve, which the plot reports as its render error...
    assert.throws(() => resolveCoordinateOperations(root(values)),
      { message: "Coordinate angle period must be finite and positive." }, projection);
    // ...and a lone point in it has no surface coordinate.
    assert.equal(sphericalPoint([10, 20, 0], values), null, projection);
  }
});
