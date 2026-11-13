// The slow cases of tests/unit/kernel-lengths.test.js (npm run test:slow; ~3 minutes on the cpu
// backend, where the everyday suite takes about one): a new row count compiles nothing.
import test from "node:test";
import { assertReused } from "../unit/compiled-programs.js";
import { run } from "../unit/kernel-length-runs.js";
import { mean, count } from "../../src/lib/plot/utils/expressions.js";

// Over 65,536 rows a column's count, extents and reductions split into 256 blocks (reduce.js
// reduceRows); the blocks' length is read at run time as well. Grouped transforms here.
for (const [kind, config] of [
  ["Group", { by: "group", columns: { m: mean("x"), n: count() } }],
  ["Normalize", { field: "x", by: "group" }],
])
  test(`${kind} ${JSON.stringify(config)}: a new count of 65,536 rows or more compiles nothing`, () =>
    assertReused(run(kind, config, 70000, false), run(kind, config, 90001, false), `${kind} 70000 -> 90001`));

// A Density over several chunks (512 rows each at this resolution): its programs must not
// depend on the chunk count (TODO 33.3: one program for every chunk compiled per count). One
// pair, 5 -> 6 chunks, in one size class of the grouping's scans.
test("Density over several chunks: another chunk count compiles nothing", () =>
  assertReused(run("Density", { x: "x", y: "y", by: "group", resolution: [64, 64] }, 2100, false),
    run("Density", { x: "x", y: "y", by: "group", resolution: [64, 64] }, 2600, false), "Density 2100 -> 2600"));
