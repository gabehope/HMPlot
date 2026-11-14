# Pivot and fold

Reshape long and wide tables while retaining source identities.

## Python

```python
import hmplot as hm

wide = hm.Table({"subject": ["A", "B", "C"], "before": [3, 5, 4], "after": [5, 6, 7]})
stages = hm.categorical(domain=["before", "after"])
with hm.Data(wide) as data:
    with hm.Fold(fields=["before", "after"]):
        with hm.Plot(x={"scale": stages}, axes2d=True) as plot:
            hm.Points(x="key", y="value", fill="key", size=9)
plot
```

## Svelte

```svelte
<Fold fields={['before','after']}><Points x="key" y="value" /></Fold>
```
