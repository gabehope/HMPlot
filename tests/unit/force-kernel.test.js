// TODO 30.2, 30.3: Force's tick as one jitted program, with link sums over edges sorted by
// endpoint, against a float64 host reference.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { assertReused } from "./compiled-programs.js";
import {
  lowerBound,
  segmentedScan,
  runTotals,
  edgeRuns,
  forceTick,
  kernelLimits,
} from "../../src/lib/plot/utils/forceKernel.js";
import { deviceArray } from "../../src/lib/plot/utils/deviceParams.js";
import { forceSettings, forcePlan, forceScalars } from "../../src/lib/plot/utils/force.js";

function random(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const values = async (a) => Array.from(await a.ref.data(), Number);

test("lowerBound counts the sorted entries below each query", async () => {
  const sorted = [0, 0, 1, 3, 3, 3, 7];
  const queries = [-1, 0, 1, 2, 3, 4, 7, 8];
  const s = np.array(sorted), q = np.array(queries);
  const found = lowerBound(s, q);
  assert.deepEqual(await values(found), queries.map((v) => sorted.filter((x) => x < v).length));
  [s, q, found].forEach((a) => a.dispose());
  for (const m of [0, 1, 2, 5, 64, 65]) {
    const keys = Array.from({ length: m }, (_, i) => Math.floor(i / 3));
    const s = np.array(keys.length ? keys : [], { dtype: np.float32 }).reshape([m]);
    const q = np.array([0, 1, 2, 100]);
    const found = lowerBound(s, q);
    assert.deepEqual(await values(found), [0, 1, 2, 100].map((v) => keys.filter((x) => x < v).length), `m=${m}`);
    [s, q, found].forEach((a) => a.dispose());
  }
});

test("segmented scans give each run's total, empty runs zero", async () => {
  const next = random(7);
  const n = 9;
  const keys = Array.from({ length: 40 }, () => Math.floor(next() * n)).filter((k) => k !== 4).sort((a, b) => a - b);
  const rows = keys.map(() => [next() * 1000 - 500, next() * 2 - 1]);
  const k = np.array(keys, { dtype: np.float32 }), v = np.array(rows);
  const nodes = np.arange(n).astype(np.float32), after = nodes.ref.add(1);
  const start = lowerBound(k, nodes), end = lowerBound(k, after);
  const scanned = segmentedScan(v, k), totals = runTotals(scanned, start, end);
  const got = await values(totals);
  for (let node = 0; node < n; node++)
    for (let axis = 0; axis < 2; axis++) {
      const want = keys.reduce((sum, key, i) => sum + (key === node ? rows[i][axis] : 0), 0);
      assert.ok(Math.abs(got[node * 2 + axis] - want) <= 1e-3 * Math.max(1, Math.abs(want)), `node ${node}: ${got[node * 2 + axis]} vs ${want}`);
    }
  [k, nodes, after, start, end, scanned, totals].forEach((a) => a.dispose());
});

test("edge runs count each endpoint once: self loops twice, duplicates each", async () => {
  const from = np.array([0, 0, 1, 2, 3], { dtype: np.int32 }), to = np.array([1, 1, 1, 3, 3], { dtype: np.int32 });
  const runs = edgeRuns(from, to, 5);
  assert.deepEqual(await values(runs.degree), [2, 4, 1, 3, 0]);
  [from, to, runs.order, runs.keys, runs.start, runs.end, runs.degree].forEach((a) => a.dispose());
});

/** One tick in float64 on the host: the simultaneous springs, exact repulsion and pins. */
function referenceTick({ n, d, from, to, weights }, position, velocity, pins, pinPosition, p) {
  const [distance, spring, repulsion, centering, damping] = p;
  const force = position.map(() => new Array(d).fill(0));
  from.forEach((a, edge) => {
    const b = to[edge];
    const delta = position[b].map((v, k) => v - position[a][k]);
    const length = Math.sqrt(delta.reduce((s, v) => s + v * v, 0) + 1e-6);
    for (let k = 0; k < d; k++) {
      const f = (delta[k] / length) * (length - distance) * weights[edge] * spring;
      force[a][k] += f;
      force[b][k] -= f;
    }
  });
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const raw = position[i].map((v, k) => v - position[j][k]);
      const d2 = raw.reduce((s, v) => s + v * v, 0);
      for (let k = 0; k < d; k++) force[i][k] += (raw[k] / Math.max(d2, 1e-3)) * repulsion;
    }
  const nextVelocity = velocity.map((v, i) => v.map((x, k) => (x + force[i][k] - position[i][k] * centering) * damping));
  return {
    position: position.map((x, i) => (pins[i] ? pinPosition[i] : x.map((v, k) => v + nextVelocity[i][k]))),
    velocity: nextVelocity.map((v, i) => (pins[i] ? v.map(() => 0) : v)),
  };
}

