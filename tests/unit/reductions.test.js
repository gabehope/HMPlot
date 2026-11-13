import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
import test from "node:test";
import { numpy as np } from "@hmplot/jax";
import * as numeric from "../../src/lib/plot/utils/expressions.js";
import { literal } from "../../src/lib/plot/utils/names.js";
import { createExpressionEvaluator } from "../../src/lib/plot/utils/expressionPlans.js";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { typedColumn as column } from "../../src/lib/plot/utils/columns.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import {
  mean, sum, count, min, max, std, variance, median, quantile, mode, first, last,
  col, cumsum, view, subtract, divide, greater, power, expressionFields, REDUCTIONS,
} from "../../src/lib/plot/utils/expressions.js";

const data = (value) => {
  const scope = createDataScope();
  scope.update(value);
  return scope;
};
async function calculate(scope, columns) {
  const view = await runTransform("Calculate", scope, { columns });
  const out = {};
  for (const name of Object.keys(columns)) {
    const column = view.get(name);
    const codes = column?.codes ?? column;
    const values = Array.from(await codes.ref.data());
    out[name] = column?.categories ? values.map((code) => column.categories[code] ?? null) : values;
  }
  view.dispose();
  return out;
}
const round = (value, places = 6) => Math.round(value * 10 ** places) / 10 ** places;

test("cached scalar reductions stay valid until each evaluation is disposed", () => {
  const scope = data({ x: [1, 2, 3] });
  const reduced = mean("x");
  const roots = [reduced, numeric.interval(reduced, 1), numeric.as_numeric(reduced)];
  try {
    // The final borrowed value may pass through operators that preserve their input.
    for (const root of roots) {
      const cache = new Map();
      const results = [];
      try {
        for (let read = 0; read < 2; read++) {
          results.push(numeric.evaluateExpression(root, scope, {
            broadcast: false,
            reductionCache: cache,
          }));
        }
        const stored = cache.get(reduced).value;
        assert.equal(results[0].value, stored);
        assert.equal(results[1].value, stored, "cache hits acquire a reference without copying");
        numeric.releaseReductionCache(cache);
        for (const result of results) assert.equal(result.value.ref.js(), 2);
        results[0].dispose();
        assert.equal(results[1].value.ref.js(), 2, "one evaluation cannot retire another's value");
        results[1].dispose();
        assert.equal(stored.refCount, 0);
      } finally {
        results.forEach(result => result.dispose());
        numeric.releaseReductionCache(cache);
      }
    }
  } finally {
    scope.dispose();
  }
});

test("every reduction skips missing values and broadcasts over the rows", async () => {
  const scope = data({ x: [1, 2, 2, NaN, 5] });
  const out = await calculate(scope, {
    mean: mean("x"), sum: sum("x"), values: count("x"), rows: count(),
    min: min("x"), max: max("x"), std: std("x"), variance: variance("x"),
    median: median("x"), mode: mode("x"), first: first("x"), last: last("x"),
  });
  // 1, 2, 2, 5: mean 2.5, population variance 2.25.
  const expected = { mean: 2.5, sum: 10, values: 4, rows: 5, min: 1, max: 5, std: 1.5,
    variance: 2.25, median: 2, mode: 2, first: 1, last: 5 };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(out[name].length, 5, name);
    assert.deepEqual(out[name].map((v) => round(v)), Array(5).fill(value), name);
  }
  scope.dispose();
});

test("median takes the middle of an odd count and averages an even one", async () => {
  const odd = data({ x: [5, 1, 3] }), even = data({ x: [5, 1, 3, 9] });
  assert.equal((await calculate(odd, { m: median("x") })).m[0], 3);
  assert.equal((await calculate(even, { m: median("x") })).m[0], 4);
  odd.dispose(); even.dispose();
});

// TODO 137.3: quantile is a reducer (the Quantile transform is gone), numpy's linear interpolation.
test("quantile interpolates between the nearest ranks, takes by and where, and checks p", async () => {
  const scope = data({ x: [5, 1, NaN, 3, 9], g: ["a", "b", "a", "b", "a"], keep: [1, 1, 1, 0, 1] });
  const out = await calculate(scope, {
    q0: quantile("x", 0), q25: quantile("x", 0.25), q50: quantile("x", 0.5), q1: quantile("x", 1),
    byG: quantile("x", 0.75, { by: "g" }), kept: quantile("x", 0.5, { where: "keep" }),
  });
  // 1, 3, 5, 9: positions 0, 0.75, 1.5 and 3.
  assert.deepEqual([out.q0[0], out.q25[0], out.q50[0], out.q1[0]], [1, 2.5, 4, 9]);
  // a: 5, 9 (position 0.75 -> 8); b: 1, 3 (-> 2.5).
  assert.deepEqual(out.byG, [8, 2.5, 8, 2.5, 8]);
  assert.equal(out.kept[0], 5); // 1, 5, 9
  assert.throws(() => quantile("x", 1.5), /quantile needs p, a probability from 0 to 1/);
  assert.throws(() => quantile("x"), /quantile needs p/);
  const grouped = await runTransform("Group", scope, { by: "g", columns: { p90: quantile("x", 0.9) } });
  assert.deepEqual(Array.from(await grouped.get("p90").ref.data()).map((v) => round(v, 4)), [8.6, 2.8]);
  grouped.dispose();
  scope.dispose();
});

// TODO 137.3: the ECDF transform is gone; Calculate gives the same fraction with distinct values.
test("an ECDF is a running count over the group's count", async () => {
  const scope = data({ x: [3, 1, 2, 5, 4], g: ["a", "a", "b", "a", "b"] });
  const out = await calculate(scope, { ecdf: divide(cumsum(numeric.is_finite("x"), { by: "g", orderBy: "x" }), count("x", { by: "g" })) });
  assert.deepEqual(out.ecdf.map((v) => round(v, 4)), [0.6667, 0.3333, 0.5, 1, 1]);
  scope.dispose();
});

test("mode takes the most common value and the smallest of a tie", async () => {
  const tie = data({ x: [3, 3, 1, 1, 7] });
  assert.equal((await calculate(tie, { m: mode("x") })).m[0], 1);
  const clear = data({ x: [3, 9, 9, 9, 1] });
  assert.equal((await calculate(clear, { m: mode("x") })).m[0], 9);
  tie.dispose(); clear.dispose();
});

test("an empty input is NaN, except count and sum", async () => {
  const scope = data({ x: column([], { type: "numeric" }) });
  const out = await calculate(scope, { m: mean("x"), s: sum("x"), c: count("x") });
  assert.ok(Number.isNaN(out.m[0] ?? NaN));
  assert.deepEqual([out.s[0] ?? 0, out.c[0] ?? 0], [0, 0]);
  scope.dispose();
});

test("by returns each row's own group value, and unknown keys are NaN", async () => {
  const scope = data({ x: [1, 2, 2, NaN, 5], g: ["a", "a", "b", "b", "b"] });
  const out = await calculate(scope, {
    m: mean("x", { by: "g" }),
    z: divide(subtract("x", mean("x", { by: "g" })), std("x", { by: "g" })),
  });
  assert.deepEqual(out.m.map((v) => round(v)), [1.5, 1.5, 3.5, 3.5, 3.5]);
  assert.deepEqual(out.z.slice(0, 2).map((v) => round(v, 3)), [-1, 1]);
  scope.dispose();
});

