import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
const interpolateSlice = (scope, config, options) => runTransform("Slice", scope, config, options);
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { numpy as np, Array as JaxArray, profiler } from "@hmplot/jax";

test("Slice inspection and contributors map compacted rows to physical endpoints", async () => {
  const scope = createDataScope(), views = [];
  scope.update({ id: ["a", "b", "a", "b"], t: [0, 0, 2, 2], x: [1, 10, 3, 30] });
  try {
    const filtered = createDataView(scope, { mask: np.array([0, 1, 0, 1], { dtype: np.int32 }), count: 2 });
    views.push(filtered);
    for (const source of [scope, filtered]) {
      const slice = await interpolateSlice(source, { field: "t", by: "id", at: 1, values: ["x"] });
      views.push(slice);
      const index = source === scope ? 1 : 0;
      assert.deepEqual(await slice.aggregateInfo(index), { index, kind: "slice", id: "b", t: 1, endpoints: [1, 3] });
      const contributors = await slice.contributors(index);
      assert.deepEqual(Array.from(await contributors.data()), [1, 3]);
    }
  } finally { views.reverse().forEach((view) => view.dispose()); scope.dispose(); }
});

test("masked Slice reuses ordering and duplicate validation across time, but rechecks new masks", async () => {
  const scope = createDataScope(),
    cache = {},
    views = [];
  scope.update({
    id: ["b", "a", "b", "a", "b"],
    t: [0, 0, 0, 1, 1],
    x: [10, 1, 20, 2, 30],
  });
  const masked = (mask) => {
    const view = createDataView(scope, {
      mask: np.array(mask, { dtype: np.int32 }),
      count: mask.reduce((a, b) => a + b, 0),
    });
    views.push(view);
    return view;
  };
  const slice = async (input, at) => {
    const view = await interpolateSlice(
      input,
      { field: "t", by: "id", at, values: ["x"] },
      { cache },
    );
    views.push(view);
    return view;
  };
  const labels = async (view) => {
    const column = view.get("id");
    return Array.from(
      await column.codes.ref.data(),
      (code) => column.categories[code],
    );
  };
  const data = JaxArray.prototype.data;
  let reads = 0,
    sorts = 0;
  try {
    const first = masked([0, 1, 1, 1, 1]);
    assert.deepEqual(await labels(await slice(first, 0)), ["a", "b"]);
    JaxArray.prototype.data = function (...args) {
      reads++;
      return data.apply(this, args);
    };
    profiler.setOpHook((name) => {
      if (name === "argsort") sorts++;
    });
    await slice(first, 0.25);
    await slice(first, 0.75);
    assert.equal(
      reads,
      0,
      "time alone needs neither duplicate validation nor count readback",
    );
    assert.equal(sorts, 0, "time alone needs no ordering sort");
    profiler.setOpHook(null);
    JaxArray.prototype.data = data;
    assert.deepEqual(await labels(await slice(masked([1, 1, 0, 1, 1]), 0.5)), [
      "b",
      "a",
    ]);
    const invalid = masked([1, 1, 1, 1, 1]);
    await assert.rejects(slice(invalid, 0.5), /unique key\/time/);
    reads = 0;
    JaxArray.prototype.data = function (...args) {
      reads++;
      return data.apply(this, args);
    };
    await assert.rejects(slice(invalid, 0.75), /unique key\/time/);
    assert.equal(
      reads,
      0,
      "the same invalid mask stays invalid without another download",
    );
  } finally {
    profiler.setOpHook(null);
    JaxArray.prototype.data = data;
    views.reverse().forEach((view) => view.dispose());
    cache.slice?.dispose();
    scope.dispose();
  }
});
test("Slice topology certifies endpoints and membership for compact and padded rows", async () => {
  const scope = createDataScope(), views = [], caches = [];
  scope.update({ id: ["a", "a", "a", "b", "b"], t: [0, 1, 2, 0, 2], x: [0, 10, 20, 100, 120] });
  const masked = (mask) => {
    const view = createDataView(scope, { mask: np.array(mask, { dtype: np.int32 }), count: mask.reduce((a, b) => a + b, 0) });
    views.push(view);
    return view;
  };
  try {
    for (const input of [scope, masked([1, 1, 1, 1, 1])]) {
      const cache = {}; caches.push(cache);
      const slice = async (at, rows = input) => {
        const view = await interpolateSlice(rows, { field: "t", by: "id", at, values: ["x"] }, { cache });
        views.push(view);
        return view;
      };
      const a = await slice(0.25), b = await slice(0.75);
      assert.equal(a.topology, b.topology, "interpolation inside unchanged brackets reuses topology");
      assert.deepEqual(Array.from(await b.get("x").ref.data()), [7.5, 107.5]);
      const exact = await slice(1), after = await slice(1.25);
      assert.notEqual(exact.topology, b.topology, "an exact endpoint changes provenance");
      assert.notEqual(after.topology, exact.topology);
      assert.equal((await slice(1.75)).topology, after.topology);
      assert.notEqual((await slice(3)).topology, after.topology, "leaving the active span invalidates");
      const returned = await slice(1.75);
      assert.notEqual(returned.topology, after.topology, "returning from inactive rows invalidates");
      const hidden = await slice(1.75, masked([1, 1, 1, 0, 0]));
      assert.notEqual(hidden.topology, returned.topology, "changed masks invalidate");
      assert.deepEqual(Array.from(await hidden.get("x").ref.data()), [17.5]);
    }
  } finally {
    views.reverse().forEach(view => view.dispose());
    caches.forEach(cache => cache.slice?.dispose());
    scope.dispose();
  }
});

