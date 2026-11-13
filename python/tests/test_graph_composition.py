"""Construction, resource updates and snapshot parity for graph table components."""
import json

import numpy as np
import pytest

import hmplot as hm
from hmplot.core import REGISTRY


def find(node, kind):
    matches = [node] if node['kind'] == kind else []
    for child in node.get('children', []):
        matches.extend(find(child, kind))
    return matches


def test_graph_containers_and_marks_are_registered():
    components = REGISTRY['components']
    for kind in ('GraphData', 'DAG', 'Pack', 'Treemap', 'Sankey'):
        assert components[kind]['container'] is True
    for kind in ('Flow', 'Routes'):
        assert components[kind]['container'] is False


def test_graph_snapshot_keeps_node_table_and_expression():
    edges = {'source': ['a'], 'target': ['b']}
    nodes = {'id': ['a', 'b', 'solo'], 'lane': [1, 2, 3], 'height': [3, 4, 5]}
    with hm.Scene() as scene:
        with hm.Data(edges):
            with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
                with hm.Nodes():
                    with hm.Calculate(x=hm.multiply('lane', 2), y='height'):
                        with hm.Plot():
                            with hm.Edges():
                                hm.Segments(start='start', end='end')
                            with hm.Nodes():
                                hm.Points(position='position')
    state, _ = scene._snapshot()
    graph = find(state['root'], 'GraphData')[0]
    assert graph['props']['nodes']['$table'] in state['tables']
    assert graph['props']['nodeKey'] == 'id'
    assert '$expression' in json.dumps(find(graph, 'Calculate')[0]['props']['columns']['x'])
    assert len(find(graph, 'Nodes')) == 2


def test_graph_custom_id_mapping_survives_table_replacement_and_live_updates():
    edges = hm.Table({'from': ['a'], 'to': ['b'], 'weight': [2]})
    with hm.Scene() as scene:
        with hm.GraphData(nodes={'person': ['a', 'b'], 'value': [1, 2]}, edges=edges,
                          node_key=hm.col.person, source='from', target='to') as graph:
            with hm.Nodes():
                with hm.Plot():
                    hm.Points(x='value', y=0)
    graph.update(nodes={'person': ['a', 'b'], 'value': [3, 4]})
    nodes = graph.props['nodes']
    assert nodes.key == 'person'
    state, _ = scene._snapshot()
    props = find(state['root'], 'GraphData')[0]['props']
    assert (props['nodeKey'], props['source'], props['target']) == ('person', 'from', 'to')
    node_table = state['tables'][props['nodes']['$table']]
    edge_table = state['tables'][props['edges']['$table']]
    assert node_table['key'] == 'person'
    old_value, old_source = node_table['columns']['value'], edge_table['columns']['from']
    nodes.update_columns(value=[5, 6])
    edges.update_columns(weight=[7])
    updated, _ = scene._snapshot()
    assert updated['tables'][nodes.id]['version'] == node_table['version'] + 1
    assert updated['tables'][nodes.id]['columns']['value'] != old_value
    assert updated['tables'][edges.id]['columns']['from'] == old_source
    assert updated['tables'][edges.id]['version'] == edge_table['version'] + 1


def test_graph_data_reports_missing_or_conflicting_identity_and_retired_layout_props():
    edges = {'source': ['a'], 'target': ['b']}
    with pytest.raises(TypeError, match='GraphData: pass edges= with nodes='):
        hm.GraphData(nodes={'id': ['a', 'b']})
    with pytest.raises(ValueError, match='GraphData.*missing endpoint column'):
        hm.GraphData(edges={'from': ['a'], 'to': ['b']})
    with pytest.raises(ValueError, match="inferred nodes' IDs are id"):
        hm.GraphData(edges={'source': ['a'], 'target': ['b']}, node_key='person')
    with pytest.raises(AttributeError, match='hm.FromEdges was removed.*GraphData'):
        hm.FromEdges
    with pytest.raises(ValueError, match='GraphData.*missing endpoint column'):
        hm.GraphData(nodes={'id': ['a', 'b']}, edges={'from': ['a'], 'to': ['b']})
    with pytest.raises(ValueError, match='GraphData.*node IDs must be unique'):
        hm.GraphData(nodes=hm.Table({'id': ['a', 'a']}), edges=edges)
    with pytest.raises(ValueError, match='GraphData.*supplied id conflicts'):
        hm.GraphData(nodes={'person': ['a', 'b'], 'id': ['b', 'a']}, edges=edges, node_key='person')
    with pytest.raises(TypeError, match='GraphData'):
        hm.Tree(source='source')
    table = hm.Table({'id': ['a', 'b']})
    with hm.Scene() as scene:
        hm.GraphData(nodes=table, edges=edges)
    with pytest.raises(ValueError, match='GraphData.*node IDs must be unique'):
        table.replace({'id': ['a', 'a']})
    # Scene transactions restore the last valid table after a failed resource update.
    assert table.version == 1
    scene._snapshot()


