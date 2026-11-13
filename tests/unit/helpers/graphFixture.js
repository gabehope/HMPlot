// Test fixtures construct explicit graph data before invoking production layout algorithms.
import { createDataScope } from '../../../src/lib/plot/utils/categorical.js';
import { createGraphData, graphScope, hostColumn } from '../../../src/lib/plot/utils/graphData.js';

export async function graphFixture(edges, { nodes, nodeKey = 'id', source = 'source', target = 'target' } = {}) {
  const table = createDataScope();
  if (nodes === undefined) nodes = { id: [...new Set([...(await hostColumn(edges.get(source))), ...(await hostColumn(edges.get(target)))])] };
  table.setKey(nodeKey); table.update(nodes);
  const graph = createGraphData({ nodes: table, edges, nodeKey, source, target });
  const scope = graphScope(graph);
  graph.dispose();
  return { scope, dispose() { scope.dispose(); table.dispose(); } };
}
