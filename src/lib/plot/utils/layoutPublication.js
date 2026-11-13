// @ts-check
import { numpy as np } from "@hmplot/jax";
import { createDataView } from "./dataView.js";
import { publishGraph } from "./graphData.js";
import { layoutLive } from "./layoutLive.js";

const COORDINATES = ["x", "y", "z", "x0", "x1", "y0", "y1"];

/**
 * A layout's coordinate columns name no axis: they are not variables (TODO 21 J9). The `names`
 * option of the node view a layout publishes (Force's x, y and z; the others' bounds too).
 * @param {string[]} [fields]
 */
export const layoutCoordinateNames = (fields = COORDINATES) =>
  Object.fromEntries(fields.map((field) => [field, null]));

/**
 * Publish a static graph layout's nodes and edges together (DAG, Sankey, Pack, Treemap; TODO
 * 118.4): its node columns over the graph's nodes (naming no axis), its edge columns over the
 * edges, their liveness from the input and the graph, and both as one graph that keeps the
 * input's node key and endpoints (publishGraph). `owned` are the arrays the columns hold; the
 * returned frame's dispose releases them with the views and `graph`. On failure only the views
 * made here are released: the caller still owns `owned` and `graph`.
 * @param {any} scope The layout's input (a graph's edges).
 * @param {any} graph The layout's graphData.
 * @param {{ nodeColumns: Record<string, any>, edgeColumns: Record<string, any>, nodeFields: string[],
 *   edgeFields: string[], owned: { dispose(): void }[], nodeMetadata?: Record<string, any>,
 *   edgeMetadata?: Record<string, any>, nodeShown?: boolean[], edgeShown?: boolean[] }} columns
 */
export function publishLayout(
  scope,
  graph,
  {
    nodeColumns,
    edgeColumns,
    nodeFields,
    edgeFields,
    owned,
    nodeMetadata = {},
    edgeMetadata = {},
    nodeShown = undefined,
    edgeShown = undefined,
  },
) {
  let nodes, edges;
  // Rows a layout leaves out (TODO 145.3: a Treemap's nodes outside its root's subtree) stay rows
  // of the table, hidden: the views' masks, which they own.
  /** @param {boolean[] | undefined} shown */
  const hidden = (shown) =>
    shown
      ? {
          mask: np.array(shown.map(Number), { dtype: np.int32 }),
          count: shown.filter(Boolean).length,
        }
      : {};
  try {
    nodes = createDataView(graph.nodeScope, {
      columns: graph.nodeColumns(nodeColumns),
      names: layoutCoordinateNames(),
      columnMetadata: nodeMetadata,
      ...hidden(nodeShown),
    });
    edges = createDataView(graph.edgeScope, {
      columns: edgeColumns,
      columnMetadata: edgeMetadata,
      ...hidden(edgeShown),
    });
    layoutLive(nodes, edges, {
      sources: [scope, graph.nodeScope, graph.edgeScope],
      nodeFields,
      edgeFields,
    });
    ({ nodes, edges } = publishGraph(scope, { nodes, edges }));
  } catch (error) {
    nodes?.dispose();
    edges?.dispose();
    throw error;
  }
  const published = { nodes, edges };
  return {
    ...published,
    dispose() {
      published.nodes.dispose();
      published.edges.dispose();
      owned.forEach((value) => value.dispose());
      graph.dispose();
    },
  };
}