for (const [d, blocks] of [[2, 1], [3, 1], [2, 5]])
  test(`${d}D: one jitted tick matches the host reference (duplicates, self loops, pins; ${blocks} row blocks)`, async () => {
    const next = random(11 + d + blocks), n = 23;
    const limit = kernelLimits.pairBlock;
    kernelLimits.pairBlock = blocks === 1 ? limit : Math.ceil(n / blocks) * n;
    const from = [], to = [];
    for (let i = 0; i < 40; i++) { from.push(Math.floor(next() * n)); to.push(Math.floor(next() * n)); }
    from.push(3, 3, 5); to.push(4, 4, 5); // a duplicate edge and a self loop
    const weights = from.map(() => 0.5 + next());
    const position = Array.from({ length: n }, () => Array.from({ length: d }, () => next() * 200 - 100));
    const velocity = Array.from({ length: n }, () => Array.from({ length: d }, () => next() - 0.5));
    const pins = Array.from({ length: n }, (_, i) => i % 7 === 0);
    const pinPosition = position.map((x) => x.map((v) => v + 5));
    const alpha = 0.97, p = [30, 0.1 * alpha, 30 * alpha, 0.01 * alpha, 0.6];
    const topology = { from: np.array(from, { dtype: np.int32 }), to: np.array(to, { dtype: np.int32 }) };
    topology.runs = edgeRuns(topology.from, topology.to, n);
    // The default forces (Force's props before Stage 30), the link weighted by a column.
    const config = forceSettings({ dimensions: d, weight: "w" }), planned = forcePlan(config.forceSpecs, config);
    const arrays = {
      position: np.array(position), velocity: np.array(velocity),
      pins: np.array(pins, { dtype: np.bool }), pinPosition: np.array(pinPosition),
      params: forceScalars(planned, config, alpha), weights: np.array(weights),
    };
    try {
      const [nextPosition, nextVelocity] = forceTick(planned.plan, topology, arrays.position, arrays.velocity, arrays.pins,
        arrays.pinPosition, arrays.params, [arrays.weights]);
      const want = referenceTick({ n, d, from, to, weights }, position, velocity, pins, pinPosition, p);
      const got = { position: await values(nextPosition), velocity: await values(nextVelocity) };
      nextPosition.dispose(); nextVelocity.dispose();
      for (const key of ["position", "velocity"])
        want[key].flat().forEach((v, i) =>
          assert.ok(Math.abs(got[key][i] - v) <= 1e-3 * Math.max(1, Math.abs(v)), `${key}[${i}]: ${got[key][i]} vs ${v}`));
    } finally {
      kernelLimits.pairBlock = limit;
      Object.values(arrays).forEach((a) => a.dispose());
      [topology.from, topology.to, ...Object.values(topology.runs).filter((a) => a?.dispose)].forEach((a) => a.dispose());
    }
  });

