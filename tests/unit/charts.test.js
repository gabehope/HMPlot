// TODO 130.4: what the charts' expanded parts compute, read from their transforms: a Waterfall's
// bars span the running total before each step to the total after it, and a Candlestick's bodies
// its open to its close, each filled by direction.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { parameterValues, nodeProps } from "../../src/lib/templates/instantiate.js";
import { typedColumn } from "../../src/lib/plot/utils/columns.js";
import bandX from "../../src/lib/charts/bandX.js";
import bandY from "../../src/lib/charts/bandY.js";
import waterfall from "../../src/lib/charts/waterfall.js";
import candlestick from "../../src/lib/charts/candlestick.js";

const values = async (view, key) => { const column = view.get(key)?.codes ?? view.get(key); return Array.from(await column.ref.data()); };
// The rows the chart's Bar draws: the transforms on the way to it, run in order.
async function barRows(definition, table, props, keys) {
  const scope = createDataScope();
  scope.update(table);
  const params = parameterValues(definition, props);
  const views = [scope];
  try {
  let view = scope, item = definition.root;
  while (item.kind !== "Bar") {
    if (item.kind !== "Mapping") { view = await runTransform(item.kind, view, nodeProps(definition, item, props, params)); views.push(view); }
    item = item.children.find((child) => child.kind !== "Segments");
  }
  const columns = await Promise.all(keys.map((key) => values(view, key)));
  return columns[0].map((_, i) => columns.map((column) => column[i])).sort((a, b) => a[0] - b[0]);
  } finally { views.reverse().forEach(view => view.dispose()); }
}

test("a Waterfall's bars step from total to total, skipping zero and missing changes", async () => {
  const rows = await barRows(waterfall, { step: ["A", "B", "C", "D", "E"], change: [10, NaN, -3, 0, 5] }, { x: "step", y: "change" },
    ["step", "__waterfallStart", "__waterfallEnd", "__waterfallDirection"]);
  assert.deepEqual(rows, [[0, 0, 10, 0], [2, 10, 7, 1], [4, 7, 12, 0]]);
});

test("a Candlestick's bodies run from open to close, rising when the close is at least the open", async () => {
  const rows = await barRows(candlestick, { day: [1, 2, 3], open: [10, 12, 11], high: [13, 13, 12], low: [9, 10, 10], close: [12, 11, 11] },
    { x: "day", open: "open", high: "high", low: "low", close: "close" }, ["day", "open", "__candleClose", "__candleDirection"]);
  assert.deepEqual(rows, [[1, 10, 12, 0], [2, 12, 11, 1], [3, 11, 11, 0]]);
});


test("reference band templates leave automatic domains alone and default to translucent single-row rectangles", () => {
  for (const [definition, axis, other] of [[bandX, "x", "y"], [bandY, "y", "x"]]) {
    const props = { [axis + "0"]: 2, [axis + "1"]: 4, fill: "#ff0000" };
    const result = nodeProps(definition, definition.root, props, parameterValues(definition, props));
    assert.equal(definition.root.kind, "Rect");
    assert.equal(result[other + "0"], `@view_${other}_min`);
    assert.equal(result[other + "1"], `@view_${other}_max`);
    assert.equal(result.domains, false);
    assert.equal(result.rows, "auto");
    assert.equal(result.opacity, 0.15);
    assert.equal(result.legend, false);
    assert.equal(result.fill, "#ff0000");
  }
});

