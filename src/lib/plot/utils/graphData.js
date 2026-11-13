import { Array as JaxArray, numpy as np } from '@hmplot/jax';
import { createDataView, snapshotDataScope } from './dataView.js';
import { registerViewExtension } from './viewMetadata.js';
import { keyValues } from './tableJoin.js';
import { asArray } from './data.js';

// Value updates to either owning table reuse their structural plans. Weak table identities
// bound this cache's lifetime; each mapping retains at most 32 structural revisions.
const PLAN_STORES = new WeakMap();
function planStore(nodes, edges, mapping) {
  if (!nodes.identity || !edges.identity) return { entries: [], users: 0 };
  let edgeStores = PLAN_STORES.get(nodes.identity);
  if (!edgeStores) PLAN_STORES.set(nodes.identity, edgeStores = new WeakMap());
  let stores = edgeStores.get(edges.identity);
  if (!stores) edgeStores.set(edges.identity, stores = new Map());
  const key = JSON.stringify(mapping);
  if (!stores.has(key)) stores.set(key, { entries: [], users: 0 });
  return stores.get(key);
}

/** Graph is a structural capability on an ordinary table, like a table's grid descriptor. */
export function requireGraph(scope, owner = 'GraphData', config = undefined) {
  if (config) for (const key of ['source', 'target', 'nodes', 'nodeKey'])
    if (Object.hasOwn(config, key))
      throw Error(`${owner} ${key} is no longer a layout option; pass nodes, edges and their key mapping to GraphData.`);
  if (!scope?.graph)
    throw Error(`${owner} requires graph data: wrap the edges (and nodes, if any) in GraphData.`);
  const graph = scope.graph;
  if (!graph.nodes.has(graph.nodeKey))
    throw Error(`${owner}: graph node key ${graph.nodeKey} is missing after a transform; preserve it or create a new GraphData.`);
  for (const field of [graph.source, graph.target])
    if (!graph.edges.has(field))
      throw Error(`${owner}: graph endpoint column ${field} is missing after a transform; preserve it or create a new GraphData.`);
  return graph;
}

/** Every ordinary view updates its selected relation; ancestors and siblings stay untouched. */
function deriveGraphView(parent, view) {
  if (!parent?.graph || !parent.graphRelation) return;
  view.graphDerivedColumns = parent.graphDerivedColumns
    ? new Set([...parent.graphDerivedColumns].filter(key => !view.hasOwnColumn?.(key))) : undefined;
  view.graphRelation = parent.graphRelation;
  view.graph = { ...parent.graph, [parent.graphRelation]: view, ownerScope: view };
}
// A view of a graph's table keeps the graph (utils/viewMetadata.js). A snapshot holds its columns'
// values, so none of them is graph-derived any more.
registerViewExtension({
  derive: deriveGraphView,
  forward: ['graph', 'graphRelation', 'graphDerivedColumns'],
  snapshot: (source) => ({ graph: source.graph, graphRelation: source.graphRelation }),
});

/** Structural dependencies deliberately exclude weights, positions and other values. */
export function graphDependencies(scope) {
  const graph = requireGraph(scope);
  const column = (table, field) => table.hostColumn?.(field) ?? table.get(field);
  return [graph.nodeKey, graph.source, graph.target,
    column(graph.nodes, graph.nodeKey), column(graph.edges, graph.source), column(graph.edges, graph.target),
    graph.nodes.topology, graph.edges.topology, graph.nodes.length, graph.edges.length,
    column(graph.allNodes, graph.nodeKey), graph.allNodes.topology, graph.allNodes.length,
    graph.suppliedIdSource ? column(graph.suppliedIdSource, 'id') : undefined];
}

/** A frozen pair of ordinary table views. No simulation, clock or renderer state lives here. */
export function createGraphData({ nodes, edges, nodeKey = 'id', source = 'source', target = 'target' }) {
  if (!nodes?.get || !edges?.get)
    throw Error('GraphData requires explicit node and edge tables. Pass nodes and edges.');
  for (const [name, value] of Object.entries({ nodeKey, source, target }))
    if (typeof value !== 'string' || !value)
      throw Error(`GraphData ${name}: pass a nonempty column name.`);
  if (!nodes.has(nodeKey)) throw Error(`GraphData: missing node key column ${nodeKey}.`);
  if (!edges.has(source) || !edges.has(target))
    throw Error(`GraphData: missing endpoint column ${!edges.has(source) ? source : target}.`);
  const heldNodes = snapshotDataScope(nodes), heldEdges = snapshotDataScope(edges);
  // The canonical alias retains this source. Keep its row provenance for collision checks:
  // reading a gathered device id alone can narrow otherwise exact numeric keys.
  const suppliedIdSource = nodeKey !== 'id' && heldNodes.has('id') ? heldNodes : undefined;
  let canonical = heldNodes;
  if (nodeKey !== 'id') {
    canonical = createDataView(heldNodes, { columns: { id: heldNodes.get(nodeKey) }, columnMetadata: { id: heldNodes.metadata?.(nodeKey) } });
    canonical.fieldIdentity = { id: nodeKey };
    heldNodes.dispose();
  }
  let users = 1, disposed = false;
  const store = planStore(nodes, edges, [nodeKey, source, target]);
  store.users++;
  const graph = {
    nodes: canonical, edges: heldEdges, nodeKey, source, target,
    allNodes: canonical,
    suppliedIdSource,
    plans: store.entries,
    retain() {
      if (disposed) throw Error('GraphData has been disposed.');
      users++;
      return () => graph.dispose();
    },
    dispose() {
      if (disposed || --users > 0) return;
      disposed = true;
      canonical.dispose(); heldEdges.dispose();
      // Structural entries compare borrowed columns. Drop them when the last bundle dies;
      // adjacent live publications still share their plans without retaining disposed arrays.
      if (--store.users === 0) store.entries.length = 0;
    },
  };
  return graph;
}

