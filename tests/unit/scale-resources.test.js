import test from "node:test";
import assert from "node:assert/strict";
import { createNormalization, continuous } from "../../src/lib/plot/utils/scaleResources.js";
import { ordinal } from "../../src/lib/plot/utils/categorical.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { table } from "../../src/lib/plot/utils/interaction.js";
import { mergeMappings } from "../../src/lib/plot/utils/mapping.js";

test("scalar scale extents and missing values retain numeric semantics", async () => {
  const { numericExtent, hasMissingValues } = await import("../../src/lib/plot/utils/scaleBindings.js");
  const { channelScalar } = await import("../../src/lib/plot/utils/data.js");
  const { numpy: np } = await import("@hmplot/jax");
  assert.deepEqual(await numericExtent(channelScalar(3), "linear"), [3, 3]);
  assert.equal(await numericExtent(channelScalar(-1), "log"), null);
  assert.equal(await hasMissingValues(channelScalar(NaN)), true);
  assert.equal(await hasMissingValues(channelScalar(1)), false);
  const device = np.array(NaN), empty = np.zeros([0], { dtype: np.int32 });
  try {
    assert.equal(await hasMissingValues(device), true);
    assert.equal(await numericExtent(device, "linear"), null);
    assert.equal(device.refCount, 1, 'scalar type checks do not retain device references');
    assert.equal(await numericExtent(channelScalar(3), "linear", undefined, empty), null);
  } finally { device.dispose(); empty.dispose(); }
});

test("missing-value summaries share immutable work and recheck mutable inputs", async () => {
  const { hasMissingValues } = await import("../../src/lib/plot/utils/scaleBindings.js");
  const { Array: JaxArray, numpy: np } = await import("@hmplot/jax");
  const values = Float32Array.of(1, 2), column = np.array([1, NaN]);
  const read = JaxArray.prototype.data;
  let reads = 0;
  try {
    assert.equal(await hasMissingValues(values), false);
    values[1] = NaN;
    assert.equal(await hasMissingValues(values), true);
    values[1] = 3;
    assert.equal(await hasMissingValues(values), false);
    JaxArray.prototype.data = function (...args) { reads++; return read.apply(this, args); };
    const canceled = new AbortController();
    const pending = hasMissingValues(column, canceled.signal);
    const accepted = hasMissingValues(column);
    canceled.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(await accepted, true);
    assert.equal(await hasMissingValues(column), true);
    assert.equal(reads, 1);
    assert.equal(column.refCount, 1);
    const stopped = new AbortController(); stopped.abort();
    await assert.rejects(hasMissingValues(column, stopped.signal), { name: "AbortError" });
  } finally { JaxArray.prototype.data = read; column.dispose(); }
});

test("shared normalization keeps independent color and size encodings in sync", () => {
  const normalization = createNormalization();
  const color = continuous({ normalization, colormap: "Inferno" });
  const size = continuous({ normalization, range: [4, 16] });
  normalization.contribute("morning", [0, 10]);
  normalization.contribute("evening", [5, 20]);
  assert.deepEqual(color.domain, [0, 20]);
  assert.deepEqual(size.domain, [0, 20]);
  color.update({ colormap: "Viridis" });
  assert.deepEqual(size.range, [4, 16]);
  normalization.release("evening");
  assert.deepEqual(color.domain, [0, 10]);
  size.dispose();
  color.dispose();
});

test("invalid shared-scale edits preserve the last accepted configuration", () => {
  const normalization = createNormalization({ domain: [1, 100], transform: "log" });
  const scale = continuous({ normalization, colormap: "Viridis" });
  assert.throws(() => normalization.update({ domain: [-1, 100] }), /positive/);
  assert.deepEqual(scale.domain, [1, 100]);
  assert.throws(() => scale.update({ colormap: "MissingMap" }), /Unknown colormap/);
  assert.equal(scale.colormap, "Viridis");
  scale.dispose();
});

test("ordinal scales preserve category order and resample when the domain changes", () => {
  const scale = ordinal({ domain: ["low", "medium", "high"], colormap: "Viridis" });
  assert.deepEqual(scale.domain, ["low", "medium", "high"]);
  assert.equal(scale.value(1), scale.range[1]);
  scale.update({ domain: ["high", "low"] });
  assert.deepEqual(scale.domain, ["high", "low"]);
  assert.equal(scale.range.length, 2);
  assert.equal(scale.index("missing"), -1);
});

test("column provenance distinguishes names and preserves indexed and shared sources", () => {
  const first = createDataScope(), second = createDataScope(), third = createDataScope();
  const shared = table({ temperature: [1, 2] });
  first.update(shared);
  second.update(shared);
  third.update({ temperature: [1, 2] });
  assert.equal(first.columnIdentity("temperature"), second.columnIdentity("temperature"));
  assert.notEqual(first.columnIdentity("temperature"), third.columnIdentity("temperature"));
  const view = createDataView(first);
  assert.equal(view.columnIdentity("temperature"), first.columnIdentity("temperature"));
  view.dispose();
  third.dispose(); second.dispose(); first.dispose();
});

test("Mapping can inherit complete size and width scale resources", () => {
  const size = continuous({ range: [4, 18] });
  const width = continuous({ range: [1, 5] });
  assert.equal(mergeMappings("Points", [{ sizeScale: size }], {}).sizeScale, size);
  assert.equal(mergeMappings("Line", [{ widthScale: width }], {}).widthScale, width);
  size.dispose(); width.dispose();
});

test("continuous and ordinal scales take colormap specs as well as names", () => {
  const normalization = createNormalization({ domain: [0, 1] });
  const spec = { colors: ["#ff0000", "#00ff00", "#0000ff"], space: "hsl", positions: [0, 0.8, 1] };
  const color = continuous({ normalization, colormap: spec });
  assert.deepEqual(color.colormap, spec);
  assert.deepEqual(color.snapshot().colormap, spec);
  const version = color.version;
  color.update({ colormap: { ...spec, colors: ["red", "lime", "blue"] } });
  assert.equal(color.version, version, "an equivalent spec does not notify");
  color.update({ colormap: ["#000000", "#ffffff"] });
  assert.deepEqual(color.colormap, { colors: ["#000000", "#ffffff"], space: "lab", positions: null });
  assert.throws(() => color.update({ colormap: { colors: ["red"] } }), /at least two colors/);
  assert.deepEqual(color.colormap, { colors: ["#000000", "#ffffff"], space: "lab", positions: null });
  color.update({ colormap: "Inferno" });
  assert.equal(color.colormap, "Inferno");
  const ranks = ordinal({ domain: ["a", "b"], colormap: "Viridis" });
  ranks.update({ colormap: ["#ff0000", "#0000ff"] });
  assert.deepEqual(ranks.colormap, { colors: ["#ff0000", "#0000ff"], space: "lab", positions: null });
  assert.deepEqual(ranks.range.map((c) => c.replace(/\s/g, "")), ["rgb(255,0,0)", "rgb(0,0,255)"]);
  color.dispose();
});
