import { evaluateTransientExpression } from "./expressionPlans.js";
import {assertGPUAvailable} from "../../jaxExtensions/setup.js";
import { numpy as np, random } from "@hmplot/jax";
import { asArray } from "./data.js";
import { groupRows } from "./grouping.js";
import { graphData, requireGraph, refreshGraphData, graphTable } from "./graphData.js";
import {
  createDataView,
  categoryColumn,
  dataBufferLimit,
} from "./dataView.js";
import { edgeRuns, forceTick, gridShape, kernelLimits } from "./forceKernel.js";
import { deviceArray } from "./deviceParams.js";
import { expressionFields, isExpression } from "./expressions.js";
import { limitError } from "./limits.js";
export { FORCE_CONTEXT } from "./forceContext.js";
/** d3's default alpha decay: alpha falls from 1 to alphaMin (0.001) in 300 ticks. */
export const ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 300);
export function forceSettings(c = {}) {
  const o = {
    dimensions: 2,
    seed: 42,
    linkDistance: 30,
    springStrength: 0.1,
    repulsion: 30,
    centering: 0.01,
    velocityDecay: 0.4,
    alphaMin: 0.001,
    alphaDecay: ALPHA_DECAY,
    alphaTarget: 0,
    ...c,
  };
  if (![2, 3].includes(o.dimensions) || !Number.isInteger(o.seed))
    throw Error("Force requires two or three dimensions and an integer seed.");
  for (const key of [
    "linkDistance",
    "springStrength",
    "repulsion",
    "centering",
  ])
    if (!Number.isFinite(o[key]) || o[key] < 0)
      throw Error(`Force ${key} must be finite and nonnegative.`);
  if (
    !Number.isFinite(o.velocityDecay) ||
    o.velocityDecay < 0 ||
    o.velocityDecay > 1
  )
    throw Error("Velocity decay must be between zero and one.");
  for (const key of ["alphaMin", "alphaDecay", "alphaTarget"])
    if (!Number.isFinite(o[key]) || o[key] < 0 || o[key] > 1)
      throw Error(`Force ${key} must be between zero and one.`);
  return { ...o, forceSpecs: forceSpecs(o) };
}

/**
 * d3's forces (TODO 30.6) and each parameter's source and default: "scalar" (a number),
 * "count" (an integer number of iterations), "node" or "edge" (a number, or a node or edge
 * column name or expression, resolved per graph).
 */
export const FORCE_TYPES = {
  center: { x: [0, "scalar"], y: [0, "scalar"], z: [0, "scalar"], strength: [1, "scalar"] },
  manyBody: { strength: [-30, "node"], theta: [0.9, "scalar"], distanceMin: [1, "scalar"], distanceMax: [Infinity, "scalar"] },
  link: { distance: [30, "edge"], strength: ["auto", "edge"], iterations: [1, "count"] },
  collide: { radius: [1, "node"], strength: [1, "scalar"], iterations: [1, "count"] },
  x: { x: [0, "node"], strength: [0.1, "node"] },
  y: { y: [0, "node"], strength: [0.1, "node"] },
  z: { z: [0, "node"], strength: [0.1, "node"] },
  radial: { radius: [undefined, "node"], x: [0, "scalar"], y: [0, "scalar"], z: [0, "scalar"], strength: [0.1, "node"] },
};
const AXIS_NAMES = ["x", "y", "z"];

/**
 * The forces of a Force, by name (TODO 30.7). Without `forces`, the top-level props configure
 * the default ones, which keep Force's layouts from before Stage 30: charge (many-body,
 * strength -repulsion), link (linkDistance, springStrength, weight) and x, y (z) (strength
 * centering, toward 0). In `forces`, an entry named like a default updates its parameters; one
 * with a `type` replaces it with d3's force of that type (d3's defaults); null removes it; a
 * new name adds a force.
 */
