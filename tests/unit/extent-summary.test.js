import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { createExtentSummary } from "../../src/lib/plot/utils/extentSummary.js";
import { finiteExtents } from "../../src/lib/plot/utils/dataView.js";
import { numericExtent } from "../../src/lib/plot/utils/scaleBindings.js";
import { domainInputs } from "../../src/lib/plot/utils/markDomains.js";
import { domainFields } from "../../src/lib/plot/utils/markDomains.js";
import { preparePhysicalDomains } from "../../src/lib/plot/utils/physicalDomains.js";
import { prepareNamed } from "../../src/lib/plot/utils/namedData.js";
import { labelMetricFields } from "../../src/lib/plot/utils/labelBounds.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { optionsRoot } from "../../src/lib/options/options.js";
import { add, col } from "../../src/lib/plot/utils/expressions.js";

test("physical Text bounds match compacted footprints while masking hidden long labels and invalid positions", async () => {
  const prior = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ measureText: text => ({ width: text.length * 64 }) }) }) };
  const scope = createDataScope(), options = optionsRoot.splitUnique("physical label domains");
  scope.update({ x: [1, 10, -1000, NaN], y: [2, 4, 1000, 1], text: ["A", "Longer", "Hidden very wide label", "Invalid"],
    size: [12, 20, 300, 5], dx: [1, 3, -500, 1], dy: [-4, 2, 500, 0] });
  const view = createDataView(scope, { mask: np.array([1, 1, 0, 1], { dtype: np.int32 }), count: 3 });
  const channels = { x: "x", y: "y", text: "text", size: "size", dx: "dx", dy: "dy", font: "physical-label-test" };
  const state = { auto: {}, hidden: {} }, compact = prepareNamed(channels, view, options, "Text", state);
  const physical = preparePhysicalDomains("Text", channels, view, options, state);
  const extents = async (prepared) => {
    const collected = domainFields("Text", prepared.props), metrics = labelMetricFields(prepared.props, options, prepared.valid);
    const fields = collected.flatMap(({ fields }) => fields);
    try { return await finiteExtents([...fields, ...metrics.fields], metrics.valid, { missing: null }); }
    finally { fields.forEach(field => (field.array ?? field).dispose()); metrics.fields.forEach(field => field.dispose()); metrics.valid.dispose(); }
  };
  try {
    assert.equal(compact.props.position.shape[0], 3); assert.equal(physical.props.position.shape[0], 4);
    const expected = await extents(compact);
    assert.deepEqual(await extents(physical), expected);
    assert.deepEqual(expected, [[1, 10], [2, 4], [12, 120], [12, 20], [1, 3], [-4, 2]]);
    assert.equal(preparePhysicalDomains("Text", { ...channels, x: add(col.x, 1) }, view, options, state), null);
    assert.equal(preparePhysicalDomains("Text", { ...channels, x: [1, 10, NaN] }, view, options, state), null);
    assert.equal(preparePhysicalDomains("Text", { ...channels, series: "text" }, view, options, state), null);
    assert.equal(preparePhysicalDomains("Text", channels, view, options, state, undefined, { fill: new Set(["A"]) }), null);
  } finally {
    physical.dispose(); compact.dispose(); view.dispose(); scope.dispose(); options.dispose(); globalThis.document = prior;
    for (const entry of state.categoryValues?.values() ?? []) entry.values.dispose();
  }
});

test("domain summary inputs exclude paint and CSS size, retain geometry and label metrics", () => {
  const x = Float32Array.of(1, 2), moved = Float32Array.of(3, 4);
  const props = { x: "x", y: 2, size: 3, fill: "red", opacity: 0.5 };
  const resolve = value => value === "x" ? x : value;
  assert.deepEqual(domainInputs("Points", props, { resolve }),
    domainInputs("Points", { ...props, size: 8, fill: "blue", opacity: 1 }, { resolve }));
  assert.notDeepEqual(domainInputs("Points", props, { resolve }),
    domainInputs("Points", props, { resolve: value => value === "x" ? moved : value }));
  assert.equal(domainInputs("Points", props, { glyphs: { x: true } }).size, 3);
  assert.equal(domainInputs("Prism", { width: 4, rotation: 30, shape: "triangle" }).rotation, 30);
  assert.equal(domainInputs("Line", { curve: "catmull-rom", curveAlpha: 0.7 }).curveAlpha, 0.7);
  for (const kind of ["Line", "Area"])
    assert.notDeepEqual(domainInputs(kind, { x: "x", series: "group" }),
      domainInputs(kind, { x: "x", series: "other" }));
  const text = { text: "Name", font: "Inter", size: 12, dx: 2, align: "left", box: true };
  assert.deepEqual(domainInputs("Text", text), domainInputs("Text", { ...text, align: "right", box: false }));
  assert.equal(domainInputs("Text", { ...text, size: 16 }).size, 16);
  assert.equal(domainInputs("Points", props, { resolve: () => null }), null);
});

