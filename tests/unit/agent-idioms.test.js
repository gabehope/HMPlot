import test from "node:test";
import assert from "node:assert/strict";
import { literalColorChannels } from "../../src/lib/plot/utils/literalColors.js";
import { where, equal, col } from "../../src/lib/plot/utils/expressions.js";
import { literal } from "../../src/lib/plot/utils/categorical.js";

// 2026-10-22: fill=where(cond, literal("#e4572e"), literal("#3677a8")), the D3 and Vega-Lite
// way to color a highlight, becomes a where() over indices with a categorical scale of the colors.
test("a where() over color constants becomes indices with a scale of those colors", () => {
  const scope = { has: (name) => name === "g" };
  const fill = where(equal("g", literal("a")), literal("#e4572e"), where(col.on, "steelblue", literal("#3677a8")));
  const out = literalColorChannels({ fill, x: "x" }, scope);
  assert.equal(out.x, "x");
  assert.equal(out.fill.op, "where");
  assert.equal(out.fill.args[1], 0);
  assert.deepEqual([out.fill.args[2].args[1], out.fill.args[2].args[2]], [1, 2]);
  assert.deepEqual(out.fillScale.domain, [0, 1, 2]);
  assert.deepEqual([0, 1, 2].map((i) => out.fillScale.value(i)), ["#e4572e", "steelblue", "#3677a8"]);
  assert.equal(out.fillScale.conditional, true);
  // The same colors share one scale, so a re-preparation keeps its identity.
  assert.equal(literalColorChannels({ fill }, scope).fillScale, out.fillScale);
  // Left as written: an explicit scale, a leaf that is a column or not a color, a non-where.
  const props = { fill, fillScale: { isCategorical: true } };
  assert.equal(literalColorChannels(props, scope), props);
  const column = { color: where(col.on, "g", literal("#e4572e")) };
  assert.equal(literalColorChannels(column, scope), column);
  const numbers = { fill: where(col.on, 1, 0) };
  assert.equal(literalColorChannels(numbers, scope), numbers);
});

// 2026-10-22: d3's diverging domain [low, mid, high] is accepted as the ends and the midpoint.
test("a three-value continuous domain is the ends and the midpoint", async () => {
  const { continuous } = await import("../../src/lib/plot/utils/scaleResources.js");
  const scale = continuous({ domain: [-60, 0, 60], colormap: ["#2166ac", "#f7f7f7", "#b2182b"] });
  assert.deepEqual(scale.domain, [-60, 60]);
  assert.equal(scale.normalization.midpoint, 0);
  assert.throws(() => continuous({ domain: [-60, 0, 60], midpoint: 0 }), /already gives the midpoint/);
  assert.throws(() => continuous({ domain: [1, 1] }), /received \[1,1\]/);
  // d3's color range is the colormap; a numeric range stays a range.
  const colors = continuous({ domain: [-60, 0, 60], range: ["#2166ac", "#f7f7f7", "#b2182b"] });
  assert.deepEqual(colors.domain, [-60, 60]);
  assert.equal(colors.range, undefined);
});

// 2026-10-22: a Filter whose condition is the same on every row (an input against a constant,
// ~(focus != "")) keeps every row or none; a reduction is still refused.
test("a constant Filter condition keeps every row or none", async () => {
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const { createDataScope, literal } = await import("../../src/lib/plot/utils/categorical.js");
  const { equal, not_equal, logical_not, mean } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3] });
  const rows = async (where) => { const out = await runTransform("Filter", scope, { where }); try { return out.length; } finally { out.dispose(); } };
  assert.equal(await rows(logical_not(not_equal(literal(""), literal("")))), 3);
  assert.equal(await rows(equal(literal("a"), literal("b"))), 0);
  await assert.rejects(runTransform("Filter", scope, { where: mean("x") }), /one value per row/);
  scope.dispose();
});

// 2026-10-23: rows holding positions as [x, y] (deck.gl's style) make an N x 2 column.
test("a column of [x, y] arrays is an N x 2 positions column", async () => {
  const { createDataScope } = await import("../../src/lib/plot/utils/categorical.js");
  const scope = createDataScope();
  scope.update([{ start: [1, 2], k: 1 }, { start: [3, 4], k: 2 }, { start: null, k: 3 }]);
  const start = scope.get("start");
  assert.deepEqual(start.shape, [3, 2]);
  const flat = Array.from(await start.ref.data());
  assert.deepEqual(flat.slice(0, 4), [1, 2, 3, 4]);
  assert.ok(flat.slice(4).every(Number.isNaN));
  // Mixed lengths or text are not positions: the type error stays.
  assert.throws(() => createDataScope().update({ p: [[1, 2], [3, 4, 5]] }), /incompatible value types/);
  // The scope made the column, so it releases it when replaced and when disposed (the leak check).
  scope.update([{ start: [5, 6] }]);
  assert.deepEqual(scope.get("start").shape, [1, 2]);
  scope.dispose();
});

// 2026-10-23: a transform's int32 category codes whose categories are not in the scale's order
// go through a lookup; where() promoted them to float32 and take() refused them as indices.
test("category codes out of the scale's order map through the lookup", async () => {
  const { createDataScope, categorical, literal } = await import("../../src/lib/plot/utils/categorical.js");
  const { prepareNamed } = await import("../../src/lib/plot/utils/namedData.js");
  const { optionsRoot } = await import("../../src/lib/options/options.js");
  const { where, equal } = await import("../../src/lib/plot/utils/expressions.js");
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3], g: ["a", "b", "a"] });
  const scale = categorical({ domain: ["#fff", "#111"], range: ["#ffffff", "#111111"] });
  // The state keeps each categorical channel's last values (categoryValues); its owner releases them.
  const state = { hidden: {}, auto: {} };
  const prepared = prepareNamed({ x: "x", y: "x", fill: where(equal("g", literal("a")), literal("#111"), literal("#fff")), fillScale: scale },
    scope, optionsRoot.splitUnique("agent idioms"), "Points", state);
  try { assert.ok(prepared.props.categoryColor, "per-row colors"); } finally {
    prepared.dispose();
    for (const entry of state.categoryValues?.values() ?? []) entry.values.dispose();
    scope.dispose();
  }
});
