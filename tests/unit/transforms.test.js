import { registerFirstPartyPlugins } from "../../src/lib/plugins/index.js";
registerFirstPartyPlugins();
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import {
  runTransform,
  validateBinEdges,
} from "../../src/lib/plot/utils/transforms.js";
import { partitionFacets } from "../../src/lib/plot/utils/facets.js";
import { rectangleArrays } from "../../src/lib/plot/utils/rectangles.js";
import { partitionSeries, seriesBrush, seriesConstraint } from "../../src/lib/plot/utils/series.js";
import { selection } from "../../src/lib/plot/utils/interaction.js";
import { add, square, mean, variance, first, last, sum, count, min } from "../../src/lib/plot/utils/expressions.js";
import { resolveColumn } from "../../src/lib/plot/interaction/channelWriteback.js";
import { col, literal } from "../../src/lib/plot/utils/names.js";
import { STACK_OFFSETS, STACK_ORDERS } from "../../src/lib/plot/utils/transforms/stack.js";
import * as d3 from "d3";
import { typedColumn } from "../../src/lib/plot/utils/columns.js";
const data = (value) => {
  const s = createDataScope();
  s.update(value);
  return s;
};
async function values(view, key) {
  const a = view.get(key)?.codes ?? view.get(key);
  return a.data ? Array.from(await a.ref.data()) : a;
}
test("row-changing transform definitions require an order and release failed work", async () => {
  const {runDefinition} = await import("../../src/lib/plot/utils/transforms/runner.js");
  const {numpy: np} = await import("@hmplot/jax");
  const source = data({x: [1, 2]});
  try {
    for (const output of ["reordered", "subset", "newRows"]) {
      let released = 0;
      await assert.rejects(runDefinition("BrokenTransform", {
        reads: "rows", output,
        run(input, config, context) {
          context.own(np.ones([input.length]));
          context.cleanup(() => released++);
          return {};
        },
      }, source, {}, {maxBytes: Infinity, runTransform}), /BrokenTransform: pass an order buffer/);
      assert.equal(released, 1);
      assert.deepEqual(source.get("x"), [1, 2]);
    }
  } finally { source.dispose(); }
});

