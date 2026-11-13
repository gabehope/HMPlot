/**
 * Force's tick on the device (TODO 30.2, 30.3, 30.5-30.8): one jitted program per graph shape
 * and force set, with no waits inside a tick and nothing read back.
 *
 * Link forces reach nodes through the edges' endpoints sorted once per graph (a CSR form): each
 * node's total is a segmented scan's value at the end of its run of endpoints. Before, every
 * chunk of 64 nodes multiplied a (chunk × edges) endpoint mask by the springs: O(nodes × edges)
 * per tick. A segmented scan, not a difference of prefix sums: a prefix sum over every edge
 * drifts far from zero, and float32 then loses a node's small total in the difference.
 *
 * Pair forces (many-body, collision) are exact here, written per axis so the pair work fuses
 * into one reduction over nodes and nothing of size nodes × nodes is stored. Forces act
 * simultaneously on one tick's state, where d3 applies them one after another: layouts match
 * d3's in character, not bit for bit.
 */
import { numpy as np, jit, lax } from "@hmplot/jax";
import { segmentedScan } from "./reduce.js";
import { lowerBound } from "./numeric/search.js";
export { segmentedScan, lowerBound };

/**
 * Each run's total, for runs [start, end) of a segmented scan ([m, d]; see segmentedScan): the
 * scan's value at end - 1, or 0 for an empty run. Borrows its arguments.
 */
export function runTotals(scanned, start, end) {
  const m = scanned.shape[0];
  const last = np.clip(end.ref.sub(1), 0, Math.max(0, m - 1)).astype(np.int32);
  const total = np.take(scanned.ref, last, 0);
  return np.where(end.ref.greater(start.ref).reshape([-1, 1]), total, 0);
}

/**
 * The endpoints of every edge, sorted once per graph (TODO 30.3). `from`, `to` are int32 [e]
 * node indices (borrowed). Returns { order ([2e] int32: position → endpoint slot, slots
 * 0..e-1 the sources and e..2e-1 the targets), keys ([2e] float32: each position's node),
 * start, end ([n] float32: each node's run), degree ([n] float32) }.
 */
export function edgeRuns(from, to, n) {
  const e = from.shape[0];
  if (!e)
    return { order: np.zeros([0], { dtype: np.int32 }), keys: np.zeros([0]), start: np.zeros([n]),
      end: np.zeros([n]), degree: np.zeros([n]), e };
  const endpoints = np.concatenate([from.ref, to.ref]).astype(np.float32);
  const order = np.argsort(endpoints.ref).astype(np.int32);
  const keys = np.take(endpoints, order.ref, 0);
  const nodes = np.arange(n).astype(np.float32);
  const start = lowerBound(keys, nodes);
  const next = nodes.add(1);
  const end = lowerBound(keys, next);
  next.dispose();
  const degree = end.ref.sub(start.ref);
  return { order, keys, start, end, degree, e };
}

/** Pair terms per block of rows in the exact pair forces ([rows, nodes] stays about this size). Tests lower it. */
export const kernelLimits = { pairBlock: 1 << 22, gridMinimum: 4096 };

/**
 * Sum over the other nodes j of `term(pairs)` for every node i, exactly, in blocks of rows so
 * the [rows, n] pair terms stay about kernelLimits.pairBlock elements even unfused. `pairs`
 * gives, per axis, `a` (p_i - p_j, with a small deterministic jitter for coincident pairs), the
 * squared distance `d2` (the jitter's for coincident pairs), `self` (i = j) and the row
 * block's [first, last). `term` returns per-axis [rows, n] terms. Borrows `position`; the
 * terms are consumed. Returns [n, d].
 */
