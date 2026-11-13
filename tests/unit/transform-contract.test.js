import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
import { plugins } from "../../src/lib/plot/plugins/runtime.js";
registerFirstPartyPlugins();
// TODO 31.5: one contract test for every transform. Hidden rows never affect a value: each kind,
// with representative configs, gives the same logical output over
//   (a) a plain table and an all-visible Filter of it (one code path, rows hidden or not),
//   (b) a Filter's hidden-rows view and (d) a plain table of just the kept rows, and
//   (c) the kept rows visible-first (a Sort after the Filter) and (d) sorted the same way.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform, transformDependencies, transformOwnsTweens, transformDomainFields } from "../../src/lib/plot/utils/transforms.js";
import { analyzeDependencies, interactionResources, watchResources } from "../../src/lib/plot/utils/transforms/dependencies.js";
import { definitions } from "../../src/lib/plot/utils/transforms/index.js";
import { multiply, mean, count, add, sum, less, greater, logical_and, max, median, quantile } from "../../src/lib/plot/utils/expressions.js";
import { createJoinTable } from "../../src/lib/plot/utils/tableJoin.js";

const noise = (i, k) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

test("transform lifecycle capabilities follow the definition instead of its registered name", () => {
  const alias = "ContractTestAlias";
  try {
    definitions.set(alias, definitions.get("Calculate"));
    assert.equal(transformOwnsTweens(alias), true);
    assert.equal(transformDomainFields(alias, {}), null);
    for (const kind of ["Bin", "Hexbin"]) {
      definitions.set(alias, definitions.get(kind));
      assert.equal(transformOwnsTweens(alias), false);
      assert.deepEqual(transformDomainFields(alias, { x: "a", y: "b" }), { x: "a", y: "b" });
    }
    definitions.set(alias, definitions.get("Filter"));
    assert.equal(transformOwnsTweens(alias), false);
    assert.equal(transformDomainFields(alias, {}), null);
  } finally {
    definitions.delete(alias);
  }
});
test("grid definitions share publication and release results canceled before publication", async () => {
  const scope = createDataScope();
  scope.update({ t: [0, 1], x: [0, 2] });
  const alias = "GridContractAlias";
  try {
    for (const [kind, config] of [
      ["Slice", { field: "t", at: 0.5, values: ["x"] }],
      ["Interpolate", { x: "t", values: ["x"], resolution: 3 }],
    ]) {
      const definition = definitions.get(kind);
      definitions.set(alias, definition);
      const view = await runTransform(alias, scope, config);
      try {
        assert.equal(view.pipeline.at(-1).kind, alias);
        assert.equal(view.step.kind, alias);
        assert.equal(view.get("x").shape[0], kind === "Slice" ? 1 : 3);
      } finally { view.dispose(); }
      const abort = new AbortController();
      definitions.set(alias, { ...definition, async run(...args) {
        const result = await definition.run(...args);
        abort.abort();
        return result;
      } });
      await assert.rejects(runTransform(alias, scope, config, { signal: abort.signal }), { name: "AbortError" });
    }
  } finally {
    definitions.delete(alias);
    scope.dispose();
  }
});

const N = 48;
const rows = Array.from({ length: N }, (_, i) => ({
  id: i,
  x: i % 11 === 3 ? NaN : Math.round(noise(i, 1) * 100) / 10,
  y: Math.round(noise(i, 2) * 50) / 10,
  k: i % 4,
  g: (i * 7) % 5,
  s: ["p", "q", "r"][(i * 5) % 3],
}));
const CATEGORIES = ["a", "b", "c", "d", "e"];
/** A table of `picked` rows (all of them by default), as columns of every kind. */
const tableOf = (picked = rows) => ({
  id: Float32Array.from(picked, (r) => r.id),
  x: Float32Array.from(picked, (r) => r.x),
  y: Float32Array.from(picked, (r) => r.y),
  k: Int32Array.from(picked, (r) => r.k),
  g: { codes: Int32Array.from(picked, (r) => r.g), categories: CATEGORIES },
  s: picked.map((r) => r.s),
});
const scopeOf = (table) => {
  const scope = createDataScope();
  scope.update(table);
  return scope;
};
const KEEP = { field: "y", op: "gt", value: 2.2 };
const kept = rows.filter((r) => r.y > 2.2);
const ALL = { field: "id", op: "finite" };