test("a tick with other parameters or alpha compiles nothing new", async () => {
  const n = 12, from = np.array([0, 1, 2, 3], { dtype: np.int32 }), to = np.array([1, 2, 3, 0], { dtype: np.int32 });
  const topology = { from, to };
  topology.runs = edgeRuns(from, to, n);
  const position = np.array(Array.from({ length: n }, (_, i) => [Math.cos(i), Math.sin(i) * 3]));
  const velocity = np.zeros([n, 2]), pins = np.zeros([n], { dtype: np.bool });
  const run = (c, alpha) => async () => {
    const config = forceSettings({ dimensions: 2, ...c }), planned = forcePlan(config.forceSpecs, config);
    const params = forceScalars(planned, config, alpha);
    const [a, b] = forceTick(planned.plan, topology, position, velocity, pins, position, params);
    await a.ref.data();
    [params, a, b].forEach((x) => x.dispose());
  };
  try {
    await assertReused(async () => { await run({}, 1)(); await run({ repulsion: 5, linkDistance: 10 }, 0.5)(); },
      async () => { await run({ repulsion: 0, springStrength: 0, centering: 0, velocityDecay: 1 }, 0)(); await run({ repulsion: 200, linkDistance: 100, springStrength: 1 }, 0.01)(); },
      "force tick");
  } finally {
    [position, velocity, pins, from, to, ...Object.values(topology.runs).filter((a) => a?.dispose)].forEach((a) => a.dispose());
  }
});