function pairSums(position, term) {
  const [n, d] = position.shape;
  const axes = Array.from({ length: d }, (_, axis) => position.ref.slice([], [axis, axis + 1]).reshape([n]));
  const block = Math.max(1, Math.min(n, Math.floor(kernelLimits.pairBlock / Math.max(1, n))));
  const j = np.arange(n).astype(np.float32).reshape([1, n]);
  const parts = [];
  for (let first = 0; first < n; first += block) {
    const last = Math.min(n, first + block), rows = last - first;
    const raw = axes.map((a) => a.ref.slice([first, last]).reshape([rows, 1]).sub(a.ref.reshape([1, n])));
    const distance = raw.map((r) => np.square(r.ref)).reduce((x, y) => x.add(y));
    const i = np.arange(first, last).astype(np.float32).reshape([rows, 1]);
    const pair = i.ref.add(j.ref), sign = np.sign(i.ref.sub(j.ref));
    const coincident = distance.ref.less(1e-12);
    const jitter = raw.map((_, axis) => np.sin(pair.ref.mul(0.731).add(axis * 1.239)).mul(sign.ref).mul(0.001));
    const a = raw.map((r, axis) => np.where(coincident.ref, jitter[axis].ref, r));
    const d2 = np.where(coincident, jitter.map((x) => np.square(x)).reduce((x, y) => x.add(y)), distance);
    const self = i.equal(j.ref);
    const terms = term({ a, d2, self, first, last, rows });
    [pair, sign].forEach((x) => x.dispose());
    parts.push(np.stack(terms.map((t) => np.sum(t, 1)), 1));
  }
  axes.forEach((x) => x.dispose());
  j.dispose();
  return parts.length === 1 ? parts[0] : np.concatenate(parts);
}

/**
 * Many-body forces, exactly (d3's forceManyBody with theta 0): for each node, the sum over the
 * others of charge_j × (p_j - p_i) / l, where l is the squared distance, raised below
 * distanceMin to distanceMin × distance (d3's softening; `legacy`: max(d², 1e-3), Force's
 * `repulsion` before Stage 30), and pairs at distanceMax or more skipped (`distanceMax2` null:
 * none). `charge`: [n] (per node) or [1]. Borrows its arguments; returns [n, d] (unscaled by
 * alpha).
 */
export function manyBodyExact(position, charge, { distanceMin2 = null, distanceMax2 = null, legacy = false } = {}) {
  const n = position.shape[0];
  const perNode = charge.shape[0] === n && n !== 1;
  const sums = pairSums(position, ({ a, d2, self, first, last, rows }) => {
    const l = legacy
      ? np.maximum(d2.ref, 1e-3)
      : np.where(d2.ref.less(distanceMin2.ref), np.sqrt(distanceMin2.ref.mul(d2.ref)), d2.ref);
    let keep = np.logicalNot(self);
    if (distanceMax2) keep = np.logicalAnd(keep, d2.ref.less(distanceMax2.ref));
    d2.dispose();
    const q = perNode ? charge.ref.reshape([1, n]) : null;
    const result = a.map((x) => {
      // (p_j - p_i) = -a
      const t = x.mul(-1).div(l.ref);
      return np.where(keep.ref, q ? t.mul(q.ref) : t, 0);
    });
    [l, keep].forEach((x) => x.dispose());
    q?.dispose();
    return result;
  });
  return perNode ? sums : sums.mul(charge.ref);
}

/**
 * Collision (d3's forceCollide, simultaneous): for each node, the sum over the overlapping
 * others of (p_i - p_j) × (r - l) / l × strength × r_j² / (r_i² + r_j²), with r = r_i + r_j and
 * l the distance, at the predicted positions `position` (+ velocity, as d3 reads them).
 * `radius`: [n] or [1] (non-finite: 0); `strength`: [1]. Borrows its arguments; returns [n, d].
 */
export function collideExact(position, radius, strength) {
  const n = position.shape[0];
  const perNode = radius.shape[0] === n && n !== 1;
  const clean = np.where(np.isfinite(radius.ref), np.maximum(radius.ref, 0), 0);
  const sums = pairSums(position, ({ a, d2, self, first, last, rows }) => {
    const ri = perNode ? clean.ref.slice([first, last]).reshape([rows, 1]) : clean.ref.reshape([1, 1]);
    const rj = perNode ? clean.ref.reshape([1, n]) : clean.ref.reshape([1, 1]);
    const r = ri.ref.add(rj.ref);
    const overlap = np.logicalAnd(np.logicalNot(self), d2.ref.less(np.square(r.ref)));
    const l = np.sqrt(np.maximum(d2, 1e-12));
    const rj2 = np.square(rj), share = rj2.ref.div(np.maximum(np.square(ri).add(rj2), 1e-12));
    const k = r.sub(l.ref).div(l).mul(share);
    const result = a.map((x) => np.where(overlap.ref, x.mul(k.ref), 0));
    [overlap, k].forEach((x) => x.dispose());
    return result;
  });
  clean.dispose();
  return sums.mul(strength.ref);
}

