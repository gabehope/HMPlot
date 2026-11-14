# Layered forces

d3's forces by name, their strengths and targets from node columns.

## Python

```python
import numpy as np
import hmplot as hm
teams = ['North', 'East', 'South', 'West']
people = {'id': list(range(36)), 'team': [teams[i % 4] for i in range(36)], 'teamX': [(i % 4) * 120 - 180 for i in range(36)],
          'size': [4 + (i * 5) % 8 for i in range(36)], 'hubPull': np.where(np.arange(36) < 3, 0.3, np.nan)}
edges = {'source': [i for i in range(36) for _ in range(2)], 'target': [t for i in range(36) for t in ((i + 4) % 36, (i + 8) % 36)]}
forces = {'x': None, 'y': None,
          'byTeam': {'type': 'x', 'x': 'teamX', 'strength': hm.input.team_pull},
          'level': {'type': 'y', 'y': 0, 'strength': 0.05},
          'spacing': {'type': 'collide', 'radius': hm.col('size') * 1.5},
          'hubs': {'type': 'radial', 'radius': 220, 'strength': 'hubPull'}}
with hm.Scene() as scene:
    with hm.Controls():
        hm.Checkbox(name='run', label='Run')
        hm.Button(name='reheat', label='Reheat')
        hm.Slider(name='team_pull', min=0, max=0.5, step=0.01, value=0.15, label='Team pull')
    with hm.Data(edges):
        with hm.GraphData(nodes=people, edges=edges, node_key='id', source='source', target='target'):
            with hm.Force(warmup=60, forces=forces, running=hm.input.run, reheat=hm.input.reheat):
                with hm.Plot(axes2d=True):
                    with hm.Edges():
                        hm.Segments(start='start', end='end', width=0.5)
                    with hm.Nodes(drag=True):
                        hm.Points(position='position', fill='team', size='size')
scene
```

## Svelte

```svelte
<Force forces={{ byTeam: { type: "x", x: "teamX" }, spacing: { type: "collide", radius: "size" } }}>…</Force>
```
