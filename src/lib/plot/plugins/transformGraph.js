import { createDataScope } from "../utils/categorical.js";
import { createGraphData, graphStructure } from "../utils/graphData.js";
import { shapeOf } from "../utils/data.js";

/** Graph identity remains structural; a numerical rewrite must create a new graph. */
export function protectGraphIdentity(kind, scope, columns, as) {
  if (!scope.graph) return;
  const graph = scope.graph;
  const protectedFields =
    scope.graphRelation === "nodes"
      ? [graph.nodeKey, "id"]
      : [graph.source, graph.target];
  for (const name of Object.keys(columns)) {
    const output = typeof as === "string" ? as : (as?.[name] ?? name);
    if (protectedFields.includes(output))
      throw Error(
        `${kind}: cannot overwrite graph identity column "${output}"; return a new graph instead.`,
      );
  }
}

/** The runner owns the arrays; graph snapshots retain their own references until disposal. */
export async function pluginGraph(kind, result, context) {
  const nodes = createDataScope(),
    edges = createDataScope();
  try {
    for (const [relation, table] of [
      ["nodes", nodes],
      ["edges", edges],
    ]) {
      const columns = result[relation]?.columns;
      if (!columns || typeof columns !== "object" || Array.isArray(columns))
        throw Error(
          `${kind}: graph output needs ${relation}: { columns: { ... } }.`,
        );
      let count;
      for (const [name, column] of Object.entries(columns)) {
        const shape = shapeOf(column?.codes ?? column);
        if (!shape.length || (count !== undefined && count !== shape[0]))
          throw Error(
            `${kind}: ${relation} column "${name}" must have one value per ${relation === "nodes" ? "node" : "edge"}.`,
          );
        count = shape[0];
        if (shape.reduce((a, b) => a * b, 4) > context.maxBytes)
          throw Error(
            `${kind}: ${relation} column "${name}" exceeds the GPU storage-buffer limit.`,
          );
      }
      table.update(columns);
    }
    const graph = createGraphData({ nodes, edges });
    context.cleanup(() => graph.dispose());
    await graphStructure({ graph }, { signal: context.signal, owner: kind });
    return {
      columns: result.edges.columns,
      grid: null,
      view: { graph, graphRelation: "edges" },
    };
  } finally {
    nodes.dispose();
    edges.dispose();
  }
}
