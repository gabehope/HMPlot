import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataScope } from '../../src/lib/plot/utils/categorical.js';
import { createGraphData, graphScope, graphTable, graphStructure, graphDependencies, requireGraph, publishGraph } from '../../src/lib/plot/utils/graphData.js';
import { createDataView } from '../../src/lib/plot/utils/dataView.js';
import { forceTopology } from '../../src/lib/plot/utils/force.js';
import { runTransform, disposeTransformCache } from '../../src/lib/plot/utils/transforms.js';
import { col, add, greater, less, cumsum, lag } from '../../src/lib/plot/utils/expressions.js';
import { createJoinTable, keyValues } from '../../src/lib/plot/utils/tableJoin.js';
import { typedColumn } from '../../src/lib/plot/utils/columns.js';
import { columnValue } from '../../src/lib/scene/resources.js';
import { treeLayout } from '../../src/lib/plot/utils/tree.js';
import { forceDragRows } from '../../src/lib/plot/utils/forceContext.js';

const table = data => { const scope = createDataScope(); scope.update(data); return scope; };
const values = async (scope, field) => {
  const column = scope.get(field), array = column?.codes ?? column;
  const data = array?.js ? await array.ref.js() : Array.from(array);
  return column?.categories ? data.map(code => column.categories[code] ?? null) : data;
};
function fixture(nodes, edges, config = {}) {
  const n = table(nodes), e = table(edges), graph = createGraphData({ nodes: n, edges: e, ...config }), scope = graphScope(graph);
  return { n, e, graph, scope, dispose() { scope.dispose(); graph.dispose(); n.dispose(); e.dispose(); } };
}

test('ordered expressions consume ordinary graph tables without changing node or edge identity', async () => {
  const f = fixture({ id: [1, 2, 3], weight: [3, 1, 2] }, { source: [1, 2], target: [2, 3], value: [8, 5] });
  const nodes = graphScope(f.graph, 'nodes');
  const running = await runTransform('Calculate', nodes, { columns: { running: cumsum('weight', {orderBy: 'weight'}) } });
  const neighbors = await runTransform('Calculate', f.scope, { columns: { previous: lag('value') } });
  try {
    assert.deepEqual(await values(running, 'running'), [6, 1, 3]);
    const previous = await values(neighbors, 'previous');
    assert.ok(Number.isNaN(previous[0])); assert.equal(previous[1], 8);
    assert.equal(running.identity, nodes.identity); assert.equal(neighbors.identity, f.scope.identity);
    assert.deepEqual((await graphStructure(running)).ids, [1, 2, 3]);
    assert.deepEqual(await values(neighbors, 'source'), [1, 2]);
  } finally { neighbors.dispose(); running.dispose(); nodes.dispose(); f.dispose(); }
});

test('GraphData defaults to ordinary edges and preserves canonical IDs, fields and scoped lifetimes', async () => {
  const f = fixture({ person: ['b', 'a'], x: [2, 1], y: [4, 3], label: ['B', 'A'] }, { from: ['a', 'b'], to: ['b', 'b'], value: [7, 8] }, { nodeKey: 'person', source: 'from', target: 'to' });
  const nodes = await graphTable(f.scope, 'nodes'), edges = await graphTable(f.scope, 'edges');
  try {
    assert.equal(f.scope.graphRelation, 'edges');
    assert.deepEqual(await values(nodes, 'id'), ['b', 'a']);
    assert.deepEqual(await values(nodes, 'position'), [[2, 4], [1, 3]]);
    assert.deepEqual(await values(edges, 'start'), [[1, 3], [2, 4]]);
    assert.deepEqual(await values(edges, 'end'), [[2, 4], [2, 4]]);
    assert.deepEqual(await values(edges, 'value'), [7, 8]);
  } finally { nodes.dispose(); edges.dispose(); f.dispose(); }
  const invalid = fixture({ key: [1, 2], id: [2, 1] }, { source: [1], target: [2] }, { nodeKey: 'key' });
  await assert.rejects(graphStructure(invalid.scope), /id conflicts with nodeKey/); invalid.dispose();
});