/** Attach graph metadata without teaching the selected ordinary table about graph algorithms. */
export function graphScope(graph, relation = 'edges') {
  const view = createDataView(graph[relation]);
  const release = graph.retain?.();
  const owner = graph.ownerScope && graph.ownerScope !== graph[relation] ? graph.ownerScope.retain?.() : null;
  view.graph = graph; view.graphRelation = relation;
  view.graphDerivedColumns = graph[relation].graphDerivedColumns;
  view.onDispose = () => { owner?.(); release?.(); };
  return view;
}

/** Publish both layout outputs together while retaining the input relationship's mapping. */
export function publishGraph(scope, { nodes, edges }) {
  const previous = requireGraph(scope);
  const graph = createGraphData({ nodes, edges, nodeKey: previous.nodeKey, source: previous.source, target: previous.target });
  const result = { graph, nodes: graphScope(graph, 'nodes'), edges: graphScope(graph, 'edges') };
  nodes.dispose(); edges.dispose(); graph.dispose();
  return result;
}

/** Canonical ordinary position column, shared by node marks and lazy edge endpoints. */
export function graphPositions(nodes) {
  if (nodes.has('position') && !nodes.graphDerivedColumns?.has('position')) {
    const position = asArray(nodes.get('position'));
    if (position.shape.length !== 2 || ![2, 3].includes(position.shape[1])) {
      position.dispose(); throw Error('GraphData position: pass one 2D or 3D position per node.');
    }
    return position;
  }
  if (!nodes.has('x') || !nodes.has('y'))
    throw Error('GraphData node coordinates: provide position or both x and y columns.');
  const values = ['x', 'y', ...(nodes.has('z') ? ['z'] : [])].map(name => asArray(nodes.get(name)));
  try {
    if (values.some(value => value.shape.length !== 1 || value.shape[0] !== nodes.length))
      throw Error('GraphData node coordinates: x, y and z must each contain one numeric value per node.');
    return np.stack(values.map(value => value.ref), 1);
  } finally { values.forEach(value => value.dispose()); }
}

/** Current node/edge row mappings, cached only by structural columns and membership. */
export async function graphStructure(scope, { signal, owner = 'GraphData' } = {}) {
  const graph = requireGraph(scope, owner), dependencies = graphDependencies(scope);
  const saved = graph.plans.find((entry) => entry.dependencies.length === dependencies.length && entry.dependencies.every((value, i) => value === dependencies[i]));
  if (saved) { check(signal); return saved.value; }
  const [nodeKeys, sourceKeys, targetKeys, allKeys, suppliedId] = await Promise.all([
    keyValues(graph.nodes, graph.nodeKey, { atRows: true }),
    keyValues(graph.edges, graph.source, { atRows: true }),
    keyValues(graph.edges, graph.target, { atRows: true }),
    keyValues(graph.allNodes, graph.nodeKey, { atRows: true }),
    graph.suppliedIdSource ? keyValues(graph.suppliedIdSource, 'id', { atRows: true }) : undefined,
  ]);
  check(signal);
  const ids = nodeKeys.values, index = new Map();
  ids.forEach((id, row) => {
    if (missing(id)) throw Error(`${owner}: node IDs must be present and finite.`);
    if (index.has(id)) throw Error(`${owner}: duplicate node ID ${String(id)}.`);
    index.set(id, row);
  });
  const all = new Set(allKeys.values);
  if (all.size !== allKeys.values.length || allKeys.values.some(missing))
    throw Error(`${owner}: GraphData node IDs must be unique, present and finite.`);
  if (suppliedId && (suppliedId.values.length !== allKeys.values.length || suppliedId.values.some((id, row) => id !== allKeys.values[row])))
    throw Error(`${owner}: supplied id conflicts with nodeKey ${graph.nodeKey}; omit id or make it identical to the node key.`);
  const rows = [], from = [], to = [];
  for (let row = 0; row < sourceKeys.values.length; row++) {
    const a = sourceKeys.values[row], b = targetKeys.values[row];
    if (missing(a) || missing(b) || !all.has(a) || !all.has(b))
      throw Error(`${owner}: edge ${row} references a missing node; supply that node in GraphData.`);
    // A node Filter induces a subgraph. Edge filtering never removes isolated nodes.
    if (!index.has(a) || !index.has(b)) continue;
    rows.push(row); from.push(index.get(a)); to.push(index.get(b));
  }
  const value = { ids, from: Int32Array.from(from), to: Int32Array.from(to), rows: Int32Array.from(rows), index };
  graph.plans.push({ dependencies, value });
  if (graph.plans.length > 32) graph.plans.shift();
  return value;
}