test("by accepts several categorical keys and rejects a numeric one", async () => {
  const scope = data({ x: [1, 2, 3, 4], g: ["a", "a", "b", "b"], h: ["p", "q", "p", "q"], n: [1, 1, 2, 2] });
  const out = await calculate(scope, { m: mean("x", { by: ["g", "h"] }) });
  assert.deepEqual(out.m, [1, 2, 3, 4]);
  await assert.rejects(() => calculate(scope, { m: mean("x", { by: "n" }) }), /categorical column/);
  scope.dispose();
});

// TODO 137.2: grouped reductions run over sorted runs of the keys, so the group count has no
// limit (it was 1,024, a dispatch per group), and every reducer matches a per-group reference.
test("by reduces any number of groups, every reducer matching a per-group reference", async () => {
  const n = 5000, groups = 2500;
  const x = Array.from({ length: n }, (_, i) => (i % 11 === 3 ? NaN : Math.round(Math.sin(i * 1.3) * 4)));
  const g = Array.from({ length: n }, (_, i) => `g${(i * 7) % groups}`);
  const scope = data({ x, g });
  const ops = { mean, sum, count, min, max, std, variance, median, mode, first, last,
    quantile: (value, options) => quantile(value, 0.9, options) };
  const out = await calculate(scope, Object.fromEntries(Object.entries(ops).map(([name, op]) => [name, op("x", { by: "g" })])));
  const members = new Map();
  g.forEach((key, row) => { if (!members.has(key)) members.set(key, []); if (Number.isFinite(x[row])) members.get(key).push(x[row]); });
  const reference = (op, values) => {
    if (op === "count") return values.length;
    if (op === "sum") return values.reduce((a, b) => a + b, 0);
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b), m = values.reduce((a, b) => a + b, 0) / values.length;
    const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
    if (op === "median") return (sorted[(values.length - 1) >> 1] + sorted[values.length >> 1]) / 2;
    if (op === "quantile") {
      const at = (values.length - 1) * 0.9, below = Math.floor(at);
      return sorted[below] + ((sorted[below + 1] ?? sorted[below]) - sorted[below]) * (at - below);
    }
    if (op === "mode") {
      let best = sorted[0], bestRun = 0;
      for (let i = 0, run = 0; i < sorted.length; i++) {
        run = i && sorted[i] === sorted[i - 1] ? run + 1 : 1;
        if (run > bestRun) [best, bestRun] = [sorted[i], run];
      }
      return best;
    }
    return { mean: m, min: sorted[0], max: sorted.at(-1), first: values[0], last: values.at(-1), std: Math.sqrt(v), variance: v }[op];
  };
  for (const op of Object.keys(ops))
    g.forEach((key, row) => {
      const expected = reference(op, members.get(key)), actual = out[op][row];
      if (Number.isNaN(expected)) assert.ok(Number.isNaN(actual), `${op} row ${row}`);
      else assert.ok(Math.abs(actual - expected) < 1e-4, `${op} row ${row}: ${actual}, expected ${expected}`);
    });
  scope.dispose();
});

// TODO 137.2 review: each run is scanned on its own, so a one-row group after a large one keeps
// its value exactly (a prefix sum over every row lost it); hidden rows and orderBy apply.
test("by over many groups keeps small groups exact, skips hidden rows and follows orderBy", async () => {
  const n = 4000, big = n - 2100;
  const x = Array.from({ length: n }, (_, i) => 1e5 + (i % 7));
  const g = Array.from({ length: n }, (_, i) => (i < big ? "big" : `g${i}`));
  const keep = Array.from({ length: n }, (_, i) => (i % 5 === 1 ? 0 : 1));
  const order = Array.from({ length: n }, (_, i) => -i);
  const scope = data({ x, g, keep, order });
  const filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0 } });
  const out = await calculate(filtered, {
    s: sum("x", { by: "g" }), m: mean("x", { by: "g" }), c: count("x", { by: "g" }),
    l: first("x", { by: "g", orderBy: "order" }),
  });
  const rows = Array.from({ length: n }, (_, i) => i).filter((i) => keep[i]);
  assert.equal(out.s.length, rows.length);
  const bigRows = rows.filter((i) => i < big);
  rows.forEach((row, k) => {
    if (row < big) {
      assert.equal(out.c[k], bigRows.length);
      assert.equal(out.l[k], x[bigRows.at(-1)], "first by descending order is the last kept row");
    } else {
      assert.deepEqual([out.s[k], out.m[k], out.c[k], out.l[k]], [x[row], x[row], 1, x[row]], `row ${row}`);
    }
  });
  filtered.dispose();
  scope.dispose();
});

test("mode, first, and last of a category column stay categorical", async () => {
  const scope = data({ g: ["a", "b", "b", "b", "c"] });
  const out = await calculate(scope, { m: mode("g"), f: first("g"), l: last("g") });
  assert.deepEqual([out.m[0], out.f[0], out.l[0]], ["b", "a", "c"]);
  scope.dispose();
});

// 12C A4: an empty group's first/last/mode is NaN, which has to become the missing code -1,
// not code 0 (the first category), when the result is cast back to category codes.
test("a categorical reduction with no values reads as missing, not as the first category", async () => {
  const scope = data({ sp: ["p", "q", null, null], g: ["a", "a", "b", "b"], x: [1, 2, 3, 4] });
  const out = await calculate(scope, { f: first("sp", { by: "g" }), l: last("sp", { by: "g" }), m: mode("sp", { by: "g" }) });
  assert.deepEqual(out.f, ["p", "p", null, null]);
  assert.deepEqual(out.l, ["q", "q", null, null]);
  assert.deepEqual(out.m, ["p", "p", null, null]);
  // A rank-0 mode of an empty scope (a Filter that keeps nothing) is missing too.
  const none = await runTransform("Filter", scope, { where: greater("x", 100) });
  assert.equal(none.length, 0);
  const empty = await runTransform("Calculate", none, { columns: { m: mode("sp"), f: first("sp") } });
  for (const name of ["m", "f"]) {
    const { evaluateExpression } = await import("../../src/lib/plot/utils/expressions.js");
    const evaluated = evaluateExpression(name === "m" ? mode("sp") : first("sp"), none, { broadcast: false });
    assert.deepEqual(Array.from(await evaluated.value.codes.ref.data()), [-1], name);
    evaluated.dispose();
    assert.equal(empty.get(name).codes.shape[0], 0, name);
  }
  empty.dispose(); none.dispose(); scope.dispose();
});

test("a reduction reports the columns it reads, including its grouping keys", () => {
  assert.deepEqual([...expressionFields(mean("x", { by: ["g", "h"] }))].sort(), ["g", "h", "x"]);
  assert.deepEqual([...expressionFields(greater(col("x"), mean(col("x"))))], ["x"]);
});

test("reduction constructors validate their options", () => {
  assert.throws(() => mean("x", "species"), /options must be an object/);
  assert.throws(() => mean("x", { by: 7 }), /column name/);
  // Every reduction but count needs its value up front (12C A6, as in Python).
  for (const reduce of [mean, sum, min, max, std, variance, median, mode, first, last])
    assert.throws(() => reduce(), /\(\) needs a column or expression to reduce, such as \w+\("x"\)\./);
  assert.throws(() => mean(undefined, { by: "g" }), /^Error: mean\(\) needs a column/);
  assert.equal(count().args[0], null);
  // 14: quantile (TODO 137.3).
  assert.equal(Object.keys(REDUCTIONS).length, 14);
});