test('GraphData snapshots keep column metadata coherent after the owning table changes schema', async () => {
  const f = fixture({ id: [0, 1], weight: [1, 2] }, { source: [0], target: [1] });
  const metadata = f.graph.nodes.metadata('weight');
  f.n.update({ id: f.n.get('id'), weight: ['small', 'large'] });
  assert.equal(f.n.metadata('weight').type, 'categorical');
  assert.equal(f.graph.nodes.metadata('weight'), metadata);
  assert.equal(metadata.type, 'numeric');
  assert.deepEqual(await values(f.graph.nodes, 'weight'), [1, 2]);
  f.dispose();
});

test('Tree and Force publications preserve exact large numeric IDs and their endpoint mapping', async () => {
  const ids = [16777217, 16777218];
  const f = fixture({ id: ids, weight: [1, 2] }, { source: [ids[0]], target: [ids[1]] });
  const initial = await graphStructure(f.scope), identity = f.graph.nodes.columnIdentity('id');
  const tree = await treeLayout(f.scope, { root: ids[0], directed: true, mode: 'partition', nodeWidth: 'weight' });
  const force = await forceTopology(f.scope, {});
  const forceFrame = publishGraph(f.scope, {
    nodes: createDataView(force.nodeScope, { columns: { ...force.nodeFields, id: force.id } }),
    edges: createDataView(force.edgeScope),
  });
  try {
    assert.deepEqual(initial.ids, ids);
    for (const frame of [tree, forceFrame]) {
      const structure = await graphStructure(frame.edges);
      assert.deepEqual(structure.ids, ids);
      assert.deepEqual([...structure.from], [0]); assert.deepEqual([...structure.to], [1]);
      assert.equal(frame.nodes.columnIdentity('id'), identity);
      assert.equal(frame.nodes.identity, f.n.identity);
      assert.equal(frame.nodes.metadata('id'), f.graph.nodes.metadata('id'));
    }
  } finally {
    tree.dispose(); forceFrame.nodes.dispose(); forceFrame.edges.dispose(); force.dispose(); f.dispose();
  }
});

test('Force drag reaches marks over its node rows, through Calculate but not Filter or Sort', async () => {
  const f = fixture({ id: [1, 2, 3], w: [1, 2, 3] }, { source: [1, 2], target: [2, 3] });
  const force = await forceTopology(f.scope, {});
  const publish = () => publishGraph(f.scope, {
    nodes: createDataView(force.nodeScope, { columns: { ...force.nodeFields, id: force.id } }),
    edges: createDataView(force.edgeScope),
  });
  // A live layout publishes new frames; marks may still hold an earlier one.
  const earlier = publish(), frame = publish(), context = { read: kind => frame[kind] };
  const nodes = await graphTable(earlier.edges, 'nodes');
  const calculated = await runTransform('Calculate', nodes, { columns: { c: add('w', 1) } });
  const filtered = await runTransform('Filter', nodes, { where: greater(col.w, 1) });
  const sorted = await runTransform('Sort', nodes, { by: 'w', descending: true });
  try {
    assert.equal(forceDragRows(context, nodes), context);
    assert.equal(forceDragRows(context, calculated), context);
    assert.equal(forceDragRows(context, filtered), null);
    assert.equal(forceDragRows(context, sorted), null);
  } finally {
    for (const scope of [sorted, filtered, calculated, nodes, frame.nodes, frame.edges, earlier.nodes, earlier.edges]) scope.dispose();
    force.dispose(); f.dispose();
  }
});

test('canonical graph ID aliases keep exact int64 values and source identity through node filtering', async () => {
  const ids = [16777217, 16777218, 16777219];
  const uploaded = columnValue({ dtype: 'int64', shape: [3], logical_type: 'numeric' }, BigInt64Array.from(ids.map(BigInt)).buffer);
  const f = fixture({ person: uploaded, weight: [1, 2, 3] }, { source: [ids[0], ids[0]], target: [ids[1], ids[2]] }, { nodeKey: 'person' });
  const nodes = graphScope(f.graph, 'nodes');
  const filtered = await runTransform('Filter', nodes, { where: greater(col.weight, 1) });
  try {
    const source = (await keyValues(filtered, 'person', { atRows: true })).values;
    assert.deepEqual(source, ids.slice(1));
    assert.deepEqual((await keyValues(filtered, 'id', { atRows: true })).values, source);
    assert.equal(filtered.columnIdentity('id'), f.n.columnIdentity('person'));
    assert.equal(filtered.metadata('id'), f.n.metadata('person'));
  } finally { filtered.dispose(); nodes.dispose(); f.dispose(); uploaded.values.dispose(); }
});

