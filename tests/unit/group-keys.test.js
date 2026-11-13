// Bins and hexagons as Group keys (TODO 137.2): Group(by=bin("x", 20)) and
// Group(by=hexbin("x", "y")) against Bin and Hexbin, which bin the same way.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { Array as JaxArray } from "@hmplot/jax";
import { BIN_RULES, runTransform, disposeTransformCache } from "../../src/lib/plot/utils/transforms.js";
import {
  bin, hexbin, count, divide, evaluateExpression, expressionDescriptor, expressionFromDescriptor, mean, median, sum,
} from "../../src/lib/plot/utils/expressions.js";

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
const close = (actual, expected, label = "") => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, i) =>
    Number.isNaN(expected[i])
      ? assert.ok(Number.isNaN(value), `${label} ${i}: ${value} is not NaN`)
      : assert.ok(Math.abs(value - expected[i]) < 1e-4, `${label} ${i}: ${value} != ${expected[i]}`),
  );
};
const N = 200;
const X = Array.from({ length: N }, (_, i) => Math.sin(i * 1.7) * 5 + (i % 7 === 0 ? NaN : 0));
const Y = Array.from({ length: N }, (_, i) => Math.cos(i * 0.9) * 3);
const V = Array.from({ length: N }, (_, i) => (i * 37) % 23);
const G = Array.from({ length: N }, (_, i) => ["a", "b", "c"][i % 3]);
const table = () => data({ x: Float32Array.from(X), y: Float32Array.from(Y), v: Float32Array.from(V), g: G });

test("Group by a bin matches Bin's non-empty bins: edges, center, count and columns", async () => {
  const s = table();
  for (const bins of [12, [-5, -2, 0, 1, 5], "sturges"]) {
    const grouped = await runTransform("Group", s, { by: bin("x", bins), columns: { m: mean("v"), mid: median("v") } });
    const binned = await runTransform("Bin", s, { x: "x", bins, empty: false, columns: { m: mean("v"), mid: median("v") } });
    assert.deepEqual([...grouped.keys()].filter((key) => !key.startsWith("@")), ["x0", "x1", "x", "count", "m", "mid"]);
    // Bin keeps every bin (the empty ones hidden); Group has the bins with a row, in bin order.
    const reference = binned.padded?.() ?? binned;
    const counts = await values(reference, "count");
    const kept = counts.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    for (const key of ["x0", "x1", "x", "count", "m", "mid"]) {
      const all = await values(reference, key);
      close(await values(grouped, key), kept.map((i) => all[i]), `${JSON.stringify(bins)} ${key}`);
    }
    grouped.dispose();
    binned.dispose();
  }
  s.dispose();
});

test("Group by a column and a bin: a group per (column, bin) with a row", async () => {
  const s = table();
  const edges = [-5, 0, 5];
  const view = await runTransform("Group", s, { by: ["g", bin("x", edges)], columns: { r: divide(sum("v"), count()) } });
  assert.deepEqual([...view.keys()].filter((key) => !key.startsWith("@")), ["g", "x0", "x1", "x", "count", "r"]);
  const cells = new Map();
  X.forEach((x, i) => {
    if (!Number.isFinite(x)) return;
    const key = `${G[i]}|${x < 0 ? 0 : 1}`;
    cells.set(key, [...(cells.get(key) ?? []), V[i]]);
  });
  const g = view.get("g"), codes = await values(view, "g"), lows = await values(view, "x0");
  const ratios = await values(view, "r"), counts = await values(view, "count");
  assert.equal(codes.length, cells.size);
  codes.forEach((code, i) => {
    const rows = cells.get(`${g.categories[code]}|${lows[i] < 0 ? 0 : 1}`);
    assert.equal(counts[i], rows.length);
    assert.ok(Math.abs(ratios[i] - rows.reduce((a, b) => a + b) / rows.length) < 1e-4);
  });
  view.dispose();
  s.dispose();
});

test("Group by a bin over hidden rows: the visible rows' bins, edges from their extent", async () => {
  const s = table();
  const filtered = await runTransform("Filter", s, { where: { field: "v", op: "gte", value: 5 } });
  const compact = data({
    x: Float32Array.from(X.filter((_, i) => V[i] >= 5)),
    v: Float32Array.from(V.filter((v) => v >= 5)),
  });
  const [hidden, reference] = await Promise.all([
    runTransform("Group", filtered, { by: bin("x", 8), columns: { mid: median("v") } }),
    runTransform("Group", compact, { by: bin("x", 8), columns: { mid: median("v") } }),
  ]);
  assert.equal(hidden.length, reference.length);
  for (const key of ["x0", "x1", "count", "mid"]) close(await values(hidden, key), await values(reference, key), key);
  [hidden, reference, filtered, compact, s].forEach((item) => item.dispose());
});