export function forceSpecs(c) {
  // Built from entries: a quoted set("...") would read as an option name to the Python
  // registry scrape (scripts/generate-python-api.py).
  const specs = new Map([
    ["charge", { type: "manyBody", strength: -c.repulsion, theta: 0.9, distanceMin: 1, distanceMax: Infinity, legacy: true }],
    ["link", { type: "link", distance: c.linkDistance, strength: c.springStrength, iterations: 1, weight: c.weight, legacy: true }],
    ...AXIS_NAMES.slice(0, c.dimensions).map((axis) => [axis, { type: axis, [axis]: 0, strength: c.centering }]),
  ]);
  const forces = c.forces ?? {};
  if (typeof forces !== "object" || Array.isArray(forces))
    throw Error("Force forces must be an object of named forces.");
  for (const [name, spec] of Object.entries(forces)) {
    if (spec === null) {
      specs.delete(name);
      continue;
    }
    if (typeof spec !== "object" || Array.isArray(spec)) throw Error(`Force ${name} must be an object (or null to remove it).`);
    const base = specs.get(name);
    if (spec.type === undefined) {
      if (!base) throw Error(`Force ${name} needs a type: one of ${Object.keys(FORCE_TYPES).join(", ")}.`);
      specs.set(name, { ...base, ...spec, type: base.type });
    } else {
      if (!Object.hasOwn(FORCE_TYPES, spec.type))
        throw Error(`Force ${name}: unknown type ${JSON.stringify(spec.type)} (one of ${Object.keys(FORCE_TYPES).join(", ")}).`);
      const defaults = Object.fromEntries(Object.entries(FORCE_TYPES[spec.type]).map(([key, [value]]) => [key, value]));
      specs.set(name, { ...defaults, ...spec });
    }
  }
  for (const [name, spec] of specs) validateForce(name, spec, c.dimensions);
  return specs;
}

function validateForce(name, spec, dimensions) {
  const params = FORCE_TYPES[spec.type];
  if (spec.type === "z" && dimensions !== 3) throw Error(`Force ${name}: a z force needs dimensions={3}.`);
  if (spec.type === "radial" && spec.radius === undefined) throw Error(`Force ${name}: radial needs a radius.`);
  for (const [key, value] of Object.entries(spec)) {
    if (key === "type" || ((key === "legacy" || key === "weight") && spec.legacy)) continue;
    if (!Object.hasOwn(params, key))
      throw Error(`Force ${name}: ${spec.type} has no parameter ${key} (${Object.keys(params).join(", ")}).`);
    const [, source] = params[key];
    const where = `Force ${name} ${key}`;
    if (source === "count") {
      if (!Number.isInteger(value) || value < 1 || value > 16) throw Error(`${where} must be an integer from 1 to 16.`);
    } else if (typeof value === "number") {
      if (Number.isNaN(value) || (!Number.isFinite(value) && key !== "distanceMax")) throw Error(`${where} must be finite.`);
      if ((key === "distance" || key === "radius" || key === "theta" || key === "distanceMax") && value < 0)
        throw Error(`${where} must be nonnegative.`);
      if (key === "distanceMin" && !(value > 0)) throw Error(`${where} must be positive.`);
    } else if (source === "scalar") throw Error(`${where} must be a number.`);
    else if (value === "auto" && spec.type === "link" && key === "strength") continue;
    else if (typeof value !== "string" && !isExpression(value))
      throw Error(`${where} must be a number, a ${source} column name or an expression.`);
    else {
      const fields = expressionFields(value);
      const reserved = [...fields].find((field) => field.startsWith("@"));
      if (reserved) throw Error(`${where} reads ${reserved}: force parameters read ${source} columns only.`);
    }
  }
}

/**
 * The tick's plan for these forces (forceKernel.js), and where its values come from: `scalars`
 * (per tick, from the current specs: controls compile nothing) and `arrays` (resolved per
 * graph by resolveForceArrays). `structure` changes only when the arrays must be resolved
 * again (a force added or removed, a column or expression changed).
 */
