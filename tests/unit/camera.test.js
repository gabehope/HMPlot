import test from "node:test";
import assert from "node:assert/strict";
import {
  viewMode, viewUp, panOffset, wheelStep, resolveCameraState, validateCameraPatch, lerpCamera, SHIFT_MULTIPLIER,
  cursorRay, cameraBasis, groundDistance, groundHeight, horizonCap, groundPoint, rayPoint, anchorPan,
  zoomStep, zoomToward, zoomMinDistance, reseatTarget, flyVelocity, clampFlySpeed,
  cameraStateIssue, cameraValueIssue, explicitCameraKey, pinchStep,
} from "../../src/lib/plot/utils/camera.js";

const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const length = (a) => Math.hypot(...a);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const closeVector = (a, b, eps = 1e-9) => a.forEach((v, i) => close(v, b[i], eps));
const FAR = 2000;

/** Project a world point to NDC through the pure basis, the inverse of cursorRay. */
function project(state, point, aspect) {
  const { forward, right, screenUp } = cameraBasis(state);
  const offset = sub(point, state.position);
  const depth = dot(offset, forward);
  const half = Math.tan(((state.fov ?? 50) * Math.PI) / 360) / (state.zoom || 1);
  return [dot(offset, right) / depth / (half * aspect), dot(offset, screenUp) / depth / half];
}

test("rate-based pan and view-axis dolly remain for globe views and cameras on the ground", () => {
  const view = { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0] };
  const offset = panOffset(view, 10, 0, { fov: 90, height: 100 });
  close(offset[0], -2); // dragging right moves the camera left
  close(offset[1], 0); // never changes height
  close(panOffset(view, 0, 10, { fov: 90, height: 100 })[2], -2); // dragging down moves forward
  assert.ok(wheelStep(100, 0, 10) < 0, "scroll down moves back");
  close(wheelStep(-100000, 0, 10), 5); // clamped to half the focus distance
  assert.equal(SHIFT_MULTIPLIER, 3);
  assert.equal(clampFlySpeed(0), 0.1);
  assert.equal(clampFlySpeed(50), 10);
  assert.equal(clampFlySpeed(NaN), 1);
  assert.equal(clampFlySpeed(2.5), 2.5);
});

