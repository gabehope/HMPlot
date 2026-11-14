# Quantiles and group summaries

Grouped quantile curves and each row's group mean and 90th percentile, all Calculate expressions.

## Python

```python
import hmplot as hm
import numpy as np

table = hm.Table({"group": ["A", "B"] * 100, "value": np.sin(np.arange(200) * 1.31)})
# Each group's quantile curve: its rows in value order, each at its share of the group.
probability = hm.cumsum(hm.is_finite("value"), by="group", order_by="value") / hm.count("value", by="group")
with hm.Data(table) as data:
    with hm.Sort(by="value"), hm.Calculate(probability=probability, p90=hm.quantile("value", 0.9, by="group")):
        with hm.Plot(axes2d=True) as plot:
            hm.Line(x="probability", y="value", series="group", color="group", width=2)
            hm.charts.RuleY(y="p90", color="group")
plot
```

## Svelte

```svelte
<Sort by="value"><Calculate columns={{ probability: divide(cumsum(is_finite("value"), { by: "group", orderBy: "value" }), count("value", { by: "group" })) }}><Line x="probability" y="value" series="group" color="group" /></Calculate></Sort>
```
