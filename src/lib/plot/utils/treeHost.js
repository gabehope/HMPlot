import { evaluateTransientExpression, expressionEvaluator } from "./expressionPlans.js";
import { numpy as np } from "@hmplot/jax";
import { createDataView, snapshotDataScope } from "./dataView.js";
import { expressionHasTween } from "./expressions.js";
import { layoutLive } from "./layoutLive.js";
import { layoutCoordinateNames } from "./layoutPublication.js";
import { hostColumn, requireGraph, publishGraph } from "./graphData.js";
import { treeTopology } from "./treeTopology.js";
import { treeLifecycle } from "./treeLifecycle.js";
import { animationCorrespondenceCache } from "./animationGroup.js";
import { layoutInput, validateLayoutInput } from "./layoutInput.js";
import { treeKernel } from "./treeKernel.js";
import { treeOutput } from "./treeOutput.js";
import { rememberHostSource } from "./hostSources.js";
import { hierarchy, tree as tidyTree } from "d3";

const orient = ([across, along], direction) =>
  direction === "left"
    ? [-along, across]
    : direction === "right"
      ? [along, across]
      : direction === "up"
        ? [across, along]
        : [across, -along];
const check = (signal) => {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
};
const publicationRows = (saved, name, rows) => {
  const previous = saved[name];
  if (previous?.rows.length === rows.length && rows.every((row, index) => row === previous.rows[index])) return previous;
  return (saved[name] = { rows });
};

/** Merge heights for mode="cluster": leaves at 0 (missing reads as 0), each merge finite and not
 * below its children (TODO 39.3). */
function mergeHeights(values, pre, child, ids) {
  // Heights arrive as float32: messages show six significant digits.
  const name = (node) => String(ids[node]),
    show = (v) =>
      typeof v === "number" ? String(+v.toPrecision(6)) : String(v),
    heights = new Float64Array(ids.length);
  for (const node of pre) {
    const value = values[node];
    if (!child[node].length) {
      if (value == null || Number.isNaN(value)) continue;
      if (value !== 0)
        throw Error(
          `Tree height: leaf ${name(node)} has height ${show(value)}; leaves sit at 0 in a dendrogram. Give leaves 0 or leave them missing.`,
        );
    } else if (typeof value !== "number" || !Number.isFinite(value))
      throw Error(
        `Tree height must be a finite number for every merge; node ${name(node)} has ${value}.`,
      );
    else heights[node] = value;
  }
  for (const node of pre)
    for (const next of child[node])
      if (heights[node] < heights[next])
        throw Error(
          `Tree height must not decrease toward the root: node ${name(node)} (height ${show(heights[node])}) is below its child ${name(next)} (height ${show(heights[next])}). Centroid and median linkage can merge below an earlier merge; use another linkage method.`,
        );
  return heights;
}

