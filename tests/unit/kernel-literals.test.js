import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
// Stage 17.0b guard: data-dependent values must not compile new GPU programs.
//
// Upstream jax-js wrote a kernel's constants into its WGSL, so a value that follows the data (a
// Filter threshold, Bin edges, a brush category) compiled a new pipeline for every value the
// user reached. The bundled fork (@hmplot/jax, TODO Stage 23) reads nonzero constants from
// uniforms. Each test here runs the same code twice at the SAME length with DIFFERENT values and
// asserts that the second run compiles no program the first did not. The kernels are observed on
// the cpu backend and recorded as the WGSL WebGPU would compile for them (webgpuShaderSource,
// from the fork): equal sources share one pipeline. Routines are recorded by name and shapes.
// tests/unit/kernel-lengths.test.js does the same for new row counts.
//
// Run this first after a jax-js rebase (vendor/jax-js/PATCHES.md).
import test from "node:test";
import { createExpressionEvaluator } from "../../src/lib/plot/utils/expressionPlans.js";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { kernelsOf, assertReused } from "./compiled-programs.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform, bucketing } from "../../src/lib/plot/utils/transforms.js";
import { evaluateExpression, multiply, subtract, clip, where, greater, coalesce, is_in, mean, count, quantile } from "../../src/lib/plot/utils/expressions.js";
import { input, resolveInputs } from "../../src/lib/plot/utils/inputs.js";
import { brushColumn, nearbyConstraint, selectionMask } from "../../src/lib/plot/utils/interaction.js";
import { brushConstraint } from "../../src/lib/plot/utils/brushStrips.js";
import { axisWorldArray } from "../../src/lib/plot/utils/axes.js";
import { dodgeOffsets } from "../../src/lib/plot/utils/dodge.js";
import { transformArray } from "../../src/lib/plot/utils/data.js";

const read = async (value) => {
  const array = value?.codes ?? value;
  // `.ref` takes a reference: test for the method on the array itself.
  if (typeof array?.data === "function") await array.ref.data();
};
async function readView(view) {
  for (const key of view.keys()) if (!key.startsWith("@")) await read(view.get(key));
}
const scopeOf = (table) => { const scope = createDataScope(); scope.update(table); return scope; };
async function transform(kind, table, config) {
  const scope = scopeOf(table);
  const view = await runTransform(kind, scope, config);
  try { await readView(view); } finally { view.dispose(); scope.dispose(); }
}
async function expression(table, value) {
  const scope = scopeOf(table);
  const evaluated = evaluateExpression(value, scope);
  try { await read(evaluated.value); } finally { evaluated.dispose(); scope.dispose(); }
}

// An expression with its one input read replaced by `value` (utils/inputs.js).
const inputValue = (expression, value) =>
  resolveInputs({ expression }, { read: () => value }, "Test").expression;

// 240 rows; thresholds 0.4 and 0.6 keep the same rows, so only the literal differs between runs.
const LEVELS = [0.1, 0.2, 0.3, 0.7, 0.8, 0.9];
const rows = (n = 240) => ({
  x: Float32Array.from({ length: n }, (_, i) => LEVELS[i % 6]),
  y: Float32Array.from({ length: n }, (_, i) => ((i * 37) % 101) / 100),
  group: Array.from({ length: n }, (_, i) => `g${i % 6}`),
});

for (const [op, a, b] of [["gt", 0.4, 0.6], ["gte", 0.4, 0.6], ["lt", 0.4, 0.6], ["lte", 0.4, 0.6], ["eq", 0.3, 0.7], ["ne", 0.3, 0.7]])
  test(`Filter ${op}: a new value at the same count compiles nothing`, () =>
    assertReused(() => transform("Filter", rows(), { where: { field: "x", op, value: a } }),
      () => transform("Filter", rows(), { where: { field: "x", op, value: b } }), `Filter ${op}`));

test("Filter on a category: another category compiles nothing", () =>
  assertReused(() => transform("Filter", rows(), { where: { field: "group", op: "eq", value: "g1" } }),
    () => transform("Filter", rows(), { where: { field: "group", op: "eq", value: "g4" } }), "Filter eq category"));