test('custom numeric graph IDs remain exact through rerooted layout collision checks and numeric plan reuse', async () => {
  const ids = [16777217, 16777218, 16777219];
  const f = fixture({ person: ids, weight: [1, 2, 3] },
    { source: [ids[0], ids[1]], target: [ids[1], ids[2]] }, { nodeKey: 'person' });
  const cache = new Map(), frames = [];
  const config = { root: ids[1], directed: true, mode: 'partition', nodeWidth: 'weight' };
  try {
    const first = await treeLayout(f.scope, config, { cache }); frames.push(first);
    const plan = await graphStructure(first.edges);
    assert.deepEqual(plan.ids, ids.slice(1));
    f.n.update({ person: f.n.get('person'), weight: [3, 2, 1] });
    const graph = createGraphData({ nodes: f.n, edges: f.e, nodeKey: 'person' }), input = graphScope(graph); graph.dispose();
    try {
      const next = await treeLayout(input, config, { cache }); frames.push(next);
      assert.equal(await graphStructure(next.edges), plan);
    } finally { input.dispose(); }
  } finally { frames.forEach(frame => frame.dispose()); cache.forEach(entry => entry.dispose()); f.dispose(); }
});

test('small and large graph IDs reuse published Tree topology while only numeric values change', async () => {
  for (const ids of [[0, 1, 2], [16777217, 16777218, 16777219]]) {
    const f = fixture({ id: ids, weight: [1, 2, 3] }, { source: [ids[0], ids[0]], target: [ids[1], ids[2]] });
    const cache = new Map(), frames = [];
    let input = f.scope;
    try {
      for (const mode of ['partition', 'tidy']) {
        const config = { root: ids[0], directed: true, mode, nodeWidth: 'weight' };
        const before = await treeLayout(input, config, { cache }); frames.push(before);
        const plan = await graphStructure(before.edges);
        f.n.update({ id: ids, weight: [4, 5, 6] });
        const graph = createGraphData({ nodes: f.n, edges: f.e });
        const next = graphScope(graph); graph.dispose();
        const after = await treeLayout(next, config, { cache }); frames.push(after);
        assert.equal(await graphStructure(after.edges), plan);
        assert.deepEqual(plan.ids, ids);
        next.dispose();
      }
    } finally { frames.forEach(frame => frame.dispose()); cache.forEach(entry => entry.dispose()); f.dispose(); }
  }
});

test('Tree membership snapshots retain exact custom numeric keys through exits and numeric refreshes', async () => {
  const ids = [16777217, 16777218, 16777219];
  const f = fixture({ person: ids, weight: [1, 2, 3] },
    { from: [ids[0], ids[0]], to: [ids[1], ids[2]], length: [4, 6] },
    { nodeKey: 'person', source: 'from', target: 'to' });
  const nodeScope = createDataScope(), cache = new Map(), frames = [];
  const config = { root: ids[0], directed: true, mode: 'tidy-approx', edgeLength: 'length',
    exit: { edgeLength: 0 }, animationDuration: 100, animationEasing: 'linear' };
  const run = async time => {
    const graph = createGraphData({ nodes: f.n, edges: f.e, nodeKey: 'person', source: 'from', target: 'to' });
    const input = graphScope(graph); graph.dispose();
    try { const frame = await treeLayout(input, config, { cache, nodeScope, time }); frames.push(frame); return frame; }
    finally { input.dispose(); }
  };
  try {
    await run(0);
    f.n.update({ person: ids.slice(0, 2), weight: [1, 2] });
    f.e.update({ from: [ids[0]], to: [ids[1]], length: [4] });
    await run(0);
    f.n.update({ person: f.n.get('person'), weight: [5, 6] });
    const half = await run(50), leaving = await graphStructure(half.edges);
    assert.deepEqual(leaving.ids, ids);
    assert.deepEqual([...leaving.from], [0, 0]); assert.deepEqual([...leaving.to], [1, 2]);
    assert.deepEqual(await values(half.nodes, 'y'), [0, -4, -3]);
    const final = await graphStructure((await run(100)).edges);
    assert.deepEqual(final.ids, ids.slice(0, 2));
    assert.deepEqual([...final.from], [0]); assert.deepEqual([...final.to], [1]);
  } finally { frames.forEach(frame => frame.dispose()); cache.forEach(entry => entry.dispose()); nodeScope.dispose(); f.dispose(); }
});