def test_inferred_graph_keeps_explicit_reducers_and_endpoint_choice_in_the_snapshot():
    with hm.Scene() as scene:
        with hm.Data({'origin': ['a', 'a'], 'destination': ['b', 'c'], 'weight': [2, 3]}):
            with hm.GraphData(source='origin', target='destination', node_from='target',
                              reduce={'load': {'field': 'weight', 'op': 'sum'}, 'links': {'op': 'count'}}):
                with hm.Nodes():
                    with hm.Plot():
                        hm.Points(x='load', y='links')
    state, _ = scene._snapshot()
    props = find(state['root'], 'GraphData')[0]['props']
    assert props['nodeFrom'] == 'target'
    assert props['reduce'] == {'load': {'field': 'weight', 'op': 'sum'}, 'links': {'op': 'count'}}


@pytest.mark.asyncio
async def test_graph_relation_resources_round_trip_without_rekeying_shared_tables():
    nodes = hm.Table({'person': ['a', 'b'], 'observation': [12, 18], 'x': [0, 1], 'y': [0, 1]}, key='observation')
    edges = hm.Table({'source': ['a'], 'target': ['b']})
    with hm.Scene() as scene:
        with hm.GraphData(nodes=nodes, edges=edges, node_key='person', reduce={'degree': {'op': 'count'}}) as graph:
            with hm.Nodes() as node_scope:
                with hm.Plot():
                    points = hm.Points(x='x', y='y', select=True)
                    with hm.Edges():
                        links = hm.Segments(start='start', end='end', select=True)
    assert graph.selection is edges.selection
    assert node_scope.selection is points.selection is nodes.selection
    assert links.selection is edges.selection
    assert points.brush is nodes.brush and points.hover is nodes.hover
    assert points.nearby is nodes.nearby and points.nearest is nodes.nearest
    assert nodes.key == 'observation'
    state, _ = scene._snapshot()
    assert state['tables'][nodes.id]['key'] == 'observation'
    scene._views['test'] = {'ready': True}
    sent = []
    class Transport:
        def send(self, message):
            sent.append(message)
            owner = message['args']['owner']
            scene._receive({'type': 'result', 'scene': scene.id, 'request': message['request'],
                            'value': {'active': True, 'owners': {owner: message['args']['rows']}}}, [])
    scene._widget = Transport()
    await points.selection.replace([1], view='test')
    await links.selection.replace([0], view='test')
    assert [message['target'] for message in sent] == [nodes.selection.id, edges.selection.id]
    assert [message['args']['owner'] for message in sent] == [nodes.id, edges.id]
    updated, _ = scene._snapshot()
    assert updated['selections'][nodes.selection.id]['owners'] == {nodes.id: [1]}
    assert updated['selections'][edges.selection.id]['owners'] == {edges.id: [0]}