test("Filter in with one value compiles nothing new for another value", async () => {
  await assertReused(() => transform("Filter", rows(), { where: { field: "x", op: "in", value: [0.3] } }),
    () => transform("Filter", rows(), { where: { field: "x", op: "in", value: [0.7] } }), "Filter in number");
  await assertReused(() => transform("Filter", rows(), { where: { field: "group", op: "in", value: ["g1"] } }),
    () => transform("Filter", rows(), { where: { field: "group", op: "in", value: ["g4"] } }), "Filter in category");
});

test("Bin with automatic edges: other data extents compile nothing", () => {
  const shifted = { ...rows(), x: rows().x.map((v) => v * 2 + 1) };
  return assertReused(() => transform("Bin", rows(), { x: "x", bins: 8 }), () => transform("Bin", shifted, { x: "x", bins: 8 }), "Bin auto");
});

test("Bin with explicit edges: other edges compile nothing", () =>
  assertReused(() => transform("Bin", rows(), { x: "x", bins: [0, 0.25, 0.5, 0.75, 1] }),
    () => transform("Bin", rows(), { x: "x", bins: [0.05, 0.3, 0.55, 0.8, 1.05] }), "Bin edges"));

// TODO 137.3: the Quantile transform became the quantile reducer.
test("quantile: another p compiles nothing", () =>
  assertReused(() => transform("Calculate", rows(), { columns: { q: quantile("y", 0.25), g: quantile("y", 0.75, { by: "group" }) } }),
    () => transform("Calculate", rows(), { columns: { q: quantile("y", 0.3), g: quantile("y", 0.8, { by: "group" }) } }), "quantile"));

test("BoxStats: other values (other fences) compile nothing", () => {
  const other = { ...rows(), y: rows().y.map((v, i) => v * 3 + (i % 5)) };
  return assertReused(() => transform("BoxStats", rows(), { by: "group", value: "y" }), () => transform("BoxStats", other, { by: "group", value: "y" }), "BoxStats");
});

test("Hexbin: other data extents (another radius) compile nothing", () => {
  // Both axes scaled alike: another radius, the same hexes (so the same output length).
  // Irregular values, so no point sits on a hex boundary where rounding could move it.
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const table = (scale) => ({ x: Float32Array.from({ length: 240 }, (_, i) => noise(i, 1) * scale), y: Float32Array.from({ length: 240 }, (_, i) => noise(i, 2) * scale) });
  return assertReused(() => transform("Hexbin", table(1), { x: "x", y: "y", bins: 4 }), () => transform("Hexbin", table(4), { x: "x", y: "y", bins: 4 }), "Hexbin");
});

test("Density: other data (bandwidth and bounds) compile nothing", () => {
  const wider = { ...rows(), x: rows().x.map((v, i) => v * 3 + (i % 7) / 10) };
  return assertReused(() => transform("Density", rows(), { x: "x", resolution: 16 }), () => transform("Density", wider, { x: "x", resolution: 16 }), "Density");
});

for (const [label, a, b] of [
  ["a host scalar on the right", multiply("x", 2), multiply("x", 3)],
  ["a host scalar on the left", subtract(1, "x"), subtract(2, "x")],
  ["clip bounds", clip("x", 0.2, 0.8), clip("x", 0.3, 0.7)],
  ["where branches and a comparison", where(greater("x", 0.5), 1, 0), where(greater("x", 0.6), 2, 0)],
  ["coalesce", coalesce("x", 0), coalesce("x", 1)],
  ["is_in on numbers", is_in("x", [0.3]), is_in("x", [0.7])],
  ["is_in on categories", is_in("group", ["g1"]), is_in("group", ["g4"])],
  // TODO 41: an input read is replaced by the input's value, which then compiles like a constant.
  ["an input's value", inputValue(greater("x", input("k")), 0.4), inputValue(greater("x", input("k")), 0.6)],
  ["a list input in is_in", inputValue(is_in("group", input("chosen")), ["g1"]), inputValue(is_in("group", input("chosen")), ["g4"])],
])
  test(`expression with ${label}: other values compile nothing`, () =>
    assertReused(() => expression(rows(), a), () => expression(rows(), b), label));