/** Select nodes or induced edges. Edge coordinates are gathered only if read, from current nodes. */
export async function graphTable(scope, relation, { signal } = {}) {
  const graph = requireGraph(scope, relation === 'nodes' ? 'Nodes' : 'Edges');
  if (relation === 'nodes') {
    const parent = graphScope(graph, 'nodes');
    if (parent.has('position') && !parent.graphDerivedColumns?.has('position') || !parent.has('x') || !parent.has('y')) return parent;
    const view = createDataView(parent, { lazyColumns: { position: () => graphPositions(parent) } });
    view.graphDerivedColumns = new Set([...(parent.graphDerivedColumns ?? []), 'position']);
    parent.dispose(); return view;
  }
  if (relation !== 'edges') throw Error('GraphData relation: pass nodes or edges.');
  const structure = await graphStructure(scope, { signal, owner: 'Edges' });
  const parent = graphScope(graph, 'edges');
  const indices = structure.rows.length === parent.length && structure.rows.every((row, i) => row === i)
    ? null : np.array(structure.rows, { dtype: np.int32 });
  const nodes = graph.nodes;
  // A layout's own endpoints (Tree's parent-to-child, Sankey's attachment points) win over
  // node centers, as a layout's own position does for Nodes.
  const published = ['start', 'end'].every(name => parent.has(name) && !parent.graphDerivedColumns?.has(name));
  const hasPosition = !published && (nodes.has('position') || nodes.has('x') && nodes.has('y'));
  const endpoint = (rows) => {
    const position = graphPositions(nodes), at = np.array(rows, { dtype: np.int32 });
    try { return np.take(position.ref, at.ref, 0); }
    finally { position.dispose(); at.dispose(); }
  };
  const view = createDataView(parent, {
    indices,
    lazyColumns: {
      sourceIndex: () => np.array(structure.from, { dtype: np.int32 }),
      targetIndex: () => np.array(structure.to, { dtype: np.int32 }),
      ...(hasPosition ? { start: () => endpoint(structure.from), end: () => endpoint(structure.to) } : {}),
    },
  });
  view.graphDerivedColumns = new Set(['sourceIndex', 'targetIndex', ...(hasPosition ? ['start', 'end'] : [])]);
  view.onDispose = () => indices?.dispose();
  parent.dispose();
  return view;
}

const missing = value => value == null || typeof value === 'number' && !Number.isFinite(value);
const check = signal => { if (signal?.aborted) throw new DOMException('Canceled', 'AbortError'); };

export async function hostColumn(column) {
  if (column?.categories) {
    const codes = column.codes instanceof JaxArray ? await column.codes.ref.data() : column.codes;
    return Array.from(codes, code => column.categories[code]);
  }
  return Array.from(column instanceof JaxArray ? await column.ref.data() : column);
}

/** Numeric updates refresh ordinary attributes and edges without rebuilding topology or IDs. */
export async function refreshGraphData(graph, scope, { signal } = {}) {
  const bundle = requireGraph(scope), edgeScope = await graphTable(scope, 'edges', { signal });
  graph.edgeScope.dispose(); graph.edgeScope = edgeScope;
  graph.bundle = bundle; graph.nodeScope = bundle.nodes;
  graph.fields = Object.fromEntries(bundle.nodes.keys().filter(field => field !== 'id').map(field => [field, bundle.nodes.get(field)]));
  graph.nodeColumns = columns => ({ ...graph.fields, id: graph.idColumn, ...columns });
}

/** Host topology for graph layouts. Original edge rows and node order are retained. */
export async function graphData(scope, { name = 'GraphData', ...config } = {}, { signal } = {}) {
  const bundle = requireGraph(scope, name, config);
  const structure = await graphStructure(scope, { signal, owner: name });
  const edgeScope = await graphTable(scope, 'edges', { signal });
  const nodeScope = bundle.nodes;
  // IDs are table values, not layout output. Forward the canonical source column unchanged:
  // rebuilding host IDs as float32 would lose large integers and their exact host-key metadata.
  const idColumn = nodeScope.get('id');
  const fields = Object.fromEntries(nodeScope.keys().filter(field => field !== 'id').map(field => [field, nodeScope.get(field)]));
  return {
    ...structure, fields, nodeScope, edgeScope, idColumn, bundle,
    nodeColumns(columns) { return { ...fields, id: idColumn, ...columns }; },
    edgeView(columns = {}) { return createDataView(this.edgeScope, { columns }); },
    dispose() { this.edgeScope.dispose(); },
  };
}
