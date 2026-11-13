// TODO 30.5-30.8: d3's forces and simulation parameters, forces from node and edge columns.
// One tick of each force alone against d3-force (installed with d3): forces act at once here
// and one after another in d3, so link and collide use edges and overlaps that share no node.
import test from "node:test";
import assert from "node:assert/strict";
import * as d3 from "d3";
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { graphFixture } from './helpers/graphFixture.js';
import { multiply } from "../../src/lib/plot/utils/expressions.js";
import {
  forceTopology,
  forceSettings,
  forcePlan,
  forceSpecs,
  forceStep,
  resolveForceArrays,
} from "../../src/lib/plot/utils/force.js";

function random(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const NO_DEFAULTS = { charge: null, link: null, x: null, y: null };

/** One tick of our Force: `forces` alone (no default forces). */
async function ours({ position, velocity, edges = [], forces, nodeColumns = {}, edgeColumns = {}, settings = {}, alpha }) {
  const n = position.length;
  const scope = createDataScope();
  // A table needs a row: a self loop stands in for no edges (no link force reads it).
  const rows = edges.length ? edges : [[0, 0]];
  scope.update({ source: Float32Array.from(rows, (e) => e[0]), target: Float32Array.from(rows, (e) => e[1]), ...edgeColumns });
  const graph = await graphFixture(scope, { nodes: { id: position.map((_, i) => i), ...nodeColumns } });
  const c = { dimensions: 2, forces: { ...NO_DEFAULTS, ...forces }, ...settings };
  const topology = await forceTopology(graph.scope, c);
  const config = forceSettings(c), planned = forcePlan(config.forceSpecs, config);
  const arrays = await resolveForceArrays(planned, topology, scope);
  const p = np.array(position), v = np.array(velocity), pins = np.zeros([n], { dtype: np.bool });
  try {
    const next = await forceStep(topology, p, v, pins, p, c, alpha, { planned, arrays });
    const [x, vx] = [Array.from(await next.position.data()), Array.from(await next.velocity.data())];
    return { x, v: vx, alpha: next.alpha };
  } finally {
    [p, v, pins, ...arrays].forEach((a) => a.dispose());
    topology.dispose();
    graph.dispose(); scope.dispose();
  }
}
/** One tick of d3-force with `force` alone. */
function theirs({ position, velocity, force, alpha, settings = {} }) {
  const nodes = position.map(([x, y], index) => ({ index, x, y, vx: velocity[index][0], vy: velocity[index][1] }));
  const simulation = d3.forceSimulation(nodes).stop().alpha(alpha)
    .alphaDecay(settings.alphaDecay ?? 1 - Math.pow(0.001, 1 / 300)).alphaTarget(settings.alphaTarget ?? 0)
    .velocityDecay(settings.velocityDecay ?? 0.4);
  simulation.force("f", force(nodes));
  simulation.tick();
  return { x: nodes.flatMap((node) => [node.x, node.y]), v: nodes.flatMap((node) => [node.vx, node.vy]), alpha: simulation.alpha() };
}
function close(got, want, label, tolerance = 1e-3) {
  assert.equal(got.length, want.length, label);
  got.forEach((value, i) =>
    assert.ok(Math.abs(value - want[i]) <= tolerance * Math.max(1, Math.abs(want[i])), `${label}[${i}]: ${value} vs ${want[i]}`));
}
function layout(n, seed, spread = 100) {
  const next = random(seed);
  return {
    position: Array.from({ length: n }, () => [next() * spread - spread / 2, next() * spread - spread / 2]),
    velocity: Array.from({ length: n }, () => [next() - 0.5, next() - 0.5]),
  };
}

const CASES = [
  ["manyBody", { type: "manyBody", strength: -30 }, () => d3.forceManyBody().strength(-30).theta(0)],
  ["manyBody within distanceMax, distanceMin 5", { type: "manyBody", strength: -40, distanceMin: 5, distanceMax: 60 },
    () => d3.forceManyBody().strength(-40).distanceMin(5).distanceMax(60).theta(0)],
  ["x", { type: "x", x: 10, strength: 0.2 }, () => d3.forceX(10).strength(0.2)],
  ["y", { type: "y", y: -5, strength: 0.05 }, () => d3.forceY(-5).strength(0.05)],
  ["radial", { type: "radial", radius: 40, x: 3, y: -2, strength: 0.3 }, () => d3.forceRadial(40, 3, -2).strength(0.3)],
  ["center", { type: "center", x: 5, y: 7, strength: 0.8 }, () => d3.forceCenter(5, 7).strength(0.8)],
];
for (const [label, spec, force] of CASES)
  test(`one tick of ${label} matches d3-force`, async () => {
    const { position, velocity } = layout(17, label.length);
    const got = await ours({ position, velocity, forces: { f: spec }, alpha: 0.7 });
    const want = theirs({ position, velocity, force, alpha: 0.7 });
    close(got.x, want.x, "position");
    close(got.v, want.v, "velocity");
    assert.ok(Math.abs(got.alpha - want.alpha) < 1e-9);
  });

test("one tick of link matches d3-force (disjoint edges; default strength and bias; 2 iterations)", async () => {
  const { position, velocity } = layout(10, 5);
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
  const got = await ours({ position, velocity, edges, forces: { f: { type: "link", distance: 20, iterations: 2 } }, alpha: 0.6 });
  const want = theirs({
    position, velocity, alpha: 0.6,
    force: () => d3.forceLink(edges.map(([source, target]) => ({ source, target }))).distance(20).iterations(2),
  });
  close(got.x, want.x, "position");
  close(got.v, want.v, "velocity");
});

test("one tick of link with per-edge distances and strengths from edge columns matches d3-force", async () => {
  const { position, velocity } = layout(8, 7);
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7]];
  const length = [10, 20, 30, 40], stiffness = [0.2, 0.5, 1, 0.1];
  const got = await ours({
    position, velocity, edges, edgeColumns: { length, stiffness }, alpha: 0.5,
    forces: { f: { type: "link", distance: "length", strength: multiply("stiffness", 2) } },
  });
  const want = theirs({
    position, velocity, alpha: 0.5,
    force: () => d3.forceLink(edges.map(([source, target], i) => ({ source, target, i })))
      .distance((link) => length[link.i]).strength((link) => stiffness[link.i] * 2),
  });
  close(got.x, want.x, "position");
});