test("Group by a hexbin matches Hexbin's cells", async () => {
  const s = table();
  for (const options of [{ radius: 1.5 }, { bins: 6, orientation: "flat" }]) {
    const grouped = await runTransform("Group", s, { by: hexbin("x", "y", options), columns: { mid: median("v") } });
    const cells = await runTransform("Hexbin", s, { x: "x", y: "y", ...options, columns: { mid: median("v") } });
    assert.deepEqual([...grouped.keys()].filter((key) => !key.startsWith("@")), ["x", "y", "count", "mid"]);
    for (const key of ["x", "y", "count", "mid"]) close(await values(grouped, key), await values(cells, key), `${JSON.stringify(options)} ${key}`);
    grouped.dispose();
    cells.dispose();
  }
  s.dispose();
});

test("bin and hexbin keys: checked options, errors that say what to write, and the wire form", async () => {
  assert.throws(() => bin("x", 0), /bin\(\) bins must be a positive integer/);
  assert.throws(() => bin("x", 10, { width: 2 }), /bin\(\) has no option width/);
  assert.throws(() => hexbin("x", "y", { radius: -1 }), /hexbin\(\) radius must be a positive number/);
  assert.throws(() => hexbin("x", "y", { orientation: "round" }), /orientation must be "pointy" or "flat"/);
  const s = table();
  assert.throws(() => evaluateExpression(bin("x", 5), s), /bin\(\) is a Group key, not a value per row/);
  await assert.rejects(runTransform("Calculate", s, { columns: { b: bin("x", 5) } }), /bin\(\) is a Group key/);
  await assert.rejects(runTransform("Group", s, { by: bin("x"), columns: { x0: mean("v") } }), /Group: column "x0" would replace the x0 column/);
  await assert.rejects(runTransform("Group", s, { by: ["x", bin("x")] }), /two keys write the column "x"; rename/);
  await assert.rejects(runTransform("Group", s, { by: hexbin("x", "count") }), /two keys write the column "count"/);
  // A repeated column key (two Selects on the same column) groups by it once.
  const twice = await runTransform("Group", s, { by: ["g", "g"] });
  assert.equal(twice.length, 3);
  twice.dispose();
  // Checked as Bin checks it, and named as the key the user wrote.
  await assert.rejects(runTransform("Group", s, { by: bin("x", [0, 1, 2], { interval: "1 month" }) }), /Group by bin\("x"\): give an interval or explicit edges/);
  await assert.rejects(runTransform("Group", s, { by: bin("x", 4, { interval: "1 month" }) }), /^Error: Group by bin\("x"\): (?!Bin)/);
  for (const rule of BIN_RULES) assert.equal(bin("x", rule).op, "bin");
  s.dispose();
  // A key sent from Python decodes to the same node.
  for (const key of [bin("x", [0, 1, 2], { interval: undefined }), bin("t", 4, { interval: "1 month", tz: "UTC" }), hexbin("x", "y", { radius: 2 })])
    assert.deepEqual(expressionFromDescriptor(expressionDescriptor(key)), key);
});

test("Group by a bin: @selected and contributors follow the rows of each bin, hidden rows too", async () => {
  const s = table();
  const filtered = await runTransform("Filter", s, { where: { field: "v", op: "gte", value: 5 } });
  for (const input of [s, filtered]) {
    const view = await runTransform("Group", input, { by: ["g", bin("x", [-5, 0, 5])], columns: { m: mean("v") } });
    const codes = await values(view, "g"), lows = await values(view, "x0");
    const g = view.get("g");
    const rowsOf = (i) => X.flatMap((x, row) =>
      Number.isFinite(x) && (input === s || V[row] >= 5) && G[row] === g.categories[codes[i]] && (x < 0) === (lows[i] < 0) ? [row] : []);
    for (let i = 0; i < codes.length; i++) {
      const rows = await view.contributors(i);
      assert.deepEqual(Array.from(await rows.data(), Number).sort((a, b) => a - b), rowsOf(i));
    }
    s.identity.selection.replace(s.identity, rowsOf(0).slice(0, 1));
    const selected = await values(view, "@selected");
    assert.deepEqual(selected.map(Boolean), codes.map((_, i) => i === 0));
    s.identity.selection.replace(s.identity, []);
    view.dispose();
  }
  [filtered, s].forEach((item) => item.dispose());
});