test("extent summaries share concurrent and completed masked work, invalidate revisions, and release inputs", async () => {
  let reads = 0;
  const summaries = createExtentSummary({ read: (...args) => { reads++; return finiteExtents(...args); } });
  const values = np.array([-2, 3, 8, NaN]), mask = np.array([0, 1, 1, 1], { dtype: np.int32 });
  try {
    const first = summaries.request(values, { valid: mask, valueRevision: 1, maskRevision: 1 });
    const duplicate = summaries.request(values, { valid: mask, valueRevision: 1, maskRevision: 1 });
    assert.equal(first, duplicate);
    assert.deepEqual(await first, [3, 8]);
    assert.equal(reads, 1);
    assert.equal(values.refCount, 1);
    assert.equal(mask.refCount, 1);
    assert.deepEqual(await summaries.request(values, { valid: mask, valueRevision: 1, maskRevision: 1 }), [3, 8]);
    await summaries.request(values, { valid: mask, valueRevision: 2, maskRevision: 1 });
    await summaries.request(values, { valid: mask, valueRevision: 2, maskRevision: 2 });
    assert.equal(reads, 3);
    assert.deepEqual(await summaries.request(values, { valid: mask, transform: "log" }), [3, 8]);
    assert.deepEqual(await summaries.request(values), [-2, 8]);
    assert.equal(reads, 5);
  } finally { values.dispose(); mask.dispose(); }
});

test("extent batches combine only ready requests with one mask and publication owner", async () => {
  const batches = [], callbacks = [];
  const summaries = createExtentSummary({ schedule: work => callbacks.push(work), read: (...args) => {
    batches.push(args[0].length); return finiteExtents(...args);
  } });
  const a = np.array([1, 4]), b = np.array([2, 6]), mask = np.array([1, 0], { dtype: np.int32 });
  const plot = {}, otherPlot = {};
  try {
    const pending = [summaries.request(a, { batch: plot }), summaries.request(b, { batch: plot }),
      summaries.request(a, { batch: plot, valid: mask }), summaries.request(b, { batch: otherPlot, transform: "log" })];
    assert.equal(callbacks.length, 1);
    await callbacks.shift()();
    assert.deepEqual(await Promise.all(pending), [[1, 4], [2, 6], [1, 1], [2, 6]]);
    assert.deepEqual(batches.sort(), [1, 1, 2]);
    assert.equal(a.refCount, 1); assert.equal(b.refCount, 1); assert.equal(mask.refCount, 1);
  } finally { a.dispose(); b.dispose(); mask.dispose(); }
});

test("one extent batch masks scalars, rasters and columns each by its own reshaped mask", async () => {
  const callbacks = [], summaries = createExtentSummary({ schedule: work => callbacks.push(work) });
  const mask = np.array([1, 0, 0], { dtype: np.int32 }), scalar = np.array(5);
  const raster = np.array([[1, 2], [60, 70], [-60, -70]]), values = np.array([1, 100, -50]);
  try {
    const pending = [scalar, raster, values].map(input => summaries.request(input, { valid: mask }));
    await callbacks.shift()();
    assert.deepEqual(await Promise.all(pending), [[5, 5], [1, 2], [1, 1]]);
    assert.deepEqual(await summaries.request(values, { valid: mask }), [1, 1]);
  } finally { for (const array of [mask, scalar, raster, values]) array.dispose(); }
});

test("mutable host inputs require a revision and rejected summaries can be retried", async () => {
  let reads = 0, fail = true;
  const summaries = createExtentSummary({ read: (...args) => {
    reads++;
    if (fail) { fail = false; throw Error("read failed"); }
    return finiteExtents(...args);
  } });
  const values = Float32Array.of(1, 2);
  await assert.rejects(summaries.request(values, { valueRevision: 1 }), /read failed/);
  assert.deepEqual(await summaries.request(values, { valueRevision: 1 }), [1, 2]);
  values[1] = 7;
  assert.deepEqual(await summaries.request(values, { valueRevision: 2 }), [1, 7]);
  values[1] = 9;
  assert.deepEqual(await summaries.request(values), [1, 9]);
  values[1] = 11;
  assert.deepEqual(await summaries.request(values), [1, 11]);
  assert.equal(reads, 5);
});

test("extent batches preserve separate revisions of the same mutable mask", async () => {
  const callbacks = [], batches = [];
  const summaries = createExtentSummary({ schedule: work => callbacks.push(work), read: (...args) => {
    batches.push(args[0].length); return finiteExtents(...args);
  } });
  const values = np.array([2, 9]), mask = Int32Array.of(1, 0), owner = {};
  try {
    const first = summaries.request(values, { valid: mask, maskRevision: 1, batch: owner });
    mask.set([0, 1]);
    const second = summaries.request(values, { valid: mask, maskRevision: 2, batch: owner });
    await callbacks.shift()();
    assert.deepEqual(await Promise.all([first, second]), [[2, 2], [9, 9]]);
    assert.deepEqual(batches, [1, 1]);
    assert.equal(values.refCount, 1);
  } finally { values.dispose(); }
});

test("scale summaries preserve raster, scalar masking, transform validity and per-caller cancellation", async () => {
  const values = np.array([[1, NaN], [4, 10]]), mask = np.array([1, 0], { dtype: np.int32 });
  const scalar = np.array(3), empty = np.zeros([0], { dtype: np.int32 });
  try {
    assert.deepEqual(await numericExtent(values, "linear"), [1, 10]);
    assert.deepEqual(await numericExtent(values, "linear", undefined, mask), [1, 1]);
    assert.equal(await numericExtent(scalar, "linear", undefined, empty), null);
    const controller = new AbortController();
    const canceled = numericExtent(values, "sqrt", controller.signal), accepted = numericExtent(values, "sqrt");
    controller.abort();
    await assert.rejects(canceled, { name: "AbortError" });
    assert.deepEqual(await accepted, [1, 10]);
    assert.equal(values.refCount, 1); assert.equal(mask.refCount, 1);
  } finally { values.dispose(); mask.dispose(); scalar.dispose(); empty.dispose(); }
});