/**
 * Offsets on a d-dimensional lattice, [count^d, d] float32, the first axis fastest: every
 * vector with entries from..from + count - 1.
 */
function lattice(d, from, count) {
  const rows = [];
  for (let index = 0; index < count ** d; index++)
    rows.push(Array.from({ length: d }, (_, axis) => from + (Math.floor(index / count ** axis) % count)));
  return np.array(rows, { dtype: np.float32 }).reshape([count ** d, d]);
}

/**
 * The grid for many-body and collision forces (TODO 30.1), fixed per graph: `levels` doublings
 * per axis (2^levels cells per axis at the finest; about two nodes per finest cell) and `radius`
 * cells of near neighborhood on each side (1 or 2; theta picks it).
 */
export function gridShape(n, d, { radius = 1 } = {}) {
  const perAxis = Math.max(2, (n / 2) ** (1 / d));
  const levels = Math.max(2, Math.min(d === 2 ? 10 : 7, Math.round(Math.log2(perAxis))));
  return { levels, radius };
}

/** Flat cell indices of lattice coordinates ([..., d] float32, x fastest), clipped to the grid. Consumes `x`. */
function flatCell(x, g, d) {
  const strides = np.array(Array.from({ length: d }, (_, axis) => g ** axis), { dtype: np.float32 });
  return np.sum(np.clip(x, 0, g - 1).mul(strides), -1).astype(np.int32);
}

/**
 * Bounds that ignore far outliers: per axis, the 1% and 99% quantiles of the coordinates from a
 * 1,024-bin histogram (integer counts added with lax.scatter: deterministic). A graph with a
 * few distant nodes (disconnected components pushed away) would otherwise stretch the grid so the
 * rest share a few cells. Nodes outside fall into the border cells. Borrows `position`; returns
 * { low ([d]), width ([1]: the finest cells' side, square) } for `cells` cells per axis, at least
 * `minimumWidth` ([1] or null) wide.
 */
function robustBounds(position, cells, minimumWidth = null, bins = 1024, tail = 0.01) {
  const [n, d] = position.shape;
  const lows = [], highs = [];
  for (let axis = 0; axis < d; axis++) {
    const a = position.ref.slice([], [axis, axis + 1]).reshape([n]);
    const lo = np.min(a.ref), hi = np.max(a.ref);
    const step = np.maximum(hi.sub(lo.ref), 1e-9).div(bins);
    const bin = np.clip(np.floor(a.sub(lo.ref).div(step.ref)), 0, bins - 1).astype(np.int32);
    const counts = lax.scatter(np.ones([n], { dtype: np.int32 }), bin, [bins], { mode: "add" });
    const cumulative = np.cumsum(counts.astype(np.float32), 0);
    const q = np.array([tail * n, (1 - tail) * n], { dtype: np.float32 });
    const found = lowerBound(cumulative, q);
    cumulative.dispose();
    q.dispose();
    const first = found.ref.slice([0, 1]), last = found.slice([1, 2]);
    lows.push(lo.ref.add(first.mul(step.ref)).reshape([1]));
    highs.push(lo.add(last.add(1).mul(step)).reshape([1]));
  }
  const low = np.concatenate(lows), high = np.concatenate(highs);
  const extent = np.max(high.sub(low.ref));
  let width = extent.mul(1.0001).add(1e-3).div(cells).reshape([1]);
  if (minimumWidth) width = np.maximum(width, minimumWidth.ref);
  return { low, width };
}

/**
 * Nodes sorted into the finest cells of a grid: each node's cell, the sort, every cell's
 * [start, end) in it (lax.scatter at the runs' ends), and the sorted positions, values and node
 * indices. `value` [n] (borrowed) rides along (charges or radii). Borrows its arguments.
 */