test("Shift preserves rows and missing values, supports signed offsets and renamed UTC calendar outputs", async () => {
  const source = data({ x: [3, NaN, 1] });
  const shifted = await runTransform("Shift", source, { field: "x", interval: -2 });
  assert.deepEqual(await values(shifted, "shifted"), [1, NaN, -1]);
  assert.deepEqual(await values(shifted, "original"), [3, NaN, 1]);
  assert.equal(shifted.length, source.length);
  assert.equal(shifted.columnIdentity("original"), source.columnIdentity("x"));
  shifted.dispose(); source.dispose();
  const dates = data({ date: typedColumn([new Date("2024-02-29T12:00Z"), new Date("2024-01-31T12:00Z"), null], { type: "datetime", unit: "ms" }) });
  const origin = dates.metadata("date").origin;
  for (const [interval, expected] of [["1 year", ["2025-03-01T12:00Z", "2025-01-31T12:00Z"]], ["-1 month", ["2024-01-29T12:00Z", "2023-12-31T12:00Z"]], ["7 days", ["2024-03-07T12:00Z", "2024-02-07T12:00Z"]]]) {
    const view = await runTransform("Shift", dates, { field: "date", interval, as: { shifted: "later", original: "now" } });
    const offsets = await values(view, "later");
    assert.equal(view.columnIdentity("now"), dates.columnIdentity("date"));
    assert.deepEqual(Array.from(offsets.slice(0, 2)), expected.map(value => Date.parse(value) - origin));
    assert.ok(Number.isNaN(offsets[2]));
    assert.deepEqual(view.metadata("later"), dates.metadata("date"));
    assert.deepEqual(view.metadata("now"), dates.metadata("date"));
    view.dispose();
  }
  dates.dispose();
  const empty = data({ x: typedColumn([], { type: "numeric" }) });
  const view = await runTransform("Shift", empty, { field: "x", interval: 0 });
  assert.deepEqual(await values(view, "shifted"), []);
  view.dispose();
  for (const interval of [NaN, Infinity, "1 fortnight", "0.5 month", {}])
    await assert.rejects(runTransform("Shift", empty, { field: "x", interval }), /Shift:/);
  await assert.rejects(runTransform("Shift", empty, { field: "x", interval: "month" }), /datetime/);
  await assert.rejects(runTransform("Shift", empty, { field: "missing", interval: 1 }), /missing/);
  await assert.rejects(runTransform("Shift", empty, { field: "x", interval: 1, as: { shifted: "a", original: "a" } }), /distinct/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(runTransform("Shift", empty, { field: "x", interval: 1 }, { signal: abort.signal }), /Canceled/);
  empty.dispose();
});
test("invalid table replacement retains columns and version", () => {
  const s = data({ x: [1, 2], y: [3, 4] });
  const v = s.version;
  assert.throws(() => s.update({ x: [1], y: [2, 3] }), /rows/);
  assert.equal(s.version, v);
  assert.deepEqual(s.get("x"), [1, 2]);
  s.dispose();
});
test("Calculate evaluates assignments simultaneously and preserves source rows", async () => {
  const s = data({ x: [1, 2, 3] });
  const v = await runTransform("Calculate", s, { columns: { x: add("x", 1), squared: square("x") } });
  assert.deepEqual(await values(v, "x"), [2, 3, 4]);
  assert.deepEqual(await values(v, "squared"), [1, 4, 9]);
  assert.deepEqual(await values(v, "@selected"), [0, 0, 0]);
  v.dispose(); s.dispose();
});
test("bin boundaries, empty bins, and invalid observations", async () => {
  const s = data({ x: [0, 1, 2, 3, 4, NaN, -1] });
  const v = await runTransform("Bin", s, { x: "x", bins: [0, 1, 2, 3, 4] });
  assert.deepEqual(await values(v, "count"), [1, 1, 1, 2]);
  assert.deepEqual(await values(v, "x"), [0.5, 1.5, 2.5, 3.5]);
  v.dispose();
  s.dispose();
  assert.throws(() => validateBinEdges([1, 0]));
});
test("one-pass bin aggregation matches a per-bin reference", async () => {
  // Values on every edge (0.1 steps are inexact in binary), NaN, and out-of-range rows.
  const x = [...Array.from({ length: 11 }, (_, i) => i / 10), 0.05, 0.95, NaN, -0.2, 1.3, 0.3, 0.7];
  const w = x.map((_, i) => (i % 5 === 4 ? NaN : i));
  const reference = (edges, xs, ws) => edges.slice(0, -1).map((low, b) => {
    const high = edges[b + 1], last = b === edges.length - 2;
    const rows = xs.map((v, i) => i).filter((i) => Number.isFinite(xs[i]) && xs[i] >= low && (xs[i] < high || (last && xs[i] <= high)));
    const finite = rows.filter((i) => Number.isFinite(ws[i]));
    const sum = finite.reduce((t, i) => t + ws[i], 0);
    return { count: rows.length, n: finite.length, sum, mean: finite.length ? sum / finite.length : NaN,
      min: finite.length ? Math.min(...finite.map((i) => ws[i])) : NaN };
  });
  const close = (a, b) => a.map((v, i) => Number.isNaN(b[i]) ? assert.ok(Number.isNaN(v), `${i}: ${v}`) : assert.ok(Math.abs(v - b[i]) < 1e-4, `${i}: ${v} vs ${b[i]}`));
  for (const edges of [Array.from({ length: 11 }, (_, i) => i / 10), [0, 0.15, 0.5, 0.9, 1]]) {
    const s = data({ x, w });
    const v = await runTransform("Bin", s, { x: "x", bins: edges,
      columns: { total: sum("w"), average: mean("w"), finite: count("w"), low: min("w") } });
    const expected = reference(edges, x, w);
    assert.deepEqual(await values(v, "count"), expected.map((e) => e.count), `counts for ${edges}`);
    close(await values(v, "total"), expected.map((e) => e.sum));
    close(await values(v, "average"), expected.map((e) => e.mean));
    close(await values(v, "finite"), expected.map((e) => e.n));
    close(await values(v, "low"), expected.map((e) => e.min));
    v.dispose(); s.dispose();
  }
  // 2D counts: codes combine both axes.
  const s = data({ x: [0, 0.6, 0.6, 1, 0.2], y: [0, 0, 0.9, 1, NaN] });
  const v = await runTransform("Bin", s, { x: "x", y: "y", bins: [0, 0.5, 1] });
  assert.deepEqual(await values(v, "count"), [1, 1, 0, 2]);
  v.dispose(); s.dispose();
});
test("bin weight scales counts, sums, and means; other reducers keep weighted-in rows", async () => {
  const s = data({ x: [0, 0.2, 0.6, 0.8, 0.9], w: [1, 0, 2, 1, NaN], v: [10, 20, 30, 40, 50] });
  const v = await runTransform("Bin", s, { x: "x", bins: [0, 0.5, 1], weight: "w",
    columns: { total: sum("v"), average: mean("v") } });
  assert.deepEqual(await values(v, "count"), [1, 3]); // NaN weight counts as 0
  assert.deepEqual(await values(v, "total"), [10, 100]);
  assert.deepEqual((await values(v, "average")).map((a) => +a.toFixed(4)), [10, 33.3333]);
  v.dispose();
  const low = await runTransform("Bin", s, { x: "x", bins: [0, 0.5, 1], weight: "w", columns: { low: min("v") } });
  assert.deepEqual(await values(low, "low"), [10, 30]);
  low.dispose();
  await assert.rejects(runTransform("Bin", s, { x: "x", bins: 2, weight: 3 }), /Bin weight must name a column/);
  s.dispose();
});
test("assignment preserves rows and reports invalid membership", async () => {
  const s = data({ x: [0, 1, 2, 3] });
  const v = await runTransform("Bin", s, {
    x: "x",
    bins: [0, 1, 2],
    mode: "assign",
  });
  assert.deepEqual(await values(v, "binX"), [0, 1, 1, -1]);
  assert.deepEqual(await values(v, "x"), [0, 1, 2, 3]);
  v.dispose();
  s.dispose();
});
test("2D bin orientation and named reductions", async () => {
  const s = data({ x: [0, 1, 0, 1], y: [0, 0, 1, 1], v: [1, 2, 3, 4] });
  const v = await runTransform("Bin", s, {
    x: "x",
    y: "y",
    bins: { x: [0, 0.5, 1], y: [0, 0.5, 1] },
    columns: { total: sum("v") },
  });
  assert.deepEqual(await values(v, "total"), [1, 2, 3, 4]);
  v.dispose();
  s.dispose();
});
test("a bare column in Filter's where keeps the rows where it is true", async () => {
  const s = data({ flag: [true, false, true, false], n: [0, 2, 0, -1], id: [0, 1, 2, 3], kind: ["a", "b", "a", "b"] });
  // where="flag", col("flag") (a Python hm.col.flag arrives as its name), and a numeric column.
  for (const [where, ids] of [["flag", [0, 2]], [col("flag"), [0, 2]], ["n", [1, 3]], [["flag", "n"], []]]) {
    const filtered = await runTransform("Filter", s, { where });
    assert.deepEqual(await values(filtered, "id"), ids, JSON.stringify(where));
    filtered.dispose();
  }
  await assert.rejects(() => runTransform("Filter", s, { where: "kind" }),
    { message: 'Filter where="kind": a text column is not true or false; compare it to a value (col.kind == "a").' });
  s.dispose();
});
test("stable sorting, numeric filtering, and deterministic shuffle retain provenance", async () => {
  const s = data({ x: [2, 1, 2, NaN], id: [0, 1, 2, 3] });
  const sorted = await runTransform("Sort", s, { by: "x", order: "desc" });
  assert.deepEqual(await values(sorted, "id"), [0, 2, 1, 3]);
  const filtered = await runTransform("Filter", sorted, {
    where: { field: "x", op: "gte", value: 2 },
  });
  assert.deepEqual(await values(filtered, "id"), [0, 2]);
  const ids = filtered.sourceIndices();
  assert.deepEqual(Array.from(await ids.data()), [0, 2]);
  // Sample order="random" shuffles (TODO 137.3 folded Shuffle in): every row, the seed's order.
  const a = await runTransform("Sample", s, { seed: 42, order: "random" }),
    b = await runTransform("Sample", s, { seed: 42, order: "random" });
  assert.deepEqual(await values(a, "id"), await values(b, "id"));
  assert.deepEqual([...(await values(a, "id"))].sort(), [0, 1, 2, 3]);
  await assert.rejects(() => runTransform("Sample", s, { order: "shuffled" }), /Sample order must be "data" or "random"/);
  [sorted, filtered, a, b].forEach((v) => v.dispose());
  s.dispose();
});
test("group reductions match independent references", async () => {
  const s = data({ group: ["a", "b", "a", "b"], x: [1, 3, 5, 7] });
  const v = await runTransform("Group", s, {
    by: "group",
    columns: {
      mean: mean("x"),
      variance: variance("x"),
      first: first("x"),
      last: last("x"),
    },
  });
  assert.deepEqual(await values(v, "count"), [2, 2]);
  assert.deepEqual(await values(v, "mean"), [3, 5]);
  assert.deepEqual(await values(v, "variance"), [4, 4]);
  assert.deepEqual(await values(v, "first"), [1, 3]);
  assert.deepEqual(await values(v, "last"), [5, 7]);
  v.dispose();
  s.dispose();
});
test("series partitioning preserves first appearance, row order, breaks, and identities", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const s = data({ subject: ["b", "a", "b", "a"] });
  const position = np.array([[0, 0], [1, 1], [2, 2], [3, 3]]);
  const opacity = np.array([0.1, 0.2, 0.3, 0.4]);
  let selected, series;
  const grouped = await partitionSeries("Line", { position, onclick: (event) => { selected = event.instanceId; series = event._seriesRows(); } },
    "subject",
    s,
    { rowOpacity: opacity },
  );
  // A row per input row and per series (TODO 26.8): each series, then its break (missing).
  const output = Array.from(await grouped.props.position.ref.data());
  assert.equal(output.length, 2 * (4 + 2));
  assert.deepEqual(output.slice(0, 4), [0, 0, 2, 2]);
  assert.ok(Number.isNaN(output[4]) && Number.isNaN(output[5]));
  assert.deepEqual(output.slice(6, 10), [1, 1, 3, 3]);
  assert.ok(output.slice(10).every(Number.isNaN));
  // Row opacity (read beside the props) follows the same order, each break 0.
  assert.deepEqual(Array.from(await grouped.opacity.ref.data()).map((v) => +v.toFixed(2)), [0.1, 0.3, 0, 0.2, 0.4, 0]);
  opacity.dispose();
  await grouped.props.onclick({ instanceId: 1 });
  assert.equal(selected, 2);
  // The pick names its series' rows too (TODO 62.1): b is rows 0 and 2.
  assert.deepEqual(series, [0, 2]);
  await grouped.props.onclick({ instanceId: 3 });
  assert.deepEqual([selected, series], [1, [1, 3]]);
  grouped.dispose();
  position.dispose();
  s.dispose();
});
test("same-row Stack updates retain the series topology used by area animation", async () => {
  const s = data({ week: [0, 1, 0, 1], genre: ["a", "a", "b", "b"], plays: [2, 3, 4, 5] });
  const grouped = [], views = [];
  try {
    for (const offset of ["center", "zero"]) {
      const view = await runTransform("Stack", s, { x: "week", y: "plays", series: "genre", offset });
      views.push(view);
      grouped.push(await partitionSeries("Area", { x: s.get("week"), upper: view.get("y1"), lower: view.get("y0") }, "genre", view));
    }
    assert.notEqual(views[0].version, views[1].version);
    assert.equal(grouped[0].props._categoryTopology, grouped[1].props._categoryTopology);
    assert.notDeepEqual(Array.from(await grouped[0].props.upper.ref.data()), Array.from(await grouped[1].props.upper.ref.data()));
    s.update({ week: [0, 1, 0, 1], genre: ["a", "b", "b", "a"], plays: [2, 3, 4, 5] });
    const changed = await partitionSeries("Area", { x: s.get("week"), upper: s.get("plays") }, "genre", s);
    grouped.push(changed);
    assert.notEqual(changed.props._categoryTopology, grouped[0].props._categoryTopology);
  } finally { grouped.forEach((g) => g.dispose()); views.forEach((v) => v.dispose()); s.dispose(); }
});

