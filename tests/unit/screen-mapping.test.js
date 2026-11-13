import test from "node:test";
import assert from "node:assert/strict";
import { OrthographicCamera } from "three/webgpu";
import { createScreenMapping } from "../../src/lib/plot/utils/screenMapping.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function setup() {
  const values = {
    coordinates: "cartesian",
    xbounds: [1, 100],
    ybounds: [0, 10],
    zbounds: [-1, 1],
    xrange: [-1, 1],
    yrange: [-1, 1],
    zrange: [-1, 1],
    xTransform: "log",
  };
  const options = {
    get: (key) => values[key],
    values: new Map(Object.entries(values)),
  };
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;
  camera.updateMatrixWorld();
  const controller = createScreenMapping(() => ({
    options,
    camera,
    width: 400,
    height: 200,
  }));
  return { controller, values, options, camera };
}
test("completed mappings round trip nonlinear scales and retain their displayed values", () => {
  const { controller, values, camera } = setup();
  const seen = [];
  controller.subscribeScreenMapping((value) => seen.push(value));
  assert.equal(controller.getScreenMapping(), null);
  controller.draw();
  const first = controller.getScreenMapping();
  assert.ok(first);
  const point = first.project({ x: 10, y: 5 });
  near(point.x, 200);
  near(point.y, 100);
  assert.equal(point.inside, true);
  const inverse = first.unproject(point);
  near(inverse.x, 10);
  near(inverse.y, 5);
  assert.equal(first.project({ x: -1, y: 5 }), null);
  assert.equal(first.project({ x: 1000, y: 5 }).inside, false);
  controller.draw();
  assert.equal(seen.length, 2);
  values.xbounds[1] = 10000;
  camera.position.x = 0.2;
  camera.updateMatrixWorld();
  assert.deepEqual(first.project({ x: 10, y: 5 }), point);
  controller.draw();
  assert.equal(seen.length, 3);
  assert.notEqual(
    controller.getScreenMapping().project({ x: 10, y: 5 }).x,
    point.x,
  );
  controller.dispose();
  assert.equal(seen.at(-1), null);
  controller.draw();
  assert.equal(controller.getScreenMapping(), null);
});
test("unsupported and degenerate coordinates publish null instead of an invalid inverse", () => {
  const { controller, values } = setup();
  controller.draw();
  assert.ok(controller.getScreenMapping());
  values.xbounds = [1, 1];
  controller.draw();
  assert.equal(controller.getScreenMapping(), null);
  values.xbounds = [1, 100];
  values.coordinates = "polar";
  controller.draw();
  assert.equal(controller.getScreenMapping(), null);
});
