import { evaluateTransientExpression, expressionEvaluator } from "./expressionPlans.js";
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "./categorical.js";
import { hostColumn, requireGraph, graphDependencies, graphTable, createGraphData, graphScope } from "./graphData.js";

import { TweenState } from "./tweenState.js";
import { checkTiming } from "./animation.js";
import { layoutDependencies } from "./layoutInput.js";
import { isExpression } from "./expressions.js";
import { deviceScalar } from "./deviceParams.js";
import { asArray } from "./data.js";
import { keyValues } from "./tableJoin.js";

const same = (a, b) =>
  Boolean(
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i])),
  );
const rows = async (scope, keys) =>
  Object.fromEntries(
    await Promise.all(
      scope
        .keys()
        .filter((k) => !k.startsWith("@") && !scope.graphDerivedColumns?.has(k))
        .map(async (k) => {
          // Membership snapshots preserve exact host keys; numeric device columns can
          // narrow IDs that exceed float32 precision even while their metadata is exact.
          if (keys.has(k)) return [k, (await keyValues(scope, k, { atRows: true })).values];
          const value = scope.get(k);
          return [
            k,
            value instanceof JaxArray && value.shape.length > 1
              ? await value.ref.js()
              : await hostColumn(value),
          ];
        }),
    ),
  );
const edgeKey = (source, target) => JSON.stringify([source, target]);
const columns = (scope) =>
  Object.fromEntries(
    scope
      .keys()
      .filter((k) => !k.startsWith("@") && !scope.graphDerivedColumns?.has(k))
      .map((k) => [k, scope.get(k)]),
  );
// Live rows precede retained exits. Append the previous tail on the device for numeric
// columns; categorical attributes are only decoded when their input changes.
async function refreshRows(next, previous, count, length, owned) {
  const result = {};
  for (const field of new Set([...Object.keys(next), ...previous.keys()])) {
    const a = next[field],
      b = previous.has(field) ? previous.get(field) : undefined;
    if (length === count) {
      result[field] = a;
      continue;
    }
    const numeric =
      a instanceof JaxArray ||
      b instanceof JaxArray ||
      (a ?? b)?.some?.((v) => typeof v === "number");
    if (numeric) {
      const full = asArray(b ?? Array(length).fill(NaN));
      const incoming = asArray(a ?? Array(count).fill(NaN));
      const tail = np.take(full, np.arange(count, length).astype(np.int32), 0);
      result[field] = np.concatenate([incoming, tail], 0);
      owned.push(result[field]);
    } else {
      const before =
        b === undefined ? Array(length).fill(null) : await hostColumn(b);
      const after =
        a === undefined ? Array(count).fill(null) : await hostColumn(a);
      result[field] = [...after, ...before.slice(count)];
    }
  }
  return result;
}
const merge = (next, previous, key, keep) => {
  const ids = next[key],
    old = previous?.[key] ?? [],
    nextIds = new Set(ids),
    extra = old
      .map((id, i) => [id, i])
      .filter(([id]) => !nextIds.has(id) && keep(id));
  const fields = new Set([
    ...Object.keys(next),
    ...Object.keys(previous ?? {}),
  ]);
  return Object.fromEntries(
    [...fields].map((field) => [
      field,
      [
        ...ids.map((_, i) => next[field]?.[i] ?? NaN),
        ...extra.map(([, i]) => previous[field]?.[i] ?? NaN),
      ],
    ]),
  );
};

/** Layout owns membership, retains exit rows, and blends numeric contributions on the
 * device. Structural input reads happen only on updates, never on animation frames. */