async function run(data, config) {
  const s = createDataScope();
  s.update(data);
  try {
    const v = await interpolateSlice(s, config);
    try {
      return Object.fromEntries(
        await Promise.all(
          v
            .keys()
            .map(async (k) => [
              k,
              Array.from(await (v.get(k).codes ?? v.get(k)).ref.data()),
            ]),
        ),
      );
    } finally {
      v.dispose();
    }
  } finally {
    s.dispose();
  }
}
test("Slice matches keys across irregular records in original entity order", async () => {
  const r = await run(
    {
      id: ["B", "A", "B", "A"],
      time: [1, 0, 3, 2],
      x: [10, 0, 20, 4],
      region: ["b", "a", "c", "d"],
    },
    { field: "time", at: 1.5, by: "id" },
  );
  assert.deepEqual(r.x, [12.5, 3]);
  assert.deepEqual(r.region, [0, 3]);
  assert.deepEqual(r.time, [1.5, 1.5]);
});
test("Slice omits unbracketed entities and retains exact endpoints", async () => {
  const r = await run(
    { id: ["A", "A", "B", "B"], time: [0, 2, 1, 3], x: [0, 4, 10, 20] },
    { field: "time", at: 0, by: "id" },
  );
  assert.deepEqual(r.x, [0]);
  const empty = await run(
    { time: [0, 1], x: [1, 2] },
    { field: "time", at: 2 },
  );
  assert.deepEqual(empty.x, []);
});
test("Slice category midpoint chooses earlier record and duplicate keys reject", async () => {
  const r = await run(
    { time: [0, 2], region: ["A", "B"] },
    { field: "time", at: 1 },
  );
  assert.deepEqual(r.region, [0]);
  await assert.rejects(
    run({ time: [1, 1], x: [1, 2] }, { field: "time", at: 1 }),
    /unique/,
  );
});
test("Slice aborts before allocating replacement data", async () => {
  const s = createDataScope();
  s.update({ time: [0, 1], x: [1, 2] });
  const c = new AbortController();
  c.abort();
  try {
    await assert.rejects(
      interpolateSlice(s, { field: "time", at: 0 }, { signal: c.signal }),
      { name: "AbortError" },
    );
  } finally {
    s.dispose();
  }
});

 test("Slice batches many entities without changing ordering or tail interpolation",async()=>{
 const ids=Array.from({length:129},(_,i)=>"entity"+i);
 const r=await run({id:[...ids,...ids],time:[...ids.map(()=>0),...ids.map(()=>2)],x:[...ids.map((_,i)=>i),...ids.map((_,i)=>i+4)]},{field:"time",at:.5,by:"id"});
 assert.deepEqual(r.x,ids.map((_,i)=>i+1));
 });

