import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { frameDimensionMapping, frameDimensionStages } from "../../src/lib/plot/utils/frameMapping.js";
import {
  mapThroughFrame, connectionScope, createConnectionConsumer, connectionEvent, hostColumnValues, tokenValue,
} from "../../src/lib/plot/utils/connectionPrepare.js";
import { createEndpointRegistry } from "../../src/lib/plot/utils/endpointRegistry.js";
import {
  connect, endpointDescriptor, ambiguousFieldError, duplicateKeyError, otherViewError, connectionBackedError,
  deferredEndpointError, repeatedEndpointError, singleEndpointError,
} from "../../src/lib/plot/utils/connections.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { framePoint } from "../../src/lib/plot/utils/framePlacement.js";
import { createViewMarks, emptyBinding } from "../../src/lib/plot/utils/markBinding.js";

const near = (a, b, label = "") => assert.ok(Math.abs(a - b) < 1e-3 || (Number.isNaN(a) && Number.isNaN(b)), `${label} ${a} != ${b}`);
const rows = async (array) => {
  const data = Array.from(await array.ref.data());
  const width = array.shape[1] ?? 1;
  return Array.from({ length: array.shape[0] }, (_, i) => data.slice(i * width, (i + 1) * width));
};
const rowsOwned = async (array) => { try { return await rows(array); } finally { array.dispose(); } };

// Options with a frame chain: a child frame whose own range sits in its parent's coordinates.
function chain({ parentX = "log", parentY = "sqrt" } = {}) {
  const parentValues = {
    xbounds: [1, 1000], xrange: [-1, 1], xTransform: parentX,
    ybounds: [1, 100], yrange: [-2, 2], yTransform: parentY,
    zbounds: [0, 1], zrange: [0, 10], zTransform: "linear",
  };
  const parent = { get: (key) => parentValues[key] };
  const childValues = {
    // xrange/yrange: the composed range a frame publishes (read when the chain is linear and collapses).
    xbounds: [0, 100], _frameXRange: [10, 100], xrange: [-0.8, 0.9], xTransform: "linear",
    ybounds: [0, 10], _frameYRange: [4, 64], yrange: [-1, 1], yTransform: "linear",
    zbounds: [0, 1], zrange: [0, 10], zTransform: "linear",
  };
  return { parentValues, child: { get: (key) => childValues[key], frameDefinition: { parent, owns: () => true, ranges: new Set(["x", "y"]) } } };
}

test("mapThroughFrame equals frameDimensionMapping over linear, log and sqrt chains", async () => {
  for (const [parentX, parentY] of [["log", "sqrt"], ["linear", "linear"], ["sqrt", "log"]]) {
    const { child } = chain({ parentX, parentY });
    if (parentX !== "linear") assert.equal(frameDimensionStages(child, "x").length, 2, "a nonlinear chain keeps both stages");
    const points = [[5, 1, 0.5], [50, 5, 0], [100, 9, 1]];
    const input = np.array(points);
    const out = await rowsOwned(mapThroughFrame(input, child));
    input.dispose();
    points.forEach((point, i) => [..."xyz"].forEach((axis, c) => {
      // A linear chain collapses to the mark's own flat stage (frameDimensionStages), as the shader does.
      near(out[i][c], frameDimensionMapping(child, axis).forward(point[c]), `${parentX}/${parentY} row ${i} ${axis}`);
    }));
  }
});

test("mapThroughFrame keeps missing values missing and fills absent columns with zero", async () => {
  const { child } = chain();
  const input = np.array([[NaN, 5], [50, NaN], [20, 2]]);
  const out = await rowsOwned(mapThroughFrame(input, child));
  input.dispose();
  assert.ok(Number.isNaN(out[0][0]), "NaN through a log stage stays NaN (not the clamped minimum)");
  assert.ok(Number.isNaN(out[1][1]), "NaN through a sqrt stage stays NaN");
  near(out[0][1], frameDimensionMapping(child, "y").forward(5));
  near(out[1][0], frameDimensionMapping(child, "x").forward(50));
  // A 2D mark's z is 0 mapped through the z chain.
  for (const row of out) near(row[2], frameDimensionMapping(child, "z").forward(0));
  // Empty input.
  const empty = np.zeros([0, 2]), mapped = mapThroughFrame(empty, child);
  assert.deepEqual(mapped.shape, [0, 3]);
  empty.dispose(); mapped.dispose();
});