// TODO 64: a numeric series column ("Line: scope.resolve is not a function" before).
test("series partitioning groups by a numeric column too", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const s = data({ run: new Float32Array([2, 1, 2, 1]) });
  const position = np.array([[0, 0], [1, 1], [2, 2], [3, 3]]);
  const grouped = await partitionSeries("Line", { position }, "run", s);
  assert.deepEqual(Array.from(await grouped.sourceIndex.ref.data()), [0, 2, -1, 1, 3, -1]);
  grouped.dispose();
  position.dispose();
  s.dispose();
});
test("series partitioning reads back only the series count; rows of no series are missing", async () => {
  const { numpy: np, Array: JaxArray } = await import("@hmplot/jax");
  const subject = ["c", "a", null, "c", "b", "a", "c", "b"];
  const s = data({ subject });
  const position = np.array(subject.map((_, i) => [i, 10 * i]));
  const data_ = JaxArray.prototype.data;
  let reads = 0;
  JaxArray.prototype.data = function (...args) { reads++; return data_.apply(this, args); };
  let grouped;
  try { grouped = await partitionSeries("Line", { position }, "subject", s); }
  finally { JaxArray.prototype.data = data_; }
  assert.ok(reads <= 1, `${reads} readbacks`);
  const xs = Array.from(await grouped.props.position.ref.data()).filter((_, i) => i % 2 === 0);
  const rows = Array.from(await grouped.sourceIndex.ref.data());
  // Series in first-seen order (c, a, b), each followed by a break. The missing key is a group of
  // no valid row: its run is empty (a second break in a row), and its row is missing, last.
  // 8 rows + 4 groups.
  const nan = (v) => Number.isNaN(v);
  assert.equal(xs.length, 12);
  assert.deepEqual(xs.slice(0, 3), [0, 3, 6]); assert.ok(nan(xs[3]));
  assert.deepEqual(xs.slice(4, 6), [1, 5]); assert.ok(nan(xs[6]) && nan(xs[7]));
  assert.deepEqual(xs.slice(8, 10), [4, 7]); assert.ok(nan(xs[10]) && nan(xs[11]));
  assert.deepEqual(rows, [0, 3, 6, -1, 1, 5, -1, -1, 4, 7, -1, -1]);
  grouped.dispose(); position.dispose(); s.dispose();
});
// TODO 62.1: a brush over a series mark brushes every row of a series with a row inside, after
// its intervals combine; rows of no series are never brushed through one.
test("a series brush expands the combined intervals to whole series", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const s = data({ subject: ["b", "a", "b", null, "c", "a"], x: [0, 1, 2, 3, 4, 5], y: [5, 0, 5, 5, 0, 5] });
  const rows = async (array) => Array.from(await array.data(), Number);
  // expand borrows its mask and returns a new array.
  const expanded = async (brush, mask) => { try { return await rows(brush.expand(mask)); } finally { mask.dispose(); } };
  const brush = seriesBrush(s, "subject", "Line");
  assert.equal(brush.name, "subject");
  assert.deepEqual(await expanded(brush, np.array([1, 0, 0, 1, 0, 0], { dtype: np.int32 })), [1, 0, 1, 0, 0, 0]);
  assert.deepEqual(await expanded(brush, np.array([0, 0, 0, 0, 1, 1], { dtype: np.int32 })), [0, 1, 0, 0, 1, 1]);
  // Without series the mark is one series: a row in brushes every row.
  const whole = seriesBrush(s, undefined, "Line");
  assert.deepEqual(await expanded(whole, np.array([0, 0, 0, 1, 0, 0], { dtype: np.int32 })), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(await expanded(whole, np.zeros([6], { dtype: np.int32 })), [0, 0, 0, 0, 0, 0]);
  // Through a selection: x in [1, 4] and y in [0, 1] keep rows 1 and 4 (a and c), so a and c.
  const owner = s.identity, resource = selection();
  resource.owner = owner;
  const interval = (field, low, high) => seriesConstraint({ identity: field, name: field, type: "numeric", bounds: [low, high],
    evaluate: () => { const v = np.array(s.get(field)); return np.logicalAnd(v.ref.greaterEqual(low), v.lessEqual(high)).astype(np.int32); },
    release() {} }, brush);
  resource.setConstraints(owner, [interval("x", 1, 4), interval("y", 0, 1)]);
  assert.deepEqual(await rows(resource.mask(owner, 6)), [0, 1, 0, 0, 1, 1]);
  assert.deepEqual(resource.getConstraints(owner).map((value) => [value.series, "expand" in value]), [["subject", false], ["subject", false]]);
  resource.dispose();
  s.dispose();
});
test("summary statistics and seeded bootstrap intervals match references", async () => {
  const s = data({ group: ["b", "b", "a", "a", "a"], value: [2, 4, 1, 3, 5] });
  const analytic = await runTransform("Summary", s, {
    field: "value", by: "group", interval: "normal", confidence: 0.95,
  });
  assert.deepEqual(await values(analytic, "count"), [2, 3]);
  assert.deepEqual(await values(analytic, "estimate"), [3, 3]);
  const sd = await values(analytic, "standardDeviation");
  assert.ok(Math.abs(sd[0] - Math.SQRT2) < 1e-5);
  assert.ok(Math.abs(sd[1] - 2) < 1e-5);
  const lower = await values(analytic, "lower"), upper = await values(analytic, "upper");
  assert.ok(lower.every(Number.isFinite) && upper.every(Number.isFinite));
  const config = { field: "value", by: "group", estimate: "median", interval: "bootstrap", samples: 64, seed: 9 };
  const first = await runTransform("Summary", s, config), second = await runTransform("Summary", s, config);
  assert.deepEqual(await values(first, "estimate"), [3, 3]);
  assert.deepEqual(await values(first, "lower"), await values(second, "lower"));
  assert.deepEqual(await values(first, "upper"), await values(second, "upper"));
  [analytic, first, second].forEach((view) => view.dispose());
  s.dispose();
});
test("density, pivot, fold and sampling", async () => {
  const s = data({ group: ["a", "a", "b", "b"], key: ["u", "v", "u", "v"], x: [0, 1, 2, 3], y: [1, 2, 3, 4] });
  const density = await runTransform("Density", s, { x: "x", by: "group", resolution: 16 });
  assert.equal(density.length, 32);
  const d = await values(density, "density");
  assert.ok(d.every((value) => Number.isFinite(value) && value >= 0));
  const folded = await runTransform("Fold", s, { fields: ["x", "y"] });
  assert.deepEqual(await values(folded, "value"), [0, 1, 2, 3, 1, 2, 3, 4]);
  const pivot = await runTransform("Pivot", s, { field: "key", value: sum("x"), by: "group" });
  assert.deepEqual(await values(pivot, "u"), [0, 2]);
  assert.deepEqual(await values(pivot, "v"), [1, 3]);
  const a = await runTransform("Sample", s, { size: 2, seed: 42 }), b = await runTransform("Sample", s, { size: 2, seed: 42 });
  assert.deepEqual(await values(a, "x"), await values(b, "x"));
  [density, folded, pivot, a, b].forEach((view) => view.dispose());
  s.dispose();
});
test("grouped normalization and finite rolling windows", async () => {
  const s = data({ g: ["a", "b", "a", "b"], x: [1, 3, 5, 7] });
  const v = await runTransform("Normalize", s, { field: "x", by: "g" });
  assert.deepEqual(await values(v, "normalized"), [-1, -1, 1, 1]);
  const w = await runTransform("Window", s, { field: "x", size: 2 });
  assert.deepEqual(await values(w, "smoothed"), [1, 2, 4, 6]);
  v.dispose();
  w.dispose();
  s.dispose();
});
test("stack separates positive and negative totals", async () => {
  const s = data({ g: ["a", "a", "a", "a"], v: [2, -3, 4, -1] });
  const v = await runTransform("Stack", s, { x: "g", y: "v" });
  assert.deepEqual(await values(v, "y0"), [0, -3, 2, -4]);
  assert.deepEqual(await values(v, "y1"), [2, 0, 6, -3]);
  v.dispose();
  s.dispose();
});