test("one tick of collide matches d3-force (overlapping pairs that share no node; per-node radii)", async () => {
  const position = [[0, 0], [3, 1], [50, 50], [52, 49], [-40, 10], [-38, 12], [100, 100]];
  const velocity = position.map((_, i) => [0.1 * i, -0.05 * i]);
  const radii = [2, 3, 1.5, 2, 2.5, 1, 4];
  const got = await ours({ position, velocity, nodeColumns: { r: radii }, forces: { f: { type: "collide", radius: "r", strength: 0.7 } }, alpha: 0.3 });
  const want = theirs({ position, velocity, alpha: 0.3, force: () => d3.forceCollide((node) => radii[node.index]).strength(0.7) });
  close(got.x, want.x, "position");
  close(got.v, want.v, "velocity");
});

test("per-node strengths and targets from node columns; a non-finite one leaves the node out", async () => {
  const { position, velocity } = layout(9, 13);
  const targets = [10, 20, NaN, 40, 50, 60, 70, 80, 90], strengths = [0.1, 0.2, 0.3, NaN, 0.5, 0.1, 0.2, 0.3, 0.4];
  const got = await ours({ position, velocity, nodeColumns: { tx: targets, s: strengths }, forces: { f: { type: "x", x: "tx", strength: "s" } }, alpha: 0.5 });
  const want = theirs({
    position, velocity, alpha: 0.5,
    force: () => d3.forceX((node) => (Number.isFinite(targets[node.index]) ? targets[node.index] : node.x))
      .strength((node) => (Number.isFinite(strengths[node.index]) ? strengths[node.index] : 0)),
  });
  close(got.x, want.x, "position");
});

