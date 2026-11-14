# Swarm plot

Deterministic glyph-aware dodge with stable observation identities.

## Python

```python
import hmplot as hm
import numpy as np

groups = ["North", "South", "West"]
table = hm.Table({"group": [groups[i % 3] for i in range(300)], "value": np.sin(np.arange(300) * 2.3)})
with hm.Plot(y={"scale": hm.categorical(domain=groups)}, data=table, axes2d=True) as plot:
    hm.charts.Swarm(x="value", y="group", size=7, fill="group")
plot
```

## Svelte

```svelte
<Swarm x="value" y="group" />
```
