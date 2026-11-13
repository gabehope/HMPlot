// TODO 26.1: BoxStats, BoxOutliers and the quantile reducer (the Quantile transform until TODO
// 137.3) compute every group at once on the device (one sort by group and value, quantiles
// gathered at computed positions). Checked against a plain
// reference on irregular groups (sizes 0-37, ties, NaNs, one value, one group with no finite
// value), with and without a Filter's mask.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { quantile as quantileOf } from "../../src/lib/plot/utils/expressions.js";

const names = ["a", "b", "c", "d", "e", "f"];
function table() {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const g = [], v = [], keep = [];
  const sizes = { a: 37, b: 1, c: 12, d: 5, e: 20, f: 3 };
  for (const [name, size] of Object.entries(sizes))
    for (let i = 0; i < size; i++) {
      g.push(name);
      // Ties on a coarse grid, a few NaNs, outliers in e, and f all NaN.
      v.push(name === "f" || random() < 0.05 ? NaN : name === "e" && i < 3 ? 100 + i : Math.round(random() * 20) / 2);
      keep.push(random() < 0.7 ? 1 : 0);
    }
  // Shuffle so groups interleave.
  const order = g.map((_, i) => i).sort((i, j) => Math.sin(i * 7.1) - Math.sin(j * 7.1));
  return { g: order.map((i) => g[i]), v: order.map((i) => v[i]), keep: order.map((i) => keep[i]) };
}
const quantile = (sorted, p) => {
  const at = p * (sorted.length - 1), lo = Math.floor(at), hi = Math.ceil(at), t = at - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
};
function reference(data, kept) {
  const groups = new Map();
  data.g.forEach((name, i) => {
    if (!kept(i)) return;
    if (!groups.has(name)) groups.set(name, []);
    if (Number.isFinite(data.v[i])) groups.get(name).push(data.v[i]);
  });
  return new Map([...groups].map(([name, values]) => {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return [name, { sorted, q1: NaN, median: NaN, q3: NaN, whiskerLow: NaN, whiskerHigh: NaN, low: NaN, high: NaN }];
    const q1 = quantile(sorted, 0.25), median = quantile(sorted, 0.5), q3 = quantile(sorted, 0.75), span = q3 - q1;
    const low = q1 - 1.5 * span, high = q3 + 1.5 * span;
    return [name, { sorted, q1, median, q3, low, high,
      whiskerLow: Math.min(...sorted.filter((x) => x >= low)), whiskerHigh: Math.max(...sorted.filter((x) => x <= high)) }];
  }));
}
const read = async (value) => Array.from(await (value.codes ?? value).ref.data(), Number);
const close = (a, b, label) => assert.ok(Number.isNaN(b) ? Number.isNaN(a) : Math.abs(a - b) < 1e-4, `${label}: ${a} vs ${b}`);

test("BoxStats, BoxOutliers and quantile by group equal a plain reference, with and without a mask", async () => {
  const data = table(), scope = createDataScope();
  scope.update({ g: data.g, v: Float32Array.from(data.v), keep: Float32Array.from(data.keep) });
  const filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0.5 } });
  try {
    for (const [input, kept, label] of [[scope, () => true, "all rows"], [filtered, (i) => data.keep[i] > 0.5, "filtered"]]) {
      const expected = reference(data, kept);
      const stats = await runTransform("BoxStats", input, { by: "g", value: "v" });
      try {
        const g = stats.get("g"), codes = await read(g);
        assert.deepEqual(codes.map((c) => g.categories[c]).sort(), [...expected.keys()].sort(), `${label}: groups`);
        for (const name of ["q1", "median", "q3", "whiskerLow", "whiskerHigh"]) {
          const values = await read(stats.get(name));
          codes.forEach((c, i) => close(values[i], expected.get(g.categories[c])[name], `${label} ${g.categories[c]} ${name}`));
        }
      } finally { stats.dispose(); }
      const outliers = await runTransform("BoxOutliers", input, { by: "g", value: "v" });
      try {
        // sourceIndices() returns the caller's array: read it without another reference.
        const rows = Array.from(await outliers.sourceIndices().data(), Number).sort((a, b) => a - b);
        const want = data.v.map((x, i) => i).filter((i) => {
          const e = expected.get(data.g[i]);
          return kept(i) && Number.isFinite(data.v[i]) && (data.v[i] < e.low || data.v[i] > e.high);
        });
        assert.deepEqual(rows, want, `${label}: outlier rows`);
      } finally { outliers.dispose(); }
      const probabilities = [0, 0.1, 0.29, 0.5, 0.75, 1];
      const columns = Object.fromEntries(probabilities.map((p, i) => [`q${i}`, quantileOf("v", p, { by: "g" })]));
      const q = await runTransform("Calculate", input, { columns });
      try {
        const rows = input === scope ? data.g.map((_, i) => i) : Array.from(await q.sourceIndices().data(), Number);
        for (const [i, prob] of probabilities.entries()) {
          const value = await read(q.get(`q${i}`));
          rows.forEach((row, k) => {
            const e = expected.get(data.g[row]);
            close(value[k], e.sorted.length ? quantile(e.sorted, prob) : NaN, `${label} ${data.g[row]} p=${prob}`);
          });
        }
      } finally { q.dispose(); }
    }
  } finally { filtered.dispose(); scope.dispose(); }
});

