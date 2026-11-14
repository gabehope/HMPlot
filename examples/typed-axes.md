# Categorical and datetime frames

Composable data scopes, coordinate frames, and shared navigation.

## Python

```python
import hmplot as hm
with hm.Scene() as scene:
    with hm.Row(wrap=True):
        with hm.Plot(data={'x':[0,1,2], 'group':['Control','Treatment','Control']}):
            with hm.Frame(x={'label':'Observation'}, y={'scale':hm.categorical(domain=['Control','Treatment'])}):
                hm.Points(x='x', y='group', fill='group')
        with hm.Plot(data={'x':[0,1,2], 'y':[2,0,1], 'z':[1,2,0]}, type='3d'):
            with hm.Frame(x={'domain':[0,2]}, y={'domain':[0,2]}, z={'domain':[0,2]}):
                hm.Points(x='x', y='y', z='z', size=10)
scene
```

## Svelte

```svelte
<Plot>…</Plot>
```