/** Representative configs for every kind, and for each kind of output. */
const CONFIGS = {
  Calculate: [
    { columns: { z: multiply("x", 2), m: mean("x"), n: count() } },
    // TODO 137.3: the Quantile and JoinAggregate transforms are reductions here now.
    { columns: { q: quantile("x", 0.25, { by: "g" }), gm: mean("x", { by: "g" }) } },
  ],
  Filter: [{ where: { field: "x", op: "lt", value: 6 } }],
  Sort: [{ by: "x", order: "desc" }, { by: ["k", "y"] }],
  Sample: [{ size: 10, seed: 3 }, { seed: 3, order: "random" }],
  Shift: [{ field: "x", interval: 3 }, { field: "y", interval: -2, as: { shifted: "later", original: "now" } }],
  Window: [
    { field: "x", size: 3, reduce: "mean" },
    // Leading windows reach past the visible count: they must stop at it.
    { field: "y", size: 3, reduce: "sum", align: "leading" },
    { field: "y", size: 4, reduce: "max", by: "k", align: "center" },
  ],
  Bin: [
    { x: "x", bins: 6 },
    { x: "x", y: "y", bins: 3, empty: false },
    { x: "x", bins: 5, mode: "assign" },
    // Uneven edges: the binary search.
    { x: "x", bins: [0, 2, 5, 10], mode: "assign" },
  ],
  Hexbin: [
    { x: "x", y: "y", bins: 4 },
    { x: "x", y: "y", bins: 4, bounds: { x: [0, 10], y: [0, 5] } },
  ],
  Group: [
    {
      by: "g",
      columns: { m: mean("x"), top: max("y"), middle: median("y") },
    },
  ],
  // TODO 43: a lookup by a numeric key (k 3 has no row), and an inner join on text. `data` is
  // the joined table's columns; each test makes its JoinTable (withTables, below).
  Join: [
    { data: { k: [0, 1, 2], label: ["zero", "one", "two"], weight: [0.5, 1.5, 2.5] }, on: "k" },
    { data: { name: ["q", "r"], rank: [2, 1] }, leftOn: "s", rightOn: "name", how: "inner" },
  ],
  Pivot: [{ by: "k", field: "g", value: sum("y") }],
  Stack: [
    { x: "k", y: "y", series: "g" },
    // TODO 39.7: offsets and orders (the (group, series) table, a sequence over the series).
    { x: "k", y: "y", series: "g", offset: "wiggle", order: "insideOut" },
    { x: "g", y: "y", series: "s", offset: "expand", order: "desc" },
    { x: "k", y: "y", series: "g", offset: "center", order: "appearance" },
    // A numeric series is grouped; NaN values (x) are not stacked.
    { x: "g", y: "x", series: "k", order: "asc" },
  ],
  Normalize: [
    { field: "x", by: "k" },
    { field: "y", method: "extent" },
  ],
  Summary: [
    { field: "x", by: "g", interval: "normal" },
    { field: "y", estimate: "median" },
  ],
  BoxStats: [{ by: "g", value: "x" }],
  BoxOutliers: [{ by: "k", value: "y", whisker: 0.5 }],
  BarGeometry: [{ y: "y", baseline: 1 }],
  PieGeometry: [
    { value: "y", by: "k", sort: "desc", padAngle: 2 },
    { value: "x", category: "s", sort: ["q", "p"], label: "percent", innerRadius: 0.3 },
  ],
  Fold: [{ fields: ["x", "y"] }],
  Dodge: [{ mode: "grid", columns: 4 }],
  Density: [
    { x: "x", by: "g", resolution: 16 },
    { x: "x", y: "y", resolution: 8 },
  ],
  // TODO 47: a fit of the shown rows; the rows in value order per group.
  Regression: [
    { x: "x", y: "y", samples: 9 },
    { x: "x", y: "y", method: "poly", order: 2, band: false, samples: 5 },
  ],
  ECDF: [{ x: "x", by: "g" }, { x: "y", normalize: "count", complementary: true }],
  // TODO 47.6: on the host, over the visible rows.
  Delaunay: [{ x: "x", y: "y" }],
  Voronoi: [{ x: "x", y: "y" }],
  Hull: [{ x: "x", y: "y", by: "g" }],
  // Polygon's vertex rows (internal): a polygon per group of k.
  Triangulate: [{ x: "x", y: "y", series: "k" }],
};
/** `kind`'s configs with Join's tables made; a JoinTable's scope keeps its columns' device copies until disposed. */
function withTables(kind, configs) {
  if (kind !== "Join") return { configs, dispose() {} };
  const tables = configs.map(() => createJoinTable());
  return {
    configs: configs.map((config, i) => ({ ...config, data: tables[i].table(config.data) })),
    dispose: () => tables.forEach((table) => table.dispose()),
  };
}
// Random over the rows read: the same seed picks among a Filter's input rows, so they differ
// from the same transform over the kept rows alone (docs/DATA.md). (a) still holds.
const RANDOM = new Set(["Sample"]);

