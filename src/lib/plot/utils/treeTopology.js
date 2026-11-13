import { evaluateTransientExpression, expressionEvaluator } from "./expressionPlans.js";
import { isExpression } from "./expressions.js";
import { layoutDependencies } from "./layoutInput.js";
import { graphData, hostColumn, graphDependencies, refreshGraphData } from "./graphData.js";

const check = (signal) => {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
};
function preorder(roots, child) {
  const order = [],
    stack = [...roots].reverse();
  while (stack.length) {
    const node = stack.pop();
    order.push(node);
    for (let i = child[node].length - 1; i >= 0; i--)
      stack.push(child[node][i]);
  }
  return order;
}

/** Structural dependencies are checked by reference. Changed widths/heights do not rebuild
 * traversal buffers. Filters' changed source/target arrays invalidate membership and order. */
export async function treeTopology(
  scope,
  c,
  { nodeScope, cache, signal } = {},
) {
  const dependencies = graphDependencies(scope);
  let saved = cache?.get("__treeTopology");
  if (
    !saved ||
    !dependencies.every((value, i) => Object.is(value, saved.dependencies[i]))
  ) {
    const graph = await graphData(
      scope,
      { name: "Tree" },
      { signal },
    );
    saved?.dispose();
    saved = {
      graph,
      dependencies,
      dispose() {
        this.kernel?.dispose();
        this.output?.dispose();
        this.graph.dispose();
      },
    };
    cache?.set("__treeTopology", saved);
  }
  else await refreshGraphData(saved.graph, scope, { signal });
  const graph = saved.graph,
    mode = c.mode ?? "tidy";
  try {
    let rootValue = c.root;
    if (isExpression(rootValue)) {
      const rootKey = layoutDependencies(rootValue, graph.nodeScope);
      if (
        saved.rootKey?.length === rootKey.length &&
        rootKey.every((value, i) => Object.is(value, saved.rootKey[i]))
      )
        rootValue = saved.rootValue;
      else {
        const result = evaluateTransientExpression(rootValue, graph.nodeScope, {
          evaluator: cache ? expressionEvaluator(cache) : undefined,
          broadcast: false,
        });
        try {
          const value = result.value,
            values =
              typeof value === "number" || typeof value === "boolean"
                ? [value]
                : await hostColumn(value);
          if (values.length !== 1)
            throw Error(
              "Tree root expression must return one node ID: reduce it with min, max, first or another reduction.",
            );
          rootValue = values[0];
          saved.rootKey = rootKey;
          saved.rootValue = rootValue;
        } finally {
          result.dispose();
        }
      }
    }
    const key = [
      ...dependencies,
      rootValue,
      Boolean(c.directed),
      c.mode === "partition",
    ];
    if (
      saved?.key?.length === key.length &&
      key.every((value, i) => Object.is(value, saved.key[i]))
    )
      return { ...saved.structure, graph, saved };
    saved?.kernel?.dispose();
    saved?.output?.dispose();
    if (saved) { saved.kernel = null; saved.output = null; }
    check(signal);
    const n = graph.ids.length,
      root = graph.ids.indexOf(rootValue);
    if (root < 0) throw Error("Tree root is not present.");
    const child = Array.from({ length: n }, () => []),
      parent = Array(n).fill(-1),
      parentEdge = Array(n).fill(-1),
      depth = Array(n).fill(-1);
    const degree = new Float32Array(n);
    // Each node's edges in edge order, so the breadth-first walk is O(nodes + edges).
    const incident = Array.from({ length: n }, () => []);
    graph.from.forEach((from, edge) => {
      const to = graph.to[edge];
      degree[from]++;
      degree[to]++;
      incident[from].push(edge);
      if (to !== from) incident[to].push(edge);
    });
    const visit = (first) => {
      depth[first] = 0;
      const queue = [first];
      for (let at = 0; at < queue.length; at++) {
        check(signal);
        const current = queue[at];
        for (const edge of incident[current]) {
          const forward = graph.from[edge] === current,
            reverse = !c.directed && graph.to[edge] === current;
          if (!forward && !reverse) continue;
          const next = forward ? graph.to[edge] : graph.from[edge];
          if (depth[next] >= 0) continue;
          depth[next] = depth[current] + 1;
          parent[next] = current;
          parentEdge[next] = edge;
          child[current].push(next);
          queue.push(next);
        }
      }
      return queue;
    };
    visit(root);
    if (mode === "partition") {
      // Validate the rooted component only. An internal root's incoming edge and all
      // unreachable nodes are outside a directed subtree; undirected roots reroot a component.
      const incoming = new Int32Array(n);
      for (let edge = 0; edge < graph.from.length; edge++) {
        const from = graph.from[edge],
          to = graph.to[edge];
        if (depth[from] < 0 || depth[to] < 0) continue;
        if (from === to || (c.directed && to === root))
          throw Error(
            "Tree partition does not allow cycles in the rooted hierarchy: remove the cyclic edge.",
          );
        if (c.directed && ++incoming[to] > 1)
          throw Error(
            "Tree partition requires one parent per node in the rooted hierarchy: remove the extra incoming edge.",
          );
        if (parentEdge[from] !== edge && parentEdge[to] !== edge)
          throw Error(
            "Tree partition does not allow cycles in the rooted hierarchy: remove the cyclic edge.",
          );
      }
    }
    const selected = Array.from({ length: n }, (_, i) => i).filter(
        (i) => depth[i] >= 0,
      ),
      roots = selected.filter((i) => parent[i] < 0);
    // order: each leaf's place among the leaves, left to right (NaN for inner nodes).
    const pre = preorder(roots, child),
      order = new Float64Array(n).fill(NaN);
    let leafCount = 0;
    for (const node of pre) if (!child[node].length) order[node] = leafCount++;
    const structure = {
      n,
      root,
      child,
      parent,
      parentEdge,
      depth,
      degree,
      selected,
      roots,
      pre,
      order,
    };
    saved.key = key;
    saved.structure = structure;
    return { ...structure, graph, saved };
  } catch (error) {
    if (!cache) saved.dispose();
    throw error;
  }
}
