import test from "node:test";
import assert from "node:assert/strict";
import { Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import {
  evaluateExpression, col, moved, offset, add, subtract, multiply, divide, power, negative, log, exp, sqrt,
  square, abs, minimum, maximum, clip, sin, cos, floor, round, tween, interval, greater, mean, where, sum, lookup,
} from "../../src/lib/plot/utils/expressions.js";
import { INVERSES, channelPath, invertPath, resolveColumn, resolveChannel } from "../../src/lib/plot/interaction/channelWriteback.js";
import { readsOffsets, scopeReadsOffsets } from "../../src/lib/plot/interaction/offsetDependencies.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";

/** The value of `expression` over one row where x = `x` (and y = 3). */
async function forward(expression, x) {
  const scope = createDataScope();
  scope.update({ x: [x], y: [3] });
  const result = evaluateExpression(expression, scope, { time: 0 });
  // A plain column name resolves to the scope's host array; operators give device arrays.
  // (Testing `result.value?.ref` would take a reference: .ref is a getter.)
  try { return Number((result.value instanceof JaxArray ? await result.value.ref.data() : result.value)[0]); }
  finally { result.dispose(); scope.dispose(); }
}

/** Invert `expression` (which reads x once) to reach `target` from x = `x0`, and check it forward. */
async function roundTrip(expression, x0, target) {
  const path = channelPath(expression);
  assert.equal(path.column, "x", String(path.reason));
  // Current values of every node on the path and its arguments, as a drag reads them at its start.
  const cache = new Map();
  const values = [];
  const collect = (node) => { if (typeof node === "string" || node?.__hmplotExpression) values.push(node); };
  for (const { node } of path.path) { collect(node); node.args.forEach(collect); }
  for (const node of values) cache.set(node, await forward(node, x0));
  const x = invertPath(path.path, target, (node) => cache.get(node));
  assert.ok(x !== null, `no inverse for ${expression.op} at ${target}`);
  assert.ok(Math.abs(await forward(expression, x) - target) < 1e-4 * Math.max(1, Math.abs(target)), `${expression.op}: ${x}`);
  return x;
}

test("every inverse round-trips through its operator's forward evaluation", async () => {
  await roundTrip(add(moved("x"), "y"), 1, 10);
  await roundTrip(add("y", moved("x")), 1, 10);
  await roundTrip(subtract("x", 3), 1, 10);
  await roundTrip(subtract(3, "x"), 1, 10);
  await roundTrip(multiply("x", 2), 1, 10);
  await roundTrip(divide("x", 4), 1, 10);
  await roundTrip(divide(12, "x"), 1, 3);
  await roundTrip(power("x", 3), -2, -27);
  assert.equal(await roundTrip(power("x", 2), -2, 9), -3, "an even power keeps the base's sign");
  await roundTrip(power("x", 0.5), 4, 3);
  await roundTrip(power(2, "x"), 1, 8);
  await roundTrip(negative("x"), 1, 5);
  await roundTrip(log("x"), 1, 2);
  await roundTrip(exp("x"), 0, 5);
  await roundTrip(sqrt("x"), 1, 3);
  assert.equal(await roundTrip(square("x"), -1, 4), -2, "square keeps the current sign");
  assert.equal(await roundTrip(abs("x"), -1, 4), -4, "abs keeps the current sign");
  await roundTrip(minimum("x", 10), 1, 5);
  await roundTrip(maximum("x", -10), 1, 5);
  await roundTrip(clip("x", 0, 10), 1, 5);
  // sin and cos stay on the monotonic piece around the current value.
  assert.ok(Math.abs(await roundTrip(sin("x"), 0.1, 0.5) - Math.asin(0.5)) < 1e-6);
  assert.ok(Math.abs(await roundTrip(sin("x"), Math.PI, 0.5) - (Math.PI - Math.asin(0.5))) < 1e-6);
  assert.ok(Math.abs(await roundTrip(sin("x"), -2 * Math.PI, 0.5) - (-2 * Math.PI + Math.asin(0.5))) < 1e-6);
  assert.ok(Math.abs(await roundTrip(cos("x"), 1, 0.5) - Math.acos(0.5)) < 1e-6);
  assert.ok(Math.abs(await roundTrip(cos("x"), 4, 0.5) - (2 * Math.PI - Math.acos(0.5))) < 1e-6);
  await roundTrip(tween("x", { duration: 100 }), 1, 7);
  await roundTrip(log(add(multiply("x", 2), 1)), 1, 3);
});

test("snap-through operators move their argument by the change in the result", async () => {
  const path = channelPath(floor("x")).path;
  const values = new Map([["x", 2.4], [path[0].node, 2]]);
  assert.equal(invertPath(path, 5, (node) => values.get(node)), 5.4);
  assert.equal(channelPath(round("x")).column, "x");
  assert.equal(channelPath(interval("x", 500)).column, "x");
});

test("inverses refuse targets no value reaches", () => {
  assert.equal(INVERSES.multiply(3, [1, 0], 0, 0), null);
  assert.equal(INVERSES.divide(0, [1, 2], 1, 0.5), null);
  assert.equal(INVERSES.exp(-1, [0], 0, 1), null);
  assert.equal(INVERSES.sqrt(-1, [1], 0, 1), null);
  assert.equal(INVERSES.abs(-1, [1], 0, 1), null);
  assert.equal(INVERSES.power(-4, [2, 2], 0, 4), null);
  assert.equal(INVERSES.power(8, [-2, 3], 1, 1), null);
  assert.equal(INVERSES.divide(4, [0, 2], 1, 0), null, "a zero numerator reaches only 0");
  const path = channelPath(log("x")).path;
  assert.equal(invertPath(path, Infinity, () => 1), null);
});

test("an argument held past a bound keeps its value until the target leaves the bound", () => {
  // clip(w, 0, 10) with w = 15 draws 10: a drag up keeps w, a drag down to 9 sets it.
  assert.equal(INVERSES.clip(11, [15, 0, 10], 0, 10), 15);
  assert.equal(INVERSES.clip(10, [15, 0, 10], 0, 10), 15, "back at the start, w is where it was");
  assert.equal(INVERSES.clip(9, [15, 0, 10], 0, 10), 9);
  assert.equal(INVERSES.clip(-1, [-5, 0, 10], 0, 0), -5);
  assert.equal(INVERSES.minimum(12, [15, 10], 0, 10), 15);
  assert.equal(INVERSES.maximum(-2, [-5, 0], 0, 0), -5);
  assert.equal(INVERSES.maximum(2, [-5, 0], 0, 0), 2);
  assert.equal(INVERSES.minimum(12, [8, 10], 0, 8), 12, "an argument inside the bound takes the target");
});

test("a channel drags the column it reads through moved(), else its only column, once", () => {
  assert.deepEqual(channelPath("weight"), { column: "weight", leaf: "column", path: [] });
  assert.equal(channelPath(col("weight")).column, "weight");
  assert.equal(channelPath(multiply(moved("weight"), "scale")).column, "weight");
  assert.equal(channelPath(multiply(moved("weight"), "scale")).leaf, "moved");
  assert.equal(channelPath(offset("weight")).leaf, "offset");
  // @time and interaction columns are other operands, never the dragged column.
  assert.equal(channelPath(add(moved("w"), sin(divide("@time", 1000)))).column, "w");
  assert.equal(channelPath(add(mean("w"), 1)).reason, "mean() reduces over rows");
  assert.equal(channelPath(add("w", mean("w"))).reason, "it reads w more than once");
  assert.equal(channelPath(add(moved("w"), mean("v"))).column, "w");
  assert.equal(channelPath(multiply("a", "b")).reason, "it reads a and b; read the one to drag through moved()");
  assert.equal(channelPath(add(moved("a"), moved("b"))).reason, "it reads a and b; read the one to drag through moved()");
  assert.equal(channelPath(add(moved("w"), "w")).reason, "it reads w more than once");
  assert.equal(channelPath(greater("w", 1)).reason, "greater() has no inverse");
  assert.equal(channelPath(where(greater("v", 0), "w", 0)).reason, "it reads v and w; read the one to drag through moved()");
  assert.equal(channelPath(where(1, moved("w"), 0)).reason, "where() has no inverse");
  assert.equal(channelPath(lookup(moved("w"), "parent")).reason, "lookup() reads another row's value");
  assert.equal(channelPath(clip(1, moved("w"), 3)).reason, "it drags a bound of clip()");
  assert.equal(channelPath(5).reason, "it reads no table column");
  assert.equal(channelPath("@brushed").reason, "@brushed is not a table column");
});

test("columns resolve to their table through Filter, Sort, Calculate, facet aliases and Fold", async () => {
  const scope = createDataScope({ key: "id" });
  scope.update({ id: ["a", "b", "c"], w: [1, 2, 3], v: [4, 5, 6], g: ["p", "q", "p"] });
  const filtered = await runTransform("Filter", scope, { where: greater("w", 1) });
  const sorted = await runTransform("Sort", filtered, { by: "w" });
  const through = resolveColumn(sorted, "w");
  assert.equal(through.root, scope);
  assert.equal(through.column, "w");
  assert.deepEqual(through.steps, []);

  const calculated = await runTransform("Calculate", sorted, { columns: { z: multiply(moved("w"), 2), both: add("w", "v") } });
  // Whether a drag changes a scope: a transform between it and the table reads offsets.
  assert.equal(scopeReadsOffsets(sorted), false);
  assert.equal(scopeReadsOffsets(calculated), true);
  assert.equal(readsOffsets(log("z")), false);
  assert.equal(readsOffsets(add(moved("w"), 1)), true);
  const channel = resolveChannel(calculated, log("z"));
  assert.equal(channel.root, scope);
  assert.equal(channel.column, "w");
  assert.deepEqual(channel.steps.map((step) => [step.kind, step.column, step.leaf]), [["expr", null, "column"], ["expr", "z", "moved"]]);
  assert.equal(resolveColumn(calculated, "both").reason, "Calculate computes both, and it reads w and v; read the one to drag through moved()");

  // Offsets are numeric deltas: a datetime column cannot be dragged (its would be milliseconds).
  const dated = createDataScope();
  dated.update({ t: [new Date(0), new Date(1000)] });
  assert.equal(resolveColumn(dated, "t").reason, "t is a datetime column; a drag moves numeric columns");
  dated.dispose();

  const cell = createDataView(scope, { columns: { x: scope.get("v") } });
  cell.fieldIdentity = { x: "v" };
  assert.equal(resolveColumn(cell, "x").column, "v");

  const grouped = await runTransform("Group", scope, { by: "g", columns: { total: sum("w") } });
  // A sum drags its members (38.4); a count cannot be dragged.
  const total = resolveColumn(grouped, "total");
  assert.equal(total.column, "w");
  assert.deepEqual(total.steps.map((step) => [step.kind, step.policy]), [["reduce", "sum"]]);
  assert.equal(resolveColumn(grouped, "count").reason, "count is computed by Group");
  assert.equal(resolveColumn(grouped, "w").reason, "w does not pass through Group");

  const folded = await runTransform("Fold", scope, { fields: ["w", "v"] });
  const fold = resolveColumn(folded, "value").fold;
  assert.deepEqual(fold.fields, ["w", "v"]);
  assert.equal(fold.key, "key");
  assert.equal(fold.branches.v.column, "v");

  const bars = await runTransform("BarGeometry", scope, { y: "w", baseline: 0 });
  assert.equal(resolveColumn(bars, "__barValue").column, "w");
  assert.equal(resolveColumn(bars, "__barY").steps[0].path.length, 2);
  assert.equal(resolveColumn(bars, "__barSizeY").reason, "__barSizeY is computed by BarGeometry");

  const binned = await runTransform("Bin", scope, { x: "w", mode: "assign", bins: 2 });
  const edge = resolveColumn(binned, "binX0");
  assert.equal(edge.column, "w");
  assert.equal(edge.steps[0].kind, "snap");
  assert.equal(resolveColumn(scope, "missing").reason, "the table has no column missing");
  for (const view of [filtered, sorted, calculated, cell, grouped, folded, bars, binned]) view.dispose();
  scope.dispose();
});
