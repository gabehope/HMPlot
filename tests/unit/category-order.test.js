import densityPlugin from "../../src/lib/plugins/density/index.js";
import { registerPlugin as registerDensityPlugin } from "../../src/lib/plot/plugins/library.js";
registerDensityPlugin(densityPlugin);
// TODO 17.14e, 130.1: BoxStats and violin Density place each group at its category's index in
// the category axis order (the domain the Transform component reads from their frame and passes
// as __categoryOrder), so whiskers, medians and violins sit on the categories their boxes do
// when the axis orders them differently from the data (before, they used the column's own order
// and landed on other categories).
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform, transformCategoryAxis } from "../../src/lib/plot/utils/transforms.js";

const read = async (value) => Array.from(await (value?.codes ?? value).ref.data(), Number);
// First appearance: North, West, South, East; the axis orders them North, East, South, West.
const groups = ["North", "West", "South", "East"], axis = ["North", "East", "South", "West"];
const table = () => {
  const g = [], v = [];
  for (let i = 0; i < 120; i++) { g.push(groups[i % 4]); v.push((i % 4) * 10 + (i % 7)); }
  const scope = createDataScope();
  scope.update({ g, v: Float32Array.from(v) });
  return scope;
};

test("BoxStats positions follow the axis order, or the data's own without one", async () => {
  const scope = table();
  try {
    for (const [order, expected] of [[undefined, [0, 1, 2, 3]], [axis, [0, 3, 2, 1]], [["North", "South"], [0, NaN, 1, NaN]]]) {
      const view = await runTransform("BoxStats", scope, { by: "g", value: "v", __categoryOrder: order });
      try {
        const categories = view.get("g").categories, codes = await read(view.get("g"));
        const positions = await read(view.get("__boxPosition"));
        const at = Object.fromEntries(codes.map((code, i) => [categories[code], positions[i * 2]]));
        assert.deepEqual(groups.map((name) => at[name]), expected, JSON.stringify(order));
        const starts = await read(view.get("__medianStart"));
        codes.forEach((_, i) => {
          const center = positions[i * 2];
          if (Number.isNaN(center)) assert.ok(Number.isNaN(starts[i * 2]));
          else assert.ok(Math.abs(starts[i * 2] - (center - 0.4)) < 1e-6);
        });
      } finally {
        view.dispose();
      }
    }
  } finally {
    scope.dispose();
  }
});

test("violin centers follow the axis order", async () => {
  const scope = table();
  try {
    const view = await runTransform("Density", scope, { x: "v", by: "g", resolution: 8, bandwidth: 2, violin: { side: "right" }, __categoryOrder: axis });
    try {
      const categories = view.get("g").categories, codes = await read(view.get("g")), lower = await read(view.get("__violinLower"));
      // side "right": the lower edge is the center itself.
      const centers = {};
      codes.forEach((code, i) => { if (!Number.isNaN(lower[i])) centers[categories[code]] = lower[i]; });
      assert.deepEqual(groups.map((name) => centers[name]), [0, 3, 2, 1]);
    } finally {
      view.dispose();
    }
  } finally {
    scope.dispose();
  }
});

test("the axis whose order a transform reads follows its orientation", () => {
  assert.equal(transformCategoryAxis("BoxStats", { orientation: "horizontal" }), "y");
  assert.equal(transformCategoryAxis("Density", { violin: {} }), "x");
  assert.equal(transformCategoryAxis("Density", {}), null);
  assert.equal(transformCategoryAxis("Bin", {}), null);
});

test("an order of its own is an error naming the frame's", async () => {
  const scope = table();
  await assert.rejects(() => runTransform("BoxStats", scope, { by: "g", value: "v", order: axis }), /follow the frame's category order/);
  scope.dispose();
});
