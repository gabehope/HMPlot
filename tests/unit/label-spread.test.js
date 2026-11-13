import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadOffsets } from "../../src/lib/plot/utils/labelSpread.js";

// TODO 136.16: end labels spread apart by the least that clears them, centred on their points.
test("labels closer than the gap move apart around their mean; others stay", () => {
  assert.deepEqual(spreadOffsets([100, 102, 200], 10), [-4, 4, 0]);
  assert.deepEqual(spreadOffsets([0, 50, 100], 10), [0, 0, 0]);
  const at = [10, 11, 12, 13], moved = spreadOffsets(at, 10).map((o, i) => at[i] + o);
  for (let i = 1; i < moved.length; i++) assert.ok(moved[i] - moved[i - 1] >= 10 - 1e-9);
  assert.ok(Math.abs(moved.reduce((a, b) => a + b) / 4 - 11.5) < 1e-9);
  assert.deepEqual(spreadOffsets([5, Number.NaN], 10), [0, 0]);
});
