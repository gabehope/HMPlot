import test from "node:test";
import assert from "node:assert/strict";
import { OrthographicCamera } from "three/webgpu";
import { orthographicPolyline } from "../../src/lib/plot/utils/vectorExport.js";

const camera = (radius = 2) => {
  const result = new OrthographicCamera(-radius, radius, radius, -radius, 0.1, 100);
  result.position.z = 10;
  result.lookAt(0, 0, 0);
  result.updateProjectionMatrix();
  result.updateMatrixWorld();
  return result;
};
const options = (extra = {}) => {
  const values = { coordinates: "spherical", projection: "orthographic",
    projectionCenter: [0, 0], angleUnit: "degrees",
    baseRadius: 1, radialScale: 1, interpolation: "angular", ...extra };
  return { get: (key) => values[key] };
};

test("orthographic vector sampling stops at the horizon and separates visible arcs", () => {
  const view = camera();
  const line = orthographicPolyline([0, 0], [100, 0], options(), view, 400, 400, 0.5, 1000);
  assert.equal(line.paths.length, 1);
  assert.ok(Math.abs(line.paths[0][0][0] - 200) < 1e-6);
  assert.ok(Math.abs(line.paths[0].at(-1)[0] - 300) < 1e-3);
  const crossing = orthographicPolyline([40, 30], [320, 30], options(), view, 400, 400, 0.5, 1000);
  assert.equal(crossing.paths.length, 2);
  for (const arc of crossing.paths) {
    const xs = arc.map((point) => point[0]);
    assert.ok(Math.max(...xs) < 175 || Math.min(...xs) > 225);
  }
  assert.deepEqual(orthographicPolyline([120, 0], [150, 0], options(), view,
    400, 400, 0.5, 1000), { paths: [], ranges: [], count: 0 });
});

test("orthographic vector sampling respects periods, budgets and invalid rows", () => {
  const view = camera(), custom = options({ angleUnit: "custom", anglePeriod: 24 });
  const line = orthographicPolyline([0, 0], [8, 0], custom, view, 400, 400, 0.5, 1000);
  assert.equal(line.paths.length, 1);
  assert.ok(Math.abs(line.paths[0].at(-1)[0] - 300) < 1e-3);
  assert.equal(orthographicPolyline([0, 0], [8, 0], custom, view, 400, 400,
    0.5, 1).overflow, true);
  assert.deepEqual(orthographicPolyline([NaN, 0], [8, 0], custom, view,
    400, 400, 0.5, 1000), { paths: [], ranges: [], count: 0 });
  const reversed = orthographicPolyline([8, 0], [0, 0], custom, view, 400, 400, 0.5, 1000);
  assert.equal(reversed.paths.length, 1);
  assert.ok(Math.abs(reversed.paths[0].at(-1)[0] - 200) < 1e-6);
  const close = camera(0.05), coarse = orthographicPolyline([0, 0], [8, 0], custom,
    close, 400, 400, 0.5, 1000), fine = orthographicPolyline([0, 0], [8, 0], custom,
    close, 400, 400, 0.1, 1000);
  assert.ok(fine.count > coarse.count);
});
