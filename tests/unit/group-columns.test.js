// Group's columns and Pivot's value as reduction expressions (TODO 137.2): the expression path
// (anything but one plain reduction of a column) against references computed here, and the
// errors that name what to write instead.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import {
  add, count, cumsum, divide, first, greater, mean, median, min, mode, sum,
} from "../../src/lib/plot/utils/expressions.js";
import { col } from "../../src/lib/plot/utils/names.js";

const data = (value) => {
  const s = createDataScope();
  s.update(value);
  return s;
};
const values = async (view, key) => {
  const column = view.get(key);
  const array = column?.codes ?? column;
  return Array.from(await array.ref.data(), Number);
};
const close = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) =>
    Number.isNaN(expected[i])
      ? assert.ok(Number.isNaN(value), `${i}: ${value} is not NaN`)
      : assert.ok(Math.abs(value - expected[i]) < 1e-4, `${i}: ${value} != ${expected[i]}`),
  );
};

const G = ["a", "b", "a", "c", "b", "a", "c", "b"];
const X = [1, 4, 2, 8, 6, 9, 3, 5];
const S = ["p", "q", "q", "p", "p", "q", "q", "p"];
// The reference: each group's rows, in order of first appearance.
const groupsOf = (keys, keep = () => true) => {
  const out = new Map();
  keys.forEach((key, i) => {
    if (!out.has(key)) out.set(key, []);
    if (keep(i)) out.get(key).push(i);
  });
  return out;
};
const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};

test("Group expression columns match a per-group reference", async () => {
  const s = data({ g: G, x: Float32Array.from(X), k: Float32Array.from([1, 2, 1, 3, 2, 1, 3, 2]) });
  const view = await runTransform("Group", s, {
    by: ["g", "k"],
    columns: {
      ratio: divide(sum("x"), count()),
      big: count(null, { where: greater("x", 4) }),
      shifted: add("k", mean("x")),
      mid: median("x"),
    },
  });
  const groups = [...groupsOf(G).values()];
  assert.deepEqual([...view.keys()].filter((key) => !key.startsWith("@")), ["g", "k", "count", "ratio", "big", "shifted", "mid"]);
  const xs = (rows) => rows.map((i) => X[i]);
  const k = { a: 1, b: 2, c: 3 };
  close(await values(view, "ratio"), groups.map((rows) => xs(rows).reduce((a, b) => a + b) / rows.length));
  close(await values(view, "big"), groups.map((rows) => xs(rows).filter((x) => x > 4).length));
  close(await values(view, "shifted"), [...groupsOf(G).entries()].map(([key, rows]) => k[key] + xs(rows).reduce((a, b) => a + b) / rows.length));
  close(await values(view, "mid"), groups.map((rows) => medianOf(xs(rows))));
  view.dispose();
  s.dispose();
});

test("Group expression columns over hidden rows reduce the visible rows", async () => {
  const s = data({ g: G, x: Float32Array.from(X) });
  const filtered = await runTransform("Filter", s, { where: { field: "x", op: "gte", value: 3 } });
  const view = await runTransform("Group", filtered, { by: "g", columns: { mid: median("x"), ratio: divide(sum("x"), count()) } });
  const padded = view.padded?.() ?? view;
  const visible = groupsOf(G, (i) => X[i] >= 3);
  const xs = (rows) => rows.map((i) => X[i]);
  const shown = [...visible.values()].filter((rows) => rows.length);
  const got = { mid: await values(view, "mid"), ratio: await values(view, "ratio") };
  close(got.mid, shown.map((rows) => medianOf(xs(rows))));
  close(got.ratio, shown.map((rows) => xs(rows).reduce((a, b) => a + b) / rows.length));
  assert.ok(padded.length >= view.length);
  view.dispose();
  filtered.dispose();
  s.dispose();
});

test("Pivot's expression path: a value per (group, category) cell, NaN for an empty cell", async () => {
  // Group c has no "q" row: its cell is empty.
  const s = data({ g: [...G, "c"], s: [...S.slice(0, 6), "p", "p", "p"], x: Float32Array.from([...X, 7]) });
  const rows = { a: [0, 2, 5], b: [1, 4, 7], c: [3, 6, 8] };
  const sv = [...S.slice(0, 6), "p", "p", "p"], xv = [...X, 7];
  const cell = (group, category) => rows[group].filter((i) => sv[i] === category).map((i) => xv[i]);
  const view = await runTransform("Pivot", s, { field: "s", by: "g", value: median("x") });
  close(await values(view, "p"), ["a", "b", "c"].map((g) => medianOf(cell(g, "p"))));
  close(await values(view, "q"), ["a", "b", "c"].map((g) => medianOf(cell(g, "q"))));
  view.dispose();
  const ratio = await runTransform("Pivot", s, { field: "s", by: "g", value: divide(sum("x"), count()) });
  const meanOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b) / xs.length : NaN);
  close(await values(ratio, "q"), ["a", "b", "c"].map((g) => meanOf(cell(g, "q"))));
  ratio.dispose();
  const counted = await runTransform("Pivot", s, { field: "s", by: "g", value: count() });
  close(await values(counted, "p"), ["a", "b", "c"].map((g) => cell(g, "p").length));
  close(await values(counted, "q"), [2, 1, NaN]);
  counted.dispose();
  s.dispose();
});