// TODO 39.7: Stack offsets and orders against d3.stack. Long rows ({x, s, v}, one per (x, series)
// cell, some cells absent, in shuffled order) become d3's wide table, where an absent cell is NaN.
const D3_OFFSETS = { zero: d3.stackOffsetNone, expand: d3.stackOffsetExpand, center: d3.stackOffsetSilhouette, wiggle: d3.stackOffsetWiggle };
const D3_ORDERS = { none: d3.stackOrderNone, appearance: d3.stackOrderAppearance, asc: d3.stackOrderAscending, desc: d3.stackOrderDescending, insideOut: d3.stackOrderInsideOut, reverse: d3.stackOrderReverse };
const SERIES = ["a", "b", "c", "d", "e"];
const hash = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
function stackRows(xs = 9) {
  const rows = [];
  for (let x = 0; x < xs; x++)
    for (let s = 0; s < SERIES.length; s++)
      if ((x * 7 + s * 3) % 11 !== 4) rows.push({ x, s: SERIES[s], v: (Math.round(hash(x, s) * 90) / 10 + 0.1) * (1 + (s % 3)) });
  return rows.sort((a, b) => hash(a.x * 10 + SERIES.indexOf(a.s), 5) - hash(b.x * 10 + SERIES.indexOf(b.s), 5));
}
/** d3.stack over the finite `rows`: each row's [y0, y1] by its x and series. */
function d3Stack(rows, offset, order, keys = SERIES, d3Offset = D3_OFFSETS[offset]) {
  const xs = [...new Set(rows.map((r) => r.x))].sort((a, b) => a - b);
  const wide = xs.map(() => Object.fromEntries(keys.map((k) => [k, NaN])));
  for (const r of rows) if (Number.isFinite(r.v)) wide[xs.indexOf(r.x)][r.s] = r.v;
  const layers = d3.stack().keys(keys).value((d, k) => d[k]).offset(d3Offset).order(D3_ORDERS[order])(wide);
  const at = new Map();
  for (const layer of layers) layer.forEach((point, j) => at.set(`${xs[j]}|${layer.key}`, point));
  return (r) => at.get(`${r.x}|${r.s}`);
}
const stackTable = (rows, numeric = false) => ({
  x: Float32Array.from(rows, (r) => r.x),
  s: numeric ? Float32Array.from(rows, (r) => SERIES.indexOf(r.s) * 10) : { codes: Int32Array.from(rows, (r) => SERIES.indexOf(r.s)), categories: SERIES },
  v: Float32Array.from(rows, (r) => r.v),
});
/** Each row's [y0, y1] against `expected(row)` ([y0, y1], or NaN for none). */
async function sameStack(view, rows, expected, label) {
  const [y0, y1] = [await values(view, "y0"), await values(view, "y1")];
  assert.equal(y0.length, rows.length, label);
  rows.forEach((r, i) => {
    const [a, b] = expected(r) ?? [NaN, NaN];
    for (const [actual, want] of [[y0[i], a], [y1[i], b]])
      if (Number.isNaN(want)) assert.ok(Number.isNaN(actual), `${label} row ${i}: ${actual}, expected NaN`);
      else assert.ok(Math.abs(actual - want) <= 1e-4 * Math.max(1, Math.abs(want)), `${label} row ${i}: ${actual}, expected ${want}`);
  });
}

test("Stack offsets and orders match d3.stack over categorical and numeric series", async () => {
  const rows = stackRows();
  for (const numeric of [false, true]) {
    const s = data(stackTable(rows, numeric));
    for (const offset of STACK_OFFSETS)
      for (const order of STACK_ORDERS) {
        const v = await runTransform("Stack", s, { x: "x", y: "v", series: "s", offset, order });
        await sameStack(v, rows, d3Stack(rows, offset, order), `${offset} ${order}${numeric ? " (numeric series)" : ""}`);
        v.dispose();
      }
    s.dispose();
  }
});

test("Stack offsets over hidden rows, missing values and series, one group, and negative values", async () => {
  // Hidden rows add nothing: a Filter's rows against d3 over the kept rows.
  const rows = stackRows();
  const s = data(stackTable(rows));
  const kept = await runTransform("Filter", s, { where: { field: "v", op: "gt", value: 3 } });
  const shown = rows.filter((r) => r.v > 3);
  for (const offset of STACK_OFFSETS)
    for (const order of ["none", "insideOut", "desc"]) {
      const v = await runTransform("Stack", kept, { x: "x", y: "v", series: "s", offset, order });
      await sameStack(v, shown, d3Stack(shown, offset, order), `hidden ${offset} ${order}`);
      v.dispose();
    }
  kept.dispose();
  s.dispose();
  // A NaN value is not stacked; a missing series is the last layer.
  const gaps = rows.map((r) => (r.s === "b" && r.x % 2 ? { ...r, v: NaN } : r.s === "c" && r.x % 3 === 0 ? { ...r, s: "missing" } : r));
  const g = data({ ...stackTable(gaps), s: { codes: Int32Array.from(gaps, (r) => SERIES.indexOf(r.s)), categories: SERIES } });
  for (const offset of STACK_OFFSETS) {
    const v = await runTransform("Stack", g, { x: "x", y: "v", series: "s", offset });
    const expected = d3Stack(gaps, offset, "none", [...SERIES, "missing"]);
    await sameStack(v, gaps, (r) => (Number.isFinite(r.v) ? expected(r) : null), `gaps ${offset}`);
    v.dispose();
  }
  g.dispose();
  // No x: one group. wiggle leaves it where zero puts it.
  const one = rows.filter((r) => r.x === 4).map((r) => ({ ...r, x: 0 }));
  const o = data(stackTable(one));
  for (const offset of STACK_OFFSETS) {
    const v = await runTransform("Stack", o, { y: "v", series: "s", offset, order: "asc" });
    await sameStack(v, one, d3Stack(one, offset, "asc"), `one group ${offset}`);
    v.dispose();
  }
  o.dispose();
  // Negative values: zero is d3's diverging offset, expand the same over each group's total
  // magnitude.
  const signed = rows.map((r, i) => ({ ...r, v: i % 3 === 1 ? -r.v : r.v }));
  const n = data(stackTable(signed));
  const magnitude = new Map();
  for (const r of signed) magnitude.set(r.x, (magnitude.get(r.x) ?? 0) + Math.abs(r.v));
  const scaled = signed.map((r) => ({ ...r, v: r.v / magnitude.get(r.x) }));
  for (const [offset, reference] of [["zero", d3Stack(signed, "zero", "reverse", SERIES, d3.stackOffsetDiverging)],
    ["expand", d3Stack(scaled, "zero", "reverse", SERIES, d3.stackOffsetDiverging)]]) {
    const v = await runTransform("Stack", n, { x: "x", y: "v", series: "s", offset, order: "reverse" });
    await sameStack(v, signed, reference, `signed ${offset}`);
    v.dispose();
  }
  n.dispose();
});