function gridCells(position, value, low, width, G) {
  const [n, d] = position.shape;
  const cell = np.clip(np.floor(position.ref.sub(low.ref.reshape([1, d])).div(width.ref)), 0, G - 1); // [n, d]
  const key = flatCell(cell.ref, G, d);
  const order = np.argsort(key.ref).astype(np.int32);
  const sortedKey = np.take(key, order.ref, 0);
  const positionIndex = np.arange(n).astype(np.int32);
  // A run of equal keys: its start where the key differs from the one before, its end where
  // the next differs. Elsewhere -1, which lax.scatter skips.
  const before = np.concatenate([np.full([1], -1, { dtype: np.int32 }), sortedKey.ref.slice([0, n - 1])]);
  const after = np.concatenate([sortedKey.ref.slice([1, n]), np.full([1], -1, { dtype: np.int32 })]);
  const startsAt = np.where(sortedKey.ref.notEqual(before), sortedKey.ref, -1);
  const endsAt = np.where(sortedKey.ref.notEqual(after), sortedKey.ref, -1);
  const start = lax.scatter(positionIndex.ref, startsAt, [G ** d], { mode: "update" });
  const end = lax.scatter(positionIndex.add(1), endsAt, [G ** d], { mode: "update" });
  return {
    cell, order, sortedKey, start, end,
    sortedPosition: np.take(position.ref, order.ref, 0),
    sortedValue: np.take(value.ref, order.ref, 0),
    dispose() { [cell, order, sortedKey, start, end, this.sortedPosition, this.sortedValue].forEach((a) => a.dispose()); },
  };
}

/**
 * Many-body forces on a uniform spatial grid (TODO 30.1; a GPU-friendly grid rather than a
 * quadtree or octree): the same sums as manyBodyExact, with the far field approximated.
 * - Each tick the grid spans the nodes' robust bounds with 2^levels cells per axis; nodes are
 *   sorted by cell once, each cell's (charge, |charge|, |charge| × position) comes from a
 *   segmented scan, and each coarser level sums its 2^d children by a reshape. A cell's point
 *   charge sits at its |charge|-weighted centroid, as d3's quadtree places mixed-sign strengths.
 * - Far field: at each level from 2, a node takes the children of its parent cell's neighbors
 *   that are not its own cell's neighbors ((4r + 2)^d - (2r + 1)^d cells, Barnes-Hut's
 *   approximation on a regular grid).
 * - Near field: exact, over every node in the (2r + 1)^d finest cells around the node's
 *   (lax.cellPairs, a loop per node: any number of nodes may share a cell).
 * Every shape is fixed per graph, so one program serves every tick; far-field nodes go in blocks
 * so their gathered terms stay about kernelLimits.pairBlock. `charge` [n] or [1]. Borrows its
 * arguments; returns [n, d], unscaled by alpha.
 */