export async function treeLifecycle(
  scope,
  c,
  { nodeScope, cache, time = 0, landed = false } = {},
) {
  for (const phase of ["enter", "exit"])
    if (
      c[phase] !== undefined &&
      (!c[phase] || typeof c[phase] !== "object" || Array.isArray(c[phase]))
    )
      throw Error(
        `Tree ${phase}: pass an object with numeric nodeWidth, layerHeight, or edgeLength endpoints.`,
      );
  if (!cache || (!c.enter && !c.exit && c.where === undefined))
    return {
      scope,
      config: c,
      apply: (a) => a,
      visible: null,
      liveUntil: -Infinity,
    };
  checkTiming("Tree", {
    duration: c.animationDuration,
    easing: c.animationEasing,
  });
  for (const phase of ["enter", "exit"])
    for (const [key, value] of Object.entries(c[phase] ?? {})) {
      if (
        !["nodeWidth", "layerHeight", "edgeLength"].includes(key) ||
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      )
        throw Error(
          `Tree ${phase}: pass nonnegative numeric nodeWidth, layerHeight, or edgeLength endpoints.`,
        );
    }
  let state = cache.get("__treeLifecycle");
  if (!state) {
    state = {
      edges: createDataScope(),
      factor: new TweenState({
        duration: c.animationDuration ?? 300,
        easing: c.animationEasing ?? "cubic-in-out",
      }),
      offsets: new Map(),
      refreshed: [],
      dispose() {
        this.refreshed.forEach((value) => value.dispose());
        for (const value of this.offsets.values()) value.dispose();
        this.edges.dispose();
        this.graphInput?.dispose();
        this.factor.dispose();
      },
    };
    cache.set("__treeLifecycle", state);
  }
  const bundle = requireGraph(scope, "Tree"), supplied = bundle.nodes;
  const source = await graphTable(scope, "edges");
  try {
  const mapping = { source: bundle.source, target: bundle.target, nodeKey: bundle.nodeKey };
  const nodeKeys = new Set([mapping.nodeKey, "id"]);
  const edgeKeys = new Set([mapping.source, mapping.target]);
  const dependencies = graphDependencies(scope);
  const numericKey = [
    ...source.keys().filter(k => !k.startsWith("@") && !source.graphDerivedColumns?.has(k)).map(k => source.get(k)),
    ...supplied.keys().filter(k => !k.startsWith("@") && !supplied.graphDerivedColumns?.has(k)).map(k => supplied.get(k)),
  ];
  const retire = state.factor.end <= time && state.departing;
  const changed = !same(dependencies, state.dependencies);
  let refreshed;
  if (
    !changed &&
    !retire &&
    !same(numericKey, state.numericKey) &&
    state.departing
  ) {
    refreshed = [];
    const nextNodes =
      columns(supplied);
    const nextEdges = columns(source);
    state.nodes = await refreshRows(
      nextNodes,
      nodeScope,
      state.newIds.size,
      state.ids.length,
      refreshed,
    );
    state.nodes[state.key] = state.ids;
    state.nodes.id = state.ids;
    const updatedEdges = await refreshRows(
      nextEdges,
      state.edges,
      source.length,
      state.edges.length,
      refreshed,
    );
    for (const field of [mapping.source, mapping.target])
      updatedEdges[field] = state.edges.get(field);
    state.edges.update(updatedEdges);
    state.nextNodes = nextNodes;
    state.nextEdges = nextEdges;
  }
  if (
    !changed &&
    !retire &&
    !same(numericKey, state.numericKey) &&
    !state.departing
  ) {
    state.nodes = {
        ...Object.fromEntries(
          supplied.keys().filter(k => !supplied.graphDerivedColumns?.has(k)).map((k) => [k, supplied.get(k)]),
        ),
        [state.key]: state.ids,
      };
  }
  if (
    !changed &&
    !retire &&
    !same(numericKey, state.numericKey) &&
    !state.departing
  ) {
    const edgeColumns = Object.fromEntries(
      source
        .keys()
        .filter((k) => !k.startsWith("@") && !source.graphDerivedColumns?.has(k))
        .map((k) => [k, source.get(k)]),
    );
    for (const field of [mapping.source, mapping.target])
      edgeColumns[field] = state.edges.get(field);
    state.edges.update(edgeColumns);
  }
  if (changed || retire) {
    if (state.nodes) state.nodes = await rows(nodeScope, nodeKeys);
    if (state.edgeRows && state.edges.length) {
      const columns = await rows(state.edges, edgeKeys);
      state.edgeRows = Array.from({ length: state.edges.length }, (_, i) =>
        Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, v[i]])),
      );
    }
    const nextEdges = changed ? await rows(source, edgeKeys) : state.nextEdges;
    const nextNodes = changed ? await rows(supplied, nodeKeys) : state.nextNodes;
    const key = mapping.nodeKey;
    const priorIds = state.nodes?.[key] ?? [],
      nextIds = nextNodes[key];
    const oldAt = new Map(priorIds.map((id, i) => [id, i]));
    const union = merge(
      nextNodes,
      state.nodes,
      key,
      () => !retire && Boolean(c.exit),
    );
    // Retain old edges for departing children; reparented live nodes take the new edge.
    const nextKeys = nextEdges[mapping.source].map((id, i) =>
      edgeKey(id, nextEdges[mapping.target][i]),
    );
    const nextKeySet = new Set(nextKeys),
      nextIdSet = new Set(nextIds);
    const extra = (state.edgeRows ?? []).filter(
      (row) =>
        !retire &&
        c.exit &&
        !nextKeySet.has(edgeKey(row[mapping.source], row[mapping.target])) &&
        (!nextIdSet.has(row[mapping.source]) || !nextIdSet.has(row[mapping.target])),
    );
    const edgeRows = nextKeys
      .map((_, i) =>
        Object.fromEntries(
          Object.entries(nextEdges).map(([k, v]) => [k, v[i]]),
        ),
      )
      .concat(extra);
    const fields = new Set([
      ...Object.keys(nextEdges),
      ...extra.flatMap(Object.keys),
    ]);
    const edgeColumns = Object.fromEntries(
      [...fields].map((k) => [k, edgeRows.map((row) => row[k] ?? NaN)]),
    );
    for (const field of [mapping.source, mapping.target])
      if (
        state.edges.has(field) &&
        same(edgeColumns[field], state.edges.get(field))
      )
        edgeColumns[field] = state.edges.get(field);
    state.edges.update(edgeColumns);
    if (same(union[key], priorIds)) union[key] = state.nodes[key];
    for (const offset of state.offsets.values())
      offset.remap(
        union[key].map((id) => oldAt.get(id) ?? -1),
        union[key].length,
      );
    if (state.factor.from)
      state.factor.remap(
        union[key].map((id) => oldAt.get(id) ?? -1),
        union[key].length,
      );
    state.nodes = union;
    state.edgeRows = edgeRows;
    state.originalEdges = extra.length === 0;
    state.nextEdges = nextEdges;
    state.nextNodes = nextNodes;
    state.dependencies = dependencies;
    state.ids = union[key];
    state.key = key;
    state.newIds = nextIdSet;
    state.maskKey = null;
  }
  const numericChanged = !same(numericKey, state.numericKey);
  state.numericKey = numericKey;
  nodeScope.setKey(state.key);
  nodeScope.update(state.nodes);
  nodeScope.liveColumns = supplied.liveColumns;
  nodeScope.liveUntil = supplied.liveUntil;
  nodeScope.columnFact = (field, fact) => state.nodes[field] === supplied.get(field)
    ? supplied.columnFact?.(field, fact) : undefined;
  if (refreshed || changed || retire) {
    state.refreshed.forEach((value) => value.dispose());
    state.refreshed = refreshed ?? [];
  }
  if (!state.graphInput || changed || retire || numericChanged) {
    const graph = createGraphData({ nodes: nodeScope, edges: state.originalEdges ? source : state.edges, ...mapping });
    const next = graphScope(graph); graph.dispose();
    state.graphInput?.dispose(); state.graphInput = next;
  }
  const maskKey = [
    ...layoutDependencies(c.where, nodeScope),
    // A string or number root is a node ID, not a column (treeTopology.js reads it the same way).
    ...(isExpression(c.root) ? layoutDependencies(c.root, nodeScope) : [c.root]),
    Boolean(c.directed),
    JSON.stringify([c.enter, c.exit, c.animationDuration, c.animationEasing]),
  ];
  if (!same(maskKey, state.maskKey)) {
    let mask = Array(state.ids.length).fill(1);
    if (c.where !== undefined) {
      const evaluated = evaluateTransientExpression(c.where, nodeScope, { evaluator: expressionEvaluator(cache) });
      try {
        mask = await hostColumn(evaluated.value);
      } finally {
        evaluated.dispose();
      }
    }
    const allowed = new Set(
      state.ids.filter((id, i) => state.newIds.has(id) && mask[i]),
    );
    // A filtered parent disconnects its descendants from the visible hierarchy.
    let root = c.root;
    if (root?.__hmplotExpression) {
      const result = evaluateTransientExpression(root, nodeScope, { broadcast: false, evaluator: expressionEvaluator(cache) });
      try {
        root = (await hostColumn(result.value))[0];
      } finally {
        result.dispose();
      }
    }
    const reachable = new Set([root]);
    const pending = [root],
      incident = new Map();
    for (const row of state.edgeRows) {
      const a = row[mapping.source],
        b = row[mapping.target];
      if (!incident.has(a)) incident.set(a, []);
      incident.get(a).push(b);
      if (!c.directed) {
        if (!incident.has(b)) incident.set(b, []);
        incident.get(b).push(a);
      }
    }
    for (let i = 0; i < pending.length; i++)
      for (const id of incident.get(pending[i]) ?? [])
        if (allowed.has(id) && !reachable.has(id)) {
          reachable.add(id);
          pending.push(id);
        }
    const target = state.ids.map((id) =>
      Number((allowed.has(id) && reachable.has(id)) || id === root),
    );
    const array = np.array(target);
    const first = !state.factor.from;
    state.factor.duration = Math.max(c.animationDuration ?? 300, 1e-6);
    state.factor.easing = c.animationEasing ?? "cubic-in-out";
    const previousEnd = state.factor.end;
    const transition = state.ids.some(
      (id, i) =>
        state.targets?.get(id) !== target[i] &&
        (target[i] ? Boolean(c.enter) : Boolean(c.exit)),
    );
    const targetChanged =
      first || state.ids.some((id, i) => state.targets?.get(id) !== target[i]);
    if (targetChanged)
      state.factor.retarget(
        array,
        null,
        target.length,
        time,
        landed || (!c.enter && !c.exit),
      );
    array.dispose();
    state.exitUntil ??= new Map();
    for (let i = 0; i < state.ids.length; i++) {
      const id = state.ids[i];
      if (target[i]) state.exitUntil.delete(id);
      else if (state.targets?.get(id))
        state.exitUntil.set(
          id,
          time + (landed || !c.exit ? 0 : (c.animationDuration ?? 300)),
        );
    }
    if (targetChanged) {
      for (const key of ["nodeWidth", "layerHeight", "edgeLength"]) {
        const enter = c.enter?.[key] ?? 0,
          exit = c.exit?.[key] ?? 0;
        if (enter === exit) {
          state.offsets.get(key)?.dispose();
          state.offsets.delete(key);
          continue;
        }
        let offset = state.offsets.get(key);
        if (!offset) {
          offset = new TweenState({
            duration: state.factor.duration,
            easing: state.factor.easing,
          });
          state.offsets.set(key, offset);
        }
        offset.duration = state.factor.duration;
        offset.easing = state.factor.easing;
        const values = np.array(target.map((v) => (v ? 0 : exit)));
        offset.retarget(values, null, target.length, time, landed);
        values.dispose();
        if (!first) {
          const known = np.array(
              state.ids.map(
                (id, i) =>
                  (state.previousIds?.has(id) ?? true) &&
                  (!target[i] ||
                    state.targets?.get(id) ||
                    state.exitUntil.get(id) > time),
              ),
              { dtype: np.bool },
            ),
            t = deviceScalar(time);
          const from = np.where(known.ref, offset.from.ref, enter),
            start = np.where(known, offset.start.ref, t.ref);
          t.dispose();
          offset.from.dispose();
          offset.start.dispose();
          offset.from = from;
          offset.start = start;
        }
      }
    }
    state.targets = new Map(state.ids.map((id, i) => [id, target[i]]));
    if (!first && targetChanged) {
      // New slots begin at the enter contribution rather than snapping to their target.
      const known = np.array(
        state.ids.map((id) => Boolean(state.previousIds?.has(id) ?? true)),
        { dtype: np.bool },
      );
      const t = deviceScalar(time);
      const from = np.where(known.ref, state.factor.from.ref, 0),
        start = np.where(known.ref, state.factor.start.ref, t.ref);
      t.dispose();
      const animated = np.array(
        target.map((value) => (value ? Boolean(c.enter) : Boolean(c.exit))),
        { dtype: np.bool },
      );
      const finalFrom = np.where(animated.ref, from, state.factor.to.ref),
        finalStart = np.where(animated, start, -1e12);
      known.dispose();
      state.factor.from.dispose();
      state.factor.start.dispose();
      state.factor.from = finalFrom;
      state.factor.start = finalStart;
    }
    if (landed || (!transition && targetChanged))
      state.factor.end = landed ? -Infinity : previousEnd;
    state.target = target;
    state.previousIds = new Set(state.ids);
    state.maskKey = maskKey;
    state.departing = state.ids.some((id) => !state.newIds.has(id));
  }
  const moving = !landed && state.factor.end > time;
  const factor = state.factor.rowsAt(null, landed ? Infinity : time);
  const visible = state.ids.map((_, i) =>
    Boolean(
      state.target[i] || (!landed && state.exitUntil.get(state.ids[i]) > time),
    ),
  );
  const contributing = np.array(visible, { dtype: np.bool });
  return {
    scope: state.graphInput,
    config: c,
    presence: factor,
    visible,
    liveUntil: moving ? state.factor.end : -Infinity,
    apply(value, key) {
      const offset = state.offsets.get(key);
      const enter = c.enter?.[key] ?? 0;
      let result;
      if (offset) {
        const current = offset.rowsAt(null, landed ? Infinity : time);
        result = value.ref.mul(factor.ref).add(current);
      } else
        result =
          enter === 0
            ? value.ref.mul(factor.ref)
            : value.ref.sub(enter).mul(factor.ref).add(enter);
      value.dispose();
      return np.where(contributing.ref, result, 0);
    },
    dispose() {
      factor.dispose();
      contributing.dispose();
      source.dispose();
    },
  };
  } catch (error) { source.dispose(); throw error; }
}
