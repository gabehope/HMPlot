# Point labels

Named observations with GPU-rendered labels that follow pan and zoom.

## Python

```python
import hmplot as hm
observations = {'x': [1, 2, 4], 'y': [1, 3, 2], 'name': ['Alder', 'Birch', 'Cedar']}
with hm.Plot(data=observations, axes2d=True, x={'domain': [0, 6]}, y={'domain': [0, 4]}) as chart:
    with hm.Mapping(x='x', y='y', opacity=0.9):
        hm.Points(size=8, fill='#547ba2')
        hm.Text(text='name', size=14, dx=8, align='left')
chart
```

## Svelte

```svelte
<Plot data={observations}>
  <Points x="x" y="y" />
  <Text x="x" y="y" text="name" dx={8} align="left" />
</Plot>
```