export function gridManyBody(position, charge, { levels: L, radius: r }, { distanceMin2 = null, distanceMax2 = null, legacy = false } = {}) {
  const [n, d] = position.shape;
  const G = 2 ** L, span = 2 * r + 1, channels = 2 + d;
  const perNode = charge.shape[0] === n ? charge.ref : np.broadcastTo(charge.ref, [n]);
  const { low, width } = robustBounds(position, G);
  const grid = gridCells(position, perNode, low, width, G);
  low.dispose();
  width.dispose();
  const magnitude = np.abs(perNode.ref).reshape([n, 1]);
  const weighted = np.concatenate([perNode.ref.reshape([n, 1]), magnitude.ref, position.ref.mul(magnitude)], 1);
  const keys = grid.sortedKey.ref.astype(np.float32);
  const scanned = segmentedScan(np.take(weighted, grid.order.ref, 0), keys);
  const starts = grid.start.ref.astype(np.float32), ends = grid.end.ref.astype(np.float32);
  const levelSums = [];
  levelSums[L] = runTotals(scanned, starts, ends);
  [scanned, keys, starts, ends].forEach((x) => x.dispose());
  for (let l = L; l > 2; l--) {
    const g = 2 ** (l - 1);
    const shape = d === 2 ? [g, 2, g, 2, channels] : [g, 2, g, 2, g, 2, channels];
    levelSums[l - 1] = np.sum(levelSums[l].ref.reshape(shape), d === 2 ? [1, 3] : [1, 3, 5]).reshape([g ** d, channels]);
  }
  /** Σ over axis 1 of value × (c - p_i) / l: d3's many-body sum over point charges at `c`. Consumes its arguments. */
  const pull = (value, delta /* p_i - c */, keep) => {
    const d2 = np.sum(np.square(delta.ref), -1, { keepdims: true });
    const l = legacy ? np.maximum(d2.ref, 1e-3)
      : np.where(d2.ref.less(distanceMin2.ref), np.sqrt(distanceMin2.ref.mul(d2.ref)), d2.ref);
    if (distanceMax2) keep = np.logicalAnd(keep, d2.ref.less(distanceMax2.ref));
    d2.dispose();
    return np.sum(np.where(keep, value.mul(delta).mul(-1).div(l), 0), 1);
  };
  const farOffsets = lattice(d, 0, 2 * span), C = (2 * span) ** d;
  const block = Math.max(1, Math.min(n, Math.floor(kernelLimits.pairBlock / C)));
  const parts = [];
  for (let first = 0; first < n; first += block) {
    const last = Math.min(n, first + block), b = last - first;
    const p = position.ref.slice([first, last]).reshape([b, 1, d]);
    const own = grid.cell.ref.slice([first, last]);
    let force = np.zeros([b, d]);
    for (let l = 2; l <= L; l++) {
      const g = 2 ** l;
      const at = np.floor(own.ref.div(2 ** (L - l)));
      const x = np.floor(at.ref.div(2)).mul(2).sub(2 * r).reshape([b, 1, d]).add(farOffsets.ref.reshape([1, C, d]));
      const inside = np.all(np.logicalAnd(x.ref.greaterEqual(0), x.ref.less(g)), -1);
      const neighbor = np.all(np.abs(x.ref.sub(at.reshape([b, 1, d]))).lessEqual(r), -1);
      const sums = np.take(levelSums[l].ref, flatCell(x, g, d), 0); // [b, C, channels]
      const weight = sums.ref.slice([], [], [1, 2]);
      const centroid = sums.ref.slice([], [], [2, channels]).div(np.maximum(weight.ref, 1e-30));
      const keep = np.logicalAnd(np.logicalAnd(inside, np.logicalNot(neighbor)), weight.reshape([b, C]).greater(0)).reshape([b, C, 1]);
      force = force.add(pull(sums.slice([], [], [0, 1]), p.ref.sub(centroid), keep));
    }
    own.dispose();
    p.dispose();
    parts.push(force);
  }
  farOffsets.dispose();
  for (let l = 2; l <= L; l++) levelSums[l].dispose();
  const far = parts.length === 1 ? parts[0] : np.concatenate(parts);
  const scalars = np.concatenate([
    distanceMin2 ? distanceMin2.ref.reshape([1]) : np.ones([1]),
    distanceMax2 ? distanceMax2.ref.reshape([1]) : np.full([1], Infinity),
  ]);
  const near = lax.cellPairs(position.ref, grid.cell.ref, perNode.ref, grid.sortedPosition.ref, grid.sortedValue.ref,
    grid.order.ref, grid.start.ref, grid.end.ref, scalars,
    { kind: legacy ? "manyBodyLegacy" : "manyBody", radius: r, grid: G });
  perNode.dispose();
  grid.dispose();
  return far.add(near);
}

/**
 * Collision on a uniform spatial grid (TODO 30.1): the same sums as collideExact, exactly, with
 * each node checking only the nodes of the 3^d cells around its own, cells at least twice the
 * largest radius wide (so every overlapping pair is there). Borrows its arguments; returns [n, d].
 */
export function gridCollide(position, radius, strength, { levels: L }) {
  const [n] = position.shape;
  const G = 2 ** L;
  const perNode = radius.shape[0] === n ? radius.ref : np.broadcastTo(radius.ref, [n]);
  const clean = np.where(np.isfinite(perNode.ref), np.maximum(perNode, 0), 0);
  const reach = np.max(clean.ref).mul(2).add(1e-6).reshape([1]);
  const { low, width } = robustBounds(position, G, reach);
  reach.dispose();
  const grid = gridCells(position, clean, low, width, G);
  low.dispose();
  width.dispose();
  const near = lax.cellPairs(position.ref, grid.cell.ref, clean.ref, grid.sortedPosition.ref, grid.sortedValue.ref,
    grid.order.ref, grid.start.ref, grid.end.ref, np.zeros([2]), { kind: "collide", radius: 1, grid: G });
  clean.dispose();
  grid.dispose();
  return near.mul(strength.ref);
}

