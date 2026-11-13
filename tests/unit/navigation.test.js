import test from "node:test";
import assert from "node:assert/strict";
import {
  Reservoir,
  instanceLimit,
  displayMultiplier,
} from "../../src/lib/plot/utils/sampling.js";
import {
  normalizeViewport,
  zoomViewport,
  lerpViewport,
  viewportSpans,
  anchoredZoom,
  zoomDimension,
} from "../../src/lib/plot/utils/viewport.js";
test("reservoir is unique, deterministic and independent of append cadence", () => {
  for (const count of [1, 999, 1000, 1001, 5000, 100000]) {
    const a = new Reservoir(),
      b = new Reservoir();
    const direct = a.sample(count, 1000);
    for (let n = 1; n < count; n += 97) b.sample(n, 1000);
    assert.deepEqual(b.sample(count, 1000), direct);
    assert.equal(new Set(direct).size, Math.min(count, 1000));
    assert.ok(direct.every((i) => i >= 0 && i < count));
    assert.deepEqual(a.sample(count, 1000), direct);
  }
});
test("scales preserve zero and instance limits preserve unlimited", () => {
  assert.equal(displayMultiplier(0), 0);
  assert.equal(displayMultiplier(0.35), 0.35);
  for (const v of [-1, Infinity, NaN])
    assert.throws(() => displayMultiplier(v));
  assert.equal(instanceLimit(null), Infinity);
  assert.equal(instanceLimit(undefined), Infinity);
  assert.equal(instanceLimit(1000), 1000);
  for (const v of [0, -1, 1.2, Infinity]) assert.throws(() => instanceLimit(v));
});
test("independent zoom normalizes legacy fields and preserves both-axis ratios at limits", () => {
  assert.deepEqual(normalizeViewport({ x: 0.5, y: 0.5, zoom: 3 }), {
    x: 0.5,
    y: 0.5,
    zoom: 3,
    zoomX: 3,
    zoomY: 3,
  });
  const v = { x: 0.5, y: 0.5, zoom: 1, zoomX: 4, zoomY: 2 },
    n = zoomViewport(v, 0.1);
  assert.equal(n.zoomX, 2);
  assert.equal(n.zoomY, 1);
  assert.equal(n.zoom, Math.sqrt(2));
  assert.equal(zoomViewport(v, 2, "x").zoomY, 2);
});
test("viewport center survives zoom and validates angular state", () => {
  const center = [30, -20];
  const initial = normalizeViewport({ x: 0.5, y: 0.5, zoom: 1, center });
  assert.deepEqual(initial.center, center);
  assert.notEqual(initial.center, center);
  assert.deepEqual(zoomViewport(initial, 2).center, center);
  assert.throws(() => normalizeViewport({ x: 0.5, y: 0.5, zoom: 1, center: [0, NaN] }),
    /two finite angular values/);
});
test("pointer anchoring preserves the unzoomed dimension and data beneath the pointer", () => {
  const v = { x: 0.6, y: 0.4, zoom: 2 },
    p = { x: 75, y: 125 },
    a = anchoredZoom(v, 2, "x", p, 600, 350),
    before = viewportSpans(600, 350, v),
    after = viewportSpans(600, 350, a);
  assert.equal(a.y, v.y);
  assert.equal(a.zoomY, 2);
  assert.ok(
    Math.abs(
      v.x * 100 +
        (p.x / 600 - 0.5) * before.x -
        (a.x * 100 + (p.x / 600 - 0.5) * after.x),
    ) < 1e-10,
  );
});
test("axis margins override the global selection except the corner", () => {
  const m = { left: 50, right: 10, top: 10, bottom: 40 };
  assert.equal(zoomDimension(200, 290, 400, 300, "y", m), "x");
  assert.equal(zoomDimension(20, 150, 400, 300, "x", m), "y");
  assert.equal(zoomDimension(20, 290, 400, 300, "xy", m), "xy");
  assert.equal(zoomDimension(200, 290, 400, 300, "y", null), "y");
  assert.equal(zoomDimension(200, 150, 400, 300, "x", m), "x");
});

test("an eased viewport moves its center linearly and its zoom geometrically (TODO 136.14)", () => {
  const from = { x: 0.2, y: 0.5, zoom: 1 }, to = { x: 0.6, y: 0.5, zoomX: 4, zoomY: 1 };
  const half = lerpViewport(from, to, 0.5);
  assert.ok(Math.abs(half.x - 0.4) < 1e-12);
  assert.ok(Math.abs(half.zoomX - 2) < 1e-12);
  assert.equal(half.zoomY, 1);
  assert.deepEqual(lerpViewport(from, to, 1), { x: 0.6, y: 0.5, zoom: 2, zoomX: 4, zoomY: 1 });
  assert.deepEqual(lerpViewport({ ...from, center: [0, 0] }, { ...from, center: [40, 20] }, 0.25).center, [10, 5]);
  assert.deepEqual(lerpViewport({ ...from, center: [170, 0] }, { ...from, center: [-170, 0] }, 0.5).center, [180, 0]);
});
