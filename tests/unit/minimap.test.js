import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitOverview,
  viewportRectangle,
  clampOverviewCenter,
  overviewPoint,
  cameraRestorePatch,
  flyoverAlignPosition,
} from "../../src/lib/plot/utils/minimapMath.js";
import { FLY_PITCH_LIMIT } from "../../src/lib/plot/utils/camera.js";
import {
  createMinimapSource,
  minimapSource,
} from "../../src/lib/plot/utils/minimapSource.js";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test("overview fits the full world domain and maps viewport rectangles with padding", () => {
  const fit = fitOverview(200, 100);
  assert.equal(fit.x, 50);
  assert.equal(fit.y, 0);
  assert.deepEqual(viewportRectangle({ x: [-25, 25], y: [-10, 10] }, fit), {
    x: 75,
    y: 40,
    width: 50,
    height: 20,
  });
  assert.deepEqual(overviewPoint(75, 40, fit), { x: -25, y: 10 });
});
test("clamp handles partial, oversized and off-domain views without negative rectangles", () => {
  const fit = fitOverview(200, 100);
  assert.deepEqual(
    clampOverviewCenter(90, -90, { x: [-20, 20], y: [-10, 10] }, fit),
    { x: 30, y: -40 },
  );
  assert.deepEqual(
    clampOverviewCenter(90, -90, { x: [-100, 100], y: [-100, 100] }, fit),
    { x: 0, y: 0 },
  );
  assert.equal(viewportRectangle({ x: [80, 100], y: [-10, 10] }, fit).width, 0);
});
test("reversed, logarithmic, and relative datetime domains share the same world mapping", () => {
  // Mark transforms map values to world coordinates before overview navigation.
  for (const [domain, f, value] of [
    [[100, 1], Math.log, 10],
    [[0, 86400000], (x) => x, 43200000],
    [[0, 16], Math.sqrt, 4],
  ]) {
    const world =
      -50 + (100 * (f(value) - f(domain[0]))) / (f(domain[1]) - f(domain[0]));
    const fit = fitOverview(160, 110, [50, -50], [-50, 50]);
    const pixel = fit.x + (world - fit.left) * fit.scale;
    close(overviewPoint(pixel, 55, fit).x, world);
  }
});
test("standalone subscriptions work before renderer attachment and retire exactly once", () => {
  const counts = [],
    notifications = [],
    source = createMinimapSource((n) => counts.push(n));
  const c = source.connect({}, (v) => notifications.push(v));
  let released = 0,
    moves = 0;
  assert.equal(minimapSource(source.handle), source);
  const disconnect = source.bind({
    invalidate() {},
    release() {
      released++;
    },
    move() {
      moves++;
    },
  });
  c.resize(180, 120);
  c.move(0, 0);
  assert.equal(moves, 1);
  c.dispose();
  c.dispose();
  assert.equal(released, 1);
  assert.deepEqual(counts, [1, 0]);
  disconnect();
  source.dispose();
  assert.equal(minimapSource(source.handle), undefined);
});
test('retired backend disconnect cannot release newly bound minimaps',()=>{
 const s=createMinimapSource(()=>{}),c=s.connect({},()=>{});let old=0,current=0;
 const off=s.bind({invalidate(){},release(){old++;}});
 const end=s.bind({invalidate(){},release(){current++;}});
 assert.equal(old,1);off();assert.equal(current,0);c.dispose();assert.equal(current,1);end();s.dispose();
 assert.throws(()=>s.connect({},()=>{}),/disposed/);
});
test("a 3D minimap restore takes navigation from the edited fields and only the lens from the captured camera", () => {
  const captured = {
    viewport: undefined,
    camera: { position: [90, 70, 140], target: [0, 0, 0], up: [0, 1, 0], fov: 40, near: 0.1, far: 2000, zoom: 1, mode: "orbit" },
    position: [90, 70, 140], target: [0, 0, 0], up: [0, 1, 0], zoom: 1,
  };
  // align() and orbit() edit position/up and leave camera stale: the edit must win.
  const aligned = { ...captured, position: [0, 179.7, 0], up: [0, 0, -1] };
  assert.deepEqual(cameraRestorePatch(aligned), {
    position: [0, 179.7, 0], target: [0, 0, 0], up: [0, 0, -1], zoom: 1, fov: 40, near: 0.1, far: 2000,
  });
  assert.ok(!("mode" in cameraRestorePatch(aligned)));
  // A capture without a camera state (older path) still restores navigation.
  assert.deepEqual(cameraRestorePatch({ position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], zoom: 2 }),
    { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], zoom: 2 });
});

test("flyover minimap axis buttons keep up; the top-down button stops at the pitch clamp", () => {
  const norm = (v) => Math.hypot(...v);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  // y-up: +Y is top-down. The target stays, the distance stays, the camera keeps its heading
  // (it was on the +x/+z side), and the view is exactly at the clamp.
  const yUp = { position: [40, 60, 40], target: [2, 0, -3], up: [0, 1, 0] };
  const distance = norm(sub(yUp.position, yUp.target));
  const top = flyoverAlignPosition(yUp, 1, 1);
  const offset = sub(top, yUp.target);
  close(norm(offset), distance);
  close(dot(offset, yUp.up) / distance, FLY_PITCH_LIMIT);
  close(Math.atan2(offset[2], offset[0]), Math.atan2(43, 38)); // heading kept
  // Looking up from below mirrors it; a side view needs no clamp and keeps up.
  close(dot(sub(flyoverAlignPosition(yUp, 1, -1), yUp.target), yUp.up) / distance, -FLY_PITCH_LIMIT);
  flyoverAlignPosition(yUp, 0, 1).forEach((v, i) => close(v, [2 + distance, 0, -3][i]));
  // z-up: +Z is top-down, and +X is a side view (the orbit path would have written a y-up up).
  const zUp = { position: [100, 0, 30], target: [5, 0, 0], up: [0, 0, 1] };
  const zDistance = norm(sub(zUp.position, zUp.target));
  const zTop = sub(flyoverAlignPosition(zUp, 2, 1), zUp.target);
  close(zTop[2] / zDistance, FLY_PITCH_LIMIT);
  close(zTop[1], 0);
  assert.ok(zTop[0] > 0);
  // Already straight above: any ground heading, still at the clamp.
  const above = sub(flyoverAlignPosition({ position: [0, 10, 0], target: [0, 0, 0], up: [0, 1, 0] }, 1, 1), [0, 0, 0]);
  close(above[1] / 10, FLY_PITCH_LIMIT);
  close(norm(above), 10);
});