def test_inferred_node_resources_do_not_alias_source_edge_resources():
    table = hm.Table({'source': ['a'], 'target': ['b']})
    with hm.Scene():
        with hm.Data(table):
            with hm.GraphData():
                with hm.Nodes():
                    with hm.Plot():
                        points = hm.Points(x=0, y=0, select=True)
                with hm.Edges():
                    with hm.Plot():
                        links = hm.Segments(start=0, end=0, select=True)
    with pytest.raises(RuntimeError, match='GraphData'):
        points.selection
    # The edges it reads are the surrounding data's.
    assert links.selection is table.selection
    edges = hm.Table({'source': ['a'], 'target': ['b']})
    with hm.Scene():
        with hm.GraphData(edges=edges):
            with hm.Nodes():
                with hm.Plot():
                    inferred = hm.Points(x=0, y=0, select=True)
            with hm.Plot():
                default = hm.Points(x=0, y=0, select=True)
    with pytest.raises(RuntimeError, match='GraphData'):
        inferred.selection
    assert default.selection is edges.selection
    # A GraphData inside another graph's Edges infers its own nodes, not the outer graph's.
    outer = hm.Table({'id': ['a', 'b']})
    with hm.Scene():
        with hm.GraphData(nodes=outer, edges=edges):
            with hm.Edges():
                with hm.GraphData():
                    with hm.Nodes():
                        with hm.Plot():
                            nested = hm.Points(x=0, y=0, select=True)
    with pytest.raises(RuntimeError, match='GraphData'):
        nested.selection


def test_dag_tree_and_sankey_python_keywords_round_trip():
    edges = {'source': ['root'], 'target': ['leaf'], 'value': [2]}
    nodes = {'id': ['root', 'leaf'], 'weight': [2, 2]}
    with hm.Scene() as scene:
        with hm.Data(edges):
            with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
                with hm.Tree(root='root', mode='partition', layer_height=1.2, node_width='weight', child_align='right', width_mode='fixed', visual_margin=0.08):
                    with hm.Plot():
                        with hm.Nodes():
                            hm.Rect(x0='x0', x1='x1', y0='y0', y1='y1')
            with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
                with hm.DAG(node_width=1.5, node_height=0.6):
                    with hm.Plot():
                        with hm.Edges():
                            hm.Routes(width=2)
            with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
                with hm.Sankey(value='value'):
                    with hm.Plot():
                        with hm.Edges():
                            hm.Flow(start_lower='startLower', end_lower='endLower',
                                    start_upper='startUpper', end_upper='endUpper')
    state, _ = scene._snapshot()
    assert find(state['root'], 'Tree')[0]['props']['childAlign'] == 'right'
    assert find(state['root'], 'Tree')[0]['props']['visualMargin'] == 0.08
    assert find(state['root'], 'DAG')[0]['props']['nodeHeight'] == 0.6
    assert find(state['root'], 'GraphData')[0]['props']['nodeKey'] == 'id'
    assert 'nodeKey' not in find(state['root'], 'Sankey')[0]['props']


def test_pack_and_treemap_python_keywords_round_trip():
    edges = {'source': ['root'], 'target': ['leaf'], 'tag': [5]}
    nodes = {'id': ['root', 'leaf'], 'weight': [1, 3]}
    with hm.Scene() as scene:
        with hm.Data(edges):
            with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
                with hm.Pack(root='root', value='weight', padding=0.02):
                    with hm.Plot():
                        with hm.Nodes():
                            hm.Points(x='x', y='y', size=hm.col.r * 2,
                                             size_units='data')
            with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
                with hm.Treemap(root='root', value='weight', tile='binary', padding_inner=0.01, padding_outer=0.02):
                    with hm.Plot():
                        with hm.Nodes():
                            hm.Rect(x0='x0', x1='x1', y0='y0', y1='y1')
    state, _ = scene._snapshot()
    assert find(state['root'], 'Pack')[0]['props']['padding'] == 0.02
    treemap = find(state['root'], 'Treemap')[0]
    assert treemap['props']['paddingInner'] == 0.01
    assert treemap['props']['tile'] == 'binary'


def _leaf_order(tables):
    """Leaves in the order Tree mode="cluster" places them: depth-first from the root, each
    node's children in edge order (utils/treeHost.js; tests/unit/graph-composition.test.js
    checks the layout's `order` column against scipy's leaves)."""
    children = {}
    for source, target in zip(tables['edges']['source'], tables['edges']['target']):
        children.setdefault(source, []).append(target)
    order, stack = [], [tables['root']]
    while stack:
        node = stack.pop()
        if node in children:
            stack.extend(reversed(children[node]))
        else:
            order.append(node)
    return order