// Graph construction may read device-resident IDs; Force batches numeric checks separately.
import { Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { forceTopology } from "../../src/lib/plot/utils/force.js";
import { runTransform, disposeTransformCache } from "../../src/lib/plot/utils/transforms.js";
test("graph construction and numeric Force refresh have separate readback budgets", async () => {
  const data_ = JaxArray.prototype.data;
  let reads = 0;
  JaxArray.prototype.data = function (...args) { reads++; return data_.apply(this, args); };
  try {
    for (const [label, columns, extra, graphMost, forceMost] of [
      ["GPU identifiers with weights", { source: np.array([1, 2, 3, 1]), target: np.array([2, 3, 4, 4]), w: Float32Array.from([1, 2, 1, 1]) }, { weight: "w" }, 2, 3],
      ["host identifiers", { source: ["a", "b"], target: ["b", "c"] }, {}, 0, 0],
    ]) {
      const scope = createDataScope();
      scope.update(columns);
      reads = 0;
      const cache = {}, graph = await runTransform("GraphData", scope, {}, { cache });
      assert.ok(reads <= graphMost, `${label}: ${reads} graph-construction readbacks`);
      reads = 0;
      const topology = await forceTopology(graph, extra);
      assert.ok(reads <= forceMost, `${label}: ${reads} Force-construction readbacks`);
      const next = await runTransform("Calculate", scope, { columns: { w: 2 } });
      const nextGraph = await runTransform("GraphData", next, {}, { cache });
      reads = 0;
      await topology.refresh(nextGraph);
      assert.equal(reads, extra.weight ? 1 : 0, `${label}: only changed numeric weights are validated`);
      JaxArray.prototype.data = data_;
      topology.dispose();
      nextGraph.dispose(); next.dispose(); graph.dispose(); disposeTransformCache(cache);
      scope.dispose();
      for (const column of Object.values(columns)) if (column instanceof JaxArray) column.dispose();
      JaxArray.prototype.data = function (...args) { reads++; return data_.apply(this, args); };
    }
    const scope = createDataScope();
    scope.update({ source: Float32Array.from([1, 2]), target: Float32Array.from([2, 3]), w: Float32Array.from([1, -1]) });
    const graph = await runTransform("GraphData", scope, {});
    await assert.rejects(forceTopology(graph, { weight: "w" }), /nonnegative/);
    graph.dispose();
    scope.dispose();
  } finally {
    JaxArray.prototype.data = data_;
  }
});

// TODO 30.1: many-body and collision forces on the spatial grid, against the exact sums, on
// evenly spread, clustered and outlier layouts (the fixed near slots of the first spike failed
// the last two; the near field is now exact, lax.cellPairs, and the bounds ignore outliers).
import { gridManyBody, gridCollide, gridShape, manyBodyExact, collideExact } from "../../src/lib/plot/utils/forceKernel.js";
function gridLayout(kind, n, d, next) {
  const gauss = () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
  if (kind === "uniform") return Array.from({ length: n }, () => Array.from({ length: d }, () => next() * 1000));
  if (kind === "clustered") return Array.from({ length: n }, (_, i) => Array.from({ length: d }, (_, a) => (i % 5) * 150 * (a + 1) + gauss() * 20));
  return Array.from({ length: n }, (_, i) => Array.from({ length: d }, () => (i < 3 ? 50000 * (next() - 0.5) : gauss() * 50)));
}
const relative = (got, want, n, d) => Array.from({ length: n }, (_, i) => {
  let num = 0, den = 0;
  for (let a = 0; a < d; a++) { num += (got[i * d + a] - want[i * d + a]) ** 2; den += want[i * d + a] ** 2; }
  return Math.sqrt(num / Math.max(den, 1e-30));
}).sort((x, y) => x - y);
for (const [d, n] of [[2, 500], [3, 400]])
  for (const layoutKind of ["uniform", "clustered", "outliers"])
    test(`${d}D ${layoutKind}: grid many-body within 5% (p95) of exact, grid collision exact`, async () => {
      const position = np.array(gridLayout(layoutKind, n, d, random(29 + d)));
      const charge = deviceArray([-30]), distanceMin2 = deviceArray([1]), radius = deviceArray([6]), strength = deviceArray([1]);
      const shape = gridShape(n, d);
      const exact = manyBodyExact(position, charge, { distanceMin2 }), grid = gridManyBody(position, charge, shape, { distanceMin2 });
      const errors = relative(await values(grid), await values(exact), n, d);
      assert.ok(errors[Math.floor(n * 0.95)] < 0.05, `p95 relative error ${errors[Math.floor(n * 0.95)]}`);
      const collideWant = collideExact(position, radius, strength), collideGot = gridCollide(position, radius, strength, shape);
      const c = relative(await values(collideGot), await values(collideWant), n, d);
      assert.ok(c[n - 1] < 1e-3, `collision max relative error ${c[n - 1]}`);
      [position, charge, distanceMin2, radius, strength, exact, grid, collideWant, collideGot].forEach((a) => a.dispose());
    });

test("a tick on the grid is close to the exact tick and compiles nothing for new parameters", async () => {
  const n = 500, d = 2, next = random(41);
  const position = np.array(gridLayout("clustered", n, d, next));
  const from = np.array(Array.from({ length: n }, (_, i) => i), { dtype: np.int32 });
  const to = np.array(Array.from({ length: n }, (_, i) => (i + 5) % n), { dtype: np.int32 });
  const topology = { from, to, runs: edgeRuns(from, to, n) };
  const velocity = np.zeros([n, d]), pins = np.zeros([n], { dtype: np.bool });
  const tick = async (c, onGrid) => {
    const minimum = kernelLimits.gridMinimum;
    kernelLimits.gridMinimum = onGrid ? 1 : Infinity;
    try {
      const config = forceSettings({ dimensions: d, ...c }), planned = forcePlan(config.forceSpecs, { ...config, n });
      const params = forceScalars(planned, config, 0.8);
      const [p, v] = forceTick(planned.plan, topology, position, velocity, pins, position, params);
      const out = await values(p);
      [params, p, v].forEach((a) => a.dispose());
      return out;
    } finally {
      kernelLimits.gridMinimum = minimum;
    }
  };
  try {
    const forces = { charge: { type: "manyBody" }, spacing: { type: "collide", radius: 4 } };
    const exact = await tick({ forces }, false), grid = await tick({ forces }, true);
    // Compare the steps each tick took from the same start.
    const start = await values(position);
    const step = (out) => out.map((v, i) => v - start[i]);
    const errors = relative(step(grid), step(exact), n, d);
    assert.ok(errors[Math.floor(n * 0.95)] < 0.05, `p95 step error ${errors[Math.floor(n * 0.95)]}`);
    await assertReused(async () => { await tick({ forces }, true); }, async () => {
      await tick({ forces: { charge: { type: "manyBody", strength: -80 }, spacing: { type: "collide", radius: 9 } } }, true);
    }, "grid tick");
  } finally {
    [position, from, to, velocity, pins, ...Object.values(topology.runs).filter((a) => a?.dispose)].forEach((a) => a.dispose());
  }
});