test("Filter takes a per-row expression and rejects a single value", async () => {
  const scope = data({ x: [1, 2, 2, NaN, 5], g: ["a", "a", "b", "b", "b"] });
  const above = await runTransform("Filter", scope, { where: greater("x", mean("x")) });
  assert.deepEqual(Array.from(await above.get("x").ref.data()), [5]);
  above.dispose();
  const grouped = await runTransform("Filter", scope, { where: greater("x", mean("x", { by: "g" })) });
  assert.deepEqual(Array.from(await grouped.get("x").ref.data()), [2, 5]);
  grouped.dispose();
  await assert.rejects(() => runTransform("Filter", scope, { where: mean("x") }), /one value per row/);
  scope.dispose();
});

// Expression-valued transform parameters (Stage 12B): a bin count or a bandwidth derived
// from the data itself, resolved to a number before the transform runs.
test("transform parameters resolve expressions against the input scope", async () => {
  const { resolveTransformParameters, expressionParams } = await import("../../src/lib/plot/utils/transforms.js");
  const scope = data({ x: [1, 2, 3, 4, 9, 16, 25, 36, 49] });
  const resolved = await resolveTransformParameters("Bin", { x: "x", bins: count("x") }, scope);
  assert.equal(resolved.bins, 9);
  // A count is an integer parameter, so single-precision arithmetic is rounded to one.
  const rounded = await resolveTransformParameters("Bin", { bins: power(count("x"), 0.5) }, scope);
  assert.equal(rounded.bins, 3);
  const perAxis = await resolveTransformParameters("Bin", { bins: { x: max("x"), y: 4 } }, scope);
  assert.deepEqual(perAxis.bins, { x: 49, y: 4 });
  // Untouched when nothing is an expression, and unknown kinds pass through.
  const plain = { bins: 12 };
  assert.equal(await resolveTransformParameters("Bin", plain, scope), plain);
  assert.equal(await resolveTransformParameters("Sort", plain, scope), plain);
  const density = await resolveTransformParameters("Density", { bandwidth: count("x") }, scope);
  assert.equal(density.bandwidth, 9, "Density's union schema resolves its expression branch");
  assert.equal(expressionParams("Bin").bins, "integer");
  scope.dispose();
});

test("a reduction channel compiles no new kernel when the values change but the row count does not (13.8 N4)", async () => {
  const { evaluateExpression } = await import("../../src/lib/plot/utils/expressions.js");
  const { Module, compile } = WebAssembly;
  const scope = data({ y: [1, 2, 3, 4] });
  const run = async () => {
    const result = evaluateExpression(subtract("y", mean("y")), scope);
    try { return Array.from(await result.value.ref.data()); } finally { result.dispose(); }
  };
  assert.deepEqual(await run(), [-1.5, -0.5, 0.5, 1.5]);
  let compiled = 0;
  WebAssembly.Module = new Proxy(Module, { construct(target, args) { compiled++; return new target(...args); } });
  WebAssembly.compile = (...args) => { compiled++; return compile(...args); };
  const values = [];
  try {
    for (const y of [[1, 1, 1, 5], [3, 0, 0, 1], [-2, 2, -2, 6]]) { scope.update({ y }); values.push(await run()); }
  } finally { WebAssembly.Module = Module; WebAssembly.compile = compile; }
  assert.deepEqual(values, [[-1, -1, -1, 3], [2, -1, -1, 0], [-3, 1, -3, 5]]);
  assert.equal(compiled, 0);
  scope.dispose();
});

test("a per-row or nonfinite transform parameter is an error that names the property", async () => {
  const { resolveTransformParameters } = await import("../../src/lib/plot/utils/transforms.js");
  const scope = data({ x: [1, 2, 3] });
  await assert.rejects(() => resolveTransformParameters("Bin", { bins: col("x") }, scope),
    /Bin\.bins must be a single value/);
  await assert.rejects(() => resolveTransformParameters("Density", { bandwidth: divide(mean("x"), 0) }, scope),
    /Density\.bandwidth evaluated to/);
  scope.dispose();
});

test("named bin rules match numpy's counts", async () => {
  const { readFileSync } = await import("node:fs");
  const values = JSON.parse(readFileSync(new URL("./fixtures-normal400.json", import.meta.url), "utf8"));
  const scope = data({ x: values });
  // numpy.histogram_bin_edges on the same 400 standard normal values.
  for (const [rule, expected] of [["auto", 17], ["sturges", 10], ["fd", 17], ["scott", 13]]) {
    const view = await runTransform("Bin", scope, { x: "x", bins: rule });
    assert.equal(view.length, expected, rule);
    view.dispose();
  }
  await assert.rejects(() => runTransform("Bin", scope, { x: "x", bins: "silverman" }), /Unknown bin rule/);
  scope.dispose();
  // numpy 2.5 on degenerate data (12C A7): a zero IQR gives "fd" one bin and "auto" the relaxed
  // FD width (half the square-root rule); a constant column is one bin under every rule.
  const spike = data({ x: [...Array(10).fill(1), 5, 9] });
  for (const [rule, expected] of [["auto", 7], ["sturges", 5], ["fd", 1], ["scott", 3]]) {
    const view = await runTransform("Bin", spike, { x: "x", bins: rule });
    assert.equal(view.length, expected, `zero IQR, ${rule}`);
    view.dispose();
  }
  spike.dispose();
  const constant = data({ x: Array(8).fill(3) });
  for (const rule of ["auto", "sturges", "fd", "scott"]) {
    const view = await runTransform("Bin", constant, { x: "x", bins: rule });
    assert.equal(view.length, 1, `constant, ${rule}`);
    view.dispose();
  }
  constant.dispose();
});

// The two languages have to offer the same reductions; Python adds var for numpy's spelling.
test("the JavaScript and Python reduction lists agree", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../python/hmplot/expressions.py", import.meta.url), "utf8");
  const python = source.match(/_REDUCTIONS = "(.*?)"\.split\(\)/)[1].split(" ");
  // Python defines quantile on its own (it takes p).
  assert.deepEqual([...python, "quantile"].sort(), [...Object.keys(REDUCTIONS), "var"].sort().filter((name) => name !== "variance"));
  const stub = readFileSync(new URL("../../python/hmplot/expressions.pyi", import.meta.url), "utf8");
  for (const name of python) assert.ok(stub.includes(`def ${name}(value:`), name);
  const registry = JSON.parse(readFileSync(new URL("../../python/hmplot/registry.json", import.meta.url), "utf8"));
  const { allExpressionParams } = await import("../../src/lib/plot/utils/transforms.js");
  assert.deepEqual(registry.expressionParams,
    Object.fromEntries(Object.entries(allExpressionParams()).map(([kind, props]) => [kind, Object.keys(props).sort()])));
  // Every data-derived parameter is typed with its full union in Python, never Any (12C B3).
  const signatures = JSON.parse(readFileSync(new URL("../../python/hmplot/signatures.json", import.meta.url), "utf8"));
  const snake = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  for (const [kind, props] of Object.entries({ ...registry.expressionParams, Histogram: ["bins"] }))
    for (const prop of props) {
      const annotation = signatures[kind][snake(prop)];
      assert.ok(annotation.includes("Expression") && !annotation.includes("Any"), `${kind}.${prop}: ${annotation}`);
    }
  const rules = 'TypingLiteral["auto", "sturges", "fd", "scott"]';
  // Arrays and tuples are Sequence (TODO 40.2): a list is invariant, so list[float] refused [64, 64].
  assert.equal(signatures.Histogram.bins, `float | ${rules} | Sequence[float] | Expression`);
  // Bin's edges may be dates (TODO 53.2).
  const edges = "Sequence[float] | Sequence[datetime.date]";
  assert.equal(signatures.Bin.bins, `float | ${rules} | ${edges} | Expression | dict[str, float | ${rules} | ${edges} | Expression]`);
  assert.equal(signatures.Density.bandwidth, 'float | TypingLiteral["auto"] | Sequence[float] | Expression');
});