def test_linkage_table_turns_a_scipy_linkage_into_tree_tables():
    hierarchy = pytest.importorskip('scipy.cluster.hierarchy')
    X = np.array([[0, 0], [0.4, 0.1], [5, 5], [5.3, 4.8], [0.2, 3], [9, 1], [9.5, 1.4], [5.1, 5.6]])
    Z = hierarchy.linkage(X, 'average')
    labels = np.array(list('abcdefgh'))
    tables = hm.linkage_table(Z, labels)
    n = len(X)
    assert tables['root'] == 2 * n - 2
    assert tables['edges']['source'] == [n + i for i in range(n - 1) for _ in (0, 1)]
    assert tables['edges']['target'] == [int(c) for c in Z[:, :2].ravel()]
    nodes = tables['nodes']
    assert nodes['id'] == list(range(2 * n - 1))
    assert nodes['label'] == list('abcdefgh') + [None] * (n - 1)
    assert all(type(label) is str for label in nodes['label'][:n])
    assert nodes['height'] == [0.0] * n + Z[:, 2].tolist()
    assert nodes['count'] == [1] * n + Z[:, 3].astype(int).tolist()
    assert _leaf_order(tables) == hierarchy.dendrogram(Z, no_plot=True)['leaves']
    assert _leaf_order(tables) == hierarchy.leaves_list(Z).tolist()
    # Complete and single linkage of a larger matrix give the same agreement.
    Y = np.random.default_rng(3).normal(size=(30, 4))
    for method in ('complete', 'single', 'ward'):
        W = hierarchy.linkage(Y, method)
        assert _leaf_order(hm.linkage_table(W)) == hierarchy.leaves_list(W).tolist()
    assert hm.linkage_table(W)['nodes']['label'][:3] == ['0', '1', '2']
    with hm.Scene() as scene:
        with hm.Data(tables['edges']):
            with hm.GraphData(nodes=tables['nodes'], edges=tables['edges'], node_key='id', source='source', target='target'):
                with hm.Tree(root=tables['root'], mode='cluster', height='height', orientation='right'):
                    with hm.Plot():
                        with hm.Edges():
                            hm.Segments(start='start', end='end', curve='step-before')
    state, _ = scene._snapshot()
    tree = find(state['root'], 'Tree')[0]['props']
    assert (tree['mode'], tree['height'], tree['root']) == ('cluster', 'height', 14)
    graph = find(state['root'], 'GraphData')[0]
    assert graph['props']['nodes']['$table'] in state['tables']


def test_linkage_table_rejects_malformed_linkages():
    good = [[0, 1, 0.5, 2], [2, 3, 1.0, 3]]
    assert hm.linkage_table([], ['only'])['nodes'] == {'id': [0], 'label': ['only'], 'height': [0.0], 'count': [1]}
    with pytest.raises(ValueError, match=r'^linkage_table: Z must be a linkage matrix of shape \(n - 1, 4\), as scipy\.cluster\.hierarchy\.linkage returns; got shape \(2, 3\)\.$'):
        hm.linkage_table([row[:3] for row in good])
    with pytest.raises(TypeError, match='numeric linkage matrix'):
        hm.linkage_table([['a', 'b', 'c', 'd']])
    with pytest.raises(ValueError, match=r'^linkage_table: labels has 2 entries, but Z joins 3 leaves\.$'):
        hm.linkage_table(good, ['a', 'b'])
    with pytest.raises(ValueError, match=r'^linkage_table: Z row 1 merges node 4, which does not exist yet \(row 1 can merge nodes 0 to 3\)\.$'):
        hm.linkage_table([[0, 1, 0.5, 2], [2, 4, 1.0, 3]])
    with pytest.raises(ValueError, match=r'^linkage_table: node 1 is merged twice, in Z rows 0 and 1\.$'):
        hm.linkage_table([[0, 1, 0.5, 2], [1, 2, 1.0, 3]])
    with pytest.raises(ValueError, match=r'^linkage_table: Z row 1 has distance nan; distances must be finite and nonnegative\.$'):
        hm.linkage_table([[0, 1, 0.5, 2], [2, 3, float('nan'), 3]])
    with pytest.raises(ValueError, match='merges node 0.5'):
        hm.linkage_table([[0.5, 1, 0.5, 2], [2, 3, 1.0, 3]])