// The four low-risk patterns have one primary mark; optional supporting parts stay separate.
test("the first pattern batch declares its primary mark and routes named-part overrides", async () => {
  const { mainKind, pathOf, mounted } = await import("../../src/lib/templates/instantiate.js");
  const definitions = await Promise.all(["forestPlot", "bulletChart", "intervalTimeline", "sparkline"]
    .map(async name => (await import(`../../src/lib/charts/${name}.js`)).default));
  const find = (item, id) => item.id === id ? item : item.children.map(child => find(child, id)).find(Boolean);
  for (const [definition, main, part] of definitions.map((d, i) => [d, ["Points", "Bar", "Prism", "Line"][i], ["interval", "ranges", "milestones", "last"][i]])) {
    assert.equal(mainKind(definition), main);
    const props = { x: "value", y: "category", x0: "start", x1: "end", lower: "low", upper: "high",
      opacity: 0.4, [part]: { opacity: 0.7, label: "My part" } };
    const params = parameterValues(definition, props), item = find(definition.root, part);
    const resolved = nodeProps(definition, item, props, params);
    assert.equal(resolved.opacity, 0.7);
    assert.equal(resolved.label, "My part");
    assert.ok(pathOf(definition, item.id));
    const own = Object.keys(definition.chart.options);
    assert.ok(!own.some(key => key.startsWith("_")), "internal calculation fields are not public parameters");
  }
  const forest = definitions[0];
  const ref = find(forest.root, "referenceLine");
  assert.equal(mounted(ref, parameterValues(forest, {}), forest.kind, {}), false);
  assert.equal(mounted(ref, parameterValues(forest, { reference: 0 }), forest.kind, {}), true, "zero is a real reference value");
});

test("Sparkline labels the final finite row after filtering, including an empty finite subset", async () => {
  const definition = (await import("../../src/lib/charts/sparkline.js")).default;
  const item = definition.root.children[2];
  for (const table of [{ x: [1, 2, 3, 4], y: [3, NaN, 5, NaN] }, { x: [1, 2], y: [NaN, NaN] }]) {
    const scope = createDataScope(); scope.update({ ...table, y: typedColumn(table.y, { type: "numeric" }) });
    const props = { x: "x", y: "y", text: "y" }, params = parameterValues(definition, props);
    const finite = await runTransform("Filter", scope, nodeProps(definition, item, props, params));
    const last = await runTransform("Filter", finite, nodeProps(definition, item.children[0], props, params));
    assert.equal(last.length, table.x.length === 4 ? 1 : 0);
    if (last.length) assert.deepEqual(await values(last, "x"), [3]);
    last.dispose(); finite.dispose(); scope.dispose();
  }
});

test("BulletChart sorts any supplied bound columns and omits missing or below-baseline ranges", async () => {
  const definition = (await import("../../src/lib/charts/bulletChart.js")).default;
  const scope = createDataScope(); scope.update({ category: ["A", "B"], poor: [-10, 40], fair: [70, 60], good: [100, NaN] });
  const props = { x: "actual", y: "category", fields: ["fair", "good", "poor"] }, params = parameterValues(definition, props);
  const views = [scope];
  try {
    let item = definition.root.children[0], view = scope;
    while (item.kind !== "Bar") {
      view = await runTransform(item.kind, view, nodeProps(definition, item, props, params)); views.push(view);
      item = item.children[0];
    }
    assert.deepEqual(await values(view, "__bulletBound"), [100, 70, 60, 40]);
  } finally { views.reverse().forEach(view => view.dispose()); }
});

test("IntervalTimeline preserves durations when the datetime endpoints have different origins", async () => {
  const definition = (await import("../../src/lib/charts/intervalTimeline.js")).default;
  const scope = createDataScope(), day = 86400000, epoch = Date.UTC(2024, 9, 1);
  scope.update({ task: ["A", "B"], start: typedColumn([epoch, epoch + 2 * day], { type: "datetime", unit: "ms" }),
    end: typedColumn([epoch + day, epoch + 5 * day], { type: "datetime", unit: "ms" }),
    mark: typedColumn([epoch + 2 * day, epoch + 4 * day], { type: "datetime", unit: "ms" }) });
  const props = { y: "task", x0: "start", x1: "end", milestone: "mark" };
  const part = nodeProps(definition, definition.root.children[0], props, parameterValues(definition, props));
  const view = await runTransform("Calculate", scope, part);
  assert.deepEqual(await values(view, "__timelineSpan"), [day, 3 * day]);
  assert.deepEqual(await values(view, "__timelineCenter"), [day / 2, 3.5 * day]);
  assert.equal(view.metadata("__timelineCenter").type, "datetime");
  assert.equal(view.metadata("__timelineMilestone").origin, view.metadata("__timelineCenter").origin);
  assert.deepEqual(await values(view, "__timelineMilestone"), [2 * day, 4 * day]);
  view.dispose(); scope.dispose();
});