test("Pivot's expression path over hidden rows", async () => {
  const s = data({ g: G, s: S, x: Float32Array.from(X) });
  const filtered = await runTransform("Filter", s, { where: { field: "x", op: "gte", value: 3 } });
  const view = await runTransform("Pivot", filtered, { field: "s", by: "g", value: median("x") });
  const padded = view.padded?.() ?? view;
  const cell = (g, c) => G.map((key, i) => i).filter((i) => G[i] === g && S[i] === c && X[i] >= 3).map((i) => X[i]);
  close(await values(padded, "p"), ["a", "b", "c"].map((g) => medianOf(cell(g, "p"))));
  close(await values(padded, "q"), ["a", "b", "c"].map((g) => medianOf(cell(g, "q"))));
  view.dispose();
  filtered.dispose();
  s.dispose();
});

test("Pivot by a key named value or count", async () => {
  const s = data({ value: ["a", "b", "a"], count: ["u", "u", "v"], s: ["p", "q", "p"], x: Float32Array.from([1, 2, 3]) });
  for (const by of ["value", "count"])
    for (const value of [sum("x"), count(), median("x")]) {
      const view = await runTransform("Pivot", s, { field: "s", by, value });
      assert.equal(view.get(by) !== undefined, true);
      view.dispose();
    }
  s.dispose();
});

test("Group and Pivot errors name what to write", async () => {
  const s = data({ g: G, s: S, x: Float32Array.from(X) });
  const rejects = (kind, config, pattern) => assert.rejects(runTransform(kind, s, config), pattern);
  await rejects("Group", { by: "g", reduce: { m: { op: "mean", field: "x" } } }, /Group: reduce was removed; pass columns=/);
  await rejects("Pivot", { field: "s", reduce: { op: "sum", field: "x" } }, /Pivot: reduce was removed; pass value=/);
  await rejects("Group", { by: "g", columns: { m: mean("x", { by: "s" }) } }, /Group column m: mean\("x"\) has by=/);
  await rejects("Group", { by: "g", columns: { c: sum(cumsum("x")) } }, /Group column c: cumsum\("x"\) is a row operation/);
  await rejects("Group", { by: "g", columns: { y: add("x", mean("x")) } }, /Group column y reads "x" outside a reduction/);
  await rejects("Group", { by: "g", columns: { y: "x" } }, /Group column y reads "x" outside a reduction/);
  await rejects("Group", { by: "g", columns: { y: add(1, 2) } }, /Group column y needs a reduction/);
  await rejects("Group", { by: "g", columns: { g: mean("x") } }, /would replace a key column/);
  await rejects("Group", { by: "g", columns: { count: mean("x") } }, /would replace the count column/);
  await rejects("Group", { by: "g", columns: { m: mean("s") } }, /Group column m: mean requires numeric values/);
  await rejects("Pivot", { field: "s", by: "g", value: "x" }, /Pivot: value is a reduction now; pass value=\{sum\("x"\)\}/);
  await rejects("Pivot", { field: "s", by: "g", value: col("x") }, /Pivot: value is a reduction now/);
  await rejects("Pivot", { field: "s", by: "g", value: add("x", 1) }, /Pivot value reads "x" outside a reduction/);
  await rejects("Pivot", { field: "s", by: "s", value: first("g") }, /Pivot value: first\("g"\) reduces a categorical column/);
  s.dispose();
});

// Checked for leaks under LEAK_CHECK=1 (helpers/leakHarness.js): the kernel's codes are held
// before an expression column can throw.
test("a Group whose expression column fails after its kernel columns releases its work", async () => {
  const s = data({ g: G, x: Float32Array.from(X) });
  await assert.rejects(
    runTransform("Group", s, { by: "g", columns: { m: mean("x"), bad: median("nope") } }),
    /nope/,
  );
  s.dispose();
});

