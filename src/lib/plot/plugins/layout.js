import { Array as JaxArray } from "@hmplot/jax";
import { graphData } from "../utils/graphData.js";
import { graphHierarchy } from "../utils/graphHierarchy.js";
import { publishLayout } from "../utils/layoutPublication.js";
import { dataBufferLimit } from "../utils/dataView.js";
import { shapeOf } from "../utils/data.js";
import {
  transformParameters,
  parameterDependencies,
  expressionParameters,
  parameterProblem,
} from "./parameters.js";
import { resolveParameterExpressions } from "../utils/transforms/parameters.js";
import { outputMetadata } from "./outputs.js";

/** Layout expressions read the input edge table; node columns remain borrowed in run(). */
export function layoutParameters(kind, definition, values = {}) {
  return transformParameters(kind, definition.parameters ?? {}, values, false);
}

export function layoutDependencies(definition, values) {
  return parameterDependencies(definition.parameters ?? {}, values, false);
}

/** Borrow the graph's columns during run; transfer each returned array reference to the
 * publication owner. A failed or canceled run releases its outputs and graph snapshot too.
 * Layouts return { nodeColumns, edgeColumns }, one value per existing node or edge.
 */
export async function runPluginLayout(
  kind,
  definition,
  scope,
  values = {},
  { signal, maxBytes = dataBufferLimit(), evaluator, viewState } = {},
) {
  const params = await resolveParameterExpressions(
    kind,
    layoutParameters(kind, definition, values),
    expressionParameters(definition.parameters),
    scope,
    { evaluator, viewState },
  );
  const problem = parameterProblem(kind, definition.parameters ?? {}, params);
  if (problem) throw Error(problem);
  const check = () => {
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  };
  check();
  const graph = await graphData(scope, { name: kind }, { signal });
  const owned = [];
  try {
    const columns = (table) =>
      Object.fromEntries(
        [...table.keys()].map((name) => [name, table.get(name)]),
      );
    const hierarchy = definition.hierarchy
      ? graphHierarchy(graph, { owner: kind, signal })
      : null;
    const result = await definition.run({
      graph: {
        ids: graph.ids,
        from: graph.from,
        to: graph.to,
        nodeColumns: columns(graph.nodeScope),
        edgeColumns: columns(graph.edgeScope),
        hierarchy,
      },
      params,
      signal,
    });
    // Adopt before checking the result or cancellation. Each property transfers one reference,
    // including a repeated array (the author must have retained it with .ref).
    for (const columns of [result?.nodeColumns, result?.edgeColumns])
      for (const column of Object.values(columns ?? {})) {
        const array = column?.codes ?? column;
        if (array instanceof JaxArray) owned.push(array);
      }
    check();
    if (!result || typeof result !== "object")
      throw Error(`${kind}: return { nodeColumns, edgeColumns }.`);
    const nodeColumns = result.nodeColumns ?? {},
      edgeColumns = result.edgeColumns ?? {};
    for (const [relation, columns, count, protectedFields] of [
      ["node", nodeColumns, graph.ids.length, [graph.bundle.nodeKey, "id"]],
      [
        "edge",
        edgeColumns,
        graph.from.length,
        [graph.bundle.source, graph.bundle.target],
      ],
    ]) {
      if (!columns || typeof columns !== "object" || Array.isArray(columns))
        throw Error(
          `${kind}: ${relation}Columns must be an object of columns.`,
        );
      for (const [name, column] of Object.entries(columns)) {
        if (protectedFields.includes(name))
          throw Error(
            `${kind}: cannot overwrite graph identity column "${name}"; return a new graph from a transform instead.`,
          );
        const shape = shapeOf(column?.codes ?? column);
        if (!shape.length || shape[0] !== count)
          throw Error(
            `${kind}: ${relation} column "${name}" must have one value per ${relation}.`,
          );
        if (shape.reduce((size, dimension) => size * dimension, 4) > maxBytes)
          throw Error(
            `${kind}: ${relation} column "${name}" exceeds the GPU storage-buffer limit.`,
          );
      }
    }
    return publishLayout(scope, graph, {
      nodeColumns,
      edgeColumns,
      nodeMetadata: outputMetadata(
        kind,
        definition.nodeOutputs,
        params,
        nodeColumns,
      ),
      edgeMetadata: outputMetadata(
        kind,
        definition.edgeOutputs,
        params,
        edgeColumns,
      ),
      nodeFields: Object.keys(nodeColumns),
      edgeFields: Object.keys(edgeColumns),
      owned,
    });
  } catch (error) {
    owned.forEach((array) => array.dispose());
    graph.dispose();
    throw error;
  }
}