test("a broadcast literal Calculate column: another value compiles nothing", () =>
  assertReused(() => transform("Calculate", rows(), { columns: { c: 2 } }), () => transform("Calculate", rows(), { columns: { c: 5 } }), "literal broadcast"));

test("a numeric brush range: other bounds compile nothing (fixed before Stage 17)", () => {
  const scope = scopeOf(rows()), column = brushColumn(scope, "x", "x", "k");
  const evaluate = (bounds) => async () => { const mask = column.evaluateConstraint({ bounds }); await read(mask); mask.dispose(); };
  return assertReused(evaluate([0.2, 0.5]), evaluate([0.3, 0.75]), "numeric brush").finally(() => { column.release(); scope.dispose(); });
});

test("brush extent expression kernels are reused as bounds move", async () => {
  const scope = scopeOf(rows()), column = brushColumn(scope, "x", "x", "k");
  const evaluate = (bounds) => async () => {
    scope.identity.brush.setConstraints(scope.identity, [brushConstraint(column, { axis: "x" }, ...bounds)], { phase: "preview" });
    const result = evaluateExpression(subtract("@brush_max:x", "@brush_min:x"), scope);
    try { await read(result.value); } finally { result.dispose(); }
  };
  try { await assertReused(evaluate([0.2, 0.5]), evaluate([0.3, 0.75]), "brush extents"); }
  finally { column.release(); scope.dispose(); }
});

test("nearby in data units: another center compiles nothing (fixed before Stage 17)", () => {
  const scope = scopeOf(rows()), x = brushColumn(scope, "x", "x", "k");
  const evaluate = (center) => async () => {
    const mask = nearbyConstraint({ x, axis: "x", units: "data", center: { x: center }, radius: { x: 0.1 } }).evaluate();
    await read(mask); mask.dispose();
  };
  return assertReused(evaluate(0.3), evaluate(0.45), "nearby").finally(() => { x.release(); scope.dispose(); });
});

test("a categorical brush: other categories compile nothing", () => {
  const table = { ...rows(), group: { codes: Int32Array.from({ length: 240 }, (_, i) => i % 6), categories: ["g0", "g1", "g2", "g3", "g4", "g5"] } };
  const scope = scopeOf(table), column = brushColumn(scope, "group", "x", "k");
  const evaluate = (categories) => async () => { const mask = column.evaluateConstraint({ categories }); await read(mask); mask.dispose(); };
  return assertReused(evaluate(["g1"]), evaluate(["g2", "g4"]), "categorical brush").finally(() => { column.release(); scope.dispose(); });
});

// Aggregates map a row-level mask to their output rows. One kernel per output row (an index
// literal each) makes the first use of a G-row aggregate compile O(G) kernels; the count must
// not grow with G.
test("an aggregate's selection mask compiles as many kernels for 40 output rows as for 12", async () => {
  const measure = async (groups, n) => {
    const table = { x: Float32Array.from({ length: n }, (_, i) => i % groups), y: Float32Array.from({ length: n }, (_, i) => i) };
    const scope = scopeOf(table), view = await runTransform("Group", scope, { by: "x" });
    try {
      scope.identity.selection.replace(scope.identity, [1, 5, 40]);
      await read(view.provenance.codes); // the Group's own (lazy) group codes
      const mask = await kernelsOf(async () => { const value = selectionMask(view, scope.identity.selection); await read(value); value.dispose(); });
      const flags = await kernelsOf(async () => { await read(view.get("@selected")); });
      return { mask: mask.size, flags: flags.size };
    } finally { view.dispose(); scope.dispose(); }
  };
  const small = await measure(12, 257), large = await measure(40, 263);
  assert.deepEqual(large, small, `kernels for 12 output rows ${JSON.stringify(small)}, for 40 ${JSON.stringify(large)}`);
});