test("a host number on the left of a binary operation broadcasts like one on the right", async () => {
  const { multiply, subtract, col, evaluateExpression } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = data({ x: [1, 2, 3] });
  const left = evaluateExpression(multiply(2, col("x")), scope), right = evaluateExpression(subtract(10, "x"), scope);
  assert.deepEqual(Array.from(await left.value.ref.data()), [2, 4, 6]);
  assert.deepEqual(Array.from(await right.value.ref.data()), [9, 8, 7]);
  left.dispose(); right.dispose(); scope.dispose();
});

// 12C B1: an @time channel is re-evaluated every frame, but its reductions depend on the data
// only; with a per-data-revision cache each reduction runs once across the frames.
test("a reduction inside an @time expression is computed once per cache, not per frame", async () => {
  const { evaluateExpression, releaseReductionCache, add, multiply, col, mean, std } =
    await import("../../src/lib/plot/utils/expressions.js");
  class CountingCache extends Map {
    sets = 0;
    set(key, value) { this.sets++; return super.set(key, value); }
  }
  const scope = data({ x: [1, 2, 3, 6], g: ["a", "a", "b", "b"] });
  const cache = new CountingCache();
  const channel = add(mean("x"), multiply(view.time, std("x", { by: "g" })));
  const read = async (evaluated) => Array.from(await (evaluated.value.codes ?? evaluated.value).ref.data());
  for (let frame = 0; frame < 60; frame++) {
    const evaluated = evaluateExpression(channel, scope, { time: frame * 16, reductionCache: cache });
    if (frame === 0 || frame === 59) {
      // mean 3; std by group: a -> 0.5, b -> 1.5.
      const t = frame * 16;
      assert.deepEqual(await read(evaluated), [3 + 0.5 * t, 3 + 0.5 * t, 3 + 1.5 * t, 3 + 1.5 * t]);
    }
    evaluated.dispose();
  }
  // Two reductions, each stored once.
  assert.equal(cache.sets, 2);
  assert.equal(cache.size, 2);
  // A reduction that reads @time (or any @ column) changes between frames: never cached.
  const timed = new CountingCache();
  for (const time of [0, 10]) {
    const evaluated = evaluateExpression(mean(add("x", view.time)), scope, { time, reductionCache: timed, broadcast: false });
    assert.deepEqual(await read(evaluated), [3 + time]);
    evaluated.dispose();
  }
  assert.equal(timed.sets, 0);
  // Releasing frees the cached arrays; a released cache is not filled again.
  const [cached] = [...cache.values()];
  releaseReductionCache(cache);
  assert.equal(cache.size, 0);
  assert.throws(() => cached.value.ref, /disposed|reference|freed/i);
  const after = evaluateExpression(channel, scope, { time: 0, reductionCache: cache });
  assert.deepEqual(await read(after), [3, 3, 3, 3]);
  after.dispose();
  assert.equal(cache.sets, 2);
  scope.dispose();
});

