# Data selections and brushing

Click or brush observations and filter another plot through data-owned virtual fields.

## Python

```python
import math
import hmplot as hm

observations = hm.Table({
    'id': [f'sample-{i}' for i in range(30)],
    'x': [i / 29 for i in range(30)],
    'y': [0.5 + 0.32 * math.sin(i * 0.75) + 0.12 * math.cos(i * 1.7) for i in range(30)],
}, key='id')

with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=320):
        with hm.Plot(data=observations, height=350, axes2d=True) as source:
            hm.Points(x='x', y='y', size=12, fill='#547ba2',
                             select=True, hover=True, brush=True, respond=True)
        with hm.Plot(data=observations, height=350, axes2d=True):
            with hm.Filter(where='@selected', inactive='all'):
                hm.Points(x='x', y='y', size=15, fill='#cf8955')
scene
```

## Svelte

```svelte
<Data value={observations} key="id">
  <Plot>
    <Points x="x" y="y" select hover brush respond={true} />
  </Plot>
  <Plot>
    <Filter where="@selected" inactive="all">
      <Points x="x" y="y" fill="coral" />
    </Filter>
  </Plot>
</Data>
```
