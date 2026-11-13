import { numpy as np, jit } from "@hmplot/jax";
import { deviceArray } from "./deviceParams.js";
import { rememberHostSource } from "./hostSources.js";

/** Stable output row metadata and one compiled gather program per rooted row set.
 * Layout coordinates remain device-backed; changing geometry never uploads IDs/depth again.
 * Frames retain their own references, so replacing the plan cannot invalidate old frames. */
export function treeOutput(topology, selected, mode) {
  const { saved, graph, parent, parentEdge, depth, degree, order, n } =
    topology;
  const key = JSON.stringify([mode === "partition", selected]);
  if (saved.output?.key === key) return saved.output;
  saved.output?.dispose();
  const owned = [],
    own = (array) => (owned.push(array), array);
  const column = (values) => own(deviceArray(values));
  const indices = (values) => own(deviceArray(values, { dtype: "int32" }));
  const rows = new Map(selected.map((node, row) => [node, row]));
  const parentRows = selected.map((node) => rows.get(parent[node]));
  const edgeNodes = selected.filter((node) => parentEdge[node] >= 0);
  const nodeIndices = indices(selected),
    edgeIndices = indices(edgeNodes.map((node) => parentEdge[node]));
  const parentAt = indices(parentRows.map((row) => row ?? 0));
  const parentValid = column(
    parentRows.map((row) => Number(row !== undefined)),
  );
  const edgeFrom = indices(edgeNodes.map((node) => rows.get(parent[node])));
  const edgeTo = indices(edgeNodes.map((node) => rows.get(node)));
  const categorical = graph.ids.some((id) => typeof id !== "number");
  const parentValues = selected.map((node) => parent[node] < 0 ? -1 : graph.ids[parent[node]]);
  const parentId = categorical
    ? indices(selected.map((node) => parent[node]))
    : column(parentValues);
  if (!categorical) rememberHostSource(parentId, parentValues, [parentValues.length]);
  const metadata = {
    parent: parentId,
    depth: column(selected.map((node) => depth[node])),
    degree: column(selected.map((node) => degree[node])),
    order: column(selected.map((node) => order[node])),
  };
  const edgeDepth = column(edgeNodes.map((node) => depth[node]));
  const fullPresence = column(Array(n).fill(1));
  const names = [
    "x",
    "y",
    ...(mode === "partition" ? ["x0", "x1", "y0", "y1"] : []),
  ];
  const identity =
    selected.length === n && selected.every((node, row) => node === row);
  const program = jit((geometry, presence, at, parents, valid, from, to) => {
    const arrays = [],
      keep = (array) => (arrays.push(array), array);
    try {
      const values = geometry.map((array) =>
        keep(identity ? array : np.take(array, at.ref, 0)),
      );
      const node = Object.fromEntries(
        names.map((name, i) => [name, values[i].ref]),
      );
      const position = keep(np.stack([values[0].ref, values[1].ref], 1));
      node.position = position.ref;
      for (const [i, name] of names.entries())
        node["parent" + name[0].toUpperCase() + name.slice(1)] = np.where(
          valid.ref.greater(0),
          np.take(values[i].ref, parents.ref, 0),
          NaN,
        );
      node.parentPosition = np.stack([node.parentX.ref, node.parentY.ref], 1);
      const alpha = keep(np.take(presence, at.ref, 0));
      node.presence = alpha.ref;
      const edge = {
        start: np.take(position.ref, from, 0),
        end: np.take(position.ref, to.ref, 0),
        presence: np.take(alpha.ref, to, 0),
      };
      return { node, edge };
    } finally {
      arrays.forEach((array) => array.dispose());
      at.dispose();
      parents.dispose();
      valid.dispose();
    }
  });
  const output = {
    key,
    run(geometry, presence, ownFrame) {
      const result = program(
        geometry.map((array) => array.ref),
        (presence ?? fullPresence).ref,
        nodeIndices.ref,
        parentAt.ref,
        parentValid.ref,
        edgeFrom.ref,
        edgeTo.ref,
      );
      for (const columns of [result.node, result.edge])
        Object.values(columns).forEach(ownFrame);
      for (const [name, array] of Object.entries(metadata))
        result.node[name] = ownFrame(array.ref);
      if (categorical) {
        result.node.parent = {
          codes: result.node.parent,
          categories: graph.ids,
        };
      }
      result.edge.depth = ownFrame(edgeDepth.ref);
      return {
        ...result,
        // A complete hierarchy preserves source order: forwarding input columns avoids
        // re-gathering unchanged metadata and invalidating downstream filter caches.
        nodeIndices: identity ? null : ownFrame(nodeIndices.ref),
        edgeIndices: ownFrame(edgeIndices.ref),
      };
    },
    dispose() {
      owned.forEach((array) => array.dispose());
      program.dispose?.();
    },
  };
  saved.output = output;
  return output;
}
