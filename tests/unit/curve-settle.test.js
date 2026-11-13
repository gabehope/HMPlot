import test from "node:test";
import assert from "node:assert/strict";
import { CurvedPaths } from "../../src/lib/plot/utils/curvedPaths.js";

test("a curved mark whose ends failed to upload is settled, not waited for (TODO 136.2)", () => {
  const start = { isBufferNode: false, failed: false }, end = { isBufferNode: false };
  const mark = { fields: new Map([["start", start], ["end", end]]), count: 3, curvedFields: ["start", "end"],
    options: { get: (key) => (key === "curve" ? "quadratic" : undefined) } };
  const paths = new CurvedPaths(/** @type {any} */ (mark));
  mark.curvedPaths = paths;
  assert.equal(paths.prepare({}, 10, 10), false, "ends still uploading: not ready");
  start.failed = true;
  assert.equal(paths.prepare({}, 10, 10), true, "an end failed: settled, its error on the plot");
});
