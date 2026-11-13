// TODO 39.5-39.6: joint map projections (equal-earth, natural-earth, albers, albers-usa) against
// d3-geo, and their forms agreeing: the CPU chain, the operation table's CPU twin (which reads the
// words the WGSL reads) and the jax mapping.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as d3 from "d3";
import { numpy as np } from "@hmplot/jax";
import {
  PROJECTION_NAMES, JOINT_PROJECTIONS, jointForward, jointInverse, jointBounds, projectionParameters,
  conicParameters, albersUsa,
} from "../../src/lib/plot/utils/mapProjections.js";
import { operationSampler } from "../../src/lib/plot/utils/operationTable.js";
import { mapOperations } from "../../src/lib/plot/utils/coordinateArrays.js";
import { periodicSpherical, coordinateValue, jointProjectionOf, sphericalDomain } from "../../src/lib/plot/utils/coordinates.js";
import { repeatingRootMap, pathOperationFlags } from "../../src/lib/plot/utils/coordinateOperations.js";
import { MAP_FLAGS } from "../../src/lib/plot/utils/operationTable.js";
import { mapGuides } from "../../src/lib/plot/utils/mapGuides.js";
import { orthographicGuides } from "../../src/lib/plot/utils/orthographicGuides.js";

const D = Math.PI / 180;
const WORLD = [[0, 0], [45, 30], [-120, -60], [179, 10], [-179, -89], [90, 89], [10, -45], [-60, 5]];
const US = [[-96, 38.7], [-122.4, 37.8], [-74, 40.7], [-80.2, 25.8], [-150, 61.2], [-165, 64.5], [-157.8, 21.3], [-155.5, 19.6]];
const map = (projection, extra = {}) => {
  const values = { coordinates: "spherical", projection, projectionCenter: [0, 0], angleUnit: "degrees",
    baseRadius: 1, radialScale: 1, ...extra };
  return { get: (key) => values[key] };
};