test("JAX mapping matches CPU on a three-level polar, log/sqrt Cartesian, spherical chain", async () => {
  const globeValues = { coordinates: "spherical",
    projection: "orthographic", projectionCenter: [0, 0], angleUnit: "degrees",
    baseRadius: 1, radialScale: 1, xbounds: [-180, 180], ybounds: [-90, 90] };
  const globe = { get: key => globeValues[key], frameDefinition: {
    parent: null, placement: null, ranges: new Set(), owns: () => true } };
  const chartValues = { coordinates: "cartesian", xbounds: [0, 4],
    ybounds: [1, 100], xTransform: "sqrt", yTransform: "log",
    _frameXRange: [0, 45], _frameYRange: [1, 30] };
  const chart = { get: key => chartValues[key] ?? globe.get(key), frameDefinition: {
    parent: globe, placement: null, ranges: new Set(["x", "y"]), owns: () => true } };
  const diskValues = { coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    baseRadius: 0, radialScale: 1, polarAxis: "Z", xbounds: [0, 24], ybounds: [0, 1],
    _frameXRange: [0, 4], _frameYRange: [1, 5] };
  const disk = { get: key => diskValues[key] ?? chart.get(key), frameDefinition: {
    parent: chart, placement: null, ranges: new Set(["x", "y"]), owns: () => true } };
  const points = [[0, 1, 0], [6, 1, 0], [12, 0.5, 0], [6, -1, 0]];
  for (const center of [[0, 0], [30, 0]]) {
    globeValues.projectionCenter = center;
    const input = np.array(points), actual = await rowsOwned(mapThroughFrame(input, disk));
    input.dispose();
    points.forEach((point, row) => framePoint(disk, point).forEach((value, axis) =>
      near(actual[row][axis], value, `center ${center} row ${row} axis ${axis}`)));
  }
});

test("JAX operation mapping follows flat projections, polar axes and invisible points", async () => {
  const cases = [
    [{ coordinates: "polar", polarAxis: "X", angleUnit: "custom", anglePeriod: 24,
      baseRadius: 1, radialScale: 2 }, [[6, 2, 3], [-6, 0, -2], [0, -1, 0]]],
    [{ coordinates: "polar", polarAxis: "Y", angleUnit: "extent", xbounds: [6, 30],
      baseRadius: 0, radialScale: 1 }, [[6, 2, 3], [12, 1, 0], [18, -1, 0]]],
    ...["equirectangular", "mercator", "equal-area", "orthographic"].map((projection) =>
      [{ coordinates: "spherical", projection,
        projectionCenter: [30, 20], baseRadius: 1, radialScale: 1 },
      [[-170, 20, 0], [-60, -30, 0.2], [40, 30, 0]]]),
    [{ coordinates: "spherical", mode: "3d", sphericalView: "projected",
      projection: "orthographic", projectionCenter: [25, 15], baseRadius: 2, radialScale: 0.5 },
    [[0, 0, 0], [170, 0, 0], [50, 30, 2]]],
  ];
  for (const [values, points] of cases) {
    // The plot's 2D or 3D view (TODO 136.12: its view context).
    const options = { get: (key) => values[key], viewContext: { mode: values.mode ?? "2d" } };
    const input = np.array(points), actual = await rowsOwned(mapThroughFrame(input, options));
    input.dispose();
    points.forEach((point, row) => {
      const expected = framePoint(options, point);
      if (expected === null) assert.ok(actual[row].every(Number.isNaN), `${values.projection ?? values.polarAxis}: invalid row ${row}`);
      else expected.forEach((value, axis) => near(actual[row][axis], value,
        `${values.projection ?? values.polarAxis} row ${row} axis ${axis}`));
    });
  }
});