test("Stack offsets and orders are the Python API's", async () => {
  const { readFileSync } = await import("node:fs");
  const { Stack } = JSON.parse(readFileSync(new URL("../../python/hmplot/signatures.json", import.meta.url), "utf8"));
  const literals = (type) => [...type.matchAll(/"(\w+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(literals(Stack.offset), [...STACK_OFFSETS].sort());
  assert.deepEqual(literals(Stack.order), [...STACK_ORDERS].sort());
});

test("Stack offset and order errors", async () => {
  const s = data({ x: [0, 0, 1, 1], g: ["a", "b", "a", "b"], v: [1, -2, 3, 4] });
  const failure = (config) => runTransform("Stack", s, { x: "x", y: "v", ...config });
  for (const offset of ["center", "wiggle"])
    await assert.rejects(failure({ series: "g", offset }), {
      message: `Stack offset "${offset}" needs non-negative values, but column "v" has a negative value. Filter out the negative rows, or use offset "zero" or "expand".`,
    });
  // A negative value the Filter hides is not stacked.
  const kept = await runTransform("Filter", s, { where: { field: "v", op: "gt", value: 0 } });
  const v = await runTransform("Stack", kept, { x: "x", y: "v", series: "g", offset: "center" });
  assert.deepEqual(await values(v, "y0"), [-0.5, -3.5, -0.5]);
  v.dispose();
  kept.dispose();
  await assert.rejects(failure({ offset: "silhouette" }), {
    message: 'Unknown Stack offset "silhouette": use "zero", "expand", "center", "wiggle".',
  });
  await assert.rejects(failure({ series: "g", order: "largest" }), {
    message: 'Unknown Stack order "largest": use a list of categories, or "none", "appearance", "asc", "desc", "insideOut", "reverse".',
  });
  await assert.rejects(failure({ offset: "wiggle" }), {
    message: 'Stack offset "wiggle" needs series: the layers it moves are the series.',
  });
  await assert.rejects(failure({ order: "insideOut" }), {
    message: 'Stack order "insideOut" needs series: it sorts the series.',
  });
  s.dispose();
  // Limits on the (x, series) table: its size, and insideOut's steps.
  const names = Array.from({ length: 3400 }, (_, i) => `s${i}`);
  const wide = data({ x: Float32Array.from({ length: 5000 }, (_, i) => i), v: new Float32Array(5000).fill(1),
    g: { codes: Int32Array.from({ length: 5000 }, (_, i) => i % 3400), categories: names } });
  await assert.rejects(runTransform("Stack", wide, { x: "x", y: "v", series: "g", offset: "wiggle" }), {
    code: "limit.stackPairs",
    message: 'Stack: offset "wiggle", which totals every (x, series) pair, needs 17,005,000 pairs; the limit is 16,777,216 pairs. Stack fewer x values (5,000) or series (3,400).',
  });
  await assert.rejects(runTransform("Stack", wide, { y: "v", series: "g", order: "insideOut" }), {
    code: "limit.stackInsideOut",
    message: 'Stack: order "insideOut" (it places series one at a time) needs 3,400 series; the limit is 1,024 series. Use order "asc" or "desc", or fewer series in "g".',
  });
  wide.dispose();
});
test("hex bins conserve finite observations", async () => {
  const s = data({ x: [0, 0, 1, 2, NaN], y: [0, 0, 1, 2, 0] });
  const v = await runTransform("Hexbin", s, { x: "x", y: "y", radius: 1 });
  assert.equal(
    (await values(v, "count")).reduce((a, b) => a + b, 0),
    4,
  );
  v.dispose();
  s.dispose();
});
test("matrix facets preserve empty intersections and shared categories", async () => {
  const s = data({ a: ["a", "a", "b"], b: ["x", "y", "x"], v: [1, 2, 3] });
  const p = await partitionFacets(s, { row: "a", column: "b" });
  assert.equal(p.cells.length, 4);
  assert.deepEqual(
    p.cells.map((c) => c.view.length),
    [1, 1, 1, 0],
  );
  assert.equal(p.cells[0].view.scale("a"), p.cells[2].view.scale("a"));
  p.dispose();
  s.dispose();
});
test("a Facet by a Fold's key gives one cell per field over the source rows, like Pairs", async () => {
  const s = data({ id: [1, 2, 3], species: ["r", "g", "b"], a: [1, 2, 3], b: [30, 20, 10], c: [5, 7, 6] });
  const folded = await runTransform("Fold", s, { fields: ["a", "b", "c"] });
  const p = await partitionFacets(folded, { column: "key" });
  assert.deepEqual(p.cells.map((c) => [c.key, c.row, c.column, c.label]), [
    ['[null,"a"]', null, "a", "a"], ['[null,"b"]', null, "b", "b"], ['[null,"c"]', null, "c", "c"]]);
  assert.equal(p.columns, 3);
  for (const [i, cell] of p.cells.entries()) {
    const field = cell.column, view = cell.view;
    // The value column IS the field: same column, same identity, one row per observation.
    assert.equal(view.length, 3);
    assert.equal(view.get("value"), s.get(field));
    assert.deepEqual(view.fieldIdentity, { value: field });
    assert.equal(view.columnIdentity("value"), s.columnIdentity(field));
    assert.equal(view.identityRows, true);
    // The key names the cell's field on every row, with the Fold's categories and identity.
    assert.deepEqual(await values(view, "key"), [i, i, i]);
    assert.deepEqual(view.get("key").categories, ["a", "b", "c"]);
    assert.equal(view.columnIdentity("key"), folded.columnIdentity("key"));
    // Other source columns stay available.
    assert.deepEqual(view.get("species"), ["r", "g", "b"]);
    assert.equal(view.columnIdentity("species"), s.columnIdentity("species"));
  }
  assert.deepEqual(folded.scale("key").domain, ["a", "b", "c"]);
  p.dispose();
  // The facet order picks and orders the fields; a value that is not a field is an empty cell.
  const ordered = await partitionFacets(folded, { column: "key", columnOrder: ["c", "a", "z"] });
  assert.deepEqual(ordered.cells.map((c) => [c.column, c.view.length]), [["c", 3], ["a", 3], ["z", 0]]);
  assert.equal(ordered.cells[0].view.get("value"), s.get("c"));
  assert.deepEqual(await values(ordered.cells[1].view, "key"), [0, 0, 0]);
  ordered.dispose();
  // row= with wrap works the same way.
  const rows = await partitionFacets(folded, { row: "key", wrap: 2 });
  assert.deepEqual(rows.cells.map((c) => [c.key, c.row, c.column]), [
    ['["a",null]', "a", null], ['["b",null]', "b", null], ['["c",null]', "c", null]]);
  assert.equal(rows.columns, 2);
  assert.equal(rows.cells[1].view.columnIdentity("value"), s.columnIdentity("b"));
  rows.dispose();
  // Renamed outputs alias the same way.
  const renamed = await runTransform("Fold", s, { fields: ["a", "b"], as: { key: "field", value: "measurement" } });
  const named = await partitionFacets(renamed, { column: "field" });
  assert.equal(named.cells[1].view.get("measurement"), s.get("b"));
  assert.equal(named.cells[1].view.columnIdentity("measurement"), s.columnIdentity("b"));
  assert.deepEqual(await values(named.cells[1].view, "field"), [1, 1, 1]);
  named.dispose();
  renamed.dispose();
  folded.dispose();
  s.dispose();
});
// TODO 64: `as` renames once. Fold, Summary and Density name their outputs by `as`
// themselves; the runner renamed them again, so a name that is another output's lost a column.
test("as renames a transform's outputs once, even to another output's name", async () => {
  const s = data({ g: ["p", "q", "p", "q"], a: [1, 2, 3, 4], b: [5, 6, 7, 9] });
  const folded = await runTransform("Fold", s, { fields: ["a", "b"], as: { key: "value", value: "amount" } });
  assert.deepEqual(folded.get("value").categories, ["a", "b"]);
  assert.deepEqual(await values(folded, "amount"), [1, 2, 3, 4, 5, 6, 7, 9]);
  folded.dispose();
  const summary = await runTransform("Summary", s, { field: "b", by: "g", interval: "deviation", as: { estimate: "lower", lower: "estimate" } });
  assert.deepEqual(await values(summary, "lower"), [6, 7.5]);
  assert.ok((await values(summary, "estimate")).every((low, i) => low < [6, 7.5][i]));
  summary.dispose();
  const density = await runTransform("Density", s, { x: "a", resolution: 4, as: { x: "density", density: "d" } });
  assert.deepEqual([density.has("density"), density.has("d"), density.has("x")], [true, true, false]);
  density.dispose();
  s.dispose();
});
test("a Facet over a Fold falls back to folded rows with a step in between or a second field", async () => {
  const s = data({ id: [1, 2, 3], species: ["r", "g", "b"], a: [1, 2, 3], b: [30, 20, 10] });
  const folded = await runTransform("Fold", s, { fields: ["a", "b"] });
  // Fold > Filter > Facet: the cells hold the filtered folded rows, and value stays the Fold's.
  const filtered = await runTransform("Filter", folded, { where: { field: "value", op: "gte", value: 2 } });
  assert.equal(filtered.fold, undefined);
  const p = await partitionFacets(filtered, { column: "key" });
  assert.deepEqual(p.cells.map((c) => c.view.length), [2, 3]);
  assert.deepEqual(await values(p.cells[0].view, "value"), [2, 3]);
  assert.equal(p.cells[0].view.fieldIdentity, undefined);
  assert.equal(p.cells[0].view.columnIdentity("value"), folded.columnIdentity("value"));
  assert.notEqual(p.cells[0].view.columnIdentity("value"), s.columnIdentity("a"));
  p.dispose();
  // A second facet field partitions the folded rows too: one row per (species, field).
  const matrix = await partitionFacets(folded, { row: "species", column: "key" });
  assert.equal(matrix.cells.length, 6);
  assert.deepEqual(matrix.cells.map((c) => c.view.length), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(await values(matrix.cells[1].view, "value"), [30]);
  matrix.dispose();
  // So does a facet field other than the key.
  const bySpecies = await partitionFacets(folded, { column: "species" });
  assert.deepEqual(bySpecies.cells.map((c) => c.view.length), [2, 2, 2]);
  bySpecies.dispose();
  // A disposed Fold drops its descriptor with its source.
  filtered.dispose();
  folded.dispose();
  assert.equal(folded.fold, undefined);
  s.dispose();
});
test("canceled preparation publishes no view", async () => {
  const s = data({ x: [1, 2] });
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    runTransform("Bin", s, { x: "x" }, { signal: c.signal }),
    { name: "AbortError" },
  );
  s.dispose();
});
test("rectangle scalar broadcasting and prism extrusion axis", async () => {
  const a = rectangleArrays("rect", {
    x0: [0, 1],
    x1: [1, 2],
    y0: 0,
    y1: [2, 3],
  });
  assert.deepEqual(Array.from(await a.position.ref.data()), [0, 0, 0, 1, 0, 0]);
  assert.deepEqual(Array.from(await a.extent.ref.data()), [1, 2, 0, 2, 3, 0]);
  Object.values(a).forEach((v) => v.dispose());
  const b = rectangleArrays("prism", {
    axis: "x",
    x0: 0,
    x1: 3,
    y: [1],
    z: [2],
    width: 2,
    depth: 4,
  });
  assert.deepEqual(Array.from(await b.position.ref.data()), [0, 0, 0]);
  assert.deepEqual(Array.from(await b.extent.ref.data()), [3, 2, 4]);
  Object.values(b).forEach((v) => v.dispose());
});

test("offscreen facet preparation shares transformed bin domains and caches pipelines", async () => {
  const { createFacetEngine } =
    await import("../../src/lib/plot/utils/facetEngine.js");
  const s = data({
    g: ["A", "A", "B", "B"],
    x: [0, 2, 10, 12],
    y: [0, 1, 3, 4],
  });
  const parts = await partitionFacets(s, { column: "g" }),
    reports = [];
  const engine = createFacetEngine(parts.cells, (slot, result) =>
    reports.push(result),
  );
  const input = parts.cells[0].view;
  const bins = await engine.bins(0, "Bin", input, { x: "x", bins: 2 });
  assert.deepEqual(bins.bins.x, [0, 6, 12]);
  const a = await engine.transform(parts.cells[0], "Normalize", input, {
    field: "x",
    as: "x",
  });
  const b = await engine.transform(parts.cells[0], "Normalize", input, {
    field: "x",
    as: "x",
  });
  assert.equal(a, b);
  const options = { get: () => undefined };
  await engine.define(
    1,
    "Points",
    { x: "x", y: "y" },
    a.pipeline,
    options,
  );
  assert.deepEqual(
    reports[0].map((r) => r.bounds.x),
    [
      [-1, 1],
      [-1, 1],
    ],
  );
  a.dispose();
  b.dispose();
  engine.dispose();
  parts.dispose();
  s.dispose();
});
// TODO 29.11: a redefinition keeps the prefixes its new pipeline still runs, in every cell.
test("a facet redefinition reruns only the pipeline steps that changed", async () => {
  const { createFacetEngine } = await import("../../src/lib/plot/utils/facetEngine.js");
  const { transformRuns } = await import("../../src/lib/plot/utils/transforms.js");
  const { multiply } = await import("../../src/lib/plot/utils/expressions.js");
  const s = data({ g: ["A", "A", "B", "B"], x: [0, 2, 10, 12], y: [0, 1, 3, 4] });
  const parts = await partitionFacets(s, { column: "g" }), reports = [];
  const engine = createFacetEngine(parts.cells, (slot, result) => reports.push(result));
  const options = { get: () => undefined };
  const pipeline = (scale) => [
    { kind: "Filter", config: { where: { field: "x", op: "gt", value: -1 } } },
    { kind: "Calculate", config: { columns: { z: multiply("x", scale) } } },
  ];
  await engine.define(1, "Points", { x: "z", y: "y" }, pipeline(2), options);
  const before = transformRuns.count;
  await engine.define(1, "Points", { x: "z", y: "y" }, pipeline(3), options);
  // Two cells: the Calculate reruns in each; the Filter before it is kept.
  assert.equal(transformRuns.count - before, 2);
  assert.deepEqual(reports.at(-1).map((r) => r.bounds.x), [[0, 6], [30, 36]]);
  engine.dispose();
  parts.dispose?.();
  s.dispose();
});

// 12C A1: a rule name or an expression count is resolved once, over the union of the cells,
// so every cell of a Facet gets the same edges.
test("shared facet bins resolve a rule or an expression once over every cell", async () => {
  const { createFacetEngine } = await import("../../src/lib/plot/utils/facetEngine.js");
  const { power, max } = await import("../../src/lib/plot/utils/expressions.js");
  const s = data({ g: ["A", "A", "B", "B"], x: [0, 2, 10, 12], y: [0, 1, 3, 4], c: ["p", "q", "p", "p"] });
  const parts = await partitionFacets(s, { column: "g" });
  const engine = createFacetEngine(parts.cells, () => {});
  const input = parts.cells[0].view;
  // Sturges over the 4 rows of the union is 3 bins; over one cell's 2 rows it would be 2.
  assert.deepEqual((await engine.bins(0, "Bin", input, { x: "x", bins: "sturges" })).bins.x, [0, 4, 8, 12]);
  // sqrt(count) of the union is 2, where one cell would give 1.
  assert.deepEqual((await engine.bins(0, "Bin", input, { x: "x", bins: power(count("x"), 0.5) })).bins.x, [0, 6, 12]);
  // count() with no column counts the union's rows too.
  assert.deepEqual((await engine.bins(0, "Bin", input, { x: "x", bins: power(count(), 0.5) })).bins.x, [0, 6, 12]);
  // Per axis: a rule on x, a number on y, an expression reading a categorical grouping column.
  const perAxis = await engine.bins(0, "Bin", input, { x: "x", y: "y", bins: { x: "sturges", y: 2 } });
  assert.deepEqual(perAxis.bins, { x: [0, 4, 8, 12], y: [0, 2, 4] });
  const grouped = await engine.bins(0, "Bin", input, { x: "x", bins: max(count("x", { by: "c" })) });
  assert.deepEqual(grouped.bins.x, [0, 4, 8, 12]);
  // Hexbin takes the count and derives its radius from the shared x bounds.
  const hex = await engine.bins(0, "Hexbin", input, { x: "x", y: "y", bins: "sturges" });
  assert.equal(hex.bins, 3);
  assert.ok(Math.abs(hex.radius - 12 / (Math.sqrt(3) * 3)) < 1e-9);
  // The shared geometry belongs to the definition, not the public component's name.
  const { definitions } = await import("../../src/lib/plot/utils/transforms/index.js");
  definitions.set("test.facet-bins", definitions.get("Bin"));
  definitions.set("test.facet-hex", definitions.get("Hexbin"));
  try {
    assert.deepEqual((await engine.bins(0, "test.facet-bins", input, { x: "x", bins: 2 })).bins.x, [0, 6, 12]);
    assert.deepEqual(await engine.bins(0, "test.facet-hex", input, { x: "x", y: "y", bins: "sturges" }), hex);
    const fixed = { x: "x", y: "y", radius: 3 };
    assert.equal(await engine.bins(0, "test.facet-hex", input, fixed), fixed);
  } finally {
    definitions.delete("test.facet-bins"); definitions.delete("test.facet-hex");
  }
  // sharedBins={false} leaves the configuration to the cell.
  const own = { x: "x", bins: "sturges", sharedBins: false };
  assert.equal(await engine.bins(0, "Bin", input, own), own);
  await assert.rejects(() => engine.bins(0, "Bin", input, { x: "x", bins: mean("nope") }), /missing field "nope"/);
  await assert.rejects(() => engine.bins(0, "Bin", input, { x: "x", bins: "silverman" }), /Unknown bin rule/);
  engine.dispose();
  parts.dispose();
  s.dispose();
});
test("dodge preserves seeded order and separates intersecting glyphs", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { dodgeOffsets } = await import("../../src/lib/plot/utils/dodge.js");
  const x = np.array([0, 0, 2, 8]),
    r = np.array([2, 2, 2, 2]);
  const a = await dodgeOffsets(x, r),
    b = await dodgeOffsets(x, r);
  const offsets = Array.from(await a.data());
  assert.deepEqual(offsets, Array.from(await b.data()));
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < i; j++)
      assert.ok(
        Math.hypot(
          [0, 0, 2, 8][i] - [0, 0, 2, 8][j],
          offsets[i] - offsets[j],
        ) >=
          5 - 1e-4,
      );
  x.dispose();
  r.dispose();
});