test("each projection matches d3-geo's, and its inverse round-trips", () => {
  const closeTo = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} vs ${b}`);
  for (const [name, d3projection] of [["equal-earth", d3.geoEqualEarth()], ["natural-earth", d3.geoNaturalEarth1()]]) {
    d3projection.scale(1).translate([0, 0]);
    for (const [lon, lat] of WORLD) {
      const ours = jointForward(name, lon * D, lat * D), theirs = d3projection([lon, lat]);
      // d3's screen y points down.
      closeTo(ours[0], theirs[0], 1e-12, `${name} x ${lon},${lat}`);
      closeTo(ours[1], -theirs[1], 1e-12, `${name} y ${lon},${lat}`);
      const back = jointInverse(name, ...ours);
      closeTo(back[0] / D, lon, 1e-8, `${name} inverse λ`);
      closeTo(back[1] / D, lat, 1e-8, `${name} inverse φ`);
    }
  }
  // albers: a conic around its center [lon0, lat0], d3.geoConicEqualArea rotated and centered.
  for (const [parallels, center] of [[[29.5, 45.5], [-96, 38.7]], [[20, 50], [10, 0]], [[-45, -20], [140, -30]]]) {
    const params = projectionParameters("albers", { parallels, centerLatitude: center[1] * D });
    const theirs = d3.geoConicEqualArea().parallels(parallels).rotate([-center[0], 0]).center([0, center[1]])
      .scale(1).translate([0, 0]);
    for (const [lon, lat] of WORLD.filter(([lon]) => Math.abs(lon - center[0]) < 170)) {
      const ours = jointForward("albers", (lon - center[0]) * D, lat * D, params), point = theirs([lon, lat]);
      closeTo(ours[0], point[0], 1e-12, `albers x ${lon},${lat}`);
      closeTo(ours[1], -point[1], 1e-12, `albers y ${lon},${lat}`);
      const back = jointInverse("albers", ...ours, params);
      closeTo(back[1] / D, lat, 1e-8, "albers inverse φ");
    }
  }
  const usa = d3.geoAlbersUsa().scale(1).translate([0, 0]);
  for (const [lon, lat] of US) {
    const ours = albersUsa(lon * D, lat * D), theirs = usa([lon, lat]);
    closeTo(ours.point[0], theirs[0], 1e-12, `albers-usa x ${lon},${lat}`);
    closeTo(ours.point[1], -theirs[1], 1e-12, `albers-usa y ${lon},${lat}`);
    const back = jointInverse("albers-usa", ...ours.point);
    closeTo(back[0] / D, lon, 1e-8, "albers-usa inverse λ");
    closeTo(back[1] / D, lat, 1e-8, "albers-usa inverse φ");
  }
  // Alaska and Hawaii take their insets; a point outside all three is off the map, as d3's.
  assert.deepEqual([[-150, 61.2], [-157.8, 21.3], [-96, 38.7]].map(([lon, lat]) => albersUsa(lon * D, lat * D).inset), [1, 2, 0]);
  assert.equal(albersUsa(10 * D, 50 * D), null);
  assert.equal(usa([10, 50]), null);
  // A point outside the outline has no preimage.
  assert.equal(jointInverse("equal-earth", 3, 0), null);
});

test("the CPU chain, the operation table and jax agree, seam included", async () => {
  for (const projection of JOINT_PROJECTIONS) {
    const params = projectionParameters(projection, { centerLatitude: 20 * D });
    const op = { kind: "spherical-map2d", factor: D, origin: 0, base: 1, radial: 1, projection,
      centerLongitude: 30 * D, centerLatitude: 20 * D, ...(params ? { conic: [params.n, params.c, params.rho0] } : {}) };
    const points = [...WORLD, ...US];
    const sample = operationSampler([op]);
    const input = np.array(new Float32Array(points.flatMap(([lon, lat]) => [lon, lat, 0]))).reshape([points.length, 3]);
    const jax = Array.from(await mapOperations(input, [op]).data());
    input.dispose();
    points.forEach(([lon, lat], i) => {
      const cpu = projection === "albers-usa" ? albersUsa(lon * D, lat * D)?.point ?? null
        : jointForward(projection, (lon - 30) * D, lat * D, params);
      const table = sample([lon, lat, 0]);
      if (!cpu) {
        assert.equal(table.valid, false, `${projection} ${lon},${lat} off the map`);
        assert.ok(Number.isNaN(jax[i * 3]), `${projection} jax ${lon},${lat}`);
        return;
      }
      for (const k of [0, 1]) {
        assert.ok(Math.abs(table.point[k] - cpu[k]) < 2e-5, `${projection} table ${lon},${lat}`);
        assert.ok(Math.abs(jax[i * 3 + k] - cpu[k]) < 2e-5, `${projection} jax ${lon},${lat}`);
      }
    });
    // The seam (the center + 180°) changes the seam index; albers-usa's insets do too.
    if (projection !== "albers-usa")
      assert.notEqual(sample([209, 0, 0]).seam, sample([211, 0, 0]).seam, `${projection} seam`);
    else assert.notEqual(sample([-150, 61.2, 0]).seam, sample([-96, 38.7, 0]).seam, "albers-usa insets");
  }
});

test("joint maps are one extent: no repeat, cut at the seam, and the click inverse", () => {
  for (const projection of JOINT_PROJECTIONS) {
    const options = map(projection, { projectionCenter: [150, projection === "albers" ? 30 : 0] });
    assert.equal(periodicSpherical(options), false, projection);
    const operations = [{ kind: "spherical-map2d", options }];
    assert.equal(repeatingRootMap(operations), false, projection);
    assert.equal(pathOperationFlags(operations)(), MAP_FLAGS.cutMercator, projection);
    // coordinateValue (a click) inverts the map at its center longitude.
    const joint = jointProjectionOf(options);
    const [lon, lat] = projection === "albers-usa" ? [-100, 40] : [160, 25];
    const world = jointForward(projection, (lon - 150) * D, lat * D, joint.params, { center: joint.center });
    const back = coordinateValue(options, [...world, 0]);
    assert.ok(Math.abs(back[0] - lon) < 1e-6 && Math.abs(back[1] - lat) < 1e-6, `${projection}: ${back}`);
  }
  assert.equal(periodicSpherical(map("equirectangular")), true);
});

test("bounds, parameters and guides", () => {
  const bounds = jointBounds("equal-earth");
  assert.ok(Math.abs(bounds.x[1] - 2.7066299836960748) < 1e-9 && Math.abs(bounds.y[1] - 1.3173627591574133) < 1e-9);
  assert.deepEqual(jointBounds("albers-usa"), { x: [-0.455, 0.455], y: [-0.238, 0.238] });
  assert.throws(() => conicParameters(-30 * D, 30 * D),
    /^Error: albers parallels must not be symmetric about the equator; use projection "equal-area"\.$/);
  assert.throws(() => projectionParameters("albers", { parallels: [10] }), /^Error: albers parallels must be two finite latitudes\.$/);
  const frame = { x: bounds.x, y: bounds.y };
  const guides = mapGuides(map("equal-earth"), frame, 400, 200);
  // Meridians every 15° (23 inside the seam), parallels every 15° (11), and the outline.
  assert.equal(guides.meridians.length, 23);
  assert.equal(guides.parallels.length, 11);
  assert.match(guides.outline, /^M[\d.]+ [\d.]+L.*Z$/);
  assert.equal(mapGuides(map("albers-usa"), frame, 400, 200), null);
  assert.equal(mapGuides(map("equirectangular"), frame, 400, 200), null);
});

test("a 2D orthographic globe: full size, its outline, a 15° graticule and labels apart", () => {
  const globe = { ...map("orthographic", { zbounds: [-1, 1] }), child: () => ({ get: () => undefined }), isExplicit: () => false };
  // No mark maps z: the disk is the sphere's, not grown by the default zbounds (TODO 135.5).
  assert.deepEqual(sphericalDomain(globe), { x: [-1, 1], y: [-1, 1] });
  assert.deepEqual(sphericalDomain({ ...globe, isExplicit: () => true }), { x: [-2, 2], y: [-2, 2] });
  // Options that cannot say whether zbounds was set (a proxy or a copy) count it as not set.
  assert.deepEqual(sphericalDomain(map("orthographic", { zbounds: [-1, 1] })), { x: [-1, 1], y: [-1, 1] });
  const guides = orthographicGuides(globe, { x: [-1.2, 1.2], y: [-1.2, 1.2] }, 480, 480);
  assert.deepEqual(guides.outline, { cx: 240, cy: 240, rx: 200, ry: 200 });
  assert.ok(guides.x.major.every(({ value }) => value % 15 === 0));
  assert.deepEqual(guides.y.major.map(({ value }) => value), [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75]);
  assert.ok([...guides.x.major, ...guides.y.major].every(({ showLabel }) => !showLabel));
  // An axis's own step labels its lines: meridians along the equator, not stacked at a pole, and
  // a label that would overlap one nearer the center hidden.
  const plot = { get: (key) => key === "axisXStep" ? 10 : undefined };
  const labeled = orthographicGuides({ ...globe, child: () => plot }, { x: [-1.2, 1.2], y: [-1.2, 1.2] }, 480, 480)
    .x.major.filter((guide) => guide.showLabel && guide.anchor);
  assert.ok(labeled.every(({ anchor }) => Math.abs(anchor.y - 240) < 1));
  assert.deepEqual(labeled.map(({ value }) => value), [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60]);
});

test("a globe's tick labels: seen from a pole, labelOverlap, and only the shown axes collide", () => {
  const frame = { x: [-1.2, 1.2], y: [-1.2, 1.2] };
  const globe = (center, axes) => ({ ...map("orthographic", { projectionCenter: center }),
    child: () => ({ get: (key) => axes[key] }) });
  const shown = (guides, axis) => guides[axis].major.filter((guide) => guide.showLabel && guide.anchor);
  // Near a pole the meridians fan out from the center: each label at its outer end, not all at
  // the pole (the center's latitude) where one of the twelve was kept.
  assert.ok(shown(orthographicGuides(globe([0, 90], { axisXStep: 30 }), frame, 480, 480), "x").length >= 10);
  // labelOverlap "show" keeps every label on the face.
  const all = orthographicGuides(globe([0, 0], { axisXStep: 10, axisXLabelOverlap: "show" }), frame, 480, 480);
  assert.equal(shown(all, "x").length, all.x.major.filter((guide) => guide.anchor).length);
  // A hidden axis's labels do not hide the shown one's.
  const tilted = globe([0, 60], { axisXStep: 30, axisYStep: 15 });
  assert.ok(shown(orthographicGuides(tilted, frame, 480, 480, { shown: { x: false, y: true } }), "y").length >
    shown(orthographicGuides(tilted, frame, 480, 480), "y").length);
});

test("the projection list is the public type's", () => {
  const types = readFileSync(new URL("../../src/lib/plot/publicTypes.ts", import.meta.url), "utf8");
  const declaration = /\bprojection\?\s*:\s*([^;]+);/.exec(types)?.[1];
  assert.ok(declaration, "public projection declaration exists");
  const literals = /"([\w-]+)"/g;
  const union = [...declaration.matchAll(literals)].map((match) => match[1]);
  assert.equal(declaration.replace(literals, "").replace(/[\s|]/g, ""), "",
    "projection is a union of string literals");
  assert.deepEqual(union, PROJECTION_NAMES);
});