test('ordinary node filters induce edges, sorting resolves by ID, and sibling scopes stay unchanged', async () => {
  const f = fixture({ id: [1, 2, 3], x: [10, 20, 30], y: [0, 0, 0] }, { source: [1, 1, 2, 3], target: [2, 3, 3, 3] });
  const nodes = await graphTable(f.scope, 'nodes'), filtered = await runTransform('Filter', nodes, { where: greater(col.id, 1) });
  const sorted = await runTransform('Sort', filtered, { by: 'id', descending: true });
  const edges = await graphTable(sorted, 'edges');
  try {
    assert.deepEqual(await values(edges, 'source'), [2, 3]);
    assert.deepEqual(await values(edges, 'target'), [3, 3]);
    assert.deepEqual(await values(edges, 'start'), [[20, 0], [30, 0]]);
    assert.deepEqual(await values(f.scope, 'source'), [1, 1, 2, 3]);
    assert.deepEqual(await values(f.graph.nodes, 'id'), [1, 2, 3]);
    const unchanged = await graphStructure(f.scope); assert.equal(unchanged.ids.length, 3);
  } finally { edges.dispose(); sorted.dispose(); filtered.dispose(); nodes.dispose(); f.dispose(); }
});

test('a string Tree root names a node ID, not a column, beside where', async () => {
  const f = fixture({ id: ['r', 'a', 'b', 'c'], keep: [1, 1, 0, 1] }, { source: ['r', 'r', 'r'], target: ['a', 'b', 'c'] });
  const tree = await treeLayout(f.scope, { root: 'r', where: greater(col.keep, 0) });
  try { assert.deepEqual(await values(tree.nodes, 'id'), ['r', 'a', 'c']); }
  finally { tree.dispose(); f.dispose(); }
});

test('Edges keeps a layout\'s own endpoints instead of gathering node centers', async () => {
  // Child-to-parent rows: Tree still publishes each edge from parent to child.
  const f = fixture({ id: ['r', 'a', 'b'] }, { source: ['a', 'b'], target: ['r', 'r'] });
  const tree = await treeLayout(f.scope, { root: 'r', directed: false });
  const edges = await graphTable(tree.edges, 'edges');
  try {
    assert.deepEqual(await values(edges, 'start'), await values(tree.edges, 'start'));
    assert.deepEqual(await values(edges, 'end'), await values(tree.edges, 'end'));
    assert.deepEqual(await values(edges, 'start'), [[0, 0], [0, 0]]);
  } finally { edges.dispose(); tree.dispose(); f.dispose(); }
});

test('ordinary Calculate and Join retain graph structure and current endpoint geometry', async () => {
  const f = fixture({ id: [1, 2], x: [1, 2], y: [3, 4] }, { source: [1], target: [2] });
  const nodes = graphScope(f.graph, 'nodes');
  const shifted = await runTransform('Calculate', nodes, { columns: { x: add('x', 10) } });
  const edges = await graphTable(shifted, 'edges');
  const joinTable = createJoinTable();
  const joined = await runTransform('Join', shifted, { data: joinTable.table({ id: [2, 1], name: ['two', 'one'] }), on: 'id' });
  try {
    assert.deepEqual(await values(edges, 'start'), [[11, 3]]);
    assert.deepEqual(await values(edges, 'end'), [[12, 4]]);
    assert.deepEqual(await values(joined, 'name'), ['one', 'two']);
    assert.equal(requireGraph(joined).edges, f.graph.edges);
    assert.deepEqual(graphDependencies(shifted), graphDependencies(nodes));
  } finally { joined.dispose(); joinTable.dispose(); edges.dispose(); shifted.dispose(); nodes.dispose(); f.dispose(); }
});