test("a pixel-unit world mapping: another axis domain compiles nothing", () => {
  const options = (bounds) => ({
    child: () => ({ get: () => undefined }),
    get: (key) => key === "xTransform" ? "linear" : key === "xbounds" ? bounds : key === "xrange" ? [-50, 50] : undefined,
  });
  const input = Float32Array.from({ length: 240 }, (_, i) => i / 10);
  const map = (bounds) => async () => { const world = axisWorldArray(options(bounds), "x", np.array(input)); await read(world); world.dispose(); };
  return assertReused(map([0, 24]), map([2, 30]), "axisWorldArray");
});

// Dodge compiled several kernels per glyph (an index, a chunk offset, a slice of the last chunk
// baked in); the kernels a second, larger layout adds must not grow with its glyph count.
test("Dodge compiles a fixed set of kernels, not several per glyph", async () => {
  const layout = (n) => async () => {
    const position = np.array(Float32Array.from({ length: n }, (_, i) => (i % 7) * 0.5)), radius = np.full([n], 1);
    const offsets = await dodgeOffsets(position, radius);
    await read(offsets); [offsets, position, radius].forEach((a) => a.dispose());
  };
  // What 20 glyphs add after 6 is the handful of length-dependent steps (the seeded order, the
  // final gather), not kernels per glyph.
  const small = await kernelsOf(layout(6)), large = await kernelsOf(layout(20));
  const added = [...large].filter((kernel) => !small.has(kernel));
  assert.ok(added.length <= 12, `${added.length} new kernels for 20 glyphs after 6 (of ${large.size})`);
});

// Per-group loops compared each row's group code with the group's index as a literal: one
// kernel per group on first use, and new ones whenever more groups appear.
test("Group compiles no kernel per group: 40 groups add only the output-length steps to 12", async () => {
  const run = (groups) => () => transform("Group", { x: Float32Array.from({ length: 241 }, (_, i) => i % groups), y: Float32Array.from({ length: 241 }, (_, i) => i) },
    { by: "x", columns: { m: mean("y") } });
  const small = await kernelsOf(run(12)), large = await kernelsOf(run(40));
  const added = [...large].filter((kernel) => !small.has(kernel));
  assert.ok(added.length <= 10, `${added.length} new kernels for 40 groups after 12 (of ${large.size})`);
});

test("a constant host column under 128 rows is not folded into the kernel", () => {
  const table = (value) => ({ x: Float32Array.from({ length: 60 }, (_, i) => i), y: new Float32Array(60).fill(value) });
  return assertReused(() => expression(table(0.5), multiply("x", "y")), () => expression(table(0.75), multiply("x", "y")), "constant column");
});

// 17.3a: a padded Filter compacts only when a consumer that has not opted in reads its rows.
test("a Filter runs no sort until a consumer reads its compacted rows", async () => {
  const scope = scopeOf(rows(241));
  let view;
  const made = await kernelsOf(async () => { view = await runTransform("Filter", scope, { where: { field: "x", op: "gt", value: 0.5 } }); await read(view.padded().valid); });
  assert.deepEqual([...made].filter((kernel) => kernel.startsWith("routine")), [], "the Filter sorted before any read");
  const readRows = await kernelsOf(async () => { await read(view.get("x")); });
  assert.ok([...readRows].some((kernel) => kernel.startsWith("routine Argsort")), "reading rows compacts");
  view.dispose(); scope.dispose();
});

// 17.3a: a new match count at the same capacity compiles nothing in the Filter itself.
test("a Filter compiles nothing for a new match count at the same capacity", () => {
  const filter = (value) => async () => {
    const scope = scopeOf(rows(239)), view = await runTransform("Filter", scope, { where: { field: "y", op: "gt", value } });
    await read(view.padded().valid); view.dispose(); scope.dispose();
  };
  return assertReused(filter(0.3), filter(0.7), "Filter counts");
});

// Found in 17.3b: marks map positions through their frame (line dash distances, links,
// connections, Dodge) with the axis domain, which follows the data.
test("mapping values through an axis domain: another domain compiles nothing", () => {
  const input = Float32Array.from({ length: 240 }, (_, i) => i / 10);
  const map = (kind, bounds) => async () => { const out = transformArray(np.array(input), kind, bounds, [-50, 50]); await read(out); out.dispose(); };
  return Promise.all(["linear", "log", "sqrt"].map((kind) => assertReused(map(kind, [1, 24]), map(kind, [2, 30]), `transformArray ${kind}`)));
});