// TODO 17.14a: Slice reads each entity's bracketing rows from one (entity, time) sort instead of
// an [entities x rows] mask. Checked against a brute-force reference on irregular data: missing
// and repeated times per entity (repeats hidden by a Filter), missing times, a category column,
// and times before, between, at and after the samples.

function reference(table, keep, at) {
  const n = table.id.length, entities = new Map();
  for (let r = 0; r < n; r++) {
    if (!keep(r)) continue;
    if (!entities.has(table.id[r])) entities.set(table.id[r], []);
    entities.get(table.id[r]).push(r);
  }
  const out = { id: [], x: [], c: [] };
  for (const [id, rows] of entities) {
    const finite = rows.filter((r) => Number.isFinite(table.t[r]));
    const below = finite.filter((r) => table.t[r] <= at), above = finite.filter((r) => table.t[r] >= at);
    if (!below.length || !above.length) continue;
    const lo = below.reduce((a, r) => (table.t[r] > table.t[a] ? r : a)), hi = above.reduce((a, r) => (table.t[r] < table.t[a] ? r : a));
    const t = table.t[hi] === table.t[lo] ? 0 : (at - table.t[lo]) / (table.t[hi] - table.t[lo]);
    out.id.push(id);
    out.x.push(t === 0 ? table.x[lo] : table.x[lo] * (1 - t) + table.x[hi] * t);
    out.c.push(t <= 0.5 ? table.c[lo] : table.c[hi]);
  }
  return out;
}
test("Slice equals a brute-force reference, with and without a Filter's mask", async () => {
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const n = 400, categories = ["a", "b", "c"];
  const table = { id: [], t: [], x: [], c: [], keep: [] };
  for (let r = 0; r < n; r++) {
    table.id.push(Math.floor(random() * 23));
    // Times on a coarse grid repeat within an entity; every repeat but one is hidden below.
    table.t.push(random() < 0.03 ? NaN : Math.floor(random() * 40) / 2);
    table.x.push(random() * 10 - 5);
    table.c.push(categories[Math.floor(random() * 3)]);
  }
  const seen = new Set();
  for (let r = 0; r < n; r++) {
    const key = `${table.id[r]}:${table.t[r]}`;
    table.keep.push(!seen.has(key) && random() < 0.8 ? 1 : 0);
    if (table.keep[r]) seen.add(key);
  }
  const scope = createDataScope();
  scope.update({ id: Float32Array.from(table.id), t: Float32Array.from(table.t), x: Float32Array.from(table.x), c: table.c, keep: Float32Array.from(table.keep) });
  const filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0.5 } });
  const cache = {};
  try {
    for (const at of [-1, 0, 3.25, 7.5, 10, 12.3, 19.5, 25]) {
      const view = await runTransform("Slice", filtered, { field: "t", by: "id", at, values: ["x", "c"] }, { cache });
      try {
        const expected = reference(table, (r) => table.keep[r], at);
        const read = async (k) => Array.from(await (view.get(k).codes ?? view.get(k)).ref.data());
        const [id, x, c] = await Promise.all(["id", "x", "c"].map(read));
        const label = `at ${at}`;
        assert.deepEqual(id, expected.id, label);
        x.forEach((value, i) => assert.ok(Math.abs(value - expected.x[i]) < 1e-4, `${label} x[${i}] ${value} vs ${expected.x[i]}`));
        assert.deepEqual(c.map((code) => view.get("c").categories[code]), expected.c, label);
      } finally {
        view.dispose();
      }
    }
    // Without a mask the repeated times are an error.
    await assert.rejects(runTransform("Slice", scope, { field: "t", by: "id", at: 3 }), /unique key\/time/);
  } finally {
    cache.slice?.dispose();
    filtered.dispose();
    scope.dispose();
  }
});