test('lazy graph coordinates remain current through padded Filter, Sort and Calculate views', async () => {
  const f = fixture({ id: [1, 2, 3], x: [1, 2, 3], y: [0, 1, 2] }, { source: [1, 2], target: [2, 3] });
  const nodes = await graphTable(f.scope, 'nodes');
  const filtered = await runTransform('Filter', nodes, { where: greater(col.id, 1) });
  const sorted = await runTransform('Sort', filtered, { by: 'id', order: 'desc' });
  const shifted = await runTransform('Calculate', sorted, { columns: { x: add(col.x, 10) } });
  const current = await graphTable(shifted, 'nodes'), edges = await graphTable(shifted, 'edges');
  try {
    assert.deepEqual(await values(current, 'position'), [[13, 2], [12, 1]]);
    assert.deepEqual(await values(edges, 'start'), [[12, 1]]);
    assert.deepEqual(await values(edges, 'end'), [[13, 2]]);
  } finally { current.dispose(); edges.dispose(); shifted.dispose(); sorted.dispose(); filtered.dispose(); nodes.dispose(); f.dispose(); }
});

test('numerical Calculate publications preserve filtered/sorted membership while real row changes invalidate graph plans', async () => {
  const f = fixture({ id: [1, 2, 3], x: [1, 2, 3], y: [0, 0, 0] }, { source: [1, 2], target: [2, 3] });
  const nodes = graphScope(f.graph, 'nodes'), views = [];
  const run = async (kind, input, config) => { const view = await runTransform(kind, input, config); views.push(view); return view; };
  try {
    const filtered = await run('Filter', nodes, { where: greater(col.id, 1) });
    const sorted = await run('Sort', filtered, { by: 'id', order: 'desc' });
    const first = await run('Calculate', sorted, { columns: { x: add(col.x, 1) } });
    const plan = await graphStructure(first);
    const next = await run('Calculate', sorted, { columns: { x: add(col.x, 2) } });
    assert.equal(await graphStructure(next), plan);
    assert.equal(next.topology, sorted.topology);
    const changed = await run('Filter', nodes, { where: less(col.id, 3) });
    const other = await run('Calculate', changed, { columns: { x: add(col.x, 2) } });
    assert.equal(other.length, next.length);
    assert.notEqual(await graphStructure(other), plan, 'different same-length membership remains a structural change');
  } finally { views.forEach(view => view.dispose()); nodes.dispose(); f.dispose(); }
});

test('graph-destroying aggregates remain ordinary tables and fail only for graph consumers', async () => {
  const f = fixture({ id: [1, 2], group: ['g', 'g'] }, { source: [1], target: [2] });
  const nodes = graphScope(f.graph, 'nodes'), grouped = await runTransform('Group', nodes, { by: 'group' });
  assert.deepEqual(await values(grouped, 'count'), [2]);
  assert.throws(() => requireGraph(grouped, 'Tree'), /Tree: graph node key id is missing/);
  const calculated = await runTransform('Calculate', grouped, { columns: { twice: add('count', 'count') } });
  assert.deepEqual(await values(calculated, 'twice'), [4]);
  calculated.dispose(); grouped.dispose(); nodes.dispose(); f.dispose();
});