export function forcePlan(specs, { dimensions, fixed = undefined, n = 0 }) {
  const scalars = [], arrays = [];
  const scalar = (read) => ({ scalar: 2 + scalars.push(read) - 1 });
  const array = (spec) => ({ array: arrays.push(spec) - 1 });
  const param = (name, key, domain) => {
    const value = specs.get(name)[key];
    return typeof value === "number" ? scalar((s) => s.get(name)[key]) : array({ domain, value, name, key });
  };
  // Above kernelLimits.gridMinimum nodes, pair forces go on the spatial grid (TODO 30.1): theta
  // picks its neighborhood (0: exact), as d3's picks Barnes-Hut's accuracy.
  const onGrid = n >= kernelLimits.gridMinimum;
  const grid = (theta = 0.9) => (onGrid && theta > 0 ? gridShape(n, dimensions, { radius: theta >= 0.7 ? 1 : 2 }) : null);
  const forces = [];
  for (const [name, spec] of specs) {
    if (spec.type === "manyBody")
      forces.push({
        type: "manyBody", legacy: !!spec.legacy, strength: param(name, "strength", "node"),
        distanceMin2: scalar((s) => s.get(name).distanceMin ** 2),
        distanceMax2: Number.isFinite(spec.distanceMax) ? scalar((s) => s.get(name).distanceMax ** 2) : null,
        grid: grid(spec.theta),
      });
    else if (spec.type === "link")
      forces.push({
        type: "link", legacy: !!spec.legacy, iterations: spec.iterations ?? 1,
        distance: param(name, "distance", "edge"),
        strength: spec.strength === "auto" ? array({ derived: "linkStrength" }) : param(name, "strength", "edge"),
        weight: spec.legacy && spec.weight ? array({ domain: "edge", value: spec.weight, name, key: "weight" }) : null,
        bias: spec.legacy ? null : array({ derived: "linkBias" }),
      });
    else if (spec.type === "collide")
      forces.push({ type: "collide", iterations: spec.iterations, radius: param(name, "radius", "node"), strength: scalar((s) => s.get(name).strength), grid: grid() });
    else if (AXIS_NAMES.includes(spec.type))
      forces.push({ type: spec.type, target: param(name, spec.type, "node"), strength: param(name, "strength", "node") });
    else if (spec.type === "radial")
      forces.push({
        type: "radial", radius: param(name, "radius", "node"), strength: param(name, "strength", "node"),
        center: AXIS_NAMES.slice(0, dimensions).map((axis) => scalar((s) => s.get(name)[axis])),
      });
    else if (spec.type === "center")
      forces.push({
        type: "center", strength: scalar((s) => s.get(name).strength),
        center: AXIS_NAMES.slice(0, dimensions).map((axis) => scalar((s) => s.get(name)[axis])),
      });
  }
  const fixedRefs = AXIS_NAMES.slice(0, dimensions).map((axis) =>
    fixed?.[axis] === undefined ? null : array({ domain: "node", value: fixed[axis], name: "fixed", key: axis }));
  const plan = { d: dimensions, forces, fixed: fixedRefs };
  return { plan, scalars, arrays, structure: JSON.stringify([plan, arrays]) };
}

/** This tick's scalar parameters: alpha, 1 - velocityDecay, then the plan's. A device array. */
export function forceScalars(planned, config, alpha) {
  return deviceArray([alpha, 1 - config.velocityDecay, ...planned.scalars.map((read) => read(config.forceSpecs))]);
}

/**
 * The plan's per-node and per-edge arrays (TODO 30.8): node columns and expressions over the
 * node table (`nodes`: its columns and `degree`), edge ones over the Force's input rows, d3's
 * default link strength (1 / the smaller endpoint degree) and bias (the source's share of the
 * endpoint degrees). Link distances and strengths must be finite: checked in one readback.
 * Returns float32 arrays the caller owns.
 */
export async function resolveForceArrays(planned, topology, input, evaluator) {
  const out = [];
  const nodes = createDataView(topology.nodeScope, { columns: { degree: topology.degree } });
  const edges = topology.edgeScope ?? input;
  const checks = [];
  try {
    for (const spec of planned.arrays) {
      if (spec.derived) {
        const a = np.take(topology.degree.ref, topology.from.ref, 0), b = np.take(topology.degree.ref, topology.to.ref, 0);
        out.push(spec.derived === "linkStrength"
          ? np.divide(1, np.maximum(np.minimum(a, b), 1))
          : a.ref.div(np.maximum(a.add(b), 1)));
        continue;
      }
      const scope = spec.domain === "node" ? nodes : edges;
      const evaluated = evaluateTransientExpression(spec.value, scope, { evaluator });
      let array;
      try {
        if (categoryColumn(evaluated.value) || typeof evaluated.value === "string")
          throw Error(`Force ${spec.name} ${spec.key} must be numeric.`);
        array = asArray(evaluated.value).astype(np.float32);
      } finally {
        evaluated.dispose();
      }
      const length = spec.domain === "node" ? topology.n : topology.e;
      if (array.shape.length !== 1 || array.shape[0] !== length) {
        array.dispose();
        throw Error(`Force ${spec.name} ${spec.key} must have one value per ${spec.domain} (${length}).`);
      }
      if (spec.domain === "edge" && spec.key !== "weight")
        checks.push({ bad: badCount(np.logicalNot(np.isfinite(array.ref))), message: `Force ${spec.name} ${spec.key} must be finite on every edge.` });
      out.push(array);
    }
    await validateAll(checks);
    return out;
  } catch (error) {
    out.forEach((a) => a.dispose());
    throw error;
  } finally {
    nodes.dispose();
  }
}
/**
 * Every check's count of bad values in ONE readback (TODO 30.3: there were up to five per
 * graph), then the first failing check's error, in order. Consumes the checks' counts.
 */
