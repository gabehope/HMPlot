# Box plot

Quartiles, Tukey whiskers, medians, and source-linked outliers.

## Python

```python
import hmplot as hm
import numpy as np

groups = ["Control", "A", "B"]
table = hm.Table({"group": [groups[i % 3] for i in range(180)], "value": np.sin(np.arange(180) * 1.9) + np.arange(180) % 3})
with hm.Plot(x={"scale": hm.categorical(domain=groups)}, data=table, axes2d=True) as plot:
    hm.charts.BoxPlot(x="group", y="value", fill="group")
plot
```

## Svelte

```svelte
<BoxPlot x="group" y="value" />
```
