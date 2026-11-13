import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cameraMatrixKey } from "../../src/lib/plot/utils/camera.js";
import { syncOrbitUp } from "../../src/lib/plot/scenes/orbitUp.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("syncOrbitUp re-reads camera.up into OrbitControls' orbit axis", () => {
  const camera = new PerspectiveCamera();
  camera.position.set(100, 0, 30);
  const controls = new OrbitControls(camera);
  // Built while up was +y: the orbit axis maps +y to +y.
  camera.up.set(0, 0, 1);
  const stale = new Vector3(0, 0, 1).applyQuaternion(controls._quat);
  close(stale.z, 1);
  syncOrbitUp(controls);
  const synced = new Vector3(0, 0, 1).applyQuaternion(controls._quat);
  close(synced.y, 1);
  close(synced.z, 0);
  const back = new Vector3(0, 1, 0).applyQuaternion(controls._quatInverse);
  close(back.z, 1);
  // update() keeps the camera where it is: the spherical state is consistent with the new axis.
  controls.update();
  close(camera.position.x, 100);
  close(camera.position.y, 0);
  close(camera.position.z, 30);
});

test("syncOrbitUp fails loudly when three renames the private fields", () => {
  assert.throws(() => syncOrbitUp({ object: { up: new Vector3(0, 1, 0) } }), /OrbitControls no longer exposes _quat\/_quatInverse/);
});

test("stationary Z-up camera matrices keep guide identity while navigation changes it", () => {
  const camera = new PerspectiveCamera();
  camera.position.set(90, 70, 140);
  const controls = new OrbitControls(camera);
  camera.up.set(0, 0, 1);
  syncOrbitUp(controls);
  controls.update();
  camera.updateMatrixWorld();
  const key = cameraMatrixKey(camera), original = camera.matrixWorld.elements.slice();
  for (let frame = 0; frame < 20; frame++) {
    controls.update();
    camera.updateMatrixWorld();
    assert.equal(cameraMatrixKey(camera), key);
  }
  assert.notDeepEqual(camera.matrixWorld.elements, original);
  camera.position.x += 0.001;
  camera.updateMatrixWorld();
  assert.notEqual(cameraMatrixKey(camera), key);
  const moved = cameraMatrixKey(camera);
  camera.zoom = 2;
  camera.updateProjectionMatrix();
  assert.notEqual(cameraMatrixKey(camera), moved);
});