async function validateAll(checks) {
  if (!checks.length) return;
  const counts = await np.stack(checks.map((check) => check.bad.astype(np.float32))).data();
  const failed = checks.findIndex((_, i) => counts[i] > 0);
  if (failed >= 0) throw Error(checks[failed].message);
}
const badCount = (mask) => np.sum(mask.astype(np.int32));
const weightCheck = (weights) => ({
  bad: badCount(np.logicalOr(np.logicalNot(np.isfinite(weights.ref)), weights.ref.less(0))),
  message: "Force edge weights must be finite and nonnegative.",
});

export async function forceTopology(
  scope,
  c,
  { signal = undefined, maxBytes = dataBufferLimit() } = {},
) {
  requireGraph(scope, 'Force', c);
  const config = forceSettings(c),
    owned = [],
    own = (a) => (owned.push(a), a);
  // Each node's run of edge endpoints (TODO 30.3): link sums per tick, and the degrees.
  const runsOf = (from, to, n) => {
    const runs = edgeRuns(from, to, n);
    for (const key of ["order", "keys", "start", "end", "degree"]) own(runs[key]);
    return runs;
  };
  const graph = await graphData(scope, { name: "Force" }, { signal });
  try {
    const n = graph.ids.length, e = graph.from.length;
    if (!n) throw Error("Force requires at least one node in GraphData.");
    if (Math.max(n, e) * 128 > maxBytes)
      throw limitError("storage", { component: "Force", what: "its topology", count: Math.max(n, e) * 128, limit: maxBytes, hint: "Lay out fewer nodes or edges." });
    const from = own(np.array(Array.from(graph.from), { dtype: np.int32 }).reshape([e])),
      to = own(np.array(Array.from(graph.to), { dtype: np.int32 }).reshape([e]));
    const weights = own(c.weight ? asArray(graph.edgeScope.get(c.weight)).astype(np.float32) : np.ones([e]));
    if (c.weight) await validateAll([weightCheck(weights)]);
    const runs = runsOf(from, to, n);
    const initial = own(random.normal(random.key(config.seed), [n, config.dimensions])
      .mul(Math.sqrt(n) * config.linkDistance * 0.5));
    const topology = { n, e, from, to, weights, runs, degree: runs.degree, id: graph.idColumn,
      nodeFields: graph.fields, nodeScope: graph.nodeScope, edgeScope: graph.edgeScope,
      initial, config,
      async refresh(input, { signal } = {}) {
        let next;
        if (c.weight) {
          const edges = await graphTable(input, 'edges', { signal });
          try {
            next = asArray(edges.get(c.weight)).astype(np.float32);
            await validateAll([weightCheck(next)]);
          } catch (error) { next?.dispose(); throw error; }
          finally { edges.dispose(); }
        }
        try { await refreshGraphData(graph, input, { signal }); }
        catch (error) { next?.dispose(); throw error; }
        if (next) {
          const at = owned.indexOf(this.weights); if (at >= 0) owned.splice(at, 1);
          this.weights.dispose(); this.weights = own(next);
        }
        this.nodeFields = graph.fields; this.nodeScope = graph.nodeScope; this.edgeScope = graph.edgeScope;
      },
      dispose() { owned.splice(0).forEach(a => a.dispose()); graph.dispose(); } };
    return topology;
  } catch (error) { owned.forEach(a => a.dispose()); graph.dispose(); throw error; }
}

/**
 * Realize `arrays` (one or a list): blockUntilReady does not realize JAX elementwise expressions,
 * and a lazy one kept across ticks or constraints grows a nested WGSL expression each time.
 * gpuBuffer realizes each without a host transfer (its ref keeps ownership here). Then ONE wait
 * for the GPU covers them all, since it runs the queue in order (TODO 65.3: it was a zero-byte
 * readback each), or none with `wait: false`, for a caller that waits for the GPU anyway before
 * the host reads them (Force's publish settles the renderer).
 */
