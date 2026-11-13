// TODO 139.4: the cost of one selection's membership on the shared path (selectionField through
// the views' virtual columns), on jax-js's CPU backend: a table, a Group of it, a Group of that
// Group, and a Filter of an aggregate, over repeated selection changes. Each consumer reads a
// view's cached column for the resource's revision, so a second consumer of a view costs a
// cache hit. Run: node tests/perf/investigations/selection-membership.mjs [rows]
import { performance } from "node:perf_hooks";
import { createDataScope } from "../../../src/lib/plot/utils/categorical.js";
import { selection, selectionMask } from "../../../src/lib/plot/utils/interaction.js";
import { runTransform } from "../../../src/lib/plot/utils/transforms.js";

const rows = Number(process.argv[2] ?? 100_000);
const scope = createDataScope();
const a = Array.from({ length: rows }, (_, i) => `g${i % 1000}`), b = Array.from({ length: rows }, (_, i) => `h${i % 20}`);
scope.update({ a, b, v: Float32Array.from({ length: rows }, (_, i) => i % 97) });
const focus = selection();
focus.owner = scope.identity;
const fine = await runTransform("Group", scope, { by: ["a", "b"] });
const coarse = await runTransform("Group", fine, { by: "b" });
const kept = await runTransform("Filter", fine, { where: { field: "count", op: "gt", value: 1 } });
const regrouped = await runTransform("Group", kept, { by: "b" });
const time = async (label, scopeOf, updates = 20) => {
  const ms = [];
  for (let k = 0; k < updates; k++) {
    focus.replace(scope.identity, Array.from({ length: 50 }, (_, i) => (i * 7919 + k * 31) % rows));
    const start = performance.now();
    const mask = selectionMask(scopeOf, focus);
    await mask.ref.data();
    mask.dispose();
    // A second consumer of the same view and revision: a cache hit.
    const again = performance.now();
    selectionMask(scopeOf, focus).dispose();
    ms.push([again - start, performance.now() - again]);
  }
  const mean = (i) => (ms.slice(2).reduce((sum, m) => sum + m[i], 0) / (ms.length - 2)).toFixed(2);
  console.log(`${label.padEnd(28)} ${String(scopeOf.length).padStart(7)} rows: first read ${mean(0)} ms, second consumer ${mean(1)} ms`);
};
console.log(`${rows} table rows, 50 selected rows per update, mean of 18 updates (CPU backend)`);
await time("table", scope);
await time("Group by a, b", fine);
await time("Group of that Group", coarse);
await time("Group of a filtered Group", regrouped);
for (const view of [regrouped, kept, coarse, fine]) view.dispose();
scope.dispose();