test('GraphData infers opposite-only nodes and preserves typed reducers and empty groups', async () => {
  const dates = typedColumn([new Date('2025-01-01'), new Date('2025-01-03')], { type: 'datetime', unit: 'ms' });
  const edges = table({ source: ['a', 'a'], target: ['b', 'c'], weight: [2, 4], label: ['first', 'last'], date: dates });
  const result = await runTransform('GraphData', edges, { reduce: { weight: { field: 'weight', op: 'sum' }, mean: { field: 'weight', op: 'mean' }, label: { field: 'label', op: 'last' }, lastDate: { field: 'date', op: 'max' }, rows: { op: 'count' } } });
  const nodes = await graphTable(result, 'nodes');
  try {
    assert.deepEqual(await values(nodes, 'id'), ['a', 'b', 'c']);
    assert.deepEqual(await values(nodes, 'weight'), [6, 0, 0]);
    assert.deepEqual(await values(nodes, 'mean'), [3, NaN, NaN]);
    assert.deepEqual(await values(nodes, 'rows'), [2, 0, 0]);
    assert.deepEqual(await values(nodes, 'label'), ['last', null, null]);
    assert.equal(nodes.metadata('lastDate').type, 'datetime');
    assert.deepEqual(await values(nodes, 'lastDate'), [Date.parse('2025-01-03') - edges.metadata('date').origin, NaN, NaN]);
  } finally { nodes.dispose(); result.dispose(); edges.dispose(); }
});

test('GraphData replaces existing columns by key and caches structural recipient plans across value changes', async () => {
  const f = fixture({ id: ['c', 'a', 'b', 'isolated'], weight: [9, 9, 9, 9], label: ['C', 'A', 'B', 'I'] }, { source: ['a', 'a'], target: ['b', 'c'], weight: [2, 4] });
  const cache = {}, config = { nodeFrom: 'target', reduce: { weight: { field: 'weight', op: 'sum' }, mean: { field: 'weight', op: 'mean' } } };
  const result = await runTransform('GraphData', f.scope, config, { cache }), nodes = await graphTable(result, 'nodes');
  try {
    assert.deepEqual(await values(nodes, 'id'), ['c', 'a', 'b', 'isolated']);
    assert.deepEqual(await values(nodes, 'weight'), [4, 0, 2, 0]);
    assert.deepEqual(await values(nodes, 'mean'), [4, NaN, 2, NaN]);
    assert.deepEqual(await values(nodes, 'label'), ['C', 'A', 'B', 'I']);
    assert.deepEqual(await values(f.graph.nodes, 'weight'), [9, 9, 9, 9]);
    const structural = cache.hostValues.get('fromEdges:recipients').value;
    const changed = await runTransform('Calculate', f.scope, { columns: { weight: add('weight', 1) } });
    const next = await runTransform('GraphData', changed, config, { cache }), nextNodes = await graphTable(next, 'nodes');
    assert.equal(cache.hostValues.get('fromEdges:recipients').value, structural);
    assert.deepEqual(await values(nextNodes, 'weight'), [5, 0, 3, 0]);
    nextNodes.dispose(); next.dispose(); changed.dispose();
    await assert.rejects(runTransform('GraphData', f.scope, { reduce: { id: { field: 'weight', op: 'sum' } } }), /do not overwrite node identity/);
    await assert.rejects(runTransform('GraphData', f.scope, { reduce: { x: { field: 'source', op: 'mean' } } }, { cache }), /requires numeric/);
    const recipientCodes = cache.kept.get('fromEdges:codes').value;
    assert.equal(recipientCodes.refCount, 1, 'a failed reducer releases its temporary recipient codes');
  } finally { nodes.dispose(); result.dispose(); disposeTransformCache(cache); f.dispose(); }
});

test('an inferred GraphData reuses inferred node identity while values change and outputs outlive its cache', async () => {
  const input = table({ source: ['a', 'a'], target: ['b', 'c'], weight: [2, 4] });
  const cache = {}, config = { reduce: { total: { field: 'weight', op: 'sum' } } };
  const first = await runTransform('GraphData', input, config, { cache });
  const structure = await graphStructure(first);
  const changed = await runTransform('Calculate', input, { columns: { weight: add('weight', 1) } });
  const next = await runTransform('GraphData', changed, config, { cache });
  assert.deepEqual(graphDependencies(next), graphDependencies(first));
  assert.equal(await graphStructure(next), structure);
  // The node table registered its own release (cacheEntries.js): disposal frees it once.
  const cached = cache.fromEdgesNodes.table, release = cached.dispose.bind(cached);
  let released = 0;
  cached.dispose = () => { released++; release(); };
  disposeTransformCache(cache);
  assert.equal(released, 1); assert.equal(cache.fromEdgesNodes, null);
  const nodes = await graphTable(next, 'nodes');
  assert.deepEqual(await values(nodes, 'total'), [8, 0, 0]);
  nodes.dispose(); next.dispose(); changed.dispose(); first.dispose(); input.dispose();
});