export async function treeHostLayout(
  scope,
  c,
  { signal, nodeScope, cache, time = 0, landed = false } = {},
) {
  requireGraph(scope, "Tree", c);
  const sourceScopes = [scope, scope.graph?.nodes];
  const mode = c.mode ?? "tidy",
    direction = c.orientation ?? "down",
    visualMargin = c.visualMargin ?? 0;
  const sibling = c.siblingSpacing ?? 1,
    spacing = c.depthSpacing ?? 1;
  if (!["tidy", "tidy-approx", "partition", "cluster"].includes(mode))
    throw Error("Tree mode must be tidy, tidy-approx, partition, or cluster.");
  if (!["down", "up", "left", "right"].includes(direction))
    throw Error("Tree orientation must be down, up, left, or right.");
  if (
    mode !== "partition" &&
    ![sibling, spacing].every((v) => Number.isFinite(v) && v > 0)
  )
    throw Error(
      "Tree siblingSpacing and depthSpacing must be positive and finite.",
    );
  if (c.height !== undefined && mode !== "cluster")
    throw Error(
      'Tree height places nodes at their merge heights in mode="cluster" only: set mode="cluster", or remove height.',
    );
  if (
    mode === "cluster" &&
    (c.enter ||
      c.exit ||
      c.where !== undefined ||
      (c.edgeLength !== undefined && c.edgeLength !== 1))
  )
    throw Error(
      "Tree cluster uses merge heights: use tidy or tidy-approx for edge lengths and layout entry/exit.",
    );
  const lifecycle = await treeLifecycle(scope, c, {
    nodeScope,
    cache,
    time,
    landed,
  });
  scope = lifecycle.scope;
  c = lifecycle.config;
  let topology;
  try {
    check(signal);
    topology = await treeTopology(scope, c, { signal, nodeScope, cache });
  } catch (error) {
    lifecycle.dispose?.();
    throw error;
  }
  const {
    graph,
    saved,
    n,
    root,
    child,
    parent,
    parentEdge,
    depth,
    degree,
    pre,
    order,
  } = topology;
  scope = graph.edgeScope;
  const selected = topology.selected.filter(
    (i) => !lifecycle.visible || lifecycle.visible[i],
  );
  const owned = [],
    own = (v) => (owned.push(v), v);
  let nodes, edges, base;
  let liveUntil = lifecycle.liveUntil;
  const groupRows = async (rows, field, values) => {
    if (!values.some(expressionHasTween) || c.__animationGroup == null) return null;
    const key = `__animationCorrespondence/${field}`;
    let groups = cache?.get(key);
    if (!groups) {
      groups = animationCorrespondenceCache();
      if (cache) cache.set(key, groups);
      else owned.push(groups);
    }
    return groups.prepare(rows, c.__animationGroup);
  };
  let nodeCorrespondence, edgeCorrespondence;
  const input = async (value, key, count) => {
    const array = layoutInput(value, graph.nodeScope, key, {
      cache,
      time,
      landed,
      correspondence: nodeCorrespondence,
      moving: (state) => {
        if (!landed && state.end > time)
          liveUntil = Math.max(liveUntil, state.end);
      },
    });
    let values;
    try {
      const current = lifecycle.apply(array.ref, key);
      try {
        values = await hostColumn(current);
      } finally {
        current.dispose();
      }
    } finally {
      array.dispose();
    }
    if (values.length !== count)
      throw Error(
        `Tree ${key} must give one numeric value per node: pass a number, node column or numeric expression.`,
      );
    return values;
  };
  try {
    [nodeCorrespondence, edgeCorrespondence] = await Promise.all([
      groupRows(graph.nodeScope, "nodes", [c.nodeWidth, c.layerHeight, c.height]),
      groupRows(scope, "edges", [c.edgeLength]),
    ]);
    const gpu = mode === "partition" || mode === "tidy-approx";
    let gpuColumns;
    const width = gpu
      ? Array(n).fill(1)
      : await input(c.nodeWidth ?? 1, "nodeWidth", n);
    if (selected.some((i) => !Number.isFinite(width[i]) || width[i] < 0))
      throw Error(
        "Tree nodeWidth must be nonnegative and finite: pass numeric node widths.",
      );
    const center = Array(n).fill(0),
      span = Array(n).fill(0),
      distance = Array(n).fill(0);
    if (!gpu && mode === "tidy") {
      const raw = layoutInput(c.edgeLength ?? 1, scope, "edgeLength", {
        cache,
        time,
        landed,
        correspondence: edgeCorrespondence,
        moving: (state) => {
          if (!landed && state.end > time)
            liveUntil = Math.max(liveUntil, state.end);
        },
      });
      const full = np.concatenate([raw, np.zeros([1])]),
        at = np.array(
          parentEdge.map((i) => (i < 0 ? scope.length : i)),
          { dtype: np.int32 },
        );
      const lengths = lifecycle.apply(np.take(full, at), "edgeLength");
      try {
        const values = await hostColumn(lengths);
        if (selected.some((i) => !Number.isFinite(values[i]) || values[i] < 0))
          throw Error(
            "Tree edgeLength must be nonnegative and finite: pass numeric edge lengths.",
          );
        for (const node of pre)
          if (parent[node] >= 0)
            distance[node] = distance[parent[node]] + values[node] * spacing;
      } finally {
        lengths.dispose();
      }
    }
    if (gpu) {
      const widthMode = c.widthMode ?? "proportional",
        align = c.childAlign ?? "center";
      if (!["fixed", "proportional"].includes(widthMode))
        throw Error("Tree widthMode must be fixed or proportional.");
      if (!["left", "center", "right"].includes(align))
        throw Error("Tree childAlign must be left, center, or right.");
      if (!Number.isFinite(visualMargin) || visualMargin < 0)
        throw Error("Tree visualMargin must be finite and nonnegative.");
      const moving = (state) => {
        if (!landed && state.end > time)
          liveUntil = Math.max(liveUntil, state.end);
      };
      const args = { cache, time, landed, moving };
      await Promise.all([
        validateLayoutInput(
          c.nodeWidth ?? 1,
          graph.nodeScope,
          "nodeWidth",
          cache,
        ),
        validateLayoutInput(
          c.layerHeight ?? 1,
          graph.nodeScope,
          "layerHeight",
          cache,
        ),
        validateLayoutInput(c.edgeLength ?? 1, scope, "edgeLength", cache),
      ]);
      const w = own(
        lifecycle.apply(
          layoutInput(c.nodeWidth ?? 1, graph.nodeScope, "nodeWidth", { ...args, correspondence: nodeCorrespondence }),
          "nodeWidth",
        ),
      );
      const h = own(
        lifecycle.apply(
          layoutInput(c.layerHeight ?? 1, graph.nodeScope, "layerHeight", { ...args, correspondence: nodeCorrespondence }),
          "layerHeight",
        ),
      );
      const edgeLength = own(
        layoutInput(c.edgeLength ?? 1, scope, "edgeLength", { ...args, correspondence: edgeCorrespondence }),
      );
      const lengths = own(np.concatenate([edgeLength.ref, np.zeros([1])]));
      const edgeAt = own(
        np.array(
          parentEdge.map((i) => (i < 0 ? scope.length : i)),
          { dtype: np.int32 },
        ),
      );
      const l = own(
        lifecycle.apply(np.take(lengths.ref, edgeAt.ref, 0), "edgeLength"),
      );
      const kernelKey = JSON.stringify([
        mode,
        direction,
        c.widthMode,
        c.childAlign,
      ]);
      if (!saved.kernel || saved.kernelKey !== kernelKey) {
        saved.kernel?.dispose();
        saved.kernel = treeKernel(
          { parent, child, depth, root },
          { ...c, mode },
        );
        saved.kernelKey = kernelKey;
      }
      gpuColumns = saved.kernel.run(w, h, l, c);
      gpuColumns.forEach(own);
    } else if (mode === "cluster") {
      // d3.cluster: leaves one unit apart in order, each parent at the mean of its children;
      // along the tree, the distance from the leaves: a merge height, or 1 + the tallest child.
      let heights;
      if (c.height !== undefined) {
        const result = evaluateTransientExpression(c.height, graph.nodeScope, {
          evaluator: cache ? expressionEvaluator(cache) : undefined,
          rowCount: n,
        });
        try {
          heights = mergeHeights(
            await hostColumn(result.value),
            pre,
            child,
            graph.ids,
          );
        } finally {
          result.dispose();
        }
      }
      for (let k = pre.length - 1; k >= 0; k--) {
        const node = pre[k],
          kids = child[node];
        if (!kids.length) {
          center[node] = order[node];
          continue;
        }
        center[node] =
          kids.reduce((sum, next) => sum + center[next], 0) / kids.length;
        span[node] = heights
          ? heights[node]
          : 1 + kids.reduce((top, next) => Math.max(top, span[next]), 0);
      }
    } else {
      const data = Array.from({ length: n }, (_, node) => ({
        node,
        children: [],
      }));
      for (const node of pre)
        data[node].children = child[node]
          .filter((i) => !lifecycle.visible || lifecycle.visible[i])
          .map((i) => data[i]);
      const layout = hierarchy(data[root]);
      tidyTree()
        .nodeSize([sibling, spacing])
        .separation(
          (a, b) =>
            ((width[a.data.node] + width[b.data.node]) / 2) *
            (a.parent === b.parent ? 1 : 2),
        )(layout);
      for (const node of layout.descendants()) center[node.data.node] = node.x;
    }
    if (gpu) {
      const output = treeOutput(topology, selected, mode).run(
        gpuColumns,
        lifecycle.presence,
        own,
      );
      base = snapshotDataScope(graph.nodeScope);
      nodes = createDataView(base, {
        indices: output.nodeIndices,
        columns: output.node,
        names: layoutCoordinateNames(),
      });
      edges = createDataView(scope, {
        indices: output.edgeIndices,
        columns: output.edge,
      });
      nodes.topology = saved.output;
      edges.topology = saved.output;
    } else {
      const positions = [],
        xs = [],
        ys = [];
      const origin = mode === "tidy" ? center[root] : 0;
      for (const node of selected) {
        // A cluster's leaves sit at 0 along the tree and its root at the far end, so "down" draws
        // the heights upward from the leaves, as scipy does.
        const p =
          mode === "cluster"
            ? orient([center[node] * sibling, -span[node] * spacing], direction)
            : orient([center[node] - origin, distance[node]], direction);
        positions.push(p.map((value) => (value === 0 ? 0 : value)));
        xs.push(p[0] === 0 ? 0 : p[0]);
        ys.push(p[1] === 0 ? 0 : p[1]);
      }
      const column = (values) => own(np.array(values));
      const ids = graph.ids.some((id) => typeof id !== "number");
      const parentValues = selected.map((i) =>
        parent[i] < 0 ? -1 : parent[i],
      );
      const parentColumn = ids
        ? { codes: column(parentValues), categories: graph.ids }
        : column(parentValues.map((i) => (i < 0 ? -1 : graph.ids[i])));
      if (!ids) rememberHostSource(parentColumn,
        parentValues.map((i) => (i < 0 ? -1 : graph.ids[i])), [selected.length]);
      const columns = {
        presence: lifecycle.presence
          ? own(
              np.take(
                lifecycle.presence.ref,
                own(np.array(selected, { dtype: np.int32 })).ref,
                0,
              ),
            )
          : column(selected.map(() => 1)),
        position: column(positions),
        x: column(xs),
        y: column(ys),
        parent: parentColumn,
        depth: column(selected.map((i) => depth[i])),
        degree: column(selected.map((i) => degree[i])),
        order: column(selected.map((i) => order[i])),
      };
      const rowByNode = new Map(selected.map((node, row) => [node, row]));
      const parentRows = selected.map((node) => rowByNode.get(parent[node]));
      columns.parentPosition = column(
        parentRows.map((row) =>
          row === undefined ? [NaN, NaN] : positions[row],
        ),
      );
      for (const [name, values] of Object.entries({ x: xs, y: ys }))
        columns["parent" + name[0].toUpperCase() + name.slice(1)] = column(
          parentRows.map((row) => (row === undefined ? NaN : values[row])),
        );
      base = snapshotDataScope(graph.nodeScope);
      nodes = createDataView(base, {
        indices: column(selected),
        columns,
        names: layoutCoordinateNames(),
      });
      const edgeRows = selected.filter((i) => parentEdge[i] >= 0),
        edgeIndices = column(edgeRows.map((i) => parentEdge[i]));
      const positionByNode = new Map(
        selected.map((node, row) => [node, positions[row]]),
      );
      edges = createDataView(scope, {
        indices: edgeIndices,
        columns: {
          start: column(edgeRows.map((i) => positionByNode.get(parent[i]))),
          end: column(edgeRows.map((i) => positionByNode.get(i))),
          depth: column(edgeRows.map((i) => depth[i])),
          presence: own(
            np.take(
              columns.presence.ref,
              own(
                np.array(
                  edgeRows.map((i) => rowByNode.get(i)),
                  { dtype: np.int32 },
                ),
              ).ref,
              0,
            ),
          ),
        },
      });
      nodes.topology = publicationRows(saved, 'nodePublication', selected);
      edges.topology = publicationRows(saved, 'edgePublication', edgeRows.map(node => parentEdge[node]));
    }
    // Marks/Filters retain these views while preparing or finishing an exit animation.
    // Keep generated columns alive until both outputs release their last consumer.
    let outputs = 2;
    const release = () => {
      if (--outputs === 0) owned.forEach((v) => v.dispose());
    };
    nodes.onDispose = release;
    edges.onDispose = release;
    layoutLive(nodes, edges, {
      sources: [...sourceScopes, graph.nodeScope, graph.edgeScope], time, deadline: liveUntil,
      controlled: [c.nodeWidth, c.layerHeight, c.edgeLength].some(expressionHasTween) ||
        Boolean(c.enter || c.exit || c.where !== undefined),
      nodeFields: ["position", "x", "y", "x0", "x1", "y0", "y1", "parentPosition", "parentX", "parentY",
        "parentX0", "parentX1", "parentY0", "parentY1", "presence"].filter((field) => nodes.has(field)),
      edgeFields: ["start", "end", "presence"],
    });
    lifecycle.dispose?.();
    ({ nodes, edges } = publishGraph(scope, { nodes, edges }));
    return {
      nodes, edges,
      liveUntil,
      dispose() {
        nodes.dispose();
        edges.dispose();
        base.dispose();
        if (!cache) saved.dispose();
      },
    };
  } catch (error) {
    lifecycle.dispose?.();
    nodes?.dispose();
    edges?.dispose();
    base?.dispose();
    owned.forEach((v) => v.dispose());
    if (!cache) saved.dispose();
    throw error;
  }
}
