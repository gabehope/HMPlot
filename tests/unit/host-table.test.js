// A table on the host (TODO 145.1): readTable reads a scope's visible rows, as a transform
// handle's and a Data's read() return them.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { mean } from "../../src/lib/plot/utils/expressions.js";
import { readTable } from "../../src/lib/plot/utils/readback.js";
import { LIMITS } from "../../src/lib/plot/utils/limits.js";

const data = (value) => {
  const s = createDataScope();
  s.update(value);
  return s;
};
const N = 60;
const route = Array.from({ length: N }, (_, i) => ["a", "b", "c", "d"][i % 4]);
const delay = Array.from({ length: N }, (_, i) => (i * 13) % 50);

test("a Group of filtered rows reads back as the host computes it", async () => {
  const s = data({ route, delay: Float32Array.from(delay) });
  const filtered = await runTransform("Filter", s, { where: { field: "delay", op: "gte", value: 10 } });
  const grouped = await runTransform("Group", filtered, { by: "route", columns: { mean_delay: mean("delay") } });
  const table = await readTable(grouped);
  const expected = new Map();
  route.forEach((key, i) => {
    if (delay[i] < 10) return;
    const entry = expected.get(key) ?? { n: 0, sum: 0 };
    entry.n++; entry.sum += delay[i];
    expected.set(key, entry);
  });
  assert.equal(table.length, expected.size);
  assert.deepEqual(Object.keys(table.columns).sort(), ["count", "mean_delay", "route"]);
  table.columns.route.forEach((key, i) => {
    const { n, sum } = expected.get(key);
    assert.equal(table.columns.count[i], n);
    assert.ok(Math.abs(table.columns.mean_delay[i] - sum / n) < 1e-4);
  });
  assert.ok(table.columns.count instanceof Float64Array);
  assert.equal(table.version, grouped.version);
  [grouped, filtered, s].forEach((scope) => scope.dispose());
});

test("rows: true gives one object per row, null where a number is missing", async () => {
  const s = data({ name: ["x", "y", "z"], value: Float32Array.from([1, NaN, 3]) });
  const { rows, length } = await readTable(s, { rows: true });
  assert.equal(length, 3);
  assert.deepEqual(rows, [{ name: "x", value: 1 }, { name: "y", value: null }, { name: "z", value: 3 }]);
  s.dispose();
});

test("columns picks and orders; a name that is not a column is an error naming the columns", async () => {
  const s = data({ a: [1, 2], b: ["p", "q"], c: [5, 6] });
  const table = await readTable(s, { columns: ["c", "b"] });
  assert.deepEqual(Object.keys(table.columns), ["c", "b"]);
  assert.deepEqual(Array.from(table.columns.c), [5, 6]);
  await assert.rejects(readTable(s, { columns: ["d"], component: "Group" }),
    /Group: read\(\) asked for "d", which is not a column of this table \(its columns: a, b, c\)/);
  await assert.rejects(readTable(s, { columns: ["@brushed"] }), /not a column/);
  s.dispose();
});

test("past limit.readback, an error names the component and what to read instead", async () => {
  const big = new Float64Array(Math.ceil(LIMITS.readback.value / 8) + 1);
  const scope = { length: big.length, version: 1, keys: () => ["x"], has: () => true, get: () => big, metadata: () => undefined };
  await assert.rejects(readTable(scope, { component: "Filter" }), (error) => {
    assert.match(error.message, /^Filter: a table read back to the host needs .* MiB; the limit is 16 MiB\. Read fewer columns/);
    assert.equal(error.code, "limit.readback");
    return true;
  });
});

test("limit reads the first rows only, of device and host columns alike", async () => {
  const s = data({ route, delay: Float32Array.from(delay) });
  const grouped = await runTransform("Group", s, { by: "route", columns: { mean_delay: mean("delay") } });
  const all = await readTable(grouped), two = await readTable(grouped, { limit: 2 });
  assert.equal(two.length, all.length);
  for (const key of Object.keys(all.columns)) assert.deepEqual(Array.from(two.columns[key]), Array.from(all.columns[key]).slice(0, 2));
  const host = await readTable(s, { limit: 3, rows: true });
  assert.deepEqual(host.rows.map((r) => r.route), route.slice(0, 3));
  assert.equal((await readTable(s, { limit: 0 })).columns.route.length, 0);
  await assert.rejects(readTable(s, { limit: -1 }), /takes a whole number of rows/);
  [grouped, s].forEach((scope) => scope.dispose());
});