/** A column as plain values: numbers, or category values for codes (null where missing). */
async function valuesOf(column) {
  // Device arrays are told by `.data`: reading `.ref` takes a reference.
  const device = (value) => typeof value?.data === "function";
  if (column?.codes !== undefined) {
    const codes = device(column.codes)
      ? Array.from(await column.codes.ref.data(), Number)
      : Array.from(column.codes);
    return codes.map((code) =>
      code < 0 ? null : (column.categories[code] ?? null),
    );
  }
  if (device(column)) return Array.from(await column.ref.data(), Number);
  return Array.from(column);
}
function same(actual, expected, label) {
  assert.equal(
    actual.length,
    expected.length,
    `${label}: ${actual.length} rows, expected ${expected.length}`,
  );
  actual.forEach((value, i) => {
    const e = expected[i];
    if (typeof e !== "number") assert.equal(value, e, `${label}[${i}]`);
    else if (Number.isNaN(e))
      assert.ok(Number.isNaN(value), `${label}[${i}]: ${value}, expected NaN`);
    else
      assert.ok(
        Math.abs(value - e) <= 1e-4 * Math.max(1, Math.abs(e)),
        `${label}[${i}]: ${value}, expected ${e}`,
      );
  });
}
/** Every column of `expected` (not interaction fields), through get(), in order. */
async function sameView(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  assert.deepEqual(
    [...actual.keys()].sort(),
    [...expected.keys()].sort(),
    `${label}: columns`,
  );
  for (const key of expected.keys()) {
    if (key.startsWith("@")) continue;
    same(
      await valuesOf(actual.get(key)),
      await valuesOf(expected.get(key)),
      `${label}.${key}`,
    );
  }
}
/** Runs `steps` ([kind, config] in order) over a scope of `table`, then disposes everything. */
async function pipeline(table, steps, use) {
  const made = [scopeOf(table)];
  try {
    for (const [kind, config] of steps)
      made.push(await runTransform(kind, made.at(-1), config));
    return await use(made.at(-1));
  } finally {
    made.reverse().forEach((item) => item.dispose());
  }
}
const compare = (left, right, label) =>
  pipeline(left.table, left.steps, (a) =>
    pipeline(right.table, right.steps, (b) => sameView(a, b, label)),
  );