test("aggregate metadata and explicit contributor queries preserve original row identities", async () => {
  const s = data({ x: [3, 0, 2, 1], v: [10, 11, 12, 13] });
  const sorted = await runTransform("Sort", s, { by: "x" });
  const bins = await runTransform("Bin", sorted, { x: "x", bins: [0, 2, 4] });
  assert.deepEqual(await bins.aggregateInfo(0), {
    index: 0,
    kind: "bin",
    x0: 0,
    x1: 2,
    count: 2,
  });
  const ids = await bins.contributors(0);
  assert.deepEqual(Array.from(await ids.data()), [1, 3]);
  const subset = await runTransform("Filter", bins, {
    where: { field: "x0", op: "gte", value: 2 },
  });
  assert.equal((await subset.aggregateInfo(0)).x0, 2);
  subset.dispose();
  bins.dispose();
  sorted.dispose();
  s.dispose();
});

test("window variance is stable for large-offset observations", async () => {
  const s = data({ x: [100000, 100001, 100002, 100003] });
  const v = await runTransform("Window", s, {
    field: "x",
    size: 3,
    reduce: "variance",
  });
  const result = await values(v, "smoothed");
  [0, 0.25, 2 / 3, 2 / 3].forEach((x, i) =>
    assert.ok(Math.abs(result[i] - x) < 1e-5),
  );
  v.dispose();
  s.dispose();
});
test("facet dictionary codes exclude fractional and missing entries", async () => {
  const s = data({
    g: { codes: [0, 0.5, 1, NaN, -1, 3], categories: ["a", "b"] },
    x: [0, 1, 2, 3, 4, 5],
  });
  const p = await partitionFacets(s, { column: "g" });
  assert.deepEqual(
    p.cells.map((c) => c.view.length),
    [1, 1],
  );
  p.dispose();
  s.dispose();
});

