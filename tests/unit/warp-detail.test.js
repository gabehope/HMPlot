import test from "node:test";
import assert from "node:assert/strict";
import { OrthographicCamera } from "three/webgpu";
import { warpDetail, ringSegments, ringPixelsPerUnit } from "../../src/lib/plot/utils/surfaceGeometry.js";

const frame = (values) => ({
  get: (key) => values[key],
  frameDefinition: { parent: null, placement: null, ranges: new Set(), owns: () => true },
});
// A 400-pixel view of world [-2, 2] × [-2, 2]: 100 pixels per world unit.
const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
camera.position.set(0, 0, 5);
camera.updateMatrixWorld();
camera.updateProjectionMatrix();

test("a warped grid's detail follows its screen curvature and the tolerance", () => {
  const polar = frame({ coordinates: "polar", angleUnit: "custom", anglePeriod: 24, baseRadius: 0,
    radialScale: 1, polarAxis: "Z", xbounds: [0, 24], ybounds: [0, 2] });
  // The rim is a full turn at 200 pixels: a chord across 1/n of it sags
  // 200 (2π)² / (8 n²), within 0.4 pixels from n ≈ 50.
  const n = warpDetail(polar, camera, 400, 400, 0.4);
  const expected = Math.sqrt(200 * (2 * Math.PI) ** 2 / (8 * 0.4));
  assert.ok(Math.abs(n - expected) <= 2, `${n} vs ${expected}`);
  // A quarter of the tolerance needs twice the cells.
  const fine = warpDetail(polar, camera, 400, 400, 0.1);
  assert.ok(Math.abs(fine - 2 * expected) <= 3, `${fine}`);
  // An affine mapping has no curvature.
  const flat = frame({ coordinates: "cartesian", xbounds: [-1, 1], ybounds: [-1, 1] });
  assert.equal(warpDetail(flat, camera, 400, 400, 0.4), 0);
});

test("a polar frame's drawn size, and its arcs' segments per turn", () => {
  const polar = (yb) => frame({ coordinates: "polar", angleUnit: "degrees", baseRadius: 0, radialScale: 1,
    polarAxis: "Z", xbounds: [0, 360], ybounds: yb });
  // 100 pixels per world unit, the rim at radius 2: 200 pixels, so 100 per unit of radius.
  assert.ok(Math.abs(ringPixelsPerUnit(polar([0, 2]), camera, 400, 400) - 100) < 0.01);
  // Twice the canvas's pixels for the same view (a pixel ratio of 2).
  assert.ok(Math.abs(ringPixelsPerUnit(polar([0, 2]), camera, 800, 800) - 200) < 0.01);
  // A chord across 1/n of a turn at 200 pixels sags 200 (2π/n)² / 8: 0.5 pixels at n = π √200.
  assert.ok(Math.abs(ringSegments(200, 0.5) - Math.PI * Math.sqrt(200)) < 1e-9);
});
