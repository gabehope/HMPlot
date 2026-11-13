import test from "node:test";
import assert from "node:assert/strict";
import {
  fittedLayout,
  normalizeViewport,
} from "../../src/lib/plot/utils/viewport.js";
import {
  fitOverview,
  overviewPoint,
  viewportRectangle,
} from "../../src/lib/plot/utils/minimapMath.js";
import { exportPixels } from "../../src/lib/plot/utils/exportPixels.js";

test("rectangular fit respects all margins and independent zoom", () => {
  const domain = { x: [-100, 100], y: [-25, 25] },
    margins = { left: 60, right: 12, top: 10, bottom: 30 };
  for (const [w, h] of [
    [900, 300],
    [300, 900],
    [400, 400],
  ]) {
    const fit = fittedLayout(w, h, domain, margins);
    assert.ok(Math.abs(fit.visibleX - 200) < 1e-10);
    assert.ok(Math.abs(fit.visibleY - 50) < 1e-10);
    assert.equal(fit.rect.width, w - 72);
    assert.equal(fit.rect.height, h - 40);
    const zoom = fittedLayout(w, h, domain, margins, {
      x: 0.5,
      y: 0.5,
      zoomX: 2,
      zoomY: 1,
    });
    assert.ok(Math.abs(zoom.visibleX - 100) < 1e-10);
    assert.ok(Math.abs(zoom.visibleY - 50) < 1e-10);
    const equal = fittedLayout(
      w,
      h,
      domain,
      margins,
      { x: 0.5, y: 0.5, zoom: 1 },
      true,
    );
    assert.ok(equal.visibleX >= 200 - 1e-10 && equal.visibleY >= 50 - 1e-10);
    assert.ok(Math.abs(equal.x / w - equal.y / h) < 1e-10);
  }
  // TODO 67.3: aspect="equal" on a Cartesian plot keeps a data unit equal: with the data spans
  // the 100-unit world box covers (x 0.74 wide, y 0.21), the camera's pixels per data unit match.
  const data = fittedLayout(818, 300, { x: [-50, 50], y: [-50, 50] }, {}, { x: 0.5, y: 0.5, zoom: 1 }, true, { x: 0.74, y: 0.21 });
  const pixelsPerData = { x: (818 / data.x) * (100 / 0.74), y: (300 / data.y) * (100 / 0.21) };
  assert.ok(Math.abs(pixelsPerData.x - pixelsPerData.y) < 1e-6);
  // Both spans fit, the wider one exactly: 818 px for 0.74 units.
  assert.ok(Math.abs(data.visibleX * 0.74 / 100 - 0.74) < 1e-9 && data.visibleY * 0.21 / 100 >= 0.21);
  assert.equal(normalizeViewport({ x: 0.5, y: 0.5, zoom: 0.5 }).zoom, 0.5);
  assert.throws(() => normalizeViewport({ x: 0.5, y: 0.5, zoom: 0 }));
});
test("rectangular overview has invertible independent mappings", () => {
  const fit = fitOverview(1000, 70, [-100, 100], [-25, 25], true);
  assert.deepEqual(overviewPoint(500, 35, fit), { x: 0, y: 0 });
  const rect = viewportRectangle({ x: [-50, 50], y: [-25, 25] }, fit);
  assert.equal(rect.width, 500);
  assert.equal(rect.height, 70);
});
test("PNG readback strips padded rows and frees staging on every outcome", async () => {
  globalThis.GPUBufferUsage = { COPY_DST: 1, MAP_READ: 2 };
  globalThis.GPUMapMode = { READ: 1 };
  for (const fail of [false, true]) {
    const raw = new Uint8Array(256 + 12);
    raw.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    raw.set([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32], 256);
    let destroyed = false,
      unmapped = false;
    const buffer = {
      mapState: "unmapped",
      mapAsync: async () => {
        if (fail) throw Error("device lost");
        buffer.mapState = "mapped";
      },
      getMappedRange: () => raw.buffer,
      unmap: () => (unmapped = true),
      destroy: () => (destroyed = true),
    };
    const renderer = {
      backend: {
        get: () => ({ texture: {} }),
        device: {
          createBuffer: () => buffer,
          createCommandEncoder: () => ({
            copyTextureToBuffer() {},
            finish() {},
          }),
          queue: { submit() {} },
        },
      },
    };
    if (fail)
      await assert.rejects(exportPixels(renderer, {}, 3, 2), /device lost/);
    else
      assert.deepEqual(
        [...(await exportPixels(renderer, {}, 3, 2))],
        [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 21, 22, 23, 24, 25, 26, 27, 28,
          29, 30, 31, 32,
        ],
      );
    assert.equal(destroyed, true);
    assert.equal(unmapped, !fail);
  }
});

test("label insets fit the data inside the plot area; zoom and pan read the inset area", () => {
  const fit = fittedLayout(400, 300, { x: [0, 10], y: [0, 10] }, {}, { x: 0.5, y: 0.5, zoom: 2 }, false, null, { left: 20, right: 80 });
  assert.deepEqual(fit.center, { x: 170, y: 150 });
  assert.ok(Math.abs(fit.insetX - 5) < 1e-9 && Math.abs(fit.visibleX - 400 / 60) < 1e-9);
});