// TODO 25.3: inside the span where every entity with a shown, timed row is active (from the
// latest first time to the earliest last time), the Slice knows its count and selection and
// reads nothing back; outside it, and for a new mask, it reads as before. Checked against the
// reference, with the readbacks (Array.data) counted per run.
test("Slice reads back nothing for a time inside its active span, with and without a mask", async () => {
  // Entities 0-4 have times 0..9; entity 5 has 3..6 (the span is [3, 6]); entity 6 has no time.
  const table = { id: [], t: [], x: [], c: [], hide: [] };
  const add = (id, t, x) => { table.id.push(id); table.t.push(t); table.x.push(x); table.c.push(["a", "b"][(id + t) % 2 | 0] ?? "a"); };
  for (let id = 0; id < 5; id++) for (let t = 0; t < 10; t++) add(id, t, id * 10 + t * t);
  for (let t = 3; t <= 6; t++) add(5, t, -t);
  add(6, NaN, 1); add(6, NaN, 2);
  // hide: 1 on entity 5's rows (a mask that widens the span to [0, 9]).
  table.hide = table.id.map((id) => (id === 5 ? 1 : 0));
  const scope = createDataScope();
  scope.update({ id: Float32Array.from(table.id), t: Float32Array.from(table.t), x: Float32Array.from(table.x), c: table.c,
    hide: Float32Array.from(table.hide), all: Float32Array.from(table.id, () => 1) });
  const reads = { count: 0 }, data = JaxArray.prototype.data;
  JaxArray.prototype.data = function (...args) { reads.count++; return data.apply(this, args); };
  const check = async (input, keep, at, cache, label) => {
    reads.count = 0;
    const view = await runTransform("Slice", input, { field: "t", by: "id", at, values: ["x", "c"] }, { cache });
    const counted = reads.count;
    try {
      const expected = reference(table, keep, at);
      const read = async (k) => Array.from(await (view.get(k).codes ?? view.get(k)).ref.data());
      const [id, x, c] = await Promise.all(["id", "x", "c"].map(read));
      assert.equal(view.length, expected.id.length, `${label} count`);
      assert.deepEqual(id, expected.id, label);
      x.forEach((value, i) => assert.ok(Math.abs(value - expected.x[i]) < 1e-4, `${label} x[${i}] ${value} vs ${expected.x[i]}`));
      assert.deepEqual(c.map((code) => view.get("c").categories[code]), expected.c, label);
    } finally { view.dispose(); }
    return counted;
  };
  const kept = await runTransform("Filter", scope, { where: { field: "all", op: "gt", value: 0.5 } });
  const hidden = await runTransform("Filter", scope, { where: { field: "hide", op: "lt", value: 0.5 } });
  const caches = [{}, {}];
  try {
    for (const [input, keep, cache, name] of [[scope, () => true, caches[0], "no mask"], [kept, () => true, caches[1], "mask"]]) {
      await check(input, keep, 4, cache, `${name} warm`);
      for (const at of [3, 4.5, 6]) assert.equal(await check(input, keep, at, cache, `${name} at ${at}`), 0, `${name} at ${at}: no readback`);
      for (const at of [1, 8.5, -1, 12]) assert.ok(await check(input, keep, at, cache, `${name} at ${at}`) > 0, `${name} at ${at}: outside the span`);
      assert.equal(await check(input, keep, 5, cache, `${name} back inside`), 0, `${name} back inside: no readback`);
    }
    // A new mask (entity 5 hidden): the span is read once, then [0, 9] needs nothing.
    const keep = (r) => !table.hide[r];
    assert.equal(await check(hidden, keep, 5, caches[1], "new mask"), 1, "new mask: one readback for the span");
    for (const at of [0, 1, 8.5, 9]) assert.equal(await check(hidden, keep, at, caches[1], `new mask at ${at}`), 0, `new mask at ${at}`);
  } finally {
    JaxArray.prototype.data = data;
    caches.forEach((cache) => cache.slice?.dispose());
    [hidden, kept, scope].forEach((item) => item.dispose());
  }
});