test("Bin columns: expression columns per bin, missing for an empty bin, in the order given", async () => {
  const x = [0.1, 0.2, 0.6, 0.9, 0.95, 0.3, 0.05], v = [1, 2, 3, 4, 5, 6, 7], c = ["a", "b", "a", "a", "b", "b", "b"];
  const s = data({ x: Float32Array.from(x), v: Float32Array.from(v), c });
  // [0.75, 0.8) is empty.
  const edges = [0, 0.25, 0.5, 0.75, 0.8, 1];
  const view = await runTransform("Bin", s, {
    x: "x",
    bins: edges,
    columns: { mid: median("v"), ratio: divide(sum("v"), count()), big: count(null, { where: greater("v", 2) }), total: sum("v"), top: mode("c") },
  });
  assert.deepEqual([...view.keys()].filter((key) => !key.startsWith("@")), ["x0", "x1", "x", "count", "mid", "ratio", "big", "total", "top"]);
  const members = edges.slice(0, -1).map((lo, b) => x.map((_, i) => i).filter((i) => x[i] >= lo && (x[i] < edges[b + 1] || (b === edges.length - 2 && x[i] <= 1))));
  const vs = (rows) => rows.map((i) => v[i]);
  close(await values(view, "mid"), members.map((rows) => medianOf(vs(rows))));
  close(await values(view, "ratio"), members.map((rows) => (rows.length ? vs(rows).reduce((a, b) => a + b) / rows.length : NaN)));
  close(await values(view, "big"), members.map((rows) => (rows.length ? vs(rows).filter((value) => value > 2).length : NaN)));
  close(await values(view, "total"), members.map((rows) => vs(rows).reduce((a, b) => a + b, 0)));
  // A category column stays one: an empty bin's is -1.
  const top = view.get("top");
  assert.deepEqual(top.categories, ["a", "b"]);
  assert.deepEqual(members[3], []);
  assert.deepEqual(await values(view, "top"), [1, 1, 0, -1, 0]);
  view.dispose();
  s.dispose();
});

test("Bin columns over hidden rows, a weight and two axes", async () => {
  const x = [0.1, 0.2, 0.6, 0.9, 0.95, 0.3], y = [0.1, 0.8, 0.2, 0.9, 0.7, 0.6], v = [1, 2, 3, 4, 5, 6], w = [1, 0, 2, 1, 1, 3];
  const s = data({ x: Float32Array.from(x), y: Float32Array.from(y), v: Float32Array.from(v), w: Float32Array.from(w) });
  // Hidden rows reduce to nothing: v >= 2 keeps rows 1-5.
  const filtered = await runTransform("Filter", s, { where: { field: "v", op: "gte", value: 2 } });
  const hidden = await runTransform("Bin", filtered, { x: "x", bins: [0, 0.5, 1], columns: { mid: median("v") } });
  close(await values(hidden.padded?.() ?? hidden, "mid"), [medianOf([2, 6]), medianOf([3, 4, 5])]);
  hidden.dispose();
  filtered.dispose();
  // A weight leaves out a row of weight 0 from the expression columns (row 1), as min does.
  const weighted = await runTransform("Bin", s, { x: "x", bins: [0, 0.5, 1], weight: "w", columns: { mid: median("v"), low: min("v") } });
  close(await values(weighted, "mid"), [medianOf([1, 6]), medianOf([3, 4, 5])]);
  close(await values(weighted, "low"), [1, 3]);
  weighted.dispose();
  // Two axes: a bin per (x, y) cell, x fastest.
  const two = await runTransform("Bin", s, { x: "x", y: "y", bins: [0, 0.5, 1], columns: { mid: median("v") } });
  close(await values(two, "mid"), [1, 3, medianOf([2, 6]), medianOf([4, 5])]);
  two.dispose();
  s.dispose();
});

test("Bin and Hexbin errors name what to write", async () => {
  const s = data({ x: Float32Array.from([1, 2, 3]), y: Float32Array.from([1, 2, 3]) });
  const reduce = { m: { op: "sum", field: "y" } };
  await assert.rejects(runTransform("Bin", s, { x: "x", reduce }), /Bin: reduce was removed; pass columns=/);
  await assert.rejects(runTransform("Hexbin", s, { x: "x", y: "y", radius: 2, reduce }), /Hexbin: reduce was removed; pass columns=/);
  await assert.rejects(runTransform("Bin", s, { x: "x", columns: { x0: sum("y") } }), /Bin: column "x0" would replace the x0 column/);
  await assert.rejects(runTransform("Bin", s, { x: "x", columns: { m: add("y", 1) } }), /Bin column m reads "y" outside a reduction/);
  // Hexbin writes count itself on both of its paths.
  for (const config of [{ bins: 4, bounds: { x: [0, 4], y: [0, 4] } }, { radius: 2 }])
    await assert.rejects(runTransform("Hexbin", s, { x: "x", y: "y", ...config, columns: { count: sum("y") } }), /Hexbin: column "count" would replace the count column/);
  s.dispose();
});

