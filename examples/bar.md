# Bar chart

Categorical bars composed from derived geometry and instanced prisms.

## Python

```python
import hmplot as hm

table = hm.Table({"group": ["A", "B", "C", "D"], "total": [5, 8, 4, 7]})
with hm.Plot(x={"scale": hm.categorical(domain=["A", "B", "C", "D"])}, data=table, axes2d=True) as plot:
    hm.charts.Bar(x="group", y="total", fill="group")
plot
```

## Svelte

```svelte
<Bar x="group" y="total" />
```