test("rotated prism footprint contributes full facet bounds", async () => {
  const { rectangleDomainArrays } =
    await import("../../src/lib/plot/utils/rectangles.js");
  const b = rectangleDomainArrays("Prism", {
    x: 0,
    y: 0,
    width: 4,
    depth: 2,
    z0: 0,
    z1: 3,
    rotation: 90,
  });
  const lo = Array.from(await b.lower.data()),
    hi = Array.from(await b.upper.data());
  [-1, -2, 0].forEach((v, i) => assert.ok(Math.abs(lo[i] - v) < 1e-5));
  [1, 2, 3].forEach((v, i) => assert.ok(Math.abs(hi[i] - v) < 1e-5));
});

test("an unrotated prism's bounds are its corners, for every footprint", async () => {
  const { rectangleDomainArrays } =
    await import("../../src/lib/plot/utils/rectangles.js");
  for (const shape of ["rectangle", "triangle", "hexagon", "circle"]) {
    const props = { x: [1, 5], y: [2, 0], width: [4, 2], depth: 2, z0: 0, z1: [3, 1], shape };
    // A rotation column of zeros takes the rotating path; no rotation takes the corners.
    const fast = rectangleDomainArrays("Prism", props),
      slow = rectangleDomainArrays("Prism", { ...props, rotation: [0, 0] });
    for (const key of ["lower", "upper"]) {
      const a = Array.from(await fast[key].data()),
        b = Array.from(await slow[key].data());
      a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-5, `${shape} ${key}`));
      if (key === "lower") assert.deepEqual(a, [-1, 1, 0, 4, -1, 0]);
    }
  }
});

test("categorical sorting keeps missing values last in either direction", async () => {
  const s = data({ g: ["b", null, "a", undefined], id: [0, 1, 2, 3] });
  for (const order of ["asc", "desc"]) {
    const v = await runTransform("Sort", s, { by: "g", order });
    assert.deepEqual((await values(v, "id")).slice(-2), [1, 3]);
    v.dispose();
  }
  s.dispose();
});

test("3D bins conserve observations and expose consistent voxel bounds", async () => {
  const s = data({ x: [0, 1, 0, 1], y: [0, 0, 1, 1], z: [0, 1, 1, 0] });
  const v = await runTransform("Bin", s, {
    x: "x",
    y: "y",
    z: "z",
    bins: 2,
    empty: false,
  });
  assert.equal(v.length, 4);
  assert.deepEqual(await values(v, "count"), [1, 1, 1, 1]);
  for (const a of "xyz") {
    const lo = await values(v, a + "0"),
      hi = await values(v, a + "1");
    lo.forEach((x, i) => assert.equal(hi[i] - x, 0.5));
  }
  v.dispose();
  s.dispose();
});
test("grouped rolling windows retain original order", async () => {
  const s = data({ g: ["a", "b", "a", "b"], x: [2, 10, 4, 20] });
  const v = await runTransform("Window", s, { field: "x", by: "g", size: 2 });
  assert.deepEqual(await values(v, "smoothed"), [2, 10, 3, 15]);
  v.dispose();
  s.dispose();
});
test("hex lattices conserve counts in both orientations, with matching footprint rotations", async () => {
  const s = data({ x: [0, 0, 1, -1], y: [0, 0, 1, -1] });
  for (const orientation of ["flat", "pointy"]) {
    const v = await runTransform("Hexbin", s, {
      x: "x",
      y: "y",
      radius: 1,
      orientation,
    });
    assert.equal(
      (await values(v, "count")).reduce((a, b) => a + b, 0),
      4,
    );
    assert.ok(
      (await values(v, "rotation")).every(
        (v) => v === (orientation === "flat" ? 0 : 30),
      ),
    );
    v.dispose();
  }
  s.dispose();
});


test("swarm groups do not displace one another", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { dodgeOffsets } = await import("../../src/lib/plot/utils/dodge.js");
  const x = np.array([0, 0, 0, 0]), r = np.array([2, 2, 2, 2]), groups = np.array([0, 0, 1, 1]);
  const result = await dodgeOffsets(x, r, { groups });
  const y = Array.from(await result.ref.data());
  for (const start of [0, 2]) {
    assert.equal(Math.min(Math.abs(y[start]), Math.abs(y[start + 1])), 0);
    assert.ok(Math.abs(y[start] - y[start + 1]) >= 5 - 1e-4);
  }
  [x, r, groups, result].forEach(a => a.dispose());
});

test("box medians span fractional categorical widths", async () => {
  const scope = data({ group: ["A", "A", "A"], value: [0, 1, 2] });
  const view = await runTransform("BoxStats", scope, { by: "group", value: "value", width: 0.8 });
  const start = await values(view, "__medianStart"), end = await values(view, "__medianEnd");
  assert.ok(Math.abs(end[0] - start[0] - 0.8) < 1e-6);
  assert.equal(start[1], 1); assert.equal(end[1], 1);
  view.dispose(); scope.dispose();
});

test("BarGeometry keeps a datetime value column's dates on its value ends (a lollipop on a time axis)", async () => {
  const scope = data({ task: ["a", "b"], when: typedColumn([new Date("2024-02-01T00:00Z"), new Date("2024-03-01T00:00Z")], { type: "datetime", unit: "ms" }) });
  const view = await runTransform("BarGeometry", scope, { x: "when", y: "task", baseline: "when", arrange: "overlap" });
  for (const column of ["__barTipX", "__barBaseX", "__barX"]) assert.deepEqual(view.metadata(column), scope.metadata("when"));
  view.dispose(); scope.dispose();
});