test("connectionScope: a shared owner resolves unqualified fields at each connection's source row", async () => {
  const owner = createDataScope();
  owner.update({ species: ["x", "y", "z"], v: [1, 2, 3], a: [10, 20, 30] });
  // Two slot views of the owner (as a Filter or Facet cell would make): rows [2, 0] and [0, 1].
  const firstRows = np.array([2, 0], { dtype: np.int32 }), lastRows = np.array([0, 1], { dtype: np.int32 }), local = np.array([7, 8]);
  const first = createDataView(owner, { indices: firstRows });
  const last = createDataView(owner, { indices: lastRows, columns: { local } });
  // A Line over 2 connections x 2 slots: vertex rows c0s0 c0s1 | sep | c1s0 c1s1.
  const scope = connectionScope({
    rows: 5, rowConnection: Int32Array.from([0, 0, -1, 1, 1]),
    slotScopes: [first, last], slotRows: [Int32Array.from([1, 0]), Int32Array.from([0, -1])],
    shared: true, ownerScope: owner, ownerRows: Int32Array.from([0, 2]), owner: owner.identity,
  });
  assert.equal(scope.identity, owner.identity);
  assert.ok(scope.has("species") && scope.has("source.a") && scope.has("target.local"));
  const species = scope.get("species");
  assert.deepEqual(species.categories, ["x", "y", "z"]);
  assert.deepEqual(Array.from(await species.codes.ref.data()), [0, 0, -1, 2, 2]);
  assert.deepEqual(Array.from(await scope.get("v").ref.data()).map((v) => (Number.isNaN(v) ? null : v)), [1, 1, null, 3, 3]);
  // source.<field>: the first slot at its row; target.<field>: the last slot, missing where it has none.
  assert.deepEqual(Array.from(await scope.get("source.a").ref.data()).map((v) => (Number.isNaN(v) ? null : v)), [10, 10, null, 30, 30]);
  assert.deepEqual(Array.from(await scope.get("target.local").ref.data()).map((v) => (Number.isNaN(v) ? null : v)), [7, 7, null, null, null]);
  // Categorical columns keep their original identity, so scales and legends are shared.
  assert.equal(scope.columnIdentity("species"), owner.columnIdentity("species"));
  // An endpoint-local derived column is never guessed: it is ambiguous unqualified.
  assert.equal(scope.ambiguous("local"), true);
  assert.equal(scope.ambiguous("species"), false);
  assert.equal(scope.ambiguous("steelblue"), false, "not a column anywhere: a literal (a CSS color)");
  assert.equal(ambiguousFieldError("Line", "color", "local"),
    'Line.color: "local" is ambiguous across the endpoints\' tables; use "source.local" or "target.local".');
  assert.ok(scope.keys().includes("species") && scope.keys().includes("source.a") && scope.keys().includes("target.local"));
  // Reference counted like a data view.
  const release = scope.retain();
  scope.dispose();
  assert.doesNotThrow(() => scope.get("v"));
  release();
  assert.throws(() => scope.get("v"), /disposed/);
  first.dispose(); last.dispose(); owner.dispose();
  firstRows.dispose(); lastRows.dispose(); local.dispose();
});

test("connectionScope: across owners only source./target. fields resolve; missing rows stay missing", async () => {
  const left = createDataScope(), right = createDataScope();
  left.update({ name: ["a", "b"], group: ["p", "q"] });
  right.update({ name: ["b", "c"], group: ["q", "r"], weight: [2, 3] });
  // Segments: one row per connection (a, b, c): left rows [0, 1, -1], right rows [-1, 0, 1].
  const scope = connectionScope({
    rows: 3, rowConnection: Int32Array.from([0, 1, 2]),
    slotScopes: [left, right], slotRows: [Int32Array.from([0, 1, -1]), Int32Array.from([-1, 0, 1])],
  });
  assert.equal(scope.identity, undefined, "no implicit selection owner across tables");
  assert.equal(scope.has("group"), false);
  assert.equal(scope.ambiguous("group"), true);
  assert.equal(scope.ambiguous("weight"), true, "in one table only: still never silently chosen");
  const source = scope.get("source.group"), target = scope.get("target.group");
  assert.deepEqual([source.categories, Array.from(await source.codes.ref.data())], [["p", "q"], [0, 1, -1]]);
  assert.deepEqual([target.categories, Array.from(await target.codes.ref.data())], [["q", "r"], [-1, 0, 1]]);
  assert.deepEqual(Array.from(await scope.get("target.weight").ref.data()).map((v) => (Number.isNaN(v) ? null : v)), [null, 2, 3]);
  assert.equal(scope.resolve("red"), "red");
  scope.dispose(); left.dispose(); right.dispose();
});

