// TODO 26.7: Window computes every window at once over runs of rows (windows.js): every reducer,
// alignment and size, grouped or not, over a Filter's rows or not, against a brute-force
// reference (non-finite values skipped; population variance), with nothing read back.
import test from "node:test";
import assert from "node:assert/strict";
import { Array as JaxArray, numpy as np, profiler } from "@hmplot/jax";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform, disposeTransformCache } from "../../src/lib/plot/utils/transforms.js";

const OPS = ["count", "sum", "mean", "min", "max", "first", "last", "variance", "std", "any", "all"];
function reduce(values, op) {
  const finite = values.filter(Number.isFinite);
  if (op === "count") return finite.length;
  if (op === "sum") return finite.reduce((a, b) => a + b, 0);
  if (op === "any") return Number(finite.some(value => value !== 0));
  if (op === "all") return Number(finite.every(value => value !== 0));
  if (!finite.length) return NaN;
  if (op === "mean") return finite.reduce((a, b) => a + b, 0) / finite.length;
  if (op === "min") return Math.min(...finite);
  if (op === "max") return Math.max(...finite);
  if (op === "first") return finite[0];
  if (op === "last") return finite.at(-1);
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const variance = finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length;
  return op === "std" ? Math.sqrt(variance) : variance;
}
/** Window values for the kept rows, in row order, by group (or one group). */
function reference(table, kept, { size, reduce: op, align, by }) {
  const shift = align === "trailing" ? size - 1 : align === "center" ? Math.floor(size / 2) : 0;
  const runs = new Map();
  table.x.forEach((_, row) => {
    if (!kept(row)) return;
    const key = by ? table[by][row] : "";
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push(row);
  });
  const out = new Map();
  for (const rows of runs.values())
    rows.forEach((row, i) => {
      const lo = Math.max(0, i - shift), hi = Math.min(rows.length, i - shift + size);
      out.set(row, reduce(rows.slice(lo, Math.max(lo, hi)).map((r) => table.x[r]), op));
    });
  return out;
}
function table(n = 57) {
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const t = { x: [], g: [], keep: [] };
  for (let i = 0; i < n; i++) {
    t.x.push(random() < 0.1 ? NaN : Math.round((random() * 40 - 20) * 4) / 4 + (i % 7 === 0 ? 1000 : 0));
    t.g.push(["a", "b", "c"][Math.floor(random() * 3)]);
    t.keep.push(random() < 0.7 ? 1 : 0);
  }
  return t;
}
const close = (a, b, label) => assert.ok(Number.isNaN(b) ? Number.isNaN(a) : Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(b)), `${label}: ${a} vs ${b}`);

test("Window equals a brute-force reference for every reducer, alignment and size, grouped and filtered", async () => {
  const data = table(), scope = createDataScope();
  scope.update({ x: Float32Array.from(data.x), g: data.g, keep: Float32Array.from(data.keep) });
  const filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0.5 } });
  const data_ = JaxArray.prototype.data;
  let reads = 0;
  const caches = new Map();
  try {
    for (const [input, kept, label] of [[scope, () => true, "all"], [filtered, (r) => data.keep[r] > 0.5, "filtered"]])
      for (const by of [undefined, "g"])
        for (const op of OPS)
          for (const align of ["trailing", "center", "leading"])
            for (const size of [1, 3, 8, 64]) {
              const config = { field: "x", size, reduce: op, align, ...(by ? { by } : {}) };
              JaxArray.prototype.data = function (...args) { reads++; return data_.apply(this, args); };
              reads = 0;
              // With `by`, the grouping is read once per input (the transform cache keeps it).
              const key = `${label}:${by}`, first = !caches.has(key);
              if (first) caches.set(key, {});
              const view = await runTransform("Window", input, config, { cache: caches.get(key) });
              const counted = reads;
              JaxArray.prototype.data = data_;
              try {
                const name = `${label} by=${by} ${op} ${align} ${size}`;
                assert.ok(counted <= (by && first ? 1 : 0), `${name}: ${counted} readbacks`);
                const expected = reference(data, kept, config);
                const source = input === scope ? null : view.sourceIndices();
                const rows = source ? Array.from(await source.ref.data(), Number) : data.x.map((_, i) => i);
                source?.dispose();
                const got = Array.from(await view.get("smoothed").ref.data(), Number);
                assert.equal(got.length, expected.size, `${name}: rows`);
                rows.forEach((row, i) => close(got[i], expected.get(row), `${name} row ${row}`));
              } finally { view.dispose(); }
            }
  } finally {
    JaxArray.prototype.data = data_;
    for (const cache of caches.values()) disposeTransformCache(cache);
    filtered.dispose(); scope.dispose();
  }
});

// A selection keeping no row, some or every row compiles nothing new: the kept count reaches the
// kernels from a buffer (as a literal, 0 or the row count folded them into other programs).
import { assertReused } from "./compiled-programs.js";
test("Window over a Filter compiles nothing new for another selection, empty or full", async () => {
  const data = table(), scope = createDataScope();
  scope.update({ x: Float32Array.from(data.x), g: data.g, keep: Float32Array.from(data.keep) });
  for (const by of [undefined, "g"])
    for (const op of ["sum", "mean", "min", "first", "std"]) {
      const cache = {};
      const run = (value) => async () => {
        const filtered = await runTransform("Filter", scope, { where: { field: "x", op: "gt", value } });
        const view = await runTransform("Window", filtered, { field: "x", size: 4, reduce: op, ...(by ? { by } : {}) }, { cache });
        await view.padded().get("smoothed").ref.data();
        view.dispose(); filtered.dispose();
      };
      await assertReused(async () => { await run(5)(); await run(-100)(); }, async () => { await run(1e9)(); await run(0)(); await run(12)(); }, `Window ${op} by=${by}`);
      disposeTransformCache(cache);
    }
  scope.dispose();
});


test("Window reuses a visible prefix without sorting or including its hidden tail", async () => {
  const scope = createDataScope(), cache = {};
  scope.update({ x: [2, 4, 8, 100, 200] });
  const input = createDataView(scope, { mask: np.array([1, 1, 1, 0, 0], { dtype: np.int32 }), count: 3, prefix: true });
  let output, sorts = 0;
  try {
    profiler.setOpHook(name => { if (name === "argsort") sorts++; });
    output = await runTransform("Window", input, { field: "x", size: 2, align: "leading" }, { cache });
    profiler.setOpHook(null);
    assert.equal(sorts, 0, "the expression preserves the input's prefix certificate");
    assert.deepEqual(Array.from(await output.get("smoothed").ref.data()), [3, 6, 8]);
  } finally {
    profiler.setOpHook(null); output?.dispose(); input.dispose();
    disposeTransformCache(cache); scope.dispose();
  }
});