// TODO 26.2: over a Filter's rows a grouped transform groups the same physical rows on every run;
// with its transform cache it groups once, and a brush move reads back only its output's count.
import { Array as JaxArray } from "@hmplot/jax";
import { mean } from "../../src/lib/plot/utils/expressions.js";
async function reads(run) {
  const data = JaxArray.prototype.data;
  let count = 0;
  JaxArray.prototype.data = function (...args) { count++; return data.apply(this, args); };
  try { await run(); return count; } finally { JaxArray.prototype.data = data; }
}
test("grouped transforms over a Filter reuse their grouping and read back only their count", async () => {
  const data = table(), scope = createDataScope();
  scope.update({ g: data.g, v: Float32Array.from(data.v), keep: Float32Array.from(data.keep) });
  for (const [kind, config] of [["BoxStats", { by: "g", value: "v" }], ["Group", { by: "g", columns: { m: mean("v") } }],
    ["BoxOutliers", { by: "g", value: "v" }]]) {
    const cache = {}, counts = [];
    for (const value of [0.5, 0.2, 0.7]) {
      const filtered = await runTransform("Filter", scope, { where: { field: "v", op: "gt", value } });
      counts.push(await reads(async () => { const view = await runTransform(kind, filtered, config, { cache }); view.dispose(); }));
      filtered.dispose();
    }
    assert.deepEqual(counts.slice(1), [1, 1], `${kind}: one readback per brush move once grouped (${counts})`);
    assert.ok(counts[0] > counts[1], `${kind}: the first run groups (${counts})`);
    // New data regroups.
    scope.update({ g: data.g.map((g) => (g === "a" ? "z" : g)), v: Float32Array.from(data.v), keep: Float32Array.from(data.keep) });
    const view = await runTransform(kind, scope, config, { cache });
    if (kind !== "BoxOutliers") {
      const key = view.get("g");
      assert.ok(key.categories.includes("z"), `${kind}: regrouped after new data`);
    }
    view.dispose();
    cache.grouping?.groups.dispose();
    scope.update({ g: data.g, v: Float32Array.from(data.v), keep: Float32Array.from(data.keep) });
  }
  scope.dispose();
});

test("BoxStats leaves a reversed whisker undrawn, as ErrorBars did", async () => {
  const scope = createDataScope();
  scope.update({ g: ["a", "a", "b", "b", "b"], v: Float32Array.from([0, 10, 0, 5, 10]) });
  try {
    const view = await runTransform("BoxStats", scope, { by: "g", value: "v", whisker: 0.2 });
    try {
      const start = Array.from(await view.get("__whiskerStart").ref.data(), Number);
      // a: whiskers 10 to 0 (two values, under half an IQR); b: 5 to 5.
      assert.ok(Number.isNaN(start[1]));
      assert.equal(start[3], 5);
    } finally {
      view.dispose();
    }
  } finally {
    scope.dispose();
  }
});