test("hostColumnValues and tokenValue", async () => {
  assert.deepEqual(await hostColumnValues({ codes: [1, -1, 0], categories: ["a", "b"] }), ["b", null, "a"]);
  assert.deepEqual(await hostColumnValues(Float32Array.from([1, 2])), [1, 2]);
  const device = np.array([3, 4]);
  assert.deepEqual(await hostColumnValues(device), [3, 4]);
  device.dispose();
  assert.equal(tokenValue("number:3"), 3);
  assert.equal(tokenValue("string:3"), "3");
  assert.equal(tokenValue("boolean:false"), false);
  assert.equal(tokenValue("row:4"), "row:4");
});

// A fake endpoint: an options node that maps x through [0, 10] -> [0, 100] and y through
// [0, 10] -> [0, 50], with a published frame (`shown`). Its published arrays are the test's,
// as namedMark's are its own: `releasePublished()` disposes them once the consumer is gone.
const RENDERER = {};
const published = [], own = (array) => (published.push(array), array);
const releasePublished = () => published.splice(0).forEach((array) => array.dispose());
function endpoint(registry, { label, position, keys, owner = { id: label }, kind = "Anchor", extra = {} }) {
  const values = { xbounds: [0, 10], xrange: [0, 100], ybounds: [0, 10], yrange: [0, 50], zbounds: [0, 1], zrange: [0, 1] };
  const options = { presentation: { label }, defaults: {}, get: (key) => values[key] };
  const mark = { options, renderer: RENDERER };
  const scope = { has: (key) => key === "k", get: () => keys, keys: () => ["k"] };
  const entry = { kind, name: label, label, mark, options, frameOptions: null, renderer: RENDERER, scopes: [], ...extra };
  const stop = registry.register(entry);
  const publish = (next = {}) => registry.update(entry, { shown: {
    props: { position: own(np.array(next.position ?? position)) }, scope: { ...scope, get: () => next.keys ?? keys },
    keyTokens: null, tokensRequested: true, owner, ownerId: owner.id, aggregate: false, lifecycle: false,
  } });
  publish();
  return { entry, mark, handle: { getMark: () => mark }, publish, stop, values };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("createConnectionConsumer: explicit keys, pending, frame changes re-gather without re-matching", async () => {
  const registry = createEndpointRegistry(), states = [];
  let work = Promise.resolve();
  const consumer = createConnectionConsumer({
    kind: "Segments", renderer: RENDERER, registry,
    onState: (state) => states.push(state), track: (promise) => (work = promise),
  });
  // Pending: the second endpoint is not bound yet (a forward reference).
  const a = endpoint(registry, { label: "a", position: [[1, 1], [2, 2], [3, 3]], keys: ["x", "y", "z"] });
  consumer.update(connect(a.handle, undefined, { key: "k" }));
  await work;
  assert.deepEqual(states.map((state) => Object.keys(state)), [["pending"]]);
  const b = endpoint(registry, { label: "b", position: [[9, 9], [8, 8]], keys: ["z", "x"] });
  consumer.update(connect(a.handle, b.handle, { key: "k" }));
  await settle(); await work;
  const result = states.at(-1).result;
  assert.ok(result, JSON.stringify(states.at(-1).error?.message));
  // Connections in first-appearance order x, y, z; y has no partner (its row is NaN).
  assert.deepEqual(result.keys, ["string:x", "string:y", "string:z"]);
  const start = await rows(result.props.start), end = await rows(result.props.end);
  assert.deepEqual(start.map((row) => row.map((v) => Math.round(v))), [[10, 5, 0], [20, 10, 0], [30, 15, 0]]);
  assert.deepEqual(end.map((row) => row.map((v) => (Number.isNaN(v) ? null : Math.round(v)))), [[80, 40, 0], [null, null, null], [90, 45, 0]]);
  assert.equal(consumer.counters.matches, 1);
  // Structurally equal descriptors (a re-render) do not re-run.
  const runs = consumer.counters.runs;
  consumer.update(connect(a.handle, b.handle, { key: "k" }));
  await work;
  assert.equal(consumer.counters.runs, runs);
  // A frame change re-gathers with the new mapping and keeps the match.
  const gathers = consumer.counters.gathers;
  a.values.xrange = [0, 200];
  registry.update(a.entry, { frame: "zoomed" });
  await settle(); await work;
  assert.equal(consumer.counters.matches, 1, "frame changes never re-match");
  assert.equal(consumer.counters.gathers, gathers + 1);
  assert.deepEqual((await rows(states.at(-1).result.props.start))[0].map(Math.round), [20, 5, 0]);
  // New data re-matches; a duplicate key is an error naming the endpoint.
  b.publish({ keys: ["z", "z"] });
  await settle(); await work;
  assert.equal(states.at(-1).error?.message, duplicateKeyError("z", "b"));
  // The result on screen is kept (the error state carries it).
  assert.ok(states.at(-1).result);
  // Removing an endpoint that resolved before leaves its slot missing: the pairs are NaN.
  b.stop();
  await settle(); await work;
  const removed = states.at(-1).result;
  assert.ok(removed);
  assert.ok((await rows(removed.props.end)).every((row) => row.every(Number.isNaN)));
  consumer.dispose(); releasePublished();
});

test("createConnectionConsumer: structural errors name the endpoint and the fix", async () => {
  const registry = createEndpointRegistry(), states = [];
  let work = Promise.resolve();
  const consumer = createConnectionConsumer({
    kind: "Line", renderer: RENDERER, registry,
    onState: (state) => states.push(state), track: (promise) => (work = promise),
  });
  const run = async (descriptor) => { consumer.update(descriptor); await settle(); await work; return states.at(-1); };
  const a = endpoint(registry, { label: "a", position: [[1, 1]], keys: ["x"] });
  // Another View's mark.
  const foreign = { getMark: () => ({ options: a.options, renderer: {} }) };
  assert.equal((await run(connect(a.handle, foreign, { key: "k" }))).error.message, otherViewError("Line", "endpoint 2"));
  // A mark that cannot be an endpoint (a Line): its accepted binding names its kind.
  const lineMark = { renderer: RENDERER, view: { marks: createViewMarks() } };
  lineMark.view.marks.publish(lineMark, emptyBinding({ kind: "Line" }));
  const line = { getMark: () => lineMark };
  assert.equal((await run(connect(a.handle, line, { key: "k" }))).error.message, deferredEndpointError("Line", "Line"));
  // A connection-backed endpoint.
  const backed = endpoint(registry, { label: "backed", position: [[1, 1]], keys: ["x"], kind: "Segments", extra: { connectionBacked: true } });
  assert.equal((await run(connect(a.handle, endpointDescriptor({ handle: backed.handle, at: "start" }), { key: "k" }))).error.message,
    connectionBackedError("backed"));
  // A repeated definition among other endpoints; one mark alone.
  const repeated = [0, 1].map((i) => endpoint(registry, { label: "cell", position: [[i, i]], keys: ["x"], extra: { cell: { key: `c${i}`, ordinal: [i] } } }));
  repeated[1].entry.options = repeated[0].entry.options;
  repeated[1].entry.definition = repeated[0].entry.definition;
  assert.equal((await run(connect(a.handle, repeated[0].handle, { key: "k" }))).error.message, repeatedEndpointError("cell", 2));
  assert.equal((await run(connect(a.handle, { key: "k" }))).error.message, singleEndpointError("a"));
  consumer.dispose(); releasePublished();
});

test("createConnectionConsumer: a mount outside any cell is itself; one repeated endpoint alone connects its cells", async () => {
  const registry = createEndpointRegistry(), states = [];
  let work = Promise.resolve();
  const consumer = createConnectionConsumer({
    kind: "Line", renderer: RENDERER, registry,
    onState: (state) => states.push(state), track: (promise) => (work = promise),
  });
  const run = async (descriptor) => { consumer.update(descriptor); await settle(); await work; return states.at(-1); };
  // Unnamed marks in Frames written in an {#each}: one definition key, no cell, three mounts.
  const axes = [0, 1, 2].map((i) => endpoint(registry, { label: "Sprites 1", position: [[i, 1], [i, 2]], keys: ["x", "y"] }));
  axes.slice(1).forEach(({ entry }) => { entry.options = axes[0].entry.options; entry.definition = axes[0].entry.definition; });
  // Each vertex's x is its own mount's (x maps [0, 10] -> [0, 100]): 0, 10, 20 per connection.
  const xs = async (state) => (await rows(state.result.props.position)).map((row) => (Number.isNaN(row[0]) ? null : Math.round(row[0])));
  const wide = await run(connect(...axes.map((axis) => axis.handle), { key: "k" }));
  assert.ok(wide.result, wide.error?.message);
  assert.deepEqual(await xs(wide), [0, 10, 20, null, 0, 10, 20]);
  // Only the mounts in use were asked for key tokens.
  assert.ok(axes.every(({ entry }) => registry.demanded(entry)));
  assert.equal(registry.demanded(axes[0].entry.definition), false);
  // Swapping two of them re-matches (their cache keys differ although they share a definition).
  const matches = consumer.counters.matches;
  const swapped = await run(connect(axes[1].handle, axes[0].handle, axes[2].handle, { key: "k" }));
  assert.deepEqual(await xs(swapped), [10, 0, 20, null, 10, 0, 20]);
  assert.equal(consumer.counters.matches, matches + 1);
  // A mark in cells, alone and without order, connects every cell's mount in cell order.
  const cells = [1, 0].map((i) => endpoint(registry, { label: "values", position: [[i, i]], keys: ["x"], extra: { cell: { key: `c${i}`, ordinal: [i] } } }));
  cells[1].entry.options = cells[0].entry.options;
  cells[1].entry.definition = cells[0].entry.definition;
  const facet = await run(connect(cells[0].handle, { key: "k" }));
  assert.ok(facet.result, facet.error?.message);
  assert.deepEqual(await xs(facet), [0, 10]);
  assert.deepEqual(facet.result.slots.map((slot) => slot.cell), ["c0", "c1"]);
  consumer.dispose(); releasePublished();
  assert.ok(axes.every(({ entry }) => !registry.demanded(entry)), "released with the consumer");
});

test("createConnectionConsumer: a Line layout and the picking payload", async () => {
  const registry = createEndpointRegistry(), states = [];
  let work = Promise.resolve();
  const consumer = createConnectionConsumer({
    kind: "Line", renderer: RENDERER, registry,
    onState: (state) => states.push(state), track: (promise) => (work = promise),
  });
  const slots = ["p", "q", "r"].map((label, i) => endpoint(registry, { label, position: [[i, 0], [i, 1]], keys: [1, 2] }));
  consumer.update(connect(...slots.map((slot) => slot.handle), { key: "k" }));
  await settle(); await work;
  const result = states.at(-1).result;
  // Two connections of three slots, a NaN separator between them: 2 * 4 - 1 rows.
  assert.deepEqual(result.props.position.shape, [7, 3]);
  const position = await rows(result.props.position);
  assert.ok(position[3].every(Number.isNaN), "separator row");
  assert.deepEqual(position[4].map(Math.round), [0, 5, 0]);
  // Segment 1 of connection 0 runs from slot q to slot r.
  const event = connectionEvent(result, 1);
  assert.equal(event.index, 0);
  assert.equal(event.key, 1);
  assert.deepEqual([event.source.label, event.target.label, event.pair.map((s) => s.label)], ["p", "r", ["q", "r"]]);
  assert.equal(event.source.row, 0);
  assert.equal(connectionEvent(result, 3), null, "a separator is no connection");
  assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
  consumer.dispose(); releasePublished();
});

test("createConnectionConsumer: pixel offsets of a displaced point beside an endpoint without offsets", async () => {
  const registry = createEndpointRegistry(), states = [];
  let work = Promise.resolve();
  const consumer = createConnectionConsumer({
    kind: "Segments", renderer: RENDERER, registry,
    onState: (state) => states.push(state), track: (promise) => (work = promise),
  });
  // A Dodge-displaced point mark (dy per row) connected to an Anchor (no offsets).
  const points = endpoint(registry, { label: "points", position: [[1, 1], [1, 1], [1, 1]], keys: [1, 2, 3], kind: "Points" });
  const shown = points.entry.shown;
  registry.update(points.entry, { shown: { ...shown, props: { ...shown.props, dy: own(np.array([-12, 0, 12])) } } });
  const ends = endpoint(registry, { label: "ends", position: [[5, 2], [5, 5], [5, 8]], keys: [1, 2, 3] });
  consumer.update(connect(points.handle, ends.handle, { key: "k" }));
  await settle(); await work;
  const state = states.at(-1);
  assert.equal(state.error?.message, undefined);
  assert.deepEqual(await rows(state.result.offsets.startOffset), [[0, -12], [0, 0], [0, 12]]);
  assert.deepEqual(await rows(state.result.offsets.endOffset), [[0, 0], [0, 0], [0, 0]]);
  assert.deepEqual(state.result.live.slots.map((slot) => slot.offsets), [true, false]);
  consumer.dispose(); releasePublished();
});
