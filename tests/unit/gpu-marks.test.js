import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { arrowArrays } from "../../src/lib/plot/binding/arrowInputs.js";
import { disposeArrays } from "../../src/lib/plot/utils/data.js";
test("arrows preserve zero-length instances, attribute alignment, and caller references", () => {
  const input = {
    start: np.array([
      [0, 0],
      [1, 2],
    ]),
    end: np.array([
      [0, 0],
      [3, 4],
    ]),
    width: np.array([1, 2]),
    color: np.array([0.2, 0.7]),
  };
  const output = arrowArrays(input);
  assert.deepEqual(output.start.ref.js(), [
    [0, 0, 0],
    [1, 2, 0],
  ]);
  assert.deepEqual(output.width.ref.js(), [[1], [2]]);
  disposeArrays(output);
  for (const value of Object.values(input)) assert.equal(value.refCount, 1);
  disposeArrays(input);
});
test("empty arrays and invalid shapes never consume caller inputs", () => {
  const width = np.zeros([0]);
  const empty = arrowArrays({ start: [], end: [], width });
  disposeArrays(empty);
  assert.equal(width.refCount, 1);
  width.dispose();
  const start = np.array([
    [0, 0],
    [1, 1],
  ]);
  for (const make of [arrowArrays]) {
    assert.throws(() => make({ start, end: [[0, 0]] }), /match start/);
    assert.throws(
      () =>
        make({
          start,
          end: start,
          width: [
            [1, 2],
            [3, 4],
          ],
        }),
      /width must/,
    );
    assert.equal(start.refCount, 1);
  }
  start.dispose();
});

test("GPU scalar attributes broadcast without consuming the caller", () => {
  const width = np.array(2);
  const input = {
    start: [
      [0, 0],
      [1, 1],
    ],
    end: [
      [1, 1],
      [2, 2],
    ],
    width,
  };
  const arrows = arrowArrays(input);
  assert.deepEqual(arrows.width.ref.js(), [[2], [2]]);
  disposeArrays(arrows);
  assert.equal(width.refCount, 1);
  width.dispose();
});
