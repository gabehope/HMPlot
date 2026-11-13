import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { gridTable } from "../../src/lib/plot/utils/gridTable.js";
import { runTransform, disposeTransformCache } from "../../src/lib/plot/utils/transforms.js";
import { random, row, add, col, evaluateExpression, expressionDescriptor,
  expressionFromDescriptor, expressionFields, mean, releaseReductionCache } from "../../src/lib/plot/utils/expressions.js";
import { input, resolveInputs } from "../../src/lib/plot/utils/inputs.js";

const read = async (view, key) => Array.from(await view.get(key).ref.data());
const values = async (expression, rows) => {
  const result = evaluateExpression(expression, null, { rowCount: rows });
  try { return Array.from(await result.value.ref.data()); }
  finally { result.dispose(); }
};

test("seeded random expressions reproduce per-row standard distributions and decode identically", async () => {
  for (const distribution of ["uniform", "normal", "exponential"]) {
    const expression = random({ seed: 7, distribution });
    const first = await values(expression, 4096);
    assert.deepEqual(first, await values(expressionFromDescriptor(expressionDescriptor(expression)), 4096));
    assert.notDeepEqual(first, await values(random({ seed: 8, distribution }), 4096));
    assert.deepEqual([...expressionFields(expression)], []);
    assert.equal(first.length, 4096);
    assert.ok(first.every(Number.isFinite));
    const mean = first.reduce((sum, value) => sum + value, 0) / first.length;
    assert.ok(Math.abs(mean - (distribution === "normal" ? 0 : distribution === "uniform" ? 0.5 : 1)) < 0.08);
    if (distribution === "uniform") assert.ok(first.every(value => value >= 0 && value < 1));
    if (distribution === "exponential") assert.ok(first.every(value => value >= 0));
    if (distribution === "normal") assert.ok(Math.abs(first.reduce((sum, value) => sum + value * value, 0) / first.length - 1) < 0.1);
  }
  assert.deepEqual(await values(random(), 8), await values(random({ seed: 0 }), 8));
  assert.deepEqual(await values(random(), 0), []);
});

test("random validates before drawing and scalar input seeds resolve without column reads", async () => {
  for (const seed of [-1, 1.5, NaN, Infinity, 4294967296, true, "7", null])
    assert.throws(() => random({ seed }), /random\(\) seed must be an integer/);
  for (const distribution of ["poisson", "", null, 3])
    assert.throws(() => random({ distribution }), /random\(\) distribution/);
  assert.throws(() => random({ count: 3 }), /does not accept "count"/);
  assert.throws(() => random(null), /options must be an object/);
  assert.throws(() => evaluateExpression(random(), null), /random\(\) needs a table row count/);
  assert.throws(() => evaluateExpression(random({ seed: col.seed }), null, { rowCount: 3 }), /scalar input, not a table column/);
  const { columns } = resolveInputs({ columns: { draw: random({ seed: add(input.seed, 1) }) } },
    { read: name => { assert.equal(name, "seed"); return 6; } }, "Calculate");
  assert.deepEqual(await values(columns.draw, 8), await values(random({ seed: 7 }), 8));
  const boundary = random({ seed: 4294967295 });
  assert.deepEqual(await values(expressionFromDescriptor(expressionDescriptor(boundary)), 8), await values(boundary, 8));
  assert.ok((await values(boundary, 8)).every(Number.isFinite));
});

test("random draws and reductions share a cache without invalidating retained evaluations on release", async () => {
  const source = createDataScope(), cache = new Map();
  source.update({ x: [1, 2, 3, 4] });
  const reduction = mean("x"), expression = add(random({ seed: 7 }), reduction);
  let first, retained, after;
  try {
    first = evaluateExpression(expression, source, { reductionCache: cache });
    const expected = Array.from(await first.value.ref.data());
    assert.equal(cache.size, 2);
    assert.ok(cache.has(reduction), "reductions are keyed by expression identity");
    const [key] = [...cache.keys()].filter(key => typeof key === "string");
    assert.equal(key, "random:4:7:uniform");
    const cached = [...cache.values()].map(entry => entry.value);
    first.dispose(); first = null;
    assert.ok(cached.every(array => array.refCount > 0), "the cache owns its stored arrays");
    retained = evaluateExpression(expression, source, { reductionCache: cache });
    releaseReductionCache(cache);
    assert.equal(cache.size, 0);
    assert.equal(cache.released, true);
    assert.deepEqual(Array.from(await retained.value.ref.data()), expected);
    retained.dispose(); retained = null;
    assert.ok(cached.every(array => array.refCount === 0), "all cache and evaluation references are released");
    after = evaluateExpression(expression, source, { reductionCache: cache });
    assert.deepEqual(Array.from(await after.value.ref.data()), expected);
    assert.equal(cache.size, 0, "a released cache is never repopulated");
  } finally {
    first?.dispose(); retained?.dispose(); after?.dispose();
    releaseReductionCache(cache); source.dispose();
  }
});