test("the centre ray of a camera at [0, 10, 10] looking at the origin hits the ground at the origin", () => {
  const state = { position: [0, 10, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 50 };
  const ray = cursorRay(state, [0, 0], { aspect: 1.5 });
  closeVector(ray.direction, [0, -Math.SQRT1_2, -Math.SQRT1_2]);
  closeVector(groundPoint(ray, state.up, FAR), [0, 0, 0]);
  close(groundDistance(ray, state.up), Math.hypot(10, 10));
  close(groundHeight(state.position, state.up), 10);
  // The sky and a ray parallel to the ground are infinitely far.
  assert.equal(groundDistance({ origin: [0, 10, 0], direction: [0, 1, 0] }, [0, 1, 0]), Infinity);
  assert.equal(groundDistance({ origin: [0, 10, 0], direction: [1, 0, 0] }, [0, 1, 0]), Infinity);
  // A camera below the plane looking down never meets it.
  assert.equal(groundDistance({ origin: [0, -10, 0], direction: [0, -1, 0] }, [0, 1, 0]), Infinity);
});

test("the horizon cap is continuous across the horizon and bounded by the far plane", () => {
  const up = [0, 1, 0], origin = [0, 5, 0];
  assert.equal(horizonCap(5, FAR), 100);
  assert.equal(horizonCap(0.2, FAR), 20); // at least 20 units
  assert.equal(horizonCap(1000, FAR), 0.9 * FAR);
  const tiny = 1e-7;
  const below = groundPoint({ origin, direction: [Math.cos(tiny), -Math.sin(tiny), 0] }, up, FAR);
  const above = groundPoint({ origin, direction: [Math.cos(tiny), Math.sin(tiny), 0] }, up, FAR);
  closeVector(below, above, 1e-4);
  closeVector(below, [100, 0, 0], 1e-4);
  // rayPoint stays on the ray (in the sky) while groundPoint is its projection.
  const sky = rayPoint({ origin, direction: [0, Math.SQRT1_2, -Math.SQRT1_2] }, up, FAR);
  close(sky[1], 5 + 100 * Math.SQRT1_2);
  const grabbed = groundPoint({ origin, direction: [0, Math.SQRT1_2, -Math.SQRT1_2] }, up, FAR);
  close(grabbed[1], 0);
  close(grabbed[2], sky[2]);
});

test("an anchored pan returns the grabbed ground point to the same pixel and keeps the height", () => {
  const cases = [
    { position: [0, 20, 120], target: [0, 0, 0], up: [0, 1, 0], fov: 50, aspect: 500 / 320 },
    { position: [30, 80, 10], target: [0, 0, -40], up: [0, 1, 0], fov: 90, aspect: 1 },
    { position: [5, 3, 50], target: [0, 0, 0], up: [0, 1, 0], fov: 30, aspect: 2, zoom: 2.5 },
    { position: [-10, 60, 5], target: [0, 0, 0], up: [0, 1, 0], fov: 70, aspect: 0.7, zoom: 0.5 },
    { position: [0, -40, 25], target: [0, 0, 0], up: [0, 0, 1], fov: 50, aspect: 1.3 }, // z-up
    { position: [0, 2, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 50, aspect: 1.5 }, // steep pitch
  ];
  for (const { aspect, ...state } of cases) {
    for (const [pressed, dragged] of [
      [[0.2, -0.3], [-0.4, 0.1]],
      [[-0.8, -0.9], [0.9, 0.95]], // a drag up to the top edge, past the horizon for the low pitches
      [[0, 0], [0.5, 0.5]],
    ]) {
      const anchor = groundPoint(cursorRay(state, pressed, { aspect }), state.up, FAR);
      close(groundHeight(anchor, state.up), 0);
      // Several intermediate events, each recomputing B from the moved camera.
      let current = { ...state };
      for (let step = 1; step <= 5; step++) {
        const ndc = pressed.map((v, i) => v + ((dragged[i] - v) * step) / 5);
        const delta = anchorPan(anchor, cursorRay(current, ndc, { aspect }), state.up, FAR);
        current = { ...current, position: current.position.map((v, i) => v + delta[i]), target: current.target.map((v, i) => v + delta[i]) };
      }
      const after = groundPoint(cursorRay(current, dragged, { aspect }), state.up, FAR);
      closeVector(after, anchor, 1e-9);
      close(groundHeight(current.position, state.up), groundHeight(state.position, state.up));
      // Orientation is unchanged: the same offset from position to target.
      closeVector(sub(current.target, current.position), sub(state.target, state.position));
    }
  }
});

test("the wheel zooms toward the cursor: the anchor keeps its pixel, and the clamps hold", () => {
  const state = { position: [0, 20, 120], target: [0, 0, 0], up: [0, 1, 0], fov: 50, near: 0.1, far: FAR };
  const aspect = 1.5, ndc = [0.35, -0.2];
  const ray = cursorRay(state, ndc, { aspect });
  const anchor = rayPoint(ray, state.up, state.far);
  const before = project(state, anchor, aspect);
  closeVector(before, ndc);
  const k = zoomStep(-300, 0, 1, false);
  assert.ok(k < 0, "scrolling up approaches");
  const position = zoomToward(state.position, anchor, k);
  const moved = { ...state, position, target: state.target.map((v, i) => v + position[i] - state.position[i]) };
  closeVector(project(moved, anchor, aspect), ndc);
  assert.ok(length(sub(position, anchor)) < length(sub(state.position, anchor)), "the camera got closer");
  assert.ok(position[1] < state.position[1], "zooming in over the ground descends");
  // Scrolling down increases |P - Z|.
  const away = zoomToward(state.position, anchor, zoomStep(300));
  assert.ok(length(sub(away, anchor)) > length(sub(state.position, anchor)));
  // Bounds: approaching stops at the minimum, backing away at the maximum, and neither pushes
  // a camera already inside the bound.
  const limits = { minDistance: zoomMinDistance(state.near, state.far / 20), maxDistance: 0.5 * state.far };
  assert.equal(limits.minDistance, 0.4);
  let p = state.position;
  for (let i = 0; i < 40; i++) p = zoomToward(p, anchor, -0.7, limits);
  close(length(sub(p, anchor)), limits.minDistance);
  for (let i = 0; i < 40; i++) p = zoomToward(p, anchor, 0.7, limits);
  close(length(sub(p, anchor)), limits.maxDistance);
  const inside = zoomToward([0, 0.1, 0], [0, 0, 0], -0.5, limits);
  close(length(inside), 0.1);
  // Step size: 0.001 per pixel, deltaMode lines, clamped, scaled by flySpeed and Shift.
  close(zoomStep(100), 0.1);
  close(zoomStep(3, 1), 0.048);
  close(zoomStep(100000), 0.7);
  close(zoomStep(-100000), -0.7);
  close(zoomStep(100, 0, 2), 0.2);
  close(zoomStep(100, 0, 1, true), 0.3);
  close(zoomStep(100, 0, 2, true), 0.6);
});

test("flySpeed and Shift change the zoom step and key velocity but not the anchored pan", () => {
  const state = { position: [0, 20, 120], target: [0, 0, 0], up: [0, 1, 0], fov: 50 };
  const anchor = groundPoint(cursorRay(state, [0.1, 0.1], { aspect: 1.5 }), state.up, FAR);
  const pan = anchorPan(anchor, cursorRay(state, [-0.3, 0.4], { aspect: 1.5 }), state.up, FAR);
  // anchorPan has no speed parameter: the anchor sets the rate.
  assert.equal(anchorPan.length, 3);
  assert.ok(length(pan) > 0);
  assert.ok(Math.abs(zoomStep(-100, 0, 2)) > Math.abs(zoomStep(-100, 0, 1)));
  close(flyVelocity(20), 14);
  close(flyVelocity(20, 0, 2), 28);
  close(flyVelocity(20, 0, 1, true), 42);
  close(flyVelocity(0.5), 2); // floor near the ground
  close(flyVelocity(0.5, 5000), 50); // floored at 1% of the scene size
});

test("a two-finger pinch keeps the ground point under the midpoint there and scales it with the spread", () => {
  // Spreading approaches (like scrolling up), pinching backs away; the ratio of spreads is exact.
  close(pinchStep(100, 200), Math.log(0.5));
  close(pinchStep(200, 100), Math.log(2));
  assert.equal(pinchStep(150, 150), 0);
  close(pinchStep(100, 10000), -0.7); // clamped like the wheel
  close(pinchStep(10000, 100), 0.7);
  assert.equal(pinchStep(0, 100), 0); // under a pixel of spread: no zoom
  assert.equal(pinchStep(100, 0.5), 0);
  assert.equal(pinchStep(NaN, 100), 0);
  assert.equal(pinchStep.length, 2); // no speed or Shift: the fingers set the rate
  // The gesture as flyoverControls composes it: pan the grabbed point A under the new midpoint,
  // then zoom toward the point under the midpoint by the spread change.
  for (const { aspect, ...state } of [
    { position: [0, 20, 120], target: [0, 0, 0], up: [0, 1, 0], fov: 50, aspect: 500 / 320 },
    { position: [0, -40, 25], target: [0, 0, 0], up: [0, 0, 1], fov: 60, aspect: 1, zoom: 1.5 }, // z-up
  ]) {
    const pressed = [0.1, -0.2], moved = [-0.25, -0.05];
    const anchor = groundPoint(cursorRay(state, pressed, { aspect }), state.up, FAR);
    const pan = anchorPan(anchor, cursorRay(state, moved, { aspect }), state.up, FAR);
    let current = { ...state, position: state.position.map((v, i) => v + pan[i]), target: state.target.map((v, i) => v + pan[i]) };
    const before = length(sub(current.position, anchor));
    const zoomAnchor = rayPoint(cursorRay(current, moved, { aspect }), state.up, FAR);
    closeVector(zoomAnchor, anchor, 1e-9); // A is on the ground, under the midpoint
    const position = zoomToward(current.position, zoomAnchor, pinchStep(120, 180));
    current = { ...current, position, target: current.target.map((v, i) => v + position[i] - current.position[i]) };
    closeVector(project(current, anchor, aspect), moved); // still under the midpoint
    close(length(sub(current.position, anchor)), (before * 120) / 180); // 1.5x the spread, 1.5x the size
  }
});

test("the target re-seats on the centre ray at the ground or the horizon cap", () => {
  const up = [0, 1, 0];
  closeVector(reseatTarget({ position: [0, 10, 10], target: [0, 5, 5], up }, FAR), [0, 0, 0]);
  // Looking at the sky: the target lands at the horizon cap along the view.
  const sky = reseatTarget({ position: [0, 10, 0], target: [0, 11, -1], up }, FAR);
  close(length(sub(sky, [0, 10, 0])), horizonCap(10, FAR));
  // Floored at the minimum distance.
  closeVector(reseatTarget({ position: [0, 0.001, 0], target: [0, 0, 0], up }, FAR, 0.4), [0, -0.399, 0]);
});

test("camera state resolves explicit props over memory over scene defaults, and memory wins under the same props", () => {
  const defaults = resolveCameraState({}, undefined, 2);
  assert.deepEqual(defaults.position, [180, 140, 280]);
  assert.deepEqual(defaults.target, [0, 0, 0]);
  assert.deepEqual(defaults.up, [0, 0, 1]);
  assert.equal(defaults.fov, 50);
  assert.equal(defaults.near, 0.2);
  assert.equal(defaults.far, 4000);
  const memory = { position: [1, 2, 3], target: [4, 5, 6], up: [0, 0, 1], fov: 30, near: 0.5, far: 100 };
  assert.deepEqual(resolveCameraState({}, memory, 1).position, [1, 2, 3]);
  // Props that changed since the memory was saved apply on top of it (a hybrid).
  const mixed = resolveCameraState({ position: [9, 9, 9], fov: 70 }, memory, 1);
  assert.deepEqual(mixed.position, [9, 9, 9]);
  assert.deepEqual(mixed.target, [4, 5, 6]);
  assert.deepEqual(mixed.up, [0, 0, 1]);
  assert.equal(mixed.fov, 70);
  assert.equal(mixed.near, 0.5);
  // The same props as when the memory was saved: the remembered navigation wins outright.
  const props = { position: [9, 9, 9], fov: 70, near: undefined };
  const remembered = resolveCameraState(props, { ...memory, explicit: explicitCameraKey(props) }, 1);
  assert.deepEqual(remembered.position, [1, 2, 3]);
  assert.equal(remembered.fov, 30);
  assert.equal(explicitCameraKey({ position: [9, 9, 9], fov: 70, near: undefined }), explicitCameraKey({ position: [9, 9, 9], fov: 70 }));
  // Memory saved under explicit near/far leaves them out (A6), so the prop still fills them in.
  const lens = { near: 50 };
  const kept = resolveCameraState(lens, { position: [1, 2, 3], explicit: explicitCameraKey(lens) }, 1);
  assert.equal(kept.near, 50);
  assert.deepEqual(kept.position, [1, 2, 3]);
  assert.throws(() => resolveCameraState({ fov: 190 }), /cameraFov: fov must be between 0 and 180 degrees/);
  assert.throws(() => resolveCameraState({ fov: 0 }), /cameraFov: fov must be between 0 and 180 degrees/);
  assert.throws(() => resolveCameraState({ near: 0 }), /cameraNear: near must be a positive number/);
  assert.throws(() => resolveCameraState({ near: 10, far: 5 }), /cameraNear: near must be less than far \(got 10 and 5\)/);
  assert.throws(() => resolveCameraState({ near: 5000 }), /0 < near < far \(got 5000 and 2000\)/);
  assert.throws(() => resolveCameraState({ position: [1, 2] }), /cameraPosition: position must be \[x, y, z\] finite numbers/);
  assert.throws(() => resolveCameraState({ up: [0, 0, 0] }), /cameraUp: up must not be the zero vector/);
});

test("setCamera patches are validated against the current camera", () => {
  assert.doesNotThrow(() => validateCameraPatch({ position: [1, 2, 3], fov: 40 }));
  assert.throws(() => validateCameraPatch({ position: [1, 2] }), /setCamera position must be \[x, y, z\]/);
  assert.throws(() => validateCameraPatch({ fov: 200 }), /setCamera fov must be between 0 and 180/);
  assert.throws(() => validateCameraPatch({ near: 0 }), /setCamera near must be a positive number/);
  assert.throws(() => validateCameraPatch({ near: -1 }), /setCamera near must be a positive number/);
  assert.throws(() => validateCameraPatch({ far: 1 }, { near: 5 }), /setCamera far must be greater than near \(got 5 and 1\)/);
  assert.throws(() => validateCameraPatch({ near: 5000 }, { far: 2000 }), /setCamera near must be less than far/);
  assert.doesNotThrow(() => validateCameraPatch({ near: 5000, far: 6000 }, { far: 2000 }));
  assert.throws(() => validateCameraPatch({ zoom: 0 }), /setCamera zoom must be a positive number/);
  assert.throws(() => validateCameraPatch({ up: [0, 0, 0] }), /setCamera up must not be the zero vector/);
  assert.throws(() => validateCameraPatch({ mode: "orbit" }), /setCamera does not accept mode/);
  assert.throws(() => validateCameraPatch(null), /needs an object/);
  assert.equal(cameraStateIssue({ fov: 40 }), "");
  assert.equal(cameraValueIssue("fov", undefined), "");
  assert.equal(cameraStateIssue({ near: 0 }, {}, "cameraNear"), "cameraNear near must be a positive number.");
});

test("camera states interpolate: up rotates and the position swings about a moving target", () => {
  const halfway = lerpCamera({ position: [0, 0, 0], fov: 40, target: [0, 0, 0] }, { position: [10, 20, 30], fov: 60 }, 0.5);
  assert.deepEqual(halfway, { position: [5, 10, 15], fov: 50 });
  // A flip of up passes through a unit vector, not zero.
  const flipped = lerpCamera({ up: [0, 1, 0] }, { up: [0, -1, 0] }, 0.5);
  close(length(flipped.up), 1);
  close(flipped.up[1], 0);
  const quarter = lerpCamera({ up: [0, 1, 0] }, { up: [1, 0, 0] }, 0.5);
  closeVector(quarter.up, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  // Position and target both move: the camera keeps its distance from the target instead of
  // cutting through it (a straight lerp from +x to -x would pass through the target).
  const swing = lerpCamera({ position: [10, 0, 0], target: [0, 0, 0] }, { position: [-10, 0, 0], target: [0, 0, 0] }, 0.5);
  close(length(swing.position), 10);
  const both = lerpCamera({ position: [10, 0, 0], target: [0, 0, 0] }, { position: [0, 0, 30], target: [0, 0, 10] }, 0.5);
  closeVector(both.target, [0, 0, 5]);
  close(length(sub(both.position, both.target)), 15);
});

test("a sky's view direction follows the camera's turn, not its position; its frame and gradient (TODO 37.2, 138.5)", async () => {
  const { PerspectiveCamera } = await import("three");
  const { skyDirection, skyBasis, skyLocal, skyLocalSteps, skyUV, skyGradient } = await import("../../src/lib/plugins/sky/reference.js");
  const camera = new PerspectiveCamera(50, 1.5, 0.1, 100);
  const look = (position, target) => {
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return (x, y) => skyDirection(x, y, camera.projectionMatrixInverse.elements, camera.matrixWorld.elements);
  };
  // The pixel at the centre looks along the view; the top edge tilts up by half the field of view.
  let through = look([0, 0, 0], [0, 0, -1]);
  closeVector(through(0, 0), [0, 0, -1]);
  close(Math.asin(through(0, 1)[1]) * 180 / Math.PI, 25, 1e-6);
  // Moving the camera does not move the sky; turning it does.
  through = look([30, -4, 12], [30, -4, 11]);
  closeVector(through(0, 0), [0, 0, -1]);
  through = look([0, 0, 0], [1, 0, 0]);
  closeVector(through(0, 0), [1, 0, 0]);
  // Its up is the camera's: a Z-up camera's +z is the sky's +y. rotation turns it (degrees).
  closeVector(skyLocal(skyBasis([0, 1, 0]), [0, 1, 0]), [0, 1, 0]);
  closeVector(skyLocal(skyBasis([0, 0, 1]), [0, 0, 1]), [0, 1, 0]);
  closeVector(skyLocal(skyBasis([0, -1, 0]), [0, -1, 0]), [0, 1, 0]);
  closeVector(skyLocal(skyBasis([0, 1, 0], [0, 90, 0]), [1, 0, 0]), [0, 0, 1]);
  // The shader's steps (the sky plugin's) give the same frame, for any up (straight down too).
  for (const up of [[0, 1, 0], [0, 0, 1], [0, -1, 0], [1e-9, -1, 0], [0.3, -0.8, 0.2]])
    for (const rotation of [[0, 0, 0], [30, -60, 125]])
      for (const direction of [[1, 0, 0], [0.2, 0.9, -0.4], [-0.5, -0.5, 0.7]])
        closeVector(skyLocalSteps(direction, up, rotation), skyLocal(skyBasis(up, rotation), direction));
  // An equirectangular image: north at the top (v = 1), longitude across.
  closeVector(skyUV([0, 1, 0]), [0.5, 1]);
  closeVector(skyUV([-1, 0, 0]), [1, 0.5]);
  closeVector(skyUV([0, 0, 1]), [0.75, 0.5]);
  // The gradient: the horizon color at the horizon, the zenith's straight up, the ground's down,
  // linear in the elevation angle.
  const zenith = [0, 0, 1], horizon = [1, 1, 1], ground = [0.2, 0.2, 0.2];
  closeVector(skyGradient([1, 0, 0], zenith, horizon, ground), horizon);
  closeVector(skyGradient([0, 1, 0], zenith, horizon, ground), zenith);
  closeVector(skyGradient([0, -1, 0], zenith, horizon, ground), ground);
  closeVector(skyGradient([Math.SQRT1_2, Math.SQRT1_2, 0], zenith, horizon, ground), [0.5, 0.5, 1]);
});

test("glow, bloom and fog values are checked, naming the component (TODO 37, 138.3)", async () => {
  const { glowProblem, BLOOM_PARAMETERS, fogProblem } = await import("../../src/lib/plot/utils/presentation.js");
  const { parameterProblem } = await import("../../src/lib/plot/plugins/parameters.js");
  const bloomProblem = (props) => parameterProblem("bloom", BLOOM_PARAMETERS, props);
  const isColor = (value) => /^#[0-9a-f]{3,8}$/i.test(value);
  assert.equal(glowProblem("Points", 0), "");
  assert.equal(glowProblem("Points", 2.5), "");
  assert.equal(glowProblem("Points", -1), "Points: glow is a number of at least 0 (0, the default, does not glow); got -1.");
  assert.equal(glowProblem("Line", NaN), "Line: glow is a number of at least 0 (0, the default, does not glow); got NaN.");
  assert.equal(bloomProblem({ strength: 0, radius: 1 }), "");
  assert.equal(bloomProblem({ strength: -0.5 }), "bloom: strength is a number of at least 0; got -0.5.");
  assert.equal(bloomProblem({ radius: 1.5 }), "bloom: radius is a number from 0 to 1; got 1.5.");
  assert.equal(fogProblem({ near: 0, far: 10, color: "#fff" }, isColor), "");
  assert.equal(fogProblem({ near: 5, far: 5 }, isColor), "Plot.effects: fog needs finite distances with 0 <= near < far; got near 5 and far 5.");
  assert.equal(fogProblem({ near: -1, far: 5 }, isColor), "Plot.effects: fog needs finite distances with 0 <= near < far; got near -1 and far 5.");
  assert.equal(fogProblem({ far: 5 }, isColor), "Plot.effects: fog needs finite distances with 0 <= near < far; got near undefined and far 5.");
  assert.equal(fogProblem({ near: 1, far: 2, color: "fog" }, isColor), 'Plot.effects: fog color is a CSS color (or omitted, for the plot\'s background); got "fog".');
});

// TODO 66.6: flyover momentum, driven by pointer events and animation frames the test controls
// (no DOM: a stand-in canvas, window and frame clock).
async function flyover({ momentum = true, reduced = false } = {}) {
  const { createFlyoverControls } = await import("../../src/lib/plot/scenes/flyoverControls.js");
  const { PerspectiveCamera, Vector3 } = await import("three/webgpu");
  const queue = new Map();
  let id = 0;
  globalThis.requestAnimationFrame = (callback) => (queue.set(++id, callback), id);
  globalThis.cancelAnimationFrame = (handle) => queue.delete(handle);
  globalThis.window = new EventTarget();
  globalThis.matchMedia = () => Object.assign(new EventTarget(), { matches: reduced });
  const camera = new PerspectiveCamera(50, 1.6, 0.1, 2000);
  camera.position.set(0, 10, 20);
  camera.lookAt(0, 0, 0);
  const element = Object.assign(new EventTarget(), { tabIndex: 0, style: {}, clientHeight: 500, focus() {}, removeAttribute() {},
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }) });
  const glides = [];
  const controls = createFlyoverControls(camera, element, () => {}, { target: new Vector3(0, 0, 0), momentum, onGlide: (done) => glides.push(done) });
  const fire = (type, time, values = {}) => {
    const event = Object.assign(new Event(type), { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 400, clientY: 250, ...values });
    Object.defineProperty(event, "timeStamp", { value: time });
    element.dispatchEvent(event);
  };
  // A drag of `steps` moves of `dx` pixels, one every 1000 / 60 ms; released `pause` ms after the last.
  const drag = (start, { steps = 6, dx = 12, pause = 0 } = {}) => {
    fire("pointerdown", start);
    let x = 400, t = start;
    for (let i = 0; i < steps; i++) fire("pointermove", (t += 1000 / 60), { clientX: (x += dx) });
    fire("pointerup", t + pause, { clientX: x, buttons: 0 });
    return t + pause;
  };
  // Animation frames at `hz` from `start` until the glide stops (or `limit` frames).
  const run = (start, hz = 60, limit = Infinity) => {
    let frames = 0;
    for (let now = start; queue.size && frames < limit; frames++) {
      now += 1000 / hz;
      const due = [...queue.values()];
      queue.clear();
      for (const callback of due) callback(now);
    }
    return frames;
  };
  return { camera, controls, glides, drag, run, fire, queue, position: () => camera.position.clone() };
}

test("a released flyover pan glides on, slowing to a stop, at any frame rate; a pause before release, momentum off and reduced motion stop at once (TODO 66.6)", async () => {
  const travel = async (hz) => {
    const view = await flyover();
    const released = view.drag(0);
    const at = view.position(), turn = view.camera.quaternion.clone();
    const frames = view.run(released, hz);
    assert.equal(view.queue.size, 0, "it stops");
    assert.ok(frames > 5 && frames * (1000 / hz) <= 1550, `${frames} frames at ${hz} Hz`);
    close(view.camera.position.y, 10, 1e-9);
    assert.ok(view.camera.quaternion.angleTo(turn) < 1e-6, `the view keeps its direction (${view.camera.quaternion.angleTo(turn)})`);
    assert.equal(view.glides.length, 1);
    return view.position().sub(at);
  };
  const at60 = await travel(60), at120 = await travel(120);
  assert.ok(at60.length() > 0.5, `${at60.length()} units on`);
  assert.ok(Math.abs(at60.z) < 1e-9 && at60.x < 0, "along the drag's ground motion (a drag right moves the camera left)");
  assert.ok(Math.abs(at120.length() / at60.length() - 1) < 0.02, `120 Hz ${at120.length()} vs 60 Hz ${at60.length()}`);
  // At most 1.5 camera heights (10 units up) of travel, however fast the flick.
  const fast = await flyover();
  const released = fast.drag(0, { steps: 3, dx: 120 }), before = fast.position();
  fast.run(released);
  assert.ok(fast.position().distanceTo(before) <= 15 + 1e-6, `${fast.position().distanceTo(before)}`);
  const slow = await flyover(), slowRelease = slow.drag(0, { steps: 3, dx: 120 });
  assert.ok(slow.run(slowRelease, 10) <= 15, "slow streamed-tile frames retain the 1.5 second wall-time limit");
  for (const [name, options, pause] of [["a pause before release", {}, 60], ["momentum off", { momentum: false }, 0], ["reduced motion", { reduced: true }, 0]]) {
    const view = await flyover(options);
    const time = view.drag(0, { pause });
    const at = view.position();
    assert.equal(view.queue.size, 0, `${name}: no glide`);
    view.run(time);
    assert.ok(view.position().distanceTo(at) === 0, name);
  }
});

test("new input, the momentum setting, a programmatic update and dispose stop a glide; its promise settles (TODO 66.6)", async () => {
  for (const stop of [
    (view) => view.fire("pointerdown", 1000, { clientX: 300 }),
    (view) => view.fire("wheel", 1000, { deltaY: 100, deltaMode: 0 }),
    (view) => view.fire("keydown", 1000, { key: "Escape", code: "Escape" }),
    (view) => view.fire("blur", 1000),
    (view) => { view.controls.momentum = false; },
    (view) => { view.controls.enabled = false; },
    (view) => view.controls.update(),
    (view) => view.controls.dispose(),
  ]) {
    const view = await flyover();
    view.run(view.drag(0), 60, 3);
    assert.equal(view.controls.gliding, true);
    let settled = false;
    view.glides[0].then(() => (settled = true));
    stop(view);
    if (view.queue.size) view.fire("pointerup", 1001, { buttons: 0 });
    const at = view.position();
    view.run(1100);
    assert.equal(view.controls.gliding, false, String(stop));
    await Promise.resolve();
    assert.equal(settled, true);
    if (!String(stop).includes("pointerdown") && !String(stop).includes("wheel")) assert.ok(view.position().distanceTo(at) === 0, String(stop));
  }
});

test("the effects attach through the presentation's hooks: which a render shows, and which exports rasterize (TODO 138.1, 138.5)", async () => {
  const { Presentation } = await import("../../src/lib/plot/utils/presentation.js");
  const { createPluginRegistry } = await import("../../src/lib/plot/plugins/registry.js");
  const { withDefaults } = await import("../../src/lib/plot/plugins/parameters.js");
  const { default: sky } = await import("../../src/lib/plugins/sky/index.js");
  const three = await import("three/webgpu"), tsl = await import("three/tsl");
  const { Scene, Mesh, PerspectiveCamera, OrthographicCamera } = three;
  const presentation = new Presentation(), scene = new Scene();
  const registry = createPluginRegistry({ three, tsl });
  registry.register(sky);
  const skyDefinition = registry.get("effect", "sky");
  const perspective = new PerspectiveCamera(), flat = new OrthographicCamera();
  const keys = (camera, attachments) => presentation.activeFor(camera, attachments).key;
  assert.equal(presentation.attachmentsFor(scene), "");
  assert.equal(keys(perspective), "");
  // A glowing mark asks for the glow attachment; its composite shows with it, in 2D too.
  const mark = Object.assign(new Mesh(), { plotGlow: 2 });
  scene.add(mark);
  assert.equal(presentation.attachmentsFor(scene), "glow");
  assert.equal(keys(flat, { glow: {} }), "glow:linear:on");
  mark.visible = false;
  assert.equal(presentation.attachmentsFor(scene), "");
  // Fog and the sky (a first-party plugin's effect, TODO 138.5) show in a 3D plot only; the
  // parameters it was given are its key (a gradient: no image, no ground).
  presentation.setFog({ near: 1, far: 2, color: "#fff" });
  presentation.setPluginEffects([{ kind: "sky", definition: skyDefinition, values: withDefaults(skyDefinition.parameters, {}) }]);
  assert.equal(keys(perspective), 'fog:linear:on sky:display:{"image":null,"ground":null,"visible":true}');
  assert.equal(keys(flat), "");
  // In a 2D plot its check says so (utils/effects.js passes the Plot's view).
  assert.equal(skyDefinition.check({}, { threeD: false, plot: "the Plot" }), 'needs a 3D view, and the Plot is 2D. Set type="3d" on it, or remove sky.');
  // Hidden (visible false), it is not drawn and not exported.
  presentation.setPluginEffects([{ kind: "sky", definition: skyDefinition, values: withDefaults(skyDefinition.parameters, { visible: false }) }]);
  assert.equal(keys(perspective), "fog:linear:on");
  presentation.setPluginEffects([{ kind: "sky", definition: skyDefinition, values: withDefaults(skyDefinition.parameters, {}) }]);
  // An atmosphere is an object hook: exports name it while it is visible in the scene.
  const shell = new Mesh();
  const release = presentation.addObject("atmosphere", shell);
  assert.deepEqual(presentation.rasterEffects(perspective, scene), ["sky", "fog"]);
  scene.add(shell);
  mark.visible = true;
  assert.deepEqual(presentation.rasterEffects(perspective, scene), ["sky", "fog", "glow", "atmosphere"]);
  release();
  presentation.setFog(null);
  assert.deepEqual(presentation.rasterEffects(flat, scene), ["glow"]);
});

test("view presets share 3D mode and explicit camera up overrides their defaults", () => {
  for (const [type, mode, up] of [["2d", "2d", [0, 0, 1]], ["3d", "3d", [0, 0, 1]], ["3d-y-up", "3d", [0, 1, 0]]]) {
    assert.equal(viewMode(type), mode);
    assert.deepEqual(viewUp(type), up);
    assert.deepEqual(resolveCameraState({ up: viewUp(type) }).up, up);
    assert.deepEqual(resolveCameraState({ up: [1, 0, 0] }).up, [1, 0, 0]);
  }
});

// A slow frame can arrive well after the deadline even though the preceding one was on time.
test("a flyover glide expires before applying a late animation frame", async () => {
  const view = await flyover();
  try {
    const released = view.drag(0);
    view.run(released, 60, 1);
    assert.equal(view.controls.gliding, true);
    const before = view.position();
    view.run(released + 1850, 60, 1);
    assert.equal(view.controls.gliding, false);
    assert.equal(view.queue.size, 0);
    assert.equal(view.position().distanceTo(before), 0, "no late displacement after the 1.5 second limit");
    await view.glides[0];
  } finally { view.controls.dispose(); }
});