test('GraphData ignores hidden rows and empty input replaces requested columns for every existing node', async () => {
  const input = table({ source: ['a', 'hidden', 'c'], target: ['b', null, 'b'], value: [2, 999, 4] });
  const filtered = await runTransform('Filter', input, { where: { field: 'value', op: 'lt', value: 10 } });
  const result = await runTransform('GraphData', filtered, { nodeFrom: 'target', reduce: { total: { field: 'value', op: 'sum' } } });
  const nodes = await graphTable(result, 'nodes');
  assert.deepEqual(await values(nodes, 'id'), ['a', 'b', 'c']);
  assert.deepEqual(await values(nodes, 'total'), [0, 6, 0]);
  nodes.dispose(); result.dispose(); filtered.dispose(); input.dispose();
  const f = fixture({ id: ['a', 'b'], total: [9, 9] }, { source: typedColumn([], { type: 'categorical', domain: ['a', 'b'] }), target: typedColumn([], { type: 'categorical', domain: ['a', 'b'] }), value: typedColumn([], { type: 'numeric' }) });
  const empty = await runTransform('GraphData', f.scope, { reduce: { total: { field: 'value', op: 'sum' }, rows: { op: 'count' }, average: { field: 'value', op: 'mean' }, first: { field: 'value', op: 'first' } } });
  const emptyNodes = await graphTable(empty, 'nodes');
  assert.deepEqual(await values(emptyNodes, 'total'), [0, 0]);
  assert.deepEqual(await values(emptyNodes, 'rows'), [0, 0]);
  assert.deepEqual(await values(emptyNodes, 'average'), [NaN, NaN]);
  assert.deepEqual(await values(emptyNodes, 'first'), [NaN, NaN]);
  emptyNodes.dispose(); empty.dispose(); f.dispose();
});

test('GraphData reuses structure across owning-table value updates and keeps numerical endpoints current', async () => {
  const f = fixture({ id: [1, 2], x: [0, 1], y: [2, 3] }, { source: [1], target: [2] });
  const initial = await graphStructure(f.scope);
  f.n.update({ id: f.n.get('id'), x: [10, 11], y: f.n.get('y') });
  const nextGraph = createGraphData({ nodes: f.n, edges: f.e }), next = graphScope(nextGraph);
  const current = await graphStructure(next);
  assert.equal(current, initial, 'numerical replacement preserves the cached endpoint plan');
  const edges = await graphTable(next, 'edges');
  assert.deepEqual(await values(edges, 'start'), [[10, 2]]);
  assert.deepEqual(await values(edges, 'end'), [[11, 3]]);
  edges.dispose(); next.dispose(); nextGraph.dispose(); f.dispose();
});

test('Python int64 node IDs resolve numeric Tree roots and canonical aliases without losing precision', async () => {
  const uploaded = values => columnValue({ dtype: 'int64', shape: [values.length], logical_type: 'numeric' }, BigInt64Array.from(values.map(BigInt)).buffer);
  const id = uploaded([0, 1, 2]), alias = uploaded([0, 1, 2]), source = uploaded([0, 0]), target = uploaded([1, 2]);
  const f = fixture({ person: id, id: alias, weight: [1, 2, 3] }, { source, target }, { nodeKey: 'person' });
  const cache = new Map();
  let result;
  try {
    assert.deepEqual((await graphStructure(f.scope)).ids, [0, 1, 2]);
    result = await treeLayout(f.scope, { root: 0, mode: 'partition', directed: true, nodeWidth: 'weight' }, { cache });
    assert.deepEqual(await values(result.nodes, 'depth'), [0, 1, 1]);
    assert.ok((await values(result.nodes, 'position')).flat().every(Number.isFinite));
  } finally {
    result?.dispose(); cache.forEach(entry => entry.dispose()); f.dispose();
    for (const column of [id, alias, source, target]) column.values.dispose();
  }
  assert.equal(f.graph.plans.length, 0, 'the last graph owner releases cached borrowed ID dependencies');
});