test("Calculate retains immutable random draws across unrelated changes, then retires changed seeds and sizes", async () => {
  const source = createDataScope(), cache = {}, outputs = [];
  const run = async seed => {
    const out = await runTransform("Calculate", source, { columns: { draw: random({ seed }) } }, { cache });
    outputs.push(out); return out;
  };
  source.update({ x: [1, 2, 3, 4] });
  let held;
  try {
    const first = await run(7), entry = [...cache.expressionConstants.values()][0];
    held = entry.value.ref;
    const expected = await read(first, "draw");
    source.update({ x: [5, 6, 7, 8] });
    const second = await run(7);
    assert.equal([...cache.expressionConstants.values()][0].value, entry.value);
    assert.deepEqual(await read(second, "draw"), expected);
    const changed = await run(8);
    assert.equal(cache.expressionConstants.size, 1);
    assert.notEqual([...cache.expressionConstants.values()][0].value, entry.value);
    assert.notDeepEqual(await read(changed, "draw"), expected);
    assert.deepEqual(Array.from(await held.ref.data()), expected, "retained old output stays coherent");
    source.update({ x: [1, 2] });
    assert.equal((await read(await run(8), "draw")).length, 2);
    assert.equal(cache.expressionConstants.size, 1);
    const none = await runTransform("Calculate", source, { columns: { plain: add("x", 1) } }, { cache }); outputs.push(none);
    assert.equal(cache.expressionConstants.size, 0, "removing the expression disposes its cache entry");
    await assert.rejects(runTransform("Calculate", source, { columns: { bad: add(random({ seed: 9 }), "missing") } }, { cache }), /missing field/);
  } finally {
    outputs.forEach(output => output.dispose()); disposeTransformCache(cache); source.dispose();
  }
  assert.equal(held.refCount, 1, "producer, readers and failed evaluations released all other references");
  held.dispose();
  assert.equal(cache.expressionConstants, null);
});

test("random columns retain source values through filtering and sampling; a masked Calculate uses physical rows", async () => {
  const source = createDataScope();
  source.update(undefined, undefined, { rows: 32 });
  const views = [], cache = {};
  try {
    const calculated = await runTransform("Calculate", source, { columns: { draw: random({ seed: 7 }), row: row() } }, { cache }); views.push(calculated);
    const expected = await read(calculated, "draw");
    const filtered = await runTransform("Filter", calculated, { where: { field: "row", op: "gt", value: 20 } }); views.push(filtered);
    const sampled = await runTransform("Sample", filtered, { size: 4, seed: 42 }); views.push(sampled);
    const ids = Array.from(await sampled.sourceIndices().data());
    assert.deepEqual(await read(sampled, "draw"), ids.map(row => expected[row]));
    const repeated = await runTransform("Calculate", filtered, { columns: { draw: random({ seed: 7 }) } }); views.push(repeated);
    assert.deepEqual(await read(repeated, "draw"), expected.slice(21), "selection buckets must not resample the hidden prefix");
  } finally { views.reverse().forEach(view => view.dispose()); disposeTransformCache(cache); source.dispose(); }
});

test("random fields preserve grid metadata but per-row randomized coordinates drop the grid", async () => {
  const source = createDataScope(), views = [];
  source.update(gridTable({ dims: { y: [0, 1], x: [0, 1, 2] }, columns: { value: [1, 2, 3, 4, 5, 6] } }));
  const warn = console.warn; console.warn = () => {};
  try {
    const field = await runTransform("Calculate", source, { columns: { noise: random({ seed: 7 }) } }); views.push(field);
    assert.equal(field.grid, source.grid);
    assert.equal((await read(field, "noise")).length, 6);
    const position = await runTransform("Calculate", source, { columns: { x: add("x", random({ seed: 7 })) } }); views.push(position);
    assert.ok(!position.grid);
    assert.equal((await read(position, "x")).length, 6);
  } finally { console.warn = warn; views.reverse().forEach(view => view.dispose()); source.dispose(); }
});


test("row numbers enumerate visible rows and can be retained before filtering", async () => {
  const source = createDataScope(), views = [];
  source.update(undefined, undefined, { rows: 9 });
  try {
    const numbered = await runTransform("Calculate", source, { columns: { original: row() } }); views.push(numbered);
    assert.deepEqual(await read(numbered, "original"), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const filtered = await runTransform("Filter", numbered, { where: { field: "original", op: "gte", value: 5 } }); views.push(filtered);
    const current = await runTransform("Calculate", filtered, { columns: { current: row(), shifted: add(row(), 1) } }); views.push(current);
    assert.deepEqual(await read(current, "original"), [5, 6, 7, 8]);
    assert.deepEqual(await read(current, "current"), [0, 1, 2, 3]);
    assert.deepEqual(await read(current, "shifted"), [1, 2, 3, 4]);
    assert.deepEqual(expressionFromDescriptor(expressionDescriptor(row())), row());
    await assert.rejects(runTransform("Group", numbered, { by: "original", columns: { bad: row() } }), /row operation/);
  } finally { views.reverse().forEach(view => view.dispose()); source.dispose(); }
});