// Transforms whose input these tables are not: Contour reads a grid table (its hidden cells are
// checked in statistics.test.js). GraphData publishes a node relation rather than extra edge
// columns; graph-data.test.js checks masks, typed reductions and the linked table contract.
// Slice and Interpolate have masked/grid contract comparisons in slice.test.js and grid.test.js.
// community-graph creates an independent graph; plugins.test.js checks its seeded generation.
const ELSEWHERE = new Set(["Contour", "GraphData", "Slice", "Interpolate", "community-graph"]);
test("every transform definition has contract configs", () => {
  for (const kind of [...definitions.keys(), ...plugins.kinds("transform")])
    assert.ok(CONFIGS[kind]?.length || ELSEWHERE.has(kind), `${kind} has no configs in CONFIGS`);
});

for (const [kind, configs] of Object.entries(CONFIGS))
  test(`${kind}: hidden rows never affect a value`, async () => {
    const made = withTables(kind, configs);
    try {
      for (const config of made.configs) {
        const label = `${kind} ${JSON.stringify(config)}`;
        // (a) No rows hidden, with and without a mask.
        await compare(
          { table: tableOf(), steps: [[kind, config]] },
          {
            table: tableOf(),
            steps: [
              ["Filter", { where: ALL }],
              [kind, config],
            ],
          },
          `${label} (a)`,
        );
        if (RANDOM.has(kind)) continue;
        // (b) A Filter's hidden rows against (d) a table of the kept rows.
        await compare(
          {
            table: tableOf(),
            steps: [
              ["Filter", { where: KEEP }],
              [kind, config],
            ],
          },
          { table: tableOf(kept), steps: [[kind, config]] },
          `${label} (b)`,
        );
        // (c) The kept rows visible-first, in another order, against (d) in that order.
        const reverse = ["Sort", { by: "id", order: "desc" }];
        await compare(
          {
            table: tableOf(),
            steps: [["Filter", { where: KEEP }], reverse, [kind, config]],
          },
          { table: tableOf(kept), steps: [reverse, [kind, config]] },
          `${label} (c)`,
        );
      }
    } finally {
      made.dispose();
    }
  });

// TODO 33.6: a compiled kernel matches its eager run (utils/programs.js kernels.compiled), over
// plain rows and a Filter's hidden rows.
const COMPILED = ["Bin", "Hexbin", "Group", "Join", "Pivot", "Normalize", "Stack", "Summary", "PieGeometry"];
test("compiled transform kernels match their eager runs", async () => {
  const { kernels } = await import("../../src/lib/plot/utils/programs.js");
  const run = (steps, compiled) => (use) => {
    kernels.compiled = compiled;
    return pipeline(tableOf(), steps, use);
  };
  try {
    for (const kind of COMPILED) {
      const made = withTables(kind, CONFIGS[kind]);
      try {
        for (const config of made.configs)
          for (const steps of [[[kind, config]], [["Filter", { where: KEEP }], [kind, config]]])
            await run(steps, true)((compiled) =>
              run(steps, false)((eager) => sameView(compiled, eager, `${kind} ${JSON.stringify(config)} (${steps.length})`)),
            );
      } finally {
        made.dispose();
      }
    }
  } finally {
    kernels.compiled = true;
  }
});

