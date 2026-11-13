// Two-stage reductions (reduce.js reduceRows, histogramRows, countRows, finiteRange): jax-js's
// WebGPU reductions give each output one thread over the reduced axis, so long axes reduce in
// blocks first. The results equal the one-pass reductions (sums to rounding).
import test from "node:test";
import assert from "node:assert/strict";
import { init, defaultDevice, numpy as np } from "@hmplot/jax";
import { reduceRows, histogramRows, countRows, finiteRange, finiteRangeWhere } from "../../src/lib/plot/utils/reduce.js";

await init("cpu");
defaultDevice("cpu");
const read = async (a) => Array.from(await a.data(), Number);
const noise = (i) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };

test("reduceRows equals one-pass sums, minima and maxima, split into blocks or not", async () => {
  for (const n of [5, 1000, 1024, 4096, 5003, 65536, 70001]) {
    const host = Float32Array.from({ length: n }, (_, i) => noise(i) * 10 - 5);
    for (const op of ["sum", "min", "max"]) {
      const [two] = await read(reduceRows(np.array(host), op)), [one] = await read(np[op](np.array(host)));
      assert.ok(Math.abs(two - one) <= 1e-3 * Math.max(1, Math.abs(one)), `${op} over ${n}: ${two} vs ${one}`);
    }
    // Over axis 0 of a matrix; int32 counts exactly.
    const matrix = np.array(Float32Array.from({ length: n * 3 }, (_, i) => noise(i)), { dtype: np.float32 }).reshape([n, 3]);
    const sums = await read(reduceRows(matrix)), expected = [0, 1, 2].map((c) => Array.from({ length: n }, (_, r) => Math.fround(noise(r * 3 + c))).reduce((a, b) => a + b, 0));
    sums.forEach((s, c) => assert.ok(Math.abs(s - expected[c]) <= 1e-3 * Math.max(1, expected[c]), `columns over ${n}`));
    const mask = Int32Array.from({ length: n }, (_, i) => (noise(i) > 0.4 ? 1 : 0));
    const [count] = await read(countRows(np.array(mask, { dtype: np.int32 })));
    assert.equal(count, mask.reduce((a, b) => a + b, 0), `count over ${n}`);
  }
});

test("finiteRange skips missing values, and rows not valid", async () => {
  const host = Float32Array.from({ length: 3001 }, (_, i) => (i % 97 === 0 ? NaN : noise(i) * 4));
  const valid = Int32Array.from({ length: 3001 }, (_, i) => (i % 5 ? 1 : 0));
  const finite = [...host].filter(Number.isFinite), kept = [...host].filter((v, i) => Number.isFinite(v) && valid[i]);
  assert.deepEqual(await read(finiteRange(np.array(host))), [Math.min(...finite), Math.max(...finite)]);
  assert.deepEqual(await read(finiteRangeWhere(np.array(host), np.array(valid, { dtype: np.int32 }))), [Math.min(...kept), Math.max(...kept)]);
});

test("histogramRows equals a brute-force weighted histogram", async () => {
  for (const [n, total] of [[40, 5], [3001, 64], [70000, 3], [16384, 512]]) {
    const codes = Int32Array.from({ length: n }, (_, i) => (i % 11 === 0 ? -1 : Math.floor(noise(i) * total)));
    const weights = [Float32Array.from({ length: n }, () => 1), Float32Array.from({ length: n }, (_, i) => noise(i + 7))];
    const code = np.array(codes, { dtype: np.int32 }), arrays = weights.map((w) => np.array(w));
    const results = histogramRows(code, arrays, total);
    for (const [k, result] of results.entries()) {
      const expected = new Array(total).fill(0);
      codes.forEach((c, i) => { if (c >= 0) expected[c] += weights[k][i]; });
      (await read(result)).forEach((v, c) => assert.ok(Math.abs(v - expected[c]) <= 1e-3 * Math.max(1, expected[c]), `n ${n} weight ${k} bin ${c}: ${v} vs ${expected[c]}`));
    }
    code.dispose(); arrays.forEach((a) => a.dispose());
  }
});