export async function materializeForceState(arrays, { wait = true } = {}) {
  assertGPUAvailable();
  const list = Array.isArray(arrays) ? arrays : [arrays];
  for (const array of list) if (array.device === "webgpu") await array.ref.gpuBuffer();
  if (wait) await Promise.all(list.filter((array, i) => array.device !== "webgpu" || i === list.length - 1).map((array) => array.blockUntilReady()));
  return arrays;
}
/**
 * Starting positions from node columns (TODO 30.8, `initial`: { x, y, z }): a finite value
 * sets its axis, anything else keeps the seeded random start. Returns [n, d] (caller owns).
 */
export async function initialPositions(topology, input, initial, evaluator) {
  const d = topology.config.dimensions;
  const axes = ["x", "y", "z"].slice(0, d);
  const planned = { arrays: axes.filter((axis) => initial?.[axis] !== undefined).map((axis) => ({ domain: "node", value: initial[axis], name: "initial", key: axis })) };
  if (!planned.arrays.length) return topology.initial.ref;
  const arrays = await resolveForceArrays(planned, topology, input, evaluator);
  let k = 0;
  const columns = axes.map((axis, i) => {
    const start = topology.initial.ref.slice([], [i, i + 1]).reshape([topology.n]);
    if (initial?.[axis] === undefined) return start;
    const column = arrays[k++];
    return np.where(np.isfinite(column.ref), column, start);
  });
  return np.stack(columns, 1);
}

/**
 * One tick (TODO 30.2, 30.5): a single jitted program (forceKernel.js) with its numbers from a
 * buffer, so a control or alpha change compiles nothing, and one wait per tick, which keeps the
 * next tick from queuing behind this one. Alpha moves toward alphaTarget by alphaDecay first,
 * and the forces use the new alpha, as d3's tick does. `planned` and `arrays`: forcePlan and
 * resolveForceArrays for the current forces (planned here when every parameter is a number).
 */
export async function forceStep(
  topology,
  position,
  velocity,
  pins,
  pinPosition,
  c,
  alpha = 1,
  { signal = undefined, planned = undefined, arrays = undefined } = {},
) {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  const config = forceSettings(c);
  const next = alpha + (config.alphaTarget - alpha) * config.alphaDecay;
  planned ??= forcePlan(config.forceSpecs, { ...config, n: topology.n });
  if (!arrays && planned.arrays.length)
    throw Error("Force parameters from columns need resolveForceArrays before a tick.");
  const parameters = forceScalars(planned, config, next);
  let nextPosition, nextVelocity;
  try {
    [nextPosition, nextVelocity] = forceTick(planned.plan, topology, position, velocity, pins, pinPosition, parameters, arrays ?? []);
  } finally {
    parameters.dispose();
  }
  try {
    await materializeForceState([nextPosition, nextVelocity]);
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  } catch (error) {
    nextPosition.dispose();
    nextVelocity.dispose();
    throw error;
  }
  return { position: nextPosition, velocity: nextVelocity, alpha: next };
}

/** Materialize every persistent constraint tensor, including the otherwise lazy
 * pin mask. Leaving it lazy grows a nested WGSL select for every pointer move. With `wait:
 * false` nothing waits for the GPU here (materializeForceState). */
export async function forceConstraint(state, index, position, pin = true, { wait = true } = {}) {
  const n = state.position.shape[0];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= n ||
    position.length !== state.position.shape[1] ||
    !position.every(Number.isFinite)
  )
    throw Error("Invalid force node constraint.");
  const mask = np.arange(n).equal(np.array(index, { dtype: np.int32 }));
  const value = np.array(position, { dtype: np.float32 });
  const next = {
    position: np.where(
      mask.ref.reshape([-1, 1]),
      value.ref,
      state.position.ref,
    ),
    pinPosition: np.where(
      mask.ref.reshape([-1, 1]),
      value,
      state.pinPosition.ref,
    ),
    pins: np.where(mask, np.array(pin, { dtype: np.bool }), state.pins.ref),
  };
  try {
    await materializeForceState(Object.values(next), { wait });
    return next;
  } catch (error) {
    Object.values(next).forEach((a) => a.dispose());
    throw error;
  }
}
