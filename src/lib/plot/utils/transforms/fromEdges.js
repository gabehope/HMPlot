import { numpy as np } from "@hmplot/jax";
import { createDataScope } from "../categorical.js";
import { createDataView } from "../dataView.js";
import { createGraphData, requireGraph } from "../graphData.js";
import { keyValues } from "../tableJoin.js";
import { validateReducers } from "./statistics.js";
import { groupedReductions } from "./group.js";
import { cachedArray, cachedHostValue, check } from "./common.js";
import { ownCacheEntry } from "../cacheEntries.js";

const missing = (value) =>
  value == null || (typeof value === "number" && !Number.isFinite(value));

/** GraphData's inference and enrichment (TODO 137.3 folded FromEdges into GraphData): nodes
 *  from the edges' endpoints, or a graph's nodes gaining `reduce` columns. Its reductions share
 *  Group's typed compiled kernel. */
export const fromEdges = {
  reads: "rows",
  buckets: () => false,
  output: "sameRows",
  validate(config) {
    if (!["source", "target"].includes(config.nodeFrom ?? "source"))
      throw Error("GraphData nodeFrom: pass source or target.");
    validateReducers(config.reduce, true);
  },
  async run(input, config, { cleanup, cache, signal }) {
    const existing = input.source.graph
      ? requireGraph(input.source, "GraphData")
      : null;
    if (existing && input.source.graphRelation !== "edges")
      throw Error("GraphData reads edges: put it under Edges, not Nodes.");
    const source = config.source ?? existing?.source ?? "source",
      target = config.target ?? existing?.target ?? "target",
      nodeKey = existing?.nodeKey ?? "id",
      reduce = config.reduce ?? {};
    if (!input.scope.has(source) || !input.scope.has(target))
      throw Error(
        `GraphData: missing endpoint column ${!input.scope.has(source) ? source : target}.`,
      );
    if (Object.hasOwn(reduce, nodeKey) || Object.hasOwn(reduce, "id"))
      throw Error(
        `GraphData reduce: do not overwrite node identity ${nodeKey} or id.`,
      );
    const dependencies = [
      input.scope.get(source),
      input.scope.get(target),
      input.scope.topology,
      input.length,
      existing?.nodes.get(nodeKey),
      existing?.nodes.topology,
      existing?.nodes.length,
      existing ? undefined : input.valid,
      config.nodeFrom ?? "source",
    ];
    const plan = await cachedHostValue(
      cache,
      "fromEdges:recipients",
      dependencies,
      async () => {
        const [a, b, supplied, visible] = await Promise.all([
          keyValues(input.scope, source, { atRows: true }),
          keyValues(input.scope, target, { atRows: true }),
          existing
            ? keyValues(existing.nodes, nodeKey, { atRows: true })
            : undefined,
          !existing && input.valid ? input.valid.ref.data() : undefined,
        ]);
        check(signal);
        const ids = supplied?.values ?? [],
          index = new Map(ids.map((id, row) => [id, row]));
        if (ids.some(missing) || index.size !== ids.length)
          throw Error(
            "GraphData: existing node IDs must be unique, present and finite.",
          );
        if (!existing)
          for (let row = 0; row < input.length; row++) {
            if (visible && !visible[row]) continue;
            for (const id of [a.values[row], b.values[row]]) {
              if (missing(id))
                throw Error(
                  `GraphData: edge ${row} has a missing endpoint ID.`,
                );
              if (!index.has(id)) {
                index.set(id, ids.length);
                ids.push(id);
              }
            }
          }
        const recipient = config.nodeFrom === "target" ? b.values : a.values;
        return {
          ids,
          codes: Int32Array.from(recipient, (id) => index.get(id) ?? -1),
        };
      },
    );
    check(signal);
    const rawCodes = cachedArray(cache, "fromEdges:codes", [plan], () =>
      np.array(plan.codes, { dtype: np.int32 }),
    );
    const codes = input.valid
      ? np.where(input.valid.ref.greater(0), rawCodes.ref, -1).astype(np.int32)
      : rawCodes.ref;
    rawCodes.dispose();
    let reduced;
    try {
      reduced = groupedReductions(input.scope, reduce, {
        codes,
        total: plan.ids.length,
        length: input.length,
      });
    } finally {
      codes.dispose();
    }
    reduced.codes.dispose();
    const columns = reduced.columns;
    let nodes;
    if (existing)
      nodes = createDataView(existing.nodes, {
        columns,
        columnMetadata: reduced.columnMetadata,
      });
    else {
      let table =
        cache?.fromEdgesNodes?.plan === plan
          ? cache.fromEdgesNodes.table
          : null;
      if (!table) {
        table = createDataScope();
        table.setKey("id");
        table.update(
          { id: plan.ids },
          plan.ids.length ? undefined : { id: { type: "numeric" } },
        );
        if (cache) {
          cache.fromEdgesNodes?.table.dispose();
          cache.fromEdgesNodes = { plan, table };
          ownCacheEntry(cache, "fromEdgesNodes", (entry) =>
            entry.table.dispose(),
          );
        }
      }
      nodes = createDataView(table, {
        columns,
        columnMetadata: reduced.columnMetadata,
      });
      if (!cache) nodes.onDispose = () => table.dispose();
    }
    const previousDispose = nodes.onDispose;
    nodes.onDispose = () => {
      for (const column of Object.values(columns))
        (column?.codes ?? column).dispose();
      previousDispose?.();
    };
    try {
      const graph = createGraphData({
        nodes,
        edges: input.source,
        nodeKey,
        source,
        target,
      });
      cleanup(() => graph.dispose());
      return { view: { graph, graphRelation: "edges" }, followsMask: true };
    } finally {
      nodes.dispose();
    }
  },
};