// 12C C1: every reduction, whole-table and by group, against numpy on 10,000 rows with ~5%
// missing (fixtures-reductions10k.py rebuilds the same rows from a Park-Miller sequence).
function oracleRows(fixture) {
  let state = fixture.seed;
  const uniform = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const x = [], k = [], g = [];
  for (let i = 0; i < fixture.rows; i++) {
    const value = Math.fround((uniform() + uniform() + uniform() - 1.5) * 4);
    const missing = uniform() < 0.05;
    x.push(missing ? NaN : value);
    k.push(missing ? NaN : Math.floor(value));
    g.push(fixture.groups[Math.floor(uniform() * 4)]);
  }
  return { x, k, g };
}
test("every reduction matches numpy on 10,000 rows with missing values, whole and by group", async () => {
  const { readFileSync } = await import("node:fs");
  const fixture = JSON.parse(readFileSync(new URL("./fixtures-reductions10k.json", import.meta.url), "utf8"));
  const rows = oracleRows(fixture);
  assert.deepEqual(rows.x.slice(0, 5).map((v) => (Number.isNaN(v) ? null : v)), fixture.firstValues);
  const scope = data(rows);
  const ops = { mean, sum, count, min, max, std, variance, median, mode, first, last };
  const columns = {};
  for (const [name, reduce] of Object.entries(ops)) {
    const column = name === "mode" ? "k" : "x";
    columns[name] = reduce(column);
    columns[`${name}_by`] = reduce(column, { by: "g" });
  }
  const out = await calculate(scope, columns);
  // Single-precision GPU arithmetic over 10k rows: sums carry a little more error.
  const close = (actual, expected, label) => {
    const tolerance = (label.startsWith("sum") ? 2e-4 : 2e-5) * Math.max(1, Math.abs(expected));
    assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs numpy ${expected}`);
  };
  for (const name of Object.keys(ops)) {
    close(out[name][0], fixture.all[name], name);
    fixture.groups.forEach((group) => {
      const row = rows.g.indexOf(group);
      close(out[`${name}_by`][row], fixture.by[group][name], `${name} by ${group}`);
    });
    // Every row of a group holds that group's value.
    const last = rows.g.lastIndexOf("c");
    assert.equal(out[`${name}_by`][last], out[`${name}_by`][rows.g.indexOf("c")], `${name} broadcast`);
  }
  scope.dispose();
});

test("nested reductions: deviations from the mean average 0 and standard scores have std 1", async () => {
  const { readFileSync } = await import("node:fs");
  const fixture = JSON.parse(readFileSync(new URL("./fixtures-reductions10k.json", import.meta.url), "utf8"));
  const scope = data(oracleRows(fixture));
  const deviation = subtract("x", mean("x"));
  const out = await calculate(scope, {
    centred: mean(deviation),
    unit: std(divide(deviation, std("x"))),
    centredBy: mean(subtract("x", mean("x", { by: "g" })), { by: "g" }),
    unitBy: std(divide(subtract("x", mean("x", { by: "g" })), std("x", { by: "g" })), { by: "g" }),
  });
  assert.ok(Math.abs(out.centred[0]) < 1e-5, `mean of deviations ${out.centred[0]}`);
  assert.ok(Math.abs(out.unit[0] - 1) < 1e-5, `std of standard scores ${out.unit[0]}`);
  for (const value of new Set(out.centredBy)) assert.ok(Math.abs(value) < 1e-5, `grouped mean ${value}`);
  for (const value of new Set(out.unitBy)) assert.ok(Math.abs(value - 1) < 1e-5, `grouped std ${value}`);
  scope.dispose();
});

test("a reduction counts as one operation toward the expression size limit", async () => {
  const { evaluateExpression, add } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = data({ x: Array.from({ length: 2000 }, (_, i) => i) });
  // A balanced tree of adds (the nesting limit is 64) over one shared mean("x") and literals:
  // the reduction and its column are 2 nodes however many rows they cover.
  const tree = (adds) => {
    let level = [mean("x"), ...Array(adds).fill(1)];
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? add(level[i], level[i + 1]) : level[i]);
      level = next;
    }
    return level[0];
  };
  const fits = evaluateExpression(tree(254), scope, { broadcast: false }); // 254 adds + mean + x = 256
  assert.deepEqual(Array.from(await fits.value.ref.data()), [999.5 + 254]);
  fits.dispose();
  assert.throws(() => evaluateExpression(tree(255), scope), { code: "limit.expressionOperations" });
  scope.dispose();
});

// 12C C2: the JavaScript side of the Python protocol. These descriptors are what
// hm.Calculate(m=hm.mean("x", by="species"), ...) puts in a scene snapshot (checked in
// python/tests/test_core.py); decoded by SceneResources they evaluate like the JS calls.
test("reductions decoded from a Python scene snapshot evaluate per group", async () => {
  const { SceneResources } = await import("../../src/lib/scene/resources.js");
  const { isExpression } = await import("../../src/lib/plot/utils/expressions.js");
  const by = { $expression_options: { by: "species" } };
  const snapshot = {
    m: { $expression: { op: "mean", args: ["x", by] } },
    z: { $expression: { op: "divide", args: [
      { $expression: { op: "subtract", args: [{ $expression: { op: "column", args: ["x"] } }, { $expression: { op: "mean", args: ["x", by] } }] } },
      { $expression: { op: "std", args: ["x", by] } }] } },
    n: { $expression: { op: "count", args: [null] } },
    v: { $expression: { op: "variance", args: ["x"] } },
    first: { $expression: { op: "lookup", args: ["x", 0, { $expression_options: { fill: null } }] } },
  };
  const resources = new SceneResources();
  const columns = resources.resolve(snapshot, () => { throw Error("no references here"); });
  for (const value of Object.values(columns)) assert.ok(isExpression(value));
  assert.deepEqual(columns.m.args[1], Object.freeze({ __expressionLiteral: true, by: "species" }));
  const scope = data({ x: [1, 2, 3, 6], species: ["a", "a", "b", "b"] });
  const out = await calculate(scope, columns);
  assert.deepEqual(out.m, [1.5, 1.5, 4.5, 4.5]);
  assert.deepEqual(out.z.map((v) => round(v, 5)), [-1, 1, -1, 1]);
  assert.deepEqual(out.n, [4, 4, 4, 4]);
  assert.deepEqual(out.v.map((v) => round(v, 5)), Array(4).fill(3.5));
  assert.deepEqual(out.first, [1, 1, 1, 1]);
  scope.dispose();
});


// Compiled mark targets consume immutable current columns; layout/tween state stays upstream.
const numericValues = value => {
  const out = value.ref.dataSync();
  assert.ok(ArrayBuffer.isView(out));
  assert.equal(out.length, value.shape.reduce((count, n) => count * n, 1));
  return Array.from(out);
};
const numericScope = (columns, valid) => ({
  length: Object.values(columns)[0].shape[0], physical: Boolean(valid), valid,
  has: name => Object.hasOwn(columns, name), get: name => columns[name],
  metadata: name => ({ type: columns[name]?.dtype === "bool" ? "boolean" : "numeric" }),
});
const compareNumeric = (owner, root, scope, options = {}) => {
  const expected = numeric.evaluateExpression(root, scope, options), actual = owner.evaluate(root, scope, options);
  try {
    assert.deepEqual(numericValues(actual.value), numericValues(expected.value));
    assert.equal(actual.value.dtype, expected.value.dtype);
    assert.deepEqual(actual.value.shape, expected.value.shape);
    assert.deepEqual(actual.metadata, expected.metadata);
    assert.equal(actual.cardinality, expected.cardinality);
    assert.equal(actual.representation, expected.representation);
    assert.deepEqual([...actual.dependencies.fields], [...expected.dependencies.fields]);
    assert.equal(actual.dependencies.membership, expected.dependencies.membership);
  } finally { actual.dispose(); expected.dispose(); }
};

test("numerical mark targets preserve masked reductions and current selection metadata", () => {
  const columns = { x: np.array([2, 4, 9, 16], { dtype: np.float32 }),
    "@selected": np.array([0, 1, 0, 0], { dtype: np.bool }) }, valid = np.array([1, 1, 1, 0], { dtype: np.int32 });
  const scope = numericScope(columns, valid), owner = createExpressionEvaluator();
  const root = numeric.where(numeric.greater(numeric.sum(numeric.view.selected), 0),
    numeric.subtract(numeric.col.x, numeric.min(numeric.where(numeric.view.selected, numeric.col.x, 100))),
    numeric.divide(numeric.col.x, numeric.mean(numeric.col.x)));
  try {
    compareNumeric(owner, root, scope);
    const old = columns["@selected"]; columns["@selected"] = np.zeros([4], { dtype: np.bool }); old.dispose();
    compareNumeric(owner, root, scope);
    compareNumeric(owner, numeric.mean(numeric.col.x), scope, { broadcast: false });
    for (const rows of [0, 4]) {
      const emptyColumns = { x: np.zeros([rows], { dtype: np.float32 }),
        "@selected": np.zeros([rows], { dtype: np.bool }) };
      const emptyValid = np.zeros([rows], { dtype: np.int32 });
      const emptyScope = numericScope(emptyColumns, emptyValid);
      try {
        for (const reduce of [numeric.sum, numeric.mean, numeric.min, numeric.max, numeric.count])
          compareNumeric(owner, reduce(numeric.col.x), emptyScope, { broadcast: false });
        compareNumeric(owner, numeric.where(numeric.view.selected, numeric.col.x, 0), emptyScope);
      } finally { Object.values(emptyColumns).forEach(array => array.dispose()); emptyValid.dispose(); }
    }
    assert.equal(owner.stats.fallback, 0);
    assert.ok(owner.stats.compiled > 0);
  } finally { owner.dispose(); Object.values(columns).forEach(array => array.dispose()); valid.dispose(); }
});

test("numerical scalar slots preserve changing unary, boolean and exact integer operands", () => {
  const columns = { x: np.array([3, 5, 7], { dtype: np.float32 }),
    id: np.array([16777217, 16777218, 2147483646], { dtype: np.int32 }) };
  const scope = numericScope(columns), owner = createExpressionEvaluator();
  try {
    for (const number of [4, 9]) {
      compareNumeric(owner, numeric.add(numeric.col.x, numeric.negative(number)), scope);
      compareNumeric(owner, numeric.add(numeric.col.x, numeric.sqrt(number)), scope);
      compareNumeric(owner, numeric.clip(number, numeric.col.x, numeric.add(numeric.col.x, 2)), scope);
      compareNumeric(owner, numeric.coalesce(number, numeric.col.x), scope);
    }
    for (const condition of [true, false]) compareNumeric(owner, numeric.where(condition, numeric.col.x, 0), scope);
    for (const number of [0, -0, NaN]) compareNumeric(owner, numeric.divide(numeric.col.x, number), scope);
    const result = owner.evaluate(numeric.greater(numeric.col.id, 16777217), scope);
    assert.deepEqual(numericValues(result.value), [0, 1, 1]); result.dispose();
    compareNumeric(owner, numeric.where(numeric.greater(numeric.col.id, 16777217), numeric.col.id, 0), scope);
  } finally { owner.dispose(); Object.values(columns).forEach(array => array.dispose()); }
});

test("numerical plans preserve mutable literals and escaped source names during dtype retracing", () => {
  const columns = { "$price": np.array([13, 14, 15], { dtype: np.float32 }),
    ":x": np.array([1, 2, 3], { dtype: np.float32 }) }, scope = numericScope(columns);
  const owner = createExpressionEvaluator(), threshold = literal(13.5), root = numeric.greater(numeric.col("$price"), threshold);
  try {
    compareNumeric(owner, root, scope);
    threshold.value = 13.75;
    const old = columns["$price"]; columns["$price"] = np.array([13, 14, 15], { dtype: np.int32 }); old.dispose();
    compareNumeric(owner, root, scope);
    compareNumeric(owner, numeric.add(numeric.col(":x"), 3), scope);
    assert.equal(owner.stats.fallback, 0);
    assert.ok(Object.values(columns).every(array => array.refCount === 1));
  } finally { owner.dispose(); Object.values(columns).forEach(array => array.dispose()); }
});

test("numerical plan eviction preserves unread outputs and releases alias and virtual references", () => {
  const columns = { x: np.array([2, 4, 8], { dtype: np.float32 }),
    "@selected": np.array([1, 0, 0], { dtype: np.bool }) }, scope = numericScope(columns);
  const owner = createExpressionEvaluator(), root = numeric.add(numeric.col.x, numeric.add(numeric.mean(numeric.col.x), 13.5));
  const held = owner.evaluate(root, scope); // Leave it lazy while its program is evicted.
  try {
    compareNumeric(owner, numeric.add(numeric.col.x, numeric.col.x), scope);
    const aliasScope = { ...scope, has: name => name === "alias" || scope.has(name),
      get: name => name === "alias" ? columns.x : scope.get(name),
      metadata: name => scope.metadata(name === "alias" ? "x" : name) };
    compareNumeric(owner, numeric.add(numeric.col.x, numeric.col.alias), aliasScope);
    compareNumeric(owner, numeric.where(numeric.view.selected, numeric.col.x, 0), scope);
    for (let revision = 0; revision < 70; revision++) {
      const output = owner.evaluate(root, { ...scope, metadata: name => ({ ...scope.metadata(name), revision }) }); output.dispose();
    }
    assert.equal(owner.size, 64); owner.dispose(); assert.equal(owner.size, 0);
    const expected = numeric.evaluateExpression(root, scope);
    assert.deepEqual(numericValues(held.value), numericValues(expected.value)); expected.dispose();
  } finally { held.dispose(); owner.dispose(); Object.values(columns).forEach(array => { assert.equal(array.refCount, 1); array.dispose(); }); }
});

test("unsupported mark expressions fall back and an admitted trace failure is not retried", () => {
  const columns = { x: np.array([1, 2, 3], { dtype: np.float32 }) }, scope = numericScope(columns), owner = createExpressionEvaluator();
  try {
    const wrappedExpression = numeric.add(numeric.col.x, literal(numeric.col.x));
    assert.throws(() => numeric.evaluateExpression(wrappedExpression, scope));
    assert.throws(() => owner.evaluate(wrappedExpression, scope));
    const invalid = numeric.add(numeric.col.x);
    for (let attempt = 0; attempt < 2; attempt++) assert.throws(() => owner.evaluate(invalid, scope), /undefined|value|metadata|operand/i);
    assert.equal(owner.stats.traceFailures, 1);
    assert.equal(owner.size, 0);
    compareNumeric(owner, numeric.sqrt(4), scope); // Constant-only roots use the ordinary evaluator.
    const beforeHost = owner.stats.fallback;
    for (const values of [[true, true, true], ["yes", "yes", "yes"]]) {
      const hostScope = { ...scope, get: () => values, metadata: () => ({ type: "boolean" }) };
      const output = owner.evaluate(numeric.mean(numeric.col.x), hostScope, { broadcast: false });
      try { assert.deepEqual(numericValues(output.value), [0]); } finally { output.dispose(); }
      compareNumeric(owner, numeric.mean(numeric.col.x), hostScope, { broadcast: false });
    }
    assert.equal(owner.stats.fallback, beforeHost);
    const sourceMetadata = { ...scope, metadata: () => undefined };
    compareNumeric(owner, numeric.col.x, sourceMetadata);
    const unspecified = owner.evaluate(numeric.col.x, sourceMetadata);
    assert.equal(unspecified.metadata, undefined); unspecified.dispose();
    columns.x.metadata = { type: "numeric", label: "Source metadata" };
    compareNumeric(owner, numeric.col.x, sourceMetadata);
    columns.x.metadata = { type: "datetime", origin: 0, unit: "ms" };
    const beforeDate = owner.stats.fallback;
    compareNumeric(owner, numeric.add(numeric.col.x, 2), sourceMetadata);
    assert.equal(owner.stats.fallback, beforeDate); // Datetime arithmetic now uses the shared compiler.
    delete columns.x.metadata;
    const unusualMetadata = { type: "numeric", domain: [NaN, 3] };
    const unusualScope = { ...scope, metadata: () => unusualMetadata };
    const beforeUnusual = owner.stats.lookups;
    compareNumeric(owner, numeric.col.x, unusualScope);
    const unusual = owner.evaluate(numeric.col.x, unusualScope);
    assert.equal(unusual.metadata, unusualMetadata);
    assert.ok(Number.isNaN(unusual.metadata.domain[0])); unusual.dispose();
    assert.equal(owner.stats.lookups, beforeUnusual + 2); // Bare column reads preserve source identity and metadata.
    const vector = np.array([[1, 2], [3, 4], [5, 6]], { dtype: np.float32 });
    const vectorScope = { ...scope, get: () => vector };
    compareNumeric(owner, numeric.add(numeric.col.x, 2), vectorScope);
    assert.equal(vector.refCount, 1); vector.dispose();
    assert.throws(() => owner.evaluate(numeric.col("missing"), scope), /missing/);
    assert.equal(columns.x.refCount, 1);
  } finally { owner.dispose(); columns.x.dispose(); }
});

test("descriptive column metadata shares programs and reaches results; semantic metadata retraces", () => {
  const columns = { t: np.array([0, 1000, 2000], { dtype: np.float32 }) }, owner = createExpressionEvaluator();
  try {
    for (const [label, origin] of [["Start", 0], ["End", 0], ["End", 5000]]) {
      const scope = { ...numericScope(columns), metadata: () => ({ type: "datetime", origin, unit: "ms", name: "t", label }) };
      compareNumeric(owner, numeric.add(numeric.col.t, 500), scope);
      compareNumeric(owner, numeric.first(numeric.col.t), scope, { broadcast: false });
    }
    assert.deepEqual([owner.stats.traces, owner.stats.hits, owner.stats.fallback], [4, 2, 0]);
  } finally { owner.dispose(); columns.t.dispose(); }
});


test("predicate reductions intersect visible rows, preserve logical booleans and discover dependencies", async () => {
  const scope = data({ x: [1, 0, NaN, 4, 5], g: ["a", "a", "b", "b", "c"],
    truth: { codes: new Int32Array([0, 1, -1, 1, 0]), categories: [true, false] } });
  const owner = createExpressionEvaluator();
  try {
    const expressions = { rows: numeric.count(undefined, { where: numeric.greater("x", 2) }),
      total: numeric.sum("x", { where: numeric.greater("x", 2), by: "g" }),
      any: numeric.any("truth"), all: numeric.all("truth", { where: false }),
      excluded: numeric.first("x", { where: numeric.greater("x", 9) }) };
    for (const expression of Object.values(expressions)) compareNumeric(owner, expression, scope);
    const out = await calculate(scope, expressions);
    assert.deepEqual(out.rows, [2, 2, 2, 2, 2]);
    assert.deepEqual(out.total, [0, 0, 4, 4, 5]);
    assert.deepEqual(out.any.map(Boolean), Array(5).fill(true));
    assert.deepEqual(out.all.map(Boolean), Array(5).fill(true));
    assert.ok(out.excluded.every(Number.isNaN));
    assert.deepEqual([...numeric.expressionFields(expressions.total)].sort(), ["g", "x"]);
    assert.throws(() => owner.evaluate(numeric.any("g"), scope), /compare|comparison/);
    const filtered = await runTransform("Filter", scope, { where: numeric.less("x", 4) });
    try { assert.deepEqual((await calculate(filtered, { total: numeric.sum("x", { where: true }) })).total, [1, 1]); }
    finally { filtered.dispose(); }
  } finally { owner.dispose(); scope.dispose(); }
});

test("ordered column expressions retain stable source-row alignment through groups, ties and masks", async () => {
  const scope = data({ x: [10, 2, NaN, 1, 3, 50], date: [3, 2, 2, 1, 2, 0], g: ["a", "b", "a", "a", "b", "a"], keep: [1, 1, 1, 1, 1, 0] });
  const filtered = await runTransform("Filter", scope, { where: numeric.greater("keep", 0) });
  const owner = createExpressionEvaluator(), options = { by: "g", orderBy: "date" };
  try {
    const expressions = { running: numeric.cumsum("x", options), previous: numeric.lag("x", options),
      next: numeric.lead("x", options), rolling: numeric.window("x", { ...options, size: 2, reduce: "sum" }),
      earliest: numeric.first("x", options), reverse: numeric.cumsum("x", { ...options, order: "desc" }) };
    for (const expression of Object.values(expressions)) compareNumeric(owner, expression, filtered.padded());
    const out = await calculate(filtered, expressions);
    assert.deepEqual(out.running, [11, 2, 1, 1, 5]);
    assert.deepEqual(out.previous, [NaN, NaN, 1, NaN, 2]);
    assert.deepEqual(out.next, [NaN, 3, 10, NaN, NaN]);
    assert.deepEqual(out.rolling, [10, 2, 1, 1, 5]);
    assert.deepEqual(out.earliest, [1, 2, 1, 1, 2]);
    assert.deepEqual(out.reverse, [10, 2, 10, 11, 5]);
    assert.deepEqual([...numeric.expressionFields(expressions.previous)].sort(), ["date", "g", "x"]);
    assert.throws(() => numeric.lag("x", { periods: -1 }), /lead/);
    assert.throws(() => numeric.sum("x", { orderBy: "date" }), /no option/);
    assert.throws(() => owner.evaluate(numeric.cumsum("x"), { ...filtered.padded(), grid: { size: 6 } }), /one-dimensional/);
  } finally { owner.dispose(); filtered.dispose(); scope.dispose(); }
});

test("neighbor gathers retain dictionaries, datetime origins and exact integer values", async () => {
  const scope = data({ integer: new Int32Array([16777217, 2147483646, -2147483648]),
    name: ["a", "b", "c"], date: column(new Float32Array([0, 1000, 2000]), { type: "datetime", origin: 1700000000000, unit: "ms", relative: true }) });
  const owner = createExpressionEvaluator();
  try {
    const out = await calculate(scope, { integer: numeric.lag("integer", { fill: 0 }), name: numeric.lead("name"), unchanged: numeric.lag("integer", { periods: 0 }) });
    assert.deepEqual(out.integer, [0, 16777217, 2147483646]);
    assert.deepEqual(out.name, ["b", "c", null]);
    assert.deepEqual(out.unchanged, [16777217, 2147483646, -2147483648]);
    compareNumeric(owner, numeric.lag("integer", { fill: 0 }), scope);
    assert.throws(() => owner.evaluate(numeric.lag("integer"), scope), /explicit int32 fill/);
    assert.throws(() => owner.evaluate(numeric.lead("name", { fill: "unknown" }), scope), /dictionary/);
    const date = owner.evaluate(numeric.lag("date", { fill: new Date(1700000000000) }), scope);
    try { assert.equal(date.metadata.type, "datetime"); assert.deepEqual(numericValues(date.value), [0, 0, 1000]); }
    finally { date.dispose(); }
  } finally { owner.dispose(); scope.dispose(); }
});

test("lookup reads a column at another visible row, keeping its type, and a fill past the rows", async () => {
  const scope = data({ parent: [-1, 0, 0, 1, 7], x: [10, 20, 30, 40, 50], name: ["a", "b", "c", "d", "e"],
    at: new Int32Array([4, 3, 2, 1, 0]), integer: new Int32Array([16777217, 2, 3, 4, 5]), keep: [1, 1, 0, 1, 1] });
  const filtered = await runTransform("Filter", scope, { where: numeric.greater("keep", 0) });
  const owner = createExpressionEvaluator();
  try {
    const out = await calculate(scope, { parent: numeric.lookup("x", "parent"), name: numeric.lookup("name", "parent"),
      first: numeric.lookup("x", 0), half: numeric.lookup("x", numeric.divide("parent", 2)),
      filled: numeric.lookup("x", "parent", { fill: 0 }), exact: numeric.lookup("integer", "at", { fill: 0 }) });
    assert.deepEqual(out.parent, [NaN, 10, 10, 20, NaN]);
    assert.deepEqual(out.name, [null, "a", "a", "b", null]);
    assert.deepEqual(out.first, [10, 10, 10, 10, 10]);
    assert.deepEqual(out.half, [NaN, 10, 10, NaN, NaN]);
    assert.deepEqual(out.filled, [0, 10, 10, 20, 0]);
    assert.deepEqual(out.exact, [5, 4, 3, 2, 16777217]);
    const truth = await runTransform("Calculate", scope, { columns: { t: numeric.lookup(numeric.greater("x", 15), "parent", { fill: true }),
      l: numeric.lag(numeric.greater("x", 15), { fill: false }) } });
    try {
      assert.equal(truth.get("t").dtype, "bool"); assert.equal(truth.get("l").dtype, "bool");
      assert.deepEqual(numericValues(truth.get("t")).map(Boolean), [true, false, false, true, true]);
      assert.deepEqual(numericValues(truth.get("l")).map(Boolean), [false, false, true, true, true]);
    } finally { truth.dispose(); }
    // Row numbers count the visible rows, in order: row 2 after the Filter is the fourth row.
    assert.deepEqual((await calculate(filtered, { parent: numeric.lookup("x", "parent"), third: numeric.lookup("x", 2) })),
      { parent: [NaN, 10, 20, NaN], third: [40, 40, 40, 40] });
    compareNumeric(owner, numeric.lookup("x", "parent"), filtered.padded());
    const evaluated = numeric.evaluateExpression(numeric.lookup("x", "parent"), scope);
    try { assert.equal(evaluated.dependencies.membership, true); } finally { evaluated.dispose(); }
    assert.deepEqual([...numeric.expressionFields(numeric.lookup("x", "parent"))].sort(), ["parent", "x"]);
    assert.throws(() => owner.evaluate(numeric.lookup("integer", "at"), scope), /explicit int32 fill/);
    assert.throws(() => owner.evaluate(numeric.lookup("x", "name"), scope), /row number/);
    assert.throws(() => numeric.lookup("x"), /lookup\("x", "parent"\)/);
    assert.throws(() => numeric.lookup("x", "parent", { by: "g" }), /no option by; use fill/);
    await assert.rejects(runTransform("Group", scope, { by: "name", columns: { p: numeric.first(numeric.lookup("x", "parent")) } }), /row operation/);
  } finally { owner.dispose(); filtered.dispose(); scope.dispose(); }
});

test("rows with a missing group key take no neighbor's category, integer or boolean value", async () => {
  const scope = data({ g: ["a", "b", "a", null, "b", "a", null, "b"], c: ["m", "n", "o", "p", "q", "r", "s", "t"],
    i: new Int32Array([1, 2, 3, 4, 5, 6, 7, 8]), truth: [true, false, true, true, false, true, true, false] });
  try {
    const out = await calculate(scope, { c: numeric.lag("c", { by: "g" }), i: numeric.lag("i", { by: "g", fill: 0 }),
      any: numeric.window("truth", { by: "g", size: 2, reduce: "any" }), all: numeric.window("truth", { by: "g", size: 2, reduce: "all" }) });
    assert.deepEqual(out.c, [null, null, "m", null, "n", "o", null, "q"]);
    assert.deepEqual(out.i, [0, 0, 1, 0, 2, 3, 0, 5]);
    assert.deepEqual([out.any[3], out.any[6], out.all[3], out.all[6]].map(Boolean), [false, false, true, true]);
    const view = await runTransform("Calculate", scope, { columns: { any: numeric.window("truth", { by: "g", size: 2, reduce: "any" }) } });
    try { assert.equal(view.get("any").dtype, "bool"); } finally { view.dispose(); }
  } finally { scope.dispose(); }
});

test("a literal compared with a gathered or reduced category keeps its own program", async () => {
  const scope = data({ flag: [false, true, false, false, true], t: [5, 4, 3, 2, 1] });
  try {
    const out = await calculate(scope, {
      previousTrue: numeric.equal(numeric.lag("flag"), true), previousFalse: numeric.equal(numeric.lag("flag"), false),
      firstTrue: numeric.equal(first("flag", { orderBy: "t" }), true), firstFalse: numeric.equal(first("flag", { orderBy: "t" }), false),
    });
    assert.deepEqual(out.previousTrue, [0, 0, 1, 0, 0]);
    assert.deepEqual(out.previousFalse, [0, 1, 0, 1, 1]);
    assert.deepEqual(out.firstTrue, [1, 1, 1, 1, 1]);
    assert.deepEqual(out.firstFalse, [0, 0, 0, 0, 0]);
  } finally { scope.dispose(); }
});

test("a host boolean or number compared with a category column matches its category, compiled or not", async () => {
  const scope = data({ flag: [true, false, true], level: { codes: new Int32Array([1, 0, -1]), categories: [10, 20] } });
  const owner = createExpressionEvaluator();
  try {
    for (const [expression, expected] of [[numeric.equal("flag", true), [1, 0, 1]], [numeric.equal("level", 20), [1, 0, 0]]]) {
      const eager = numeric.evaluateExpressionEager(expression, scope), compiled = owner.evaluate(expression, scope);
      try { assert.deepEqual(numericValues(eager.value), expected); assert.deepEqual(numericValues(compiled.value), expected); }
      finally { eager.dispose(); compiled.dispose(); }
    }
    assert.equal(owner.stats.fallback, 0);
  } finally { owner.dispose(); scope.dispose(); }
});

test("shared programs reuse numeric predicates, grouping, window sizes and time across publications", () => {
  const owner = createExpressionEvaluator(), arrays = { x: np.array([1, 2, 3, 4], { dtype: np.float32 }) }, scope = numericScope(arrays);
  try {
    for (const [threshold, size, time] of [[1, 2, 10], [2, 3, 20], [3, 4, 30]]) {
      const expression = numeric.add(numeric.window("x", { size, reduce: "sum" }), numeric.sum("x", { where: numeric.greater("x", threshold) }));
      compareNumeric(owner, expression, scope);
      compareNumeric(owner, numeric.add("x", numeric.sin(view.time)), scope, { time });
    }
    assert.equal(owner.stats.fallback, 0);
    assert.equal(owner.stats.traceFailures, 0);
    assert.ok(owner.stats.hits >= 4);
    assert.equal(owner.size, 2);
    for (const predicate of [false, true, false]) {
      const result = owner.evaluate(numeric.sum("x", {where: predicate}), scope, {broadcast: false});
      try { assert.deepEqual(numericValues(result.value), [predicate ? 10 : 0]); }
      finally { result.dispose(); }
    }
    assert.equal(owner.size, 3); // Boolean predicates are runtime values too.
  } finally { owner.dispose(); arrays.x.dispose(); }
});

test("ordered expressions handle empty tables, typed fills and oversized neighbors", async () => {
  const owner = createExpressionEvaluator();
  const empty = data({ x: column([], {type: "numeric"}) });
  const scope = data({ truth: {codes: new Int32Array([0, 1, -1]), categories: [true, false]},
    x: [1, 2, 3], g: ["a", "a", "b"] });
  try {
    for (const expression of [numeric.cumsum("x"), numeric.lag("x"), numeric.window("x", {reduce: "all"})]) {
      const result = owner.evaluate(expression, empty);
      try { assert.deepEqual(numericValues(result.value), []); }
      finally { result.dispose(); }
    }
    const out = await calculate(scope, {far: numeric.lead("x", {periods: 100}),
      identity: numeric.lag("x", {periods: 0}), truth: numeric.window("truth", {size: 2, reduce: "all"})});
    assert.ok(out.far.every(Number.isNaN)); assert.deepEqual(out.identity, [1, 2, 3]);
    assert.deepEqual(out.truth.map(Boolean), [true, false, false]);
    const grouped = await runTransform("Group", scope, {by: "g", columns: {any: numeric.any("truth"), all: numeric.all("truth")}});
    try {
      const any = numericValues(grouped.get("any")), all = numericValues(grouped.get("all"));
      assert.deepEqual(any.map(Boolean), [true, false]); assert.deepEqual(all.map(Boolean), [false, true]);
      assert.equal(grouped.metadata("any").type, "boolean"); assert.equal(grouped.metadata("all").type, "boolean");
    } finally { grouped.dispose(); }
  } finally { owner.dispose(); empty.dispose(); scope.dispose(); }
});

test("grouped any broadcasts selection and hover to entity peers without changing selection", async () => {
  const scope = data({ country: ["France", "Japan", "France", "Japan"], year: [2000, 2000, 2001, 2001] });
  const selected = numeric.any("@selected", { by: "country" });
  try {
    for (const [rows, expected] of [[[0], [true, false, true, false]], [[3], [false, true, false, true]], [[], [false, false, false, false]]]) {
      scope.identity.selection.replace(rows);
      const out = await calculate(scope, { peers: selected });
      assert.deepEqual(out.peers.map(Boolean), expected);
      const filtered = await runTransform("Filter", scope, { where: selected });
      try { assert.equal(filtered.length, expected.filter(Boolean).length); }
      finally { filtered.dispose(); }
    }
    scope.identity.hover.replace([2]);
    const out = await calculate(scope, { peers: numeric.any("@hovered", { by: "country" }), selected: "@selected" });
    assert.deepEqual(out.peers.map(Boolean), [true, false, true, false]);
    assert.deepEqual(out.selected.map(Boolean), [false, false, false, false]);
  } finally { scope.dispose(); }
});
