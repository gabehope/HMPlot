import hmplot as hm

edges = {'source': ['Root', 'Root', 'A', 'A', 'B', 'B'],
         'target': ['A', 'B', 'A1', 'A2', 'B1', 'B2']}
nodes = {'id': ['Root', 'A', 'B', 'A1', 'A2', 'B1', 'B2'],
         'weight': [1, 1, 1, 3, 2, 2, 1],
         'label': ['', '', '', 'A1', 'A2', 'B1', 'B2']}
with hm.Data(edges) as chart:
    with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
        with hm.Pack(root='Root', value='weight', padding=0.015):
            with hm.Plot(width=450, height=450, x={'domain': [0, 1]}, y={'domain': [0, 1]}):
                with hm.Nodes():
                    hm.Points(x='x', y='y', size=hm.col.r * 2,
                                     size_units='data', fill='depth')
                    hm.Text(x='x', y='y', text='label', size=11)
chart