// 17.3c: downstream of a padded Filter, a new mask at the same capacity compiles nothing.
for (const [kind, config] of [
  ["Group", { by: "group", columns: { m: mean("x") } }],
  ["Bin", { x: "x", bins: 6 }],
  ["Bin", { x: "x", bins: 6, empty: false }],
  ["Bin", { x: "x", bins: 5, mode: "assign" }],
  // 17.3d: reductions inside expressions are masked by the valid rows.
  ["Calculate", { columns: { dv: subtract("x", mean("x")), gm: mean("x", { by: "group" }), n: count(), c: 2 } }],
  // 17.3e: kept rows first (Sort, Window) or row-preserving (Normalize, Stack).
  ["Sort", { by: ["group", "y"] }],
  ["Window", { field: "x", size: 4, align: "center" }],
  ["Normalize", { field: "x", by: "group" }],
  ["Normalize", { field: "x", method: "extent" }],
  ["Stack", { x: "group", y: "x", series: "y" }],
  // 39.7: the (group, series) table and a sequence over the series (a numeric series, grouped).
  ["Stack", { x: "group", y: "y", series: "x", offset: "wiggle", order: "insideOut" }],
  // 17.3f: groups from every physical row, statistics from the shown ones.
  ["BoxStats", { by: "group", value: "y" }],
  ["BoxOutliers", { by: "group", value: "y" }],
  ["Calculate", { columns: { q: quantile("y", 0.9, { by: "group" }) } }],
  ["Summary", { field: "y", by: "group", interval: "normal" }],
  ["Summary", { field: "y", by: "group", estimate: "median" }],
  ["Pivot", { field: "group", value: mean("y") }],
  ["Hexbin", { x: "x", y: "y", radius: 0.2 }],
  // 17.14d: a fixed grid over an extent (the grouped path above has a length per selection).
  ["Hexbin", { x: "x", y: "y", bins: 6, bounds: { x: [0, 1], y: [0, 1] }, columns: { m: mean("x") } }],
  ["Density", { x: "y", by: "group", resolution: 16, violin: {} }],
  // 17.3g: random and reshaping transforms.
  ["Sample", { seed: 3, order: "random" }],
  ["Sample", { size: 50, seed: 3 }],
  ["Sample", { proportion: 0.3 }],
  ["Fold", { fields: ["x", "y"] }],
])
  test(`Filter > ${kind} ${JSON.stringify(config)}: a new mask compiles nothing`, () => {
    const chain = (value) => async () => {
      const table = { ...rows(233), y: Float32Array.from({ length: 233 }, (_, i) => ((i * 37) % 101) / 100) };
      const scope = scopeOf(table), filtered = await runTransform("Filter", scope, { where: { field: "y", op: "gt", value } });
      const view = await runTransform(kind, filtered, config);
      try {
        const physical = view.padded?.();
        for (const key of view.keys()) if (!key.startsWith("@")) await read((physical ?? view).get(key));
      } finally { view.dispose(); filtered.dispose(); scope.dispose(); }
    };
    return assertReused(chain(0.3), chain(0.62), `Filter > ${kind}`);
  });

// 17.3e, f: grouped Normalize, Stack and Summary reduce by masks, not per-group compaction, so
// groups of other sizes (same rows, same group count) compile nothing.
for (const [kind, config] of [["Normalize", { field: "x", by: "group" }], ["Stack", { x: "group", y: "x" }],
  ["Summary", { field: "x", by: "group", interval: "normal" }]])
  test(`${kind} ${JSON.stringify(config)}: groups of other sizes compile nothing`, () => {
    const sized = (shift) => ({ ...rows(), group: Array.from({ length: 240 }, (_, i) => `g${Math.min(5, Math.floor(((i + shift) % 240) / (20 + shift)))}`) });
    return assertReused(() => transform(kind, sized(0), config), () => transform(kind, sized(17), config), kind);
  });