test("a Group key leaks nothing when a column fails", async () => {
  const s = table();
  for (const by of [[bin("x", 3), "g"], hexbin("x", "y")])
    await assert.rejects(runTransform("Group", s, { by, columns: { m: mean("nope") } }), /nope/);
  // A failed visibility readback must release the mask before any view owns it.
  const read = JaxArray.prototype.data;
  JaxArray.prototype.data = async function (...args) {
    await read.apply(this, args); // consume the reference as the device read does
    throw Error("readback failed");
  };
  try {
    await assert.rejects(runTransform("Group", s, { by: bin("x", [-5, 0, 5]) }), /readback failed/);
  } finally { JaxArray.prototype.data = read; }
  s.dispose();
});


test("bin keys reuse assignments and nested grouping across repeated runs", async () => {
  const scope = table(), cache = {}, config = { by: [bin("x", 5), bin("y", 7)] };
  const read = JaxArray.prototype.data;
  let reads = 0, first, second;
  JaxArray.prototype.data = function (...args) { reads++; return read.apply(this, args); };
  try {
    first = await runTransform("Group", scope, config, { cache });
    const cold = reads, grouping = cache.keyGrouping.grouping;
    reads = 0;
    second = await runTransform("Group", scope, config, { cache });
    assert.equal(cold - reads, 3, "two extent reads and one group discovery, only on the first run");
    assert.equal(cache.keyGrouping.grouping, grouping, "the discovered groups are retained");
    for (const name of ["x0", "x1", "y0", "y1", "count"])
      close(await values(second, name), await values(first, name), name);
  } finally {
    JaxArray.prototype.data = read;
    first?.dispose(); second?.dispose();
    disposeTransformCache(cache); scope.dispose();
  }
});


test("cached bin groups invalidate for changed edges, rows and masks, and outputs own their arrays", async () => {
  const scope = table(), cache = {};
  for (const [threshold, bins] of [[0, [-5, 0, 5]], [10, [-5, 0, 5]], [10, [-5, -2, 2, 5]]]) {
    const filtered = await runTransform("Filter", scope, { where: { field: "v", op: "gte", value: threshold } });
    const config = { by: bin("x", bins), columns: { m: mean("v") } };
    const actual = await runTransform("Group", filtered, config, { cache });
    const reference = await runTransform("Group", filtered, config);
    try {
      for (const name of ["x0", "x1", "count", "m"])
        close(await values(actual, name), await values(reference, name), name);
    } finally { actual.dispose(); reference.dispose(); filtered.dispose(); }
  }
  scope.update({ x: new Float32Array([0, 1, 2]), v: new Float32Array([2, 4, 6]) });
  const final = await runTransform("Group", scope, { by: bin("x", [-1, 3]), columns: { m: mean("v") } }, { cache });
  disposeTransformCache(cache);
  try {
    close(await values(final, "count"), [3]);
    close(await values(final, "m"), [4]);
  } finally { final.dispose(); scope.dispose(); }
});

test("hexbin keys retain assignments and grouping, invalidate changed inputs, and release independently", async () => {
  const scope = table(), cache = {}, views = [];
  const read = JaxArray.prototype.data;
  let reads = 0;
  JaxArray.prototype.data = function (...args) { reads++; return read.apply(this, args); };
  try {
    const config = { by: hexbin("x", "y", { bins: 8 }), columns: { m: mean("v") } };
    const first = await runTransform("Group", scope, config, { cache }); views.push(first);
    const cold = reads, grouping = cache.keyGrouping.grouping;
    reads = 0;
    const again = await runTransform("Group", scope, config, { cache }); views.push(again);
    assert.equal(cold - reads, 2, "the warm run avoids the extent and group-discovery reads");
    assert.equal(cache.keyGrouping.grouping, grouping);
    for (const name of ["x", "y", "count", "m"])
      close(await values(again, name), await values(first, name), name);
    for (const options of [{ radius: 1 }, { radius: 2, orientation: "flat" }]) {
      const filtered = await runTransform("Filter", scope, { where: { field: "v", op: "gte", value: 10 } }); views.push(filtered);
      const config = { by: hexbin("x", "y", options), columns: { m: mean("v") } };
      const actual = await runTransform("Group", filtered, config, { cache }); views.push(actual);
      const expected = await runTransform("Group", filtered, config); views.push(expected);
      for (const name of ["x", "y", "count", "m"])
        close(await values(actual, name), await values(expected, name), name);
    }
    scope.update({ x: new Float32Array([0, 1]), y: new Float32Array([0, 1]), v: new Float32Array([2, 4]) });
    const last = await runTransform("Group", scope, { by: hexbin("x", "y", { radius: 10 }) }, { cache }); views.push(last);
    disposeTransformCache(cache);
    close(await values(last, "count"), [2]);
    close(await values(last, "x"), [0]);
    close(await values(last, "y"), [0]);
  } finally {
    JaxArray.prototype.data = read;
    views.reverse().forEach(view => view.dispose()); disposeTransformCache(cache); scope.dispose();
  }
});
