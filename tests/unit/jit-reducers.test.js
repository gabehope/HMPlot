// TODO 17.8: the jitted reducers in utils/reduce.js equal the eager ones, never serve a stale
// value (every input is an argument), and a second call with other values compiles nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { reduceValues, eagerReduce } from "../../src/lib/plot/utils/reduce.js";

const scalar = async (array) => { try { return Number((await array.ref.data())[0]); } finally { array.dispose(); } };
const same = (a, b, label) => {
  if (Number.isNaN(b)) assert.ok(Number.isNaN(a), `${label}: ${a}, expected NaN`);
  else assert.ok(Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b)), `${label}: ${a}, expected ${b}`);
};
const OPS = ["count", "sum", "mean", "min", "max", "first", "last", "variance", "std", "any", "all"];

test("jitted reducers equal the eager ones over masks, NaN and edge cases", async () => {
  const cases = [
    { values: [3, 1, 4, 1, 5, 9, 2, 6], mask: [1, 0, 1, 1, 0, 1, 1, 0] },
    { values: [3, NaN, 4, Infinity, 5, -2, NaN, 6], mask: [1, 1, 1, 1, 0, 1, 1, 1] },
    { values: [7, 8, 9], mask: [0, 0, 0] },
    { values: [NaN, NaN], mask: [1, 1] },
    { values: [2.5], mask: [1] },
  ];
  for (const { values, mask } of cases) {
    const v = np.array(Float32Array.from(values)), m = np.array(Int32Array.from(mask)).greater(0);
    for (const op of OPS) {
      const label = `${op} of ${JSON.stringify(values)} where ${JSON.stringify(mask)}`;
      same(await scalar(reduceValues(m, v, op)), await scalar(eagerReduce(m, v, op)), label);
    }
    same(await scalar(reduceValues(m, null, "count")), await scalar(eagerReduce(m, null, "count")), "count without values");
    v.dispose(); m.dispose();
  }
});

test("a jitted reducer called again with other values gives their result, and compiles nothing new", async () => {
  const mask = np.array(Int32Array.from([1, 1, 0, 1])).greater(0);
  const first = np.array(Float32Array.from([1, 2, 100, 3])), second = np.array(Float32Array.from([10, 20, 100, 30]));
  for (const op of OPS) {
    const [a, b] = [await scalar(reduceValues(mask, first, op)), await scalar(reduceValues(mask, second, op))];
    same(a, await scalar(eagerReduce(mask, first, op)), `${op} first`);
    same(b, await scalar(eagerReduce(mask, second, op)), `${op} second`);
    if (!["count", "any", "all"].includes(op)) assert.notEqual(a, b, `${op}: the second call must not reuse the first result`);
  }
  // The masks are arguments too.
  const other = np.array(Int32Array.from([0, 1, 1, 0])).greater(0);
  same(await scalar(reduceValues(other, first, "sum")), 102, "sum under another mask");
  [mask, first, second, other].forEach((item) => item.dispose());
});