// Found in 17.3g: Slice baked its time (a one-element array) and a picked row's index.
const series = () => ({
  id: Array.from({ length: 60 }, (_, i) => `s${i % 4}`),
  t: Float32Array.from({ length: 60 }, (_, i) => Math.floor(i / 4)),
  v: Float32Array.from({ length: 60 }, (_, i) => (i * 13) % 7),
});
test("Slice: another time compiles nothing", () =>
  assertReused(() => transform("Slice", series(), { field: "t", by: "id", at: 3.25 }),
    () => transform("Slice", series(), { field: "t", by: "id", at: 7.5 }), "Slice"));
test("Slice: describing another row compiles nothing", async () => {
  const scope = scopeOf(series()), view = await runTransform("Slice", scope, { field: "t", by: "id", at: 3.25 });
  try {
    const describe = (index) => async () => { await view.aggregateInfo(index); await (await view.contributors(index)).data(); };
    await assertReused(describe(1), describe(2), "Slice aggregateInfo");
  } finally { view.dispose(); scope.dispose(); }
});

// 17.3g: Filter > Slice keeps the physical rows; masks that leave every entity active at the
// slice time give the same output length, so the second compiles nothing.
test("Filter > Slice: a new mask compiles nothing", () => {
  const chain = (value) => async () => {
    const scope = scopeOf(series()), filtered = await runTransform("Filter", scope, { where: { field: "t", op: "gt", value } });
    const view = await runTransform("Slice", filtered, { field: "t", by: "id", at: 3.25 });
    try { await readView(view); } finally { view.dispose(); filtered.dispose(); scope.dispose(); }
  };
  return assertReused(chain(0.5), chain(1.5), "Filter > Slice");
});
// A Slice over a Filter's rows has a row per entity, the active ones valid: masks that leave
// different numbers of entities active give the same length (the moving-particles speed slider
// compiled at nearly every step when the output held the active entities only).
test("Filter > Slice: a mask that hides other entities compiles nothing", () => {
  const chain = (value) => async () => {
    const scope = scopeOf(series()), filtered = await runTransform("Filter", scope, { where: { field: "id", op: "ne", value } });
    const view = await runTransform("Slice", filtered, { field: "t", by: "id", at: 3.25 });
    try { await readView(view); } finally { view.dispose(); filtered.dispose(); scope.dispose(); }
  };
  return assertReused(chain("s0"), async () => { await chain("s1")(); await chain("zzz")(); }, "Filter > Slice (entities)");
});

// 17.3h: two masks whose counts share a bucket give the same lengths downstream (the Group reads
// the Filter's bucket, TODO 25.1).
test("Filter > Group in one bucket: another count compiles nothing", async () => {
  const saved = { ...bucketing };
  Object.assign(bucketing, { minimumSource: 128, minimumBucket: 16 });
  try {
    const chain = (value) => async () => {
      const scope = scopeOf(rows(233)), filtered = await runTransform("Filter", scope, { where: { field: "y", op: "gt", value } });
      assert.equal(filtered.padded().capacity, 233);
      assert.equal(filtered.bucketed().padded().capacity, 64);
      const view = await runTransform("Group", filtered, { by: "group", columns: { m: mean("x") } });
      try { for (const key of view.keys()) if (!key.startsWith("@")) await read(view.padded().get(key)); }
      finally { view.dispose(); filtered.dispose(); scope.dispose(); }
    };
    await assertReused(chain(0.78), chain(0.8), "Filter > Group in a bucket");
  } finally { Object.assign(bucketing, saved); }
});

// 17.8: the jitted reducers take the mask and values as arguments: other values compile nothing
// (and the hook sees the jitted program's kernels, so this is not vacuous).
test("jitted reducers: another mask and values compile nothing", async () => {
  const { reduceValues } = await import("../../src/lib/plot/utils/reduce.js");
  const run = (seed) => async () => {
    const values = np.array(Float32Array.from({ length: 64 }, (_, i) => Math.sin(i + seed)));
    const mask = np.array(Int32Array.from({ length: 64 }, (_, i) => ((i + seed) % 3 ? 1 : 0))).greater(0);
    for (const op of ["count", "sum", "mean", "min", "max", "first", "last", "variance", "std"]) await reduceValues(mask, values, op).data();
    values.dispose(); mask.dispose();
  };
  const first = await kernelsOf(run(0));
  assert.ok(first.size > 0, "the jitted reducers compile kernels the hook sees");
  await assertReused(run(1), run(2), "jitted reducers");
});

