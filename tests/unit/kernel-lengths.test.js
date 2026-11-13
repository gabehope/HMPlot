import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
// TODO Stage 23: a new row count compiles nothing. The bundled jax-js fork (@hmplot/jax)
// reads a kernel's lengths from uniforms, and reduces into few outputs with a strided workgroup
// whose length is a uniform. Each test runs a transform (alone, and after a Filter) on a table of
// one length, then on a table of another length of the same size class, and asserts the second
// run compiles no program the first did not (tests/unit/compiled-programs.js).
//
// What a new length still compiles (vendor/jax-js/PATCHES.md): a reduction shorter than 64, or
// into more than 256 outputs (its length stays in the source, where the compiler unrolls it); a
// new integer divisor (an inner dimension); another tuning class; a sort of 512 rows or fewer
// (one shader per power of two). The lengths below stay clear of those.
import test from "node:test";
import { assertReused } from "./compiled-programs.js";
import { run } from "./kernel-length-runs.js";
import { subtract, mean, count, quantile } from "../../src/lib/plot/utils/expressions.js";

const TRANSFORMS = [
  ["Filter", { where: { field: "x", op: "gt", value: 0.4 } }],
  ["Group", { by: "group", columns: { m: mean("x"), n: count() } }],
  ["Bin", { x: "x", bins: 6 }],
  ["Bin", { x: "x", bins: 5, mode: "assign" }],
  ["Calculate", { columns: { dv: subtract("x", mean("x")), gm: mean("x", { by: "group" }), n: count(), c: 2 } }],
  ["Sort", { by: ["group", "y"] }],
  ["Window", { field: "x", size: 4, align: "center" }],
  ["Window", { field: "x", size: 50, reduce: "sum", by: "group" }],
  ["Normalize", { field: "x", by: "group" }],
  ["Normalize", { field: "x", method: "extent" }],
  ["Stack", { x: "group", y: "x", series: "y" }],
  ["Stack", { x: "group", y: "y", series: "id", offset: "wiggle", order: "insideOut" }],
  ["BoxStats", { by: "group", value: "y" }],
  ["BoxOutliers", { by: "group", value: "y" }],
  ["Calculate", { columns: { q: quantile("y", 0.9, { by: "group" }) } }],
  ["Summary", { field: "y", by: "group", interval: "normal" }],
  ["Summary", { field: "y", by: "group", estimate: "median" }],
  ["Pivot", { field: "group", value: mean("y") }],
  ["Hexbin", { x: "x", y: "y", bins: 6, bounds: { x: [0, 1], y: [0, 1] }, columns: { m: mean("x") } }],
  ["Density", { x: "y", by: "group", resolution: 16, violin: {} }],
  ["Regression", { x: "x", y: "y", method: "poly", order: 2 }],
  ["ECDF", { x: "y", by: "group" }],
  ["Slice", { field: "t", by: "id", at: 3.25 }],
  ["Sample", { seed: 3, order: "random" }],
  ["Sample", { size: 50, seed: 3 }],
  ["Fold", { fields: ["x", "y"] }],
];

// Pairs of lengths in one size class: past two sort workgroups, far from the tuner's thresholds.
const PAIRS = [[1000, 1003], [2400, 2957]];
for (const [kind, config] of TRANSFORMS)
  for (const filter of [false, true])
    test(`${filter ? "Filter > " : ""}${kind} ${JSON.stringify(config)}: a new row count compiles nothing`, async () => {
      for (const [a, b] of PAIRS)
        await assertReused(run(kind, config, a, filter), run(kind, config, b, filter), `${kind} ${a} -> ${b}`);
    });

// Over 65,536 rows a column's count, extents and reductions split into 256 blocks (reduce.js
// reduceRows); the blocks' length is read at run time as well. The grouped ones take ~45 s each
// on the cpu backend: they are in tests/slow/kernel-lengths-large.test.js (npm run test:slow).
for (const [kind, config] of TRANSFORMS.filter(([kind, config]) => ["Filter", "Normalize", "Calculate"].includes(kind) && !config.by))
  test(`${kind} ${JSON.stringify(config)}: a new count of 65,536 rows or more compiles nothing`, () =>
    assertReused(run(kind, config, 70000, false), run(kind, config, 90001, false), `${kind} 70000 -> 90001`));