/**
 * A tick's plan (TODO 30.5-30.8): its forces and where each parameter comes from, fixed per
 * graph and force set. A parameter reference is { scalar: k } (params[k], a buffer: a control
 * changes it without compiling) or { array: k } (arrays[k], per node or per edge, resolved when
 * the graph or the force's columns change). params[ALPHA] is this tick's alpha, params[DAMPING]
 * 1 - velocityDecay. Built by force.js (forcePlan).
 *
 *   { d, forces: [
 *       { type: "manyBody", strength, distanceMin2, distanceMax2 (or null), legacy, grid (gridShape or null: exact) },
 *       { type: "link", distance, strength, weight (or null), bias (or null: legacy), iterations, legacy },
 *       { type: "collide", radius, strength, iterations, grid },
 *       { type: "x" | "y" | "z", target, strength },
 *       { type: "radial", radius, strength, center: [refs per axis] },
 *       { type: "center", center: [refs per axis], strength } ],
 *     fixed: [ref or null per axis] }
 */
export const ALPHA = 0, DAMPING = 1;
const AXES = { x: 0, y: 1, z: 2 };

/**
 * Link forces (d3's forceLink, simultaneous): each edge pulls its ends toward `distance` by
 * (l - distance) / l × alpha × strength (× weight), its source by 1 - bias of that and its
 * target by bias, where l is the distance between the ends at `ends` (positions, or predicted
 * positions + velocity as d3 reads them). `legacy` (Force's springs before Stage 30): positions,
 * and each end takes the whole pull. Sums per node over the endpoint runs. Borrows everything.
 */
function linkForces(ends, from, to, runs, { distance, strength, weight, bias, alpha, legacy }) {
  const n = ends.shape[0], d = ends.shape[1], e = from.shape[0];
  if (!e) {
    [distance, strength, weight, bias].forEach((x) => x?.dispose());
    return np.zeros([n, d]);
  }
  const x = np.take(ends.ref, to.ref, 0).sub(np.take(ends.ref, from.ref, 0));
  const length = np.sqrt(np.sum(np.square(x.ref), 1, { keepdims: true }).add(legacy ? 1e-6 : 1e-12));
  let k = length.ref.sub(distance.reshape([-1, 1])).div(length).mul(strength.reshape([-1, 1])).mul(alpha.ref);
  if (weight) k = k.mul(weight.reshape([-1, 1]));
  const pull = x.mul(k);
  const toSource = legacy ? pull.ref : pull.ref.mul(np.subtract(1, bias.ref).reshape([-1, 1]));
  const toTarget = legacy ? pull.mul(-1) : pull.mul(bias.reshape([-1, 1]).mul(-1));
  const sorted = np.take(np.concatenate([toSource, toTarget]), runs.order.ref, 0);
  const scanned = segmentedScan(sorted, runs.keys);
  const total = runTotals(scanned, runs.start, runs.end);
  scanned.dispose();
  return total;
}

/** A column of a [n, d] array. Borrows it. */
const axisOf = (array, axis) => array.ref.slice([], [axis, axis + 1]).reshape([array.shape[0]]);