test("BarGeometry arranges bars that share a category: stacked, grouped or overlapping (TODO 133.2)", async () => {
  // Bars sharing a category drew from 0 at the same x, reading as stacked when they were not
  // (eval pilot grouped-bars).
  const scope = data({ region: ["N", "N", "S", "S"], product: ["a", "b", "a", "b"], sales: [1, 2, 3, -4] });
  const run = (arrange) => runTransform("BarGeometry", scope,
    { x: "region", y: "sales", baseline: 0, arrange, series: "product", bandFraction: 0.8 });
  const stacked = await run("stack");
  // Positive values stack up from 0 and negative ones down: [0, 1], [1, 3], [0, 3], [-4, 0].
  assert.deepEqual(await values(stacked, "__barBaseline"), [0, 1, 0, 0]);
  assert.deepEqual(await values(stacked, "__barValue"), [1, 3, 3, -4]);
  assert.deepEqual(await values(stacked, "__barSizeY"), [1, 2, 3, 4]);
  const grouped = await run("group");
  // Two series share the 0.8 band: each 0.4 wide, centered 0.2 either side, the same slot in
  // every category.
  assert.deepEqual((await values(grouped, "__barOffsetX")).map((v) => Math.round(v * 100) / 100), [-0.2, 0.2, -0.2, 0.2]);
  assert.deepEqual((await values(grouped, "__barSizeX")).map((v) => Math.round(v * 100) / 100), [0.4, 0.4, 0.4, 0.4]);
  assert.deepEqual(await values(grouped, "__barBaseline"), [0, 0, 0, 0]);
  const overlapping = await run("overlap");
  assert.deepEqual(await values(overlapping, "__barValue"), [1, 2, 3, -4]);
  await assert.rejects(() => runTransform("BarGeometry", scope, { x: "region", y: "sales", arrange: "group" }),
    /arrange="group" puts each series in its own slot: give fill \(or color\) a column/);
  await assert.rejects(() => run("pile"), /Bar arrange is "stack", "group" or "overlap"; received "pile"/);
  // A series naming no column (a color, TODO 130.2) is no series: one stack per category.
  const colored = await runTransform("BarGeometry", scope, { x: "region", y: "sales", arrange: "stack", series: "#808080" });
  assert.deepEqual(await values(colored, "__barValue"), [1, 3, 3, -4]);
  // So is any other color: an {r, g, b} object, or an array of values per row.
  for (const series of [{ r: 1, g: 0, b: 0 }, [3, 2, 1, 0]]) {
    const view = await runTransform("BarGeometry", scope, { x: "region", y: "sales", arrange: "stack", series });
    assert.deepEqual(await values(view, "__barValue"), [1, 3, 3, -4]);
    view.dispose();
  }
  await assert.rejects(() => runTransform("BarGeometry", scope, { x: "region", y: "sales", arrange: "group", series: "#808080" }),
    /arrange="group" puts each series in its own slot/);
  await assert.rejects(() => runTransform("BarGeometry", scope, { x: "region", y: "sales", arrange: "stack", baseline: 1 }),
    /Bar arrange="stack" stacks from zero: leave out baseline, or use arrange="overlap"/);
  for (const view of [stacked, grouped, overlapping, colored]) view.dispose();
  scope.dispose();
});

test("BarGeometry finds its orientation and writes the same outputs either way (TODO 130.1)", async () => {
  const scope = data({ region: ["N", "S"], sales: [2, -1] });
  // A categorical y against a numeric x: horizontal bars, their values along x.
  const sideways = await runTransform("BarGeometry", scope, { x: "sales", y: "region", baseline: 0 });
  assert.deepEqual(await values(sideways, "__barX"), [1, -0.5]);
  assert.deepEqual(await values(sideways, "__barSizeX"), [2, 1]);
  assert.deepEqual((await values(sideways, "__barSizeY")).map((v) => Math.round(v * 10) / 10), [0.8, 0.8]);
  assert.deepEqual([await values(sideways, "__barBaseX"), await values(sideways, "__barTipX")], [[0, 0], [2, -1]]);
  // The position passes through as the category column.
  assert.deepEqual(sideways.get("__barTipY").categories, sideways.get("region").categories);
  sideways.dispose();
  const upright = await runTransform("BarGeometry", scope, { x: "region", y: "sales", orientation: "vertical", baseline: 1 });
  assert.deepEqual([await values(upright, "__barBaseY"), await values(upright, "__barTipY")], [[1, 1], [2, -1]]);
  upright.dispose();
  await assert.rejects(() => runTransform("BarGeometry", scope, { x: "sales", y: "sales" }),
    /exactly one categorical position axis among x and y, or an explicit orientation/);
  await assert.rejects(() => runTransform("BarGeometry", scope, { y: "sales", orientation: "horizontal" }),
    /orientation="horizontal" reads the bars' values from x: give x/);
  // A list of categories passes through; bars at numeric positions of a column stack.
  const listed = await runTransform("BarGeometry", scope, { x: ["N", "S"], y: "sales" });
  assert.deepEqual(await values(listed, "__barTipY"), [2, -1]);
  listed.dispose();
  const years = data({ year: [2020, 2020, 2021], sales: [1, 2, 3], product: ["a", "b", "a"] });
  const stacked = await runTransform("BarGeometry", years, { x: "year", y: "sales", orientation: "vertical", arrange: "stack", series: "product" });
  assert.deepEqual(await values(stacked, "__barBaseY"), [0, 1, 0]);
  assert.equal(resolveColumn(stacked, "__barX").column, "year");
  stacked.dispose(); years.dispose(); scope.dispose();
});

test("BarGeometry infers literal string and boolean categories in either orientation", async () => {
  const scope = data({ revenue: [2, 3] });
  for (const category of ["Hardware", true, false]) {
    for (const horizontal of [false, true]) {
      const axis = horizontal ? "Y" : "X", valueAxis = horizontal ? "X" : "Y";
      const view = await runTransform("BarGeometry", scope, horizontal
        ? { x: "revenue", y: literal(category) } : { x: literal(category), y: "revenue" });
      assert.deepEqual(view.get(`__bar${axis}`).categories, [category]);
      assert.deepEqual(Array.from(await view.get(`__bar${axis}`).codes.ref.data()), [0, 0]);
      assert.deepEqual(await values(view, `__barTip${valueAxis}`), [2, 3]);
      view.dispose();
    }
  }
  await assert.rejects(() => runTransform("BarGeometry", scope, { x: literal(2), y: "revenue" }), /exactly one categorical/);
  scope.dispose();
});

test("xOffset and yOffset move positions in data units: a band on a categorical axis", async () => {
  const { prepareNamed } = await import("../../src/lib/plot/utils/namedData.js");
  const { optionsRoot } = await import("../../src/lib/options/options.js");
  const prepared = prepareNamed({ x: [0, 1], y: [5, 5], xOffset: [-0.25, 0.25], yOffset: 1 }, undefined,
    optionsRoot.splitUnique("Offsets"), "Points", { hidden: {}, auto: {} });
  assert.deepEqual(Array.from(await prepared.props.position.ref.data()), [-0.25, 6, 1.25, 6]);
  prepared.dispose();
});

// TODO 130.1: a transform's field takes one number per row of its data, as a mark's channel does,
// in the data's row order (gathered through a Filter's rows); another length names the fix.
test("transform fields take one number per row of their data", async () => {
  const s = data({ id: [0, 1, 2, 3], keep: [true, false, true, true] });
  const binned = await runTransform("Bin", s, { x: [0, 1, 9, 10], bins: [0, 5, 10] });
  assert.deepEqual(await values(binned, "count"), [2, 2]);
  binned.dispose();
  // Automatic bins, a weight given as values, and null as a missing value.
  const weighted = await runTransform("Bin", s, { x: [0, 1, null, 10], bins: 2, weight: [1, 2, 3, 4] });
  assert.deepEqual(await values(weighted, "count"), [3, 4]);
  weighted.dispose();
  const filtered = await runTransform("Filter", s, { where: "keep" });
  const window = await runTransform("Window", filtered, { field: new Float32Array([1, 100, 2, 3]), reduce: "sum", size: 2, as: "total" });
  // The kept rows' values (1, 2, 3), summed over a trailing window of two.
  assert.deepEqual(await values(window, "total"), [1, 3, 5]);
  const fit = await runTransform("Regression", filtered, { x: [0, 5, 1, 2], y: [1, -9, 3, 5], samples: 2, band: false });
  assert.deepEqual((await values(fit, "y")).map((v) => Math.round(v * 1e4) / 1e4), [1, 5]);
  await assert.rejects(() => runTransform("Normalize", s, { field: [1, 2, 3] }),
    { message: "Normalize.field has 3 values; its data has 4 rows. Give one value per row, or a column name." });
  fit.dispose(); window.dispose(); filtered.dispose(); s.dispose();
});