test("alpha moves toward alphaTarget by alphaDecay, as d3's does", async () => {
  const { position, velocity } = layout(5, 3);
  const settings = { alphaDecay: 0.1, alphaTarget: 0.3, velocityDecay: 0.2 };
  const got = await ours({ position, velocity, forces: { f: { type: "x", x: 0 } }, settings, alpha: 0.9 });
  const want = theirs({ position, velocity, alpha: 0.9, settings, force: () => d3.forceX(0) });
  assert.ok(Math.abs(got.alpha - want.alpha) < 1e-9, `${got.alpha} vs ${want.alpha}`);
  close(got.x, want.x, "position");
});

test("fixed coordinates from node columns hold their axis; non-finite leaves it free", async () => {
  const { position, velocity } = layout(4, 21);
  const got = await ours({
    position, velocity, alpha: 1, nodeColumns: { fx: [5, NaN, NaN, 8], fy: [NaN, -3, NaN, 9] },
    forces: { f: { type: "x", x: 100, strength: 0.5 } }, settings: { fixed: { x: "fx", y: "fy" } },
  });
  assert.equal(got.x[0], 5);
  assert.equal(got.x[3], -3);
  assert.deepEqual([got.x[6], got.x[7]], [8, 9]);
  assert.deepEqual([got.v[0], got.v[3], got.v[6], got.v[7]], [0, 0, 0, 0]);
  assert.ok(got.x[2] !== position[1][0] && got.x[4] !== position[2][0], "free axes move");
});

test("forces: defaults, updates by name, replacement by type, removal and validation", () => {
  const base = { dimensions: 2, repulsion: 30, linkDistance: 30, springStrength: 0.1, centering: 0.01 };
  const names = (c) => [...forceSpecs({ ...base, ...c }).keys()];
  assert.deepEqual(names({}), ["charge", "link", "x", "y"]);
  assert.deepEqual(names({ dimensions: 3 }), ["charge", "link", "x", "y", "z"]);
  const updated = forceSpecs({ ...base, forces: { charge: { strength: -80 } } }).get("charge");
  assert.equal(updated.strength, -80);
  assert.equal(updated.legacy, true, "an update keeps the default's behavior");
  const replaced = forceSpecs({ ...base, forces: { charge: { type: "manyBody" } } }).get("charge");
  assert.equal(replaced.strength, -30);
  assert.equal(replaced.legacy, undefined, "a type gives d3's force");
  assert.deepEqual(names({ forces: { x: null, y: null, ring: { type: "radial", radius: 50 } } }), ["charge", "link", "ring"]);
  for (const [forces, message] of [
    [{ ring: { type: "radial" } }, /needs a radius/],
    [{ f: { strength: 1 } }, /needs a type/],
    [{ f: { type: "spring" } }, /unknown type/],
    [{ f: { type: "x", radius: 3 } }, /no parameter radius/],
    [{ f: { type: "link", iterations: 0 } }, /integer from 1 to 16/],
    [{ f: { type: "center", x: "cx" } }, /must be a number/],
    [{ f: { type: "x", x: { $col: "@time" } } }, /./],
    [{ f: { type: "manyBody", distanceMin: 0 } }, /positive/],
  ])
    assert.throws(() => forceSpecs({ ...base, forces }), message, JSON.stringify(forces));
});

test("a force parameter reading an @ field is rejected", async () => {
  const { view } = await import("../../src/lib/plot/utils/expressions.js");
  assert.throws(() => forceSpecs({ dimensions: 2, repulsion: 1, linkDistance: 1, springStrength: 1, centering: 0, forces: { f: { type: "x", x: view.time } } }), /reads @time/);
});

