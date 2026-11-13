// Copy into the patched jax-js checkout's test/ and run with Vitest in Chrome.
// The one-hot reference is frozen from HMPlot 14cd55f5, reduce.js. Timings include readback;
// these are kernel crossover measurements, not plot-frame or end-to-end claims.
import { numpy as np, jit, lax, init, defaultDevice } from "@jax-js/jax";
import { test, expect } from "vitest";
const SPLIT_ROWS = 65536, BLOCKS = 256;
function reduceRows(values, op = "sum") {
  const [n, ...rest] = values.shape;
  if (rest.length || n < SPLIT_ROWS) return np[op](values, 0);
  const length = Math.ceil(n / BLOCKS), padded = length * BLOCKS;
  const fill = op === "sum" ? 0 : op === "max" ? -Infinity : Infinity;
  const whole = padded === n ? values
    : np.concatenate([values, np.full([padded - n], fill, { dtype: values.dtype })]);
  return np[op](np[op](whole.reshape([BLOCKS, length]), 1), 0);
}

/**
 * Jitted totals for the eager call sites (a Filter's kept count, an axis extent): each is one
 * cached program instead of a handful of eager operations, each hashed to find its kernel.
 * Arguments are consumed.
 */
const countRows = jit((mask) => reduceRows(mask.astype(np.float32)));
/** [min, max] of the finite values (valid > 0 where `valid` is given), or [Inf, -Inf] if none. */
const finiteRange = jit((values) => {
  const keep = np.isfinite(values.ref);
  return np.stack([reduceRows(np.where(keep.ref, values.ref, Infinity), "min"), reduceRows(np.where(keep, values, -Infinity), "max")]);
});
const finiteRangeWhere = jit((values, valid) => {
  const keep = np.logicalAnd(np.isfinite(values.ref), valid.greater(0));
  return np.stack([reduceRows(np.where(keep.ref, values.ref, Infinity), "min"), reduceRows(np.where(keep, values, -Infinity), "max")]);
});

/**
 * Weighted counts per code (a histogram): for each weight array, the sum of the weights of the
 * rows whose `code` (int32 [n]; -1 for none) is c, for c in 0 .. total - 1: a one-hot comparison
 * fused into a sum over the rows (reduceRows), in chunks of about 8M one-hot entries when `total`
 * is large. Borrows its arguments.
 */
function histogramRows(code, weights, total) {
  const n = code.shape[0], index = np.arange(total).astype(np.int32).reshape([1, total]);
  if (!n) { index.dispose(); return weights.map(() => np.zeros([total], { dtype: np.float32 })); }
  const perChunk = Math.max(1, Math.floor(8_000_000 / total));
  const totals = weights.map(() => null);
  for (let start = 0; start < n; start += perChunk) {
    const end = Math.min(n, start + perChunk), rows = end - start;
    // One expression per weight (comparison, weight, reduction): a one-hot shared between the
    // weights would be stored whole.
    weights.forEach((w, i) => {
      const part = np.where(code.ref.slice([start, end]).reshape([rows, 1]).equal(index.ref),
        w.ref.slice([start, end]).reshape([rows, 1]), 0);
      const sum = reduceRows(part);
      totals[i] = totals[i] ? totals[i].add(sum) : sum;
    });
  }
  index.dispose();
  return totals;
}

/**
 * `op` ("sum", "min" or "max") of `values` (float32 [n]) per code: for c in 0 .. total - 1, over
 * the rows whose `code` (int32 [n]; -1 for none) is c; a code with no row is 0 (sum) or +-Inf.
 * A one-hot comparison fused into a reduction over the rows, chunked as histogramRows. Borrows
 * its arguments (TODO 29.7).
 */
function reduceByCode(code, values, total, op = "sum") {
  const fill = op === "sum" ? 0 : op === "min" ? Infinity : -Infinity;
  const n = code.shape[0];
  if (!total) return np.zeros([0], { dtype: np.float32 });
  if (!n) return np.full([total], fill, { dtype: np.float32 });
  const index = np.arange(total).astype(np.int32).reshape([1, total]);
  const perChunk = Math.max(1, Math.floor(8_000_000 / total));
  let result = null;
  for (let start = 0; start < n; start += perChunk) {
    const end = Math.min(n, start + perChunk), rows = end - start;
    const part = np.where(code.ref.slice([start, end]).reshape([rows, 1]).equal(index.ref),
      values.ref.slice([start, end]).reshape([rows, 1]), fill);
    const reduced = reduceRows(part, op);
    result = !result ? reduced : op === "sum" ? result.add(reduced) : np[op === "min" ? "minimum" : "maximum"](result, reduced);
  }
  index.dispose();
  return result;
}


test("scatter crossover", async () => {
  expect(await init("webgpu")).toContain("webgpu");
  defaultDevice("webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  console.log("ADAPTER", JSON.stringify(Object.fromEntries(["vendor", "architecture", "device", "description", "isFallbackAdapter"].map(k => [k, adapter.info[k]]))));
  const results = [];
  for (const n of [4096, 8192, 16384, 32768, 65536, 262144]) for (const groups of [4, 16, 64, 256, 512, 1024]) {
    for (const skew of [false, true]) for (const op of ["sum", "min", "max"]) {
      const codes = np.array(Int32Array.from({ length: n }, (_, i) => skew && i % 10 ? 0 : i % groups), { dtype: np.int32 });
      const values = np.array(Float32Array.from({ length: n }, (_, i) => (i % 31 - 15) / 16));
      const onehot = jit((c, v) => { const r = reduceByCode(c, v, groups, op); c.dispose(); v.dispose(); return r; });
      const scatter = jit((c, v) => {
        if (op !== "sum") return lax.scatter(v, c, [groups], { mode: op });
        const stripes = Math.min(256, Math.ceil(n / 256));
        const offsets = np.arange(n).astype(np.int32).mod(stripes).mul(groups);
        const indices = np.where(c.ref.greaterEqual(0), c.add(offsets), -1).astype(np.int32);
        return np.sum(lax.scatter(v, indices, [stripes * groups], { mode: "add" }).reshape([stripes, groups]), 0);
      });
      const methods = { onehot, scatter }, samples = { onehot: [], scatter: [] };
      const expected = await onehot(codes.ref, values.ref).data();
      expect(Array.from(await scatter(codes.ref, values.ref).data())).toEqual(Array.from(expected));
      for (let repeat = 0; repeat < 8; repeat++) {
        for (const name of repeat % 2 ? ["scatter", "onehot"] : ["onehot", "scatter"]) {
          const started = performance.now();
          await methods[name](codes.ref, values.ref).data();
          if (repeat >= 2) samples[name].push(performance.now() - started);
        }
      }
      codes.dispose(); values.dispose();
      const row = { n, groups, skew, op, samples };
      results.push(row); console.log("CROSSOVER", JSON.stringify(row));
    }
  }
}, 180000);
