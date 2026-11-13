"""Regenerate the Python int64 graph-root and table-resource browser fixture."""
import base64
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'python'))
import hmplot as hm

nodes = hm.Table({'person': [0, 1, 2], 'observation': [12, 18, 27], 'weight': [1, 2, 3]}, key='observation')
edges = hm.Table({'source': [0, 0], 'target': [1, 2]})
with hm.Scene() as scene:
    with hm.GraphData(nodes=nodes, edges=edges, node_key='person'):
        with hm.Tree(root=0, mode='partition', directed=True, node_width='weight'):
            with hm.Plot(name='int64 partition', width=420, height=300, axes2d=False):
                with hm.Nodes():
                    hm.Rect(x0='x0', x1='x1', y0='y0', y1='y1', fill='#8e3db3', select=True)
state, columns = scene._snapshot()
payload = {
    'state': state,
    'metadata': {key: column.descriptor() for key, column in columns.items()},
    'buffers': {key: base64.b64encode(column.payload).decode() for key, column in columns.items()},
}
path = root / 'static/test/notebook-graph-int64.json'
path.write_text(json.dumps(payload))
print(path)