test("a whole simulation settles like d3's: similar mean edge length", async () => {
  // Default d3 forces (many-body, link, center) on a small ring with chords, 200 ticks each.
  const n = 30, edges = [];
  for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n], [i, (i * 7 + 3) % n]);
  const { position } = layout(n, 99, 60);
  const velocity = position.map(() => [0, 0]);
  const forces = { ...NO_DEFAULTS, charge: { type: "manyBody" }, link: { type: "link" }, center: { type: "center" } };
  const scope = createDataScope();
  scope.update({ source: edges.map((e) => e[0]), target: edges.map((e) => e[1]) });
  const graph = await graphFixture(scope, { nodes: { id: position.map((_, i) => i) } });
  const c = { dimensions: 2, forces };
  const topology = await forceTopology(graph.scope, c);
  const config = forceSettings(c), planned = forcePlan(config.forceSpecs, config);
  const arrays = await resolveForceArrays(planned, topology, scope);
  let p = np.array(position), v = np.array(velocity), alpha = 1;
  const pins = np.zeros([n], { dtype: np.bool }), pin = p.ref;
  for (let i = 0; i < 200; i++) {
    const next = await forceStep(topology, p, v, pins, pin, c, alpha, { planned, arrays });
    p.dispose(); v.dispose();
    ({ position: p, velocity: v, alpha } = next);
  }
  const got = Array.from(await p.ref.data());
  [p, v, pins, pin, ...arrays].forEach((a) => a.dispose());
  topology.dispose(); graph.dispose(); scope.dispose();
  const nodes = position.map(([x, y], index) => ({ index, x, y }));
  const simulation = d3.forceSimulation(nodes).stop()
    .force("charge", d3.forceManyBody()).force("link", d3.forceLink(edges.map(([source, target]) => ({ source, target }))))
    .force("center", d3.forceCenter());
  simulation.tick(200);
  const mean = (xy) => edges.reduce((s, [a, b]) => s + Math.hypot(xy(a)[0] - xy(b)[0], xy(a)[1] - xy(b)[1]), 0) / edges.length;
  const ourMean = mean((i) => [got[2 * i], got[2 * i + 1]]), theirMean = mean((i) => [nodes[i].x, nodes[i].y]);
  assert.ok(Math.abs(ourMean - theirMean) / theirMean < 0.15, `mean edge length ${ourMean} vs d3 ${theirMean}`);
});

test("collide leaves no overlap after a run, and no tick reads anything back", async () => {
  // 40 nodes of radius 5 packed into a 20 x 20 square (every pair overlaps), collide alone.
  const n = 40, radius = 5, { position } = layout(n, 7, 20);
  const scope = createDataScope();
  scope.update({ source: [0], target: [0] });
  const graph = await graphFixture(scope, { nodes: { id: position.map((_, i) => i) } });
  const c = { dimensions: 2, forces: { ...NO_DEFAULTS, spacing: { type: "collide", radius, iterations: 2 } } };
  const topology = await forceTopology(graph.scope, c);
  const config = forceSettings(c), planned = forcePlan(config.forceSpecs, config);
  const arrays = await resolveForceArrays(planned, topology, scope);
  let p = np.array(position), v = np.zeros([n, 2]), alpha = 1;
  const pins = np.zeros([n], { dtype: np.bool }), pin = p.ref;
  const data = JaxArray.prototype.data;
  let reads = 0;
  JaxArray.prototype.data = function (...args) { reads++; return data.apply(this, args); };
  try {
    for (let i = 0; i < 300; i++) {
      const next = await forceStep(topology, p, v, pins, pin, c, alpha, { planned, arrays });
      p.dispose(); v.dispose();
      ({ position: p, velocity: v, alpha } = next);
    }
  } finally {
    JaxArray.prototype.data = data;
  }
  assert.equal(reads, 0, "readbacks over 300 ticks");
  const got = Array.from(await p.ref.data());
  [p, v, pins, pin, ...arrays].forEach((a) => a.dispose());
  topology.dispose(); graph.dispose(); scope.dispose();
  let closest = Infinity;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) closest = Math.min(closest, Math.hypot(got[2 * a] - got[2 * b], got[2 * a + 1] - got[2 * b + 1]));
  assert.ok(closest > 2 * radius * 0.95, `closest pair ${closest}, radii sum ${2 * radius}`);
});