const PROGRAMS = new Map();
function tickProgram(plan, key) {
  let program = PROGRAMS.get(key);
  if (program) return program;
  program = jit((position, velocity, pins, pinPosition, params, from, to, order, keys, start, end, arrays) => {
    const [n, d] = position.shape;
    const runs = { order, keys, start, end };
    const value = (ref) => (ref.array !== undefined ? arrays[ref.array].ref : params.ref.slice([ref.scalar, ref.scalar + 1]));
    const collide = (predicted, force) => {
      const radius = value(force.radius), strength = value(force.strength);
      const result = force.grid ? gridCollide(predicted, radius, strength, force.grid) : collideExact(predicted, radius, strength);
      radius.dispose();
      strength.dispose();
      return result;
    };
    const alpha = params.ref.slice([ALPHA, ALPHA + 1]);
    let dv = np.zeros([n, d]), shift = np.zeros([d]);
    for (const force of plan.forces) {
      if (force.type === "manyBody") {
        const charge = value(force.strength);
        const distanceMin2 = force.legacy ? null : value(force.distanceMin2);
        const distanceMax2 = force.distanceMax2 ? value(force.distanceMax2) : null;
        const options = { distanceMin2, distanceMax2, legacy: force.legacy };
        const push = force.grid ? gridManyBody(position, charge, force.grid, options) : manyBodyExact(position, charge, options);
        [charge, distanceMin2, distanceMax2].forEach((x) => x?.dispose());
        dv = dv.add(push.mul(alpha.ref));
      } else if (force.type === "link" || force.type === "collide") {
        // Iterations see this force's own earlier iterations, as d3's do.
        let extra = np.zeros([n, d]);
        for (let iteration = 0; iteration < force.iterations; iteration++) {
          const predicted = force.legacy ? position.ref : position.ref.add(velocity.ref).add(extra.ref);
          const step = force.type === "link"
            ? linkForces(predicted, from, to, runs, {
                distance: value(force.distance), strength: value(force.strength),
                weight: force.weight ? value(force.weight) : null, bias: force.bias ? value(force.bias) : null,
                alpha, legacy: force.legacy,
              })
            : collide(predicted, force);
          predicted.dispose();
          extra = extra.add(step);
        }
        dv = dv.add(extra);
      } else if (force.type in AXES) {
        const axis = AXES[force.type], target = value(force.target), strength = value(force.strength);
        const pull = target.ref.sub(axisOf(position, axis)).mul(strength.ref).mul(alpha.ref);
        const keep = np.logicalAnd(np.isfinite(target), np.isfinite(strength));
        const column = np.where(keep, pull, 0).reshape([n, 1]);
        dv = dv.add(np.concatenate(Array.from({ length: d }, (_, a) => (a === axis ? column.ref : np.zeros([n, 1]))), 1));
        column.dispose();
      } else if (force.type === "radial") {
        const center = np.concatenate(force.center.slice(0, d).map((ref) => value(ref).reshape([1])));
        const dx = position.ref.sub(center.reshape([1, d]));
        const r = np.maximum(np.sqrt(np.sum(np.square(dx.ref), 1)), 1e-6);
        const radius = value(force.radius), strength = value(force.strength);
        const k = radius.ref.sub(r.ref).mul(strength.ref).mul(alpha.ref).div(r);
        const keep = np.logicalAnd(np.isfinite(radius), np.isfinite(strength));
        dv = dv.add(dx.mul(np.where(keep, k, 0).reshape([n, 1])));
      } else if (force.type === "center") {
        // Moves the nodes (not their velocities) so their mean is the center, as d3's does.
        const center = np.concatenate(force.center.slice(0, d).map((ref) => value(ref).reshape([1])));
        shift = shift.add(np.mean(position.ref, 0).sub(center).mul(value(force.strength)));
      }
    }
    const nextVelocity = velocity.add(dv).mul(params.ref.slice([DAMPING, DAMPING + 1]));
    let nextPosition = position.add(nextVelocity.ref).sub(shift.reshape([1, d]));
    // Fixed coordinates (d3's fx, fy, fz): a finite value holds that axis, with no velocity.
    let held = null;
    if (plan.fixed.some(Boolean)) {
      const fixed = Array.from({ length: d }, (_, axis) => (plan.fixed[axis] ? value(plan.fixed[axis]) : np.full([n], NaN)));
      const values = np.stack(fixed, 1);
      held = np.isfinite(values.ref);
      nextPosition = np.where(held.ref, values, nextPosition);
    }
    let velocityOut = held ? np.where(held, 0, nextVelocity) : nextVelocity;
    // Dragged nodes hold their pin position.
    const pinned = pins.reshape([n, 1]);
    nextPosition = np.where(pinned.ref, pinPosition, nextPosition);
    velocityOut = np.where(pinned, 0, velocityOut);
    alpha.dispose();
    [params, from, to, order, keys, start, end, ...arrays].forEach((x) => x.dispose());
    return [nextPosition, velocityOut];
  });
  PROGRAMS.set(key, program);
  return program;
}

/**
 * Run one tick of `plan` (see above). `topology` carries from, to and runs; `params` is the
 * device array of scalars, `arrays` the per-node and per-edge ones. Borrows everything;
 * returns new position and velocity arrays.
 */
export function forceTick(plan, topology, position, velocity, pins, pinPosition, params, arrays = []) {
  const { from, to, runs } = topology;
  const key = JSON.stringify([position.shape, from.shape[0], kernelLimits.pairBlock, plan]);
  return tickProgram(plan, key)(position.ref, velocity.ref, pins.ref, pinPosition.ref, params.ref,
    from.ref, to.ref, runs.order.ref, runs.keys.ref, runs.start.ref, runs.end.ref, arrays.map((a) => a.ref));
}