// 17.14c: a brush that empties a different group: an empty group's statistics were a literal NaN
// folded into the kernel that stacks the groups, so each pattern of empty groups compiled one.
for (const [kind, config] of [
  ["BoxStats", { by: "group", value: "y" }],
  ["Summary", { field: "y", by: "group", interval: "normal" }],
  ["Summary", { field: "y", by: "group", estimate: "median" }],
])
  test(`Filter > ${kind} ${JSON.stringify(config)}: emptying another group compiles nothing`, () => {
    const chain = (where) => async () => {
      const table = { ...rows(233), y: Float32Array.from({ length: 233 }, (_, i) => ((i * 37) % 101) / 100) };
      const scope = scopeOf(table), filtered = await runTransform("Filter", scope, { where });
      const view = await runTransform(kind, filtered, config);
      try {
        const physical = view.padded?.();
        for (const key of view.keys()) if (!key.startsWith("@")) await read((physical ?? view).get(key));
      } finally { view.dispose(); filtered.dispose(); scope.dispose(); }
    };
    // The same comparison: the first mask empties group g0, the second g5.
    return assertReused(chain({ field: "group", op: "ne", value: "g0" }), chain({ field: "group", op: "ne", value: "g5" }), `Filter > ${kind}`);
  });

// TODO 30.12: grid Dodge's cells and its units' rows are compiled programs; another column count
// reuses them (the count comes from a buffer).
test("Dodge grid: another column count compiles nothing", async () => {
  const run = (columns) => async () => {
    const scope = scopeOf({ c: Float32Array.from({ length: 240 }, (_, i) => i % 3) });
    const view = await runTransform("Dodge", scope, { mode: "grid", columns, count: "c" });
    try { await readView(view); } finally { view.dispose(); scope.dispose(); }
  };
  await assertReused(run(4), run(7), "grid Dodge 4 -> 7 columns");
});

// The fork's WebGPU tuner reads navigator.userAgent (it skips unrolling on mobile browsers). Node
// 20 has no global navigator: there it must tune, not throw (CI's Node 20 job, 2026-10-02).
test("Kernels tune for WebGPU where there is no global navigator", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  delete globalThis.navigator;
  try {
    // BoxStats' quantile kernels reach the tuner's unrolling choice.
    const kernels = await kernelsOf(() => transform("BoxStats", rows(), { by: "group", value: "y" }));
    assert.ok(kernels.size > 0);
  } finally {
    if (saved) Object.defineProperty(globalThis, "navigator", saved);
  }
});


test("compiled mark target slots reuse programs when a threshold changes", async () => {
  const owner = createExpressionEvaluator(), scope = scopeOf(rows());
  const run = threshold => async () => {
    const evaluated = owner.evaluate(where(greater("x", threshold), multiply("y", 2), 0), scope);
    try { await read(evaluated.value); } finally { evaluated.dispose(); }
  };
  try {
    await assertReused(run(0.4), run(0.6), "compiled mark scalar slots");
    assert.equal(owner.size, 1);
    assert.equal(owner.stats.fallback, 0);
  } finally { owner.dispose(); scope.dispose(); }
});

test("runtime constants can become equal without changing the expression plan", async () => {
  const owner = createExpressionEvaluator(), scope = scopeOf({ x: Float32Array.from([2, 3]) });
  try {
    for (const factor of [1, 2, 1, 3]) {
      const evaluated = owner.evaluate(where(greater("x", 1), multiply("x", factor), 1), scope);
      try { assert.deepEqual(Array.from(await evaluated.value.ref.data()), [2 * factor, 3 * factor]); }
      finally { evaluated.dispose(); }
    }
    assert.equal(owner.size, 1);
    assert.equal(owner.stats.traces, 1);
    assert.equal(owner.stats.hits, 3);
    assert.equal(owner.stats.fallback, 0);
  } finally { owner.dispose(); scope.dispose(); }
});
