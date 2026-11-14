# Treemap

D3 treemap bounds from a weighted hierarchy.

## Python

```python
import hmplot as hm

edges = {'source': ['Root', 'Root', 'A', 'A', 'B', 'B'],
         'target': ['A', 'B', 'A1', 'A2', 'B1', 'B2']}
nodes = {'id': ['Root', 'A', 'B', 'A1', 'A2', 'B1', 'B2'],
         'weight': [1, 1, 1, 3, 2, 2, 1],
         'label': ['', '', '', 'A1', 'A2', 'B1', 'B2']}
with hm.Data(edges) as chart:
    with hm.GraphData(nodes=nodes, edges=edges, node_key='id', source='source', target='target'):
        with hm.Treemap(root='Root', value='weight', padding_inner=0.01, padding_outer=0.025):
            with hm.Plot(height=420, x={'domain': [0, 1]}, y={'domain': [0, 1]}):
                with hm.Nodes():
                    hm.Rect(x0='x0', x1='x1', y0='y0', y1='y1', fill='depth')
                    hm.Text(x='x', y='y', text='label', size=11)
chart
```

## Svelte

```svelte
<GraphData><Treemap root="Root" value="weight"><Nodes><Rect x0="x0" x1="x1" y0="y0" y1="y1" /></Nodes></Treemap></GraphData>
```