// Refactor plan P4d: what a transform's settings read besides its input (its definition's
// `dependencies`, else its expression-valued parameters), and the subscriptions it makes.
test("transform dependencies: the interaction state, clock and pointer each kind re-runs on", () => {
  const scope = scopeOf({ x: Float32Array.of(0, 1, 2, 3) });
  const analyze = (kind, settings) => {
    const { interaction, resources, clock, pointer } = analyzeDependencies(transformDependencies(kind, settings));
    return { interaction: interaction.sort(), resources: resources.length, clock, pointer };
  };
  const reads = (interaction, { resources = 0, clock = false, pointer = false } = {}) => ({ interaction, resources, clock, pointer });
  const columns = { s: sum("@selected") };
  const cases = [
    // Calculate: its columns' expressions (an @any_ field reads its @ resource), not plain names.
    ["Calculate", { columns: { a: multiply("@brushed", "v"), b: add("@any_hovered", "@time"), c: "@selected" } },
      reads(["@brushed", "@hovered"], { clock: true })],
    ["Calculate", { columns: { p: less("x", "@pointer_x") } }, reads([], { pointer: true })],
    // Filter: a field condition reads its field as named; an expression as Calculate's do.
    ["Filter", { where: "@brushed" }, reads(["@brushed"])],
    ["Filter", { where: "@any_focus" }, reads(["@any_focus"])],
    ["Filter", { where: [logical_and("@any_brushed", greater("x", mean("x"))), { field: "@hovered", op: "eq", value: 0 }, { field: "x", op: "gt", value: 1 }] },
      reads(["@brushed", "@hovered"])],
    ["Filter", { where: [less("t", "@time")] }, reads([], { clock: true })],
    ["Filter", { where: scope.identity.selection }, reads([], { resources: 1 })],
    // Bin: a count expression, the weight and its columns' expressions; not the binned field.
    ["Bin", { x: "@brushed", bins: add(10, multiply(sum("@hovered"), 0)), weight: "@any_brushed", columns },
      reads(["@any_brushed", "@hovered", "@selected"])],
    // Group: its columns' expressions.
    ["Group", { by: "g", columns: { s: sum("@selected") } }, reads(["@selected"])],
    // Hexbin: its count or radius expressions and its columns' expressions; not x or y.
    ["Hexbin", { x: "x", y: "y", radius: multiply(mean("@brushed"), 0.1), columns }, reads(["@brushed", "@selected"])],
    ["Hexbin", { x: "x", y: "y", bins: { x: add(4, sum("@time")) } }, reads([], { clock: true })],
    // Kinds without a declaration: their expression-valued parameters (their schemas' expression parameters).
    ["Density", { x: "x", bandwidth: multiply(mean("@brushed"), 1) }, reads(["@brushed"])],
    ["Sort", { by: "@brushed" }, reads([])],
  ];
  for (const [index, [kind, settings, expected]] of cases.entries())
    assert.deepEqual(analyze(kind, settings), expected, `case ${index}: ${kind}`);
  scope.dispose();
});

test("a transform subscribes once per resource it reads, and a replaced dependency stops waking it", () => {
  const scope = scopeOf({ x: Float32Array.of(0, 1, 2, 3) });
  const owner = scope.identity;
  let runs = 0;
  const watch = watchResources(() => runs++);
  const follow = (kind, settings) =>
    watch.update(interactionResources(analyzeDependencies(transformDependencies(kind, settings)), scope));
  // @brushed and @any_brushed read one resource: one run per change.
  const both = { columns: { a: multiply("@brushed", "x"), b: add("@any_brushed", "x") } };
  follow("Calculate", both);
  assert.equal(watch.size, 1);
  owner.brush.replace(owner, [1], { phase: "committed" });
  assert.equal(runs, 1);
  owner.hover.replace(owner, [2], { phase: "preview" });
  assert.equal(runs, 1, "a change to state it does not read");
  // The same settings again keep the subscription.
  follow("Calculate", { ...both });
  assert.equal(runs, 1);
  // update() to another column: the brush no longer wakes it, the hover does.
  follow("Calculate", { columns: { a: multiply("@hovered", "x") } });
  owner.brush.replace(owner, [2], { phase: "committed" });
  assert.equal(runs, 1);
  owner.hover.replace(owner, [3], { phase: "preview" });
  assert.equal(runs, 2);
  // A Filter on a selection reads that resource directly.
  follow("Filter", { where: owner.selection });
  owner.selection.replace(owner, [0], { phase: "committed" });
  assert.equal(runs, 3);
  owner.hover.replace(owner, [1], { phase: "preview" });
  assert.equal(runs, 3);
  // Unmounted: nothing wakes it.
  watch.stop();
  assert.equal(watch.size, 0);
  owner.selection.replace(owner, [1], { phase: "committed" });
  owner.brush.clear();
  assert.equal(runs, 3);
  scope.dispose();
});