test("Hexbin expression columns, on a fixed grid or not", async () => {
  // Two clusters far apart: a cell each.
  const x = [0, 0.1, 0.2, 10, 10.1], y = [0, 0.1, 0, 10, 10], v = [1, 5, 3, 10, 20];
  const s = data({ x: Float32Array.from(x), y: Float32Array.from(y), v: Float32Array.from(v) });
  for (const config of [{ radius: 1 }, { bins: 6, bounds: { x: [-1, 11], y: [-1, 11] } }]) {
    const view = await runTransform("Hexbin", s, { x: "x", y: "y", ...config, columns: { mid: median("v"), total: sum("v") } });
    const counts = await values(view, "count"), mids = await values(view, "mid"), totals = await values(view, "total");
    const cells = counts.map((n, i) => [n, mids[i], totals[i]]).filter(([n]) => n > 0).sort((a, b) => a[2] - b[2]);
    assert.deepEqual(cells, [[3, 3, 9], [2, 15, 30]], JSON.stringify(config));
    view.dispose();
  }
  s.dispose();
});

test("Bin columns: col.x is a column, a weight, failures release their work, assign mode, no rows", async () => {
  const s = data({ x: Float32Array.from([0.1, 0.2, 0.7]), v: Float32Array.from([10, 20, 30]), w: Float32Array.from([0.5, 2, 1]) });
  // mean(col.v) is mean("v"): the compiled kernel, weighted.
  for (const m of [mean("v"), mean(col("v"))]) {
    const view = await runTransform("Bin", s, { x: "x", bins: [0, 0.5, 1], weight: "w", columns: { m } });
    close(await values(view, "m"), [(0.5 * 10 + 2 * 20) / 2.5, 30]);
    view.dispose();
  }
  await assert.rejects(
    runTransform("Bin", s, { x: "x", bins: [0, 0.5, 1], weight: "w", columns: { r: divide(sum("v"), count()) } }),
    /Bin column r: with weight, sum, mean and count are weighted only as a column of their own/,
  );
  // Checked for leaks under LEAK_CHECK=1: the kernel's codes are held before a column can throw.
  for (const empty of [true, false])
    await assert.rejects(runTransform("Bin", s, { x: "x", bins: [0, 0.5, 1], empty, columns: { mid: median("nope") } }), /nope/);
  await assert.rejects(runTransform("Bin", s, { x: "x", mode: "assign", columns: { m: mean("v") } }), /Bin columns apply to mode "aggregate"/);
  // No rows: every bin is empty, and a category column stays one.
  const one = data({ x: Float32Array.from([0.3]), c: ["a"] });
  const none = await runTransform("Filter", one, { where: { field: "x", op: "gt", value: 5 } });
  const empty = await runTransform("Bin", none, { x: "x", bins: [0, 0.5, 1], columns: { c: first("c") } });
  assert.deepEqual(empty.get("c").categories, ["a"]);
  empty.dispose();
  none.dispose();
  one.dispose();
  s.dispose();
});

test("Bin and Hexbin columns keep a datetime, and a Hexbin column reads @time", async () => {
  const day = 86400000;
  const s = createDataScope();
  s.update({ x: Float32Array.from([0, 0.1, 5]), y: Float32Array.from([0, 0.1, 5]), v: Float32Array.from([1, 2, 3]), d: [new Date(0), new Date(day), new Date(2 * day)] });
  const bins = await runTransform("Bin", s, { x: "x", bins: [0, 1, 6], columns: { lo: min("d"), mid: median("d") } });
  assert.equal(bins.metadata("lo")?.type, "datetime");
  assert.equal(bins.metadata("mid")?.type, "datetime");
  bins.dispose();
  const cells = await runTransform("Hexbin", s, {
    x: "x", y: "y", radius: 1, __viewState: { time: 1.5 },
    columns: { lo: min("d"), later: count(null, { where: greater("v", "@time") }) },
  });
  assert.equal(cells.metadata("lo")?.type, "datetime");
  const counts = await values(cells, "count"), later = await values(cells, "later");
  assert.deepEqual(counts.map((n, i) => [n, later[i]]).sort(), [[1, 1], [2, 1]]);
  cells.dispose();
  s.dispose();
});
