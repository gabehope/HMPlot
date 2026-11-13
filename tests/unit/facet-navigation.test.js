import { test } from "node:test";
import assert from "node:assert/strict";
import {
  linkedViewport,
  normalizeViewport,
  zoomViewport,
} from "../../src/lib/plot/utils/viewport.js";

test("linked axes retain peer dimensions and complete source gestures zoom reciprocally", () => {
  const start = normalizeViewport();
  const source = zoomViewport(start, 2);
  const peer = linkedViewport(
    { x: 0.5, y: 0.7, zoomX: 3, zoomY: 4 },
    source,
    "x",
  );
  assert.equal(peer.zoomX, 2);
  assert.equal(peer.zoomY, 4);
  assert.equal(peer.y, 0.7);
  assert.deepEqual(zoomViewport(source, 0.5), start);
  assert.equal(linkedViewport(undefined, source, "x").zoomY, 1);
  assert.equal(linkedViewport(undefined, source, "y").zoomX, 1);
  assert.deepEqual(linkedViewport(start, source, "xy"), source);
  const centered = { ...source, center: [12, -5] };
  assert.deepEqual(linkedViewport({ ...start, center: [0, 0] }, centered, "xy").center, [12, -5]);
  assert.deepEqual(linkedViewport({ ...start, center: [0, 0] }, centered, "x").center, [0, 0]);
});
