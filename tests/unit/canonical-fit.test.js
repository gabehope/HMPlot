import test from "node:test";
import assert from "node:assert/strict";
import { fitCanonicalPoint } from "../../src/lib/plot/utils/canonicalFit.js";

test("a polar circle keeps its aspect in unequal parent ranges", () => {
  const bounds = [[-2, 2], [-2, 2]], ranges = [[0, 8], [0, 4]];
  assert.deepEqual(fitCanonicalPoint([2, 0], bounds, ranges), [6, 2]);
  assert.deepEqual(fitCanonicalPoint([0, 2], bounds, ranges), [4, 4]);
  assert.deepEqual(fitCanonicalPoint([-2, 0], bounds, ranges), [2, 2]);
  assert.deepEqual(fitCanonicalPoint([2, 0], bounds, [[8, 0], [0, 4]]), [2, 2]);
});

test("a spherical volume fits uniformly and invalid ranges are diagnosed", () => {
  const bounds = [[-1, 1], [-1, 1], [-1, 1]];
  assert.deepEqual(fitCanonicalPoint([1, 0, -1], bounds, [[0, 4], [0, 6], [0, 2]]), [3, 3, 0]);
  assert.throws(() => fitCanonicalPoint([0, 0], bounds, [[0, 0], [0, 4]]),
    { message: "Canonical fit intervals require two distinct finite values." });
  assert.throws(() => fitCanonicalPoint([0, 0], bounds, [[0, Infinity], [0, 4]]),
    { message: "Canonical fit intervals require two distinct finite values." });
  assert.throws(() => fitCanonicalPoint([0], bounds, [[0, 4], [0, 4]]),
    { message: "Canonical fit requires matching two- or three-dimensional bounds and ranges." });
});
